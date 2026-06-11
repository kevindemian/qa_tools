#!/usr/bin/env bash
# =============================================================================
# opencode-guard.sh — OpenCode Security Guard Daemon
# =============================================================================
#
# Monitora arquivos de config/lint/CI/segurança em tempo real.
# Ao detectar alteração, classifica a severidade e ALERTA O USUÁRIO.
#
# INSTALAÇÃO (uma vez):
#   sudo apt install -y inotify-tools libnotify-bin
#   systemctl --user enable --now opencode-guard
#
# MODOS:
#   (sem args)  → daemon: monitora em loop infinito
#   --oneshot   → verifica uma vez e sai (cron / manual)
#   --report    → exibe os ultimos N alertas (padrao 20)
#   --check     → verifica dependencias e estado
# =============================================================================

set -euo pipefail

# ────────────────────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCODE_CONFIG="${HOME:-/home/coder}/.config/opencode"
GUARD_DIR="$PROJECT_ROOT/.opencode/guard"
BASELINE_FILE="$GUARD_DIR/baseline.sha256"
LOG_FILE="$GUARD_DIR/guard.log"
LOCK_FILE="$GUARD_DIR/guard.pid"
POLL_INTERVAL=2

mkdir -p "$GUARD_DIR"

# ────────────────────────────────────────────────────────────────────────────
# ARQUIVOS MONITORADOS (3 SEVERIDADES)
# ────────────────────────────────────────────────────────────────────────────

CRITICAL=(
  "$PROJECT_ROOT/opencode.json"
  "$OPENCODE_CONFIG/opencode.jsonc"
  "$OPENCODE_CONFIG/validation_hook.ts"
  "$OPENCODE_CONFIG/plugin/validation_plugin.ts"
  "$PROJECT_ROOT/.env"
  "$PROJECT_ROOT/package.json"
  "$PROJECT_ROOT/.githooks/pre-push"
)

SAFETY=(
  "$PROJECT_ROOT/eslint.config.mjs"
  "$PROJECT_ROOT/tsconfig.json"
  "$PROJECT_ROOT/tsconfig.build.json"
  "$PROJECT_ROOT/vitest.config.ts"
  "$PROJECT_ROOT/jest.config.js"
  "$PROJECT_ROOT/.github/workflows/ci.yml"
  "$PROJECT_ROOT/.github/workflows/publish.yml"
  "$PROJECT_ROOT/.github/dependabot.yml"
  "$PROJECT_ROOT/.gitlab-ci.yml"
  "$PROJECT_ROOT/scripts/quality-gate.ts"
  "$PROJECT_ROOT/scripts/quality-check.ts"
)

CONFIG=(
  "$PROJECT_ROOT/AGENTS.md"
  "$PROJECT_ROOT/.gitignore"
  "$PROJECT_ROOT/qa-quarantine.json"
  "$PROJECT_ROOT/.opencode/opencode-warden.json"
  "$PROJECT_ROOT/.opencode/validation.json"
  "$PROJECT_ROOT/config/projects.json"
  "$PROJECT_ROOT/config/providers.json"
  "$PROJECT_ROOT/config/reviewers.json"
)

ALL_FILES=("${CRITICAL[@]}" "${SAFETY[@]}" "${CONFIG[@]}")

# AGENT_FILES (glob) — resolvido em tempo de execucao
AGENT_FILES=()
for f in "$PROJECT_ROOT/.opencode/agents/"*.md; do
  [[ -f "$f" ]] && AGENT_FILES+=("$f")
done
ALL_FILES+=("${AGENT_FILES[@]}")

declare -A SEVERITY_MAP
for f in "${CRITICAL[@]}"; do SEVERITY_MAP[$f]="CRITICAL"; done
for f in "${SAFETY[@]}";   do SEVERITY_MAP[$f]="SAFETY";   done
for f in "${CONFIG[@]}";   do SEVERITY_MAP[$f]="CONFIG";   done
for f in "${AGENT_FILES[@]}"; do
  [[ -z "${SEVERITY_MAP[$f]-}" ]] && SEVERITY_MAP[$f]="CONFIG"
done

# ────────────────────────────────────────────────────────────────────────────
# HELPERS
# ────────────────────────────────────────────────────────────────────────────

log() {
  local level="$1" msg="$2"
  echo "$(date -Iseconds) | $level | $msg" >> "$LOG_FILE"
  echo "[$level] $msg" >&2
}

notify() {
  local urgency="$1" summary="$2" body="$3"
  if command -v notify-send &>/dev/null; then
    notify-send -u "$urgency" "opencode-guard: $summary" "$body" 2>/dev/null || true
  fi
  log "$urgency" "$summary — $body"
  if command -v logger &>/dev/null; then
    logger -t opencode-guard "[$urgency] $summary — $body"
  fi
}

