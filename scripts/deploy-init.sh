#!/usr/bin/env bash
# =============================================================================
# Sweepr — First-time Cloudflare deployment
#
# Run this ONCE from your local machine (needs Node 20+, pnpm, wrangler).
# After this, GitHub Actions handles all future deployments on push to main.
#
# Usage:
#   cd /path/to/sweepr
#   bash scripts/deploy-init.sh
# =============================================================================
set -euo pipefail

# ── Load secrets from a local, gitignored env file ─────────────────────────────
# Copy sweepr.env.local (provided separately — NEVER commit it) next to the repo,
# or export the vars yourself before running. No secrets are hardcoded here.
ENV_FILE="${SWEEPR_ENV_FILE:-sweepr.env.local}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (in $ENV_FILE or env)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID (in $ENV_FILE or env)}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
error() { echo -e "${RED}✘ $*${NC}"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v pnpm  >/dev/null || error "pnpm not found. Install: npm i -g pnpm"
command -v npx   >/dev/null || error "npx not found."

info "Installing dependencies..."
pnpm install --frozen-lockfile

info "Building all packages..."
pnpm build

# ─────────────────────────────────────────────────────────────────────────────
# 1. WORKER SECRETS
# ─────────────────────────────────────────────────────────────────────────────
info "Setting Worker secrets..."

put_secret() {
  local name="$1" val="$2"
  if [[ -z "$val" ]]; then
    warn "Skipping $name (empty value)"
    return
  fi
  printf '%s' "$val" | npx wrangler secret put "$name" --name sweepr-api --config apps/api/wrangler.toml 2>&1 | grep -E "✔|✘|Error" || true
  echo "  → $name set"
}

put_secret DATABASE_URL        "${DATABASE_URL:-}"
put_secret CLERK_SECRET_KEY    "${CLERK_SECRET_KEY:-}"
put_secret STRIPE_SECRET_KEY   "${STRIPE_SECRET_KEY:-}"
put_secret STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET:-}"
put_secret MAILERSEND_API_KEY  "${MAILERSEND_API_KEY:-}"
put_secret POSTHOG_KEY         "${POSTHOG_KEY:-}"
# Didit — hosted session flow. CLIENT_ID is NOT required for the web MVP.
# Required: DIDIT_API_KEY (x-api-key), DIDIT_WORKFLOW_ID, DIDIT_WEBHOOK_SECRET.
# Two workflows: personal (individual KYC) + business (authorized-rep / KYB).
put_secret DIDIT_API_KEY              "${DIDIT_API_KEY:-}"
put_secret DIDIT_WORKFLOW_ID          "${DIDIT_WORKFLOW_ID:-}"
put_secret DIDIT_WORKFLOW_ID_BUSINESS "${DIDIT_WORKFLOW_ID_BUSINESS:-}"
put_secret DIDIT_WEBHOOK_SECRET       "${DIDIT_WEBHOOK_SECRET:-}"
# Optional — only if you later move off the hosted session flow:
put_secret DIDIT_CLIENT_SECRET        "${DIDIT_CLIENT_SECRET:-}"
if [[ -z "${DIDIT_API_KEY:-}" || -z "${DIDIT_WORKFLOW_ID:-}" ]]; then
  warn "DIDIT_API_KEY or DIDIT_WORKFLOW_ID missing — Didit runs in STUB mode (manual admin review)."
fi
put_secret ALLOWED_ORIGINS  "${ALLOWED_ORIGINS:-https://sweep-r.com,https://app.sweep-r.com,https://clean.sweep-r.com,https://admin.sweep-r.com,https://legal.sweep-r.com}"

# Checkr — omit until account is approved; mock mode activates automatically
warn "CHECKR_API_KEY not set — Checkr will run in mock mode until your account is approved."

# Firebase service account — set manually when you have the JSON:
#   base64 -i serviceAccount.json | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --name sweepr-api
warn "FIREBASE_SERVICE_ACCOUNT not set — download your Firebase service account JSON, base64-encode it, and run:"
echo "  base64 -i serviceAccount.json | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --name sweepr-api"

