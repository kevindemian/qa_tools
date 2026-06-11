#!/usr/bin/env bash
# =============================================================================
# opencode-entrypoint.sh — Container entrypoint for opencode
# =============================================================================
#
# Runs SQLite DB maintenance before executing opencode.
# This file is COPY'd into the container image during build.
#
# Environment:
#   OPENCODE_SKIP_DB_CHECK  Set to "true" to skip DB maintenance (default: false)
#
# Exit code: propagates opencode's exit code.
# If DB maintenance fails, exit with maintenance error code (does NOT mask).
# =============================================================================

set -euo pipefail

if [[ "${OPENCODE_SKIP_DB_CHECK:-false}" != "true" ]]; then
    if command -v tsx &>/dev/null && [[ -f /project/scripts/opencode-db-maintenance.ts ]]; then
        echo "[entrypoint] Running SQLite database maintenance..."
        tsx /project/scripts/opencode-db-maintenance.ts --check-only
        echo "[entrypoint] SQLite maintenance complete (exit=$?)"
    fi
fi

if ! command -v opencode &>/dev/null; then
    echo "[entrypoint] ERROR: opencode not found" >&2
    exit 1
fi

exec opencode "$@"