classify_file() {
  local path="$1"
  for f in "${CRITICAL[@]}"; do [[ "$path" == "$f" ]] && echo "CRITICAL" && return; done
  for f in "${SAFETY[@]}";  do [[ "$path" == "$f" ]] && echo "SAFETY"   && return; done
  for f in "${CONFIG[@]}";  do [[ "$path" == "$f" ]] && echo "CONFIG"   && return; done
  # Check agent files (glob pattern)
  if [[ "$path" == "$PROJECT_ROOT/.opencode/agents/"*.md ]]; then echo "CONFIG"; return; fi
  echo ""
}

is_monitored() {
  local result
  result=$(classify_file "$1")
  [[ -n "$result" ]]
}

# ────────────────────────────────────────────────────────────────────────────
# BASELINE (SHA256 SNAPSHOT)
# ────────────────────────────────────────────────────────────────────────────

compute_baseline() {
  > "$BASELINE_FILE"
  for f in "${ALL_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      sha256sum "$f" 2>/dev/null >> "$BASELINE_FILE"
    fi
  done
  log "INFO" "Baseline salva: $(wc -l < "$BASELINE_FILE") arquivos"
}

baseline_hash() {
  local file="$1"
  grep -F "$file" "$BASELINE_FILE" 2>/dev/null | cut -d' ' -f1 || echo ""
}

update_baseline() {
  local file="$1"
  if [[ -f "$file" ]]; then
    sed -i "\|$file|d" "$BASELINE_FILE" 2>/dev/null || true
    sha256sum "$file" >> "$BASELINE_FILE"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# DIFF / ANALISE
# ────────────────────────────────────────────────────────────────────────────

diff_file() {
  local file="$1"
  # Try git diff first (tracked files)
  local rel="${file#$PROJECT_ROOT/}"
  if git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
    local tracked
    tracked=$(git -C "$PROJECT_ROOT" ls-files "$rel" 2>/dev/null)
    if [[ -n "$tracked" ]]; then
      git -C "$PROJECT_ROOT" diff HEAD -- "$rel" 2>/dev/null || true
      return
    fi
  fi
  # Untracked: diff against backup if exists
  local backup="$GUARD_DIR/backups/$rel"
  if [[ -f "$backup" ]]; then
    diff -u "$backup" "$file" 2>/dev/null || true
  fi
}

save_backup() {
  local file="$1"
  local rel="${file#$PROJECT_ROOT/}"
  local backup_dir="$GUARD_DIR/backups/$(dirname "$rel")"
  mkdir -p "$backup_dir"
  if [[ -f "$file" ]]; then
    cp "$file" "$GUARD_DIR/backups/$rel"
  fi
}

analyze_change() {
  local file="$1" sev="$2"

  # Analisa o CONTEUDO ATUAL do arquivo em vez do diff (mais preciso)
  local analysis="$sev"

  case "$file" in
    *opencode.json*|*opencode.jsonc*)
      # Analisa APENAS o top-level "permission" usando JSON parser (preciso)
      analysis=$(python3 -c "
import json, sys
try:
    with open('$file') as f:
        d = json.load(f)
    p = d.get('permission', {})
    dangerous = ['edit', 'bash', 'webfetch', 'websearch', 'share']
    findings = [k for k in dangerous if isinstance(p.get(k), str) and p[k] == 'allow']
    if isinstance(p.get('edit'), dict) and '*' in p['edit'] and p['edit']['*'] == 'allow':
        findings.append('edit[*]')
    if isinstance(p.get('bash'), dict) and '*' in p['bash'] and p['bash']['*'] == 'allow':
        findings.append('bash[*]')
    if findings:
        print('CRITICAL: allow perigoso em ' + ', '.join(findings))
    else:
        print('Permissoes restritivas (ok)')
except Exception as e:
    print('ERRO ao analisar: ' + str(e))
" 2>/dev/null) || analysis="ERRO ao analisar JSON"
      ;;
    *tsconfig.json*)
      if grep -q '"strict"[[:space:]]*:[[:space:]]*false' "$file" 2>/dev/null; then
        analysis="strict mode DESLIGADO"
      elif grep -q '"strict"[[:space:]]*:[[:space:]]*true' "$file" 2>/dev/null; then
        analysis="strict mode ligado (ok)"
      else
        analysis="strict mode ausente ou alterado"
      fi
      if grep -q '"noUncheckedIndexedAccess"[[:space:]]*:[[:space:]]*false' "$file" 2>/dev/null; then
        analysis="$analysis, noUncheckedIndexedAccess DESLIGADO"
      fi
      ;;
    *tsconfig.build.json*)
      if grep -q '"strict"[[:space:]]*:[[:space:]]*false' "$file" 2>/dev/null; then
        analysis="tsconfig.build: strict mode DESLIGADO"
      fi
      ;;
    *eslint.config*)
      analysis="Regras de lint alteradas"
      ;;
    *vitest.config*|*jest.config*)
      if grep -q 'coverage' "$file" 2>/dev/null; then
        analysis="Config de cobertura alterada"
      else
        analysis="Config de teste alterada"
      fi
      ;;
    *ci.yml*|*gitlab-ci*)
      analysis="Pipeline CI modificado"
      ;;
    *dependabot*)
      analysis="Dependabot config alterado"
      ;;
    *pre-push*)
      if grep -q "exit 0" "$file" 2>/dev/null && ! grep -q "inotifywait\|--no-verify\|guard\|SECURITY" "$file" 2>/dev/null; then
        analysis="Hook de seguranca ENFRAQUECIDO (exit 0)"
      fi
      ;;
    *.env)
      analysis="Variaveis de ambiente alteradas"
      ;;
    *quality-gate*|*quality-check*)
      analysis="Quality gate alterado"
      ;;
    *warden*|*validation*)
      analysis="Plugin de seguranca alterado"
      ;;
  esac

  echo "$analysis"
}

