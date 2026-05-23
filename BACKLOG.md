# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### UX-001 — Melhorias de UI/UX na CLI (CONCLUÍDO)

**Prioridade**: P1 (impacto direto na experiência do usuário)

**4 fases incrementais**, cada uma autônoma e testável:

---

#### 🔴 Fase 1 — Bugs Críticos ✅

| # | Problema | Local | Risco | Status |
|---|----------|-------|-------|--------|
| 1 | **Double-prompt CSV/JSON**: handler pergunta caminho + labels, `createTestsFrom*` pergunta de novo | `case01.ts`, `case15.ts`, `create_tests.ts` | Usuário responde a mesma coisa 2x | ✅ |
| 2 | **`showSelect()` fallback não-TTY**: printa choices mas não valida resposta | `prompt.ts:377-386` | Input inválido passa batido em CI | ✅ |
| 3 | **`ProgressBar` silencioso em não-TTY**: operações longas invisíveis em pipe/CI | `prompt.ts:148-150` | Zero feedback em pipelines | ✅ |
| 4 | **Pipeline monolithic decision tree**: 5+ prompts encadeados pós-trigger | `git_triggers/main.ts` | Operação complexa, sem checkpoint | ✅ |

---

#### 🟡 Fase 2 — Usabilidade ✅

| # | Problema | Local | Melhoria | Status |
|---|----------|-------|----------|--------|
| 5 | `confirm()` aceita qq entrada → `false` silencioso | `prompt.ts:82-83` | Loop com validação + hint visual | ✅ |
| 6 | `prompt()` sem validação de vazio | `prompt.ts:71-77` | `minLength` opcional em `PromptOptions` | ✅ |
| 7 | `success()` não respeita `isQuiet()` | `prompt.ts:44` | Inconsistência com `info()` | ✅ |
| 8 | `printSummary()` usa `warn()` dentro → prefixo `!` indevido | `prompt.ts:270` | Polui output do resumo | ✅ |
| 9 | `printSessionSummary()` usa `ERR`/`OK` puro sem cor | `cli_base.ts:83-84` | Quebra consistência visual | ✅ |
| 10 | Nivelar sem validação: branches iguais, vazios, inexistentes | `nivelar.ts` | MR auto-referencial, erro confuso | ✅ |
| 11 | Branch existence check ausente no trigger pipeline | `git_triggers/main.ts` | Erro só chega via API | ✅ |
| 12 | `divider()` não usada em `printSessionSummary` — `'='.repeat(50)` manual | `cli_base.ts:71,89` | Inconsistência | ✅ |

---

#### 🟢 Fase 3 — Polimento Visual ✅

| # | Mudança | Descrição | Status |
|---|---------|-----------|--------|
| 13 | **Unicode icons**: `✓`/`✗`/`⚠`/`ℹ` com fallback ASCII | Substituir `OK`/`ERR`/`!`/`i` | ✅ |
| 14 | **Prefixos bold** nos 4 níveis (`chalk.bold`) | Maior contraste em terminais claros | ✅ |
| 15 | **`title()` com moldura**: `\n` + divider + texto + divider | Hierarquia visual clara | ✅ |
| 16 | **`tableView()` word-wrap**: `wordWrap: true` + `colWidths` dinâmicos | Evita quebra de layout | ✅ |
| 17 | **`divider()` dinâmico** | | ✅ |
| 18 | **Cores no `printSessionSummary()`** | Reusar `success()`/`error()` | ✅ |

---

#### 🔵 Fase 4 — Arquitetural ✅

| # | Item | Motivo | Status |
|---|------|--------|--------|
| 19 | Extrair `createTestExecutionAfterImport` para helper compartilhado | Elimina duplicação case01/case13/case15 | ✅ |
| 20 | `SessionContext.packageManager` tipado corretamente (eliminar `as any`) | Permite refatoração segura | ✅ |
| 21 | Padronizar retorno de handlers (`boolean \| void`) | Controle de fluxo previsível | ✅ |
| 22 | Adicionar elapsed time no `printSessionSummary()` | Fechamento informativo da sessão | ✅ |

---

## Resolvidos

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (CONCLUÍDO)

- **Ação**: 8 camadas incrementais (bottom-up) convertendo 74 arquivos de `.js` para `.ts`. `strict: true`, `allowJs: false`, `tsc --noEmit` = 0 erros, 322/322 testes passando.
- **Commits**: 12 commits + merge em `main`.
- **Lições**: `jest.mock()` em `.js` test files sem Babel NÃO é hoisted. Solução: colocar `jest.mock` antes do `require`.

### ARC-001 — Centralizar configuração (process.env → Config) (CONCLUÍDO)

- **Ação**: Criado `shared/config.ts` com classe `Config`. 151 referências a `process.env` substituídas por `Config.xxx`.
- **Impacto**: Testes podem mockar `Config` via `jest.mock`. `dotenv.config()` centralizado.

### ARC-011 — JiraResource coverage (CONCLUÍDO)

- **Ação**: Criado `jira_resource.test.ts` com 74 testes cobrindo todos os 17 métodos públicos.
- **Resultado**: 100% dos métodos cobertos, 0 erros de tipo.

### ARC-003 — Unificar sleep() (CONCLUÍDO)

- **Ação**: Verificado. Único `new Promise(resolve => setTimeout(...))` é a própria definição de `sleep()` em `http-client.ts`. Nada a remover.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (CONCLUÍDO)

- **Ação**: Corrigidos 58 acentos PT-BR em 17 arquivos (`nao`→`não`, `Variaveis`→`Variáveis`, `Ate logo`→`Até logo`, etc).

### LINT-001 — 80 lint errors → 0 (CONCLUÍDO)

