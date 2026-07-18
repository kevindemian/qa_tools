#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# OBSOLETO — NÃO EXECUTAR EM PRODUÇÃO
# ─────────────────────────────────────────────────────────────────────────────
# Este script foi desativado em 2026-07-18 (Fase 4 / T4.4 da reestruturação).
#
# Motivo (raiz, não workaround):
#   1. Referencia caminhos absolutos de um ambiente legado (`/project/...`) que
#      não existem neste repositório.
#   2. Manipula arquivos de configuração do opencode em
#      `$HOME/.config/opencode/` (validation_hook.ts, validation_plugin.ts,
#      validation.json), os quais são PROIBIDOS de acesso/escrita por
#      AGENTS.md §17 (Protected Paths — Zero Access).
#   3. A proteção de hooks hoje é garantida por `.husky/` (pre-commit /
#      pre-push) versionados no repositório, não por patches externos ao
#      opencode.
#
# A lógica foi preservada abaixo APENAS como documentação histórica. Qualquer
# reativação deve ser feita via PR autorizado que remova as referências a
# paths protegidos e ao ambiente `/project/`.
# ─────────────────────────────────────────────────────────────────────────────

echo "=== sync-hooks.sh — OBSOLETO (desativado em 2026-07-18, F4/T4.4) ==="
echo "Este script não deve ser executado. Veja o cabeçalho para o motivo."
echo "Se precisar reativá-lo, abra um PR autorizado corrigindo os paths protegidos."
exit 0

# ─── Conteúdo legado (preservado para auditoria, NÃO executado) ───────────────
LEGACY_PLUGIN="$HOME/.config/opencode/plugin/validation_plugin.ts"
LEGACY_HOOK_SRC="/project/.config/validation_hook.ts"
LEGACY_HOOK_DST="$HOME/.config/opencode/validation_hook.ts"
LEGACY_VALIDATION_JSON="/project/.opencode/validation.json"

echo "=== sync-hooks.sh — Ativação da proteção permanente ==="
echo ""

# ── Step 1: Copy hook ────────────────────────────────────────────────────────
echo "[1/5] Copiando validation_hook.ts → $HOOK_DST"
cp "$HOOK_SRC" "$HOOK_DST"
echo "  OK"

# ── Step 2: Backup ───────────────────────────────────────────────────────────
echo "[2/5] Backup do plugin → ${PLUGIN}.bak"
cp "$PLUGIN" "${PLUGIN}.bak"
echo "  OK"

# ── Step 3: Inserções no plugin ───────────────────────────────────────────────
echo "[3/5] Aplicando patches no validation_plugin.ts..."

# 3a. HookFunctions interface: add validatePathFn
ANCHOR='  commandFn: (command: string) => void;'
LINE='  validatePathFn: (path: string) => boolean;'
if grep -Fqx "$LINE" "$PLUGIN"; then
    echo "  SKIP 3a: validatePathFn já existe na interface"
else
    sed -i "s|^$ANCHOR$|$ANCHOR\\n$LINE|" "$PLUGIN"
    echo "  OK 3a: validatePathFn adicionado à interface HookFunctions"
fi

# 3b. parseValidationConfig: add path field
ANCHOR='      command: (typeof fns?.command === "string" ? fns.command : "validateCommand") as string,'
LINE='      path: (typeof fns?.path === "string" ? fns.path : "validatePath") as string,'
if grep -Fqx "$LINE" "$PLUGIN"; then
    echo "  SKIP 3b: path já existe no parseValidationConfig"
else
    sed -i "s|^$ANCHOR$|$ANCHOR\\n$LINE|" "$PLUGIN"
    echo "  OK 3b: path adicionado ao parseValidationConfig"
fi

# 3c. loadHookFunctions: add load + check for validatePathFn
#     Insert after:   const commandFn = hookModule[functionNames.command];
ANCHOR='  const commandFn = hookModule[functionNames.command];'
BLOCK='  const validatePathFn = hookModule[functionNames.path];\n  if (typeof validatePathFn !== "function") {\n    throw new Error(\n      `VALIDATION FATAL: function "${functionNames.path}" not found in "${hookPath}"`,\n    );\n  }'
if grep -Fq 'validatePathFn = hookModule' "$PLUGIN"; then
    echo "  SKIP 3c: validatePathFn load já existe"
