#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# opencode-guard — Instalador
# =============================================================================
# Uso: ./scripts/install-guard.sh

SERVICE="opencode-guard.service"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "=============================================="
echo "  opencode-guard — Instalacao"
echo "=============================================="
echo ""

# ── Passo 1: Dependencias ─────────────────────────
echo "[1/4] Verificando dependencias..."
MISSING=()
command -v inotifywait &>/dev/null || MISSING+=("inotify-tools")
command -v notify-send  &>/dev/null || MISSING+=("libnotify-bin")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "  Pacotes necessarios: ${MISSING[*]}"
  echo "  Instale com:"
  echo "    sudo apt install -y ${MISSING[*]}"
  echo ""
  echo -n "  Deseja instalar agora? [s/N] "
  read -r resposta
  if [[ "$resposta" =~ ^[sSyY] ]]; then
    sudo apt install -y "${MISSING[@]}"
  else
    echo "  AVISO: O guard rodara em modo poll (menos eficiente) ate instalar."
  fi
else
  echo "  OK — todas as dependencias presentes."
fi

# ── Passo 2: Criar diretorios ─────────────────────
echo ""
echo "[2/4] Criando diretorios..."
mkdir -p "$SYSTEMD_DIR"
mkdir -p "$(dirname "$0")/../.opencode/guard"
echo "  OK"

# ── Passo 3: Instalar service ─────────────────────
echo ""
echo "[3/4] Instalando service systemd --user..."
# Copy from project to systemd dir if not already there
SERVICE_FILE="$SYSTEMD_DIR/$SERVICE"
PROJECT_SERVICE="$(cd "$(dirname "$0")/.." && pwd)/.opencode/guard/$SERVICE"

if [[ ! -f "$SERVICE_FILE" ]]; then
  cp "$PROJECT_SERVICE" "$SERVICE_FILE" 2>/dev/null || true
  echo "  Service file copiado para $SERVICE_FILE"
fi

systemctl --user daemon-reload 2>/dev/null || true
echo "  systemd recarregado"

# ── Passo 4: Ativar ───────────────────────────────
echo ""
echo "[4/4] Ativando..."
# Testar sintaxe
if systemctl --user --no-pager cat "$SERVICE" &>/dev/null; then
  systemctl --user enable "$SERVICE"
  systemctl --user start "$SERVICE"
  echo ""
  echo "  Status:"
  systemctl --user --no-pager status "$SERVICE" | head -10
else
  echo "  ERRO: Service nao encontrado. Copie manualmente:"
  echo "    cp .opencode/guard/$SERVICE $SYSTEMD_DIR/"
  echo "    systemctl --user daemon-reload"
  echo "    systemctl --user enable --now $SERVICE"
  exit 1
fi

echo ""
echo "=============================================="
echo "  opencode-guard INSTALADO com sucesso!"
echo "=============================================="
echo ""
echo "  Comandos uteis:"
echo ""
echo "    Ver status:       systemctl --user status $SERVICE"
echo "    Ver logs:         journalctl --user -u $SERVICE -f"
echo "    Parar:            systemctl --user stop $SERVICE"
echo "    Desabilitar:      systemctl --user disable $SERVICE"
echo "    Testar scan:      ./scripts/opencode-guard.sh --oneshot"
echo "    Ver alertas:      ./scripts/opencode-guard.sh --report"
echo ""

# Testar com --check
"$(dirname "$0")/opencode-guard.sh" --check
