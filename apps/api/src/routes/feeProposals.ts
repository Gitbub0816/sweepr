/**
 * Fee Change Approval Engine — HTTP API.
 *
 *   Admin (requireAuth + super_admin), mounted at /admin/fee-proposals:
 *     POST   /                         create proposal
 *     GET    /                         list (?status=)
 *     GET    /:id                      detail (config, actions, collaborators)
 *     POST   /:id/approve | decline | ignore | propose-modification |
 *            join-collaboration | revoke-approval | cancel
 *     GET    /:id/audit-log
 *
 *   Secure action links (public, single-use token), mounted at /fee-action:
 *     GET    /:token                   summary
 *     POST   /:token/approve | decline | ignore | propose-modification
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { audit } from "../lib/audit";
import {
  createProposal,
  getProposal,
  approve,
  decline,
  ignore,
  proposeModification,
  joinCollaboration,
  revokeApproval,
  cancel,
  ApprovalError,
  type Actor,
} from "../lib/approvalEngine";
import { notifyProposalCreated, updateProposalCard, sha256Hex } from "../lib/approvalNotify";
import type { AppBindings } from "../types";

export const feeProposalsRouter = new Hono<AppBindings>();
export const feeActionRouter = new Hono<AppBindings>();

const gate = [requireAuth, requireAdminRole("super_admin")] as const;

function actorOf(c: { get: (k: "user") => { clerkId: string; email?: string } }): Actor {
  const u = c.get("user");
  return { clerkId: u.clerkId, email: u.email };
}

async function handle<T>(c: { json: (b: unknown, s?: number) => Response }, fn: () => Promise<T>) {
  try {
    return c.json({ ok: true, result: await fn() });
  } catch (err) {
    if (err instanceof ApprovalError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
}

// ── Create ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  feeConfig: z.object({
    name: z.string().min(1),
    fee_type: z.enum([
      "customer_service_fee", "platform_fee", "cleaner_commission", "insurance_admin_fee",
      "cancellation_fee", "reschedule_fee", "adjustment_fee", "marketplace_fee",
      "payment_processing_pass_through", "other",
    ]),
    affected_party: z.enum(["customers", "cleaners", "both", "internal_only"]),
    calculation_method: z.enum([
      "flat_amount", "percentage", "tiered_percentage", "dynamic_formula",
      "market_based", "city_based", "service_type_based",
    ]),
    flat_amount_cents: z.number().int().optional().nullable(),
    percentage_bps: z.number().int().optional().nullable(),
    formula_json: z.unknown().optional(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    service_type: z.string().optional().nullable(),
  }),
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
  internalNotes: z.string().max(4000).optional(),
  externalNoticeSummary: z.string().max(4000).optional(),
  proposedEffectiveAt: z.string(),
});

feeProposalsRouter.post("/", ...gate, zValidator("json", createSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const input = c.req.valid("json");
  try {
    const proposal = await createProposal(sql, actorOf(c), input as never);
    await audit(sql, {
      action: "admin.action", actorClerkId: c.get("user").clerkId,
      targetType: "fee_proposal", targetId: proposal.id as string,
      metadata: { event: "fee_proposal_created", title: input.title },
      timestamp: new Date().toISOString(),
    });
    // Fan out notifications (best-effort).
    await notifyProposalCreated(sql, c.env, proposal as never);
    return c.json({ ok: true, proposal });
  } catch (err) {
    if (err instanceof ApprovalError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

// ── List ─────────────────────────────────────────────────────────────────────
feeProposalsRouter.get("/", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const rows = await sql(
    `SELECT p.*, fc.fee_type, fc.affected_party, fc.name AS config_name
     FROM fee_change_proposals p
     JOIN fee_configurations fc ON fc.id = p.proposed_fee_configuration_id
     ${status ? "WHERE p.status = $1" : ""}
     ORDER BY p.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  return c.json({ proposals: rows });
});

// ── Detail ───────────────────────────────────────────────────────────────────
feeProposalsRouter.get("/:id", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const proposal = await getProposal(sql, id);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  const config = (await sql`SELECT * FROM fee_configurations WHERE id = ${proposal.proposed_fee_configuration_id as string} LIMIT 1`) as unknown[];
  const actions = (await sql`SELECT * FROM fee_change_proposal_actions WHERE proposal_id = ${id} ORDER BY created_at ASC`) as unknown[];
  const collaborators = (await sql`SELECT * FROM fee_change_collaborators WHERE proposal_id = ${id}`) as unknown[];
  return c.json({ proposal, config: config[0] ?? null, actions, collaborators });
});

feeProposalsRouter.get("/:id/audit-log", ...gate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const actions = (await sql`SELECT * FROM fee_change_proposal_actions WHERE proposal_id = ${c.req.param("id")} ORDER BY created_at ASC`) as unknown[];
  return c.json({ actions });
});

// ── Actions ──────────────────────────────────────────────────────────────────
function actionRoute(
  path: string,
  fn: (sql: ReturnType<typeof getDb>, id: string, actor: Actor, body: Record<string, unknown>) => Promise<unknown>,
) {
  feeProposalsRouter.post(path, ...gate, async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id") as string;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const res = await handle(c, async () => {
      const r = await fn(sql, id, actorOf(c), body);
      await updateProposalCard(sql, c.env, id);
      return r;
    });
    return res;
  });
}

actionRoute("/:id/approve", (sql, id, actor, b) => approve(sql, id, actor, b.comment as string | undefined));
actionRoute("/:id/decline", (sql, id, actor, b) => decline(sql, id, actor, b.reason as string | undefined));
actionRoute("/:id/ignore", (sql, id, actor) => ignore(sql, id, actor));
actionRoute("/:id/propose-modification", (sql, id, actor, b) =>
  proposeModification(sql, id, actor, (b.comment as string) ?? "", b.modification));
actionRoute("/:id/join-collaboration", (sql, id, actor) => joinCollaboration(sql, id, actor));
actionRoute("/:id/revoke-approval", (sql, id, actor) => revokeApproval(sql, id, actor));
actionRoute("/:id/cancel", (sql, id, actor) => cancel(sql, id, actor));

// ── Secure action links (public, single-use) ─────────────────────────────────
async function resolveToken(sql: ReturnType<typeof getDb>, token: string) {
  const hash = await sha256Hex(token);
  const rows = (await sql`
    SELECT * FROM fee_change_action_links
    WHERE token_hash = ${hash} AND used_at IS NULL AND expires_at > NOW() LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

feeActionRouter.get("/:token", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const link = await resolveToken(sql, c.req.param("token"));
  if (!link) return c.json({ error: "Invalid or expired link" }, 404);
  const proposal = await getProposal(sql, link.proposal_id as string);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  return c.json({
    proposal: { id: proposal.id, title: proposal.title, reason: proposal.reason, status: proposal.status,
      proposed_effective_at: proposal.proposed_effective_at },
    actor: { email: link.email },
  });
});

function tokenAction(
  path: string,
  fn: (sql: ReturnType<typeof getDb>, id: string, actor: Actor, body: Record<string, unknown>) => Promise<unknown>,
) {
  feeActionRouter.post(path, async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const link = await resolveToken(sql, c.req.param("token") as string);
    if (!link) return c.json({ error: "Invalid or expired link" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const actor: Actor = { clerkId: link.clerk_id as string, email: (link.email as string) ?? undefined };
    const res = await handle(c, async () => {
      const r = await fn(sql, link.proposal_id as string, actor, body);
      await sql`UPDATE fee_change_action_links SET used_at = NOW() WHERE id = ${link.id as string}`;
      await updateProposalCard(sql, c.env, link.proposal_id as string);
      return r;
    });
    return res;
  });
}

tokenAction("/:token/approve", (sql, id, actor, b) => approve(sql, id, actor, b.comment as string | undefined));
tokenAction("/:token/decline", (sql, id, actor, b) => decline(sql, id, actor, b.reason as string | undefined));
tokenAction("/:token/ignore", (sql, id, actor) => ignore(sql, id, actor));
tokenAction("/:token/propose-modification", (sql, id, actor, b) =>
  proposeModification(sql, id, actor, (b.comment as string) ?? "", b.modification));
