#!/usr/bin/env bash
# Trace imports of shared/ in production code (excludes tests, node_modules)
# Usage: ./scripts/trace-shared-imports.sh

set -euo pipefail

SHARED_DIR="$(cd "$(dirname "$0")/../shared" && pwd)"
echo "=== Production files importing from shared/ ==="
grep -rn "from.*shared/.*;" . --include="*.ts" -l \
    | grep -v -E '(node_modules|\.test\.|\.spec\.|test\.ts)' \
    | sort -u

echo ""
echo "=== Shared modules NOT imported by any production file ==="
for f in "$SHARED_DIR"/*.ts; do
    basename "$f" .ts
done | sort -u > /tmp/shared-all.txt

# Find all imports from shared in production code
grep -roh "from '\.\./shared/[^']*'" . --include="*.ts" \
    | grep -v -E '(node_modules|\.test\.|\.spec\.|test\.ts)' \
    | sed "s|from '\.\./shared/||;s|'$||" \
    | sort -u > /tmp/shared-imported.txt

while IFS= read -r mod; do
    if ! grep -qxF "$mod" /tmp/shared-imported.txt; then
        # Check for index.ts re-exports
        imported_in_index=$(grep -c "from.*$mod" /tmp/shared-imported.txt || true)
        if [ "$imported_in_index" -eq 0 ]; then
            echo "  $mod"
        fi
    fi
done < /tmp/shared-all.txt

rm -f /tmp/shared-all.txt /tmp/shared-imported.txt
