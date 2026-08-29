<!--
Copyright © 2026–Present ClearKey Solutions, LLC.
Proprietary & Confidential. Internal Use Only.
-->

# Seam / Smart Entry seam audit

Read-only audit. Every claim is grounded to `file:line`. Nothing was modified.

Scope: the existing Seam smart-lock ("Smart Entry") integration, whether it is
wired up correctly on the Sweepr side, feasibility of linking Airbnb → Seam
programmatically with a Sweepr-native UI, and a full inventory of current
Smart-Entry UI surfaces.

---

## 1. Current Seam integration

### 1.1 How Seam is called

- **Raw HTTP, not the Node SDK.** `apps/api/src/lib/seam.ts:21` targets
  `https://connect.getseam.com`; `seamFetch` (`seam.ts:34-48`) is a thin `fetch`
  wrapper — deliberate, so the Node SDK is not pulled into the Workers runtime
  (`seam.ts:11-19`).
- **Auth:** `Authorization: Bearer ${apiKey}` (`seam.ts:36-40`). `apiKey` is
  `env.SEAM_API_KEY`, injected at every call site via `makeSeam(env.SEAM_API_KEY)`
  and never sent to any client (`seam.ts:14-15`). Good — server-side only.
- **All calls are POST** (`seam.ts:35`), which matches Seam's RPC-style
  `connect.getseam.com/*/*` action endpoints.
- **Error model:** non-2xx → `SeamError` with status + parsed body
  (`seam.ts:23-32, 44-46`). Callers wrap in try/catch and `logger.error/warn`
  (e.g. `smartEntry.ts:209-211`, `cleanerAccess.ts:199-211`).

### 1.2 Seam resources used

The integration is built on Seam's **Access Grants** primitive (its currently
recommended model), not the older bare `access_codes` API. Methods on
`makeSeam` (`seam.ts:65-145`):

| Method | Seam endpoint | Purpose |
| --- | --- | --- |
| `listDevices` | `POST /devices/list` (`seam.ts:69-74`) | enumerate locks, optional `connected_account_id` filter |
| `createUserIdentity` | `POST /user_identities/create` (`seam.ts:78-84`) | per-booking cleaner identity |
| `createCodeGrant` | `POST /access_grants/create` (`seam.ts:91-108`) | time-bound grant, `requested_access_methods:[{mode:"code"}]`, `starts_at`/`ends_at` |
| `getIssuedCode` | `POST /access_methods/list` (`seam.ts:112-118`) | fetch issued PIN at reveal time |
| `unlockDoor` | `POST /locks/unlock_door` (`seam.ts:121-128`) | returns `action_attempt_id` |
| `lockDoor` | `POST /locks/lock_door` (`seam.ts:131-138`) | |
| `deleteAccessGrant` | `POST /access_grants/delete` (`seam.ts:141-143`) | revocation |

- **Connected accounts:** NOT used programmatically. `listDevices` is called with
  no `connected_account_id` (`smartEntry route /devices/sync`,
  `smartEntry.ts:101`), i.e. it lists **every device in the whole Seam
  workspace** and attributes them all to whichever customer hit the sync
  endpoint. There is no per-customer `connected_account` scoping, and no
  `connect_webview` flow anywhere in the codebase (see §1.6 gaps).
- The DB is *designed* for connected accounts —
  `smart_lock_connections.provider_account_reference` "e.g. Seam connected_account
  id" and `encrypted_provider_token_reference` (`089_...sql:49-50`) — but nothing
  populates them; `/devices/sync` inserts a bare `provider='seam'` connection row
  with no account reference (`smartEntry.ts:85-90`).

### 1.3 Lifecycle glue (`lib/smartEntry.ts`)

- `computeAccessWindow` (`smartEntry.ts:28-37`): window =
  `scheduledAt − accessStartOffset` … `scheduledAt + duration + accessEndOffset`,
  all offsets from config (defaults 15 / 30 min, `smartEntryConfig.ts:69-70`).
