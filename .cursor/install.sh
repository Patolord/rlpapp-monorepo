#!/usr/bin/env bash
#
# Install phase for the rlpapp Cloud Agent environment.
# Installs the Doppler CLI (the repo uses Doppler as the source of truth for
# local secrets — every dev script runs via `doppler run`) and the workspace
# dependencies. Idempotent: safe to run repeatedly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v doppler >/dev/null 2>&1; then
  echo "install: installing Doppler CLI..."
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    curl -Ls https://cli.doppler.com/install.sh | sudo sh
  else
    curl -Ls https://cli.doppler.com/install.sh | sh -s -- --install-path "$HOME/.local/bin"
  fi
fi

pnpm install --frozen-lockfile
