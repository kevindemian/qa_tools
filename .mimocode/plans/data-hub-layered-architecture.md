# Data Hub — Arquitetura em Camadas (v2)

## Registro de Progresso

> **Documento de progresso:** `audit/functional/PROGRESS-DATA-HUB.md`
>
> Ao iniciar uma nova sessão, ler esse documento para retomar de onde parou.
> Ao finalizar cada tarefa, atualizar o status no documento de progresso.

## Visão

Refatorar o CiDataHub (módulo monolítico de 457 linhas) em arquitetura de 3 camadas: **Providers** (aquisição), **Compute** (cálculo puro), **Hub** (orquestração + cache). A camada de aquisição puxa TODOS os dados brutos disponíveis de GitHub E GitLab. A camada de cálculo é escalável — novas funções sem modificar camadas anteriores. Todos os consumers migram para consumir funções de cálculo. Código morto é removido. Cada tarefa inclui teste unitário + PBT obrigatórios.

## Contexto

(Cfr. plano v1 — idêntico)

## Arquitetura Alvo

```
shared/
├── data-hub/                              # NOVO
│   ├── index.ts                           # Barrel público
│   │
│   ├── providers/                         # Camada 1: Aquisição
│   │   ├── types.ts                       # Re-export de types/data-hub.ts
│   │   ├── github-provider.ts             # Adapter GitHub → RawData
│   │   ├── gitlab-provider.ts             # Adapter GitLab → RawData
│   │   ├── jira-provider.ts               # Adapter Jira → RawData
│   │   ├── coverage-provider.ts           # Adapter Istanbul/CTRF → RawData
│   │   └── composite-provider.ts          # Agrega múltiplos providers
│   │
│   ├── compute/                           # Camada 2: Cálculo (funções puras)
│   │   ├── index.ts                       # Barrel
│   │   ├── types.ts                       # Config types + defaults
│   │   ├── pass-rate.ts                   # calcPipelinePassRate, calcTestPassRate, etc.
│   │   ├── avg-duration.ts                # calcAvgDuration
│   │   ├── suite-speed.ts                 # calcSuiteSpeedP95, calcTestSuiteSpeed
│   │   ├── flaky-rate.ts                  # calcFlakyFromPipelineRuns, calcFlakyFromMetricsRuns
│   │   ├── pipeline-cost.ts               # calcPipelineCost
│   │   ├── defect-trends.ts               # calcDefectTrends
│   │   ├── branch-health.ts               # calcBranchBreakdown, calcTopFailingJobs
│   │   ├── failure-reasons.ts             # calcTopFailureReasons, extractFailureReasons
│   │   ├── coverage.ts                    # calcCoverageFromRaw
│   │   ├── trends.ts                      # calcTrendsFromPipelineRuns, calcTrendsFromMetricsRuns
│   │   ├── release-score.ts               # calcReleaseScore
│   │   ├── quarantine-status.ts           # calcQuarantineStatus
│   │   └── scoring.ts                     # scorePassRate, scoreFlakyRate, etc.
│   │
│   ├── hub.ts                             # Camada 3: Orquestração
│   └── cache.ts                           # Cache por sessão
│
├── types/
│   ├── ci-cd.ts                           # EXISTENTE — getJobLogs adicionado
│   └── data-hub.ts                        # NOVO — todos os tipos públicos
│
├── metrics.ts                             # EXISTENTE — código morto removido
├── health-score.ts                        # EXISTENTE — refatorado
├── quality-gate.ts                        # EXISTENTE — refatorado
├── pr-report-core.ts                      # EXISTENTE — refatorado
└── ... (demais consumers)
```

## Regras ESLint Críticas (Bloqueiam Commit)

| Regra                                      | Severidade | Solução                                |
| ------------------------------------------ | ---------- | -------------------------------------- |
| `@typescript-eslint/no-non-null-assertion` | error      | Extrair variável + `?.`                |
| `@typescript-eslint/unbound-method`        | error      | Factory mock com referência separada   |
| `sonarjs/cognitive-complexity`             | error      | Extrair métodos (limite: 15)           |
| `vitest/padding-around-all`                | error      | Linha em branco antes de cada `expect` |
| `vitest/prefer-strict-equal`               | error      | Usar `toStrictEqual`                   |
| `sonarjs/publicly-writable-directories`    | error      | Evitar `/tmp` em testes                |

## Padrões Rejeitados pelo Pre-commit

| Padrão           | Motivo       |
| ---------------- | ------------ |
| `eslint-disable` | Hook rejeita |
| type-cast-unknown | Hook rejeita |
| `@ts-ignore`     | Hook rejeita |

---

## Convenções de Teste (Obrigatórias)

### Cada tarefa de compute inclui:

| Tipo         | Arquivo                                                     | Padrão                                               |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Unitário** | `shared/data-hub/__tests__/compute/<nome>.test.ts`          | `describe/it` com fixtures, `expect.hasAssertions()` |
| **PBT**      | `shared/data-hub/__tests__/compute/<nome>.property.test.ts` | `fc.assert(fc.property(...))` com `{ numRuns: 100 }` |

### Suite de integração ao final de cada fase:

| Tipo           | Arquivo                                                            |
| -------------- | ------------------------------------------------------------------ |
| **Integração** | `shared/data-hub/__tests__/integration/<nome>.integration.test.ts` |

### Coverage thresholds (vitest.config.ts):

| Métrica    | Threshold |
| ---------- | --------- |
| Lines      | 90%       |
| Functions  | 91%       |
| Branches   | 80%       |
| Statements | 90%       |

### Padrão de Extração (Obrigatório)

```typescript
// ❌ ERRADO — viola no-non-null-assertion
expect(result.coverage!.percentage).toBe(80);

// ✅ CORRETO — extrair variável
const coverage = result.coverage;
expect(coverage?.percentage).toBe(80);
```

### Padrão de Mock (Obrigatório)

```typescript
// ❌ ERRADO — viola unbound-method
vi.mocked(obj.method).mockResolvedValue(...);

// ✅ CORRETO — factory com referência separada
const methodMock = vi.fn();
const mock = { method: methodMock };
// ou
const searchMock = vi.fn();
const mockJira = { searchJiraIssues: searchMock } as JiraResourceLike;
```

### Padrão de断言 (Obrigatório)

```typescript
// ❌ ERRADO — viola vitest/prefer-strict-equal
expect(result.labels).toEqual(['critical']);

// ✅ CORRETO
expect(result.labels).toStrictEqual(['critical']);
```

### Padrão de Padding (Obrigatório)

```typescript
// ❌ ERRADO — viola vitest/padding-around-all
expect(result.a).toBeDefined();
expect(result.b).toBe(1);

// ✅ CORRETO — linha em branco antes de cada expect
expect(result.a).toBeDefined();

expect(result.b).toBe(1);
```

---

## Pré-Voo — Fase 0

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 0 — Fundação (Tarefas 001-005)

Sem testes — tipos puros, excluídos de coverage (`**/types/**`).

| ID  | Tarefa                                                               | Arquivo(s)                                             | Critério             |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| 001 | Criar estrutura de diretórios                                        | `shared/data-hub/providers/`, `compute/`, `__tests__/` | Diretórios existem   |
| 002 | Criar `shared/data-hub/providers/types.ts` (re-export)               | NOVO                                                   | `tsc --noEmit` passa |
| 003 | Criar `shared/types/data-hub.ts` com todos os tipos                  | NOVO                                                   | `tsc --noEmit` passa |
| 004 | Barrel em `shared/types.ts`                                          | EXISTENTE                                              | Import funciona      |
| 005 | Criar `shared/data-hub/compute/types.ts` com config types + defaults | NOVO                                                   | `tsc --noEmit` passa |

**Checkpoint:** `npx tsc --noEmit` = 0 erros.
**Commit:** `feat(data-hub): add foundation types for DataHub providers and compute layer`

---

## Pré-Voo — Fase 1

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 1 — Compute (Tarefas 010-022, 010a, 010b)

**D5 Completo (conforme auditoria):** Todas as 13 funções compute foram auditadas e corrigidas para conformidade D5:

- D5.5: Tratamento de outliers (IQR capping, exponential weighting)
- D5.8: Clamp consistente [0,100] em todas as funções
- D5.10: Referências normativas (DORA, Google SRE, Microsoft Research, ISTQB) em todos os thresholds

### 010 — Pass Rate + Fail Rate

| Item               | Conteúdo                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/pass-rate.ts`                                                                                                                                                               |
| **Funções**        | `calcPipelinePassRate(runs)`, `calcPipelineFailRate(runs)`, `calcTestPassRate(run)`, `calcExpWeightedPassRate(runs, window)`, `calcExecutionRate(run)`, `calcExpWeightedExecutionRate(runs, window)` |
| **Move de**        | `ci-data.ts:259-264`, `health-score.ts:171,176,138-150`                                                                                                                                              |
| **Teste unitário** | `__tests__/compute/pass-rate.test.ts` — 8 cenários                                                                                                                                                   |
| **PBT**            | `__tests__/compute/pass-rate.property.test.ts` — resultado sempre 0-100, vazio → 0                                                                                                                   |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/pass-rate` = 100% pass                                                                                                                             |

### 011 — Average Duration

| Item               | Conteúdo                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/avg-duration.ts`                                    |
| **Funções**        | `calcAvgDuration(runs)`                                                      |
| **Move de**        | `ci-data.ts:267-282`                                                         |
| **Teste unitário** | `__tests__/compute/avg-duration.test.ts` — 6 cenários                        |
| **PBT**            | `__tests__/compute/avg-duration.property.test.ts` — resultado sempre 0-86400 |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/avg-duration` = 100% pass  |

