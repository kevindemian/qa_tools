#!/bin/bash
set -euo pipefail

# Sync ~/.config/opencode/validation_hook.ts -> .config/validation_hook.ts
# and recalculate validation-hook.expected-hash.
# Run this after any legitimate modification to the validation hook.

SRC="$HOME/.config/opencode/validation_hook.ts"
DST=".config/validation_hook.ts"
HASHFILE=".config/validation-hook.expected-hash"

if [ ! -f "$SRC" ]; then
    echo "❌ Source not found: $SRC"
    exit 1
fi

cp "$SRC" "$DST"
sha256sum "$DST" | cut -d' ' -f1 > "$HASHFILE"

echo "✅ Synced $SRC -> $DST"
echo "   Hash: $(cat "$HASHFILE")"
echo ""
echo "Next step: git add .config/validation_hook.ts .config/validation-hook.expected-hash && git commit"
