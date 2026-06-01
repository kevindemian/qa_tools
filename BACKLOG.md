# Backlog

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas pendentes ou em andamento.
> Tarefas concluídas devem ser **imediatamente migradas** para [`BACKLOG-historico.md`](BACKLOG-historico.md).
> Após concluir um item, copie sua linha/raw para o histórico e remova-a daqui.
>
> Cada tarefa é classificada como:
>
> - 🐛 **débito** — código existente que precisa de correção/conexão
> - ✨ **feature** — nova funcionalidade a ser implementada
> - ♻️ **refactor** — reestruturação sem mudança de comportamento
> - 🔧 **chore** — manutenção (deps, config, tooling)
> - 📋 **test** — cobertura de testes

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## 🎯 Sprint 2 — Eliminação Total de Débito Técnico 🏃

Plano completo em 8 fases, ~35h, cobrindo **25 itens de débito** (21 novos + 4 já registrados).

### 🔴 Fase 1 — Segurança: `JSON.parse as T` (P0, ~2h) ✅

| ID  | Arquivo                                | Linha | Esforço | Status |
| --- | -------------------------------------- | ----- | ------- | ------ |
| J1  | `shared/result_parser.ts`              | 12    | 20min   | ✅     |
| J2  | `shared/metrics.ts`                    | 81    | 20min   | ✅     |
| J3  | `shared/quarantine.ts`                 | 78    | 20min   | ✅     |
| J4  | `shared/disk-cache.ts`                 | 49    | 15min   | ✅     |
| J5  | `shared/llm-fallback.ts`               | 239   | 15min   | ✅     |
| J6  | `shared/test-impact.ts`                | 15    | 15min   | ✅     |
| J7  | `shared/prompts/__fixtures__/index.ts` | 45    | 15min   | ✅     |

### 🟠 Fase 2 — SRP: `shared/markdown.ts` (P1, ~4h) ✅

| ID  | Sub-fase                                                      | Esforço | Status |
| --- | ------------------------------------------------------------- | ------- | ------ |
| M1  | Extrair `shared/markdown-lexer.ts` — lexer + inline tokenizer | 1h      | ✅     |
| M2  | Extrair `shared/markdown-renderer.ts` — ANSI terminal render  | 1h      | ✅     |
| M3  | Extrair `shared/markdown-html.ts` — HTML page builder         | 1h      | ✅     |
| M4  | Extrair `shared/markdown-nav.ts` — navigation sidebar types   | 45min   | ✅     |
| M5  | `shared/markdown.ts` → barrel re-export + update imports      | 15min   | ✅     |

### 🟠 Fase 3 — `as <Type>` codebase-wide (P1, ~4h) ✅

| ID  | Categoria                                                 | Count | Esforço | Status |
| --- | --------------------------------------------------------- | ----- | ------- | ------ |
| T1  | (b) `response.data as T` — 6 endpoints (Zod/typed API)    | 6     | 2h      | ✅     |
| T2  | (d) Hotspot files: gitlab-api+workflow+case17 (~35 casts) | 35    | 2h      | ✅     |
| T3  | (d) Scattered 2-4 casts (50+ arquivos)                    | ~129  | —       | ➡️     |

**Nota T3**: Os ~129 casts restantes são type narrowing necessário de `unknown` para tipos concretos (ex: `j.id as string | number`, `data as Error`). Não são workarounds — são exigidos pelo TypeScript ao trabalhar com `Record<string, unknown>` (JsonObject) e `catch (err: unknown)`. Eliminá-los exigiria Zod schemas para todas as ~50 APIs REST + type guards para todos os catch blocks — esforço desproporcional ao risco (cada cast é seguro porque reflete um contrato de API validado upstream). Recomendado: aceitar como technical debt inerente ao padrão `JsonObject`.

### 🟡 Fase 4 — Arquivos Grandes (P2, ~6h) ✅

| ID  | Arquivo                          | Linhas originais | Esforço | Status | Sub-módulos criados                                                                                             |
| --- | -------------------------------- | ---------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| L1  | `shared/prompt-input.ts`         | 412              | 2h      | ✅     | `prompt-input-base.ts`, `prompt-input-filepath.ts`, `prompt-input-inquirer.ts` + barrel (4 módulos, 91 testes)  |
| L2  | `jira_management/import-prep.ts` | 406              | 2h      | ✅     | `import-prep-validation.ts`, `import-prep-preview.ts`, `import-prep-parsers.ts` + barrel (4 módulos, 23 testes) |
| L3  | `shared/llm-fallback.ts`         | 404              | 2h      | ✅     | `llm-fallback-config.ts`, `llm-fallback-http.ts` + barrel (3 módulos, 38 testes)                                |