# ─────────────────────────────────────────────────────────────────────────────
# 2. DEPLOY WORKER
# ─────────────────────────────────────────────────────────────────────────────
info "Deploying API Worker to Cloudflare Workers..."
cd apps/api
npx wrangler deploy --config wrangler.toml
WORKER_URL="https://sweepr-api.$(echo $CLOUDFLARE_ACCOUNT_ID | cut -c1-8).workers.dev"
info "Worker deployed → https://sweepr-api.workers.dev"
cd ../..

# ─────────────────────────────────────────────────────────────────────────────
# 3. CREATE CLOUDFLARE PAGES PROJECTS (idempotent)
# ─────────────────────────────────────────────────────────────────────────────
info "Creating Cloudflare Pages projects (safe to re-run)..."

create_pages_project() {
  local name="$1"
  npx wrangler pages project create "$name" --production-branch main 2>&1 | grep -v "already exists" | grep -E "Created|Error" || true
  echo "  → $name ready"
}

create_pages_project sweepr-marketing
create_pages_project sweepr-customer
create_pages_project sweepr-cleaner
create_pages_project sweepr-admin
create_pages_project sweepr-legal

# ─────────────────────────────────────────────────────────────────────────────
# 4. BUILD & DEPLOY FRONTENDS
#
# ⚠️  MISSING KEYS — you need these before payments and maps are fully live:
#   VITE_STRIPE_PUBLISHABLE_KEY — get from Stripe Dashboard → API Keys → pk_live_
#   VITE_MAPBOX_TOKEN (public) — get from Mapbox Dashboard → Tokens → Create (pk.)
#   Your sk. Mapbox token is a SECRET token and must NOT be in frontend JS.
#
# When you have them, re-run this script with those two vars set in your env:
#   STRIPE_PK=pk_live_xxx MAPBOX_PK=pk.xxx bash scripts/deploy-init.sh
# ─────────────────────────────────────────────────────────────────────────────

STRIPE_PK="${STRIPE_PK:-${VITE_STRIPE_PUBLISHABLE_KEY:-}}"
MAPBOX_PK="${MAPBOX_PK:-${VITE_MAPBOX_TOKEN:-}}"
# All public client config comes from the env file — nothing hardcoded.
CLERK_PK="${VITE_CLERK_PUBLISHABLE_KEY:-}"
POSTHOG_PK="${VITE_POSTHOG_KEY:-${POSTHOG_KEY:-}}"
POSTHOG_HOST="${VITE_POSTHOG_HOST:-https://app.posthog.com}"
FB_API_KEY="${VITE_FIREBASE_API_KEY:-}"
FB_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-}"
FB_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-}"
FB_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-}"
FB_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
FB_APP_ID="${VITE_FIREBASE_APP_ID:-}"
API_PUBLIC_URL="${VITE_API_URL:-https://api.sweep-r.com}"

if [[ -z "$STRIPE_PK" ]]; then
  warn "STRIPE_PK not set — Stripe Elements will run in demo mode."
fi
if [[ -z "$MAPBOX_PK" ]]; then
  warn "MAPBOX_PK not set — Maps will be disabled. Use a pk. token, not sk."
fi

# ── Marketing ─────────────────────────────────────────────────────────────────
info "Building + deploying marketing site..."
VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PK" \
VITE_MAPBOX_TOKEN="$MAPBOX_PK" \
VITE_POSTHOG_KEY="$POSTHOG_PK" \
VITE_POSTHOG_HOST="$POSTHOG_HOST" \
VITE_API_URL="$API_PUBLIC_URL" \
VITE_CUSTOMER_URL="https://app.sweep-r.com" \
VITE_CLEANER_URL="https://clean.sweep-r.com" \
  pnpm --filter @sweepr/marketing build
npx wrangler pages deploy apps/marketing/dist --project-name=sweepr-marketing --branch=main

