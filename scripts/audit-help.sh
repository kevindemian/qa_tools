#!/usr/bin/env bash
# Audit helper — extração mecânica de evidências para auditoria funcional
# Uso: bash scripts/audit-help.sh test-impact
set -euo pipefail

FEATURE="${1:?Usage: $0 <feature-module-name>}"
SRC="shared/${FEATURE}.ts"
TEST="shared/${FEATURE}.test.ts"
TYPES="shared/types/*.ts"

echo "=========================================="
echo "  AUDIT HELPER — ${FEATURE}"
echo "=========================================="
echo ""

if [ ! -f "$SRC" ]; then
    echo "ERRO: $SRC não encontrado"
    exit 1
fi

echo "--- DIMENSÃO 7 — QUALIDADE DE TESTES ---"
echo ""

echo "7.1 - toBeDefined / toBeTruthy / toBeNull sem assert real"
if [ -f "$TEST" ]; then
    grep -n '\.toBeDefined\|\.toBeTruthy\|\.toBeNull' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "7.2 - Testes com zero expect calls (por describe/it)"
if [ -f "$TEST" ]; then
    total_expect=$(grep -c 'expect(' "$TEST" 2>/dev/null || echo 0)
    total_tests=$(grep -c 'it(' "$TEST" 2>/dev/null || echo 0)
    echo "  expect() calls: $total_expect"
    echo "  it() blocks: $total_tests"
fi
echo ""

echo "7.3 - Oracle Problem (expected values vs requirements)"
echo "  [ANÁLISE MANUAL REQUERIDA]"
echo ""

echo "7.4 - Mocks (vi.mock + vi.spyOn)"
if [ -f "$TEST" ]; then
    grep -n 'vi\.mock\|vi\.spyOn' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "7.5 - toThrow sem argumento"
if [ -f "$TEST" ]; then
    grep -n 'toThrow()' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "7.6 - .skip / .only"
if [ -f "$TEST" ]; then
    grep -n '\.skip\|\.only' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "7.7 - Nomes de teste"
if [ -f "$TEST" ]; then
    grep -n "it('\|describe('\|it(\"\|describe(\"" "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "7.8 - beforeEach/afterEach (determinismo)"
if [ -f "$TEST" ]; then
    grep -n 'beforeEach\|afterEach\|beforeAll\|afterAll' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "--- DIMENSÃO 1 — ISOLAMENTO DE TESTES ---"
echo ""

echo "1.1-1.6 - Operações fs em teste"
if [ -f "$TEST" ]; then
    grep -n 'fs\.\|writeFileSync\|readFileSync\|rmSync\|unlinkSync\|mkdirSync\|process\.cwd' "$TEST" 2>/dev/null || echo "  Nenhum"
fi
echo ""

echo "--- DIMENSÃO 2 — ROBUSTEZ ---"
echo ""

echo "2.1 - Contratos tipados exportados"
grep -n '^export \(interface\|type\|const enum\)' "$SRC" 2>/dev/null || echo "  Nenhum"
echo ""

echo "2.2 - Schemas (Zod, type guards)"
grep -n '\.parse\|z\.object\|z\.string\|z\.number\|z\.record\|z\.array' "$SRC" 2>/dev/null || echo "  Nenhum"
echo ""

echo "2.4 - Error handling (catch)"
grep -n 'catch' "$SRC" 2>/dev/null || echo "  Nenhum"
echo ""

echo "--- DIMENSÃO 3 — BOAS PRÁTICAS ---"
echo ""

echo "3.4 - Imports circulares"
for f in "$SRC" "$TEST"; do
    if [ -f "$f" ]; then
        echo "  $f:"
        grep -n "^import" "$f" 2>/dev/null | head -20
    fi
done
echo ""

echo "--- DIMENSÃO 4 — IMPLEMENTAÇÃO ---"
echo ""

echo "4.4 - Dead code: funções privadas não usadas"
grep -n '^function \|^const \w\+ = (' "$SRC" 2>/dev/null | head -30
echo ""

echo "--- T14 — SUPPRESSIONS ---"
echo ""

echo "as any / as unknown as / ! / @ts-ignore"
grep -n 'as any\|as unknown as\|@ts-ignore\|@ts-expect-error\|eslint-disable' "$SRC" 2>/dev/null || echo "  Nenhum"
echo ""

echo "--- T13 — DEAD CODE ---"
echo ""

echo "Funções/constantes não exportadas e não referenciadas"
grep -n '^function\|^const \w' "$SRC" 2>/dev/null | head -20
echo ""

echo "--- T18 — ERROR HANDLING (CATCH VAZIO) ---"
echo ""

grep -n 'catch\s*{' "$SRC" 2>/dev/null && grep -n 'catch\s*{' "$SRC" 2>/dev/null | head -3 || echo "  Nenhum catch sem binding"
grep -n 'catch\s*\(.*\)\s*{' "$SRC" 2>/dev/null | head -10

echo ""
echo "=========================================="
echo "  AUDIT HELPER CONCLUÍDO — ${FEATURE}"
echo "=========================================="
