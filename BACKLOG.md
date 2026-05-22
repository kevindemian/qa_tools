# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### ARC-001 — Centralizar configuração (process.env → Config) (P2)

- **Contexto**: 150+ referências a `process.env.XXX` espalhadas por 15+ arquivos. Dificulta testar, rastrear e migrar para TS. Testes precisam mutar `process.env` globalmente.
- **Ação**: Criar `shared/config.js` com objeto `Config` que lê env vars uma vez. Substituir `process.env.JIRA_BASE_URL` por `Config.jiraBaseUrl`, etc.
- **Impacto**: Testes podem mockar `Config` em vez de poluir `process.env`. Reduz acoplamento global.
- **Estimativa**: 1-2h. Tocar após migração TS ou junto dela.

### ARC-011 — JiraResource coverage (Lote 4, P2)

- **Contexto**: `jira_resource.js` (~250 linhas, 8 métodos públicos, dependência crítica para 95% dos comandos) não possui testes unitários. MockRouter pattern já está implementado e validado pela Fase 7.
- **Ação**: Criar `jira_resource.test.js` com testes para: `getProjectId`, `getProjectVersions`, `updateFixVersions`, `getReleaseTasks`, `moveCardsToDone`, `releaseVersion`, `getIssueLinkTypes`, `getJiraResource` error handling.
- **Estimativa**: 2-3h. Postergado — não está no caminho crítico das demais melhorias. Bloqueios de CI e handler de erros já foram cobertos pelos Lotes 1-3.
- **Observação**: Precisa mockar `createHttpClient` e `axiosInstance`. Aproveitar padrão de mock de `handlers.test.js`. Pendente para próxima sessão.

### ARC-003 — Unificar sleep() (P3)

- **Contexto**: Após ARQ-006, `sleep()` de `shared/http-client.js` substituiu `delay()` nos módulos principais. Verificar se não há `new Promise(resolve => setTimeout(resolve, ms))` residual.
- **Ação**: Remover implementações duplicadas de sleep.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (P3)

- **Contexto**: Acentos PT-BR inconsistentes em strings de UI. Ex: "Variaveis", "criar-versão" (com acento) vs outros sem.
- **Arquivos**: `git_triggers/main.js:277,448`, `qatools.sh:72-74`, `jira_management/main.js:97`

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (P2)

- **Contexto**: `tsconfig.json` usa `strict: false + strictNullChecks: true`. `strict: true` geraria 486 erros em 17 arquivos. Em vez de remar JSDoc, a estratégia correta é migrar para `.ts`.
- **Vantagens**: `import type`/`interface` nativos, sem `@template`/`@typedef` verboso, sem `@ts-check`, tooling superior, previne débito futuro na raiz.
- **Roteiro**:
  1. Configurar `tsconfig.json` para `.ts` (`allowJs: false`, `strict: true`)
  2. Configurar Jest com `ts-jest` ou `@swc/jest`
  3. Migrar `shared/` (fundação — `result_parser`, `prompt`, `logger`, `cli_base`, `state`, `session-context`, `http-client`, `types`)
  4. Migrar `jira_management/` (`jira_resource`, `jira_link_manager`, `csv_resource`, `create_tests`, `result_reporter`, `package_version_manager`, `cypress_resource`, `commands/*`, `main`)
  5. Migrar `git_triggers/`
  6. Remover `allowJs`/`checkJs` do tsconfig; CI roda `npx tsc --noEmit`
- **Distribuição**: `create_tests.js` (109), `github_manager.js` (70), `gitlab_manager.js` (63), `main.js` (git_triggers, 55), `jira_resource.js` (43), `main.js` (jira_management, 42), `prompt.js` (24), `logger.js` (21), +9 arquivos menores (~59).
- **Estimativa**: 8-16h. Não executável em sessão única.

---

## Resolvidos

Estes foram resolvidos durante a sessão de refatoração de Maio/2026:

### ARC-002 (CONCLUÍDO)

