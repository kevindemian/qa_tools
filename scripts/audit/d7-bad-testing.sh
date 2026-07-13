#!/usr/bin/env bash
# D7: Bad Testing Practices Audit — verificação determinística dos 7 padrões
# Uso: bash scripts/audit/d7-bad-testing.sh [--source <path>] [--tests <path>]
#      bash scripts/audit/d7-bad-testing.sh --all        (varre shared/, scripts/, jira_management/, git_triggers/)
#      bash scripts/audit/d7-bad-testing.sh --feature <name>  (varre shared/<name>.ts + tests)
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
SOURCE_DIR=""
TEST_DIR=""
SEARCH_DIR=""
RUN_ALL=false
FEATURE_NAME=""
TEST_FILE_PBT=""
PASS=0
FAIL=0
SKIP=0

# ── Help ────────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
D7: Bad Testing Practices Audit

Uso:
  --source <path>    Caminho do fonte (opcional, sem = varre codebase)
  --tests <path>     Caminho dos testes (opcional)
  --feature <name>   Feature única (ex: health-score)
  --all              Varredura completa em shared/ scripts/ jira_management/ git_triggers/
  --help             Esta mensagem

Exemplos:
  d7-bad-testing.sh --feature health-score
  d7-bad-testing.sh --all
EOF
    exit 0
}

# ── Parse args ──────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SOURCE_DIR="$2"; shift 2 ;;
        --tests) TEST_DIR="$2"; shift 2 ;;
        --feature) FEATURE_NAME="$2"; shift 2 ;;
        --all) RUN_ALL=true; shift ;;
        --help|-h) usage ;;
        *) echo "ERRO: flag desconhecida: $1"; usage ;;
    esac
done

if $RUN_ALL; then
    SEARCH_DIR="shared scripts jira_management git_triggers"
elif [[ -n "$FEATURE_NAME" ]]; then
    SOURCE_DIR="shared/${FEATURE_NAME}.ts"
    TEST_DIR="shared/${FEATURE_NAME}.test.ts shared/__tests__/${FEATURE_NAME}.test.ts"
    TEST_FILE_PBT="shared/__tests__/${FEATURE_NAME}.property.test.ts"
fi

# Build deduplicated search paths
ALL_SOURCE="${SOURCE_DIR:-$SEARCH_DIR}"
ALL_TESTS="${TEST_DIR:-$SEARCH_DIR}"
# Exclude the script itself and fixtures (fixtures are intentional violations for testing)
EXCLUDE_PATHS="--exclude=d7-bad-testing.sh --exclude=audit-help.sh --exclude='*.bak' --exclude-dir=__fixtures__"

# ── Result helpers ──────────────────────────────────────────────────────────────
GLOBAL_FAILED=false

check() {
    local id="$1"
    local label="$2"
    local cmd="$3"
    local inverted="${4:-false}"
    echo "  D7.$id — $label"
    set +e
    local output
    output=$(eval "$cmd" 2>/dev/null | tr -d '\0' | sort -u)
    set -e
    if $inverted; then
        # inverted: output = requirement met (PASS), no output = missing (FAIL)
        if [[ -n "$output" ]]; then
            echo "    ✅ PASS"
            PASS=$((PASS + 1))
        else
            echo "    ❌ FAIL — padrão obrigatório ausente"
            FAIL=$((FAIL + 1))
            GLOBAL_FAILED=true
        fi
    else
        if [[ -z "$output" ]]; then
            echo "    ✅ PASS"
            PASS=$((PASS + 1))
        else
            echo "    ❌ FAIL — violações encontradas:"
            echo "$output" | while IFS= read -r line; do
                echo "       $line"
            done
            FAIL=$((FAIL + 1))
            GLOBAL_FAILED=true
        fi
    fi
}

check_files() {
    local id="$1"
    local label="$2"
    local files="$3"
    local cmd="$4"
    echo "  D7.$id — $label"
    set +e
    local violacoes=""
    local f
    for f in $files; do
        [[ -f "$f" ]] || continue
        local result
        result=$(eval "$cmd" 2>/dev/null | tr -d '\0')
        if [[ -n "$result" ]]; then
            violacoes+="$result"$'\n'
        fi
    done
    set -e
    if [[ -z "$violacoes" ]]; then
        echo "    ✅ PASS"
        PASS=$((PASS + 1))
    else
        echo "    ❌ FAIL — violações encontradas:"
        echo "$violacoes" | sort -u | while IFS= read -r line; do
            [[ -n "$line" ]] && echo "       $line"
        done
        FAIL=$((FAIL + 1))
        GLOBAL_FAILED=true
    fi
}

# ── Header ──────────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════"
echo "  D7 — BAD TESTING PRACTICES AUDIT"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Expect count per file ────────────────────────────────────────────────────
check_files "2" "Expect count >= test count (por arquivo)" "${ALL_TESTS}" \
    't=$(grep -cP "^\s*(it|test)\(" "$f" 2>/dev/null || echo 0); e=$(grep -cP "expect\(" "$f" 2>/dev/null || echo 0); [ "$e" -lt "$t" ] && echo "$f: expects($e) < tests($t)"'

# ── 2. Coverage suppressors ────────────────────────────────────────────────────
check "12" "Coverage suppressors (istanbul/c8/v8/nyc)" \
    "grep -rnP ${EXCLUDE_PATHS} '/\\*\\s*istanbul\\s+ignore|c8\\s+ignore|v8\\s+ignore|nyc\\s+(disable|ignore)|coverage-disable' ${ALL_SOURCE} ${ALL_TESTS} 2>/dev/null || true"

