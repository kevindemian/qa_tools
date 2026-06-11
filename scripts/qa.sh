#!/usr/bin/env bash
# =============================================================================
# qa.sh — OpenCode container wrapper (Podman rootless)
# =============================================================================
#
# Executa opencode dentro de um container rootless com:
#   - Filesystem read-only (exceto volumes)
#   - Network host (LLM API + TTY)
#   - Sem capabilities (cap-drop ALL)
#   - UID/GID mapeados do host (keep-id)
#   - Volume do projeto atual em /project
#   - Config do opencode montado como read-only
#
# USO:
#   qa <argumentos-do-opencode>
#
# EXEMPLOS:
#   qa --version
#   qa                           # modo interativo
#   qa "implemente a feature X"
#
# ⚠️  RESTRIÇÃO — noexec:
#   O tmpfs /tmp NÃO pode ter noexec porque o Node.js/bun precisa
#   JIT-compilar JavaScript em arquivos temporários. Se /tmp for
#   noexec, o opencode falha ao abrir ("não acessa própria imagem").
#   Os demais tmpfs (~/.opencode, ~/.local, ~/.cache) MANTÊM noexec
#   por segurança — o opencode só lê/escreve dados neles.
#
# DEPENDÊNCIAS:
#   podman 4.x (rootless)
#   imagem opencode-qa buildada
# =============================================================================

set -euo pipefail

IMAGE="opencode-qa"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPENCODE_CONFIG_HOME="${HOME}/.config/opencode"
OPENCODE_DATA_HOME="${HOME}/.local/share/opencode"
GITCONFIG="${HOME}/.gitconfig"

# ── Verificação de dependências ─────────────────────────────────────────────
if ! command -v podman &>/dev/null; then
    echo "[qa.sh] ERRO: podman não encontrado. Instale podman primeiro." >&2
    exit 1
fi

if ! podman image exists "${IMAGE}" &>/dev/null; then
    echo "[qa.sh] ERRO: imagem '${IMAGE}' não encontrada." >&2
    echo "[qa.sh] Execute: podman build -t ${IMAGE} -f ${HOME}/.config/opencode/container/Dockerfile ${PROJECT_ROOT}/.container" >&2
    exit 1
fi

# ── Garantir diretório de dados persistente ──────────────────────────────────
# SQLite DB do opencode (~/.local/share/opencode/opencode.db) precisa
# persistir entre sessões do container. Cria o diretório no host se
# não existir para que o bind mount funcione.
if [[ ! -d "${OPENCODE_DATA_HOME}" ]]; then
    mkdir -p "${OPENCODE_DATA_HOME}"
fi

# ── Montagens condicionais ──────────────────────────────────────────────────

# .gitconfig (opcional)
GITCONFIG_MOUNT=""
if [[ -f "${GITCONFIG}" ]]; then
    GITCONFIG_MOUNT="-v ${GITCONFIG}:/home/coder/.gitconfig:ro"
fi

# .env.local (opcional, prioridade — secrets locais)
ENV_FILE=""
if [[ -f "${PROJECT_ROOT}/.env.local" ]]; then
    ENV_FILE="--env-file ${PROJECT_ROOT}/.env.local"
fi

# .env (opcional, fallback — template only, sem secrets reais)
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
    ENV_FILE="${ENV_FILE} --env-file ${PROJECT_ROOT}/.env"
fi

# ── Execução ────────────────────────────────────────────────────────────────

exec podman run --rm -it \
    --replace \
    --name opencode-qa \
    --user "$(id -u):$(id -g)" \
    --userns keep-id \
    -v "${PROJECT_ROOT}:/project:rw,z" \
    -v "${OPENCODE_CONFIG_HOME}:/home/coder/.config/opencode:ro,z" \
    -v "${OPENCODE_DATA_HOME}:/home/coder/.local/share/opencode:rw,z" \
    ${GITCONFIG_MOUNT} \
    ${ENV_FILE} \
    -w /project \
    --read-only \
    --tmpfs /tmp:nosuid,size=128m \
    --tmpfs /home/coder/.opencode:noexec,size=64m \
    --tmpfs /home/coder/.local:noexec,size=64m \
    --tmpfs /home/coder/.cache:noexec,size=64m \
    --cap-drop ALL \
    --network host \
    "${IMAGE}" \
    "$@"
