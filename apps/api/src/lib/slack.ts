/**
 * Slack integration helpers.
 *
 * Sweepr is the source of truth. These helpers handle OAuth, request-signature
 * verification, and the Slack Web API calls we need (posting/updating messages,
 * listing/creating channels, resolving users). Block Kit builders for approval
 * cards live here so the Approval Engine can reuse them.
 */

const SLACK_API = "https://slack.com/api";

/** Bot scopes requested during OAuth. Keep in sync with the Slack app manifest. */
export const DEFAULT_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "channels:history",
  "channels:join",
  "channels:manage",
  "groups:read",
  "groups:history",
  "groups:write",
  "users:read",
  "users:read.email",
  "commands",
  "im:write",
].join(",");

export interface SlackOAuthResult {
  ok: boolean;
  error?: string;
  team?: { id: string; name?: string };
  app_id?: string;
  bot_user_id?: string;
  access_token?: string; // xoxb- bot token
  scope?: string;
  authed_user?: { id: string; access_token?: string; scope?: string };
  incoming_webhook?: { url?: string; channel_id?: string; channel?: string };
}

/** User scopes requested when an admin connects their personal Slack account. */
export const DEFAULT_USER_SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
  "chat:write",
  "reactions:read",
  "reactions:write",
  "users:read",
].join(",");

/** Build the Slack "Add to Slack" / install URL (bot install). */
export function getInstallUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string = DEFAULT_BOT_SCOPES,
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${p.toString()}`;
}

/** Build a personal-connect URL requesting a user token (xoxp-). */
export function getUserConnectUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  userScopes: string = DEFAULT_USER_SCOPES,
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    user_scope: userScopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${p.toString()}`;
}

/** Exchange an OAuth `code` for workspace tokens. */
export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<SlackOAuthResult> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await res.json()) as SlackOAuthResult;
}

/**
 * Verify an inbound Slack request signature (v0 scheme).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signingSecret || !timestamp || !signature) return false;
  // Reject requests older than 5 minutes (replay protection).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `v0=${hex}`;
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string | { id?: string; name?: string };
  channels?: Array<{ id: string; name: string; is_private?: boolean; is_archived?: boolean }>;
  user?: { id: string; profile?: { email?: string; real_name?: string } };
  [k: string]: unknown;
}

/** Low-level Slack Web API call with a bot token. */
export async function slackApi(
  method: string,
  botToken: string,
  payload: Record<string, unknown>,
): Promise<SlackApiResponse> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as SlackApiResponse;
}

export async function postMessage(
  botToken: string,
  channel: string,
  opts: { text: string; blocks?: unknown[]; thread_ts?: string },
): Promise<SlackApiResponse> {
  return slackApi("chat.postMessage", botToken, {
    channel,
    text: opts.text,
    blocks: opts.blocks,
    thread_ts: opts.thread_ts,
  });
}

export async function updateMessage(
  botToken: string,
  channel: string,
  ts: string,
  opts: { text: string; blocks?: unknown[] },
): Promise<SlackApiResponse> {
  return slackApi("chat.update", botToken, {
    channel,
    ts,
    text: opts.text,
    blocks: opts.blocks,
  });
}

export async function listChannels(botToken: string): Promise<SlackApiResponse> {
  return slackApi("conversations.list", botToken, {
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 200,
  });
}

export async function createChannel(
  botToken: string,
  name: string,
  isPrivate: boolean,
): Promise<SlackApiResponse> {
  return slackApi("conversations.create", botToken, {
    name: name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 80),
    is_private: isPrivate,
  });
}

export async function lookupUserByEmail(
  botToken: string,
  email: string,
): Promise<SlackApiResponse> {
  return slackApi("users.lookupByEmail", botToken, { email });
}

export async function conversationsJoin(
  botToken: string,
  channel: string,
): Promise<SlackApiResponse> {
  return slackApi("conversations.join", botToken, { channel });
}

export async function inviteUsers(
  botToken: string,
  channel: string,
  slackUserIds: string[],
): Promise<SlackApiResponse> {
  if (slackUserIds.length === 0) return { ok: true };
  return slackApi("conversations.invite", botToken, { channel, users: slackUserIds.join(",") });
}

export async function getUserInfo(
  botToken: string,
  slackUserId: string,
): Promise<SlackApiResponse> {
  // users.info uses GET with query params; do it inline.
  const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(slackUserId)}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  return (await res.json()) as SlackApiResponse;
}

// ── Embedded-workspace reads (use a user token where possible) ────────────────

export async function conversationsList(token: string): Promise<SlackApiResponse> {
  return slackApi("conversations.list", token, {
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
    limit: 200,
  });
}

export async function conversationsHistory(
  token: string,
  channel: string,
  limit = 50,
): Promise<SlackApiResponse> {
  return slackApi("conversations.history", token, { channel, limit });
}

export async function conversationsReplies(
  token: string,
  channel: string,
  ts: string,
): Promise<SlackApiResponse> {
  return slackApi("conversations.replies", token, { channel, ts, limit: 100 });
}

export async function usersList(token: string): Promise<SlackApiResponse> {
  return slackApi("users.list", token, { limit: 500 });
}

export async function reactionsAdd(
  token: string,
  channel: string,
  ts: string,
  name: string,
): Promise<SlackApiResponse> {
  return slackApi("reactions.add", token, { channel, timestamp: ts, name });
}

// ── Block Kit builders ───────────────────────────────────────────────────────

/**
 * Interactive approval card. The Approval Engine passes a proposal summary and
 * the button `action_id`s carry the proposal id so interactivity can route back.
 */
export function approvalCardBlocks(p: {
  proposalId: string;
  title: string;
  kind: string; // "Fee change" | "Pricing change"
  feeType?: string;
  affectedParty?: string;
  proposer: string;
  status: string;
  proposedEffectiveAt?: string;
  responseDeadline?: string;
  adminUrl: string;
  domain?: "fee" | "pricing";
}): unknown[] {
  // Interactivity routes by action value; pricing proposals are prefixed so the
  // handler dispatches to the correct engine. Fee proposals stay bare.
  const value = p.domain === "pricing" ? `pricing:${p.proposalId}` : p.proposalId;
  const openPath = p.domain === "pricing" ? "pricing/approvals" : "approvals";
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `${p.kind}: ${p.title}`.slice(0, 150) },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Proposed by:*\n${p.proposer}` },
        { type: "mrkdwn", text: `*Status:*\n${p.status}` },
        ...(p.feeType ? [{ type: "mrkdwn", text: `*Fee type:*\n${p.feeType}` }] : []),
        ...(p.affectedParty ? [{ type: "mrkdwn", text: `*Affected:*\n${p.affectedParty}` }] : []),
        ...(p.proposedEffectiveAt
          ? [{ type: "mrkdwn", text: `*Proposed effective:*\n${p.proposedEffectiveAt}` }]
          : []),
        ...(p.responseDeadline
          ? [{ type: "mrkdwn", text: `*Responds by:*\n${p.responseDeadline}` }]
          : []),
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "This action link reflects live Sweepr state. Sweepr is the source of truth.",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "approve", value },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Decline" }, action_id: "decline", value },
        { type: "button", text: { type: "plain_text", text: "Request Changes" }, action_id: "propose_modification", value },
        { type: "button", text: { type: "plain_text", text: "Join Collaboration" }, action_id: "join_collaboration", value },
        { type: "button", url: `${p.adminUrl}/${openPath}/${p.proposalId}`, text: { type: "plain_text", text: "Open in Sweepr" }, action_id: "open_in_sweepr" },
      ],
    },
  ];
}
