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
| `as unknown as`  | Hook rejeita |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 6 — Verificação de Integridade (Tarefas 070-079)

### 070-079 — Verificar integridade da integração DataHub

> **DESCOBERTA (2026-07-04):** Análise das 18 funções geradoras de HTML demonstrou que **nenhuma** acessa dados CI brutos. Todas recebem objetos de resultado pré-calculados. O padrão arquitetural `Compute → Result → Render` já está preservado. Adicionar `dataHub?` a funções de renderização violaria SRP e DIP. Fase 6 é portanto uma verificação de integridade, não uma migração de parâmetros.

| ID  | Verificação                                                | Critério                                                      |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| 070 | Todos os compute functions aceitam `DataHub`               | 21/21 funções verificadas                                     |
| 071 | Orchestrators passam `DataHub` corretamente                | schedule-handler, interactive-mode, batch-mode, session-state |
| 072 | Fallback MetricsStore funciona quando DataHub indisponível | Teste de integridade                                          |
| 073 | D5.1: Métricas com nome/descrição/unidade claros           | Auditoria visual                                              |
| 074 | D5.2: Métricas acionáveis (não vaidade)                    | Auditoria visual                                              |
| 075 | D5.5: Outliers visuais tratados                            | Auditoria visual                                              |
| 076 | D5.8: Valores saturados [0,100]                            | Verificação automática                                        |
| 077 | D5.10: Thresholds com referência                           | Verificação visual                                            |
| 078 | Nenhum HTML generator acessa dados CI brutos               | Auditoria de código                                           |
| 079 | Padrão Compute → Result → Render preservado                | Auditoria arquitetural                                        |

**D5 Obrigatório:** Dashboards são a interface primária de métricas. Verificar:

- D5.1: Cada métrica exibida tem nome, descrição e unidade claros
- D5.2: Métricas exibidas são acionáveis (não vaidade)
- D5.5: Outliers visuais tratados (ex: zoom, filtro)
- D5.8: Valores saturados [0,100] quando aplicável
- D5.10: Thresholds/grades exibidos com referência

**Commit:** `verify: validate DataHub integration across compute, orchestrators, and dashboards`

---

## Pendência Futura — Coleta Assíncrona de Dados Brutos

> **PROPOSTA (2026-07-04):** Avaliar melhoria na coleta de dados brutos para DataHub.
>
> **Estado atual:** Dados brutos são coletados apenas quando se dispara CI (on-demand via providers).
>
> **Proposta:** Coletar dados assincronamente toda vez que o sistema é iniciado e está associado a um repositório ou versionador/gerenciador.
>
> **Vantagens potenciais:**
>
> - Dados sempre atualizados mesmo sem novo CI
> - Métricas históricas mais completas
> - Dashboard imediato ao abrir o sistema
>
> **Questões a avaliar:**
>
> - Impacto em APIs do GitHub/GitLab (rate limits)
> - Cache e persistência dos dados coletados
> - Comportamento quando repositório não está acessível
> - Sincronização entre coleta assíncrona e uso on-demand
>
> **Status:** DISCUTIR POSTERIORMENTE — não bloqueia Fases 6-11.

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
| `as unknown as`  | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 7 — Corrigir Testes Teatro (Tarefas 090-093)

**Commit:** `test: invert theater tests to verify DataHub actually changes behavior`

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
| `as unknown as`  | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 8 — Sanitização (Tarefas 100-106)

Código morto removido. Código vivo documentado.

**Commit:** `refactor: remove dead code and inline calculations, document live code`

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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| `as unknown as`  | ✅        |
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
| 146 | Auditoria integridade          | 21/21 consumers aceitam DataHub + fallback                     |
| 147 | Auditoria descentralização     | 0 cálculos inline duplicados                                   |
| 148 | Auditoria testes               | 0 testes teatro                                                |
| 149 | Push + CI                      | CI passa                                                       |

---

## Dependências

```
Fase 0 (001-005)    ← sem dependências
Fase 1 (010-022)    ← depende de Fase 0
Fase 2 (030-037)    ← depende de Fase 0 (paralela com Fase 1)
Fase 3 (040-046)    ← depende de Fase 1 (incluindo 010a/010b) + Fase 2
Fase 4 (050-054)    ← depende de Fase 3
Fase 5 (060-063)    ← CONCLUÍDA (absorvida pela Fase 4)
Fase 6 (070-079)    ← depende de Fase 4 + Fase 5 (verificação de integridade)
Fase 7 (090-093)    ← depende de Fase 6
Fase 8 (100-106)    ← depende de Fase 6
Fase 9 (120-125)    ← depende de Fase 8
Fase 10 (130-132)   ← depende de Fase 9
Fase 11 (140-150)   ← depende de Fase 10
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
| 6         | 10      | 1               |
| 7         | 4       | 1               |
| 8         | 7       | 1               |
| 9         | 6       | 1               |
| 10        | 3       | 0.5             |
| 11        | 11      | 1               |
| **Total** | **80**  | **~13 sprints** |

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

### PRODUÇÃO REFRATORADOS (19+):

`shared/ci-data.ts`, `shared/health-score.ts`, `shared/quality-gate.ts`,
`shared/pr-report-core.ts`, `shared/pipeline-cost.ts`, `shared/traceability-matrix.ts`,
`shared/metrics.ts`, `shared/git-artifact-downloader.ts`, `shared/run-comparison.ts`,
`shared/report-html.ts`, `shared/types/ci-cd.ts`, `shared/types.ts`,
`git_triggers/interactive-mode.ts`, `git_triggers/schedule-handler.ts`,
`git_triggers/batch-mode.ts`, `git_triggers/session-state.ts`,
`git_triggers/gitlab-workflow.ts`,
`jira_management/commands/case17.ts`, `jira_management/commands/case26.ts`

### TESTES ATUALIZADOS (30+):

Todos os arquivos de teste dos consumers refatorados.