else
    sed -i "s|^$ANCHOR$|$ANCHOR\\n$BLOCK|" "$PLUGIN"
    echo "  OK 3c: load + check do validatePathFn adicionados"
fi

# 3d. Return object: add validatePathFn field
ANCHOR='    commandFn: commandFn as (command: string) => void,'
LINE='    validatePathFn: validatePathFn as (path: string) => boolean,'
if grep -Fqx "$LINE" "$PLUGIN"; then
    echo "  SKIP 3d: validatePathFn já existe no return"
else
    sed -i "s|^$ANCHOR$|$ANCHOR\\n$LINE|" "$PLUGIN"
    echo "  OK 3d: validatePathFn adicionado ao return"
fi

# 3e. tool.execute.before: add filePath validation
ANCHOR='      if (_input.tool === "write" || _input.tool === "edit") {'
BLOCK='      const filePath = output?.args?.filePath;\n      if (typeof filePath === "string" \&\& filePath.length > 0) {\n        try {\n          validatePathFn(filePath);\n        } catch (error) {\n          const reason = error instanceof Error ? error.message : "Unknown violation";\n          logViolationError(_input.tool, filePath, reason, logViolations);\n          if (blockOnViolation) {\n            throw new Error(createBlockError("Path blocked: " + reason, requireHumanReview));\n          }\n        }\n      }'
if grep -Fq 'validatePathFn(filePath)' "$PLUGIN"; then
    echo "  SKIP 3e: filePath validation já existe no handler"
else
    sed -i "s|^$ANCHOR$|$ANCHOR\\n$BLOCK|" "$PLUGIN"
    echo "  OK 3e: filePath validation adicionado ao tool.execute.before"
fi

# ── Step 4: Verificar ─────────────────────────────────────────────────────────
echo ""
echo "[4/5] Verificando instalação..."
errors=0
grep -q 'validatePathFn.*(path: string)' "$PLUGIN" || { echo "  FALHA: interface"; errors=$((errors+1)); }
grep -q 'fns\.path' "$PLUGIN" || { echo "  FALHA: config"; errors=$((errors+1)); }
grep -q 'functionNames\.path' "$PLUGIN" || { echo "  FALHA: load"; errors=$((errors+1)); }
grep -q 'validatePathFn(filePath)' "$PLUGIN" || { echo "  FALHA: handler"; errors=$((errors+1)); }
grep -q 'validatePath' "$HOOK_DST" || { echo "  FALHA: hook function"; errors=$((errors+1)); }

if [ "$errors" -eq 0 ]; then
    echo "  ✓ Todas as verificações passaram"
else
    echo "  ⚠ $errors verificação(ões) falharam — revise ${PLUGIN}.bak e corrija manualmente"
fi

# ── Step 5: validation.json ──────────────────────────────────────────────────
echo ""
echo "[5/5] Garantindo validation.json com função path..."
if grep -q '"path"' "$VALIDATION_JSON"; then
    echo "  SKIP: path já existe em validation.json"
else
    sed -i '/"command":/a\        "path": "validatePath",' "$VALIDATION_JSON"
    echo "  OK: path adicionado ao validation.json"
fi

echo ""
echo "=== sync-hooks.sh CONCLUÍDO ==="
echo ""
echo "PRÓXIMOS PASSOS (manuais):"
echo "  1. Revise as alterações: diff ${PLUGIN}.bak $PLUGIN"
echo ""
echo "  2. Se estiver satisfeito, sele com chattr +i:"
echo "     sudo chattr +i $HOOK_DST"
echo "     sudo chattr +i $PLUGIN"
echo "     sudo chattr +i /project/opencode.json"
echo "     sudo chattr +i /project/.opencode/validation.json"
echo "     sudo chattr +i /project/eslint.config.mjs"
echo "     sudo chattr +i /project/tsconfig.json"
echo "     sudo chattr +i /project/AGENTS.md"