- `setBookingAccessMethod` (`smartEntry.ts:65-133`): upserts
  `booking_access_authorizations` (unique on `booking_id`,
  `ON CONFLICT (booking_id) DO UPDATE`, `smartEntry.ts:99-112`); stores an
  envelope-encrypted credential row only for `keypad_code`/`lockbox`/`other`
  (`smartEntry.ts:117-130`). Does **not** contact Seam.
- `provisionSmartEntry` (`smartEntry.ts:140-212`): the only place that creates a
  Seam grant. Creates a user identity, then `createCodeGrant`, then inserts a
  `booking_access_credentials` row with `provider_credential_reference =
  access_grant_id` and `credential_status='active'` (`smartEntry.ts:176-194`).
- `revokeSmartEntry` (`smartEntry.ts:219-247`): reads provider grant refs first,
  flips DB rows via `revokeBookingAccess`, then `deleteAccessGrant` for each
  (`smartEntry.ts:226-246`). Idempotent, safe when Seam unconfigured.

### 1.4 Authorization core (`lib/homeAccess.ts`) — strong

`authorizeHomeAccess` (`homeAccess.ts:122-244`) runs a fresh server-side decision
on every reveal/unlock/lock. Checks, in order: feature flag; cleaner is the
assigned cleaner (`homeAccess.ts:182-184`); cleaner `approved` + `didit_status
approved` + background-check eligible (`homeAccess.ts:185-187, 111-115`); booking
not cancelled/completed (`:190-192`); `day_status` in `arrived`/`in_progress`
(checked-in, `:193-195`); authorization exists, method valid, not revoked,
customer authorized (`:198-203`); server-controlled time window (`:206-209`);
fresh accurate location inside geofence via haversine (`:212-221`); recent reauth
if `requireBiometric` (`:224-230`); server-counted rate limit from the immutable
event log (`:233-234, 256-280`). Every denial writes a `home_access_events` row
(`:162-177`). This is the security core and it is well-built.

### 1.5 Webhooks — **not implemented**

- `SEAM_WEBHOOK_SECRET` is typed (`types.ts:89`) and synced at deploy
  (`deploy.yml:139,147`) but **no route consumes it**. `grep` across the API
  finds zero webhook handlers, zero signature verification for Seam.
- Consequence: device online/offline, `access_code`/`access_grant` issued/failed,
  and `action_attempt` completion events are never received. The code compensates
  by *polling* Seam at reveal time (`getIssuedCode`, `cleanerAccess.ts:110-111`),
  and by treating the credential as `'active'` optimistically at create time
  (`smartEntry.ts:191-192`) even though Seam may not have programmed the PIN yet.
- This exact gap is already flagged internally:
  `context/committee/code-infra.md:3` — "SEAM_WEBHOOK_SECRET synced + typed but
  no route verifies Seam webhooks. Wire verifier or drop."

### 1.6 Encryption & claim-then-act patterns

- **Envelope encryption** (`lib/crypto.ts`): AES-GCM, key = SHA-256 of
  `ACCESS_CODE_ENCRYPTION_KEY` (`crypto.ts:26-47`). In prod a missing key is a
  hard error — never falls back to plaintext (`crypto.ts:63-80`). Customer PINs
  are encrypted at rest (`smartEntry.ts:117-129`); Seam-issued PINs are **never
  persisted** — fetched on demand at reveal (`cleanerAccess.ts:110-111`) and
  returned `Cache-Control: no-store` (`cleanerAccess.ts:136-137`). Events never
  carry a credential (`homeAccess.ts:75`, `089_...sql:142`).
- **Claim-then-act for money** is followed in billing: conditional
  `UPDATE … WHERE smart_entry_fee_cents = 0 RETURNING` before the ledger/Stripe
  call, rolled back on failure (`smartEntryBilling.ts:56-77`); same for the
  Sweepr+ discount (`:106-127`).
- **Provider revocation ordering** is correct: collect grant refs *before* the DB
  status flip (`smartEntry.ts:226-235`), so a partial failure can't orphan a live
  PIN silently.

### 1.7 Problems found

