#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE_FILE="${TMPDIR:-/tmp}/qa_tools_last_choice.txt"

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

# Auto-discover tools (dirs with main.ts)
tools=()
tool_names=()
while IFS= read -r -d '' dir; do
    name=$(basename "$dir")
    case "$name" in node_modules|config|shared|.git) continue ;; esac
    tools+=("$dir/main.ts")
    tool_names+=("$name")
done < <(find "$SCRIPT_DIR" -maxdepth 2 -name "main.ts" -not -path "*/node_modules/*" -printf '%h\0' | sort -u)

if [ ${#tools[@]} -eq 0 ]; then
    echo "  ERRO: Nenhuma ferramenta encontrada (nenhum */main.ts)." >&2
    exit 1
fi

# Read last choice
last_choice=""
last_index=-1
if [ -f "$CACHE_FILE" ]; then
    last_choice=$(cat "$CACHE_FILE")
    for i in "${!tool_names[@]}"; do
        if [ "${tool_names[$i]}" = "$last_choice" ]; then
            last_index=$((i + 1))
            break
        fi
    done
fi

save_choice() {
    echo "$1" > "$CACHE_FILE"
}

run_tool() {
    save_choice "${tool_names[$1]}"
    npx tsx "${tools[$1]}" "${@:2}"
    rc=$?
    if [ $rc -ne 0 ]; then
        echo ""
        echo "  Erro ao executar. Pressione Enter para sair."
        read -r
    fi
}

if [ -z "$1" ]; then
    # Interactive menu
    clear 2>/dev/null || true
    echo ""
    echo "  ========================================"
    echo "          QA Tools - Menu Principal"
    echo "  ========================================"
    echo ""
    for i in "${!tool_names[@]}"; do
        display=$(echo "${tool_names[$i]}" | tr '_' ' ')
        marker="  "
        [ "$i" = "$((last_index - 1))" ] && marker=" *"
        echo "   $((i + 1))$marker $display"
    done
    echo ""
    echo "   0  Sair"
    echo ""
    echo "  ========================================"
    if [ "$last_index" -ge 0 ]; then
        echo "  Última escolha: ${tool_names[$((last_index - 1))]} ($last_index) - Enter para repetir"
    fi
    echo ""
    read -rp "  Escolha: " choice
    if [ -z "$choice" ] && [ "$last_index" -ge 0 ]; then
        choice="$last_index"
    fi
    [ "$choice" = "0" ] && echo "  Até logo!" && exit
    if [ "$choice" -ge 1 ] && [ "$choice" -le ${#tools[@]} ] 2>/dev/null; then
        run_tool $((choice - 1))
    else
        matched=false
        for i in "${!tool_names[@]}"; do
            if [ "${tool_names[$i]}" = "$choice" ]; then
                run_tool "$i"
                matched=true
                break
            fi
        done
        $matched || { echo "  Opção inválida." >&2; exit 1; }
    fi
else
    # Direct argument
    if [ "$1" -ge 1 ] && [ "$1" -le ${#tools[@]} ] 2>/dev/null; then
        run_tool $(( $1 - 1 ))
    else
        matched=false
        for i in "${!tool_names[@]}"; do
            if [ "${tool_names[$i]}" = "$1" ]; then
                run_tool "$i"
                matched=true
                break
            fi
        done
        $matched || { echo "  Ferramenta '$1' não encontrada." >&2; exit 1; }
    fi
fi
