/**
 * Pricing Change Approval Engine — same state machine as the fee engine, on the
 * pricing_change_* / pricing_rules tables. Kept separate for clarity per spec.
 */
import type { Sql } from "./db";
import {
  ApprovalError,
  RESPONSE_WINDOW_HOURS,
  COOLDOWN_HOURS,
  NOTICE_DAYS,
  MIN_EFFECTIVE_LEAD_HOURS,
  type Actor,
} from "./approvalEngine";

type Row = Record<string, unknown>;

export async function getPricingProposal(sql: Sql, id: string): Promise<Row | null> {
  const rows = (await sql`SELECT * FROM pricing_change_proposals WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ?? null;
}

async function record(sql: Sql, proposalId: string, actor: Actor, action: string, comment?: string | null, modJson?: unknown): Promise<void> {
  await sql`
    INSERT INTO pricing_change_actions
      (proposal_id, actor_clerk_id, actor_email, action, comment, proposed_modification_json)
    VALUES (${proposalId}, ${actor.clerkId}, ${actor.email ?? null}, ${action},
            ${comment ?? null}, ${modJson ? JSON.stringify(modJson) : null})
  `;
}

export interface CreatePricingProposalInput {
  pricingRuleId: string;
  title: string;
  reason: string;
  internalNotes?: string;
  externalNoticeSummary?: string;
  proposedEffectiveAt: string;
  affectsParties: boolean; // requires external notice summary
}

export async function createPricingProposal(sql: Sql, actor: Actor, input: CreatePricingProposalInput): Promise<Row> {
  const effective = new Date(input.proposedEffectiveAt);
  if (Number.isNaN(effective.getTime())) throw new ApprovalError("Invalid proposed effective date.");
  if (effective.getTime() < Date.now() + MIN_EFFECTIVE_LEAD_HOURS * 3600_000) {
    throw new ApprovalError(`Proposed effective date must be at least ${MIN_EFFECTIVE_LEAD_HOURS} hours in the future.`);
  }
  if (input.affectsParties && !input.externalNoticeSummary?.trim()) {
    throw new ApprovalError("An external notice summary is required for customer- or cleaner-affecting pricing changes.");
  }
  const ruleRows = (await sql`SELECT id, status FROM pricing_rules WHERE id = ${input.pricingRuleId} LIMIT 1`) as Array<{ id: string; status: string }>;
  if (!ruleRows[0]) throw new ApprovalError("Pricing rule not found.", 404);

  await sql`UPDATE pricing_rules SET status = 'pending_approval', updated_at = NOW() WHERE id = ${input.pricingRuleId}`;

  const rows = (await sql`
    INSERT INTO pricing_change_proposals
      (proposed_pricing_rule_id, proposer_clerk_id, proposer_user_id, title, reason,
       internal_notes, external_notice_summary, status, proposed_effective_at, response_deadline_at)
    VALUES (
      ${input.pricingRuleId}, ${actor.clerkId},
      (SELECT id FROM users WHERE clerk_id = ${actor.clerkId} LIMIT 1),
      ${input.title}, ${input.reason}, ${input.internalNotes ?? null}, ${input.externalNoticeSummary ?? null},
      'pending', ${effective.toISOString()}, NOW() + (${RESPONSE_WINDOW_HOURS} * INTERVAL '1 hour')
    ) RETURNING *
  `) as Row[];
  await record(sql, rows[0].id as string, actor, "created");
  return rows[0];
}

async function currentApprovers(sql: Sql, proposalId: string): Promise<string[]> {
  const rows = (await sql`
    SELECT actor_clerk_id FROM (
      SELECT DISTINCT ON (actor_clerk_id) actor_clerk_id, action
      FROM pricing_change_actions
      WHERE proposal_id = ${proposalId} AND action IN ('approved','revoked_approval','declined')
      ORDER BY actor_clerk_id, created_at DESC
    ) t WHERE action = 'approved'
  `) as Array<{ actor_clerk_id: string }>;
  return rows.map((r) => r.actor_clerk_id);
}

async function maybePromote(sql: Sql, proposal: Row, actor: Actor): Promise<Row> {
  const id = proposal.id as string;
  const approvers = await currentApprovers(sql, id);
  const proposer = proposal.proposer_clerk_id as string;
  if (!approvers.includes(proposer) || approvers.filter((a) => a !== proposer).length < 1) return proposal;
  if (proposal.status === "collaboration") {
    const pending = (await sql`
      SELECT COUNT(*)::int AS n FROM pricing_change_collaborators
      WHERE proposal_id = ${id} AND must_approve_final = TRUE AND approved_final_at IS NULL
    `) as Array<{ n: number }>;
    if ((pending[0]?.n ?? 0) > 0) return proposal;
  }
  const rows = (await sql`
    UPDATE pricing_change_proposals SET status = 'cooldown', approved_at = COALESCE(approved_at, NOW()),
      cooldown_started_at = NOW(), cooldown_expires_at = NOW() + (${COOLDOWN_HOURS} * INTERVAL '1 hour'), updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  await record(sql, id, actor, "cooldown_started");
  return rows[0];
}

function assertActionable(p: Row) {
  if (["declined", "expired_declined", "cancelled", "effective", "notice_sent"].includes(p.status as string)) {
    throw new ApprovalError(`Proposal is ${p.status} and can no longer be changed.`, 409);
  }
}

export async function approve(sql: Sql, id: string, actor: Actor, comment?: string): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  await record(sql, id, actor, "approved", comment);
  if (p.status === "collaboration") {
    await sql`UPDATE pricing_change_collaborators SET approved_final_at = NOW() WHERE proposal_id = ${id} AND clerk_id = ${actor.clerkId}`;
  }
  return maybePromote(sql, (await getPricingProposal(sql, id))!, actor);
}

