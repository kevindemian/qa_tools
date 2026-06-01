#!/usr/bin/env bash
# verify-mocks.sh — Verifica se mocks manuais em __mocks__/ estão sincronizados
# com as implementações reais. Falha se detectar drift (assinatura faltante).
set -euo pipefail

cd "$(dirname "$0")/.."

ERRORS=0

# 1. Verifica se todos os métodos do Logger real existem no mock
echo "=== shared/__mocks__/logger.ts ==="
REAL_LOGGER_METHODS=$(grep -E '^\s+(async\s+)?[a-zA-Z]+\(' shared/logger.ts | grep -v constructor | sed 's/.*//' | awk '{print $1}')
# Extract method names from the real Logger class
grep -E '^\s+(async\s+)?[a-zA-Z]+\(' shared/logger.ts | while read -r line; do
  method=$(echo "$line" | sed -E 's/^\s+(async\s+)?([a-zA-Z]+)\(.*/\2/')
  if ! grep -q "$method" shared/__mocks__/logger.ts 2>/dev/null; then
    echo "  MISSING: method '$method' not found in __mocks__/logger.ts"
    ERRORS=$((ERRORS + 1))
  fi
done

# 2. Verifica se withSpinner aceita 3 params no mock
echo "=== shared/__mocks__/prompt.ts ==="
if grep -q 'withSpinner' shared/__mocks__/prompt.ts; then
  WITH_SPINNER_PARAMS=$(grep -A1 'withSpinner' shared/__mocks__/prompt.ts | grep -E 'jest\.fn' | head -1)
  if echo "$WITH_SPINNER_PARAMS" | grep -q 'jest.fn()' 2>/dev/null; then
    echo "  WARNING: withSpinner mock is bare jest.fn() — accepts any args"
  fi
fi

# 3. Verifica se ProgressBar tem update e stop no mock
echo "=== ProgressBar mock ==="
if grep -q 'ProgressBar' shared/__mocks__/prompt.ts 2>/dev/null; then
  for method in update stop; do
    if ! grep -q "$method" shared/__mocks__/prompt.ts 2>/dev/null; then
      echo "  MISSING: ProgressBar.$method in mock"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS mock drift(s) detected."
  exit 1
fi

echo "OK: no mock drift detected."
