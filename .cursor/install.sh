#!/usr/bin/env bash
set -euo pipefail

# Keep install deterministic for environment builds.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

pnpm install --frozen-lockfile
