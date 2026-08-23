#!/usr/bin/env bash
#
# Idempotent per-boot bootstrap for the rlpapp Cloud Agent dev environment.
#
# Configures an isolated *anonymous* Convex deployment (no Convex account
# required) and writes the local `.env` files so the Convex backend and the
# TanStack Start web app can run without any external accounts. Placeholder
# Clerk credentials let the stack boot; replace them with real values (see
# below) to exercise the full authentication flow.
#
# Safe to run repeatedly: every step checks existing state before acting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_ENV="packages/backend/.env.local"
WEB_ENV="apps/web/.env"

export CONVEX_AGENT_MODE=anonymous

# 1. Backend: pin anonymous agent mode so `convex dev` never tries to log in.
if ! grep -qs "CONVEX_AGENT_MODE=anonymous" "$BACKEND_ENV"; then
  printf 'CONVEX_AGENT_MODE=anonymous\n' >>"$BACKEND_ENV"
fi

convex() { pnpm -F @rlpapp/backend exec convex "$@"; }

# 2. Create/configure the local anonymous deployment. The very first push can
#    fail because required Convex env vars are not set yet; the deployment is
#    still created, so tolerate that failure and set the vars next.
convex dev --once || true

# 3. Ensure the Convex env vars the schema requires exist. Placeholders keep the
#    isolated dev deployment pushable; run e.g.
#      pnpm -F @rlpapp/backend exec convex env set CLERK_SECRET_KEY <real-key>
#    to enable real Clerk authentication.
convex env get CLERK_SECRET_KEY >/dev/null 2>&1 \
  || convex env set CLERK_SECRET_KEY "sk_test_placeholder_dev_only"
convex env get CLERK_WEBHOOK_SECRET >/dev/null 2>&1 \
  || convex env set CLERK_WEBHOOK_SECRET "whsec_placeholder_dev_only"

# 4. Push schema + functions now that the required env vars are present.
convex dev --once

# 5. Web app: point it at the local Convex deployment. The placeholder Clerk
#    publishable key is a well-formed test key so ClerkProvider initializes;
#    swap in a real key + secret to enable sign-in.
if [ ! -f "$WEB_ENV" ]; then
  PK="pk_test_$(printf 'placeholder-00.clerk.accounts.dev$' | base64 | tr -d '\n')"
  cat >"$WEB_ENV" <<EOF
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
VITE_CLERK_PUBLISHABLE_KEY=${PK}
CLERK_SECRET_KEY=sk_test_placeholder_dev_only
EOF
fi

echo "dev-bootstrap: Convex anonymous deployment ready and .env files in place."
