#!/usr/bin/env bash
# Check for available dependency updates (informational only).
# Runs in pre-commit as a WARNING — never blocks commits.

OUTDATED=$(npm outdated --json 2>/dev/null)
if [ -z "$OUTDATED" ] || [ "$OUTDATED" = "{}" ]; then
    echo "✅ All dependencies up to date."
    exit 0
fi

COUNT=$(echo "$OUTDATED" | grep -c '"wanted"' || echo "0")
echo ""
echo "📦 ${COUNT} update(s) available. Run 'npm outdated' for details."
echo ""
