#!/usr/bin/env bash
# sop-audit.sh — SOP deterministic audit executor
# Executa TODOS os comandos determinísticos de audit/functional/SOP.md
# Uso: bash scripts/audit/sop-audit.sh --feature <name> [flags]
#      bash scripts/audit/sop-audit.sh --all
#      bash scripts/audit/sop-audit.sh --dry-run --feature <name>
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
FEATURE_NAME=""
SOURCE=""
TEST_FILE_UNIT=""
TEST_FILE_INTEGRATION=""
TEST_FILE_PBT=""
CONSUMERS=""
RUN_ALL=false
DRY_RUN=false
RUN_PHASE=""
RUN_TSC=false
RUN_LINT=false
RUN_BUILD=false
EXCLUDE_PATHS="--exclude=d7-bad-testing.sh --exclude=sop-audit.sh --exclude-dir=__fixtures__ --exclude-dir=node_modules --exclude-dir=.audit --exclude-dir=.opencode --exclude-dir=.git --exclude-dir=internal_docs --exclude-dir=backups"
# Source-only: only .ts files, excluding tests and .bak
SRC_EXCLUDE="--include=*.ts --exclude=d7-bad-testing.sh --exclude=sop-audit.sh --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.js --exclude=*.bak --exclude-dir=__fixtures__ --exclude-dir=node_modules --exclude-dir=.audit --exclude-dir=.opencode --exclude-dir=.git --exclude-dir=internal_docs --exclude-dir=backups --exclude-dir=__tests__"

PASS=0
FAIL=0
SKIP=0
GLOBAL_FAILED=false

# ── Help ─────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
SOP Audit — Executor de comandos determinísticos do SOP
Uso: sop-audit.sh [flags]

Flags:
  --feature <name>       Feature única (ex: health-score)
  --source <path>        Caminho do fonte
  --test-unit <path>     Caminho do test unitário
  --test-integration <path>  Caminho do test de integração
  --test-pbt <path>      Caminho do test property-based
  --consumers <paths>    Caminhos dos consumidores (separados por espaço)
  --all                  Varredura completa
  --tsc                  Executa tsc --noEmit
  --lint                 Executa npm run lint
  --build                Executa npm run build
  --phase <N>            Executa apenas uma fase (0.1, 2, 3, 9, 11)
  --dry-run              Mostra comandos sem executar
  --help                 Esta mensagem

Exemplos:
  sop-audit.sh --feature health-score
  sop-audit.sh --feature health-score --tsc --lint
  sop-audit.sh --all
  sop-audit.sh --dry-run --feature metrics-adapter
EOF
    exit 0
}

# ── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --feature) FEATURE_NAME="$2"; shift 2 ;;
        --source) SOURCE="$2"; shift 2 ;;
        --test-unit) TEST_FILE_UNIT="$2"; shift 2 ;;
        --test-integration) TEST_FILE_INTEGRATION="$2"; shift 2 ;;
        --test-pbt) TEST_FILE_PBT="$2"; shift 2 ;;
        --consumers) CONSUMERS="$2"; shift 2 ;;
        --all) RUN_ALL=true; shift ;;
        --tsc) RUN_TSC=true; shift ;;
        --lint) RUN_LINT=true; shift ;;
        --build) RUN_BUILD=true; shift ;;
        --phase) RUN_PHASE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help|-h) usage ;;
        *) echo "ERRO: flag desconhecida: $1"; usage ;;
    esac
done

# ── Auto-resolve paths ─────────────────────────────────────────────────────
if [[ -n "$FEATURE_NAME" ]]; then
    : "${SOURCE:=shared/${FEATURE_NAME}.ts}"
    : "${TEST_FILE_UNIT:=shared/__tests__/${FEATURE_NAME}.test.ts}"
    : "${TEST_FILE_INTEGRATION:=shared/__tests__/integration/${FEATURE_NAME}.integration.test.ts}"
    : "${TEST_FILE_PBT:=shared/__tests__/${FEATURE_NAME}.property.test.ts}"