1. **[High] No customer device-connect flow → Smart Entry PINs are never
   actually provisioned.** `provisionSmartEntry` early-returns unless the
   authorization has a `lock_device_id` whose device has a
   `provider_device_reference` (`smartEntry.ts:162`). But the customer UI
   (`SmartEntryCard.tsx`) never sends a `deviceId` and there is **no UI that
   calls `/smart-entry/devices` or `/smart-entry/devices/sync`** (grep: zero
   frontend references). So in practice `smart_entry` bookings get an
   authorization + a $5 fee but **no Seam grant and no credential** — the cleaner
   reveal returns `no_credential` (`cleanerAccess.ts:103`). This is the biggest
   functional hole.
2. **[High] `/devices/sync` has no per-customer scoping.** It lists all workspace
   devices with no `connected_account_id` and attributes them to the caller
   (`smartEntry.ts:100-101`), and the upsert relies on `ON CONFLICT DO NOTHING`
   with no documented unique constraint on
   `(connection_id, provider_device_reference)` — so cross-customer device
   leakage and duplicate rows are both possible once more than one lock exists in
   the workspace. Needs connected-account isolation (§3).
3. **[Med] Optimistic `'active'` credential status.** `createCodeGrant` returns
   before Seam has programmed the PIN; the row is written `'active'`
   (`smartEntry.ts:191-192`) with no webhook to confirm `access_method` issuance.
   Reveal masks this via `credential_not_ready` 409 (`cleanerAccess.ts:117`), but
   there is no retry/backfill loop.
4. **[Med] `deviceId` ownership is not verified on PUT.** `PUT /smart-entry/booking/:id`
   validates the caller owns the booking (`smartEntry.ts:159-163`) but does not
   verify the supplied `deviceId` belongs to a `smart_lock_connection` owned by
   that customer before storing it as `lock_device_id`. A customer could point a
   booking at another customer's device row. (Moot today because no UI sends
   `deviceId`, but a latent IDOR once §3 lands.)
5. **[Low] `supports_remote_unlock` is derived from `can_remotely_unlock` but the
   grant type is chosen from it too.** `provisionSmartEntry` writes
   `credential_type = supports_remote_unlock ? 'remote_unlock' : 'generated_pin'`
   (`smartEntry.ts:191`) yet always requests a **code** grant
   (`seam.ts:103`). A `remote_unlock`-typed credential therefore still has a PIN
   ref, and reveal will happily return that PIN — type semantics are muddy.
6. **[Low] `rate limit remaining` is hardcoded.** `cleanerAccess.ts:135`
   computes `maxCodeRevealsPerBooking - 0` (always max), so
   `remainingRevealCount` is cosmetic/incorrect.
7. **[Low] Key derivation uses no per-record salt** (`crypto.ts:28-33`) —
   deterministic AES-GCM key. Acceptable for this envelope scheme but worth a note.

---

## 2. Is Seam set up correctly on the Sweepr side?

| Check | Status | Evidence |
| --- | --- | --- |
| `SEAM_API_KEY` typed on `Env` | ✅ | `types.ts:88` |
| `SEAM_WEBHOOK_SECRET` typed on `Env` | ✅ | `types.ts:89` |
| Secrets synced at deploy | ✅ | `deploy.yml:138-139, 146-147` |
| Secrets documented in `wrangler.toml` catalog | ❌ **gap** | secret catalog `wrangler.toml:36-106` lists CLERK/STRIPE/DIDIT/R2/MAILERSEND/`ACCESS_CODE_ENCRYPTION_KEY` etc. but **has no `SEAM_API_KEY` / `SEAM_WEBHOOK_SECRET` entry**. Convention 7 / CLAUDE.md "Secret catalog = comments in wrangler.toml" is violated. |
| Routers mounted in `index.ts` | ✅ | `/smart-entry` `index.ts:482`, `/cleaner` `:483`, `/admin/smart-entry` `:484` |
| Webhook route mounted | ❌ **gap** | no `app.route("/webhooks/seam", …)` exists; `SEAM_WEBHOOK_SECRET` unused (see §1.5) |
| Server-side only, key never to browser | ✅ | `seam.ts:14-15`; all `makeSeam` calls in `apps/api` only |
| Auth on routers | ✅ | `requireAuth` on all three (`smartEntry.ts:32`, `cleanerAccess.ts:32`, `adminSmartEntry.ts:33` + `requireAnyAdmin`) |
| Meaningful changes audited | ✅ | `audit(…)` on admin config update + emergency revoke (`adminSmartEntry.ts:75-82, 103-110`) |
| Rate-limited polls | ⚠️ partial | The homeAccess flow is self-limited from the event log (`homeAccess.ts:256-280`). But `/smart-entry/status`, `/smart-entry/devices`, `/smart-entry/booking/:id` are not called out in the polled-read allowlist in `index.ts` (convention 14). Confirm they land in a generous bucket, not a strict mutation bucket, before customer booking-detail polling ships. |
| Feature dark by default | ✅ | `smartEntryEnabled:false` (`smartEntryConfig.ts:60`) |

