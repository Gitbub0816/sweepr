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
 * @sweepr/quote-engine — the pure Pricing v2 quote engine.
 *
 * Extracted from apps/api/src/lib/quoteEngine so the engine can be shared by
 * the API worker and the MCP pricing-sandbox worker (apps/mcp) without
 * duplicating money logic. Everything here is a pure function of
 * (config, input): no DB, no env, no side effects. The DB-bound pieces
 * (quoteAndPersist, the booking adapter) remain in the API.
 */

export * from "./types";
export * from "./engine";
export * from "./inference";
export * from "./validate";
export * from "./defaults";
