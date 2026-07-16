# ADR: validation_hook — validação CODE-ONLY

- **Data:** 2026-07-11
- **Status:** Aplicado (disco) + verificado (`--test` 51/51)
- **Autorização:** explícita do usuário (command expresso) para desproteger e editar
  `~/.config/opencode/validation_hook.ts` com fim de aumentar/refinar a segurança do projeto.
  Override das Regras 17/18 do AGENTS.md (arquivo de config protegido).

## Root Cause do bloqueio de commit

O commit dos docs do plano DataHub (`BACKLOG.md` novo + rename `BACKLOG.md` →
`docs/archive/BACKLOG_sanitize.md`) foi bloqueado pelo pre-commit NÃO porque a validação varria
chat/prosa, mas porque:

- `.husky/pre-commit` linha 22 exclui `BACKLOG.md` e `shared/plans/` do `--check`,
  mas **NÃO** exclui `docs/archive/BACKLOG_sanitize.md`.
- O rename colocou o conteúdo do BACKLOG antigo (que contém `as unknown as` em prosa)
  no diff staged.
- O hook antigo aplicava `sanitizeAndReject` a TODO o diff (prosa incluída) →
  `TS_SUPPRESSOR_PATTERNS` (`as unknown as`) disparava → block.

O `--test` do hook passava; o bloqueador era a varredura universal de prosa no diff.

## Decisão

Refatorar `validation_hook.ts` para **CODE-ONLY**:

1. `runCheck(diff)` agora é ciente do arquivo (`+++ b/...`): valida apenas linhas
   adicionadas de arquivos de código (ts/tsx/js/jsx/py/go/rs/java/kt/c/cpp/sh...).
   Documentação (`.md`, `.txt`, `.json` docs, `.yaml`, etc.) é ignorada.
2. `runCheckCommitMsg` valida apenas blocos de código da mensagem, não prosa.
3. `chat.message` (plugin) valida apenas blocos de código da resposta, não prosa/chat.
4. `validateCodeBlocks` ganhou `SOP_PATTERNS` + `TESTING_ANTI_PATTERNS`
   (language-agnostic, código apenas).
5. `TESTING_ANTI_PATTERNS` (supressores de cobertura) tornou-se **context-aware**:
   exige a forma de comentário real (`/* istanbul ignore next */`, `// c8 ignore`,
   `// coverage-disable-next-line`, `// nyc disable`, etc.). Frases como
   "remova o istanbul ignore" não disparam mais falso positivo.

## Efeito

- `as unknown as` em prosa/documentação NÃO é mais bloqueante.
- Bypass/supressão reais em código continuam bloqueados (sed/eslint-disable/as any/ts-ignore
  em diff de código ainda caem).
- `--test`: 51/51 passaram.

## Arquivos

- `~/.config/opencode/validation_hook.ts` (editado em disco; não é repo git — não commitado)
- Backup: `/tmp/opencode/validation_hook.ts.bak`
- Sugestão do usuário `VALIDATION HOOK ATUALIZADO.txt`: 99% idêntico + CRLF; única
  mudança real absorvida = fortalecimento de `TESTING_ANTI_PATTERNS` (acima). Resto descartado.
