#!/usr/bin/env bash
# Filter ts-prune output: suppress false positives ("used in module")
# and known intentional exports (public API, test fixtures, deprecated re-exports).
# Exits with 1 only when NEW (unexpected) unused exports are detected.
set -o pipefail

output=$(npx ts-prune -e 2>&1 \
  | grep -v "used in module" \
  | grep -v "^jira_management/main\.ts:" \
  | grep -v "^shared/llm-metrics\.ts:" \
  | grep -v "^shared/report-generator\.ts:" \
  | grep -v "^jira_management/commands/case17\.ts:" \
  | grep -v "^jira_management/commands/helpers\.ts:")

ts_exit=${PIPESTATUS[0]}

if [ -n "$output" ]; then
  echo "$output"
  exit "$ts_exit"
fi

exit 0
