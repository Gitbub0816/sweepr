#!/usr/bin/env bash
# =============================================================================
# apply-r2-config.sh
# Applies CORS and lifecycle rules to the sweepr-media R2 bucket.
#
# Prerequisites:
#   brew install awscli   (or: pip install awscli)
#
# Usage:
#   export CF_ACCOUNT_ID=your_cloudflare_account_id
#   export R2_ACCESS_KEY_ID=your_r2_token_access_key
#   export R2_SECRET_ACCESS_KEY=your_r2_token_secret_key
#   export R2_BUCKET=sweepr-media
#   bash infra/r2/apply-r2-config.sh
#
# R2 token needs these permissions:
#   - Admin Read & Write on the bucket (to set CORS + lifecycle)
# =============================================================================
set -euo pipefail

: "${CF_ACCOUNT_ID:?Set CF_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?Set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:=sweepr-media}"

ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

echo "→ Applying CORS policy to $R2_BUCKET..."
aws s3api put-bucket-cors \
  --endpoint-url "$ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --cors-configuration "file://${SCRIPT_DIR}/cors.xml"
echo "  ✓ CORS applied"

echo "→ Applying lifecycle rules to $R2_BUCKET..."
aws s3api put-bucket-lifecycle-configuration \
  --endpoint-url "$ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --lifecycle-configuration "file://${SCRIPT_DIR}/lifecycle.xml"
echo "  ✓ Lifecycle applied"

echo ""
echo "→ Verifying..."
echo "CORS:"
aws s3api get-bucket-cors \
  --endpoint-url "$ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --output json | head -20

echo ""
echo "Lifecycle:"
aws s3api get-bucket-lifecycle-configuration \
  --endpoint-url "$ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --output json | head -20

echo ""
echo "✓ Done. R2 bucket $R2_BUCKET is configured."
echo ""
echo "NOTE: Object Lock must be set at bucket creation time."
echo "      See infra/r2/object-lock.md for the two-bucket strategy."