# ────────────────────────────────────────────────────────────────────────────
# PROCESSAMENTO DE EVENTO
# ────────────────────────────────────────────────────────────────────────────

handle_change() {
  local path="$1" event="$2"
  local sev
  sev=$(classify_file "$path")
  [[ -z "$sev" ]] && return

  local old_hash new_hash analysis body icon
  old_hash=$(baseline_hash "$path")
  new_hash=$(sha256sum "$path" 2>/dev/null | cut -d' ' -f1 || echo "")
  analysis=$(analyze_change "$path" "$sev")
  body="$path | $event | hash: ${old_hash:0:12} → ${new_hash:0:12}"

  case "$sev" in
    CRITICAL) icon="🔥" ; urgency="critical" ;;
    SAFETY)   icon="🟡" ; urgency="normal"   ;;
    CONFIG)   icon="🔵" ; urgency="low"      ;;
  esac

  notify "$urgency" "$icon [$sev] $analysis" "$body"
  save_backup "$path"
  update_baseline "$path"
}

# ────────────────────────────────────────────────────────────────────────────
# MODOS DE OPERACAO
# ────────────────────────────────────────────────────────────────────────────

cmd_check() {
  echo "=== opencode-guard: Verificacao ==="
  echo "Project: $PROJECT_ROOT"
  echo "PID file: $(cat "$LOCK_FILE" 2>/dev/null || echo 'stopped')"
  echo ""
  echo "Dependencies:"
  command -v inotifywait &>/dev/null && echo "  inotifywait: OK" || echo "  inotifywait: FALTA (apt install inotify-tools)"
  command -v notify-send &>/dev/null && echo "  notify-send: OK" || echo "  notify-send: FALTA (apt install libnotify-bin)"
  command -v logger &>/dev/null && echo "  logger:      OK" || echo "  logger:      OK (busybox)"
  echo ""
  echo "Monitored files: ${#ALL_FILES[@]}"
  local existing=0
  for f in "${ALL_FILES[@]}"; do [[ -f "$f" ]] && ((existing++)) || true; done
  echo "  Existentes: $existing"
  echo "  Ausentes:   $((${#ALL_FILES[@]} - existing))"
  echo ""
  echo "Container (opencode-qa):"
  cmd_container | sed 's/^/  /'
  echo ""
  if [[ -f "$LOG_FILE" ]]; then
    echo "Ultimos 10 eventos:"
    tail -10 "$LOG_FILE"
  fi
}

cmd_report() {
  local n="${1:-20}"
  if [[ ! -f "$LOG_FILE" ]]; then
    echo "Nenhum alerta registrado."
    return
  fi
  echo "=== opencode-guard: Ultimos $n alertas ==="
  echo "Log: $LOG_FILE"
  echo ""
  tail -"$n" "$LOG_FILE" | while IFS=' | ' read -r ts level msg; do
    case "$level" in
      CRITICAL|critical) prefix="🔴" ;;
      SAFETY|normal)     prefix="🟡" ;;
      CONFIG|low)        prefix="🔵" ;;
      INFO)              prefix="ℹ️" ;;
      *)                 prefix="  " ;;
    esac
    echo "$prefix $ts [$level] $msg"
  done
}

cmd_oneshot() {
  echo "[opencode-guard] One-shot scan..."
  compute_baseline
  for f in "${ALL_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      old_hash=$(baseline_hash "$f")
      new_hash=$(sha256sum "$f" 2>/dev/null | cut -d' ' -f1)
      if [[ "$old_hash" != "$new_hash" ]]; then
        handle_change "$f" "oneshot"
      fi
    fi
  done
  echo "[opencode-guard] Scan concluido."
}

