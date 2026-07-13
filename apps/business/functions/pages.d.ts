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
 * Minimal Cloudflare Pages Functions typings. Deliberately local: the Pages
 * Functions here are dependency-free (Web Crypto + fetch only) and the base
 * tsconfig already provides Request/Response/crypto via the DOM lib, so
 * pulling in @cloudflare/workers-types (which conflicts with lib.dom) is
 * unnecessary. Mirrors the shapes documented at
 * https://developers.cloudflare.com/pages/functions/typescript/.
 */

interface PagesEventContext<Env = unknown, Params extends string = string, Data = Record<string, unknown>> {
  request: Request;
  env: Env;
  params: Record<Params, string | string[]>;
  data: Data;
  functionPath: string;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type PagesFunction<Env = unknown, Params extends string = string, Data = Record<string, unknown>> = (
  context: PagesEventContext<Env, Params, Data>
) => Response | Promise<Response>;
