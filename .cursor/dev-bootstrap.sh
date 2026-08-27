#!/usr/bin/env bash
#
# Idempotent per-boot bootstrap for the rlpapp Cloud Agent dev environment.
#
# The repo uses Doppler (project `rlpeng`, config `dev`) as the source of truth
# for local secrets. In a Cloud Agent, provide a Doppler *service token* as the
# secret DOPPLER_SERVICE_TOKEN (Secrets panel) so secrets can be read
# non-interactively.
#
# Convex is kept isolated per the repo's own agent-mode rule
# (local-development-agent-mode.mdc): this cloud agent runs an *anonymous* local
# Convex deployment instead of the shared team deployment. Doppler supplies the
# third-party (Clerk) credentials that the Convex schema requires at push time;
# when no token is present we fall back to placeholders so the stack still boots.
#
# Safe to run repeatedly: every step checks existing state before acting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The Doppler CLI reads DOPPLER_TOKEN; expose our clearly-named Cloud Agent
# secret (DOPPLER_SERVICE_TOKEN) under that name. A pre-existing DOPPLER_TOKEN
# is still honored as a fallback.
export DOPPLER_TOKEN="${DOPPLER_SERVICE_TOKEN:-${DOPPLER_TOKEN:-}}"

BACKEND_ENV="packages/backend/.env.local"
export CONVEX_AGENT_MODE=anonymous

# ---------------------------------------------------------------------------
# 0. Resolve the Clerk secrets: from Doppler when a token is available, else
#    placeholders. These are applied to the *anonymous* Convex deployment via
#    `convex env set` (the web app reads its own copies via `doppler run`).
# ---------------------------------------------------------------------------
CLERK_SECRET_KEY_VAL="sk_test_placeholder_dev_only"
CLERK_WEBHOOK_SECRET_VAL="whsec_placeholder_dev_only"
OPENAI_API_KEY_VAL=""
SECRETS_SOURCE="placeholder"

if [ -n "${DOPPLER_TOKEN:-}" ] && command -v doppler >/dev/null 2>&1; then
  dop_args=(secrets download --no-file --format env-no-quotes)
  [ -n "${DOPPLER_PROJECT:-}" ] && dop_args+=(--project "$DOPPLER_PROJECT")
  [ -n "${DOPPLER_CONFIG:-}" ] && dop_args+=(--config "$DOPPLER_CONFIG")
  if dop_env="$(doppler "${dop_args[@]}" 2>/dev/null)"; then
    dop_get() { printf '%s\n' "$dop_env" | sed -n "s/^$1=//p" | tail -1; }
    v="$(dop_get CLERK_SECRET_KEY)"; [ -n "$v" ] && CLERK_SECRET_KEY_VAL="$v"
    v="$(dop_get CLERK_WEBHOOK_SECRET)"; [ -n "$v" ] && CLERK_WEBHOOK_SECRET_VAL="$v"
    v="$(dop_get OPENAI_API_KEY)"; [ -n "$v" ] && OPENAI_API_KEY_VAL="$v"
    SECRETS_SOURCE="doppler"
  else
    echo "dev-bootstrap: WARNING: DOPPLER_SERVICE_TOKEN set but 'doppler secrets download' failed (check token scope: project rlpeng / config dev). Using placeholders." >&2
  fi
elif [ -n "${DOPPLER_TOKEN:-}" ]; then
  echo "dev-bootstrap: WARNING: DOPPLER_SERVICE_TOKEN set but Doppler CLI unavailable; using placeholders." >&2
else
  echo "dev-bootstrap: DOPPLER_SERVICE_TOKEN not set — using placeholder Clerk credentials. Add it (project rlpeng / config dev) to use real secrets." >&2
fi
echo "dev-bootstrap: secrets source = ${SECRETS_SOURCE}"

# ---------------------------------------------------------------------------
# 1. Backend: pin anonymous agent mode so `convex dev` never tries to log in
#    or touch the shared team deployment.
# ---------------------------------------------------------------------------
if ! grep -qs "CONVEX_AGENT_MODE=anonymous" "$BACKEND_ENV"; then
  printf 'CONVEX_AGENT_MODE=anonymous\n' >>"$BACKEND_ENV"
fi

convex() { pnpm -F @rlpapp/backend exec convex "$@"; }

set_convex_env() {
  convex env set CLERK_SECRET_KEY "$CLERK_SECRET_KEY_VAL" || true
  convex env set CLERK_WEBHOOK_SECRET "$CLERK_WEBHOOK_SECRET_VAL" || true
  if [ -n "$OPENAI_API_KEY_VAL" ]; then
    convex env set OPENAI_API_KEY "$OPENAI_API_KEY_VAL" || true
  fi
}

# 2. Create/configure the local anonymous deployment. The first push can fail
#    because the required env vars are not set yet; the deployment is still
#    created, so tolerate that and set the vars next.
convex dev --once || true

# 3. Set the required Convex env vars (idempotent).
set_convex_env

# 4. Push schema + functions. On a brand-new deployment the env-var write can
#    take a moment to propagate before a push sees it, so retry, re-asserting
#    the vars each attempt. Best-effort: the persistent `convex dev` terminal
#    converges on its own once the vars exist, so a transient failure here must
#    not abort the whole start phase.
for attempt in 1 2 3 4 5; do
  if convex dev --once; then
    break
  fi
  echo "dev-bootstrap: convex push attempt ${attempt} failed; re-asserting env vars and retrying..."
  set_convex_env
  sleep 5
done

echo "dev-bootstrap: Convex anonymous deployment ready (secrets: ${SECRETS_SOURCE})."
