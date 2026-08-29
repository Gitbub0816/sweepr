/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Hand-rolled MCP streamable-HTTP transport: JSON-RPC 2.0 over POST in
 * single-response mode (plain application/json responses, no SSE — spec-
 * compliant for a non-streaming server, and more reliable on Workers than
 * the SDK's stream plumbing).
 */

import { TOOL_DEFS, callTool, logToolCall, ToolError, type ToolContext } from "./tools";
import { RESOURCE_DEFS, readResource } from "./resources";
import { PROMPT_DEFS, getPrompt } from "./prompts";
import { allowToolCall } from "../lib/rateLimit";

export const PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export interface McpHttpResult {
  status: 200 | 202 | 400;
  body: JsonRpcResponse | null;
}

/**
 * Handle one MCP POST body. `ctx` carries the authenticated admin identity
 * (verified before this is called).
 */
export async function handleMcpMessage(ctx: ToolContext, raw: unknown): Promise<McpHttpResult> {
  if (Array.isArray(raw)) {
    // Batch requests are optional in JSON-RPC servers; none of the target
    // clients send them.
    return { status: 400, body: err(null, -32600, "Batch requests are not supported") };
  }
  const req = raw as JsonRpcRequest;
  if (!req || typeof req !== "object" || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return { status: 400, body: err(null, -32600, "Invalid JSON-RPC request") };
  }

  // Notifications (no id) are accepted and produce no body.
  const isNotification = req.id === undefined;
  const id = req.id ?? null;
  const params = req.params ?? {};

  if (req.method.startsWith("notifications/")) {
    return { status: 202, body: null };
  }

  switch (req.method) {
    case "initialize":
      return {
        status: 200,
        body: ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: {
            name: "sweepr-pricing-sandbox",
            title: "Sweepr Pricing Sandbox",
            version: "0.1.0",
          },
          instructions:
            "Quarantined Sweepr pricing sandbox: read live pricing config, edit only your simulator config, run quote simulations, and emit an upload payload a human admin imports and publishes. No write path to live data. Start with the sweepr-pricing-assistant prompt or the sweepr://workflow resource.",
        }),
      };

    case "ping":
      return { status: 200, body: ok(id, {}) };

    case "tools/list":
      return { status: 200, body: ok(id, { tools: TOOL_DEFS }) };

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!TOOL_DEFS.some((t) => t.name === name)) {
        return { status: 200, body: err(id, -32602, `Unknown tool: ${name}`) };
      }
      if (!allowToolCall(ctx.adminEmail)) {
        return {
          status: 200,
          body: ok(id, {
            content: [
              { type: "text", text: "Rate limit exceeded (120 tool calls per 5 minutes). Slow down and retry shortly." },
            ],
            isError: true,
          }),
        };
      }
      try {
        const result = await callTool(ctx, name, args);
        await logToolCall(ctx, name, args, "ok");
        return {
          status: 200,
          body: ok(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          }),
        };
      } catch (e) {
        const message =
          e instanceof ToolError
            ? e.message
            : "Internal error while executing the tool. Try again; if it persists, tell the admin.";
        await logToolCall(ctx, name, args, "error", e instanceof Error ? e.message : String(e));
        return {
          status: 200,
          body: ok(id, { content: [{ type: "text", text: message }], isError: true }),
        };
      }
    }

    case "resources/list":
      return { status: 200, body: ok(id, { resources: RESOURCE_DEFS }) };

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      const res = readResource(uri);
      if (!res) return { status: 200, body: err(id, -32002, `Unknown resource: ${uri}`) };
      return {
        status: 200,
        body: ok(id, { contents: [{ uri, mimeType: res.mimeType, text: res.text }] }),
      };
    }

    case "prompts/list":
      return { status: 200, body: ok(id, { prompts: PROMPT_DEFS }) };

    case "prompts/get": {
      const name = typeof params.name === "string" ? params.name : "";
      const prompt = getPrompt(name);
      if (!prompt) return { status: 200, body: err(id, -32602, `Unknown prompt: ${name}`) };
      return { status: 200, body: ok(id, prompt) };
    }

    default:
      if (isNotification) return { status: 202, body: null };
      return { status: 200, body: err(id, -32601, `Method not found: ${req.method}`) };
  }
}