### Gaps a human must fix (Seam dashboard side)

1. **Webhook URL registration.** Once a `/webhooks/seam` verifier is written,
   register `https://api.getsweepr.com/webhooks/seam` in the Seam dashboard and
   subscribe to at least `access_code.*` / `access_grant.*`, `device.connected` /
   `device.disconnected`, `device.low_battery`, and `action_attempt.*`. The
   signing secret must match `SEAM_WEBHOOK_SECRET`. **Until a route exists this
   secret is dead weight** — either wire it or drop it (per
   `context/committee/code-infra.md:3`).
2. **Workspace / provider config.** Decide sandbox vs production Seam workspace
   and confirm the API key's workspace has the customers' lock providers enabled
   (August, Yale, Schlage, Kwikset, SmartThings, etc.), and — for §3 — the Airbnb
   integration enabled for that workspace.
3. **Connected-account model.** The current single-workspace assumption
   (`smartEntry.ts:73-75` "single workspace connection is assumed") must be
   replaced with per-customer connected accounts (Connect Webviews) before this
   is safe for more than one household.
4. **Add the two secrets to the `wrangler.toml` catalog** so the secret inventory
   stays canonical.

---

## 3. Airbnb → Seam linking feasibility (Sweepr-native UI)

### 3.1 Can it be done purely via API? — Partly. The Airbnb consent step is unavoidably hosted.

Seam integrates Airbnb as a **provider on a `connected_account`**, established
through a **Connect Webview** (`connect_webviews`) — Seam's hosted, OAuth-style
authorization flow. Airbnb does **not** expose a public partner API that lets a
third party submit a host's Airbnb credentials directly; authorization happens on
**Airbnb's own OAuth consent screen**. There is therefore **no fully API-only
path** to bind an Airbnb account: the host must click through Airbnb's OAuth on
Airbnb's domain. Everything *around* that one screen can be Sweepr-native and
API-driven.

Resources involved:

- `POST /connect_webviews/create` with `accepted_providers: ["airbnb"]` (and
  `custom_redirect_url` / `custom_redirect_failure_url` back to a Sweepr page,
  plus `custom_metadata` to tie the webview to our `users.id` / property).
  Returns `connect_webview.url`.
- `connected_account` (provider `airbnb`) is created when the webview succeeds;
  discoverable via `POST /connected_accounts/list` or the
  `connect_webview.connected_account_id` after completion.
- Once connected, Airbnb **listings appear as Seam devices/resources** and
  Airbnb **reservations** sync; Seam can auto-manage access codes per
  reservation. Our existing `listDevices(connected_account_id)` (`seam.ts:68-74`)
  already accepts the scoping argument needed here.

### 3.2 Relationship to the existing STR calendar sync

Note: the task brief referenced tables `str_enrollment` / `str_calendar_sync`;
those **do not exist**. The actual STR sync uses **`calendar_sources`** +
**`imported_calendar_reservations`** (`lib/calendarSync.ts`,
`routes/rentals.ts:235-236, 314`), driven by SSRF-hardened **`.ics` feed
polling** (`calendarSync.ts:11-23`, `calendarSecurity.ts`). The provider enum
already includes `"airbnb"` (`rentals.ts:210`) — but that is the Airbnb
**calendar `.ics` export URL**, i.e. read-only checkout dates → turnaround
cleanings.

