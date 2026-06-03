#!/usr/bin/env bash
# Filter ts-prune output: suppress false positives and known exports.
# Exits with 1 only when NEW unused exports are detected (not in baseline).
set -o pipefail

BASELINE="scripts/.unused-exports-baseline"

output=$(npx ts-prune -e 2>&1 | grep -v "used in module" | grep -v "/__mocks__/" | grep -v "schema\.ts:" | grep -v "/index\.ts:" | grep -v "^shared/test-utils/" | grep -v "^shared/types\.ts:")

ts_exit=${PIPESTATUS[0]}

if [ -n "$output" ]; then
  if [ -f "$BASELINE" ]; then
    new_items=$(echo "$output" | grep -v -F -f "$BASELINE")
    if [ -z "$new_items" ]; then
      echo "[unused-exports] All items match baseline (ok)."
      exit 0
    fi
    echo "[unused-exports] NEW unused exports not in baseline:"
    echo "$new_items"
    exit 1
  fi
  echo "$output"
  exit 1
fi

exit 0
