/**
 * Fee Change Approval Engine — state machine.
 *
 * Statuses: draft → pending → (collaboration) → cooldown → notice_sent → effective
 * with terminal declined / expired_declined / cancelled / revoked.
 *
 * Rules (see Platform Fee Policy / Legal Updates Policy):
 *  - Only Super Admins propose/approve (enforced at the route layer).
 *  - 72h response window; auto-decline if no action.
 *  - Proposer + ≥1 other Super Admin approval (no collaboration), OR
 *    proposer + ≥1 other + all joined collaborators (collaboration).
 *  - 48h cooldown after approval; any modification/revocation resets it.
 *  - 14 calendar-day affected-party notice; effective at 11:59 PM on the date.
 *
 * Sweepr is the authoritative system; every transition is recorded.
 */
import type { Sql } from "./db";

export const RESPONSE_WINDOW_HOURS = 72;
export const COOLDOWN_HOURS = 48;
export const NOTICE_DAYS = 14;
export const MIN_EFFECTIVE_LEAD_HOURS = 48;

export class ApprovalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Actor {
  clerkId: string;
  email?: string;
}

type Row = Record<string, unknown>;

export async function getProposal(sql: Sql, id: string): Promise<Row | null> {
  const rows = (await sql`SELECT * FROM fee_change_proposals WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ?? null;
}

export async function listSuperAdmins(
  sql: Sql,
): Promise<Array<{ clerk_id: string; email: string; user_id: string }>> {
  return (await sql`
    SELECT id AS user_id, clerk_id, email FROM users
    WHERE role = 'super_admin' OR admin_role = 'super_admin'
  `) as Array<{ clerk_id: string; email: string; user_id: string }>;
}

async function record(
  sql: Sql,
  proposalId: string,
  actor: Actor,
  action: string,
  comment?: string | null,
  modJson?: unknown,
): Promise<void> {
  await sql`
    INSERT INTO fee_change_proposal_actions
      (proposal_id, actor_clerk_id, actor_email, action, comment, proposed_modification_json)
    VALUES (${proposalId}, ${actor.clerkId}, ${actor.email ?? null}, ${action},
            ${comment ?? null}, ${modJson ? JSON.stringify(modJson) : null})
  `;
}

async function touch(sql: Sql, proposalId: string): Promise<void> {
  await sql`UPDATE fee_change_proposals SET updated_at = NOW() WHERE id = ${proposalId}`;
}

// ── Create ───────────────────────────────────────────────────────────────────
export interface CreateInput {
  feeConfig: {
    name: string;
    fee_type: string;
    affected_party: string;
    calculation_method: string;
    flat_amount_cents?: number | null;
    percentage_bps?: number | null;
    formula_json?: unknown;
    city?: string | null;
    state?: string | null;
    service_type?: string | null;
  };
  title: string;
  reason: string;
  internalNotes?: string;
  externalNoticeSummary?: string;
  proposedEffectiveAt: string; // ISO
}

export async function createProposal(sql: Sql, actor: Actor, input: CreateInput): Promise<Row> {
  const fc = input.feeConfig;
  const effective = new Date(input.proposedEffectiveAt);
  if (Number.isNaN(effective.getTime())) throw new ApprovalError("Invalid proposed effective date.");
  const minEffective = Date.now() + MIN_EFFECTIVE_LEAD_HOURS * 3600_000;
  if (effective.getTime() < minEffective) {
    throw new ApprovalError(`Proposed effective date must be at least ${MIN_EFFECTIVE_LEAD_HOURS} hours in the future.`);
  }
  const facingParties = fc.affected_party === "customers" || fc.affected_party === "cleaners" || fc.affected_party === "both";
  if (facingParties && !input.externalNoticeSummary?.trim()) {
    throw new ApprovalError("An external notice summary is required for customer- or cleaner-facing fee changes.");
  }

  const cfgRows = (await sql`
    INSERT INTO fee_configurations
      (name, fee_type, affected_party, calculation_method, flat_amount_cents,
       percentage_bps, formula_json, city, state, service_type, status, created_by)
    VALUES (${fc.name}, ${fc.fee_type}, ${fc.affected_party}, ${fc.calculation_method},
            ${fc.flat_amount_cents ?? null}, ${fc.percentage_bps ?? null},
            ${fc.formula_json ? JSON.stringify(fc.formula_json) : null},
            ${fc.city ?? null}, ${fc.state ?? null}, ${fc.service_type ?? null},
            'pending_approval', ${actor.clerkId})
    RETURNING id
  `) as Array<{ id: string }>;
  const configId = cfgRows[0].id;

  const propRows = (await sql`
    INSERT INTO fee_change_proposals
      (proposed_fee_configuration_id, proposer_clerk_id,
       proposer_user_id, title, reason, internal_notes, external_notice_summary,
       status, proposed_effective_at, response_deadline_at)
    VALUES (
      ${configId}, ${actor.clerkId},
      (SELECT id FROM users WHERE clerk_id = ${actor.clerkId} LIMIT 1),
      ${input.title}, ${input.reason}, ${input.internalNotes ?? null},
      ${input.externalNoticeSummary ?? null}, 'pending',
      ${effective.toISOString()}, NOW() + (${RESPONSE_WINDOW_HOURS} * INTERVAL '1 hour')
    )
    RETURNING *
  `) as Row[];
  const proposal = propRows[0];
  await record(sql, proposal.id as string, actor, "created");
  return proposal;
}

// ── Approval readiness ───────────────────────────────────────────────────────
async function currentApprovers(sql: Sql, proposalId: string): Promise<string[]> {
  const rows = (await sql`
    SELECT actor_clerk_id FROM (
      SELECT DISTINCT ON (actor_clerk_id) actor_clerk_id, action
      FROM fee_change_proposal_actions
      WHERE proposal_id = ${proposalId}
        AND action IN ('approved','revoked_approval','declined')
      ORDER BY actor_clerk_id, created_at DESC
    ) t WHERE action = 'approved'
  `) as Array<{ actor_clerk_id: string }>;
  return rows.map((r) => r.actor_clerk_id);
}

async function maybePromoteToCooldown(sql: Sql, proposal: Row, actor: Actor): Promise<Row> {
  const id = proposal.id as string;
  const approvers = await currentApprovers(sql, id);
  const proposer = proposal.proposer_clerk_id as string;
  const proposerApproved = approvers.includes(proposer);
  const others = approvers.filter((a) => a !== proposer);
  if (!proposerApproved || others.length < 1) return proposal;

  if (proposal.status === "collaboration") {
    const pending = (await sql`
      SELECT COUNT(*)::int AS n FROM fee_change_collaborators
      WHERE proposal_id = ${id} AND must_approve_final = TRUE AND approved_final_at IS NULL
    `) as Array<{ n: number }>;
    if ((pending[0]?.n ?? 0) > 0) return proposal;
  }

  const rows = (await sql`
    UPDATE fee_change_proposals SET
      status = 'cooldown', approved_at = COALESCE(approved_at, NOW()),
      cooldown_started_at = NOW(),
      cooldown_expires_at = NOW() + (${COOLDOWN_HOURS} * INTERVAL '1 hour'),
      updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  await record(sql, id, actor, "cooldown_started");
  return rows[0];
}

function assertActionable(proposal: Row) {
  const terminal = ["declined", "expired_declined", "cancelled", "effective", "notice_sent"];
  if (terminal.includes(proposal.status as string)) {
    throw new ApprovalError(`Proposal is ${proposal.status} and can no longer be changed.`, 409);
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────
export async function approve(sql: Sql, id: string, actor: Actor, comment?: string): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  await record(sql, id, actor, "approved", comment);
  if (proposal.status === "collaboration") {
    await sql`
      UPDATE fee_change_collaborators SET approved_final_at = NOW()
      WHERE proposal_id = ${id} AND clerk_id = ${actor.clerkId}
    `;
  }
  await touch(sql, id);
  return maybePromoteToCooldown(sql, (await getProposal(sql, id))!, actor);
}

export async function decline(sql: Sql, id: string, actor: Actor, reason?: string): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  const rows = (await sql`
    UPDATE fee_change_proposals SET status = 'declined', declined_at = NOW(),
      decline_reason = ${reason ?? null}, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  await record(sql, id, actor, "declined", reason);
  return rows[0];
}

export async function ignore(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  await record(sql, id, actor, "ignored");
  return proposal;
}

export async function proposeModification(
  sql: Sql,
  id: string,
  actor: Actor,
  comment: string,
  modJson?: unknown,
): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  await record(sql, id, actor, "proposed_modification", comment, modJson);
  // Enter collaboration; reset cooldown; require collaborators to re-approve final.
  const beforeDeadline = new Date() <= new Date(proposal.response_deadline_at as string);
  await sql`
    INSERT INTO fee_change_collaborators (proposal_id, clerk_id, email, must_approve_final)
    VALUES (${id}, ${actor.clerkId}, ${actor.email ?? null}, ${beforeDeadline})
    ON CONFLICT (proposal_id, clerk_id) DO NOTHING
  `;
  await sql`UPDATE fee_change_collaborators SET approved_final_at = NULL WHERE proposal_id = ${id}`;
  const wasCooldown = proposal.status === "cooldown";
  const rows = (await sql`
    UPDATE fee_change_proposals SET
      status = 'collaboration',
      response_deadline_removed_at = COALESCE(response_deadline_removed_at, NOW()),
      cooldown_started_at = NULL, cooldown_expires_at = NULL, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  if (wasCooldown) await record(sql, id, actor, "cooldown_reset");
  await record(sql, id, actor, "modified", comment, modJson);
  return rows[0];
}

export async function joinCollaboration(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  const beforeDeadline = new Date() <= new Date(proposal.response_deadline_at as string);
  await sql`
    INSERT INTO fee_change_collaborators (proposal_id, clerk_id, email, must_approve_final)
    VALUES (${id}, ${actor.clerkId}, ${actor.email ?? null}, ${beforeDeadline})
    ON CONFLICT (proposal_id, clerk_id) DO NOTHING
  `;
  await record(sql, id, actor, "joined_collaboration");
  const rows = (await sql`
    UPDATE fee_change_proposals SET status = 'collaboration',
      response_deadline_removed_at = COALESCE(response_deadline_removed_at, NOW()),
      updated_at = NOW()
    WHERE id = ${id} AND status = 'pending' RETURNING *
  `) as Row[];
  return rows[0] ?? proposal;
}

export async function revokeApproval(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  await record(sql, id, actor, "revoked_approval");
  await sql`
    UPDATE fee_change_collaborators SET approved_final_at = NULL
    WHERE proposal_id = ${id} AND clerk_id = ${actor.clerkId}
  `;
  if (proposal.status === "cooldown") {
    const rows = (await sql`
      UPDATE fee_change_proposals SET status = 'collaboration',
        cooldown_started_at = NULL, cooldown_expires_at = NULL, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `) as Row[];
    await record(sql, id, actor, "cooldown_reset");
    return rows[0];
  }
  await touch(sql, id);
  return (await getProposal(sql, id))!;
}

export async function cancel(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const proposal = await getProposal(sql, id);
  if (!proposal) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(proposal);
  const rows = (await sql`
    UPDATE fee_change_proposals SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  await record(sql, id, actor, "cancelled");
  return rows[0];
}

// ── Cron transitions ─────────────────────────────────────────────────────────

/** Auto-decline pending proposals past the 72h window with no Super Admin action. */
export async function expirePending(sql: Sql): Promise<Row[]> {
  const due = (await sql`
    SELECT p.* FROM fee_change_proposals p
    WHERE p.status = 'pending' AND p.response_deadline_at < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM fee_change_proposal_actions a
        WHERE a.proposal_id = p.id AND a.action <> 'created'
      )
  `) as Row[];
  for (const p of due) {
    await sql`
      UPDATE fee_change_proposals SET status = 'expired_declined', declined_at = NOW(),
        decline_reason = 'Expired with no Super Admin action within 72 hours.', updated_at = NOW()
      WHERE id = ${p.id as string}
    `;
    await sql`
      INSERT INTO fee_change_proposal_actions (proposal_id, actor_clerk_id, action)
      VALUES (${p.id as string}, 'system', 'expired_declined')
    `;
  }
  return due;
}

/** After 48h cooldown, lock in notice + schedule effective date. Returns proposals needing notice. */
export async function completeCooldowns(sql: Sql): Promise<Row[]> {
  const due = (await sql`
    SELECT * FROM fee_change_proposals
    WHERE status = 'cooldown' AND cooldown_expires_at <= NOW()
  `) as Row[];
  for (const p of due) {
    await sql`
      UPDATE fee_change_proposals SET
        status = 'notice_sent', notice_sent_at = NOW(),
        notice_period_ends_at = NOW() + (${NOTICE_DAYS} * INTERVAL '1 day'),
        final_effective_at = GREATEST(
          proposed_effective_at,
          date_trunc('day', NOW() + (${NOTICE_DAYS} * INTERVAL '1 day')) + INTERVAL '23 hours 59 minutes'
        ),
        updated_at = NOW()
      WHERE id = ${p.id as string}
    `;
    await sql`
      INSERT INTO fee_change_proposal_actions (proposal_id, actor_clerk_id, action)
      VALUES (${p.id as string}, 'system', 'notice_sent')
    `;
  }
  return due;
}

/** Activate fee configs whose notice period + effective time has passed. */
export async function activateEffective(sql: Sql): Promise<Row[]> {
  const due = (await sql`
    SELECT * FROM fee_change_proposals
    WHERE status = 'notice_sent' AND final_effective_at <= NOW()
  `) as Row[];
  for (const p of due) {
    const configId = p.proposed_fee_configuration_id as string;
    // Supersede currently-active configs of the same fee_type + scope.
    await sql`
      UPDATE fee_configurations c SET status = 'superseded', active_until = NOW(), updated_at = NOW()
      WHERE c.status = 'active'
        AND c.fee_type = (SELECT fee_type FROM fee_configurations WHERE id = ${configId})
        AND COALESCE(c.city,'') = (SELECT COALESCE(city,'') FROM fee_configurations WHERE id = ${configId})
        AND COALESCE(c.state,'') = (SELECT COALESCE(state,'') FROM fee_configurations WHERE id = ${configId})
        AND COALESCE(c.service_type,'') = (SELECT COALESCE(service_type,'') FROM fee_configurations WHERE id = ${configId})
        AND c.id <> ${configId}
    `;
    await sql`
      UPDATE fee_configurations SET status = 'active', active_from = NOW(), updated_at = NOW()
      WHERE id = ${configId}
    `;
    await sql`
      UPDATE fee_change_proposals SET status = 'effective', updated_at = NOW()
      WHERE id = ${p.id as string}
    `;
    await sql`
      INSERT INTO fee_change_proposal_actions (proposal_id, actor_clerk_id, action)
      VALUES (${p.id as string}, 'system', 'became_effective')
    `;
  }
  return due;
}
