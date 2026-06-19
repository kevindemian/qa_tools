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
fi

# Build deduplicated search paths
ALL_SOURCE="${SOURCE_DIR:-$SEARCH_DIR}"
ALL_TESTS="${TEST_DIR:-$SEARCH_DIR}"
# Exclude the script itself and fixtures (fixtures are intentional violations for testing)
EXCLUDE_PATHS="--exclude=d7-bad-testing.sh --exclude-dir=__fixtures__"

# ── Result helpers ──────────────────────────────────────────────────────────────
GLOBAL_FAILED=false

check() {
    local id="$1"
    local label="$2"
    local cmd="$3"
    echo "  D7.$id — $label"
    set +e
    local output
    output=$(eval "$cmd" 2>/dev/null | tr -d '\0' | sort -u)
    set -e
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
}

# ── Header ──────────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════"
echo "  D7 — BAD TESTING PRACTICES AUDIT"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Coverage suppressors ────────────────────────────────────────────────────
check "12" "Coverage suppressors (istanbul/c8/v8/nyc)" \
    "grep -rnP ${EXCLUDE_PATHS} '/\\*\\s*istanbul\\s+ignore|c8\\s+ignore|v8\\s+ignore|nyc\\s+(disable|ignore)|coverage-disable' ${ALL_SOURCE} ${ALL_TESTS} 2>/dev/null || true"

# ── 2. Empty test bodies ────────────────────────────────────────────────────────
check "13" "Testes vazios (corpo {})" \
    "grep -rnP ${EXCLUDE_PATHS} '(it|test)\\s*\\(\\s*[\\x27\"]+[^\\x27\"]+[\\x27\"]+\\s*,\\s*(async\\s*)?\\s*\\(\\s*\\)\\s*=>\\s*\\{\\s*\\}' ${ALL_TESTS} 2>/dev/null || true"

# ── 3. Trivial/tautological assertions ──────────────────────────────────────────
check "14a" "expect(true).toBe(true) / expect(false).toBe(false)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(true\\)\\.toBe\\(true\\)|expect\\(false\\)\\.toBe\\(false\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14b" "expect.assertions(0)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\.assertions\\s*\\(\\s*0\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14c" "Tautologia: expect(x).toBe(x)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(([a-zA-Z_]\\w*)\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\1\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14d" "Tautologia numerica (42, -1, 3.14, 0xff)" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\((-?(?:(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?|0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+))\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\1\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14e" "Tautologia string \"...\"" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(\\x22((?:[^\\x22\\\\]|\\\\.)*)\\x22\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\x22\\1\\x22\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14f" "Tautologia string '\x27...\x27" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(\\x27((?:[^\\x27\\\\]|\\\\.)*)\\x27\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\x27\\1\\x27\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14g" "Tautologia template \`...\`" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\(\\x60((?:[^\\x60\\\\]|\\\\.)*)\\x60\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\x60\\1\\x60\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

check "14h" "Tautologia null/undefined" \
    "grep -rnP ${EXCLUDE_PATHS} 'expect\\((null|undefined)\\)\\.to(?:Be|Equal|StrictEqual)\\(\\s*\\1\\s*\\)' ${ALL_TESTS} 2>/dev/null || true"

# ── 4. Catch suppressing test failure ───────────────────────────────────────────
check "15" "Catch silenciando falha de teste" \
    "grep -rnPz ${EXCLUDE_PATHS} '(?s)catch\\s*\\([^)]*\\)\\s*\\{\\s*//\\s*(ignore|skip|suppress|swallow|silence|test\\s+fail)' ${ALL_TESTS} 2>/dev/null || true"

# ── 5. Oracle Problem (git history) ─────────────────────────────────────────────
check "16" "Oracle Problem — expected adapted to output (git log)" \
    "git log --oneline -20 2>/dev/null | grep -Pi 'update.*expected.*(match|reflect).*(actual|current|new)|change.*assertion.*to match.*actual|(adjust|fix|update).*test.*to match.*(returns|outputs)' || true"

# ── 6. Blind snapshot update ────────────────────────────────────────────────────
check "17" "Snapshot update sem review" \
    "grep -rnP ${EXCLUDE_PATHS} 'jest\\s+(--updateSnapshot|-u)(?![^;]*after\\s+(review|inspect|check|verify))' ${ALL_SOURCE} ${ALL_TESTS} 2>/dev/null || true"

# ── 7. Snapshot update as fix (git history) ─────────────────────────────────────
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