- **Ação**: `console.log` migrado para `print()` de `shared/prompt.js` em:
  - `jira_management/commands/case04.js` (4 usos)
  - `jira_management/create_tests.js` (2 usos)
  - `shared/cli_base.js` (4 usos em `printSessionSummary`)
- **Testes**: Mocks atualizados em `handlers.test.js`, `create_tests.test.js`. 295+ testes passando.
- **Observação**: `e2e/real-import.js` mantido como está — script standalone de baixa prioridade.

### ARQ-001 (CONCLUÍDO)

- **Ação**: `shared/session-context.js` criado com class `SessionContext` (métodos: `resetResults()`, `withBusy()`, `pushHistory()`, `buildContextLine()`). `git_triggers/main.js` e `jira_management/main.js` refatorados para usar a classe.
- **Testes**: `shared/session-context.test.js` — 6 testes unitários.

### ARQ-002 (CONCLUÍDO)

- **Ação**: `withSpinner(label, fn)` exportado de `shared/prompt.js`. 12 usos manuais de `new Spinner()` substituídos em `git_triggers/main.js` (9), `git_triggers/nivelar.js` (2) e `jira_management/create_tests.js` (1). `session-context.withBusy(label)` delega para `withSpinner`.
- **Testes**: Mocks atualizados.

### ARQ-003 (CONCLUÍDO)

- **Ação**: Helpers `_get/_post/_put/_patch` + `handleError()` em `gitlab_manager.js` e `github_manager.js`. Erro logging centralizado, ~45 linhas economizadas.
- **Testes**: 86 testes passando nos 3 arquivos.

### ARQ-004 (CONCLUÍDO)

- **Ação**: `sleep(ms)` exportado via `module.exports = { createHttpClient, sleep }`.

### ARQ-006 (CONCLUÍDO)

- **Ação**: `delay()` removido de `git_triggers/main.js` e `jira_management/create_tests.js`. Substituído por `sleep()` de `shared/http-client.js`.

### ARQ-007 (CONCLUÍDO)

- **Ação**: `_resolveGlob(pattern)` em `git_triggers/main.js` substituído por `glob.sync(pattern)`.

### ARQ-008 (CONCLUÍDO)

- **Ação**: `parseMochawesome` e `matchResultsToTests` já estavam em módulos compartilhados (`shared/result_parser.js`, `jira_management/result_reporter.js`). Zero duplicação.

### ARQ-009 (CONCLUÍDO)

- **Ação**: Todos os calls de `withBusy` em `jira_management/main.js` já possuíam label.

### ARQ-010 (CONCLUÍDO)

- **Ação**: Teste adicionado para `withSpinner` em modo quiet (`shared/prompt.test.js`).

### UX-001 (CONCLUÍDO)

- **Ação**: `_createTestsFromTestCases` já utiliza `ProgressBar` para feedback visual durante CSV/JSON import.

### UX-002 (CONCLUÍDO)

- **Ação**: Ambos `jira_management/main.js` e `git_triggers/main.js` já chamam `setupSigint` antes do `while(true)`.

### TS-002 + ARQ-005 (CONCLUÍDO)

- **Ação**: 16 handlers extraídos de `jira_management/main.js` para `jira_management/commands/`. `main.js` delegado via `commands/index.js`. Testes criados para handlers críticos (1, 4, 7, 8, 15).

### TS-003 (CONCLUÍDO)

- **Ação**: `getJiraResource()` alterado para lançar `JiraResourceError` em vez de retornar `null`. 24 callers atualizados.

---

## Legado (pré-refatoração)

Estes existiam antes das nossas alterações e não foram tratados (serão resolvidos pela migração TS):

- `jira_management/create_tests.js`: 109 erros TS
- `git_triggers/github_manager.js`: 70 erros TS
- `git_triggers/gitlab_manager.js`: 63 erros TS
- `shared/logger.js`: `_logDir` com inferência cíclica (linha 33)
- `shared/prompt.js`: módulo `readline-sync` sem tipos
- `shared/result_parser.js`: propriedades de objeto sem declaração