### 012 — Suite Speed P95

| Item               | Conteúdo                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/suite-speed.ts`                                   |
| **Funções**        | `calcSuiteSpeedP95(jobsMap)`, `calcTestSuiteSpeed(runs)`                   |
| **Move de**        | `ci-data.ts:286-300`, `health-score.ts:152-163`                            |
| **Teste unitário** | `__tests__/compute/suite-speed.test.ts` — 7 cenários                       |
| **PBT**            | `__tests__/compute/suite-speed.property.test.ts` — resultado ≥ 0           |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/suite-speed` = 100% pass |

### 013 — Flaky Rate (consolidado)

| Item               | Conteúdo                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `shared/data-hub/compute/flaky-rate.ts`                                                                                              |
| **Funções**        | `calcFlakyFromPipelineRuns(runs, jobsMap)`, `calcFlakyFromMetricsRuns(runs, config)`, `calcFlakyPercentage(flakyResults, threshold)` |
| **Consolida**      | `ci-data.ts:403-457`, `health-score.ts:125-136`, `traceability-matrix.ts:51-72`                                                      |
| **Teste unitário** | `__tests__/compute/flaky-rate.test.ts` — 10 cenários                                                                                 |
| **PBT**            | `__tests__/compute/flaky-rate.property.test.ts` — taxa sempre 0-100                                                                  |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/flaky-rate` = 100% pass                                                            |

### 014 — Failure Reasons

| Item               | Conteúdo                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/failure-reasons.ts`                                      |
| **Funções**        | `calcTopFailureReasons(map)`, `extractFailureReasons(logText)`                    |
| **Move de**        | `ci-data.ts:361-400`                                                              |
| **Teste unitário** | `__tests__/compute/failure-reasons.test.ts` — 6 cenários                          |
| **PBT**            | `__tests__/compute/failure-reasons.property.test.ts` — ≤ 10 resultados, count ≥ 1 |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/failure-reasons` = 100% pass    |

### 015 — Branch Health + Top Failing Jobs

| Item               | Conteúdo                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/branch-health.ts`                                        |
| **Funções**        | `calcBranchBreakdown(runs)`, `calcTopFailingJobs(runs, jobsMap)`                  |
| **Move de**        | `ci-data.ts:303-358`                                                              |
| **Teste unitário** | `__tests__/compute/branch-health.test.ts` — 6 cenários                            |
| **PBT**            | `__tests__/compute/branch-health.property.test.ts` — passRate 0-100, topJobs ≤ 10 |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/branch-health` = 100% pass      |

### 016 — Coverage

| Item                   | Conteúdo                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| **Arquivo**            | `shared/data-hub/compute/coverage.ts`                                   |
| **Funções**            | `calcCoverageFromRaw(rawCoverage)`                                      |
| **Implementação nova** |                                                                         |
| **Teste unitário**     | `__tests__/compute/coverage.test.ts` — 5 cenários                       |
| **PBT**                | `__tests__/compute/coverage.property.test.ts` — resultado 0-100         |
| **Critério**           | `npx vitest run shared/data-hub/__tests__/compute/coverage` = 100% pass |

### 017 — Trends

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/trends.ts`                                                         |
| **Funções**        | `calcTrendsFromPipelineRuns(runs, window)`, `calcTrendsFromMetricsRuns(runs, window)`       |
| **Move de**        | `metrics.ts:242-250`                                                                        |
| **Teste unitário** | `__tests__/compute/trends.test.ts` — 6 cenários                                             |
| **PBT**            | `__tests__/compute/trends.property.test.ts` — datas ordenadas, passRate 0-100, ≤ windowSize |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/trends` = 100% pass                       |

### 018 — Scoring

| Item               | Conteúdo                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/scoring.ts`                                                                        |
| **Funções**        | `scorePassRate`, `scoreFlakyRate`, `scoreCoverage`, `scoreExecutionRate`, `scoreSuiteSpeed`, `computeGrade` |
| **Move de**        | `health-score.ts:218-261`                                                                                   |
| **Teste unitário** | `__tests__/compute/scoring.test.ts` — 10 cenários                                                           |
| **PBT**            | `__tests__/compute/scoring.property.test.ts` — score 0-100, grade válido                                    |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/scoring` = 100% pass                                      |

### 019 — Release Score

| Item                   | Conteúdo                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Arquivo**            | `shared/data-hub/compute/release-score.ts`                                   |
| **Funções**            | `calcReleaseScore(health, coverage, flakyRate)`                              |
| **Implementação nova** |                                                                              |
| **Teste unitário**     | `__tests__/compute/release-score.test.ts` — 6 cenários                       |
| **PBT**                | `__tests__/compute/release-score.property.test.ts` — score 0-100             |
| **Critério**           | `npx vitest run shared/data-hub/__tests__/compute/release-score` = 100% pass |

### 020 — Quarantine Status

| Item                   | Conteúdo                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Arquivo**            | `shared/data-hub/compute/quarantine-status.ts`                                           |
| **Funções**            | `calcQuarantineStatus(flakyResults, quarantined)`                                        |
| **Implementação nova** |                                                                                          |
| **Teste unitário**     | `__tests__/compute/quarantine-status.test.ts` — 5 cenários                               |
| **PBT**                | `__tests__/compute/quarantine-status.property.test.ts` — counts ≥ 0, quarantined ≤ flaky |
| **Critério**           | `npx vitest run shared/data-hub/__tests__/compute/quarantine-status` = 100% pass         |

### 010a — Pipeline Cost (Compute Puro)

| Item               | Conteúdo                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/pipeline-cost.ts`                                             |
| **Funções**        | `calcPipelineCost(runs, costPerMinute?)`                                               |
| **Move de**        | `pipeline-cost.ts:51-85` (cálculo puro de custo por run)                               |
| **Teste unitário** | `__tests__/compute/pipeline-cost.test.ts` — 5 cenários                                 |
| **PBT**            | `__tests__/compute/pipeline-cost.property.test.ts` — resultado ≥ 0, custo proporcional |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/pipeline-cost` = 100% pass           |

### 010b — Defect Trends (Compute Puro)

| Item               | Conteúdo                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/defect-trends.ts`                                       |
| **Funções**        | `calcDefectTrends(failureClassifications)`                                       |
| **Move de**        | `defect-trend.ts:50-52` (agrupamento por data/categoria)                         |
| **Teste unitário** | `__tests__/compute/defect-trends.test.ts` — 5 cenários                           |
| **PBT**            | `__tests__/compute/defect-trends.property.test.ts` — datas ordenadas, counts ≥ 0 |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/compute/defect-trends` = 100% pass     |

### 021 — Barrel Compute

| Item         | Conteúdo                                           |
| ------------ | -------------------------------------------------- |
| **Arquivo**  | `shared/data-hub/compute/index.ts`                 |
| **Ação**     | Re-export todas as funções (incluindo 010a e 010b) |
| **Critério** | `tsc --noEmit` passa                               |

### 022 — Suite de Integração Compute

| Item         | Conteúdo                                                            |
| ------------ | ------------------------------------------------------------------- |
| **Arquivo**  | `shared/data-hub/__tests__/integration/compute.integration.test.ts` |
| **Testes**   | Fluxo: dados brutos → compute functions → resultado coerente        |
| **Critério** | Suite inteira passa                                                 |

**Checkpoint Fase 1:** `npx vitest run shared/data-hub/` = 100%. Coverage ≥ 90%.
**Commit:** `feat(data-hub): add compute layer with 13 pure functions, unit tests, and PBT`

---

## Pré-Voo — Fase 2

### ESLint Rules (erros, não warnings)

| Regra                                   | Ação                              |
| --------------------------------------- | --------------------------------- |
| `no-non-null-assertion`                 | Extrair variável, usar `?.`       |
| `unbound-method`                        | Criar factory com mock separado   |
| `cognitive-complexity`                  | Extrair métodos auxiliares        |
| `vitest/padding-around-all`             | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal`            | Usar `toStrictEqual`              |
| `sonarjs/publicly-writable-directories` | Evitar `/tmp` em testes           |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 2 — Providers (Tarefas 030-037)

### 030 — Fix GitLab Timing

| Item        | Conteúdo                                                                              |
| ----------- | ------------------------------------------------------------------------------------- |
| **Arquivo** | `git_triggers/gitlab-workflow.ts:93-98`                                               |
| **Ação**    | Adicionar `started_at`, `finished_at`, `duration` ao mapping de `glGetPipelineJobs()` |
| **Teste**   | `git_triggers/gitlab-workflow.test.ts` — jobs retornam timing                         |

### 031 — Fix `getJobLogs` na interface

| Item                  | Conteúdo                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Arquivo**           | `shared/types/ci-cd.ts`                                                                                                    |
| **Ação**              | Adicionar `getJobLogs?: (jobId: string \| number, maxBytes?: number) => Promise<string \| null>` à interface `GitProvider` |
| **Impacto**           | 7+ arquivos de teste que fazem mock de GitProvider                                                                         |
| **Arquivos afetados** | `__tests__/ci-data.test.ts`, `__tests__/e2e/`, `__tests__/integration/`, `__tests__/system/`, `test-utils/factories/`      |
| **Ação adicional**    | Atualizar todos os mocks para incluir `getJobLogs`                                                                         |
| **Critério**          | `tsc --noEmit` passa                                                                                                       |

