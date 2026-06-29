/**
 * Notifications for fee-change proposals: Slack approval card, in-app + email
 * to all Super Admins, and secure single-use action links (email fallback).
 *
 * All best-effort: notification failures never block the proposal itself.
 */
import type { Sql } from "./db";
import type { Env } from "../types";
import { logger } from "./logger";
import { recordError } from "./errorLog";
import { sendEmail, SENDERS, TEMPLATES, formatEmailTimestamp } from "./mailer";
import { sendNotification } from "./notifications";
import { listSuperAdmins } from "./approvalEngine";
import { approvalCardBlocks, postMessage, updateMessage } from "./slack";

function adminUrl(env: Env): string {
  return env.ADMIN_URL ?? "https://admin.getsweepr.com";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ProposalRow {
  id: string;
  title: string;
  reason: string;
  proposer_clerk_id: string;
  status: string;
  proposed_effective_at: string;
  response_deadline_at: string;
  proposed_fee_configuration_id: string;
}

async function activeWorkspace(sql: Sql) {
  const rows = (await sql`
    SELECT id, bot_token FROM slack_workspaces WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
  `) as Array<{ id: string; bot_token: string }>;
  return rows[0] ?? null;
}

async function approvalsChannel(sql: Sql, workspaceId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT channel_id FROM slack_channels
    WHERE workspace_id = ${workspaceId} AND purpose = 'approvals' LIMIT 1
  `) as Array<{ channel_id: string }>;
  return rows[0]?.channel_id ?? null;
}

async function logNotif(
  sql: Sql,
  proposalId: string,
  clerkId: string | null,
  channel: string,
  recipient: string,
  status: "sent" | "failed",
  err?: string,
): Promise<void> {
  await sql`
    INSERT INTO fee_change_notifications (proposal_id, clerk_id, channel, recipient, status, sent_at, error_message)
    VALUES (${proposalId}, ${clerkId}, ${channel}, ${recipient}, ${status}, NOW(), ${err ?? null})
  `;
}

/** Fan out a newly-created proposal to Super Admins + Slack. */
export async function notifyProposalCreated(sql: Sql, env: Env, proposal: ProposalRow): Promise<void> {
  const admins = await listSuperAdmins(sql);
  const link = `${adminUrl(env)}/approvals/${proposal.id}`;

  // Per-admin: in-app + email + secure action link.
  for (const a of admins) {
    try {
      await sendNotification(sql, a.user_id, {
        type: "fee_proposal",
        title: "Fee change proposed",
        body: proposal.title,
        data: { proposalId: proposal.id },
      });
      await logNotif(sql, proposal.id, a.clerk_id, "in_app", a.email, "sent");
    } catch (err) {
      await logNotif(sql, proposal.id, a.clerk_id, "in_app", a.email, "failed", String(err));
    }

    // Secure single-use action token (email fallback to act without the dashboard).
    let actionLink = link;
    try {
      const raw = crypto.randomUUID() + crypto.randomUUID();
      const hash = await sha256Hex(raw);
      await sql`
        INSERT INTO fee_change_action_links (proposal_id, clerk_id, email, token_hash, expires_at)
        VALUES (${proposal.id}, ${a.clerk_id}, ${a.email}, ${hash}, NOW() + (72 * INTERVAL '1 hour'))
      `;
      actionLink = `https://api.getsweepr.com/fee-action/${raw}`;
    } catch (err) {
      logger.error("approval.action_link failed", err, { proposalId: proposal.id });
    }

    if (env.MAILERSEND_API_KEY && a.email) {
      try {
        const requesterName = admins.find((x) => x.clerk_id === proposal.proposer_clerk_id)?.email ?? "A Sweepr administrator";
        await sendEmail(env.MAILERSEND_API_KEY, {
          to: a.email,
          subject: `Sweepr Approval Request — ${proposal.title}`,
          from: SENDERS.ADMIN,
          replyTo: SENDERS.SECURITY,
          templateId: TEMPLATES.ADMIN_APPROVAL_REQUEST,
          variables: {
            requester_name: requesterName,
            approval_title: proposal.title,
            approval_type: "Platform Fees",
            approval_url: actionLink,
            approval_expires_at: formatEmailTimestamp(new Date(Date.now() + 72 * 3600_000)),
            notification_settings_url: `${adminUrl(env)}/settings`,
          },
        });
        await logNotif(sql, proposal.id, a.clerk_id, "email", a.email, "sent");
      } catch (err) {
        await logNotif(sql, proposal.id, a.clerk_id, "email", a.email, "failed", String(err));
      }
    }
  }

  // Slack approval card.
  await postProposalCard(sql, env, proposal);
}

