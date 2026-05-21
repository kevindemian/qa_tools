# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### TS-001 — Tipar 486 erros do strict mode (P2)

- **Contexto**: `tsconfig.json` foi revertido de `strict: true` para `strict: false + strictNullChecks: true` (config original que passava CI).
- **Motivo**: `strict: true` ativou `noImplicitAny` + `useUnknownInCatchVariables` + 5 outras flags, gerando 486 erros em 17 arquivos. Correção completa está fora do escopo desta refatoração.
- **Distribuição**: `create_tests.js` (109), `github_manager.js` (70), `gitlab_manager.js` (63), `main.js` (git_triggers, 55), `jira_resource.js` (43), `main.js` (jira_management, 42), `prompt.js` (24), `logger.js` (21), +9 arquivos menores (~59).
- **Ação futura**: Ativar strict gradualmente: `noImplicitAny` → `useUnknownInCatchVariables` → ... ou adicionar JSDoc `@param`/`@type` file-by-file até `strict: true` passar limpo.

### TS-002 — Extrair switch restante para commands/ (P3)

- **Contexto**: Os 16 cases do switch em `jira_management/main.js` foram extraídos para funções nomeadas no mesmo arquivo. A movimentação para `jira_management/commands/caseN.js` foi postergada.
- **Motivo**: Manter diff gerenciável no PR atual. A separação em módulos individuais é puramente organizacional.
- **Ação futura**: Criar `jira_management/commands/`, mover cada `handleCaseN` para seu arquivo, exportar e importar no `main.js`.

### TS-003 — Unificar null-vs-throw em getJiraResource (P3)

- **Contexto**: `getJiraResource()` retorna `null` em vez de lançar exceção quando o recurso não é encontrado. 56 callers tratam o null. Comportamento documentado via `@note` em `jira_management/jira_resource.js:28`.
- **Motivo**: Mudança quebraria 56 callers. Requer refatoração coordenada.
- **Ação futura**: Mudar para `throw` e ajustar todos os callers, ou manter `null` mas adicionar type narrowing nos callers.

### UX-001 — Feedback visual de operações longas (P2)

- **Contexto**: Operações como CSV import e JSON import não têm feedback de progresso além do `isBusy`. O usuário fica sem saber se o processo está vivo.
- **Ação futura**: Adicionar spinner ou barra de progresso nas operações `withBusy`.

### UX-002 — Tratamento de Ctrl+C uniforme (P2)

- **Contexto**: `setupSigint` existe em `cli_base.js` mas nem todos os fluxos tratam interrupção de forma consistente.
- **Ação futura**: Revisar todos os `while(true)` loops para responder a SIGINT com grace period.

### ARQ-001 — SessionContext como classe (CONCLUÍDO)

- **Ação**: `shared/session-context.js` criado com class `SessionContext` (métodos: `resetResults()`, `withBusy()`, `pushHistory()`). `main.js` refatorado para usar a classe.
- **Testes**: `shared/session-context.test.js` — 6 testes unitários.

### ARQ-002 — Mover PromptBar/ProgressBar para shared/ (P3)

- **Contexto**: `ProgressBar` e `PromptBar` estão definidos dentro de `shared/prompt.js`. Poderiam ser módulos separados.
- **Ação futura**: Extrair para `shared/progress_bar.js` e `shared/prompt_bar.js`.

### ARQ-003 — Testes para handleCases (P2)

- **Contexto**: As funções extraídas (`handleCase1`–`handleCaseN`) não têm testes unitários.
- **Motivo**: Dependem de mocks complexos (jiraResource, linkManager, prompt). Bloqueado enquanto handlers estiverem como closures em `main.js`. TS-002 (commands/) desbloquearia.
- **Ação futura**: Após TS-002, criar `jira_management/commands/__tests__/handlers.test.js`.

---

## Legado (pré-refatoração)

Estes existiam antes das nossas alterações e não foram tratados:

- `jira_management/create_tests.js`: 109 erros TS (falta JSDoc generalizada)
- `git_triggers/github_manager.js`: 70 erros TS (catch blocks sem tipo, parâmetros sem `@param`)
- `git_triggers/gitlab_manager.js`: 63 erros TS (mesmo padrão)
- `shared/logger.js`: `_logDir` com inferência cíclica (linha 33)
- `shared/prompt.js`: módulo `readline-sync` sem tipos (falta `@types/readline-sync`)
- `shared/result_parser.js`: propriedades de objeto sem declaração
