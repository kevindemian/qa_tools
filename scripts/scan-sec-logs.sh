#!/usr/bin/env bash
set -euo pipefail

# Layer 3.1 — Post-session security log scanner
# Scans opencode session logs for:
#   - Secrets leaked in tool output
#   - Safety mechanism bypass events
#   - Warden audit events
#
# Usage: ./scripts/scan-sec-logs.sh [--quiet] [--output FILE]

QUIET=false
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet) QUIET=true; shift ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WARDEN_LOG="$PROJECT_ROOT/.opencode/warden/audit.log"
OPENDATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencode"
VIOLATIONS_LOG="$HOME/.config/opencode/.security_violations.log"
EXIT_CODE=0

report() {
  if [[ "$QUIET" == false ]]; then
    echo "[scan-sec] $*"
  fi
}

if [[ -n "$OUTPUT_FILE" ]]; then
  exec > "$OUTPUT_FILE" 2>&1
fi

report "=== Post-Session Security Scan ==="
report "Timestamp: $(date -Iseconds)"
report "Project: $PROJECT_ROOT"
report ""

# 1. Scan warden audit log
if [[ -f "$WARDEN_LOG" ]]; then
  VIOLATIONS=$(grep -c '"action":"block"' "$WARDEN_LOG" 2>/dev/null || echo 0)
  SECRETS=$(grep -c '"type":"secret"' "$WARDEN_LOG" 2>/dev/null || echo 0)
  report "Warden audit found: $VIOLATIONS blocked actions, $SECRETS secret detections"
  if [[ "$VIOLATIONS" -gt 0 || "$SECRETS" -gt 0 ]]; then
    EXIT_CODE=1
  fi
else
  report "No warden audit log found (expected at $WARDEN_LOG)"
fi

# 2. Scan opencode session logs for secrets
if [[ -d "$OPENDATA_DIR" ]]; then
  SECRET_PATTERNS=(
    'ghp_[a-zA-Z0-9]\{36\}'
    'gho_[a-zA-Z0-9]\{36\}'
    'ghu_[a-zA-Z0-9]\{36\}'
    'ghs_[a-zA-Z0-9]\{36\}'
    'sk-[a-zA-Z0-9]\{32,\}'
    'AKIA[0-9A-Z]\{16\}'
    '-----BEGIN .* PRIVATE KEY-----'
  )

  TOTAL_HITS=0
  for pattern in "${SECRET_PATTERNS[@]}"; do
    HITS=$(grep -rn "$pattern" "$OPENDATA_DIR" 2>/dev/null | grep -v ".log:" | wc -l || echo 0)
    TOTAL_HITS=$((TOTAL_HITS + HITS))
  done

  if [[ "$TOTAL_HITS" -gt 0 ]]; then
    report "WARNING: $TOTAL_HITS potential secret leaks found in session logs"
    EXIT_CODE=1
  else
    report "No secret leaks detected in session logs"
  fi
fi

# 3. Scan for bypass events in project git log
if git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  BYPASS_COMMITS=$(git -C "$PROJECT_ROOT" log --oneline --grep="no-verify\|skip ci\|NO_VERIFY\|SKIP_CI" 2>/dev/null | wc -l)
  if [[ "$BYPASS_COMMITS" -gt 0 ]]; then
    report "WARNING: $BYPASS_COMMITS commits with bypass flags in history"
    report "Run: git log --oneline --grep='no-verify\|skip ci'"
    EXIT_CODE=1
  fi
fi

# 4. Check security violations log
if [[ -f "$VIOLATIONS_LOG" ]]; then
  VIOLATION_COUNT=$(wc -l < "$VIOLATIONS_LOG")
  report "Security violations log: $VIOLATION_COUNT entries"
fi

report ""
if [[ "$EXIT_CODE" -eq 0 ]]; then
  report "=== Scan Complete: PASS ==="
else
  report "=== Scan Complete: ISSUES FOUND ==="
fi

exit "$EXIT_CODE"
