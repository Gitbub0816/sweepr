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
import { recordError } from "../lib/errorLog";
import { isOwnerEmail } from "../lib/owner";
import {
  getInstallUrl,
  getUserConnectUrl,
  exchangeOAuthCode,
  verifySlackSignature,
  postMessage,
  listChannels,
  createChannel,
  getUserInfo,
  conversationsList,
  conversationsHistory,
  conversationsReplies,
  usersList,
  reactionsAdd,
  lookupUserByEmail,
  inviteUsers,
} from "../lib/slack";
import {
  approve,
  decline,
  joinCollaboration,
  proposeModification,
  ApprovalError,
} from "../lib/approvalEngine";
import { updateProposalCard, updatePricingCard } from "../lib/approvalNotify";
import {
  approve as pricingApprove,
  decline as pricingDecline,
  joinCollaboration as pricingJoin,
  proposeModification as pricingModify,
} from "../lib/pricingApproval";
import type { AppBindings } from "../types";

export const slackRouter = new Hono<AppBindings>();

// Role → which channel purposes that role can access.
// Empty array for super_admin = allow all (checked separately).
const PURPOSE_FOR_ROLE: Record<string, string[]> = {
  super_admin: [],
  it: ["it", "admin"],
  trainer: ["training", "admin"],
  ops: ["operations", "admin"],
  finance: ["finance", "admin"],
  admin: ["admin"],
};

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
    INSERT INTO slack_oauth_states (state, created_by, kind, expires_at)
    VALUES (${state}, ${c.get("user").clerkId}, 'install', NOW() + INTERVAL '15 minutes')
  `;
  const url = getInstallUrl(clientId, redirectUri(c.env), state);
  return c.json({ url });
});

// ── Connect personal Slack account (user token) ───────────────────────────────
slackRouter.get("/connect", requireAuth, requireAdminRole("super_admin"), async (c) => {
  const clientId = c.env.SLACK_CLIENT_ID;
  if (!clientId) return c.json({ error: "SLACK_CLIENT_ID not configured" }, 503);
  const sql = getDb(c.env.DATABASE_URL);
  const state = crypto.randomUUID();
  await sql`
    INSERT INTO slack_oauth_states (state, created_by, kind, expires_at)
    VALUES (${state}, ${c.get("user").clerkId}, 'connect', NOW() + INTERVAL '15 minutes')
  `;
  const url = getUserConnectUrl(clientId, redirectUri(c.env), state);
  return c.json({ url });
});

// ── OAuth callback (public) — handles both bot install and personal connect ────
slackRouter.get("/oauth/callback", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const code = c.req.query("code");
  const state = c.req.query("state");
  const dest = `${adminUrl(c.env)}/slack`;

  if (c.req.query("error")) return c.redirect(`${dest}?error=${encodeURIComponent(c.req.query("error")!)}`);
  if (!code || !state) return c.redirect(`${dest}?error=missing_params`);

  const stateRows = (await sql`
    SELECT state, kind, created_by FROM slack_oauth_states WHERE state = ${state} AND expires_at > NOW() LIMIT 1
  `) as Array<{ state: string; kind: string; created_by: string | null }>;
  if (!stateRows[0]) return c.redirect(`${dest}?error=invalid_state`);
  await sql`DELETE FROM slack_oauth_states WHERE state = ${state}`;
  const { kind, created_by } = stateRows[0];

  const result = await exchangeOAuthCode(
    c.env.SLACK_CLIENT_ID ?? "",
    c.env.SLACK_CLIENT_SECRET ?? "",
    code,
    redirectUri(c.env),
  );
  if (!result.ok || !result.team?.id) {
    logger.error("slack.oauth failed", undefined, { error: result.error });
    return c.redirect(`${dest}?error=${encodeURIComponent(result.error ?? "oauth_failed")}`);
  }

  if (kind === "connect") {
    // Personal connect: store the user (xoxp-) token for the installing admin.
    const uToken = result.authed_user?.access_token;
    const slackUserId = result.authed_user?.id;
    if (!uToken || !slackUserId) return c.redirect(`${dest}?error=no_user_token`);
    const wsRows = (await sql`SELECT id, bot_token FROM slack_workspaces WHERE team_id = ${result.team.id} AND status = 'active' LIMIT 1`) as Array<{ id: string; bot_token: string }>;
    const ws = wsRows[0];
    if (!ws) return c.redirect(`${dest}?error=workspace_not_connected`);
    const userRow = created_by
      ? ((await sql`SELECT id, email, COALESCE(admin_role, role, 'admin') AS effective_role FROM users WHERE clerk_id = ${created_by} LIMIT 1`) as Array<{ id: string; email: string; effective_role: string }>)[0]
      : undefined;
    await sql`
      INSERT INTO slack_user_links (workspace_id, slack_user_id, user_id, email, user_token, user_scopes, connected_at)
      VALUES (${ws.id}, ${slackUserId}, ${userRow?.id ?? null}, ${userRow?.email ?? null},
              ${uToken}, ${result.authed_user?.scope ?? null}, NOW())
      ON CONFLICT (workspace_id, slack_user_id) DO UPDATE SET
        user_id = EXCLUDED.user_id, email = EXCLUDED.email,
        user_token = EXCLUDED.user_token, user_scopes = EXCLUDED.user_scopes, connected_at = NOW()
    `;

    // Auto-invite the user to the channels their role entitles them to see.
    // Uses the BOT token (bot can invite users to channels it manages).
    try {
      const role = userRow?.effective_role ?? "admin";
      const isSuperAdmin = role === "super_admin" || (userRow?.email ? isOwnerEmail(userRow.email, c.env) : false);
      const channelRows = (await sql`
        SELECT channel_id, purpose FROM slack_channels WHERE workspace_id = ${ws.id}
      `) as Array<{ channel_id: string; purpose: string }>;
      const purposesForRole = PURPOSE_FOR_ROLE[role] ?? ["admin"];
      const entitled = channelRows.filter((ch) =>
        isSuperAdmin || purposesForRole.includes(ch.purpose),
      );
      for (const ch of entitled) {
        try {
          await inviteUsers(ws.bot_token, ch.channel_id, [slackUserId]);
        } catch { /* already_in_channel or can't invite — non-fatal */ }
      }
    } catch { /* non-fatal — don't block the redirect */ }

    return c.redirect(`${dest}?connected_user=1`);
  }

  // Bot install.
  if (!result.access_token) {
    return c.redirect(`${dest}?error=${encodeURIComponent(result.error ?? "oauth_failed")}`);
  }
  await sql`
    INSERT INTO slack_workspaces (
      team_id, team_name, app_id, bot_user_id, bot_token, scope,
      authed_user_id, incoming_webhook_url, installed_by, status
    ) VALUES (
      ${result.team.id}, ${result.team.name ?? null}, ${result.app_id ?? null},
      ${result.bot_user_id ?? null}, ${result.access_token}, ${result.scope ?? null},
      ${result.authed_user?.id ?? null}, ${result.incoming_webhook?.url ?? null},
      ${created_by ?? null}, 'active'
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

// ── Events API ────────────────────────────────────────────────────────────────
slackRouter.post("/events", async (c) => {
  const raw = await c.req.text();
  const body = JSON.parse(raw || "{}") as {
    type?: string;
    challenge?: string;
    event?: { type?: string };
    team_id?: string;
  };

  // Answer the URL-verification handshake immediately. It carries no action and
  // must succeed even before the signing secret is configured in Slack's UI.
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // All real events are signature-verified.
  const ok = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET ?? "",
    c.req.header("x-slack-request-timestamp") ?? null,
    c.req.header("x-slack-signature") ?? null,
    raw,
  );
  if (!ok) return c.json({ error: "bad signature" }, 401);

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

  // Pricing proposals are prefixed "pricing:"; fee proposals are bare.
  const rawValue = action.value ?? "";
  const isPricing = rawValue.startsWith("pricing:");
  const proposalId = isPricing ? rawValue.slice("pricing:".length) : rawValue;
  const actor = { clerkId, email };
  try {
    if (isPricing) {
      switch (action.action_id) {
        case "approve": await pricingApprove(sql, proposalId, actor); break;
        case "decline": await pricingDecline(sql, proposalId, actor, "Declined via Slack"); break;
        case "join_collaboration": await pricingJoin(sql, proposalId, actor); break;
        case "propose_modification": await pricingModify(sql, proposalId, actor, "Requested changes via Slack"); break;
        default: return c.json({ response_type: "ephemeral", text: "Unsupported action." });
      }
      await updatePricingCard(sql, c.env, proposalId);
      logger.info("slack.interactivity", { action: action.action_id, proposalId, domain: "pricing", email });
      return c.json({
        response_type: "ephemeral",
        replace_original: false,
        text: `✅ "${action.action_id}" recorded. View in Sweepr: ${adminUrl(c.env)}/pricing/approvals/${proposalId}`,
      });
    }
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
      purpose: z.enum(["approvals", "admin", "operations", "finance", "it", "training", "security", "custom"]),
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

// ── Embedded workspace (per-user Slack view) ──────────────────────────────────
const wsGate = [requireAuth, requireAdminRole()] as const;

async function userToken(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT sl.user_token FROM slack_user_links sl
    JOIN users u ON u.id = sl.user_id
    WHERE u.clerk_id = ${clerkId} AND sl.user_token IS NOT NULL
    ORDER BY sl.connected_at DESC NULLS LAST LIMIT 1
  `) as Array<{ user_token: string }>;
  return rows[0]?.user_token ?? null;
}

slackRouter.get("/workspace/me", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT sl.slack_user_id, sl.user_scopes, sl.connected_at, w.team_name
    FROM slack_user_links sl
    JOIN users u ON u.id = sl.user_id
    LEFT JOIN slack_workspaces w ON w.id = sl.workspace_id
    WHERE u.clerk_id = ${c.get("user").clerkId} AND sl.user_token IS NOT NULL
    ORDER BY sl.connected_at DESC NULLS LAST LIMIT 1
  `) as Array<Record<string, unknown>>;
  const wsActive = await activeWorkspace(sql);
  return c.json({
    workspaceConnected: !!wsActive,
    workspaceName: (wsActive?.team_name as string) ?? null,
    userConnected: !!rows[0],
    slackUserId: rows[0]?.slack_user_id ?? null,
    connectedAt: rows[0]?.connected_at ?? null,
  });
});

slackRouter.get("/workspace/channels", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const token = await userToken(sql, c.get("user").clerkId);
  if (!token) return c.json({ error: "Slack account not connected" }, 409);
  const list = await conversationsList(token);
  if (!list.ok) return c.json({ error: list.error ?? "slack_error" }, 502);
  const channels = ((list.channels ?? []) as Array<Record<string, unknown>>).map((ch) => ({
    id: ch.id as string,
    name: (ch.name as string) ?? null,
    is_private: !!ch.is_private,
    is_im: !!ch.is_im,
    is_mpim: !!ch.is_mpim,
    user: (ch.user as string) ?? null,
  }));
  return c.json({ channels });
});