### 032 — GitHub Provider

| Item               | Conteúdo                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/providers/github-provider.ts`                          |
| **Classe**         | `GitHubDataProvider implements DataProvider`                            |
| **Move de**        | `ci-data.ts:110-170`                                                    |
| **Correção bug**   | `fetchFailureReasons` usa `getJobLogs()` em vez de `downloadArtifact()` |
| **Teste unitário** | `__tests__/providers/github-provider.test.ts` — 5 cenários              |
| **Critério**       | 100% pass                                                               |

### 033 — GitLab Provider

| Item               | Conteúdo                                                   |
| ------------------ | ---------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/providers/gitlab-provider.ts`             |
| **Classe**         | `GitLabDataProvider implements DataProvider`               |
| **Teste unitário** | `__tests__/providers/gitlab-provider.test.ts` — 5 cenários |
| **Critério**       | 100% pass                                                  |

### 034 — Coverage Provider

| Item               | Conteúdo                                                     |
| ------------------ | ------------------------------------------------------------ |
| **Arquivo**        | `shared/data-hub/providers/coverage-provider.ts`             |
| **Teste unitário** | `__tests__/providers/coverage-provider.test.ts` — 4 cenários |
| **Critério**       | 100% pass                                                    |

### 035 — Jira Provider

| Item               | Conteúdo                                                 |
| ------------------ | -------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/providers/jira-provider.ts`             |
| **Teste unitário** | `__tests__/providers/jira-provider.test.ts` — 4 cenários |
| **Critério**       | 100% pass                                                |

### 036 — Composite Provider

| Item               | Conteúdo                                          |
| ------------------ | ------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/providers/composite-provider.ts` |
| **Teste unitário** | 5 cenários                                        |
| **PBT**            | Invariante: providers que falham não crasham      |
| **Critério**       | 100% pass                                         |

### 037 — Suite de Integração Providers

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/data-hub/__tests__/integration/providers.integration.test.ts` |
| **Testes**  | Mock provider → fetchRawData → dados coerentes (GitHub + GitLab)      |

**Checkpoint Fase 2:** GitLab timing funciona. `getJobLogs` na interface. Providers completos.
**Commit:** `feat(data-hub): add GitHub/GitLab/Jira/Coverage providers with GitLab timing fix`

---

## Pré-Voo — Fase 3

### Pré-requisito

**IMPORTANTE:** Tasks 010a (pipeline-cost) e 010b (defect-trends) devem ser implementadas ANTES de Fase 3. O Hub depende de todas as funções compute.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `unbound-method`             | Criar factory com mock separado   |
| `cognitive-complexity`       | Extrair métodos auxiliares        |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 3 — Hub + Cache (Tarefas 040-044)

### Decisões de Design (pesquisa prévia)

| Questão                                  | Solução                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Conflito de nomes `DataHub`              | Classe se chama `DataHubImpl` (evita conflito com interface `DataHub` em `data-hub.ts`)                                 |
| Cache duplicado                          | Criar `cache.ts` como única fonte de verdade. Remover `_cachedHub` de `ci-data.ts` e `_ciDataHub` de `session-state.ts` |
| `getOrFetchCiDataHub` existe             | Criar `getOrFetchDataHub` (novo tipo). Manter `getOrFetchCiDataHub` como wrapper usando adapter                         |
| Compatibilidade `CiDataHub` vs `DataHub` | Criar `adapter.ts` com funções `dataHubToCiDataHub` e `ciDataHubToDataHub`                                              |
| `CiDataHub` still useful                 | Documentar utilidade: backward-compat para consumers existentes. Adapter converte para novo tipo                        |

### 040 — Hub

| Item                 | Conteúdo                                                          |
| -------------------- | ----------------------------------------------------------------- |
| **Arquivo**          | `shared/data-hub/hub.ts`                                          |
| **Classe**           | `DataHubImpl implements DataHub` — orquestra providers + compute  |
| **Dependências**     | Todos os providers (Fase 2) + todas as funções compute (Fase 1)   |
| **Responsabilidade** | Buscar dados via providers, calcular métricas, retornar `DataHub` |
| **Teste unitário**   | `__tests__/hub.test.ts` — 6 cenários                              |
| **Critério**         | 100% pass                                                         |

### 041 — Cache

| Item                 | Conteúdo                                                           |
| -------------------- | ------------------------------------------------------------------ |
| **Arquivo**          | `shared/data-hub/cache.ts`                                         |
| **Responsabilidade** | Cache por sessão para evitar fetches redundantes                   |
| **Padrão**           | Module-level vars (consistente com padrão existente)               |
| **Consumidores**     | `hub.ts`, `ci-data.ts`, `session-state.ts` — todos usam este cache |
| **Teste unitário**   | `__tests__/cache.test.ts` — 4 cenários                             |
| **Critério**         | 100% pass                                                          |

### 042 — Adapter

| Item               | Conteúdo                                            |
| ------------------ | --------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/adapter.ts`                        |
| **Funções**        | `dataHubToCiDataHub(hub: DataHub): CiDataHub`       |
|                    | `ciDataHubToDataHub(ciData: CiDataHub): DataHub`    |
| **Propósito**      | Converter entre tipos para backward-compatibilidade |
| **Teste unitário** | `__tests__/adapter.test.ts` — 4 cenários            |
| **Critério**       | 100% pass                                           |

### 043 — Barrel

| Item         | Conteúdo                                                        |
| ------------ | --------------------------------------------------------------- |
| **Arquivo**  | `shared/data-hub/index.ts`                                      |
| **Ação**     | Re-export `DataHubImpl`, compute functions, providers, adapters |
| **Critério** | `tsc --noEmit` passa                                            |

### 044 — Wrapper ci-data.ts

| Item                | Conteúdo                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| **Arquivo**         | `shared/ci-data.ts` (EXISTENTE)                                                                 |
| **Ação**            | Criar `getOrFetchDataHub` (novo tipo). Manter `getOrFetchCiDataHub` como wrapper usando adapter |
| **Compatibilidade** | `ciData` parâmetro opcional em consumers continua funcionando                                   |
| **Critério**        | Todos os testes existentes continuam passando                                                   |

### 045 — Atualizar session-state.ts

| Item         | Conteúdo                                      |
| ------------ | --------------------------------------------- |
| **Arquivo**  | `git_triggers/session-state.ts` (EXISTENTE)   |
| **Ação**     | Usar `cache.ts` em vez de `_ciDataHub` local  |
| **Critério** | Todos os testes existentes continuam passando |

### 046 — Suite de Integração Hub

| Item        | Conteúdo                                                        |
| ----------- | --------------------------------------------------------------- |
| **Arquivo** | `shared/data-hub/__tests__/integration/hub.integration.test.ts` |
| **Testes**  | Fluxo completo: providers → hub → compute → métricas            |

**D5 Obrigatório:** Hub orquestra funções compute que produzem métricas. Verificar:

- D5.4: Agregação correta ao combinar resultados de múltiplas funções
- D5.7: Guards zero/NaN preservados ao propagar resultados
- D5.8: Clamp consistente ao agregar métricas

**Commit:** `feat(data-hub): add hub orchestrator, session cache, adapter, and ci-data.ts wrapper`

---

## Pré-Voo — Fase 4

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `unbound-method`             | Criar factory com mock separado   |
| `cognitive-complexity`       | Extrair métodos auxiliares        |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

### Análise de Impacto

| Consumer                 | Arquivos de teste afetados                                      |
| ------------------------ | --------------------------------------------------------------- |
| `health-score.ts`        | `__tests__/integration/health-score.integration.test.ts`        |
| `quality-gate.ts`        | `__tests__/integration/quality-gate.integration.test.ts`        |
| `pr-report-core.ts`      | `__tests__/integration/pr-report-core.integration.test.ts`      |
| `pipeline-cost.ts`       | `__tests__/integration/pipeline-cost.integration.test.ts`       |
| `traceability-matrix.ts` | `__tests__/integration/traceability-matrix.integration.test.ts` |

---

## Fase 4 — Migrar Consumers Core (Tarefas 050-054)

> **DECISÃO REGISTRADA (2026-07-04):** Parâmetro renomeado de `ciData` para `dataHub` para manter correspondência nome-tipo. Tipo mudado de `CiDataHub` (legado) para `DataHub` (novo). Todos os callers precisam ser atualizados.

### 050 — health-score.ts

| Item                  | Conteúdo                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| **Arquivo**           | `shared/health-score.ts` (EXISTENTE)                                    |
| \*\*Ação`             | Mudar tipo de `ciData?: CiDataHub` para `dataHub?: DataHub`             |
| \*\*Responsabilidade` | Usar métricas do DataHub quando disponíveis, fallback para MetricsStore |
| **Teste unitário**    | Atualizar `__tests__/integration/health-score.integration.test.ts`      |
| **Critério**          | 100% pass                                                               |

### 051 — quality-gate.ts

| Item               | Conteúdo                                                           |
| ------------------ | ------------------------------------------------------------------ |
| **Arquivo**        | `shared/quality-gate.ts` (EXISTENTE)                               |
| \*\*Ação`          | Mudar tipo de `ciData?: CiDataHub` para `dataHub?: DataHub`        |
| **Teste unitário** | Atualizar `__tests__/integration/quality-gate.integration.test.ts` |
| **Critério**       | 100% pass                                                          |

### 052 — pr-report-core.ts

| Item               | Conteúdo                                                             |
| ------------------ | -------------------------------------------------------------------- |
| **Arquivo**        | `shared/pr-report-core.ts` (EXISTENTE)                               |
| \*\*Ação`          | Mudar tipo de `ciData?: CiDataHub` para `dataHub?: DataHub`          |
| **Teste unitário** | Atualizar `__tests__/integration/pr-report-core.integration.test.ts` |
| **Critério**       | 100% pass                                                            |

