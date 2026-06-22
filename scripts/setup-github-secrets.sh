#!/usr/bin/env bash
# =============================================================================
# Sweepr — Set GitHub Actions secrets for CI/CD
#
# Requires: gh CLI authenticated (gh auth login)
# Run once after deploy-init.sh.
#
# No secrets are hardcoded. Values are read from a local, gitignored env file
# (sweepr.env.local) or from your environment.
#
# Usage:
#   bash scripts/setup-github-secrets.sh
#   # or override the env file location:
#   SWEEPR_ENV_FILE=../secrets.env bash scripts/setup-github-secrets.sh
# =============================================================================
set -euo pipefail

ENV_FILE="${SWEEPR_ENV_FILE:-sweepr.env.local}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

REPO="${GITHUB_REPO:-Gitbub0816/sweepr}"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }

command -v gh >/dev/null || { echo "gh CLI not found. Install: https://cli.github.com"; exit 1; }

info "Setting GitHub Actions secrets for $REPO..."

set_secret() {
  local name="$1" val="$2"
  if [[ -z "$val" ]]; then
    warn "Skipping $name (empty)"
    return
  fi
  printf '%s' "$val" | gh secret set "$name" --repo "$REPO"
  echo "  → $name ✓"
}

# Cloudflare (deploy credentials)
set_secret CLOUDFLARE_API_TOKEN   "${CLOUDFLARE_API_TOKEN:-}"
set_secret CLOUDFLARE_ACCOUNT_ID  "${CLOUDFLARE_ACCOUNT_ID:-}"

# Clerk (publishable — safe for frontend)
set_secret VITE_CLERK_PUBLISHABLE_KEY "${VITE_CLERK_PUBLISHABLE_KEY:-}"

# Stripe — VITE key MUST be pk_live_ (publishable), never sk_live_
set_secret VITE_STRIPE_PUBLISHABLE_KEY "${VITE_STRIPE_PUBLISHABLE_KEY:-${STRIPE_PK:-}}"

# Mapbox — MUST be a pk. token for frontend, never sk.
set_secret VITE_MAPBOX_PUBLIC_TOKEN "${VITE_MAPBOX_TOKEN:-${MAPBOX_PK:-}}"

# PostHog
set_secret VITE_POSTHOG_KEY  "${VITE_POSTHOG_KEY:-}"
set_secret VITE_POSTHOG_HOST "${VITE_POSTHOG_HOST:-https://app.posthog.com}"

# Firebase frontend config (public client config)
set_secret VITE_FIREBASE_API_KEY              "${VITE_FIREBASE_API_KEY:-}"
set_secret VITE_FIREBASE_AUTH_DOMAIN          "${VITE_FIREBASE_AUTH_DOMAIN:-}"
set_secret VITE_FIREBASE_PROJECT_ID           "${VITE_FIREBASE_PROJECT_ID:-}"
set_secret VITE_FIREBASE_STORAGE_BUCKET       "${VITE_FIREBASE_STORAGE_BUCKET:-}"
set_secret VITE_FIREBASE_MESSAGING_SENDER_ID  "${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
set_secret VITE_FIREBASE_APP_ID               "${VITE_FIREBASE_APP_ID:-}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅  GitHub secrets set. Push to main to trigger deployment."
echo "═══════════════════════════════════════════════════════════════"