cmd_container() {
  local status volumes status_icon
  local IMAGE="opencode-qa"

  if ! command -v podman &>/dev/null; then
    echo "🔴 podman:     NAO INSTALADO"
    echo "🔴 imagem:     N/A"
    echo "🔴 container:  N/A"
    return
  fi

  if podman image exists "${IMAGE}" &>/dev/null; then
    if podman ps --filter "name=^${IMAGE}$" --filter "status=running" --format "{{.Names}}" 2>/dev/null | grep -q "${IMAGE}"; then
      status="🟢 RUNNING"
      echo "${status} container:  ${IMAGE}"
      local mounts
      mounts=$(podman inspect "${IMAGE}" --format '{{range .Mounts}}{{.Destination}}|{{.Mode}} {{end}}' 2>/dev/null)
      echo "   volumes:"
      if echo "${mounts}" | grep -q "/project|rw";     then echo "     ✅ /project:rw";     else echo "     ❌ /project:rw AUSENTE";   fi
      if echo "${mounts}" | grep -q "/home/coder/.config/opencode|ro"; then echo "     ✅ ~/.config/opencode:ro"; else echo "     ⚠️  ~/.config/opencode:ro AUSENTE"; fi
    else
      echo "🟡 container:  ${IMAGE} (STOPPED)"
      podman ps --all --filter "name=^${IMAGE}$" --format "   last exit: {{.Status}}" 2>/dev/null
    fi
  else
    echo "🔴 imagem:     ${IMAGE} NAO ENCONTRADA"
    echo "   Execute: podman build -t ${IMAGE} ~/.config/opencode/container"
  fi
}

cmd_daemon() {
  # ── LOCK ──────────────────────────────────────────────
  if [[ -f "$LOCK_FILE" ]]; then
    old_pid=$(cat "$LOCK_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "ERRO: Guard ja rodando (PID $old_pid)"
      exit 1
    fi
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"; log "INFO" "Guard encerrado."; exit 0' INT TERM

  # ── INIT ──────────────────────────────────────────────
  log "INFO" "=== opencode-guard iniciado (PID $$) ==="
  log "INFO" "Monitorando ${#ALL_FILES[@]} arquivos"

  compute_baseline
  for f in "${ALL_FILES[@]}"; do
    [[ -f "$f" ]] && save_backup "$f"
  done

  if ! command -v inotifywait &>/dev/null; then
    log "WARN" "inotifywait nao encontrado — usando poll mode (intervalo: ${POLL_INTERVAL}s)"
    cmd_daemon_poll
    return
  fi

  # ── INOTIFY MODE ─────────────────────────────────────
  log "INFO" "Usando inotify (modo eficiente)"

  # Collect unique parent directories
  declare -A dirs
  for f in "${ALL_FILES[@]}"; do
    dirs["$(dirname "$f")"]=1
  done

  log "INFO" "Vigiando ${#dirs[@]} diretorios"

  # Start inotifywait
  inotifywait -m -e modify,create,delete,move,attrib \
    "${!dirs[@]}" \
    --format '%w%f|%e' 2>/dev/null |
  while IFS='|' read -r path event; do
    path="${path%/}"  # remove trailing slash from directories
    if is_monitored "$path"; then
      handle_change "$path" "$event"
    fi
  done
}

cmd_daemon_poll() {
  log "INFO" "Poll mode: verificando a cada ${POLL_INTERVAL}s"
  while true; do
    for f in "${ALL_FILES[@]}"; do
      if [[ -f "$f" ]]; then
        old_hash=$(baseline_hash "$f")
        new_hash=$(sha256sum "$f" 2>/dev/null | cut -d' ' -f1)
        if [[ -n "$old_hash" && "$old_hash" != "$new_hash" ]]; then
          handle_change "$f" "poll"
        fi
      fi
    done
    sleep "$POLL_INTERVAL"
  done
}

# ────────────────────────────────────────────────────────────────────────────
# ENTRYPOINT
# ────────────────────────────────────────────────────────────────────────────

mkdir -p "$GUARD_DIR"

case "${1:-}" in
  --check)      cmd_check  ;;
  --report)     cmd_report "${2:-20}" ;;
  --oneshot)    cmd_oneshot ;;
  --container)  cmd_container ;;
  --daemon|"")  cmd_daemon ;;
  *)

    echo "Uso: $0 [--check|--report [N]|--oneshot|--container]"
    echo "  (sem args) → daemon mode (systemd ou terminal)"
    exit 1
    ;;
esac
