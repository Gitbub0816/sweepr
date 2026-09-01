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
 * Shared MCP tool-call context type + error class. Split out from tools.ts
 * so promotionTools.ts (the promotions tool surface, merged into
 * TOOL_DEFS/callTool by tools.ts) can use the exact same shape without an
 * import cycle between the two tool-surface files.
 */
import type { Sql } from "../lib/db";
import type { Env } from "../types";

export interface ToolContext {
  sql: Sql;
  env: Env;
  adminEmail: string;
}

/** Thrown for a user-facing tool failure — surfaced to the LLM as
 *  `content: [{type:"text", text: message}], isError: true` rather than a
 *  generic internal-error message (see protocol.ts's tools/call handler). */
export class ToolError extends Error {}