// ── Role-filtered Sweepr channels (only provisioned channels the user may see) ─
// Returns channels from the slack_channels DB table, filtered by the current
// admin's role. super_admin sees all; role-specific admins see their channel +
// team-wide; all admins see team-wide.

slackRouter.get("/workspace/my-channels", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  // Resolve this user's effective role.
  const [u] = (await sql`
    SELECT COALESCE(admin_role, role, 'admin') AS effective_role
    FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1
  `) as Array<{ effective_role: string }>;
  const role = u?.effective_role ?? "admin";
  const isSuperAdmin = role === "super_admin" || isOwnerEmail(c.get("user").email ?? "", c.env);

  // Fetch provisioned channels.
  const ws = await activeWorkspace(sql);
  if (!ws) return c.json({ channels: [] });

  const allChannels = (await sql`
    SELECT channel_id, channel_name, purpose, is_private
    FROM slack_channels WHERE workspace_id = ${ws.id as string}
    ORDER BY purpose
  `) as Array<{ channel_id: string; channel_name: string | null; purpose: string; is_private: boolean }>;

  const allowed = isSuperAdmin
    ? allChannels
    : allChannels.filter((ch) => {
        const purposes = PURPOSE_FOR_ROLE[role] ?? ["admin"];
        return purposes.includes(ch.purpose);
      });

  return c.json({
    channels: allowed.map((ch) => ({
      id: ch.channel_id,
      name: ch.channel_name ?? ch.purpose,
      purpose: ch.purpose,
      is_private: ch.is_private,
      is_im: false,
      is_mpim: false,
    })),
  });
});