- **Ação**: Corrigidos todos os 80 `@typescript-eslint/*` errors em 16 arquivos.
- **Detalhes**: `no-unused-vars` removidos de `case04/07/08`, `main.ts`, `result_reporter.ts`, `jira_resource.test.ts`, etc.
- **Ajuste**: eslint.config.js recebeu override para arquivos de teste desabilitar regras conflitantes.

### COV-001 — Test coverage boost (CONCLUÍDO)

- **Ação**: Criado `shared/config.test.ts` (81 testes, 0→100% coverage). Adicionados testes em `state.test.ts` (migração de estado antigo, recovery sem backup) e `cli_base.test.js` (`sanitizeUrl`, `setupSigint`, `createValidateEnv` edge cases, `printSessionSummary`).
- **Bug fix**: `logMaxSize` não tratava `'0'` corretamente (`parseInt('0')` é falsy → `||` dava fallback). Corrigido com `isNaN()`.
- **Resultado**: 502 testes (antes 400), 25 suites (antes 24).

### TS-TEST-001 — Migrar shared/ test files .js → .ts (CONCLUÍDO)

- **Ação**: 7 arquivos migrados (`cli_base`, `http-client`, `logger`, `prompt`, `result_parser`, `session-context`, `state`).
- **Padrão**: `const X = require('./x')` com `typeof import('./x')` type annotation + `// @ts-nocheck`.

---

## Pendências

| # | Item | Prioridade | Esforço | Status |
|---|------|-----------|---------|--------|
| 1 | Migrar `jira_management/` e `git_triggers/` .test.js → .ts (11 arquivos) | P2 | Médio | ✅ |
| 2 | Cobertura de testes em `jira_management/commands/` handlers (20-45% → 70%+ — atual 83.22%) | P2 | Alto | ✅ |
| 3 | Cobertura de testes em `git_triggers/` (atual 90.64%) | P2 | Alto | ✅ |
| 4 | Remover `@ts-nocheck` de todos os .test.ts (17 arquivos) e tipá-los corretamente | P3 | Médio | ✅ |
| 5 | Migrar `e2e/` .test.js → .ts (6 arquivos) | P3 | Médio | ✅ |
| 6 | Migrar `e2e/real-import.js` → .ts | P3 | Baixo | ✅ |
| 7 | Cobertura ≥90% lines + ≥85% branches (94.89% / 85.14%) | P2 | Alto | ✅ |

---

## 🔴 Plano de Ataque — Limpeza Geral

Estratégia: paralelizar por camada (shared → jira_management → git_triggers), cada lote independente.

### Batch A — shared/ foundation (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| A1 | **Config sprawl: cli_base.ts** | `shared/cli_base.ts:19-22` | Mover reads de `process.env` para `Config` class |
| A2 | **PROJECT_ID_* env vars ausentes** | `git_triggers/main.ts:149-150`, `shared/config.ts` | Adicionar getters em `Config` para `PROJECT_ID_*` |
| A3 | **types.ts importa Logger concreto** | `shared/types.ts:1` | `import type { Logger }` → interface pura ou reexportar tipo |
| A4 | **`handleError()` duplicado** | `github_manager.ts:5-11`, `gitlab_manager.ts:5-11` | Extrair para `shared/git-provider-error.ts` |
| A5 | **Strings duplicadas + PT-BR** | shared/ todos arquivos | Constantes nomeadas + acentos |

### Batch B — jira_management/ (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| B1 | **R5: GET sem catch** | `jira_resource.ts:98-101,60-84,132-139,218-232` | `getJiraResource()` deve retornar null/[] em erro |
| B2 | **R5: POST engole erro** | `jira_resource.ts:285-300,392-406` | `addTasksToSprint()`, `transitionIssue()` devem re-throw |
| B3 | **DIP: case05/case10 instanciam PackageVersionManager** | `commands/case05.ts:9`, `case10.ts:7` | Receber via `CommandContext` |
| B4 | **DIP: create_tests instancia JiraLinkManager** | `create_tests.ts:599-602` | Receber via parâmetro |
| B5 | **Export redundante** | 16 `commands/case*.ts` | Remover `export { handler }` (só `module.exports` necessita) |
| B6 | **cypress_test.ts export default** | `cypress_test.ts:69` | Mudar para `export =` |
| B7 | **Functions >50L: csv_resource.ts** | `csv_resource.ts:85` | Quebrar `readBulkCsv()` (128L) |
| B8 | **Functions >50L: create_tests.ts** | `create_tests.ts:228,407,482` | Quebrar `_createTestsFromTestCases()` (177L), `createTestsFromCsv()` (74L), `createTestsFromJson()` (116L) |
| B9 | **Strings duplicadas + PT-BR** | jira_management/ | Constantes + acentos |

### Batch C — git_triggers/ (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| C1 | **main() 404L** | `git_triggers/main.ts:429` | Extrair helpers nomeados |
| C2 | **collectTestResults() 106L** | `git_triggers/main.ts:181` | Extrair helpers |
| C3 | **Strings duplicadas + PT-BR** | git_triggers/ | Constantes + acentos |

### Batch D — Testes (CONCLUÍDO)

| # | Item | Local | Tests | Status |
|---|------|-------|-------|--------|
| D1 | `mapping-file-generator.test.ts` | `jira_management/` | 11 | ✅ |
| D2 | `test-case-validator.test.ts` | `jira_management/` | 9 | ✅ |
| D3 | `test-execution-creator.test.ts` | `jira_management/` | 15 | ✅ |
| D4 | `cypress_test.test.ts` | `jira_management/` | 6 | ✅ |
| D5 | `git_triggers/main.test.ts` | `git_triggers/` | 44 | ✅ |
| D6 | `jira_management/main.test.ts` | `jira_management/` | 37 | ✅ |

---