fi

if $RUN_ALL; then
    SEARCH_SOURCE="shared scripts jira_management git_triggers"
    SEARCH_TESTS="shared/__tests__"
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
cmd() {
    local label="$1"
    local cmd="$2"
    echo "  [SOP] $label"
    echo "    Comando: $cmd"
    if $DRY_RUN; then
        echo "    ⏭️  DRY RUN — não executado"
        SKIP=$((SKIP + 1))
        return 0
    fi
    set +e
    local output
    output=$(eval "$cmd" 2>/dev/null | tr -d '\0' | sort -u)
    set -e
    if [[ -z "$output" ]]; then
        echo "    ✅ PASS"
        PASS=$((PASS + 1))
    else
        echo "    ❌ FAIL:"
        echo "$output" | while IFS= read -r line; do
            [[ -n "$line" ]] && echo "       $line"
        done
        FAIL=$((FAIL + 1))
        GLOBAL_FAILED=true
    fi
}

cmd_presence() {
    local label="$1"
    local cmd="$2"
    echo "  [SOP] $label"
    echo "    Comando: $cmd"
    if $DRY_RUN; then
        echo "    ⏭️  DRY RUN — não executado"
        SKIP=$((SKIP + 1))
        return 0
    fi
    set +e
    local output
    output=$(eval "$cmd" 2>/dev/null | tr -d '\0')
    set -e
    if [[ -n "$output" ]]; then
        echo "    ✅ PASS (requisito atendido)"
        PASS=$((PASS + 1))
    else
        echo "    ❌ FAIL — padrão obrigatório ausente"
        FAIL=$((FAIL + 1))
        GLOBAL_FAILED=true
    fi
}

cmd_exitcode() {
    local label="$1"
    local cmd="$2"
    echo "  [SOP] $label"
    echo "    Comando: $cmd"
    if $DRY_RUN; then
        echo "    ⏭️  DRY RUN — não executado"
        SKIP=$((SKIP + 1))
        return 0
    fi
    set +e
    eval "$cmd" > /dev/null 2>&1
    local ec=$?
    set -e
    if [[ $ec -eq 0 ]]; then
        echo "    ✅ PASS (exit 0)"
        PASS=$((PASS + 1))
    else
        echo "    ❌ FAIL (exit $ec)"
        FAIL=$((FAIL + 1))
        GLOBAL_FAILED=true
    fi
}

cmd_info() {
    local label="$1"
    local cmd="$2"
    echo "  [SOP] $label"
    echo "    Comando: $cmd"
    if $DRY_RUN; then
        echo "    ⏭️  DRY RUN — não executado"
        SKIP=$((SKIP + 1))
        return 0
    fi
    set +e
    local output
    output=$(eval "$cmd" 2>/dev/null | tr -d '\0' | sort -u)
    set -e
    if [[ -n "$output" ]]; then
        echo "    ℹ️  INFO:"
        echo "$output" | while IFS= read -r line; do
            [[ -n "$line" ]] && echo "       $line"
        done
    else
        echo "    ℹ️  INFO — nenhum resultado"
    fi
    SKIP=$((SKIP + 1))
}

cmd_count() {
    local label="$1"
    local cmd="$2"
    local threshold="$3"
    echo "  [SOP] $label"
    echo "    Comando: $cmd"
    if $DRY_RUN; then
        echo "    ⏭️  DRY RUN — não executado"
        SKIP=$((SKIP + 1))
        return 0
    fi
    set +e
    local count
    count=$(eval "$cmd" 2>/dev/null | tr -d '[:space:]')
    count="${count:-0}"
    set -e
    if [[ "$count" -le "$threshold" ]] 2>/dev/null; then
        echo "    ✅ PASS ($count <= $threshold)"
        PASS=$((PASS + 1))
    else
        echo "    ❌ FAIL ($count > $threshold)"
        FAIL=$((FAIL + 1))
        GLOBAL_FAILED=true
    fi
}