export async function decline(sql: Sql, id: string, actor: Actor, reason?: string): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  const rows = (await sql`
    UPDATE pricing_change_proposals SET status = 'declined', declined_at = NOW(), decline_reason = ${reason ?? null}, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  await record(sql, id, actor, "declined", reason);
  return rows[0];
}

export async function ignore(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  await record(sql, id, actor, "ignored");
  return p;
}

export async function proposeModification(sql: Sql, id: string, actor: Actor, comment: string, modJson?: unknown): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  await record(sql, id, actor, "proposed_modification", comment, modJson);
  const beforeDeadline = new Date() <= new Date(p.response_deadline_at as string);
  await sql`
    INSERT INTO pricing_change_collaborators (proposal_id, clerk_id, email, must_approve_final)
    VALUES (${id}, ${actor.clerkId}, ${actor.email ?? null}, ${beforeDeadline})
    ON CONFLICT (proposal_id, clerk_id) DO NOTHING
  `;
  await sql`UPDATE pricing_change_collaborators SET approved_final_at = NULL WHERE proposal_id = ${id}`;
  const wasCooldown = p.status === "cooldown";
  const rows = (await sql`
    UPDATE pricing_change_proposals SET status = 'collaboration',
      response_deadline_removed_at = COALESCE(response_deadline_removed_at, NOW()),
      cooldown_started_at = NULL, cooldown_expires_at = NULL, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `) as Row[];
  if (wasCooldown) await record(sql, id, actor, "cooldown_reset");
  await record(sql, id, actor, "modified", comment, modJson);
  return rows[0];
}

export async function joinCollaboration(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  const beforeDeadline = new Date() <= new Date(p.response_deadline_at as string);
  await sql`
    INSERT INTO pricing_change_collaborators (proposal_id, clerk_id, email, must_approve_final)
    VALUES (${id}, ${actor.clerkId}, ${actor.email ?? null}, ${beforeDeadline})
    ON CONFLICT (proposal_id, clerk_id) DO NOTHING
  `;
  await record(sql, id, actor, "joined_collaboration");
  const rows = (await sql`
    UPDATE pricing_change_proposals SET status = 'collaboration',
      response_deadline_removed_at = COALESCE(response_deadline_removed_at, NOW()), updated_at = NOW()
    WHERE id = ${id} AND status = 'pending' RETURNING *
  `) as Row[];
  return rows[0] ?? p;
}

export async function revokeApproval(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  await record(sql, id, actor, "revoked_approval");
  await sql`UPDATE pricing_change_collaborators SET approved_final_at = NULL WHERE proposal_id = ${id} AND clerk_id = ${actor.clerkId}`;
  if (p.status === "cooldown") {
    const rows = (await sql`
      UPDATE pricing_change_proposals SET status = 'collaboration', cooldown_started_at = NULL, cooldown_expires_at = NULL, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `) as Row[];
    await record(sql, id, actor, "cooldown_reset");
    return rows[0];
  }
  return (await getPricingProposal(sql, id))!;
}

export async function cancel(sql: Sql, id: string, actor: Actor): Promise<Row> {
  const p = await getPricingProposal(sql, id);
  if (!p) throw new ApprovalError("Proposal not found.", 404);
  assertActionable(p);
  const rows = (await sql`UPDATE pricing_change_proposals SET status = 'cancelled', updated_at = NOW() WHERE id = ${id} RETURNING *`) as Row[];
  await record(sql, id, actor, "cancelled");
  return rows[0];
}

// ── Cron transitions ─────────────────────────────────────────────────────────
export async function expirePending(sql: Sql): Promise<Row[]> {
  const due = (await sql`
    SELECT p.* FROM pricing_change_proposals p
    WHERE p.status = 'pending' AND p.response_deadline_at < NOW()
      AND NOT EXISTS (SELECT 1 FROM pricing_change_actions a WHERE a.proposal_id = p.id AND a.action <> 'created')
  `) as Row[];
  for (const p of due) {
    await sql`
      UPDATE pricing_change_proposals SET status = 'expired_declined', declined_at = NOW(),
        decline_reason = 'Expired with no Super Admin action within 72 hours.', updated_at = NOW()
      WHERE id = ${p.id as string}
    `;
    await sql`INSERT INTO pricing_change_actions (proposal_id, actor_clerk_id, action) VALUES (${p.id as string}, 'system', 'expired_declined')`;
  }
  return due;
}

export async function completeCooldowns(sql: Sql): Promise<Row[]> {
  const due = (await sql`SELECT * FROM pricing_change_proposals WHERE status = 'cooldown' AND cooldown_expires_at <= NOW()`) as Row[];
  for (const p of due) {
    await sql`
      UPDATE pricing_change_proposals SET status = 'notice_sent', notice_sent_at = NOW(),
        notice_period_ends_at = NOW() + (${NOTICE_DAYS} * INTERVAL '1 day'),
        final_effective_at = GREATEST(proposed_effective_at,
          date_trunc('day', NOW() + (${NOTICE_DAYS} * INTERVAL '1 day')) + INTERVAL '23 hours 59 minutes'),
        updated_at = NOW()
      WHERE id = ${p.id as string}
    `;
    await sql`INSERT INTO pricing_change_actions (proposal_id, actor_clerk_id, action) VALUES (${p.id as string}, 'system', 'notice_sent')`;
  }
  return due;
}

export async function activateEffective(sql: Sql): Promise<Row[]> {
  const due = (await sql`SELECT * FROM pricing_change_proposals WHERE status = 'notice_sent' AND final_effective_at <= NOW()`) as Row[];
  for (const p of due) {
    const ruleId = p.proposed_pricing_rule_id as string;
    // Supersede currently-active rule for the same market scope.
    await sql`
      UPDATE pricing_rules c SET status = 'superseded', active_until = NOW(), updated_at = NOW()
      WHERE c.status = 'active'
        AND COALESCE(c.market_city,'') = (SELECT COALESCE(market_city,'') FROM pricing_rules WHERE id = ${ruleId})
        AND COALESCE(c.market_state,'') = (SELECT COALESCE(market_state,'') FROM pricing_rules WHERE id = ${ruleId})
        AND COALESCE(c.market_zip,'') = (SELECT COALESCE(market_zip,'') FROM pricing_rules WHERE id = ${ruleId})
        AND c.id <> ${ruleId}
    `;
    await sql`UPDATE pricing_rules SET status = 'active', active_from = NOW(), approved_proposal_id = ${p.id as string}, updated_at = NOW() WHERE id = ${ruleId}`;
    await sql`UPDATE pricing_change_proposals SET status = 'effective', updated_at = NOW() WHERE id = ${p.id as string}`;
    await sql`INSERT INTO pricing_change_actions (proposal_id, actor_clerk_id, action) VALUES (${p.id as string}, 'system', 'became_effective')`;
  }
  return due;
}
