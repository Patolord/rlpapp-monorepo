#!/usr/bin/env bash
#
# Web dev server for the rlpapp Cloud Agent environment.
#
# The web app's client env vars (Clerk publishable key, server Clerk secret)
# come from Doppler via `doppler run` when a DOPPLER_SERVICE_TOKEN is available.
# We always override VITE_CONVEX_URL / VITE_CONVEX_SITE_URL to point at this
# agent's *local anonymous* Convex deployment (started by the convex-backend
# terminal), so the frontend talks to the isolated backend rather than the
# shared team Convex that Doppler may reference.
#
# Without a token, fall back to a well-formed placeholder Clerk key so the
# server still boots (sign-in is non-functional, but pages render).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The Doppler CLI reads DOPPLER_TOKEN; expose our clearly-named Cloud Agent
# secret (DOPPLER_SERVICE_TOKEN) under that name.
export DOPPLER_TOKEN="${DOPPLER_SERVICE_TOKEN:-${DOPPLER_TOKEN:-}}"

LOCAL_CONVEX_URL="http://127.0.0.1:3210"
LOCAL_CONVEX_SITE_URL="http://127.0.0.1:3211"

if [ -n "${DOPPLER_TOKEN:-}" ] && command -v doppler >/dev/null 2>&1 \
   && doppler secrets download --no-file --format env-no-quotes >/dev/null 2>&1; then
  echo "dev-web: starting via 'doppler run' (real secrets), Convex pinned to local anonymous deployment."
  exec doppler run -- env \
    VITE_CONVEX_URL="$LOCAL_CONVEX_URL" \
    VITE_CONVEX_SITE_URL="$LOCAL_CONVEX_SITE_URL" \
    pnpm -F web exec vite dev
else
  if [ -n "${DOPPLER_TOKEN:-}" ]; then
    echo "dev-web: WARNING: DOPPLER_SERVICE_TOKEN set but Doppler secrets unavailable; using placeholder Clerk credentials." >&2
  else
    echo "dev-web: DOPPLER_SERVICE_TOKEN not set — starting with placeholder Clerk credentials."
  fi
  PK="pk_test_$(printf 'placeholder-00.clerk.accounts.dev$' | base64 | tr -d '\n')"
  exec env \
    VITE_CONVEX_URL="$LOCAL_CONVEX_URL" \
    VITE_CONVEX_SITE_URL="$LOCAL_CONVEX_SITE_URL" \
    VITE_CLERK_PUBLISHABLE_KEY="$PK" \
    CLERK_SECRET_KEY="sk_test_placeholder_dev_only" \
    pnpm -F web exec vite dev
fi