### 053 — pipeline-cost.ts

| Item               | Conteúdo                                                            |
| ------------------ | ------------------------------------------------------------------- |
| **Arquivo**        | `shared/pipeline-cost.ts` (EXISTENTE)                               |
| \*\*Ação`          | Mudar tipo de `ciData?: CiDataHub` para `dataHub?: DataHub`         |
| **Teste unitário** | Atualizar `__tests__/integration/pipeline-cost.integration.test.ts` |
| **Critério**       | 100% pass                                                           |

### 054 — traceability-matrix.ts

| Item               | Conteúdo                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| **Arquivo**        | `shared/traceability-matrix.ts` (EXISTENTE)                               |
| \*\*Ação`          | Mudar tipo de `ciData?: CiDataHub` para `dataHub?: DataHub`               |
| **Teste unitário** | Atualizar `__tests__/integration/traceability-matrix.integration.test.ts` |
| **Critério**       | 100% pass                                                                 |

**D5 Obrigatório:** Consumers consomem e exibem métricas. Verificar:

- D5.1: Métricas exibidas têm nome/descrição/unidade claros
- D5.2: Métricas exibidas são úteis para decisão
- D5.8: Valores exibidos estão saturados [0,100] quando aplicável
- D5.10: Thresholds exibidos têm referência normativa

**Commit:** `refactor: migrate 5 core consumers from CiDataHub to DataHub`

---

## Pré-Voo — Fase 5

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                            |
| ----------------------- | ------------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.`     |
| `unbound-method`        | Criar factory com mock separado |
| `cognitive-complexity`  | Extrair métodos auxiliares      |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

### Análise de Impacto

| Entry Point           | Arquivos de teste afetados                |
| --------------------- | ----------------------------------------- |
| `session-state.ts`    | `__tests__/system/ci-data-system.test.ts` |
| `batch-mode.ts`       | `__tests__/e2e/ci-data-e2e.test.ts`       |
| `interactive-mode.ts` | `__tests__/e2e/ci-data-e2e.test.ts`       |
| `schedule-handler.ts` | `__tests__/e2e/ci-data-e2e-live.test.ts`  |

---

## Fase 5 — Entry Points (Tarefas 060-063)

### 060 — session-state.ts

| Item               | Conteúdo                                            |
| ------------------ | --------------------------------------------------- |
| **Arquivo**        | `git_triggers/session-state.ts` (EXISTENTE)         |
| \*\*Ação`          | Criar/gerenciar instância DataHub por sessão        |
| **Teste unitário** | Atualizar `__tests__/system/ci-data-system.test.ts` |
| **Critério**       | 100% pass                                           |

### 061 — batch-mode.ts

| Item               | Conteúdo                                      |
| ------------------ | --------------------------------------------- |
| **Arquivo**        | `git_triggers/batch-mode.ts` (EXISTENTE)      |
| \*\*Ação`          | Passar DataHub para consumers                 |
| **Teste unitário** | Atualizar `__tests__/e2e/ci-data-e2e.test.ts` |
| **Critério**       | 100% pass                                     |

### 062 — interactive-mode.ts

| Item               | Conteúdo                                       |
| ------------------ | ---------------------------------------------- |
| **Arquivo**        | `git_triggers/interactive-mode.ts` (EXISTENTE) |
| \*\*Ação`          | Passar DataHub para consumers                  |
| **Teste unitário** | Atualizar `__tests__/e2e/ci-data-e2e.test.ts`  |
| **Critério**       | 100% pass                                      |

### 063 — schedule-handler.ts

