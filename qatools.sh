#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Node check
if ! command -v node &>/dev/null; then
    echo "  ERRO: Node.js não encontrado." >&2
    echo "  Instale em: https://nodejs.org" >&2
    exit 1
fi

# Dependency check — auto-install if missing
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "  Dependências não encontradas." >&2
    if [ "$1" != "-y" ]; then
        read -rp "  Instalar agora? (S/N) " resp
    else
        resp="S"
    fi
    if [ "$resp" = "S" ] || [ "$resp" = "s" ]; then
        echo ""
        npm install
    else
        echo "  Execute 'npm install' na raiz do projeto e tente novamente." >&2
        exit 1
    fi
fi

# Filter -y from args (not a tool argument)
if [ "$1" = "-y" ]; then
    shift
fi

# Warn if .env missing
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "  AVISO: .env não encontrado em $SCRIPT_DIR" >&2
    echo "  Copie .env.example para .env e configure." >&2
    if [ "$1" != "0" ]; then
        read -rp "  Continuar? (S/N) " resp
        [ "$resp" = "N" ] || [ "$resp" = "n" ] && exit
    fi
fi

# Delegate to interactive TypeScript menu
npx tsx "$SCRIPT_DIR/shared/entry-menu.ts" "$@"
