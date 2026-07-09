# Sweepr

```text
Copyright © 2026–Present ClearKey Solutions, LLC.
All Rights Reserved.

CONFIDENTIAL

This repository contains proprietary and confidential software, trade secrets,
documentation, and intellectual property owned exclusively by ClearKey Solutions, LLC.

Repository access is provided solely for authorized business purposes and does not
grant any ownership, license, or intellectual property rights except as expressly
authorized in writing by ClearKey Solutions, LLC.

Unauthorized copying, disclosure, modification, distribution, reverse engineering,
or use of any portion of this repository is strictly prohibited.

All rights not expressly granted are reserved.
```

Sweepr is a residential-cleaning marketplace operated by ClearKey Solutions, LLC.
This monorepo (pnpm workspaces + Turbo) contains:

| Path | What it is |
| --- | --- |
| `apps/marketing` | Public marketing site (getsweepr.com) |
| `apps/customer` | Customer booking app (app.getsweepr.com) |
| `apps/cleaner` | Cleaner app + onboarding (clean.getsweepr.com; also dashboard.getsweepr.com) |
| `apps/admin` | Internal admin console (admin.getsweepr.com) |
| `apps/api` | Hono API on Cloudflare Workers (api.getsweepr.com) |
| `apps/legal` | Legal document site (legal.getsweepr.com) |
| `apps/status` | Public status page (status.getsweepr.com) |
| `apps/service` | Service demo surface (service.getsweepr.com) |
| `packages/db` | Neon Postgres migrations + consolidated schema |
| `packages/ui`, `packages/utils`, `packages/types` | Shared libraries |

## Development

```bash
pnpm install
npx turbo run typecheck        # all workspaces
npx vitest run apps/api/tests  # API test suite
node packages/db/build-schema.mjs && node packages/db/verify-schema.mjs
```

Database migrations live in `packages/db/src/migrations/` and are applied by
`packages/db/migrate.mjs` in CI on push to `main`.

See `LICENSE.md` and `NOTICE.md` for ownership and licensing terms.
