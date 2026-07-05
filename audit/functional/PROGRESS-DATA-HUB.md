# Progress — Data Hub Refactoring

## Sprint 1 — Fase 0: Fundação + Fase 1: Compute

**Início:** 2026-07-04
**Conclusão:** 2026-07-04
**Plano:** `.mimocode/plans/data-hub-layered-architecture.md` (v2)

---

### Fase 0 — Fundação

| ID  | Tarefa                        | Status | Data       |
| --- | ----------------------------- | ------ | ---------- |
| 001 | Criar estrutura de diretórios | ✅     | 2026-07-04 |
| 002 | Criar `providers/types.ts`    | ✅     | 2026-07-04 |
| 003 | Criar `types/data-hub.ts`     | ✅     | 2026-07-04 |
| 004 | Barrel em `types.ts`          | ✅     | 2026-07-04 |
| 005 | Criar `compute/types.ts`      | ✅     | 2026-07-04 |

**Checkpoint:** `npx tsc --noEmit` = 0 erros ✅

---

### Fase 1 — Compute

| ID  | Tarefa                                       | Status | Data       |
| --- | -------------------------------------------- | ------ | ---------- |
| 010 | `compute/pass-rate.ts` + teste + PBT         | ✅     | 2026-07-04 |
| 011 | `compute/avg-duration.ts` + teste + PBT      | ✅     | 2026-07-04 |
| 012 | `compute/suite-speed.ts` + teste + PBT       | ✅     | 2026-07-04 |
| 013 | `compute/flaky-rate.ts` + teste + PBT        | ✅     | 2026-07-04 |
| 014 | `compute/failure-reasons.ts` + teste + PBT   | ✅     | 2026-07-04 |
| 015 | `compute/branch-health.ts` + teste + PBT     | ✅     | 2026-07-04 |
| 016 | `compute/coverage.ts` + teste + PBT          | ✅     | 2026-07-04 |
| 017 | `compute/trends.ts` + teste + PBT            | ✅     | 2026-07-04 |
| 018 | `compute/scoring.ts` + teste + PBT           | ✅     | 2026-07-04 |
| 019 | `compute/release-score.ts` + teste + PBT     | ✅     | 2026-07-04 |
| 020 | `compute/quarantine-status.ts` + teste + PBT | ✅     | 2026-07-04 |
| 021 | Barrel `compute/index.ts`                    | ✅     | 2026-07-04 |
| 022 | Suite de integração compute                  | ✅     | 2026-07-04 |

**Checkpoint:** `npx vitest run shared/data-hub/` = 174/174 ✅

---

### Correções D5 — Conformidade Normativa

| ID  | Correção                                     | Status | Data       | Commit   |
| --- | -------------------------------------------- | ------ | ---------- | -------- |
| D5  | D5.10 — Referências normativas em types.ts   | ✅     | 2026-07-04 | 9e84029b |
| D5  | D5.5 — Tratamento de outliers (IQR)          | ✅     | 2026-07-04 | 9e84029b |
| D5  | D5.8 — Clamp consistente em todas as funções | ✅     | 2026-07-04 | 9e84029b |

---

### Validação Final Sprint 1

| Verificação                  | Status |
| ---------------------------- | ------ |
| `npx tsc --noEmit` = 0 erros | ✅     |
| `npx eslint` = 0 errors      | ✅     |
| `npx vitest run` = 100%      | ✅     |
| `npx vitest run` = 100% pass | ⏳     |
| `npm run lint` = 0 violações | ⏳     |

---

## Sprint 2 — Reorganização + Correção de Bloqueadores

**Início:** 2026-07-04

### Fase 0 — Organização

| ID  | Tarefa                                   | Status | Data       |
| --- | ---------------------------------------- | ------ | ---------- |
| 0.1 | Criar tarefas 010a/010b no plano         | ✅     | 2026-07-04 |
| 0.2 | Stash do estado atual                    | ✅     | 2026-07-04 |
| 0.3 | Verificar PROGRESS-DATA-HUB.md commitado | ✅     | 2026-07-04 |
| 0.4 | Pop stash                                | ✅     | 2026-07-04 |
| 0.5 | Validar estado (tsc + vitest)            | ✅     | 2026-07-04 |