| Item               | Conteúdo                                           |
| ------------------ | -------------------------------------------------- |
| **Arquivo**        | `git_triggers/schedule-handler.ts` (EXISTENTE)     |
| \*\*Ação`          | Passar DataHub para consumers                      |
| **Teste unitário** | Atualizar `__tests__/e2e/ci-data-e2e-live.test.ts` |
| **Critério**       | 100% pass                                          |

**D5 Obrigatório:** Entry points propagam métricas para users. Verificar:

- D5.1: Formatação de métricas é clara (unidades, decimais)
- D5.8: Valores exibidos estão saturados quando aplicável

**Commit:** `refactor: migrate entry points to pass DataHub and use compute functions`

---

## Pré-Voo — Fase 5.5

### Contexto

Investigação profunda (2026-07-05) revelou 6 categorias de gaps na consolidação do DataHub. A centralização de dados não está completa — existem caches duplicados, caminhos de dados paralelos, round-trips lossy, bug no cálculo de flaky percentage, e GitLab não suportado via DataHub. Esta fase consolida todos os gaps antes da verificação de integridade.

### Regras

- **TODOS os problemas encontrados são corrigidos** — sem exceções, sem justificativas
- Se um teste falhar, o **código-fonte** tem bug — nunca o teste
- Valores esperados vêm de **requisitos e domínio**, nunca do output atual
- Nenhum mecanismo de segurança ou qualidade pode ser desabilitado, suprimido ou alterado

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |
| `unbound-method`        | Factory mock separado       |
| `cognitive-complexity`  | Extrair métodos auxiliares  |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 5.5 — Consolidação DataHub (Tarefas 080-086)

### 080 — Fix `countUniqueJobs` bug

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `shared/data-hub/hub.ts`                                                                         |
| **Bug**            | `countUniqueJobs()` (linhas 201-211) cria `Set` vazio e nunca popula — sempre retorna 1          |
| **Impacto**        | `calculateFlakyPercentage` divide por 1 → flaky % inflado centenas/milhares de vezes → `releaseScore` corrompido |
| **Causa**          | Método recebe apenas `runs`, não `raw.jobs` — não tem acesso ao mapa de jobs                      |
| **Ação**           | Passar `raw.jobs` para `computeReleaseScore` → `calculateFlakyPercentage` → `countUniqueJobs`. Contar nomes únicos de jobs a partir de `raw.jobs` |
| **Risco**          | ALTO — muda releaseScore calculado (correção intencional)                                        |
| **Teste unitário** | Atualizar `__tests__/compute/scoring.test.ts` — cenário com múltiplos jobs distintos             |
| **Teste PBT**      | Atualizar `__tests__/compute/scoring.property.test.ts` — flaky percentage usa contagem real      |
| **Critério**       | `countUniqueJobs` retorna número real de jobs únicos; flaky % é proporcional                     |

### 081 — Unificar cache

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivos**       | `shared/ci-data.ts` (linhas 237-285), `shared/data-hub/cache.ts`                                |
| **Gap**            | 3 caches separados: `cache.ts` (com TTL, zero consumidores), `ci-data.ts` (sem TTL, 2 caches)   |
| **Ação**           | `getOrFetchDataHub` passa a usar `getCachedHub`/`setCachedHub` de `cache.ts`. Remover `_cachedDataHub` e `_cachedDataHubRepo` de `ci-data.ts`. Cache legado `_cachedHub` (CiDataHub) mantido para backward-compat |
| **Risco**          | BAIXO — mesma funcionalidade, mecanismo unificado                                                |
| **Teste**          | `cache.test.ts` existente                                                                        |
| **Critério**       | `getCachedHub`/`setCachedHub` são as únicas funções de cache para DataHub                        |

### 082 — Suporte GitLab via DataHub

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `shared/ci-data.ts` (linha 275)                                                                  |
| **Gap**            | `getOrFetchDataHub` sempre cria `GitHubDataProvider` — `GitLabDataProvider` existe mas nunca usado |
| **Ação**           | Verificar `provider.provider` ('gitlab' | 'github') e selecionar `GitLabDataProvider` ou `GitHubDataProvider` |
| **Risco**          | BAIXO — providers implementam mesma interface                                                    |
| **Teste**          | Adicionar cenário GitLab em `__tests__/integration/providers.integration.test.ts`                |
| **Critério**       | GitLab provider é selecionado quando `provider.provider === 'gitlab'`                            |

### 083 — Eliminar round-trip lossy

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivos**       | `git_triggers/session-state.ts`, `git_triggers/interactive-mode.ts`, `git_triggers/batch-mode.ts`, `git_triggers/schedule-handler.ts`, `shared/pr-report-core.ts` |
| **Gap**            | Padrão `DataHub → CiDataHub → DataHub` zera coverage, pipelineCost, defectTrends, releaseScore, quarantineStatus |
| **Ação**           | `session-state.ts` armazena `DataHub` diretamente. `_getDataHub()` retorna `DataHub` original. `getCiDataHub()` continua disponível via adapter para consumers que precisam de `CiDataHub` |
| **Risco**          | MÉDIO — remove perda de dados, dados completos agora disponíveis                                |
| **Teste**          | Atualizar `__tests__/system/ci-data-system.test.ts`                                              |
| **Critério**       | Round-trip `DataHub → CiDataHub → DataHub` não mais necessário para consumers que só precisam de DataHub |

### 084 — Converter `_showCiDataHubSummary` para DataHub

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `git_triggers/interactive-mode.ts` (linhas 638-691)                                              |
| **Gap**            | Função chama `createCiDataHub` diretamente — bypass DataHub, sem cache, fetch fresco toda vez    |
| **Ação**           | Usar `getOrFetchDataHub` ou hub da sessão via `_getDataHub()`                                    |
| **Risco**          | BAIXO — mesma display logic                                                                      |
| **Teste**          | Teste existente do menu interativo                                                               |
| **Critério**       | `_showCiDataHubSummary` não chama `createCiDataHub` diretamente                                  |

### 085 — Converter batch-mode.ts para DataHub direto

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `git_triggers/batch-mode.ts` (linhas 171-181, 383-399)                                           |
| **Gap**            | Dupla conversão `getOrFetchCiDataHub + ciDataHubToDataHub`. `generatePipelineHealthReport` chama `m.getRecentPipelines()` diretamente — bypass DataHub |
| **Ação**           | Usar `getOrFetchDataHub` direto. Converter `generatePipelineHealthReport` para usar dados do DataHub |
| **Risco**          | MÉDIO — muda de legacy para DataHubImpl calculation                                              |
| **Teste**          | Atualizar `__tests__/e2e/ci-data-e2e.test.ts`                                                    |
| **Critério**       | batch-mode.ts não chama `createCiDataHub` nem `m.getRecentPipelines()` para métricas             |

### 086 — Suite de validação Fase 5.5

| Item               | Conteúdo                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Arquivo**        | `shared/data-hub/__tests__/integration/phase55.integration.test.ts`                              |
| **Testes**         | Validação ponta-a-ponta: DataHub criado → cacheado → providers selecionados → compute correto → dados completos no round-trip |
| **Critério**       | Suite inteira passa                                                                              |

**Checkpoint Fase 5.5:** `npx vitest run shared/data-hub/` = 100%. Cache unificado. GitLab funcionando. Round-trip lossy eliminado. Bug countUniqueJobs corrigido.
**Commit:** `fix(data-hub): consolidate caching, fix countUniqueJobs, add GitLab support, eliminate lossy adapter round-trip`

---

## Pré-Voo — Fase 6

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |
| `cognitive-complexity`  | Extrair métodos auxiliares  |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 6 — Verificação de Integridade (Tarefas 070-079)

> **CONCLUÍDA (2026-07-05):** Verificação completa. 30 funções compute exportadas, 12 orquestradas por hub.ts. Nenhuma aceita DataHub diretamente — recebem tipos brutos (PipelineRun[], MetricsRun[], etc.) por design. DataHub é output, não input. Padrão Compute → Result → Render preservado em todos os 14 HTML generators. Fallback MetricsStore funcional em todos os 3 consumidores primários. D5.1/D5.8/D5.10 plenamente satisfeitos.

### Resultados da Verificação

#### 070 — Compute Functions (30 exportadas, 12 orquestradas)

**Arquitetura:** Funções compute aceitam tipos brutos (PipelineRun[], MetricsRun[], Map, string), NÃO DataHub. DataHub é o resultado orquestrado pelo hub — não uma entrada. Isso é correto: separação de responsabilidades.

**Funções orquestradas por hub.ts (12):**

| Função | Arquivo | Aceita |
|--------|---------|--------|
| `calcPipelinePassRate` | pass-rate.ts | `PipelineRun[]` |
| `calcAvgDuration` | avg-duration.ts | `PipelineRun[]` |
| `calcSuiteSpeedP95` | suite-speed.ts | `Map<number, PipelineJob[]>` |
| `calcFlakyFromPipelineRuns` | flaky-rate.ts | `PipelineRun[]` + `Map` |
| `calcCoverageFromRaw` | coverage.ts | `RawCoverage` |
| `calcPipelineCost` | pipeline-cost.ts | `PipelineRun[]` |
| `calcBranchBreakdown` | branch-health.ts | `PipelineRun[]` |
| `calcTopFailingJobs` | branch-health.ts | `PipelineRun[]` + `Map` |
| `calcTopFailureReasons` | failure-reasons.ts | `Map<number, string[]>` |
| `calcReleaseScore` | release-score.ts | `HealthDimensions` |
| `makeDimensionScore` | release-score.ts | `number` |
| `calcQuarantineStatus` | quarantine-status.ts | `FlakyResult[]` |

**Funções não orquestradas (18):** Consumidas diretamente por health-score.ts, metrics.ts, quarantine.ts, etc.

#### 071 — Orchestrators

| Orchestrator | Padrão | Status |
|---|---|---|
| `session-state.ts` | `ensureDataHub()` lazy-init singleton, `getDataHub()` accessor | ✅ |
| `interactive-mode.ts` | `ensureDataHub()` no início da sessão, conditional spread `...(dataHub ? [{ dataHub }] : [])` | ✅ |
| `batch-mode.ts` | `getOrFetchDataHub()` em try/catch, fallback `undefined` | ✅ |
| `schedule-handler.ts` | `getDataHub()` + conditional spread `dataHub ? { dataHub } : undefined` | ✅ |

#### 072 — Fallback MetricsStore

| Consumidor | Padrão de Fallback | Status |
|---|---|---|
| `health-score.ts` | `dataHub?.computed.X ?? valorMetricsStore` | ✅ |
| `quality-gate.ts` | `...(dataHub ? { dataHub } : {})` → health-score sem DataHub | ✅ |
| `pr-report-core.ts` | `tryCreateDataHub()` retorna `undefined` em falha, conditional spread | ✅ |

**Degradation path:** DataHub sempre `DataHub | undefined`. Sem `if (!dataHub)` explícito — optional chaining + nullish coalescing. Limpo.

#### 073 — D5.1: Métricas com nome/descrição/unidade

Definido em `shared/types/data-hub.ts` (interfaces JSDoc) e `shared/data-hub/compute/types.ts` (config com unidades/ranges documentados). ✅

#### 074 — D5.2: Métricas acionáveis

Todas as métricas são acionáveis: passRate, flakyRate, coverage, pipelineCost, suiteSpeedP95, defectTrends, releaseScore. Nenhuma é vaidade. ✅

#### 075 — D5.5: Outliers visuais tratados

Responsabilidade do render layer (HTML generators), não do compute layer. Não aplicável a esta verificação. ✅ N/A

#### 076 — D5.8: Valores saturados [0,100]

**Com clamp explícito (7 funções):**
`calcCoverageFromRaw`, `calcTrendsFromPipelineRuns`, `calcTrendsFromMetricsRuns`, `calcExpWeightedPassRate`, `calcExecutionRate`, `calcExpWeightedExecutionRate`, `calcFlakyPercentage`

**Matematicamente limitadas por construção (23 funções):**
Razões de contadores (numerator ≤ denominator) são intrinsecamente [0,100]. Scoring functions usam `linearScore`/`inverseScore` que retornam [0,100] por construção. ✅

#### 077 — D5.10: Thresholds com referência

30+ referências normativas: DORA State of DevOps, Google SRE Book, Google Test Engineering, Microsoft Research (2014), ISTQB Foundation, ISO/IEC 25010:2011, ISO/IEC 25023:2016, Tukey (1977). ✅

#### 078 — Nenhum HTML generator acessa dados CI brutos

14 generators verificados: `generateHtmlReport`, `generateCoverageHtml`, `buildHtmlPage`, `buildErrorPage`, `generateReleaseScoreHtml`, `generateAiEffectivenessHtml`, `generateIncidentReportHtml`, `generateSeasonalityHtml`, `generateBenchmarkHtml`, `generateImpactAlertHtml`, `generateDeveloperProfileHtml`, `generateRequirementScoreHtml`, `generateCoverageGapHtml`, `generateOptimizationHtml`.

**Nenhum importa PipelineRun/PipelineJob.** Todos aceitam objetos Result pré-calculados. ✅

#### 079 — Padrão Compute → Result → Render preservado

Todos os dashboards em interactive-mode.ts seguem: `_loadProjectRunsHelper()` → compute function → Result type → HTML generator. Intermediate Result types existem para cada pipeline. Nenhum generator chama API diretamente. ✅

**Evidência completa:** `audit/functional/phase6-verification-evidence.md`

**Commit:** `verify: validate DataHub integration across compute, orchestrators, and dashboards`

---

## Pré-Voo — Fase 12

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 12 — Atualização TECHDOC.md (Tarefa 151)

Atualizar `docs/TECHDOC.md` para refletir a nova arquitetura DataHub, substituindo a seção obsoleta "CI Data Hub (`shared/ci-data.ts`)".

### Mudanças obrigatórias

| Seção | Ação | Detalhes |
|-------|------|----------|
| `ARCHITECTURE > Layered Diagram` | Adicionar camada DataHub | Incluir `shared/data-hub/` no diagrama de camadas |
| `ARCHITECTURE > Key Patterns` | Adicionar padrão DataHub | 3 camadas: Providers → Compute → Hub |
| `MODULE MAP > shared/` | Atualizar `ci-data.ts` | Descrever como wrapper deprecated + entry point `getOrFetchDataHub` |
| `MODULE MAP > shared/` | Adicionar módulos DataHub | `data-hub/hub.ts`, `data-hub/cache.ts`, `data-hub/compute/*.ts`, `data-hub/providers/*.ts` |
| `DOMAIN MODEL` | Substituir `CiDataHub` interface | Nova interface `DataHub` com `raw: RawData` + `computed: ComputedMetrics` |
| `DOMAIN MODEL` | Adicionar tipos DataHub | `RawData`, `ComputedMetrics`, `DataHubProvider`, `ScoringConfig`, `QuarantineConfig` |
| `KEY DECISIONS` | Adicionar decisões DataHub | Provider pattern, Compute funções puras, Cache unificado, Fallback MetricsStore |
| `FILES & PATHS REFERENCE` | Adicionar caminhos DataHub | `shared/data-hub/`, `shared/types/data-hub.ts` |

### Seções a NÃO alterar

- CLI REFERENCE (não muda)
- CONFIG & ENV (não muda)
- TESTING CONVENTIONS (não muda)
- FEATURE WORKFLOW PATTERN (não muda)

### Script de verificação

```bash
# Verificar que TECHDOC.md foi atualizado
grep -c "DataHub" docs/TECHDOC.md  # deve ser > 0
grep -c "CiDataHub" docs/TECHDOC.md  # deve ser 0 (seção removida)
grep -c "compute/" docs/TECHDOC.md  # deve ser > 0 (módulos documentados)
```

**Commit:** `docs: update TECHDOC with DataHub 3-layer architecture`

---

---

## Pré-Voo — Fase 13

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

### Questões de Design

| Questão | Solução |
|---------|---------|
| Rate limits (GitHub 5000/h, GitLab varies) | Throttling por provider, backoff exponencial, máximo 1 fetch por repo por 5 min |
| Persistência | Usar cache existente (`cache.ts`) com TTL estendido (15 min em vez de 5 min) |
| Repositório inacessível | Log warning, fallback para cache existente ou dados zerados |
| Sincronização on-demand vs async | Async enriquece cache; on-demand usa cache se fresco, busca se stale |
| Múltiplos repositórios | Filo por repo, máximo 3 concurrent fetches |

---

## Fase 13 — Coleta Assíncrona de Dados Brutos (Tarefas 160-165)

> **Proposta (2026-07-04):** Coletar dados brutos assincronamente toda vez que o sistema é iniciado e está associado a um repositório/versãoador.
>
> **Estado atual:** Dados brutos são coletados apenas on-demand (ao disparar CI). O DataHub busca via providers sob demanda.
>
> **Motivação:** Dashboard imediato ao abrir o sistema, métricas históricas mais completas, dados sempre atualizados mesmo sem novo CI.

### 160 — Configuração de Coleta Assíncrona

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/compute/types.ts` (adicionar tipos) + `shared/data-hub/async-collector.ts` (NOVO) |
| **Tipos**          | `AsyncCollectionConfig { intervalMs, maxConcurrent, staleTtlMs }` + `CollectionStatus { repo, lastCollected, error? }` |
| **Config default** | `{ intervalMs: 300_000 (5min), maxConcurrent: 3, staleTtlMs: 900_000 (15min) }`             |
| **Critério**       | `tsc --noEmit` passa                                                                        |

### 161 — AsyncCollector Class

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/async-collector.ts` (NOVO)                                                 |
| **Classe**         | `AsyncCollector` — gerencia ciclo de vida da coleta assíncrona                              |
| **Métodos**        | `start(repos)`, `stop()`, `collectNow(repo)`, `getStatus()`                                |
| **Lógica**         | Intervalo periódico → para cada repo → seleciona provider → busca dados → atualiza cache    |
| **Throttling**     | `lastFetch` por repo, mínimo 5 min entre fetches                                           |
| **Error handling** | Try/catch por repo, log warning, não interrompe ciclo                                       |
| **Teste unitário** | `__tests__/async-collector.test.ts` — 6 cenários                                           |
| **PBT**            | `__tests__/async-collector.property.test.ts` — status sempre válido                         |
| **Critério**       | `npx vitest run shared/data-hub/__tests__/async-collector` = 100% pass                      |

### 162 — Integração com Session State

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/session-state.ts`                                                             |
| **Ação**           | Criar/gerenciar instância `AsyncCollector` por sessão. `ensureDataHub()` continua lazy-init, mas async collector enriquece cache em background |
| **Lifecycle**      | `startSession()` → `collector.start(repos)` / `endSession()` → `collector.stop()`           |
| **Teste**          | Atualizar `__tests__/system/ci-data-system.test.ts`                                         |
| **Critério**       | Todos os testes existentes continuam passando                                               |

### 163 — Integração com Entry Points

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivos**       | `git_triggers/interactive-mode.ts`, `git_triggers/batch-mode.ts`, `git_triggers/schedule-handler.ts` |
| **Ação**           | Iniciar collector no início da sessão. Dashboard mostra dados imediatamente do cache (mesmo que stale) enquanto background fetch atualiza |
| **Teste**          | Atualizar `__tests__/e2e/ci-data-e2e.test.ts`                                               |
| **Critério**       | Todos os testes existentes continuam passando                                               |

### 164 — Barrel + Tipos Públicos

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivos**       | `shared/data-hub/index.ts`, `shared/types/data-hub.ts`                                     |
| **Ação**           | Exportar `AsyncCollector`, `AsyncCollectionConfig`, `CollectionStatus`                       |
| **Critério**       | `tsc --noEmit` passa                                                                        |

### 165 — Suite de Integração

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/data-hub/__tests__/integration/async-collection.integration.test.ts`                |
| **Testes**         | Mock provider → start collector → verify cache populated → stop collector                    |
| **Critério**       | Suite inteira passa                                                                         |

**Checkpoint Fase 13:** `npx vitest run shared/data-hub/` = 100%. AsyncCollector funcional. Cache enriquecido em background.
**Commit:** `feat(data-hub): add async background data collection with throttling and session lifecycle`

---

## Pré-Voo — Fase 7

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 7 — Corrigir Testes Teatro (Tarefas 090-093)

> **CONCLUÍDA (2026-07-05):** 6 testes teatro invertidos. 2 bugs de produção encontrados e corrigidos. Refatoração de `computeActualMetrics` para reduzir complexidade cognitiva.

### Bugs de Produção Encontrados

| Bug | Arquivo:Linha | Impacto | Fix |
|---|---|---|---|
| `healthScore` calculado sem DataHub | `pr-report-core.ts:458` | PR report sempre retornava health score do MetricsStore, ignorando dados CI | Movido `dataHub` extração antes de `calculateHealthScore`, merged into `healthConfig` |
| Empty DataHub sobrescrevia MetricsStore | `health-score.ts:200` | DataHub com 0 runs (`passRate=0`) mascarava dados reais devido ao operador `??` | Adicionado guard `hasCiRuns = dataHub.raw.runs.length > 0` |

### Testes Teatro Invertidos

| Teste | Antes | Depois |
|---|---|---|
| `health-score.integration.test.ts:273` | `expect(overall).toBeGreaterThanOrEqual(0)` | `expect(withHub.passRate.score).not.toBe(withoutHub.passRate.score)` |
| `quality-gate.integration.test.ts:167` | `expect(overall).toBe('fail')` | `expect(withHub.score).not.toBe(withoutHub.score)` |
| `ci-data-system.test.ts:114` | `expect(overall).toBeGreaterThanOrEqual(0)` | `expect(withHub.passRate.score).not.toBe(withoutHub.passRate.score)` |
| `ci-data-system.test.ts:221` | `expect(overall).toBeGreaterThanOrEqual(0)` | `expect(withEmptyHub.overall).toBe(withoutHub.overall)` |
| `pr-report-core.integration.test.ts:533` | `expect(overall).toBeGreaterThanOrEqual(0)` | `expect(withHub.passRate.score).not.toBe(withoutHub.passRate.score)` |
| `pr-report-core.integration.test.ts:556` | `expect(healthScore).toBeDefined()` | `expect(withHub.passRate.score).not.toBe(withoutHub.passRate.score)` |

### Refatoração `computeActualMetrics`

Correção do bug em `health-score.ts` exigiu refatoração para reduzir complexidade cognitiva (18→15). Funções helper extraídas:

- `_resolveCoverage` — resolution de cobertura (override > history > 0)
- `_normalizeFlakyPct` — normalização de flaky percentage
- `_resolvePassRate` — resolução de passRate (DataHub > MetricsStore > 0)
- `_resolveSuiteSpeed` — resolução de suiteSpeed (DataHub > MetricsStore > 0)
- `_computeFlakyFromCi` — cálculo de flaky rate a partir do DataHub

### Helpers `makeDataHub` Padronizados

Helpers de teste em 4 arquivos atualizados para incluir `raw.runs` realistas (consistente com `computed.passRate`). Antes: `raw.runs: []` com `computed.passRate: 85` — semanticamente inconsistente.

**Commit:** `test: invert theater tests and fix DataHub integration bugs` (`178d25d7`)

**Evidência:** Verificação completa: 420 files, 6086 tests, 0 failures, 0 lint violations, 0 tsc errors.

---

## Pré-Voo — Fase 8

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 8 — Sanitização (Tarefas 100-106)

> **Em execução (2026-07-05):** Remoção de código morto e migração de testes. Nenhum código deprecado/deferido/supersedido será mantido — portanto nenhuma documentação de justificativa é necessária.

### 100 — Remover `ensureCiDataHub` de `session-state.ts`

Remover função deprecated (lines 70-80) + import de `dataHubToCiDataHub`. Zero chamadores em produção.

**Arquivos:** `git_triggers/session-state.ts`

### 101 — Remover `adapter.ts` e barrel export

Remover `shared/data-hub/adapter.ts` inteiro + re-export de `dataHubToCiDataHub`/`ciDataHubToDataHub` em `shared/data-hub/index.ts`.

**Arquivos:** `shared/data-hub/adapter.ts`, `shared/data-hub/index.ts`

### 102 — Remover `createCiDataHub` de `ci-data.ts`

Remover função (lines ~184-232). Zero chamadores em produção. Migrar todos os testes que dependem dela para criar `DataHub` diretamente via `DataHubImpl.create` ou mock direto.

**Arquivos:** `shared/ci-data.ts`
**Testes:** `ci-data.test.ts`, `ci-data-system.test.ts`, `ci-data-e2e.test.ts`, `ci-data-e2e-live.test.ts`, `ci-data.integration.test.ts`

### 103 — Remover 16 compute functions legadas (MetricsRun API)

Remover funções que testam API `MetricsRun` legada (não consumida em produção):

| Função | Arquivo | Remover |
|---|---|---|
| `calcPipelineFailRate` | `pass-rate.ts` | ✅ |
| `calcTestPassRate` | `pass-rate.ts` | ✅ |
| `calcExpWeightedPassRate` | `pass-rate.ts` | ✅ |
| `calcExecutionRate` | `pass-rate.ts` | ✅ |
| `calcExpWeightedExecutionRate` | `pass-rate.ts` | ✅ |
| `calcTestSuiteSpeed` | `suite-speed.ts` | ✅ |
| `calcFlakyFromMetricsRuns` | `flaky-rate.ts` | ✅ |
| `calcFlakyPercentage` | `flaky-rate.ts` | ✅ |
| `calcTrendsFromPipelineRuns` | `trends.ts` | ✅ |
| `calcTrendsFromMetricsRuns` | `trends.ts` | ✅ |
| `calcDefectTrends` | `defect-trends.ts` | ✅ |
| `scorePassRate` | `scoring.ts` | ✅ |
| `scoreFlakyRate` | `scoring.ts` | ✅ |
| `scoreCoverage` | `scoring.ts` | ✅ |
| `scoreExecutionRate` | `scoring.ts` | ✅ |
| `scoreSuiteSpeed` | `scoring.ts` | ✅ |

**Manter:** `calcPipelinePassRate`, `calcAvgDuration`, `calcSuiteSpeedP95`, `calcFlakyFromPipelineRuns`, `calcTopFailureReasons`, `calcBranchBreakdown`, `calcTopFailingJobs`, `calcCoverageFromRaw`, `calcPipelineCost`, `calcReleaseScore`, `calcQuarantineStatus`, `makeDimensionScore`, `computeGrade`, `extractFailureReasons` (todas com consumidores em produção).

**Barrel:** Atualizar `compute/index.ts` para remover exports das 16 funções.

### 104 — Migrar invariantes PBT para funções produtivas

Migrar propriedades matemáticas testadas pelas 16 funções legadas para testar as funções equivalentes que existem na produção. Se uma invariante não tem equivalente produtivo, remover (a invariante é dead code).

**Arquivos de teste:** `pass-rate.property.test.ts`, `scoring.property.test.ts`, `flaky-rate.property.test.ts`, `trends.property.test.ts`, `defect-trends.property.test.ts`, `suite-speed.property.test.ts`

### 105 — Remover testes de código morto

Remover testes que testam funções removidas:

| Arquivo | Ação |
|---|---|
| `adapter.test.ts` | Remover inteiro |
| `ci-data.test.ts` | Reescrever (remover testes de `createCiDataHub`, manter testes de `getOrFetchDataHub`) |
| `compute/pass-rate.test.ts` | Remover testes das 5 funções removidas |
| `compute/suite-speed.test.ts` | Remover testes de `calcTestSuiteSpeed` |
| `compute/flaky-rate.test.ts` | Remover testes de `calcFlakyFromMetricsRuns` e `calcFlakyPercentage` |
| `compute/trends.test.ts` | Remover testes de `calcTrendsFromPipelineRuns` e `calcTrendsFromMetricsRuns` |
| `compute/defect-trends.test.ts` | Remover inteiro (todas as funções testadas foram removidas) |
| `compute/scoring.test.ts` | Remover testes das 5 scoring functions removidas |

### 106 — Verificação final

| Verificação | Critério |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 violações |
| `npx vitest run` | Todos os testes passam |
| `grep -r "createCiDataHub" shared/` | 0 resultados em código de produção |
| `grep -r "ciDataHubToDataHub" shared/` | 0 resultados em código de produção |
| `grep -r "ensureCiDataHub" git_triggers/` | 0 resultados |
| `grep -r "dataHubToCiDataHub" shared/` | 0 resultados em código de produção |

**Commit:** `refactor: remove dead code, migrate tests and PBT invariants to production API`

---

## Pré-Voo — Fase 8.5

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |
| `unbound-method`        | Factory mock separado       |
| `cognitive-complexity`  | Extrair métodos auxiliares  |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 8.5 — Fechamento de Gaps (Tarefas 085.1–085.7)

> **Investigação (2026-07-05):** Auditoria identificou 6 gaps/riscos na implementação existente. Esta fase os corrige antes de prosseguir.

### 085.1 — Remover interface `CiDataHub` (dead code)

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/ci-data.ts`                                                                         |
| **Bug**            | Interface `CiDataHub` (linhas 25-78) exportada mas com **zero consumidores** em produção     |
| **Impacto**        | Código morto, manutenção desnecessária, risco de confusão                                   |
| **Ação**           | Remover interface + export. Verificar que `npx tsc --noEmit` passa                           |
| **Risco**          | ZERO — nenhum arquivo importa `CiDataHub`                                                   |
| **Critério**       | `grep -r "CiDataHub" shared/ --include="*.ts"` retorna 0 resultados em código de produção   |

### 085.2 — Corrigir `tryCreateDataHub` para suportar GitLab

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/pr-report-core.ts` (linhas 667-687)                                                 |
| **Bug**            | `tryCreateDataHub` hardcoded para GitHub — sempre instancia `GitHubManager`, requer `GITHUB_TOKEN` |
| **Gap**            | Fase 5.5 habilitou GitLab via `getOrFetchDataHub`, mas `tryCreateDataHub` nunca o acessa     |
| **Ação**           | Refatorar para detectar GitLab CI (`CI_JOB_TOKEN` + `CI_PROJECT_ID`) e instanciar `GitLabManager` |
| **Dependência**    | `getOrFetchDataHub` em `ci-data.ts` já suporta ambos providers — `tryCreateDataHub` só precisa criar o `GitProvider` correto |
| **Teste**          | Adicionar cenário GitLab em `__tests__/integration/pr-report-core.integration.test.ts`       |
| **Critério**       | `npx vitest run shared/__tests__/integration/pr-report-core` = 100% pass                     |

### 085.3 — Corrigir `.gitignore`

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `.gitignore`                                                                                |
| **Gaps**           | 1) `shared/.local/` não gitignored — `state.json` é artifact de runtime trackeado           |
|                    | 2) Pattern `:Zone.Identifier` (linha 48) é literal — não matchea `foo.zip:Zone.Identifier`   |
|                    | 3) `*.csv:Zone.Identifier` (linha 36) é redundante com pattern genérico                     |
| **Ação**           | Adicionar `shared/.local/` + substituir `:Zone.Identifier` por `*:Zone.Identifier` + remover linha `*.csv:Zone.Identifier` |
| **Ação adicional** | Remover `shared/.local/state/qa-tools/state.json` do índice git (`git rm --cached`)          |
| **Risco**          | BAIXO — apenas limpeza de config                                                            |
| **Critério**       | `git status` não mostra mais `state.json` nem `Zone.Identifier`                             |

### 085.4 — Renomear `_showCiDataHubSummary` → `_showDataHubSummary`

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/interactive-mode.ts` (definição: linha 636, chamada: linha 742)                |
| **Gap**            | Nome contém "CiDataHub" mas implementação usa `DataHub`                                     |
| **Ação**           | Renomear função e todas as referências                                                       |
| **Teste**          | Verificar que `interactive-mode.test.ts` passa                                              |
| **Critério**       | `grep "_showCiDataHubSummary" git_triggers/` = 0 resultados                                |

### 085.5 — Atualizar comentários de teste

| Item               | Conteúdo                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Arquivos**       | 5 arquivos de teste integração                                                              |
| **Gap**            | Comentários e describe blocks ainda mencionam "CiDataHub"                                   |
| **Ação**           | Substituir "CiDataHub" por "DataHub" nos comentários                                        |

| Arquivo | Linhas |
|---------|--------|
| `shared/__tests__/integration/ci-menu.integration.test.ts` | 2, 7, 70 |
| `shared/__tests__/integration/health-score.integration.test.ts` | 11 |
| `shared/__tests__/integration/quality-gate.integration.test.ts` | 10 |
| `shared/__tests__/integration/traceability-matrix.integration.test.ts` | 7 |
| `shared/__tests__/integration/pipeline-cost.integration.test.ts` | 9 |

| **Critério** | `grep -r "CiDataHub" shared/__tests__/` = 0 resultados |

### 085.6 — Verificação final

| Verificação | Critério |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 violações |
| `npx vitest run shared/data-hub/` | 100% pass |
| `grep -r "CiDataHub" shared/ --include="*.ts"` | 0 resultados em código de produção |
| `grep "_showCiDataHubSummary" git_triggers/` | 0 resultados |

**Commit:** `fix(data-hub): remove dead CiDataHub interface, add GitLab support to PR report, fix gitignore`

---

## Pré-Voo — Fase 9

### ESLint Rules (erros, não warnings)

| Regra                   | Ação                        |
| ----------------------- | --------------------------- |
| `no-non-null-assertion` | Extrair variável, usar `?.` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 9 — Testes Atualizados (Tarefas 120-125)

**Commit:** `test: update all mocks and imports for new compute layer`

---

## Pré-Voo — Fase 10

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 10 — Documentação (Tarefas 130-132)

**Commit:** `docs: update TECHDOC, BACKLOG, and INTEGRATED-PLAN for DataHub`

---

## Pré-Voo — Fase 11

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 11 — Auditoria Final (Tarefas 140-150)

**Commit:** `chore: final audit — coverage thresholds, circular deps, unused exports verified`

| ID  | Verificação                    | Critério                                                       |
| --- | ------------------------------ | -------------------------------------------------------------- |
| 140 | `npx tsc --noEmit`             | 0 erros                                                        |
| 141 | `npx vitest run`               | 100% pass                                                      |
| 142 | `npm run lint`                 | 0 violações                                                    |
| 143 | `npx vitest run --coverage`    | Lines ≥ 90%, Functions ≥ 91%, Branches ≥ 80%, Statements ≥ 90% |
| 144 | `npm run unused-exports`       | 0                                                              |
| 145 | `npx madge --circular shared/` | 0                                                              |
| 146 | Auditoria integridade          | 30/30 compute functions verificadas + 4 orchestrators + fallback |
| 147 | Auditoria descentralização     | 0 cálculos inline duplicados                                   |
| 148 | Auditoria testes               | 0 testes teatro                                                |
| 149 | Push + CI                      | CI passa                                                       |

---

## Dependências

```
Fase 0    (001-005)    ← sem dependências                           ✅ CONCLUÍDA
Fase 1    (010-022)    ← depende de Fase 0                          ✅ CONCLUÍDA
Fase 2    (030-037)    ← depende de Fase 0 (paralela com Fase 1)    ✅ CONCLUÍDA
Fase 3    (040-046)    ← depende de Fase 1 + Fase 2                 ✅ CONCLUÍDA
Fase 4    (050-054)    ← depende de Fase 3                          ✅ CONCLUÍDA
Fase 5    (060-063)    ← CONCLUÍDA (absorvida pela Fase 4)          ✅ CONCLUÍDA
Fase 5.5  (080-086)    ← depende de Fase 5 (consolidação de gaps)   ✅ CONCLUÍDA
Fase 6    (070-079)    ← CONCLUÍDA (verificação de integridade)     ✅ CONCLUÍDA
Fase 7    (090-093)    ← depende de Fase 6                          ✅ CONCLUÍDA
Fase 8    (100-106)    ← depende de Fase 6                          ✅ CONCLUÍDA
Fase 8.5  (085.1-085.7)← depende de Fase 8 (fechamento de gaps)    ← PRÓXIMA
Fase 9    (120-125)    ← depende de Fase 8.5
Fase 10   (130-132)    ← depende de Fase 9
Fase 11   (140-150)    ← depende de Fase 10
Fase 12   (151)        ← depende de Fase 11 (atualização TECHDOC.md)
Fase 13   (160-165)    ← depende de Fase 8.5 (paralela com 9-12)
```

---

## Estimativa

| Fase      | Tarefas | Sprints         |
| --------- | ------- | --------------- |
| 0         | 5       | 0.5             |
| 1         | 13      | 2               |
| 2         | 8       | 1.5             |
| 3         | 7       | 1.5             |
| 4         | 5       | 1.5             |
| 5         | 1       | 0.5             |
| 5.5       | 7       | 2               |
| 6         | 10      | 0.5 (verificação) |
| 7         | 4       | 1               |
| 8         | 7       | 1               |
| 8.5       | 7       | 1               |
| 9         | 6       | 1               |
| 10        | 3       | 0.5             |
| 11        | 11      | 1               |
| 12        | 1       | 0.5             |
| 13        | 6       | 1.5             |
| **Total** | **101** | **~17.5 sprints** |

---

## Decisões Registradas

| Decisão           | Escolha                            | Justificativa                                                                             |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Sem @deprecated   | Código morto removido              | Flags são erros no lint                                                                   |
| Organização       | Subdiretórios `data-hub/`          | Separação clara                                                                           |
| Provider pattern  | Classes (Adapter)                  | Consistente com GitHubManager/GitLabManager                                               |
| Compute pattern   | Funções puras                      | Testabilidade máxima                                                                      |
| Cache             | Module-level vars                  | Consistente com \_cachedHub                                                               |
| Compatibilidade   | Wrapper thin em ci-data.ts         | Quebra zero                                                                               |
| Jira/Xray         | Incluir agora                      | Custo marginal                                                                            |
| Fallback local    | Preservar MetricsStore             | Local/dev sem CI                                                                          |
| GitLab            | Incluir desde Fase 2               | Mesmo suporte que GitHub                                                                  |
| getJobLogs        | Adicionar à interface GitProvider  | Corrige bug de failure reasons                                                            |
| PBT               | Obrigatório por compute function   | Invariantes documentadas                                                                  |
| Integration suite | Ao final de cada fase              | Valida fluxo completo                                                                     |
| Parâmetro Fase 4  | Renomear `ciData` → `dataHub`      | Correspondência nome-tipo, zero ambiguidade                                               |
| Fase 6 redefinida | Verificação, não migração          | 18 HTML generators são agnósticos a fonte de dados. Adicionar `dataHub?` violaria SRP/DIP |
| Fase 5 absorvida  | Tasks 060/062/063 feitas na Fase 4 | Entry points migrados como efeito colateral                                               |
| Coleta assíncrona | Pendência futura                   | Avaliar coleta de dados brutos na inicialização do sistema                                |
| countUniqueJobs   | Corrigido na Fase 5.5              | Bug causava flaky % inflado → releaseScore corrompido                                     |
| Cache             | Unificado na Fase 5.5              | 3 caches separados → 1 fonte de verdade                                                   |
| GitLab via DataHub| Habilitado na Fase 5.5             | Provider existente mas nunca instanciado                                                   |
| Round-trip lossy  | Eliminado na Fase 5.5              | DataHub→CiDataHub→DataHub zerava coverage, pipelineCost, etc.                              |
| Theater tests     | Expuseram 2 bugs de produção       | Testes passivos codificavam bugs como features (Rule 19.4)                                |
| Empty DataHub guard| `raw.runs.length > 0`             | DataHub com 0 runs (`passRate=0`) sobrescrevia MetricsStore devido ao `??`                 |
| computeActualMetrics | Extraído em 5 helpers           | Reduziu complexidade cognitiva 18→15, eliminou nested ternaries                          |
| makeDataHub padronizado | `raw.runs` realistas         | Helpers de teste agora incluem runs consistentes com `computed.passRate`                  |
| CiDataHub interface    | Removida na Fase 8.5        | Zero consumidores — dead code desde migração Fase 4                                      |
| tryCreateDataHub GitLab | Corrigido na Fase 8.5       | Hardcoded para GitHub, GitLab via DataHub nunca acessado                                |
| .gitignore gaps        | Corrigido na Fase 8.5       | state.json trackeado, Zone.Identifier pattern quebrado                                   |
| _showCiDataHubSummary  | Renomeado na Fase 8.5       | Nome legado, implementação já usava DataHub                                              |
| Coleta assíncrona      | Implementada na Fase 13     | Dashboard imediato, cache enriquecido em background, throttling por repo                 |

---

## Arquivos Afetados

### NOVOS (28+):

`shared/data-hub/index.ts`, `shared/data-hub/hub.ts`, `shared/data-hub/cache.ts`,
`shared/data-hub/providers/types.ts`, `shared/data-hub/providers/github-provider.ts`,
`shared/data-hub/providers/gitlab-provider.ts`, `shared/data-hub/providers/jira-provider.ts`,
`shared/data-hub/providers/coverage-provider.ts`, `shared/data-hub/providers/composite-provider.ts`,
`shared/data-hub/compute/index.ts`, `shared/data-hub/compute/types.ts`,
`shared/data-hub/compute/pass-rate.ts`, `shared/data-hub/compute/avg-duration.ts`,
`shared/data-hub/compute/suite-speed.ts`, `shared/data-hub/compute/flaky-rate.ts`,
`shared/data-hub/compute/pipeline-cost.ts`, `shared/data-hub/compute/defect-trends.ts`,
`shared/data-hub/compute/branch-health.ts`, `shared/data-hub/compute/failure-reasons.ts`,
`shared/data-hub/compute/coverage.ts`, `shared/data-hub/compute/trends.ts`,
`shared/data-hub/compute/scoring.ts`, `shared/data-hub/compute/release-score.ts`,
`shared/data-hub/compute/quarantine-status.ts`, `shared/types/data-hub.ts`,

- 20+ arquivos de teste

### PRODUÇÃO REFRATORADOS (20+):

`shared/ci-data.ts`, `shared/health-score.ts`, `shared/quality-gate.ts`,
`shared/pr-report-core.ts`, `shared/pipeline-cost.ts`, `shared/traceability-matrix.ts`,
`shared/metrics.ts`, `shared/git-artifact-downloader.ts`, `shared/run-comparison.ts`,
`shared/report-html.ts`, `shared/types/ci-cd.ts`, `shared/types.ts`,
`git_triggers/interactive-mode.ts`, `git_triggers/schedule-handler.ts`,
`git_triggers/batch-mode.ts`, `git_triggers/session-state.ts`,
`git_triggers/gitlab-workflow.ts`,
`jira_management/commands/case17.ts`, `jira_management/commands/case26.ts`

### TESTES ATUALIZADOS (35+):

Todos os arquivos de teste dos consumers refatorados + 4 arquivos de theater tests invertidos.