# ── 3. Empty test bodies ────────────────────────────────────────────────────────
check "13" "Testes vazios (corpo {})" \
    "grep -rnP ${EXCLUDE_PATHS} '(it|test)\\s*\\(\\s*[\\x27\"]+[^\\x27\"]+[\\x27\"]+\\s*,\\s*(async\\s*)?\\s*\\(\\s*\\)\\s*=>\\s*\\{\\s*\\}' ${ALL_TESTS} 2>/dev/null || true"

# ── 4. Trivial/tautological assertions ──────────────────────────────────────────
# TC_BOOL=true|false  TC_NUM=-?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)
# TC_DQ=\x22(?:[^\x22\\]|\\.)*\x22  TC_SQ=\x27(?:[^\x27\\]|\\.)*\x27  TC_TL=\x60(?:[^\x60\\]|\\.)*\x60  TC_NULL=null|undefined
# Branch-reset (?|...) garante \1 sempre o literal capturado em cada alternativa
check "14" "Tautologia literal (bool|num|string|template|null|undefined)" \
    "grep -rnP ${EXCLUDE_PATHS} '(?|expect\((true|false)\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\)|expect\((-?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+))\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\)|expect\(\x22((?:[^\x22\\]|\\.)*)\x22\)\.to(?:Be|Equal|StrictEqual)\(\s*\x22\1\x22\s*\)|expect\(\x27((?:[^\x27\\]|\\.)*)\x27\)\.to(?:Be|Equal|StrictEqual)\(\s*\x27\1\x27\s*\)|expect\(\x60((?:[^\x60\\]|\\.)*)\x60\)\.to(?:Be|Equal|StrictEqual)\(\s*\x60\1\x60\s*\)|expect\((null|undefined)\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\))' ${ALL_TESTS} 2>/dev/null || true"

check "14b" "expect.assertions(0)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\.assertions\\s*\\(\\s*0\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14c" "Tautologia: expect(x).toBe(x)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(([a-zA-Z_]\\w*)\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\1\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

# ── 5. toThrow without argument ─────────────────────────────────────────────────
check "5" "toThrow() sem argumento" \
    "grep -rnP ${EXCLUDE_PATHS} '(?<!\.not\.)toThrow\(\s*\)' ${ALL_TESTS} 2>/dev/null || true"

# ── 6. .skip detection ──────────────────────────────────────────────────────────
check "6" ".skip em describe/it/test (verificar se documentado)" \
    "grep -rnP ${EXCLUDE_PATHS} '(describe|it|test)\.skip\s*\(' ${ALL_TESTS} 2>/dev/null || true"

# ── 7. Cleanup present where vi.mock used ──────────────────────────────────────
check_files "8" "Cleanup presente onde vi.mock usado" "${ALL_TESTS}" \
    'if grep -qP "vi\.mock" "$f" 2>/dev/null; then if ! grep -qP "vi\.(clear|reset|restore)AllMocks" "$f" 2>/dev/null; then echo "MISSING cleanup: $f"; fi; fi'

# ── 8. PBT present (inverted: output = file exists = PASS) ─────────────────────
check "11" "PBT presente (property test file)" \
    "if [[ -n '${FEATURE_NAME}' ]]; then ls -1 'shared/__tests__/${FEATURE_NAME}.property.test.ts' 2>/dev/null; else find ${ALL_TESTS} -name '*.property.test.ts' 2>/dev/null; fi || true" \
    "true"

# ── 9. Catch suppressing test failure ───────────────────────────────────────────
check "15" "Catch silenciando falha de teste" \
    "grep -rnPz ${EXCLUDE_PATHS} '(?s)catch\\s*\\([^)]*\\)\\s*\\{\\s*//\\s*(ignore|skip|suppress|swallow|silence|test\\s+fail)' ${ALL_TESTS} 2>/dev/null || true"

# ── 10. Oracle Problem (git history) ────────────────────────────────────────────
check "16" "Oracle Problem — expected adapted to output (git log)" \
    "git log --oneline -20 2>/dev/null | grep -Pi 'update.*expected.*(match|reflect).*(actual|current|new)|change.*assertion.*to match.*actual|(adjust|fix|update).*test.*to match.*(returns|outputs)' || true"

# ── 11. Blind snapshot update ───────────────────────────────────────────────────
check "17" "Snapshot update sem review" \
    "grep -rnP ${EXCLUDE_PATHS} 'vitest\\s+(--update|-u)(?![^;]*after\\s+(review|inspect|check|verify))' ${ALL_SOURCE} ${ALL_TESTS} 2>/dev/null || true"

# ── 12. Snapshot update as fix (git history) ────────────────────────────────────
check "18" "Atualização de snapshot como fix (git log)" \
    "git log --oneline -20 2>/dev/null | grep -Pi 'update\\s+snapshot|fix\\s+test.*snapshot|snapshot.*update' || true"

# ── Summary ─────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  RESULTADO D7"
echo "══════════════════════════════════════════════════"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  SKIP: $SKIP"
if $GLOBAL_FAILED; then
    echo "  STATUS: ❌ VIOLAÇÕES ENCONTRADAS"
    exit 1
else
    echo "  STATUS: ✅ NENHUMA VIOLAÇÃO"
    exit 0
fi