async function userMap(token: string): Promise<Record<string, { name: string; avatar: string }>> {
  const res = await usersList(token);
  const map: Record<string, { name: string; avatar: string }> = {};
  const members = (res.members ?? []) as Array<Record<string, unknown>>;
  for (const m of members) {
    const profile = (m.profile ?? {}) as Record<string, unknown>;
    map[m.id as string] = {
      name: (profile.display_name as string) || (profile.real_name as string) || (m.name as string) || (m.id as string),
      avatar: (profile.image_48 as string) ?? "",
    };
  }
  return map;
}

slackRouter.get("/workspace/history", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const channel = c.req.query("channel");
  if (!channel) return c.json({ error: "channel required" }, 400);

  // Use user token if available; bot token as fallback (bot is always in provisioned channels).
  const uToken = await userToken(sql, c.get("user").clerkId);
  const ws = await activeWorkspace(sql);
  const histToken = uToken ?? (ws?.bot_token as string | null);
  if (!histToken) return c.json({ error: "Slack not connected" }, 409);

  const [hist, users, cards] = await Promise.all([
    conversationsHistory(histToken, channel, 50),
    userMap(histToken),
    sql`SELECT message_ts, ref_id FROM slack_messages WHERE channel_id = ${channel} AND ref_type = 'fee_proposal'`,
  ]);
  if (!hist.ok) return c.json({ error: hist.error ?? "slack_error" }, 502);
  const cardRows = cards as Array<{ message_ts: string; ref_id: string }>;
  const cardMap = new Map(cardRows.map((r) => [r.message_ts, r.ref_id]));

  const messages = (((hist as Record<string, unknown>).messages ?? []) as Array<Record<string, unknown>>).map((m) => {
    const ts = m.ts as string;
    const author = users[m.user as string] ?? { name: (m.username as string) || "Sweepr", avatar: "" };
    return {
      ts,
      text: (m.text as string) ?? "",
      author: author.name,
      avatar: author.avatar,
      reply_count: (m.reply_count as number) ?? 0,
      thread_ts: (m.thread_ts as string) ?? null,
      reactions: ((m.reactions ?? []) as Array<{ name: string; count: number }>).map((r) => ({ name: r.name, count: r.count })),
      approvalProposalId: cardMap.get(ts) ?? null,
    };
  }).reverse();
  return c.json({ messages });
});