# ── Customer app ──────────────────────────────────────────────────────────────
info "Building + deploying customer app..."
VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PK" \
VITE_STRIPE_PUBLISHABLE_KEY="$STRIPE_PK" \
VITE_MAPBOX_TOKEN="$MAPBOX_PK" \
VITE_POSTHOG_KEY="$POSTHOG_PK" \
VITE_POSTHOG_HOST="$POSTHOG_HOST" \
VITE_API_URL="$API_PUBLIC_URL" \
VITE_FIREBASE_API_KEY="$FB_API_KEY" \
VITE_FIREBASE_AUTH_DOMAIN="$FB_AUTH_DOMAIN" \
VITE_FIREBASE_PROJECT_ID="$FB_PROJECT_ID" \
VITE_FIREBASE_STORAGE_BUCKET="$FB_STORAGE_BUCKET" \
VITE_FIREBASE_MESSAGING_SENDER_ID="$FB_SENDER_ID" \
VITE_FIREBASE_APP_ID="$FB_APP_ID" \
  pnpm --filter @sweepr/customer build
npx wrangler pages deploy apps/customer/dist --project-name=sweepr-customer --branch=main

# ── Cleaner app ───────────────────────────────────────────────────────────────
info "Building + deploying cleaner app..."
VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PK" \
VITE_MAPBOX_TOKEN="$MAPBOX_PK" \
VITE_POSTHOG_KEY="$POSTHOG_PK" \
VITE_POSTHOG_HOST="$POSTHOG_HOST" \
VITE_API_URL="$API_PUBLIC_URL" \
VITE_FIREBASE_API_KEY="$FB_API_KEY" \
VITE_FIREBASE_AUTH_DOMAIN="$FB_AUTH_DOMAIN" \
VITE_FIREBASE_PROJECT_ID="$FB_PROJECT_ID" \
VITE_FIREBASE_STORAGE_BUCKET="$FB_STORAGE_BUCKET" \
VITE_FIREBASE_MESSAGING_SENDER_ID="$FB_SENDER_ID" \
VITE_FIREBASE_APP_ID="$FB_APP_ID" \
  pnpm --filter @sweepr/cleaner build
npx wrangler pages deploy apps/cleaner/dist --project-name=sweepr-cleaner --branch=main

# ── Admin app ─────────────────────────────────────────────────────────────────
info "Building + deploying admin app..."
VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PK" \
VITE_MAPBOX_TOKEN="$MAPBOX_PK" \
VITE_POSTHOG_KEY="$POSTHOG_PK" \
VITE_POSTHOG_HOST="$POSTHOG_HOST" \
VITE_API_URL="$API_PUBLIC_URL" \
  pnpm --filter @sweepr/admin build
npx wrangler pages deploy apps/admin/dist --project-name=sweepr-admin --branch=main

# ── Legal site ────────────────────────────────────────────────────────────────
info "Building + deploying legal site..."
pnpm --filter @sweepr/legal build
npx wrangler pages deploy apps/legal/dist --project-name=sweepr-legal --branch=main

# ─────────────────────────────────────────────────────────────────────────────
# 5. CUSTOM DOMAINS — do this in Cloudflare Dashboard after first deploy
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Temporary URLs (live now):"
echo "    Marketing  → https://sweepr-marketing.pages.dev"
echo "    Customer   → https://sweepr-customer.pages.dev"
echo "    Cleaner    → https://sweepr-cleaner.pages.dev"
echo "    Admin      → https://sweepr-admin.pages.dev"
echo "    Legal      → https://sweepr-legal.pages.dev"
echo "    API        → https://sweepr-api.workers.dev"
echo ""
echo "  Custom domains — add in Cloudflare Dashboard → Pages → each project:"
echo "    sweepr-marketing  → sweep-r.com"
echo "    sweepr-customer   → app.sweep-r.com"
echo "    sweepr-cleaner    → clean.sweep-r.com"
echo "    sweepr-admin      → admin.sweep-r.com"
echo "    sweepr-legal      → legal.sweep-r.com"
echo "    sweepr-api        → api.sweep-r.com  (Workers → Triggers → Custom Domains)"
echo ""
echo "  Next steps:"
echo "    1. Get Stripe pk_live_ key → Stripe Dashboard → API Keys"
echo "    2. Get Mapbox pk. token    → mapbox.com → Tokens → Create (NOT sk.)"
echo "    3. Run: bash scripts/setup-github-secrets.sh  (CI/CD)"
echo "    4. Update Stripe webhook URL: https://api.sweep-r.com/webhooks/stripe"
echo "    5. Update Didit webhook URL: https://api.sweep-r.com/webhooks/didit"
echo "═══════════════════════════════════════════════════════════════"
