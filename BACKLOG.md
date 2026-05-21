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

- **Ação**: `shared/session-context.js` criado com class `SessionContext` (métodos: `resetResults()`, `withBusy()`, `pushHistory()`, `buildContextLine()`). `git_triggers/main.js` e `jira_management/main.js` refatorados para usar a classe.
- **Testes**: `shared/session-context.test.js` — 6 testes unitários.

### ARQ-002 — withSpinner exportado + consolidado (CONCLUÍDO)

- **Ação**: `withSpinner(label, fn)` exportado de `shared/prompt.js`. 12 usos manuais de `new Spinner()` substituídos em `git_triggers/main.js` (9), `git_triggers/nivelar.js` (2) e `jira_management/create_tests.js` (1). `session-context.withBusy(label)` delega para `withSpinner`.
- **Testes**: Mocks atualizados — `jest.mock('../shared/prompt', () => ({ withSpinner: jest.fn().mockImplementation(async (l, fn) => fn()) }))`.

### ARQ-003 — Manager helpers + error handling (CONCLUÍDO)

- **Ação**: Helpers `_get/_post/_put/_patch` + `handleError()` em `gitlab_manager.js` e `github_manager.js`. Erro logging centralizado, ~45 linhas economizadas.
- **Testes**: 86 testes passando nos 3 arquivos (`gitlab_manager`, `github_manager`, `gitlab_integration`).

### ARQ-004 — sleep() exportado de http-client (CONCLUÍDO)

- **Ação**: `sleep(ms)` exportado via `module.exports = { createHttpClient, sleep }`.

### ARQ-005 — Testes para handleCases (P2)

- **Contexto**: As funções extraídas (`handleCase1`–`handleCaseN`) não têm testes unitários.
- **Motivo**: Dependem de mocks complexos (jiraResource, linkManager, prompt). Bloqueado enquanto handlers estiverem como closures em `main.js`. TS-002 (commands/) desbloquearia.
- **Ação futura**: Após TS-002, criar `jira_management/commands/__tests__/handlers.test.js`.

### ARQ-006 — Duplicação de delay/sleep (P1)

- **Contexto**: `function delay(ms)` em `git_triggers/main.js` é idêntica a `function sleep(ms)` em `shared/http-client.js`. Ambas fazem `new Promise(resolve => setTimeout(resolve, ms))`.
- **Ação futura**: Importar `sleep` de `shared/http-client.js` em `git_triggers/main.js` e remover `delay`.

### ARQ-007 — Duplicação de glob resolver (P2)

- **Contexto**: `_resolveGlob(pattern)` em `git_triggers/main.js` faz regex manual para resolver globs de arquivos. Poderia usar módulo `glob` ou `fast-glob`.
- **Ação futura**: Substituir por `require('glob').sync(pattern)` ou similar.

### ARQ-008 — Duplicação de parseMochawesome/matchResultsToTests (P2)

- **Contexto**: Funções implementadas localmente em `git_triggers/main.js` que fazem parsing de relatório Mochawesome. Não movidas para `shared/` por escopo.
- **Ação futura**: Mover para `shared/mochawesome-parser.js`.

### ARQ-009 — withBusy sem label ambiguidade (P1)

- **Contexto**: `withBusy(fn, label)` aceita label mas casos sem label passam `undefined`. `withSpinner` também aceita label. Quando usado sem label, o código ainda cria `isBusy = true` sem feedback visual.
- **Ação futura**: Revisar todos os `withBusy(fn)` sem label e decidir se adicionam label ou se é intencional.

### ARQ-010 — withSpinner sem quiet respect (P2)

- **Contexto**: `withSpinner` chama `isQuiet()` internamente, mas nenhum teste cobre o branch quiet (apenas o `spinner.start`/`stop` são verificados).
- **Ação futura**: Adicionar teste para `withSpinner` em modo quiet.

---

## Legado (pré-refatoração)

Estes existiam antes das nossas alterações e não foram tratados:

- `jira_management/create_tests.js`: 109 erros TS (falta JSDoc generalizada)
- `git_triggers/github_manager.js`: 70 erros TS (catch blocks sem tipo, parâmetros sem `@param`)
- `git_triggers/gitlab_manager.js`: 63 erros TS (mesmo padrão)
- `shared/logger.js`: `_logDir` com inferência cíclica (linha 33)
- `shared/prompt.js`: módulo `readline-sync` sem tipos (falta `@types/readline-sync`)
- `shared/result_parser.js`: propriedades de objeto sem declaração