So the two are **complementary with partial overlap**:

- **Overlap:** both can learn Airbnb checkout/reservation timing. ICS gives dates
  only; Seam-Airbnb gives structured reservations *and* the ability to program
  the door.
- **Complement:** ICS sync cannot touch a lock. Seam-Airbnb links reservations to
  smart-lock access codes — the piece Smart Entry needs for STR turnovers. If a
  host connects Airbnb via Seam, we could **derive turnaround bookings from Seam
  reservations** instead of/in addition to ICS, and auto-provision the cleaner's
  access grant against the same listing's lock.
- **Recommendation:** keep ICS sync as the zero-integration default; treat
  Seam-Airbnb as an upgrade for hosts who also want Smart Entry. Do **not** double
  book — if a property has a Seam-Airbnb connection, prefer it and suppress the
  ICS-derived duplicate (dedupe key today is
  `(property, source, externalUid, checkoutDate)`, `calendarSync.ts:12-15`).

### 3.3 Recommended implementation (Sweepr-native, API-proxied)

Goal: 100% Sweepr-native UI; the only non-Sweepr surface is Airbnb's own OAuth
screen (unavoidable). Do **not** embed Seam's `@seam/connect-webview` React
widget — launch the webview URL ourselves.

**New API surface (proxying Seam):**

1. `POST /smart-entry/connections/airbnb/start`
   - Server: `makeSeam(env.SEAM_API_KEY)` → `POST /connect_webviews/create`
     `{ accepted_providers:["airbnb"], custom_redirect_url:
     "https://app.getsweepr.com/smart-entry/connect/return",
     custom_metadata:{ user_id } }`.
   - Insert/So a `smart_lock_connections` row `status='pending'`,
     `provider_account_reference = connect_webview.connect_webview_id`
     (`089_...sql:49-52`).
   - Return `{ url }` to the client.
2. Client opens `url` — new tab or a Sweepr-chrome popup (not an iframe: Airbnb,
   like Yardstik's apply page noted in CLAUDE.md, will not render cross-site in an
   iframe due to third-party-cookie/`X-Frame-Options` blocks). This is the
   "minimal hosted step".
3. `GET /smart-entry/connections/:id/status` (generous/polled bucket per
   convention 14) → server calls `POST /connect_webviews/get`; when
   `status="authorized"` and `connected_account_id` present, flip the connection
   to `connected`, store `provider_account_reference = connected_account_id`.
4. On return page, reuse **device sync scoped to the account**:
   `listDevices(connected_account_id)` (already supported, `seam.ts:68-74`) and
   upsert into `smart_lock_devices` (fix the isolation bug §1.7#2 with a real
   unique key `(connection_id, provider_device_reference)`).
5. **Webhook** (§2) to keep `smart_lock_connections.status` and device
   online/offline current instead of polling — register
   `connected_account.connected` / `.disconnected` / `.completed`.

**UI states needed (all native `@sweepr/ui`):**

