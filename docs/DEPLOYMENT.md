# Deployment Guide

## Architecture
- **Marketing** (sweep-r.com) → Cloudflare Pages: `sweepr-marketing`
- **Customer App** (app.sweep-r.com) → Cloudflare Pages: `sweepr-customer`
- **Cleaner App** (clean.sweep-r.com) → Cloudflare Pages: `sweepr-cleaner`
- **Admin** (admin.sweep-r.com) → Cloudflare Pages: `sweepr-admin`
- **Legal** (legal.sweep-r.com) → Cloudflare Pages: `sweepr-legal`
- **API** (api.sweep-r.com) → Cloudflare Workers: `sweepr-api`

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | CF API token with Pages + Workers deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (pk_live_...) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (pk_live_...) |
| `VITE_MAPBOX_PUBLIC_TOKEN` | Mapbox public token (pk.eyJ...) |
| `VITE_POSTHOG_KEY` | PostHog project API key |
| `VITE_POSTHOG_HOST` | PostHog host (https://app.posthog.com) |
| `VITE_POSTHOG_DASHBOARD_URL` | PostHog shared dashboard URL (optional) |
| `VITE_API_URL` | API URL (https://api.sweep-r.com) |

## Cloudflare Worker Secrets (set via wrangler)

```bash
cd apps/api
wrangler secret put CLERK_SECRET_KEY
wrangler secret put DATABASE_URL
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put MAILERSEND_API_KEY
wrangler secret put CHECKR_API_KEY
wrangler secret put DIDIT_API_KEY
wrangler secret put MAPBOX_SECRET_TOKEN
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIREBASE_STORAGE_BUCKET
wrangler secret put ALLOWED_ORIGINS
wrangler secret put POSTHOG_KEY
```

## Cloudflare Pages Setup (per app)

1. Create project in Cloudflare Pages dashboard
2. Set build command (see cloudflare-pages.json per app)
3. Set environment variables in CF Pages dashboard
4. Add custom domain

## Neon Database Setup

1. Create a Neon project at neon.tech
2. Run migrations: `psql $DATABASE_URL < packages/db/src/migrations/001_initial.sql`
3. Run: `psql $DATABASE_URL < packages/db/src/migrations/002_gdpr.sql`
4. Set `DATABASE_URL` as a Worker secret

## Firebase Storage Setup

1. Create a Firebase project
2. Enable Storage
3. Create a service account key
4. Set `FIREBASE_*` secrets in the Worker

## First-time Cloudflare Pages deployment

```bash
# Install wrangler globally
npm install -g wrangler

# Login
wrangler login

# Create KV namespace for rate limiting
wrangler kv:namespace create "RATE_LIMIT_KV"
# Copy the ID into wrangler.toml

# Deploy API worker
cd apps/api && wrangler deploy

# Deploy each Pages app
# (or use GitHub Actions)
```