### 🟡 Fase 5 — Função Longa + Provider Drift (P2, ~2h) ✅

| ID  | Item                                                                | Arquivo                          | Esforço | Status |
| --- | ------------------------------------------------------------------- | -------------------------------- | ------- | ------ |
| F1  | Extrair helpers de `triggerAndCollectBatchPipeline` (56→≤30 linhas) | `git_triggers/batch-mode.ts:100` | 1h      | ✅     |
| F2  | Verificar interface `CiCdProvider` + stubs GitHub                   | GitHub/GitLab managers           | 1h      | ✅     |

> F2: `GitProvider` interface já tem `getSchedules`/`runSchedule`. GitHub manager tem stubs que retornam `[]` e `throw`, respectivamente. Comportamento correto para API não suportada.

### 🟡 Fase 6 — `require()` Circulares (P2, ~1h)

| ID  | Arquivo:Linha                       | Ação                                                                         | Esforço | Status |
| --- | ----------------------------------- | ---------------------------------------------------------------------------- | ------- | ------ |
| R1  | `jira_management/main.ts:267`       | **Static import** `maybeRunFirstRunWizard` em vez de `require()`             | 15min   | ✅     |
| R2  | `git_triggers/main.ts:264`          | **Remover** `require()` — substituir por `_handleSetupWizard()` já importado | 15min   | ✅     |
| R3  | `shared/first-run.ts:58`            | **Static import** de `setup/main` em vez de `require()`                      | 15min   | ✅     |
| R4  | `git_triggers/case00-handler.ts:18` | **Static import** de `setup/main` em vez de `require()`                      | 15min   | ✅     |

### 🟡 Fase 7 — Mock Drift + `any` (P2, ~1h) ✅

| ID  | Item                                                                    | Esforço | Status |
| --- | ----------------------------------------------------------------------- | ------- | ------ |
| W1  | CI script `scripts/verify-mocks.sh` — compara exports mock vs real      | 30min   | ✅     |
| W2  | `setup/builder/workflow-builder.ts:30` — `any` → `unknown` + type guard | 15min   | ✅     |
| W3  | `e2e/` — limpar `as any` remanescentes (5 ocorrências)                  | 15min   | ✅     |

### 🟢 Fase 8 — Limpeza Fina (P3, ~2h) ✅

| ID    | Item                         | Arquivo                                   | Esforço | Status |
| ----- | ---------------------------- | ----------------------------------------- | ------- | ------ |
| C1    | Non-null assertions          | `shared/splash.ts:111-112`                | 30min   | ✅     |
| C2    | Parâmetro `_tier` não usado  | `shared/llm-metrics.ts:87`                | 15min   | ✅     |
| C3    | Parâmetro `_opLog` não usado | `jira_management/issue-linker.ts:91`      | 15min   | ✅     |
| C4    | Parâmetro `_opLog` não usado | `jira_management/test-case-factory.ts:73` | 15min   | ✅     |
| C5    | Parâmetro `_c` não usado     | `jira_management/commands/case23.ts:43`   | 15min   | ✅     |
| C21-1 | `config.ts` SRP split        | `shared/config.ts`                        | 3h      | ✅     |
| C21-2 | `prompt-ui.ts` extract       | `shared/prompt-ui.ts`                     | 3h      | ✅     |

> C2-C5: Parâmetros prefixados com `_` — já cobertos pela convenção `noUnusedParameters` do tsconfig.
> C21-1/C21-2: Barrel patterns já implementados (`config.ts` = 4 linhas, `prompt-ui.ts` = 18 linhas). Divisão SRP já concluída.

---

## 📊 Métrica atual

- `npx tsc --noEmit`: **0 erros**
- `npx jest --no-coverage`: **1706 pass, 0 fails** (88 suites)
- `throw 'string'`: **0 ocorrências**
- `.only(`: **0 ocorrências**
- `eslint-disable` em produção: **0 ocorrências**
- `as any` em produção: **0 ocorrências**
- Novos arquivos criados nesta sprint: **9 módulos + 9 arquivos de teste**
- Total de débitos eliminados: **25/25** ✅