slackRouter.get("/workspace/replies", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const channel = c.req.query("channel");
  const ts = c.req.query("ts");
  if (!channel || !ts) return c.json({ error: "channel and ts required" }, 400);
  const uToken = await userToken(sql, c.get("user").clerkId);
  const ws = await activeWorkspace(sql);
  const replyToken = uToken ?? (ws?.bot_token as string | null);
  if (!replyToken) return c.json({ error: "Slack not connected" }, 409);
  const [res, users] = await Promise.all([conversationsReplies(replyToken, channel, ts), userMap(replyToken)]);
  if (!res.ok) return c.json({ error: res.error ?? "slack_error" }, 502);
  const messages = (((res as Record<string, unknown>).messages ?? []) as Array<Record<string, unknown>>).map((m) => {
    const author = users[m.user as string] ?? { name: (m.username as string) || "Sweepr", avatar: "" };
    return { ts: m.ts as string, text: (m.text as string) ?? "", author: author.name, avatar: author.avatar };
  });
  return c.json({ messages });
});

slackRouter.post(
  "/workspace/message",
  ...wsGate,
  zValidator("json", z.object({ channel: z.string(), text: z.string().min(1).max(4000), thread_ts: z.string().optional() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { channel, text, thread_ts } = c.req.valid("json");
    const clerkId = c.get("user").clerkId;

    // Try the user's personal token first so the message appears under their name.
    // Fall back to the bot token if: the user hasn't connected a personal account,
    // or if Slack rejects the token (e.g. not_in_channel for private channels).
    const uToken = await userToken(sql, clerkId);
    const ws = await activeWorkspace(sql);

    let res: Awaited<ReturnType<typeof postMessage>> | null = null;
    if (uToken) {
      res = await postMessage(uToken, channel, { text, thread_ts });
      if (!res.ok && (res.error === "not_in_channel" || res.error === "channel_not_found" || res.error === "invalid_auth" || res.error === "token_revoked")) {
        // User token can't reach this channel — fall through to bot token.
        res = null;
      }
    }
    if (!res && ws?.bot_token) {
      res = await postMessage(ws.bot_token as string, channel, { text, thread_ts });
    }
    if (!res || !res.ok) {
      const errMsg = res?.error ?? "post_failed";
      logger.error("slack.workspace.message failed", undefined, { channel, error: errMsg });
      await recordError(sql, {
        source: "server",
        app: "admin",
        level: "error",
        message: `Slack message failed: ${errMsg}`,
        path: "/slack/workspace/message",
        method: "POST",
        statusCode: 502,
        clerkId,
        context: { channel, slackError: errMsg },
      });
      return c.json({ error: errMsg }, 502);
    }
    return c.json({ ok: true, ts: res.ts });
  },
);

slackRouter.post(
  "/workspace/react",
  ...wsGate,
  zValidator("json", z.object({ channel: z.string(), ts: z.string(), name: z.string() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const uToken = await userToken(sql, c.get("user").clerkId);
    const ws = await activeWorkspace(sql);
    const reactToken = uToken ?? (ws?.bot_token as string | null);
    if (!reactToken) return c.json({ error: "Slack not connected" }, 409);
    const { channel, ts, name } = c.req.valid("json");
    const res = await reactionsAdd(reactToken, channel, ts, name);
    if (!res.ok) return c.json({ error: res.error ?? "react_failed" }, 502);
    return c.json({ ok: true });
  },
);

slackRouter.post("/workspace/disconnect-user", ...wsGate, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    UPDATE slack_user_links SET user_token = NULL, user_scopes = NULL, connected_at = NULL
    WHERE user_id = (SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1)
  `;
  return c.json({ ok: true });
});

// ── Provision default org channels + role-based access ────────────────────────
// Team-Wide is public (everyone). Role channels are PRIVATE so only invited
// members can see them. Super Admins are in every channel.
const DEFAULT_CHANNELS: Array<{ name: string; purpose: string; private: boolean; roles: string[] | "all" }> = [
  { name: "team-wide", purpose: "admin", private: false, roles: "all" },
  { name: "approvals", purpose: "approvals", private: true, roles: ["super_admin"] },
  { name: "operations", purpose: "operations", private: true, roles: ["super_admin", "ops"] },
  { name: "finance", purpose: "finance", private: true, roles: ["super_admin", "finance"] },
  { name: "it", purpose: "it", private: true, roles: ["super_admin", "it"] },
  { name: "training", purpose: "training", private: true, roles: ["super_admin", "trainer"] },
  { name: "security", purpose: "security", private: true, roles: ["super_admin"] },
];

slackRouter.post("/admin/provision-defaults", requireAuth, requireAdminRole("super_admin"), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ws = await activeWorkspace(sql);
  if (!ws) return c.json({ error: "No active Slack workspace" }, 400);
  const token = ws.bot_token as string;
  const wsId = ws.id as string;

  // Resolve admins → Slack user ids (by email).
  const admins = (await sql`
    SELECT email, COALESCE(admin_role, role) AS role FROM users
    WHERE role IN ('admin','super_admin') AND email IS NOT NULL
  `) as Array<{ email: string; role: string }>;
  const slackIdByEmail = new Map<string, string>();
  for (const a of admins) {
    try {
      const r = await lookupUserByEmail(token, a.email);
      if (r.ok && r.user?.id) slackIdByEmail.set(a.email.toLowerCase(), r.user.id);
    } catch { /* not in workspace */ }
  }

  // Existing live channels (to reuse instead of duplicating).
  const live = await conversationsList(token);
  const liveByName = new Map<string, { id: string }>();
  for (const ch of (live.channels ?? [])) liveByName.set((ch.name ?? "").toLowerCase(), { id: ch.id });

  const results: Array<{ name: string; channel_id: string | null; invited: number; error?: string }> = [];

  for (const spec of DEFAULT_CHANNELS) {
    let channelId = liveByName.get(spec.name)?.id ?? null;
    if (!channelId) {
      const created = await createChannel(token, spec.name, spec.private);
      if (created.ok) {
        const ch = created.channel as { id?: string } | undefined;
        channelId = ch?.id ?? null;
      } else if (created.error === "name_taken") {
        // Re-list and map.
        const again = await conversationsList(token);
        channelId = (again.channels ?? []).find((ch) => (ch.name ?? "").toLowerCase() === spec.name)?.id ?? null;
      } else {
        results.push({ name: spec.name, channel_id: null, invited: 0, error: created.error ?? "create_failed" });
        continue;
      }
    }
    if (!channelId) { results.push({ name: spec.name, channel_id: null, invited: 0, error: "no_channel" }); continue; }

    await sql`
      INSERT INTO slack_channels (workspace_id, channel_id, channel_name, purpose, is_private)
      VALUES (${wsId}, ${channelId}, ${spec.name}, ${spec.purpose}, ${spec.private})
      ON CONFLICT (workspace_id, channel_id) DO UPDATE SET purpose = EXCLUDED.purpose, channel_name = EXCLUDED.channel_name
    `;

    // Determine members to invite.
    const eligible = admins.filter((a) =>
      spec.roles === "all" || spec.roles.includes(a.role) || a.role === "super_admin",
    );
    const ids = [...new Set(eligible.map((a) => slackIdByEmail.get(a.email.toLowerCase())).filter(Boolean) as string[])];
    let invited = 0;
    if (ids.length) {
      const inv = await inviteUsers(token, channelId, ids);
      if (inv.ok || inv.error === "already_in_channel") invited = ids.length;
    }
    results.push({ name: spec.name, channel_id: channelId, invited });
  }

  return c.json({ ok: true, results, resolvedAdmins: slackIdByEmail.size, totalAdmins: admins.length });
});