**Checkpoint:** Working tree organizado. 1 TS error conhecido (gitlab-workflow.ts:93). 174/174 data-hub tests passam.

---

### Fase 2 — Providers

**Início:** 2026-07-04
**Conclusão:** 2026-07-04

| ID  | Tarefa                                | Status | Data       |
| --- | ------------------------------------- | ------ | ---------- |
| 031 | `getJobLogs` na interface GitProvider | ✅     | 2026-07-04 |
| 032 | GitHub Provider + 5 testes            | ✅     | 2026-07-04 |
| 033 | GitLab Provider + 5 testes            | ✅     | 2026-07-04 |
| 034 | Coverage Provider + 4 testes          | ✅     | 2026-07-04 |
| 035 | Jira Provider + 4 testes              | ✅     | 2026-07-04 |
| 036 | Composite Provider + 6 testes         | ✅     | 2026-07-04 |
| 037 | Integration test providers            | ✅     | 2026-07-04 |

**Correções de TS durante Fase 2:**

- `PipelineJob`: campos de timing → `string | undefined` / `number | undefined` (exactOptionalPropertyTypes)
- `coverage-provider.ts`: `coverage` propriedade omitida quando `undefined`
- `jira-provider.ts`: `resolution` propriedade removida do objeto (usa omit pattern)
- `gitlab-workflow.ts:93`: job mapping inclui timing mesmo quando undefined
- Mock objects: adicionado `getJobLogs` em 7 arquivos de teste

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npx vitest run shared/data-hub/` = 29 files, 202 tests, 0 failures ✅
- `npx vitest run shared/data-hub/__tests__/integration/providers.integration.test.ts` = 4/4 ✅

---

### Fase 3 — Hub + Cache

**Início:** 2026-07-04
**Conclusão:** 2026-07-04

| ID  | Tarefa                                   | Status | Data       |
| --- | ---------------------------------------- | ------ | ---------- |
| 040 | `DataHubImpl` class                      | ✅     | 2026-07-04 |
| 041 | `cache.ts` (session cache)               | ✅     | 2026-07-04 |
| 042 | `adapter.ts` (DataHub ↔ CiDataHub)       | ✅     | 2026-07-04 |
| 043 | Barrel `index.ts` + `providers/index.ts` | ✅     | 2026-07-04 |
| 044 | `ci-data.ts` (getOrFetchDataHub)         | ✅     | 2026-07-04 |
| 045 | `session-state.ts` (ensureCiDataHub)     | ✅     | 2026-07-04 |
| 046 | Integration test hub                     | ✅     | 2026-07-04 |

**Checkpoint:**

- Commit: `e8841245` (Hub + Cache + Adapter + Barrel + Integration)
- Design decision commit: `f94755bc` (comments for adapter/cache/ci-data)
- `npx vitest run shared/data-hub/` = 37 files, 238 tests, 0 failures ✅

---

### Fase 4 — Migrate 5 Core Consumers

**Início:** 2026-07-04
**Conclusão:** 2026-07-04

| ID  | Tarefa                                      | Status | Data       |
| --- | ------------------------------------------- | ------ | ---------- |
| 050 | `health-score.ts` (ciData → dataHub)        | ✅     | 2026-07-04 |
| 051 | `quality-gate.ts` (ciData → dataHub)        | ✅     | 2026-07-04 |
| 052 | `pr-report-core.ts` (ciData → dataHub)      | ✅     | 2026-07-04 |
| 053 | `pipeline-cost.ts` (ciData → dataHub)       | ✅     | 2026-07-04 |
| 054 | `traceability-matrix.ts` (ciData → dataHub) | ✅     | 2026-07-04 |

**Correções adicionais durante Fase 4:**

- `interactive-mode.ts`: added `_getDataHub()` helper + adapter import
- `schedule-handler.ts`: extract `resolveGitFallback()` + `extractTrendCategories()` helpers (reduced cognitive complexity 18→15)
- Test files: converted CiDataHub → DataHub via adapter, removed unnecessary conditionals

**Checkpoint:**

- Commit: `01cece81` (refactor: migrate 5 core consumers from CiDataHub to DataHub)
- `npx tsc --noEmit` = 0 errors ✅
- `npx vitest run` = 420 files, 6085 tests, 0 failures ✅

---

### Fase 5 — Entry Points

**Início:** 2026-07-04
**Conclusão:** 2026-07-04

| ID  | Tarefa                                   | Status | Data       |
| --- | ---------------------------------------- | ------ | ---------- |
| 060 | `session-state.ts` (ciData → dataHub)    | ✅     | 2026-07-04 |
| 061 | `batch-mode.ts` (ciData → dataHub)       | ✅     | 2026-07-04 |
| 062 | `interactive-mode.ts` (ciData → dataHub) | ✅     | 2026-07-04 |
| 063 | `schedule-handler.ts` (ciData → dataHub) | ✅     | 2026-07-04 |

**Nota:** Tasks 060, 062, 063 foram concluídas durante Fase 4. Task 061 (batch-mode.ts) concluída em separado.

**Checkpoint:**

- Commit: `e4c45a6a` (migrate batch-mode.ts)
- `npx tsc --noEmit` = 0 errors ✅
- `npx vitest run` = 420 files, 6085 tests, 0 failures ✅

---

### Fase 6 — Verificação de Integridade

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Verificação                          | Status | Data       |
| --- | ------------------------------------ | ------ | ---------- |
| 070 | Compute functions (30 exportadas)    | ✅     | 2026-07-05 |
| 071 | Orchestrators passam DataHub         | ✅     | 2026-07-05 |
| 072 | Fallback MetricsStore                | ✅     | 2026-07-05 |
| 073 | D5.1: Nome/descrição/unidade         | ✅     | 2026-07-05 |
| 074 | D5.2: Métricas acionáveis            | ✅     | 2026-07-05 |
| 075 | D5.5: Outliers visuais               | ✅ N/A | 2026-07-05 |
| 076 | D5.8: Valores saturados [0,100]      | ✅     | 2026-07-05 |
| 077 | D5.10: Thresholds com referência     | ✅     | 2026-07-05 |
| 078 | HTML generators não acessam CI bruto | ✅     | 2026-07-05 |
| 079 | Padrão Compute → Result → Render     | ✅     | 2026-07-05 |

**Evidência:** `audit/functional/phase6-verification-evidence.md`

**Checkpoint:** Verificação completa. Plano atualizado com dados corretos (30 funções, não 21).

---

### Fase 7 — Corrigir Testes Teatro

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Tarefa                                     | Status | Data       |
| --- | ------------------------------------------ | ------ | ---------- |
| 090 | health-score.integration.test.ts:273       | ✅     | 2026-07-05 |
| 091 | quality-gate.integration.test.ts:167       | ✅     | 2026-07-05 |
| 092 | ci-data-system.test.ts:114,221             | ✅     | 2026-07-05 |
| 093 | pr-report-core.integration.test.ts:533,556 | ✅     | 2026-07-05 |

**Bugs de produção encontrados e corrigidos:**

- `pr-report-core.ts:458` — healthScore calculado sem DataHub
- `health-score.ts:200` — empty DataHub sobrescrevia MetricsStore

**Refatoração:**

- `computeActualMetrics` → 5 funções helper extraídas (cognitividade 18→15)
- `makeDataHub` padronizado em 4 arquivos de teste

**Commit:** `178d25d7` — test: invert theater tests and fix DataHub integration bugs

**Checkpoint:**

- `npx vitest run` = 420 files, 6086 tests, 0 failures ✅
- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅

---

### Fase 8 — Sanitização

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Tarefa                                         | Status | Data       |
| --- | ---------------------------------------------- | ------ | ---------- |
| 100 | Remover ensureCiDataHub + \_ciDataHub          | ✅     | 2026-07-05 |
| 101 | Remover adapter.ts + barrel export             | ✅     | 2026-07-05 |
| 102 | Remover createCiDataHub + cálculos inline      | ✅     | 2026-07-05 |
| 103 | Remover 16 compute functions legadas           | ✅     | 2026-07-05 |
| 104 | Migrar invariantes PBT para funções produtivas | ✅ N/A | 2026-07-05 |
| 105 | Remover testes de código morto                 | ✅     | 2026-07-05 |
| 106 | Verificação final                              | ✅     | 2026-07-05 |

**Remoções:**

- `adapter.ts` (ciDataHubToDataHub, dataHubToCiDataHub)
- `createCiDataHub` + cálculos inline de `ci-data.ts`
- `ensureCiDataHub` + `_ciDataHub` de `session-state.ts`
- 16 compute functions (MetricsRun API):
    - pass-rate: calcPipelineFailRate, calcTestPassRate, calcExpWeightedPassRate, calcExecutionRate, calcExpWeightedExecutionRate
    - suite-speed: calcTestSuiteSpeed
    - flaky-rate: calcFlakyFromMetricsRuns, calcFlakyPercentage
    - trends: calcTrendsFromMetricsRuns
    - defect-trends: calcDefectTrends
    - scoring: scorePassRate, scoreFlakyRate, scoreCoverage, scoreExecutionRate, scoreSuiteSpeed
- `adapter.test.ts` (deleted)

**Reescritas (7 arquivos de teste):**

- ci-data.test.ts, ci-data-system.test.ts, ci-data-e2e.test.ts, ci-data-e2e-live.test.ts, ci-data.integration.test.ts
- hub.integration.test.ts, compute.integration.test.ts
- pass-rate.test.ts, pass-rate.property.test.ts, flaky-rate.test.ts, flaky-rate.property.test.ts
- suite-speed.test.ts, trends.test.ts, trends.property.test.ts, scoring.test.ts, scoring.property.test.ts

**Commit:** `927d5e9f` — refactor: remove dead code, migrate tests and PBT invariants to production API

**Checkpoint:**

- `npx vitest run` = 418 files, 6019 tests, 0 failures ✅
- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `grep -r "createCiDataHub\|ciDataHubToDataHub\|ensureCiDataHub" shared/` = 0 resultados em código de produção ✅

---

### Último commit conocional

- `1a626393` — refactor: remove dead defect-trends function and tests

---

## Sprint 3 — Fechamento de Gaps + Fase 8.5

**Início:** 2026-07-05

### Auditoria de Gaps (2026-07-05)

| ID  | Gap                                             | Severidade | Status |
| --- | ----------------------------------------------- | ---------- | ------ |
| G1  | Interface `CiDataHub` é dead code               | BAIXA      | ✅     |
| G2  | `tryCreateDataHub` hardcoded para GitHub        | MÉDIA      | ✅     |
| G3  | `.gitignore` gaps (state.json, Zone.Identifier) | MÉDIA      | ✅     |
| G4  | `_showCiDataHubSummary` nome desatualizado      | BAIXA      | ✅     |
| G5  | Comentários de teste referenciam CiDataHub      | BAIXA      | ✅     |
| G6  | TECHDOC.md desatualizado (CiDataHub)            | MÉDIA      | ⏳     |

---

### Fase 8.5 — Fechamento de Gaps

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID    | Tarefa                                    | Status | Data       |
| ----- | ----------------------------------------- | ------ | ---------- |
| 085.1 | Remover interface `CiDataHub` (dead code) | ✅     | 2026-07-05 |
| 085.2 | Corrigir `tryCreateDataHub` para GitLab   | ✅     | 2026-07-05 |
| 085.3 | Corrigir `.gitignore`                     | ✅     | 2026-07-05 |
| 085.4 | Renomear `_showCiDataHubSummary`          | ✅     | 2026-07-05 |
| 085.5 | Atualizar comentários de teste            | ✅     | 2026-07-05 |
| 085.6 | Verificação final                         | ✅     | 2026-07-05 |
| 085.7 | Resolução do commit                       | ✅     | 2026-07-05 |

**Commit:** `84432101` — fix(data-hub): remove dead CiDataHub interface, add GitLab support to PR report, fix gitignore

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros (session-state.ts depende do stash reaplicado) ✅
- `npx vitest run shared/data-hub/` = 169/169 passam ✅
- `grep -r "CiDataHub" shared/ --include="*.ts"` = 0 resultados em código de produção ✅
- `grep "_showCiDataHubSummary" git_triggers/` = 0 resultados ✅

---

### Fase 9 — Testes Atualizados

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Tarefa                                               | Status | Data       |
| --- | ---------------------------------------------------- | ------ | ---------- |
| 120 | `ci-data-getOrFetch.integration.test.ts`             | ✅     | 2026-07-05 |
| 121 | `session-state-ensureDataHub.integration.test.ts`    | ✅     | 2026-07-05 |
| 122 | `interactive-showDataHubSummary.integration.test.ts` | ✅     | 2026-07-05 |
| 123 | Export `_showDataHubSummary` for testing             | ✅     | 2026-07-05 |
| 124 | Final verification                                   | ✅     | 2026-07-05 |
| 125 | Commit                                               | ✅     | 2026-07-05 |

**Notas:**

- `getOrFetchDataHub` catches provider errors via `Promise.allSettled` in `fetchFromProviders` — returns hub with empty data, not `undefined`
- `manager`/`currentProjectName` are `let` exports — use `setManager`/`setCurrentProjectName` setters in tests (namespace getters are read-only)
- `_showDataHubSummary` tested as integration (completes without errors) rather than mocking prompt.js

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `npx vitest run` = 419 files, 6023 tests, 0 failures ✅

---

### Fase 10 — Documentação

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Tarefa                                           | Status | Data       |
| --- | ------------------------------------------------ | ------ | ---------- |
| 130 | Atualizar TECHDOC.md — seção Data Hub            | ✅     | 2026-07-05 |
| 131 | Atualizar MODULE MAP — data-hub/\* entries       | ✅     | 2026-07-05 |
| 132 | Verificar referências em BACKLOG/INTEGRATED-PLAN | ✅     | 2026-07-05 |

**Alterações:**

- `docs/TECHDOC.md`: replaced `CiDataHub` interface section with layered DataHub architecture (hub.ts, cache.ts, providers/, compute/)
- `docs/TECHDOC.md`: added data-hub/\* entries to MODULE MAP table
- `BACKLOG.md`: historical CiDataHub references kept as-is (historical record)
- `INTEGRATED-PLAN.md`: no DataHub references (no changes needed)

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `npx vitest run` = 419 files, 6023 tests, 0 failures ✅
- `grep -r "CiDataHub" docs/` = 0 resultados ✅

---

### Fase 11 — Auditoria Final + Correções de Issues

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID   | Tarefa                                                       | Status | Data       |
| ---- | ------------------------------------------------------------ | ------ | ---------- |
| 140  | `npx tsc --noEmit` = 0 erros                                 | ✅     | 2026-07-05 |
| 141  | `npx vitest run` = 100% pass                                 | ✅     | 2026-07-05 |
| 142  | `npm run lint` = 0 violações                                 | ✅     | 2026-07-05 |
| FIX1 | Benchmark cross-squad: não passar DataHub de outros projetos | ✅     | 2026-07-05 |
| FIX2 | Schedule handler: passar DataHub para traceability matrix    | ✅     | 2026-07-05 |

**Correções aplicadas:**

- `interactive-mode.ts:445`: `_dashboardBenchmark()` — DataHub só é passado para o projeto atual (`isCurrentProject && dataHub`), não para todos
- `schedule-handler.ts:194`: `buildTraceabilityMatrix()` agora recebe DataHub como 3º argumento
- `schedule-handler.ts:220-222`: Benchmark cross-squad — mesma correção aplicada

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `npx vitest run` = 419 files, 6023 tests, 0 failures ✅

---

### Fase 13 — Async Data Collection

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| ID  | Tarefa                                                               | Status | Data       |
| --- | -------------------------------------------------------------------- | ------ | ---------- |
| 160 | Multi-project cache (`cache.ts`) — Map por repo                      | ✅     | 2026-07-05 |
| 161 | Version comparison (`hub.ts`) — `hasDataChanged()`                   | ✅     | 2026-07-05 |
| 162 | Prefetch orchestrator (`session-state.ts`) — `prefetchAllProjects()` | ✅     | 2026-07-05 |
| 163 | Async startup (`interactive-mode.ts`) — fire-and-forget prefetch     | ✅     | 2026-07-05 |
| 164 | Sync on CI (`session-state.ts`) — blocking when `CI=true`            | ✅     | 2026-07-05 |
| 165 | Tests + PBT (22 novos testes)                                        | ✅     | 2026-07-05 |

**Alterações:**

- `shared/data-hub/cache.ts`: Reescrito — `Map<string, CacheEntry>` para suporte multi-projeto. Novas funções: `clearRepoCache()`, `getCacheSize()`
- `shared/data-hub/hub.ts`: Adicionado `hasDataChanged()` — compara run IDs + `updated_at` entre hub cacheado e dados novos
- `git_triggers/session-state.ts`: Adicionado `prefetchAllProjects()` — busca paralela de todos os projetos configurados. `ensureDataHubSync()` — versão síncrona para CI
- `git_triggers/interactive-mode.ts`: Startup agora lança `prefetchAllProjects()` como fire-and-forget. `ensureDataHub()` para projeto atual usa cache se prefetch já terminou

**Compatibilidade:**

- **GitHub**: `GitHubDataProvider` via `createManagerForProject()`
- **GitLab**: `GitLabDataProvider` via `createManagerForProject()`
- **Jira**: `JiraDataProvider` — disponível para prefetch futuro (atualmente sob demanda)
- **Xray**: Integrado via Jira — mesmo padrão

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `npx vitest run` = 419 files, 6035 tests, 0 failures ✅

---

### Correções de Gaps — Data Fetching

**Início:** 2026-07-05
**Conclusão:** 2026-07-05

| GAP   | Tarefa                                                         | Status | Data       |
| ----- | -------------------------------------------------------------- | ------ | ---------- |
| GAP-1 | Remover `securityAlerts` + `RawSecurityAlert` (contrato morto) | ✅     | 2026-07-05 |
| GAP-2 | Chamar `calcTrendsFromPipelineRuns()` em `computeMetrics()`    | ✅     | 2026-07-05 |
| GAP-3 | Remover `'xray'` de `DataProvider.source` (sem provider)       | ✅     | 2026-07-05 |
| GAP-4 | Mapear `created`/`updated`/`resolution` em `jira-provider.ts`  | ✅     | 2026-07-05 |
| GAP-5 | Adicionar `rootLogger.debug()` em catch blocks vazias          | ✅     | 2026-07-05 |
| GAP-6 | Estender `hasDataChanged()` para comparar coverage/jira        | ✅     | 2026-07-05 |
| GAP-7 | Tornar `CompositeProvider.source` dinâmico                     | ✅     | 2026-07-05 |
| GAP-8 | Documentar artifacts como intencional (futuro uso)             | ✅     | 2026-07-05 |

**Alterações:**

- `shared/types/data-hub.ts`: Removido `securityAlerts?: RawSecurityAlert[]` do `RawData` e interface `RawSecurityAlert`. Removido `'xray'` do tipo `DataProvider.source`. Adicionado JSDoc para `artifacts` documentando uso futuro. Corrigido tipo `resolution` para `string | undefined`.
- `shared/data-hub/hub.ts`: Importado `calcTrendsFromPipelineRuns`. Substituído `defectTrends: []` por `calcTrendsFromPipelineRuns(raw.runs)` em `computeMetrics()`. Estendido `hasDataChanged()` para comparar `coverage.percentage` e `jiraIssues.length`.
- `shared/data-hub/providers/jira-provider.ts`: Mapeado `fields['created']`, `fields['updated']`, `fields['resolution']` usando tipagem adequada.
- `shared/data-hub/providers/composite-provider.ts`: `source` agora é dinâmico (`providers[0]?.source ?? 'github'`).
- `shared/data-hub/providers/types.ts`: Removido `RawSecurityAlert` das re-exports.

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npm run lint` = 0 violações ✅
- `npx vitest run` = 420 files, 6039 tests, 0 failures ✅

---

**Próxima fase: Fase 12 — Push + CI**
