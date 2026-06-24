# R2 Object Lock — Sweepr

## Important: Must Be Enabled at Bucket Creation

Object Lock (WORM — Write Once Read Many) **cannot be enabled on an existing bucket**.
It must be set when the bucket is first created.

---

## Recommendation: Two Buckets

Because booking photos need normal deletion (e.g., GDPR erasure requests) but legal
documents need WORM protection, use separate buckets:

| Bucket | Object Lock | Contents |
|--------|-------------|----------|
| `sweepr-media` | **Off** | bookings/, avatars/, training/ |
| `sweepr-legal` | **On — Compliance mode** | certificates/, insurance/ |

This lets you honour GDPR deletion requests on booking photos while keeping
insurance and certificate docs legally immutable.

---

## sweepr-media (no object lock)

Protection strategy instead of WORM:

- **Lifecycle rules** enforce minimum retention (730 days for bookings)
- **IAM policy**: R2 API token used by the Worker has `r2:PutObject` only —
  no `r2:DeleteObject` permission. Only a separate admin token can delete.
- **Versioning**: not available in R2, but lifecycle rules prevent premature deletion.

---

## sweepr-legal (object lock ON)

### Create the bucket with lock enabled

In the Cloudflare dashboard:
1. R2 → Create bucket
2. Name: `sweepr-legal`
3. Enable **Object Lock** ✓
4. Default retention: **Compliance mode, 2555 days (7 years)**

Or via API:
```bash
aws s3api create-bucket \
  --bucket sweepr-legal \
  --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --object-lock-enabled-for-bucket

aws s3api put-object-lock-configuration \
  --bucket sweepr-legal \
  --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Days": 2555
      }
    }
  }'
```

**Compliance mode** means even Cloudflare account admins cannot delete objects
before the retention period expires. Use **Governance mode** if you want your
own admins to be able to override it with a special permission.

---

## Update Worker env vars for second bucket

Add to `wrangler.toml [vars]`:
```toml
R2_LEGAL_BUCKET = "sweepr-legal"
R2_LEGAL_PUBLIC_URL = "https://legal-media.getsweepr.com"
```

Add to Worker secrets:
```bash
wrangler secret put R2_LEGAL_ACCESS_KEY_ID
wrangler secret put R2_LEGAL_SECRET_ACCESS_KEY
```

The legal bucket uses a separate R2 API token with only `r2:PutObject` permission
(no delete) so the Worker cannot accidentally remove locked documents.

---

## If sweepr-media Already Exists Without Lock

You cannot retroactively enable object lock. Your options:

1. **Accept lifecycle rules as protection** (reasonable for a startup — Stripe dispute
   window is 18 months, lifecycle keeps files 24 months)
2. **Migrate**: create `sweepr-legal` with lock enabled, move existing certificates
   and insurance docs there via the Cloudflare dashboard or `aws s3 cp --recursive`
3. **Keep as-is for now** and revisit when preparing for SOC 2 / insurance audit