- Not connected → "Connect your Airbnb" CTA (calls `…/airbnb/start`).
- Redirecting → spinner, "Opening Airbnb…".
- Airbnb OAuth (Airbnb's page — the one hosted step).
- Returned / pending → "Finishing up…" while polling `…/status`.
- Connected → list synced listings + locks (native cards, like
  `SmartEntryCard`), per-property "Use for Smart Entry" toggle.
- Error / disconnected / reconnect-needed → native banner with retry.

**If avoiding Airbnb entirely is acceptable:** for pure cleaner access you don't
need Airbnb at all — connect the *lock brand* (August/Yale/Schlage) directly via
the same Connect Webview with `accepted_providers` set to the lock manufacturer.
That still has a hosted credential step (the lock vendor's OAuth) but skips
Airbnb. Choose Airbnb-via-Seam only when the host wants **reservation-driven**
code automation, which overlaps the ICS sync above.

**Bottom line:** programmatic linking is feasible via `connect_webviews` +
`connected_accounts`; the Airbnb credential/consent screen cannot be replaced by
a native form (Airbnb OAuth), but it is a single hosted hop wrapped by
Sweepr-native start/return/status UI, exactly like the Yardstik pattern already
in the app.

---

## 4. Current Smart-Entry UI inventory

No Seam embedded widgets, hosted Connect Webviews, or Seam SDK are used anywhere
in any frontend (grep for `seam` / `connect_webview` / `@seam*` across
`apps/customer`, `apps/cleaner`, `apps/admin`: zero hits — the only `seam` string
is the `seafoam-*` Tailwind color). **All existing Smart-Entry UI is already
100% Sweepr-native**, calling `api.getsweepr.com`. There is nothing to rip out.

| App | File | Renders / does |
| --- | --- | --- |
| customer | `apps/customer/src/components/SmartEntryCard.tsx` | Native card: pick access method (I'll be home / Smart Entry / keypad code / lockbox), consent checkbox + fee/"Included with Sweepr+" badge, `PUT /smart-entry/booking/:id`. **No device picker, no lock-connect flow** (see §1.7#1). Native only. |
| customer | `apps/customer/src/pages/BookingDetailPage.tsx` | Hosts `SmartEntryCard` on the booking detail page. |
| customer | `apps/customer/src/i18n/locales/fil/common.json` | Localized Smart-Entry strings. |
| cleaner | `apps/cleaner/src/components/SmartEntryAccess.tsx` | Native card: "Reveal code" / "Unlock door"; captures geolocation, `POST /cleaner/bookings/:id/access/{reveal,unlock}`, shows code then auto-hides (`displaySeconds`). Native only. |
| cleaner | `apps/cleaner/src/pages/JobDetailPage.tsx` | Renders `SmartEntryAccess`, gated on checked-in (`arrived`/`in_progress`). |
| cleaner | `apps/cleaner/src/pages/JobsPage.tsx`, `OnboardingPage.tsx`, `TrainingPage.tsx`, `onboarding/BackgroundCheckStep.tsx` | Incidental "access"/"unlock"/"lock" copy or unrelated; `BackgroundCheckStep` uses an *embedded* iframe but that is **Yardstik**, not Seam. |
| cleaner | `apps/cleaner/src/i18n/locales/fil/common.json` | Localized strings. |
| admin | `apps/admin/src/pages/SmartEntryPage.tsx` | Native config console: feature toggles (incl. "Remote unlock … via Seam", `:44`), numeric limits/prices, events viewer. `GET/PUT /admin/smart-entry/config`, `GET /admin/smart-entry/events`. Never shows a working credential (matches `adminSmartEntry.ts:18`). Native only. |
| admin | `apps/admin/src/App.tsx` | Route/nav registration for the Smart Entry page. |

Backend routes serving these:
`routes/smartEntry.ts` (customer), `routes/cleanerAccess.ts` (cleaner),
`routes/adminSmartEntry.ts` (admin) — all mounted at `index.ts:482-484`.

---

## Priority fix list (drives implementation)

1. **Build the customer lock-connect flow** (§1.7#1, §3.3): without it
   `smart_entry` is billable but non-functional. This is the Airbnb/Seam linking
   work — do it via native Connect-Webview-launch UI.
2. **Fix `/devices/sync` isolation** (§1.7#2): scope by `connected_account_id`,
   add a real unique constraint, verify device ownership on `PUT` (§1.7#4).
3. **Write `/webhooks/seam` with HMAC verification against
   `SEAM_WEBHOOK_SECRET`** and register the URL in the Seam dashboard (§1.5, §2);
   or drop the secret.
4. **Document `SEAM_API_KEY` / `SEAM_WEBHOOK_SECRET` in the `wrangler.toml`
   secret catalog** (§2).
5. **Confirm polled Smart-Entry read endpoints sit in a generous rate-limit
   bucket** (convention 14) before the booking-detail page polls them.
6. Tidy: correct `remainingRevealCount` (§1.7#6), reconcile `remote_unlock`
   credential-type semantics (§1.7#5), replace optimistic `'active'` with
   webhook-confirmed issuance (§1.7#3).
</content>
</invoke>