section_header() {
    echo ""
    echo "─── $1 ───"
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 0.1 — Deep read & pre-scan (comandos determinísticos)
# ══════════════════════════════════════════════════════════════════════════════
run_phase_01() {
    local src="${SOURCE:-$SEARCH_SOURCE}"
    local tests=""
    for var in "$TEST_FILE_UNIT" "$TEST_FILE_INTEGRATION" "$TEST_FILE_PBT"; do
        [[ -n "$var" ]] && tests+="$var "
    done
    tests="${tests%% }"
    [[ -z "$tests" ]] && tests="$SEARCH_TESTS"
    [[ -z "$tests" ]] && tests=""
    [[ -z "$src" && -z "$SEARCH_SOURCE" ]] && { echo "  ⚠️  Sem source definido. Pule --feature ou --all."; return; }

    section_header "Phase 0.1 — Source scan"
    cmd "0.1.3 — Casts/suppressions" \
        "grep -rnP ${SRC_EXCLUDE} 'as any|as unknown|@ts-ignore|@ts-expect-error|eslint-disable' $src 2>/dev/null || true"
    cmd "0.1.4 — Object.entries propaga any" \
        "grep -rnP ${SRC_EXCLUDE} 'Object\.entries\(' $src 2>/dev/null || true"
    cmd "0.1.5 — I/O sem try/catch" \
        "grep -rnP ${SRC_EXCLUDE} 'readFile|writeFile|mkdir|unlink|existsSync' $src 2>/dev/null || true"
    cmd "0.1.6 — Catch vazio" \
        "grep -rnP ${SRC_EXCLUDE} 'catch\s*\{' $src 2>/dev/null || true"
    cmd "0.1.10 — DepWall: imports diretos de libs externas" \
        "grep -rnP ${SRC_EXCLUDE} \"^import .* from '\" $src 2>/dev/null | grep -vP '\.js|\.json' | grep -vP 'shared/deps' || true"
    cmd "0.1.12 — Constantes mágicas" \
        "grep -rnP ${SRC_EXCLUDE} '[^a-zA-Z]\d{4,}[^a-zA-Z]' $src 2>/dev/null || true"
    cmd "0.1.13 — Divisão sem guarda zero/NaN" \
        "grep -rnP ${SRC_EXCLUDE} '/ [a-zA-Z_]\w+' $src 2>/dev/null || true"
    cmd "0.1.14 — Object.values/keys/entries sem ?? {}" \
        "grep -rnP ${SRC_EXCLUDE} 'Object\.(values|keys|entries)\(' $src 2>/dev/null || true"
    cmd "0.1.15 — || 0 / || '' / || -1 (falsy fragility)" \
        "grep -rnP ${SRC_EXCLUDE} '\|\| 0\b|\|\| \"\"|\|\| -1' $src 2>/dev/null || true"
    cmd "0.1.17 — reduce sem initial value" \
        "grep -rnP ${SRC_EXCLUDE} '\.reduce\([^,)]*\)' $src 2>/dev/null || true"
    cmd "0.1.18 — JSON.parse(JSON.stringify(x))" \
        "grep -rnP ${SRC_EXCLUDE} 'JSON\.parse\(JSON\.stringify\(' $src 2>/dev/null || true"
    cmd "0.1.19 — typeof x === 'object' sem excluir null" \
        "grep -rnP ${SRC_EXCLUDE} \"typeof .* === 'object'\" $src 2>/dev/null || true"
    cmd "0.1.20 — for...in em array" \
        "grep -rnP ${SRC_EXCLUDE} 'for\s*\(.*\s+in\s+' $src 2>/dev/null || true"
    cmd "0.1.21 — new Date(string) sem validação" \
        "grep -rnP ${SRC_EXCLUDE} 'new Date\(' $src 2>/dev/null || true"
    cmd "0.1.22 — console.log/warn/error fora de logger" \
        "grep -rnP ${SRC_EXCLUDE} 'console\.(log|warn|error)' $src 2>/dev/null | grep -v 'logger.ts' | grep -v 'output.ts' || true"
    cmd "0.1.23 — Parâmetro reatribuído" \
        "grep -rnP ${SRC_EXCLUDE} '^\s+\w+\s*=\s*[a-z_A-Z]' $src 2>/dev/null | grep -vP '^\s+(const|let|var)' || true"
    cmd "0.1.24 — var vs let/const" \
        "grep -rnP ${SRC_EXCLUDE} '^var ' $src 2>/dev/null || true"
    cmd "0.1.25 — TODO/FIXME/HACK/XXX/WORKAROUND" \
        "grep -rnP ${SRC_EXCLUDE} 'TODO|FIXME|HACK|XXX|WORKAROUND' $src 2>/dev/null || true"

    if [[ -n "$tests" && "$tests" != *"__tests__"* ]] || $RUN_ALL; then
        section_header "Phase 0.1 — Test scan"
        cmd "0.1.T2 — Suppressions em testes" \
            "grep -rnP ${EXCLUDE_PATHS} 'as any|@ts-ignore|@ts-expect-error' $tests 2>/dev/null || true"
        cmd "0.1.T6 — .skip/.only/.todo em testes" \
            "grep -rnP ${EXCLUDE_PATHS} '(describe|it|test)\.(skip|only)\(' $tests 2>/dev/null || true"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — T1-T20 (comandos determinísticos)
# ══════════════════════════════════════════════════════════════════════════════
run_phase_2() {
    local src="${SOURCE:-$SEARCH_SOURCE}"
    [[ -z "$src" ]] && { echo "  ⚠️  Sem source definido."; return; }
    local feature="${FEATURE_NAME}"

    section_header "Phase 2 — T1-T20"
    cmd_presence "T1 — Entry point" \
        "grep -rnP ${EXCLUDE_PATHS} '^export function|^export const|^export class|^export default' $src 2>/dev/null || true"
    cmd_presence "T2 — Config model" \
        "grep -rnP ${EXCLUDE_PATHS} 'interface \w+|type \w+ =' $src 2>/dev/null || true"
    cmd_presence "T3 — Config accessor" \
        "grep -rnP ${EXCLUDE_PATHS} 'get(ter)?\s+\w+|^\s+static\s+get' $src 2>/dev/null || true"
    cmd_presence "T4 — Runtime lê config" \
        "grep -rnP ${EXCLUDE_PATHS} 'readConfig|readEnv|loadConfig' $src 2>/dev/null || true"
    cmd_presence "T5 — Wizard entry" \
        "grep -rnP ${EXCLUDE_PATHS} 'wizard|setup.*feature' $src 2>/dev/null || true"
    cmd_presence "T6 — Wizard detection" \
        "grep -rnP ${EXCLUDE_PATHS} 'detect.*context|auto.*detect' $src 2>/dev/null || true"
    cmd_presence "T7 — Wizard output" \
        "grep -rnP ${EXCLUDE_PATHS} 'write.*config|generate.*file' $src 2>/dev/null || true"
    cmd_presence "T8 — Wizard prompts" \
        "grep -rnP ${EXCLUDE_PATHS} 'prompt|question|ask' $src 2>/dev/null || true"
    if [[ -n "$feature" ]]; then
        cmd_presence "T10 — CI integration" \
            "grep -rnP ${EXCLUDE_PATHS} '$feature' .github/ --include='*.yml' --include='*.yaml' 2>/dev/null | head -5 || true"
    fi
    cmd_presence "T11 — CI safety" \
        "grep -rnP ${EXCLUDE_PATHS} 'try|catch|fallback' $src 2>/dev/null || true"
    cmd "T13 — Dead code (funções)" \
        "grep -roP '^function \K\w+' $src 2>/dev/null | while read fn; do count=\$(grep -rcP '\b\${fn}\b' $src 2>/dev/null || echo 0); [ \"\$count\" -le 1 ] && echo \"POSSIVELMENTE MORTO: \$fn (\$count refs)\"; done || true"
    if [[ -n "$feature" ]]; then
        cmd_info "T15 — Consumidores consistentes" \
            "grep -rlP '$feature' --include='*.ts' . 2>/dev/null | grep -v 'test' | grep -v 'node_modules' | sort -u || true"
    fi
    cmd_presence "T16 — CLI interface" \
        "grep -rnP ${EXCLUDE_PATHS} 'parseArgs|command|cli|yargs|commander' $src 2>/dev/null || true"
    cmd "T17 — Env var dependency" \
        "grep -rnP ${SRC_EXCLUDE} 'process\.env\[' $src 2>/dev/null || true"
    cmd_presence "T18 — Error handling (throws)" \
        "grep -rnP ${SRC_EXCLUDE} 'throw\s+(new\s+)?[A-Z]\w*(Error)?' $src 2>/dev/null || true"
    cmd "T18b — Catches vazios" \
        "grep -rnP ${SRC_EXCLUDE} 'catch\s*\{' $src 2>/dev/null || true"
    if [[ -n "$feature" ]]; then
        cmd_presence "T20 — CI/Config Contract" \
            "grep -rnP ${EXCLUDE_PATHS} '$feature' action.yml .github/ --include='*.yml' 2>/dev/null | head -5 || true"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 3 — D1-D13 (comandos determinísticos)
# ══════════════════════════════════════════════════════════════════════════════
run_phase_3() {
    local src="${SOURCE:-$SEARCH_SOURCE}"
    local tests="$TEST_FILE_UNIT $TEST_FILE_INTEGRATION $TEST_FILE_PBT"
    tests="${tests:-$SEARCH_TESTS}"
    [[ -z "$src" ]] && { echo "  ⚠️  Sem source definido."; return; }

    section_header "Phase 3 — D1: Isolamento de Testes"
    if [[ -n "$tests" ]]; then
        cmd_presence "D1.1-D1.4 — Cleanup/mock/reset em testes" \
            "grep -rnP ${EXCLUDE_PATHS} 'beforeEach|afterEach|vi\.mock|vi\.clearAllMocks|vi\.resetAllMocks|vi\.restoreAllMocks' $tests 2>/dev/null | head -20 || true"
    fi

    section_header "Phase 3 — D2: Robustez"
    cmd_presence "D2.1-D2.4 — Funções com parâmetros tipados" \
        "grep -rnP ${EXCLUDE_PATHS} '^(export )?function \w+\(.*:.*\)' $src 2>/dev/null | head -15 || true"

    section_header "Phase 3 — D3: Boas Práticas"
    cmd "D3.2 — DepWall (imports diretos de libs)" \
        "grep -rnP ${SRC_EXCLUDE} \"^import .* from '\" $src 2>/dev/null | grep -vP '\.js|\.json' | grep -vP 'shared/deps' || true"

    section_header "Phase 3 — D4: Implementação"
    cmd_info "D4.1 — Loops/iterators" \
        "grep -rnP ${SRC_EXCLUDE} 'for|while|map|filter|reduce|forEach' $src 2>/dev/null | head -20 || true"
    cmd_info "D4.6 — Complexidade (branching keywords por arquivo)" \
        "grep -rhP ${SRC_EXCLUDE} 'if|else|for|while|switch|catch' $src 2>/dev/null | awk '{print FILENAME}' | sort | uniq -c | sort -rn | head -10 || true"

    section_header "Phase 3 — D8: Domain Adequacy"
    cmd "D8.3 — NaN propagation (Math aninhado)" \
        "grep -rnP ${SRC_EXCLUDE} 'Math\.(floor|round|ceil|trunc)\(.*Math\.' $src 2>/dev/null || true"
    cmd "D8.4 — Falsy coalescence (|| 0 / || \"\")" \
        "grep -rnP ${SRC_EXCLUDE} '\|\| 0\b|\|\| \"\"\b|\|\| -1\b' $src 2>/dev/null || true"

    section_header "Phase 3 — D9: Numeric Safety"
    cmd "D9.1 — Divisão por variável" \
        "grep -rnP ${SRC_EXCLUDE} '/ [a-zA-Z_]\w+' $src 2>/dev/null || true"
    cmd "D9.2 — Object.values/keys/entries" \
        "grep -rnP ${SRC_EXCLUDE} 'Object\.(values|keys|entries)\(' $src 2>/dev/null || true"
    cmd "D9.5 — reduce sem initial value" \
        "grep -rnP ${SRC_EXCLUDE} '\.reduce\([^,)]*\)' $src 2>/dev/null || true"
    cmd "D9.6 — JSON.parse(JSON.stringify)" \
        "grep -rnP ${SRC_EXCLUDE} 'JSON\.parse\(JSON\.stringify\(' $src 2>/dev/null || true"
    cmd "D9.7 — for...in" \
        "grep -rnP ${SRC_EXCLUDE} 'for\s*\(.*\s+in\s+' $src 2>/dev/null || true"
    cmd "D9.8 — Math sem isFinite" \
        "grep -rnP ${SRC_EXCLUDE} 'Math\.(floor|round|ceil|trunc)\(' $src 2>/dev/null || true"

    section_header "Phase 3 — D10: Error & Async Integrity"
    cmd "D10.1 — Catch sem discriminação" \
        "grep -rnP ${SRC_EXCLUDE} '} catch \(' $src 2>/dev/null || true"
    cmd "D10.2 — return await" \
        "grep -rnP ${SRC_EXCLUDE} 'return await ' $src 2>/dev/null || true"
    cmd "D10.3 — Promise.all" \
        "grep -rnP ${SRC_EXCLUDE} 'Promise\.all\(' $src 2>/dev/null || true"
    cmd "D10.4 — Fire-and-forget (chamada sem await)" \
        "grep -rnP ${SRC_EXCLUDE} '^\s+\w+\(.*\)[^)]*\s*$' $src 2>/dev/null | grep -vP 'then|catch|await|return\b|typeof|instanceof' || true"
    cmd "D10.5 — instanceof" \
        "grep -rnP ${SRC_EXCLUDE} 'instanceof' $src 2>/dev/null || true"

    section_header "Phase 3 — D11: Data & String Integrity"
    cmd "D11.1 — new Date(string)" \
        "grep -rnP ${SRC_EXCLUDE} 'new Date\(' $src 2>/dev/null || true"
    cmd "D11.2 — typeof x === 'object' sem null check" \
        "grep -rnP ${SRC_EXCLUDE} \"typeof .* === 'object'\" $src 2>/dev/null || true"
    cmd "D11.3 — typeof === 'object' vs Array.isArray" \
        "grep -rnP ${SRC_EXCLUDE} \"typeof .* === 'object'\" $src 2>/dev/null || true"
    cmd "D11.4 — console em produção" \
        "grep -rnP ${SRC_EXCLUDE} 'console\.(log|warn|error)' $src 2>/dev/null | grep -vP 'logger\.ts|output\.ts' || true"
    cmd "D11.5 — Regex / match" \
        "grep -rnP ${SRC_EXCLUDE} 'new RegExp|\.match\(' $src 2>/dev/null || true"
    cmd "D11.6 — toLowerCase/toUpperCase" \
        "grep -rnP ${SRC_EXCLUDE} '\.toLowerCase\(\)|\.toUpperCase\(\)' $src 2>/dev/null || true"
    cmd "D11.7 — Imports que deveriam ser type-only" \
        "grep -rnP ${SRC_EXCLUDE} '^import .* from' $src 2>/dev/null | grep -vP 'import type\b' | head -20 || true"

    section_header "Phase 3 — D12: Environment & Platform Safety"
    cmd "D12.1 — Dependência circular" \
        "npx madge --circular $src 2>&1 | grep -E '^[a-z]' || true"
    cmd "D12.2 — process.env sem validação" \
        "grep -rnP ${SRC_EXCLUDE} 'process\.env\[' $src 2>/dev/null || true"
    cmd "D12.3 — path.resolve/join" \
        "grep -rnP ${SRC_EXCLUDE} 'path\.(resolve|join)\(' $src 2>/dev/null || true"
    cmd "D12.4 — import.meta" \
        "grep -rnP ${SRC_EXCLUDE} 'import\.meta\.(dirname|url)' $src 2>/dev/null || true"
    cmd "D12.5 — os.EOL / hardcoded \\n" \
        "grep -rnP ${SRC_EXCLUDE} 'os\.EOL|\\\\n' $src 2>/dev/null || true"

    section_header "Phase 3 — D13: Parameter & State Integrity"
    cmd "D13.1 — Parâmetros reatribuídos" \
        "grep -rnP ${SRC_EXCLUDE} '^\s+\w+\s*=\s*[a-z_A-Z]' $src 2>/dev/null | grep -vP '^\s+(const|let|var|this\.|import|type|interface|function)' || true"
    cmd "D13.2 — Assignment dentro de if" \
        "grep -rnP ${SRC_EXCLUDE} 'if \(.*\|\|.*=' $src 2>/dev/null || true"
    cmd "D13.3 — var hoisting" \
        "grep -rnP ${SRC_EXCLUDE} '^var ' $src 2>/dev/null || true"

    section_header "Phase 3 — D11.8: Type-only imports corretos"
    cmd_presence "D11.8 — Type imports corretos" \
        "grep -rnP ${SRC_EXCLUDE} '^import .* from' $src 2>/dev/null | grep -P '\btype\b' || true"
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 9 — Validação Final (comandos determinísticos)
# ══════════════════════════════════════════════════════════════════════════════
run_phase_9() {
    section_header "Phase 9 — Validação Final"
    if $RUN_TSC; then
        cmd_exitcode "9.1 — TypeScript" "npx tsc --noEmit"
    fi
    if $RUN_LINT; then
        cmd_exitcode "9.2 — Lint" "npm run lint"
    fi
    if $RUN_BUILD; then
        cmd_exitcode "9.4 — Build" "npm run build"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 11 — Quality Gate (comandos determinísticos)
# ══════════════════════════════════════════════════════════════════════════════
run_phase_11() {
    local src="${SOURCE:-$SEARCH_SOURCE}"

    section_header "Phase 11 — Quality Gate"
    cmd "11.1 — Hardcoded secrets" \
        "grep -rnP ${EXCLUDE_PATHS} '(password|secret|token|api.?key|credential)\s*[:=]\s*['\"][^'\"]+['\"]' $src 2>/dev/null || true"
}

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════"
echo "  SOP AUDIT — Deterministic Checks"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [[ -n "$FEATURE_NAME" ]]; then echo "  Feature: $FEATURE_NAME"; fi
if $DRY_RUN; then echo "  Modo: DRY RUN"; fi
echo "══════════════════════════════════════════════════"

if [[ -n "$RUN_PHASE" ]]; then
    case "$RUN_PHASE" in
        0.1) run_phase_01 ;;
        2) run_phase_2 ;;
        3) run_phase_3 ;;
        9) run_phase_9 ;;
        11) run_phase_11 ;;
        *) echo "Fase inválida: $RUN_PHASE. Use: 0.1, 2, 3, 9, 11"; exit 1 ;;
    esac
else
    # Run all phases (deterministic only)
    run_phase_01
    run_phase_2
    run_phase_3
    run_phase_9
    run_phase_11
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  RESULTADO SOP AUDIT"
echo "══════════════════════════════════════════════════"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  SKIP: $SKIP"
if $GLOBAL_FAILED; then
    echo "  STATUS: ❌ VIOLAÇÕES ENCONTRADAS"
    echo ""
    echo "  ▶ Corrigir causas raiz (Phase 6) ou registrar gaps (Phase 4)"
    exit 1
else
    echo "  STATUS: ✅ NENHUMA VIOLAÇÃO"
    exit 0
fi
