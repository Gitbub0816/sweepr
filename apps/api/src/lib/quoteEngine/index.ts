/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// The pure engine (types, computeQuoteV2, inference, validation, cold-start
// defaults) now lives in the shared @sweepr/quote-engine package so the MCP
// pricing-sandbox worker can simulate with the exact same money logic.
// Re-exported here so every existing `from "../lib/quoteEngine"` import keeps
// working unchanged. The DB-bound pieces stay local to the API.
export * from "@sweepr/quote-engine";
