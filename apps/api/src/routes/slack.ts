/**
 * Slack integration routes.
 *
 *   Public webhooks (signature-verified, no Sweepr auth):
 *     GET  /slack/oauth/callback     OAuth redirect target
 *     POST /slack/events             Events API (url_verification, uninstall)
 *     POST /slack/interactivity      Interactive components (buttons/modals)
 *     POST /slack/commands           Slash commands
 *
 *   Admin (requireAuth + super_admin):
 *     GET  /slack/install                    -> { url } to begin OAuth
 *     GET  /slack/admin/status               connected workspaces + channels
 *     POST /slack/admin/disconnect/:id       revoke a workspace
 *     GET  /slack/admin/channels/:wsId       live channel list from Slack
 *     POST /slack/admin/channels             map or create a channel
 *     POST /slack/admin/test                 post a test message
 *
 * Sweepr is the source of truth. Slack never mutates Sweepr state directly:
 * every interactive action is verified and routed through Sweepr handlers.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { isOwnerEmail } from "../lib/owner";
import {
  getInstallUrl,
  exchangeOAuthCode,
  verifySlackSignature,
  postMessage,
  listChannels,
  createChannel,
  getUserInfo,
} from "../lib/slack";
import {
  approve,
  decline,
  joinCollaboration,
  proposeModification,
  ApprovalError,
} from "../lib/approvalEngine";
import { updateProposalCard } from "../lib/approvalNotify";
import type { AppBindings } from "../types";

export const slackRouter = new Hono<AppBindings>();

function redirectUri(env: AppBindings["Bindings"]): string {
  // Must exactly match the Redirect URL configured in the Slack app.
  const base = "https://api.getsweepr.com";
  void env;
  return `${base}/slack/oauth/callback`;
}

function adminUrl(env: AppBindings["Bindings"]): string {
  return env.ADMIN_URL ?? "https://admin.getsweepr.com";
}

async function activeWorkspace(sql: ReturnType<typeof getDb>) {
  const rows = (await sql`
    SELECT id, team_id, team_name, bot_token, bot_user_id, status
    FROM slack_workspaces WHERE status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

// ── Begin OAuth (admin) ───────────────────────────────────────────────────────
slackRouter.get("/install", requireAuth, requireAdminRole("super_admin"), async (c) => {
  const clientId = c.env.SLACK_CLIENT_ID;
  if (!clientId) return c.json({ error: "SLACK_CLIENT_ID not configured" }, 503);
  const sql = getDb(c.env.DATABASE_URL);
  const state = crypto.randomUUID();
  await sql`
    INSERT INTO slack_oauth_states (state, created_by, expires_at)
    VALUES (${state}, ${c.get("user").clerkId}, NOW() + INTERVAL '15 minutes')
  `;
  const url = getInstallUrl(clientId, redirectUri(c.env), state);
  return c.json({ url });
});

// ── OAuth callback (public) ───────────────────────────────────────────────────
slackRouter.get("/oauth/callback", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const code = c.req.query("code");
  const state = c.req.query("state");
  const dest = `${adminUrl(c.env)}/slack`;

  if (c.req.query("error")) return c.redirect(`${dest}?error=${encodeURIComponent(c.req.query("error")!)}`);
  if (!code || !state) return c.redirect(`${dest}?error=missing_params`);

  const stateRows = (await sql`
    SELECT state FROM slack_oauth_states WHERE state = ${state} AND expires_at > NOW() LIMIT 1
  `) as Array<{ state: string }>;
  if (!stateRows[0]) return c.redirect(`${dest}?error=invalid_state`);
  await sql`DELETE FROM slack_oauth_states WHERE state = ${state}`;

  const result = await exchangeOAuthCode(
    c.env.SLACK_CLIENT_ID ?? "",
    c.env.SLACK_CLIENT_SECRET ?? "",
    code,
    redirectUri(c.env),
  );
  if (!result.ok || !result.access_token || !result.team?.id) {
    logger.error("slack.oauth failed", undefined, { error: result.error });
    return c.redirect(`${dest}?error=${encodeURIComponent(result.error ?? "oauth_failed")}`);
  }

  await sql`
    INSERT INTO slack_workspaces (
      team_id, team_name, app_id, bot_user_id, bot_token, scope,
      authed_user_id, incoming_webhook_url, status
    ) VALUES (
      ${result.team.id}, ${result.team.name ?? null}, ${result.app_id ?? null},
      ${result.bot_user_id ?? null}, ${result.access_token}, ${result.scope ?? null},
      ${result.authed_user?.id ?? null}, ${result.incoming_webhook?.url ?? null}, 'active'
    )
    ON CONFLICT (team_id) DO UPDATE SET
      team_name = EXCLUDED.team_name, app_id = EXCLUDED.app_id,
      bot_user_id = EXCLUDED.bot_user_id, bot_token = EXCLUDED.bot_token,
      scope = EXCLUDED.scope, authed_user_id = EXCLUDED.authed_user_id,
      incoming_webhook_url = EXCLUDED.incoming_webhook_url,
      status = 'active', last_error = NULL, updated_at = NOW()
  `;
  return c.redirect(`${dest}?connected=1`);
});

// ── Events API (public, signature-verified) ───────────────────────────────────
slackRouter.post("/events", async (c) => {
  const raw = await c.req.text();
  const ok = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET ?? "",
    c.req.header("x-slack-request-timestamp") ?? null,
    c.req.header("x-slack-signature") ?? null,
    raw,
  );
  if (!ok) return c.json({ error: "bad signature" }, 401);

  const body = JSON.parse(raw) as { type?: string; challenge?: string; event?: { type?: string }; team_id?: string };
  if (body.type === "url_verification") return c.json({ challenge: body.challenge });

  if (body.event?.type === "app_uninstalled" || body.event?.type === "tokens_revoked") {
    const sql = getDb(c.env.DATABASE_URL);
    if (body.team_id) {
      await sql`UPDATE slack_workspaces SET status = 'revoked', updated_at = NOW() WHERE team_id = ${body.team_id}`;
    }
  }
  return c.json({ ok: true });
});

// ── Interactivity (public, signature-verified) ────────────────────────────────
slackRouter.post("/interactivity", async (c) => {
  const raw = await c.req.text();
  const ok = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET ?? "",
    c.req.header("x-slack-request-timestamp") ?? null,
    c.req.header("x-slack-signature") ?? null,
    raw,
  );
  if (!ok) return c.json({ error: "bad signature" }, 401);

  // Body is form-encoded with a JSON `payload` field.
  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") ?? "{}") as {
    type?: string;
    team?: { id?: string };
    user?: { id?: string };
    actions?: Array<{ action_id?: string; value?: string }>;
  };

  const action = payload.actions?.[0];
  if (!action || action.action_id === "open_in_sweepr") {
    return c.json({}); // nothing to do; URL buttons need no response
  }

  const sql = getDb(c.env.DATABASE_URL);
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;

  // Resolve the acting Slack user to a Sweepr user and verify permission.
  const wsRows = (await sql`
    SELECT id, bot_token FROM slack_workspaces WHERE team_id = ${teamId ?? ""} AND status = 'active' LIMIT 1
  `) as Array<{ id: string; bot_token: string }>;
  const ws = wsRows[0];
  let email: string | undefined;
  let clerkId: string | undefined;
  let isSuperAdmin = false;
  if (ws && slackUserId) {
    const info = await getUserInfo(ws.bot_token, slackUserId);
    email = info.user?.profile?.email;
    if (email) {
      if (isOwnerEmail(email, c.env)) {
        isSuperAdmin = true;
      }
      const u = (await sql`
        SELECT clerk_id, role, admin_role FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
      `) as Array<{ clerk_id: string; role: string; admin_role: string | null }>;
      if (u[0]) {
        clerkId = u[0].clerk_id;
        if (u[0].role === "super_admin" || u[0].admin_role === "super_admin") isSuperAdmin = true;
      }
    }
  }

  if (!isSuperAdmin || !clerkId) {
    return c.json({
      response_type: "ephemeral",
      replace_original: false,
      text: "Only a Sweepr Super Admin (linked to your Slack email) can take this action. Open the proposal in Sweepr to continue.",
    });
  }

  const proposalId = action.value ?? "";
  const actor = { clerkId, email };
  try {
    switch (action.action_id) {
      case "approve":
        await approve(sql, proposalId, actor);
        break;
      case "decline":
        await decline(sql, proposalId, actor, "Declined via Slack");
        break;
      case "join_collaboration":
        await joinCollaboration(sql, proposalId, actor);
        break;
      case "propose_modification":
        await proposeModification(sql, proposalId, actor, "Requested changes via Slack");
        break;
      default:
        return c.json({ response_type: "ephemeral", text: "Unsupported action." });
    }
  } catch (err) {
    if (err instanceof ApprovalError) {
      return c.json({ response_type: "ephemeral", replace_original: false, text: err.message });
    }
    logger.error("slack.interactivity failed", err, { action: action.action_id, proposalId });
    return c.json({ response_type: "ephemeral", replace_original: false, text: "Something went wrong handling that action." });
  }

  await updateProposalCard(sql, c.env, proposalId);
  logger.info("slack.interactivity", { action: action.action_id, proposalId, email });
  return c.json({
    response_type: "ephemeral",
    replace_original: false,
    text: `✅ "${action.action_id}" recorded. View in Sweepr: ${adminUrl(c.env)}/approvals/${proposalId}`,
  });
});

// ── Slash commands (public, signature-verified) ───────────────────────────────
slackRouter.post("/commands", async (c) => {
  const raw = await c.req.text();
  const ok = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET ?? "",
    c.req.header("x-slack-request-timestamp") ?? null,
    c.req.header("x-slack-signature") ?? null,
    raw,
  );
  if (!ok) return c.json({ error: "bad signature" }, 401);

  const params = new URLSearchParams(raw);
  const text = (params.get("text") ?? "").trim();
  const base = adminUrl(c.env);

  if (text === "approvals") {
    return c.json({
      response_type: "ephemeral",
      text: `Pending approvals: ${base}/approvals`,
    });
  }
  return c.json({
    response_type: "ephemeral",
    text: [
      "*Sweepr* — quick links:",
      `• Approvals: ${base}/approvals`,
      `• Admin dashboard: ${base}`,
      "Try `/sweepr approvals`.",
    ].join("\n"),
  });
});

// ── Admin management (requireAuth + super_admin) ──────────────────────────────
const adminGate = [requireAuth, requireAdminRole("super_admin")] as const;

slackRouter.get("/admin/status", ...adminGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const workspaces = (await sql`
    SELECT id, team_id, team_name, bot_user_id, scope, status, last_error, created_at, updated_at
    FROM slack_workspaces ORDER BY created_at DESC
  `) as Array<Record<string, unknown>>;
  const channels = (await sql`
    SELECT id, workspace_id, channel_id, channel_name, purpose, is_private, created_at
    FROM slack_channels ORDER BY purpose
  `) as Array<Record<string, unknown>>;
  return c.json({ connected: workspaces.length > 0, workspaces, channels });
});

slackRouter.post("/admin/disconnect/:id", ...adminGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  await sql`DELETE FROM slack_workspaces WHERE id = ${id}`;
  return c.json({ ok: true });
});

slackRouter.get("/admin/channels/:wsId", ...adminGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const wsId = c.req.param("wsId");
  const rows = (await sql`SELECT bot_token FROM slack_workspaces WHERE id = ${wsId} AND status = 'active' LIMIT 1`) as Array<{ bot_token: string }>;
  if (!rows[0]) return c.json({ error: "Workspace not found" }, 404);
  const list = await listChannels(rows[0].bot_token);
  if (!list.ok) return c.json({ error: list.error ?? "slack_error" }, 502);
  return c.json({ channels: (list.channels ?? []).map((ch) => ({ id: ch.id, name: ch.name, is_private: ch.is_private })) });
});

slackRouter.post(
  "/admin/channels",
  ...adminGate,
  zValidator(
    "json",
    z.object({
      workspaceId: z.string().uuid(),
      purpose: z.enum(["approvals", "admin", "operations", "finance", "it", "training", "custom"]),
      channelId: z.string().optional(),
      createName: z.string().optional(),
      isPrivate: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { workspaceId, purpose, channelId, createName, isPrivate } = c.req.valid("json");
    const wsRows = (await sql`SELECT bot_token FROM slack_workspaces WHERE id = ${workspaceId} AND status = 'active' LIMIT 1`) as Array<{ bot_token: string }>;
    if (!wsRows[0]) return c.json({ error: "Workspace not found" }, 404);

    let cid = channelId;
    let cname: string | undefined;
    let priv = isPrivate ?? purpose === "approvals";

    if (!cid && createName) {
      const created = await createChannel(wsRows[0].bot_token, createName, priv);
      if (!created.ok) return c.json({ error: created.error ?? "create_failed" }, 502);
      const ch = created.channel as { id?: string; name?: string } | undefined;
      cid = ch?.id;
      cname = ch?.name;
    }
    if (!cid) return c.json({ error: "channelId or createName required" }, 400);

    await sql`
      INSERT INTO slack_channels (workspace_id, channel_id, channel_name, purpose, is_private)
      VALUES (${workspaceId}, ${cid}, ${cname ?? null}, ${purpose}, ${priv})
      ON CONFLICT (workspace_id, channel_id)
      DO UPDATE SET purpose = EXCLUDED.purpose, channel_name = EXCLUDED.channel_name
    `;
    return c.json({ ok: true, channelId: cid });
  },
);

slackRouter.post(
  "/admin/test",
  ...adminGate,
  zValidator("json", z.object({ purpose: z.string().optional() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const ws = await activeWorkspace(sql);
    if (!ws) return c.json({ error: "No active Slack workspace" }, 400);
    const purpose = c.req.valid("json").purpose ?? "admin";
    const chRows = (await sql`
      SELECT channel_id FROM slack_channels
      WHERE workspace_id = ${ws.id as string} AND purpose = ${purpose} LIMIT 1
    `) as Array<{ channel_id: string }>;
    const channel = chRows[0]?.channel_id;
    if (!channel) return c.json({ error: `No channel mapped for "${purpose}"` }, 400);
    const res = await postMessage(ws.bot_token as string, channel, {
      text: "✅ Sweepr is connected to Slack. This is a test message.",
    });
    if (!res.ok) return c.json({ error: res.error ?? "post_failed" }, 502);
    return c.json({ ok: true });
  },
);