/** Post the interactive approval card to the Slack approvals channel. */
export async function postProposalCard(sql: Sql, env: Env, proposal: ProposalRow): Promise<void> {
  try {
    const ws = await activeWorkspace(sql);
    if (!ws) return;
    const channel = await approvalsChannel(sql, ws.id);
    if (!channel) return;

    const cfg = (await sql`
      SELECT fee_type, affected_party FROM fee_configurations WHERE id = ${proposal.proposed_fee_configuration_id} LIMIT 1
    `) as Array<{ fee_type: string; affected_party: string }>;

    const blocks = approvalCardBlocks({
      proposalId: proposal.id,
      title: proposal.title,
      kind: "Fee change",
      feeType: cfg[0]?.fee_type,
      affectedParty: cfg[0]?.affected_party,
      proposer: proposal.proposer_clerk_id,
      status: proposal.status,
      proposedEffectiveAt: new Date(proposal.proposed_effective_at).toLocaleString(),
      responseDeadline: new Date(proposal.response_deadline_at).toLocaleString(),
      adminUrl: adminUrl(env),
    });
    const res = await postMessage(ws.bot_token, channel, {
      text: `Fee change proposed: ${proposal.title}`,
      blocks,
    });
    if (res.ok && res.ts) {
      await sql`
        INSERT INTO slack_messages (workspace_id, channel_id, message_ts, ref_type, ref_id)
        VALUES (${ws.id}, ${channel}, ${res.ts}, 'fee_proposal', ${proposal.id})
      `;
      await logNotif(sql, proposal.id, null, "slack", channel, "sent");
    } else {
      await logNotif(sql, proposal.id, null, "slack", channel, "failed", res.error ?? "post_failed");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("approval.slack_card failed", err, { proposalId: proposal.id });
    void recordError(sql, {
      source: "server", app: "admin", level: "error",
      message: `Approval Slack card failed for proposal ${proposal.id}: ${msg}`,
      path: "approvalNotify.postProposalCard", context: { proposalId: proposal.id },
    });
  }
}

/** Update the Slack card in place to reflect a new status. */
export async function updateProposalCard(sql: Sql, env: Env, proposalId: string): Promise<void> {
  try {
    const ws = await activeWorkspace(sql);
    if (!ws) return;
    const msgs = (await sql`
      SELECT channel_id, message_ts FROM slack_messages
      WHERE ref_type = 'fee_proposal' AND ref_id = ${proposalId} ORDER BY created_at DESC LIMIT 1
    `) as Array<{ channel_id: string; message_ts: string }>;
    const msg = msgs[0];
    if (!msg) return;
    const pRows = (await sql`SELECT * FROM fee_change_proposals WHERE id = ${proposalId} LIMIT 1`) as Array<ProposalRow>;
    const p = pRows[0];
    if (!p) return;
    const cfg = (await sql`
      SELECT fee_type, affected_party FROM fee_configurations WHERE id = ${p.proposed_fee_configuration_id} LIMIT 1
    `) as Array<{ fee_type: string; affected_party: string }>;
    const blocks = approvalCardBlocks({
      proposalId: p.id,
      title: p.title,
      kind: "Fee change",
      feeType: cfg[0]?.fee_type,
      affectedParty: cfg[0]?.affected_party,
      proposer: p.proposer_clerk_id,
      status: p.status,
      proposedEffectiveAt: new Date(p.proposed_effective_at).toLocaleString(),
      responseDeadline: new Date(p.response_deadline_at).toLocaleString(),
      adminUrl: adminUrl(env),
    });
    await updateMessage(ws.bot_token, msg.channel_id, msg.message_ts, {
      text: `Fee change (${p.status}): ${p.title}`,
      blocks,
    });
  } catch (err) {
    logger.error("approval.slack_update failed", err, { proposalId });
  }
}

export { sha256Hex };

// ── Pricing proposals ─────────────────────────────────────────────────────────
interface PricingProposalRow {
  id: string;
  title: string;
  reason: string;
  proposer_clerk_id: string;
  status: string;
  proposed_effective_at: string;
  response_deadline_at: string;
  proposed_pricing_rule_id: string;
}

export async function notifyPricingProposalCreated(sql: Sql, env: Env, proposal: PricingProposalRow): Promise<void> {
  const admins = await listSuperAdmins(sql);
  const link = `${adminUrl(env)}/pricing/approvals/${proposal.id}`;
  for (const a of admins) {
    try {
      await sendNotification(sql, a.user_id, {
        type: "pricing_proposal",
        title: "Pricing change proposed",
        body: proposal.title,
        data: { proposalId: proposal.id },
      });
    } catch (err) {
      logger.error("pricing.notify in_app failed", err, { proposalId: proposal.id });
    }
    if (env.MAILERSEND_API_KEY && a.email) {
      try {
        const requesterName = admins.find((x) => x.clerk_id === proposal.proposer_clerk_id)?.email ?? "A Sweepr administrator";
        await sendEmail(env.MAILERSEND_API_KEY, {
          to: a.email,
          subject: `Sweepr Approval Request — ${proposal.title}`,
          from: SENDERS.ADMIN,
          replyTo: SENDERS.SECURITY,
          templateId: TEMPLATES.ADMIN_APPROVAL_REQUEST,
          variables: {
            requester_name: requesterName,
            approval_title: proposal.title,
            approval_type: "Cleaning Pricing",
            approval_url: link,
            approval_expires_at: formatEmailTimestamp(new Date(Date.now() + 72 * 3600_000)),
            notification_settings_url: `${adminUrl(env)}/settings`,
          },
        });
      } catch (err) {
        logger.error("pricing.notify email failed", err, { proposalId: proposal.id });
      }
    }
  }
  await postPricingCard(sql, env, proposal);
}

export async function postPricingCard(sql: Sql, env: Env, proposal: PricingProposalRow): Promise<void> {
  try {
    const ws = await activeWorkspace(sql);
    if (!ws) return;
    const channel = await approvalsChannel(sql, ws.id);
    if (!channel) return;
    const rule = (await sql`SELECT name FROM pricing_rules WHERE id = ${proposal.proposed_pricing_rule_id} LIMIT 1`) as Array<{ name: string }>;
    const blocks = approvalCardBlocks({
      proposalId: proposal.id,
      title: proposal.title,
      kind: "Pricing change",
      feeType: rule[0]?.name,
      proposer: proposal.proposer_clerk_id,
      status: proposal.status,
      proposedEffectiveAt: new Date(proposal.proposed_effective_at).toLocaleString(),
      responseDeadline: new Date(proposal.response_deadline_at).toLocaleString(),
      adminUrl: adminUrl(env),
      domain: "pricing",
    });
    const res = await postMessage(ws.bot_token, channel, { text: `Pricing change proposed: ${proposal.title}`, blocks });
    if (res.ok && res.ts) {
      await sql`
        INSERT INTO slack_messages (workspace_id, channel_id, message_ts, ref_type, ref_id)
        VALUES (${ws.id}, ${channel}, ${res.ts}, 'pricing_proposal', ${proposal.id})
      `;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("pricing.slack_card failed", err, { proposalId: proposal.id });
    void recordError(sql, {
      source: "server", app: "admin", level: "error",
      message: `Pricing Slack card failed for proposal ${proposal.id}: ${msg}`,
      path: "approvalNotify.postPricingProposalCard", context: { proposalId: proposal.id },
    });
  }
}

export async function updatePricingCard(sql: Sql, env: Env, proposalId: string): Promise<void> {
  try {
    const ws = await activeWorkspace(sql);
    if (!ws) return;
    const msgs = (await sql`
      SELECT channel_id, message_ts FROM slack_messages
      WHERE ref_type = 'pricing_proposal' AND ref_id = ${proposalId} ORDER BY created_at DESC LIMIT 1
    `) as Array<{ channel_id: string; message_ts: string }>;
    const msg = msgs[0];
    if (!msg) return;
    const pRows = (await sql`SELECT * FROM pricing_change_proposals WHERE id = ${proposalId} LIMIT 1`) as Array<PricingProposalRow>;
    const p = pRows[0];
    if (!p) return;
    const rule = (await sql`SELECT name FROM pricing_rules WHERE id = ${p.proposed_pricing_rule_id} LIMIT 1`) as Array<{ name: string }>;
    const blocks = approvalCardBlocks({
      proposalId: p.id,
      title: p.title,
      kind: "Pricing change",
      feeType: rule[0]?.name,
      proposer: p.proposer_clerk_id,
      status: p.status,
      proposedEffectiveAt: new Date(p.proposed_effective_at).toLocaleString(),
      responseDeadline: new Date(p.response_deadline_at).toLocaleString(),
      adminUrl: adminUrl(env),
      domain: "pricing",
    });
    await updateMessage(ws.bot_token, msg.channel_id, msg.message_ts, { text: `Pricing change (${p.status}): ${p.title}`, blocks });
  } catch (err) {
    logger.error("pricing.slack_update failed", err, { proposalId });
  }
}
