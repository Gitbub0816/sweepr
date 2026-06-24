# 10 · Engineering & Architecture

## The stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React + TypeScript + Tailwind (Vite) |
| Backend | Hono on **Cloudflare Workers** |
| Database | **Neon Postgres** via `@neondatabase/serverless` (tagged-template SQL) |
| Auth | **Clerk** |
| Object storage | **Cloudflare R2** (migrating from Firebase Storage — see below) |
| Video | **Cloudflare Stream** (training videos) |
| Email | **MailerSend** (templates + bulk) |
| Maps | **Mapbox GL** (shared `getMapStyle` in `@sweepr/ui`) |
| Identity verification | **Didit** (hosted) |
| Background checks | **Checkr** |
| Payments | **Stripe** |
| Comms masking | Twilio / Telnyx / Plivo |

## Repository layout

```text
apps/
  marketing  customer  cleaner  admin  status  legal   (React apps)
  api                                                   (Cloudflare Worker, Hono)
packages/
  ui      shared components, AppShell, map styles
  utils   pricing, storage helpers
  db      schema, migrations (NNN_*.sql), typed query helpers
docs/   manuals/   scripts/
```

## Database & migrations

- Migrations live in `packages/db/src/migrations/` named `NNN_description.sql` and
  are applied in order. Current head: `010_service_areas.sql`.
- Use **tagged-template SQL** via the `getDb()` helper; never string-concatenate
  user input.
- `CREATE UNIQUE INDEX ... ON t (expr)` for expression-based uniqueness — inline
  `UNIQUE(col, expr)` in `CREATE TABLE` is invalid Postgres.

## Auth & roles

Two role sources are kept in sync:

- **Clerk `publicMetadata.role`** — read by frontends (e.g. `AdminGuard`) from the
  JWT.
- **DB `users.role`** — enforced by the API (`requireAdmin`).

They can diverge when a user is seeded directly in SQL. The invite-accept flow
syncs automatically; for manual seeds, call **`POST /admin/invites/sync-role`**
(reads DB role → writes Clerk `publicMetadata`). All role grants SHOULD go through
the invite flow so they sync by default.

## Secrets & configuration

| Kind | Where | Examples |
|------|-------|----------|
| Build-time (baked into client) | **GitHub secrets** | `VITE_*` (e.g. `VITE_MAPBOX_*`, Clerk publishable key) |
| Runtime (server only) | **Cloudflare Worker secrets** | `DATABASE_URL`, `CLERK_SECRET_KEY`, `MAILERSEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (raw JSON) |

> Never expose runtime secrets to the frontend. Didit credentials in particular
> stay server-side; the client only receives a hosted URL.

## Object storage — Firebase → Cloudflare R2 (in progress)

**Today:** uploads use signed URLs minted from a Firebase service account
(`apps/api/src/routes/storage.ts` → `apps/api/src/lib/firebase.ts`). The signer is
currently a **stub** and must be replaced before production.

**Direction:** object storage is **moving to Cloudflare R2** to consolidate on
Cloudflare (alongside Workers + Stream), simplify credentials, and reduce cost.
R2 is the target for:

- Cleaner avatars and booking before/after/security photos.
- Insurance document uploads.
- Training images, PDFs, attachments, and certificates.

Planned shape: the API issues **R2 presigned PUT URLs** (S3-compatible) for direct
client upload, with reads served from a public/bucket-bound domain or signed GET.
Object key conventions mirror today's layout:

```text
avatars/{refId}/{timestamp}-{fileName}
bookings/{refId}/{timestamp}-{fileName}
insurance/{cleanerId}/{timestamp}-{fileName}
training/{courseId}/...
```

Allowed content types and size caps (`MAX_UPLOAD_BYTES`) carry over from the
current `storage` route. Videos never go in R2 or Postgres — they live in
**Cloudflare Stream**, with only references stored.

## Email

`apps/api/src/lib/mailer.ts` wraps MailerSend. Transactional templates are
centralized in `TEMPLATES`:

| Template | ID | Variables |
|----------|-----|-----------|
| Newsletter confirm | `x2p034732j9gzdrn` | (none) |
| Subscribed updates | `jpzkmgq5v0ng059v` | `subscriber_email` |
| Waitlist | `3z0vklo5wo747qrx` | `waitlist_status`, `subscriber_email`, `service_area` |
| Status update | `yzkq3403wrx4d796` | `status_intro`, `current_status`, `service_area`, `updated_at`, `status_body`, `status_page_url`, `unsubscribe_url` |

Sends use `template_id` + `personalization[].data`; raw sends use `html`. Sender
domain (`hello@getsweepr.com`) must be verified in MailerSend.

## Maps

All maps use the shared `getMapStyle(isDark)` from `@sweepr/ui`:
**3D Faded – Day** (light) and **3D Standard – Dusk** (dark). Mapbox Standard
style config (`lightPreset`, `colorTheme`) is applied via `setConfigProperty`
after `style.load`, not at init.

## Frontend resilience notes

- **WebGL:** the marketing hero (React Three Fiber) listens for
  `webglcontextlost` and falls back to a static gradient to avoid console flooding
  on GPU context loss.
- **Feature flags:** `site_settings` (e.g. `prelaunch_pricing`,
  `prelaunch_cleaner`, `prelaunch_customer`) are fetched from `/status` so
  behavior can change without a deploy.

## Conventions

- Match surrounding code style; prefer correct and boring over clever.
- Independent work goes on the assigned feature branch; PRs are squash-merged.
- The handbook is updated in the same PR as the behavior it documents.

---

[← Data, Privacy & Compliance](./09-data-privacy-compliance.md) · [Back to index](./README.md) · [Next: Policies & Conduct →](./11-policies-and-conduct.md)
