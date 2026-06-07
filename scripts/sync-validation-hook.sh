#!/bin/bash
set -euo pipefail

# Sync ~/.config/opencode/validation_hook.ts -> .config/validation_hook.ts
# Run this after any legitimate modification to the validation hook.

SRC="$HOME/.config/opencode/validation_hook.ts"
DST=".config/validation_hook.ts"

if [ ! -f "$SRC" ]; then
    echo "❌ Source not found: $SRC"
    exit 1
fi

cp "$SRC" "$DST"

echo "✅ Synced $SRC -> $DST"
echo ""
echo "Next step: git add .config/validation_hook.ts && git commit"
