# TASK: Fase 22 — Consumer Migration (SSOT)

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED). Este é o documento de verdade para a migração de consumidores (Fases 1,3,4,5,6,7,8,9,10).
> **STATUS: 📋 ESPECIFICAÇÃO DE REFERÊNCIA.** Re-auditoria (TASK-22-corrections.md §3, 2026-07-12) confirmou que **Fases 1–7 (caminhos de leitura SSOT) e Fase 8 (deleção de fontes alternativas, commit `d49c6ac0`) já estão CONCLUÍDAS em código**; Fase 9 (consumidores silenciosos) concluída via FASE 8/C; Fase 10.1 (regra ESLint SSOT em `eslint.config.mjs:212`) presente. O trabalho **genuinamente pendente** deste doc (Capítulo 11: C.1–C.4, E.1–E.3, F.1–F.8) está delegado aos docs de tarefa dedicados (TASK-22-corrections WS2/WS3, TASK-7layer-foundation, TASK-7layer-reporter). Nenhuma tarefa executável livre resta neste doc isoladamente.

## FASE 1 — health-score.ts + quality-gate.ts SSOT + Dimension 5 Compliance (13 tarefas)

> **Atualizado:** 2026-07-10 — Expandido para incluir correção de TODOS os 28 gaps parciais da Dimensão 5.
> **Razão:** Auditoria Dimension 5 revelou 28 inconformidades parciais em 15 arquivos. Todas devem ser endereçadas.

#### Pré-requisitos verificados (2026-07-10)

- Fase 0.8 completa (interface expandida, factory, persistência obrigatória, consumidores migrados)
- NaN guards implementados em health-score.ts
- `runsEmpty` respeita DataHub
- `setDataHub()` chamado corretamente em pr-report-core.ts e batch-mode.ts
- VITEST guards em createCheckRun/getCheckRuns

#### Auditoria Dimension 5 — Resumo dos Gaps

| #   | Arquivo                    | Gap                                                                                         | Dimensão  | Severidade |
| --- | -------------------------- | ------------------------------------------------------------------------------------------- | --------- | ---------- |
| 1   | `quality-gate.ts`          | `_resolveFlakyPct` recalcula localmente em vez de usar `dataHub.computed.flakyPercentage`   | SSOT      | CRÍTICO    |
| 2   | `quality-gate.ts`          | `_suiteSpeedCheck` recalcula P95 localmente em vez de usar `dataHub.computed.suiteSpeedP95` | SSOT      | CRÍTICO    |
| 3   | `quality-gate.ts`          | `hub.loadMetricsStore()` carrega store bruto desnecessariamente                             | SSOT      | CRÍTICO    |
| 4   | `release-score.ts`         | Pesos (TASKS_W=0.25, HEALTH_W=0.3, COVERAGE_W=0.25, FLAKINESS_W=0.2) sem justificativa      | 5c.2      | Médio      |
| 5   | `release-score.ts`         | THRESHOLD=70 sem base documentada                                                           | 5c.6      | Médio      |
| 6   | `release-score.ts`         | Sem referências normativas                                                                  | 5d.1      | Médio      |
| 7   | `release-score.ts`         | Sem documentação de proveniência                                                            | 5e.1/5e.2 | Médio      |
| 8   | `requirement-score.ts`     | Pesos (0.5, 0.3, 0.2) sem justificativa                                                     | 5c.2      | Médio      |
| 9   | `requirement-score.ts`     | Thresholds de grade (90, 75, 60, 40) sem documentação                                       | 5c.6      | Médio      |
| 10  | `requirement-score.ts`     | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 11  | `backlog-health.ts`        | Pesos (35, 30, 35) sem justificativa                                                        | 5c.2      | Médio      |
| 12  | `backlog-health.ts`        | Thresholds (80, 50) sem documentação                                                        | 5c.6      | Médio      |
| 13  | `backlog-health.ts`        | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 14  | `silent-regression.ts`     | Thresholds de z-score (1, 2, 3, 5) sem base estatística documentada                         | 5c.6      | Médio      |
| 15  | `silent-regression.ts`     | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 16  | `quality-metrics.ts`       | Threshold 2-sigma para drift detection sem referência                                       | 5d.1      | Baixo      |
| 17  | `cross-squad-benchmark.ts` | Sem referência normativa                                                                    | 5d.1      | Baixo      |
| 18  | `impact-alert.ts`          | Thresholds (70, 80) sem referência normativa                                                | 5d.1      | Baixo      |
| 19  | `health-score.ts`          | Sem trilha de auditoria de versão de cálculo                                                | 5e.3      | Baixo      |
| 20  | `health-score.ts`          | Sem testes de comparação com ferramentas externas                                           | 5f.3      | Baixo      |
| 21  | `health-score.ts`          | Sem tratamento explícito de outliers para coverage                                          | 5b.4      | Baixo      |
| 22  | `quality-gate.ts`          | Sem detecção de stale data                                                                  | 5e.4      | Baixo      |

#### Callers que NÃO passam DataHub (obrigatório migrar)

| Arquivo                              | Linha           | Chamada                            | Status            |
| ------------------------------------ | --------------- | ---------------------------------- | ----------------- |
| `jira_management/main.ts`            | 344             | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `jira_management/commands/case26.ts` | 23              | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `jira_management/commands/case19.ts` | 70              | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `git_triggers/interactive-mode.ts`   | 374,441,491,533 | `calculateHealthScore(store, ...)` | ALGUNS NÃO passam |
| `shared/cli_base.ts`                 | 221             | `calculateHealthScore(store)`      | NÃO passa dataHub |

#### Callers que JÁ passam DataHub

| Arquivo                            | Linha   | Chamada                                                 | Status |
| ---------------------------------- | ------- | ------------------------------------------------------- | ------ |
| `git_triggers/schedule-handler.ts` | 173,213 | `calculateHealthScore(store, { dataHub })`              | OK     |
| `git_triggers/interactive-mode.ts` | 855     | `calculateHealthScore(store, { dataHub: hub })`         | OK     |
| `shared/pr-report-core.ts`         | 489     | `calculateHealthScore(store, healthConfig)`             | OK     |
| `shared/quality-gate.ts`           | 215     | `calculateHealthScore({ ...store, runs }, { dataHub })` | OK     |

---

#### Tarefa 1.1 — Tornar `dataHub` obrigatório em `calculateHealthScore`

**Objetivo:** Eliminar o caminho de fallback local. DataHub é a ÚNICA fonte de métricas.

**Mudança em `shared/health-score.ts`:**

```typescript
// ANTES:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options?: Partial<HealthScoreConfig> & { dataHub?: DataHub },
): HealthScoreResult {

// DEPOIS:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {
```

**Mudança em `computeActualMetrics`:**

```typescript
// ANTES:
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub?: DataHub): ActualMetrics {

// DEPOIS (Tarefa 1.1 — dataHub obrigatório):
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {

// DEPOIS (Tarefa 1.5 — store removido, DataHub é SSOT):
function computeActualMetrics(config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
```

**Efeito cascata:** Todos os callers que não passam `dataHub` agora falham na compilação.

**Checkpoint:**

```bash
npx tsc --noEmit 2>&1 | grep "not assignable"
# Esperado: ~8 erros de callers que não passam dataHub
```

**Commit:** `refactor(health-score): make dataHub mandatory in calculateHealthScore signature`

---

#### Tarefa 1.2 — Remover funções de cálculo local em health-score.ts

**Objetivo:** Eliminar TODA computação local. DataHub.computed é a ÚNICA fonte.

**Remover funções:**

- `_computeFlakyRate` (linha 129-136)
- `_computeExpWeighted` (linha 142-150)
- `_computeSuiteSpeed` (linha 156-163)
- `_resolveCoverage` (linha 199-208)
- `_resolvePassRate` (linha 220-227) — substituir por acesso direto
- `_resolveSuiteSpeed` (linha 229-236) — substituir por acesso direto

**Simplificar `computeActualMetrics`:**

```typescript
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const passRate = Number.isFinite(dataHub.computed.passRate) ? dataHub.computed.passRate : 0;
    const flakyPct = _normalizeFlakyPct(dataHub.computed.flakyPercentage);
    const coverage = Number.isFinite(dataHub.computed.coverage) ? dataHub.computed.coverage : 0;
    const executionRate = Number.isFinite(dataHub.computed.executionRate) ? dataHub.computed.executionRate : 0;
    const suiteSpeed = Number.isFinite(dataHub.computed.suiteSpeedP95) ? dataHub.computed.suiteSpeedP95 : 0;

    return { passRate, flakyPct, coverage, executionRate, suiteSpeed };
}
```

**Remover imports não utilizados:**

- `calcRunPassRate` (se não mais usado)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "_computeExpWeighted" shared/health-score.ts      # 0 ocorrências
rg "_computeFlakyRate" shared/health-score.ts        # 0 ocorrências
rg "_computeSuiteSpeed" shared/health-score.ts       # 0 ocorrências
rg "_resolveCoverage" shared/health-score.ts         # 0 ocorrências
rg "_resolvePassRate" shared/health-score.ts         # 0 ocorrências
rg "_resolveSuiteSpeed" shared/health-score.ts       # 0 ocorrências
rg "store\.coverageHistory" shared/health-score.ts   # 0 ocorrências
npx vitest run shared/__tests__/health-score*         # 100% pass
```

**Commit:** `refactor(health-score): remove local computation — DataHub.computed is the only source`

---

#### Tarefa 1.3 — Tornar `dataHub` obrigatório em `runQualityGate` + Corrigir Dual Calculation (EXPANDIDO)

**Objetivo:** quality-gate.ts não recalcula nada — usa exclusivamente DataHub.computed.

**Mudança em `shared/quality-gate.ts`:**

```typescript
// ANTES:
export interface QualityGateOptions {
    project?: string;
    coverageOverride?: number | undefined;
    dataHub?: DataHub | undefined;
}

// DEPOIS:
export interface QualityGateOptions {
    project?: string;
    coverageOverride?: number | undefined;
    dataHub: DataHub; // obrigatório
}
```

**Remover de `runQualityGate`:**

- `hub.loadMetricsStore()` (linha 188) — não mais necessário
- `store.runs` — não mais passado para checks
- Fallback `getDataHub()` com catch — usar `options.dataHub` diretamente
- `let hub` local — usar `options.dataHub` diretamente

**Simplificar `_flakyCheck`:**

```typescript
// ANTES: recalcula localmente via calculateFlakyTestRate
function _flakyCheck(runs: MetricsRun[], dataHub?: DataHub): GateCheck {
    const flakyEntries = calcFlakinessEntries(runs, THRESHOLDS.flakyMinRuns);
    const flakyPct = _resolveFlakyPct(runs, dataHub, flakyEntries);
    // ...
}

// DEPOIS: usa DataHub.computed
function _flakyCheck(dataHub: DataHub): GateCheck {
    const flakyPct = dataHub.computed.flakyPercentage ?? 0;
    const status = flakyPct <= THRESHOLDS.maxFlakyPct ? 'pass' : 'fail';
    return {
        name: 'flaky-rate',
        status,
        score: Math.round(flakyPct),
        threshold: THRESHOLDS.maxFlakyPct,
        details: `Flaky: ${Math.round(flakyPct)}% (threshold: ${THRESHOLDS.maxFlakyPct}%)`,
    };
}
```

**Simplificar `_suiteSpeedCheck`:**

```typescript
// ANTES: recalcula P95 localmente via calcTestDurationP95
function _suiteSpeedCheck(health: HealthScoreResult, runs: MetricsRun[], dataHub?: DataHub): GateCheck {
    let p95: number;
    if (dataHub !== undefined && dataHub.raw.runs.length > 0) {
        p95 = calcTestDurationP95(runs);
    } else {
        // ... 20 linhas de recálculo local
    }
    // ...
}

// DEPOIS: usa DataHub.computed
function _suiteSpeedCheck(health: HealthScoreResult, dataHub: DataHub): GateCheck {
    const p95 = dataHub.computed.suiteSpeedP95;
    const thresholdMs = THRESHOLDS.maxSuiteSpeed * 1000;
    const status = p95 <= thresholdMs ? 'pass' : 'fail';
    return {
        name: 'suite-speed',
        status,
        score: health.dimensions.suiteSpeed.score,
        threshold: THRESHOLDS.maxSuiteSpeed,
        details: `Suite speed p95: ${p95}ms (threshold: ${THRESHOLDS.maxSuiteSpeed}s)`,
    };
}
```

**Remover `_resolveFlakyPct`** (função auxiliar não mais necessária).

**Remover imports não utilizados:**

- `calcFlakinessEntries`
- `calculateFlakyTestRate`
- `calcTestDurationP95`

**Adicionar error handling no catch block:**

O catch block de `runQualityGate` (linha ~226) usa `String(err)`. Deve usar `extractErrorMessage` + `humanizeError`:

```typescript
// ANTES (código real):
catch (err) {
    rootLogger.error(`quality-gate: falha — ${String(err)}`);
}

// DEPOIS:
catch (err: unknown) {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.error(`quality-gate: falha — ${known ? known.msg : raw}`);
}
```

Adicionar imports:

```typescript
import { extractErrorMessage } from './errors.js';
import { humanizeError } from './prompt-errors.js';
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" shared/quality-gate.ts        # 0 ocorrências
rg "calculateFlakyTestRate" shared/quality-gate.ts  # 0 ocorrências
rg "calcTestDurationP95" shared/quality-gate.ts     # 0 ocorrências
rg "calcFlakinessEntries" shared/quality-gate.ts    # 0 ocorrências
rg "_resolveFlakyPct" shared/quality-gate.ts        # 0 ocorrências
rg "String\(err\)" shared/quality-gate.ts           # 0 ocorrências (catch block)
rg "extractErrorMessage" shared/quality-gate.ts     # >= 1 ocorrência
rg "humanizeError" shared/quality-gate.ts           # >= 1 ocorrência
npx vitest run shared/__tests__/quality-gate*        # 100% pass
npx vitest run shared/__tests__/integration/quality-gate*  # 100% pass
```

**Commit:** `refactor(quality-gate): make dataHub mandatory — remove loadMetricsStore and all local recalculation`

---

#### Tarefa 1.4 — Migrar callers que não passam DataHub

**Objetivo:** Todos os callers de `calculateHealthScore` e `runQualityGate` passam DataHub.

**Callers a migrar:**

| Arquivo                              | Linha           | Ação                                            |
| ------------------------------------ | --------------- | ----------------------------------------------- |
| `jira_management/main.ts`            | 344             | Criar DataHub no bootstrap, passar via contexto |
| `jira_management/commands/case26.ts` | 23              | Usar `c.dataHub` do CommandContext              |
| `jira_management/commands/case19.ts` | 70              | Usar `c.dataHub` do CommandContext              |
| `git_triggers/interactive-mode.ts`   | 374,441,491,533 | Passar `hub` (já disponível no escopo)          |
| `shared/cli_base.ts`                 | 221             | Criar DataHub via `getOrFetchDataHub`           |

**Callers de `runQualityGate` (verificar):**

| Arquivo                            | Linha | Ação                         |
| ---------------------------------- | ----- | ---------------------------- |
| `git_triggers/interactive-mode.ts` | 581   | Já passa dataHub — verificar |
| `git_triggers/schedule-handler.ts` | 259   | Já passa dataHub — verificar |
| `shared/pr-report-core.ts`         | 352   | Já passa dataHub — verificar |

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/                               # 100% pass
npx vitest run jira_management/                      # 100% pass
npx vitest run git_triggers/                         # 100% pass
```

**Commit:** `refactor: update all callers to pass DataHub (mandatory)`

> **Nota: Fallback Tripartido em quality-gate.ts**
>
> `quality-gate.ts:173-187` implementa fallback de 3 níveis: `getDataHub()` → `options.dataHub` → `throw`. Esse padrão não está documentado em nenhuma fase e compete com `ensureDataHub()`.
>
> **Resolução:** Após Tarefa 1.3 (remoção de `loadMetricsStore`), o fallback será simplificado:
>
> ```typescript
> // ANTES (código real — fallback tripartido):
> try {
>     hub = getDataHub();
> } catch {
>     if (options?.dataHub) {
>         hub = options.dataHub;
>     } else {
>         throw new Error('DataHub not initialized...');
>     }
> }
>
> // DEPOIS (consolidado):
> const hub = options?.dataHub ?? getDataHub();
> if (!hub) throw new Error('DataHub not initialized — run setup first');
> ```
>
> `ensureDataHub()` é a função correta para inicialização. O fallback tripartido será consolidado em uma única chamada.

---

#### Tarefa 1.5 — Error Handling + Refatoração de Assinatura: health-score.ts + quality-gate.ts

**Objetivo:** Tratamento de erros explícito — nenhum erro silencioso. Refatorar `calculateHealthScore` para aceitar apenas `DataHub` como fonte.

**Adicionar em `shared/health-score.ts`:**

```typescript
import { extractErrorMessage } from './errors.js';
import { humanizeError } from './prompt-errors.js';
import { rootLogger } from './logger.js';
```

**Refatorar assinatura de `computeActualMetrics` — remover `store: MetricsStore`:**

A assinatura atual aceita ambos `MetricsStore` e `DataHub`. Isso viola SSOT — `MetricsStore` deve ser eliminado como parâmetro. `dataHub.raw.runs` substitui `metricsStore.runs`.

```typescript
// ANTES (plano original — incorreto):
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const runCount = store.runs.length;
    // ...
}

// DEPOIS (corrigido):
function computeActualMetrics(config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const runCount = dataHub.raw.runs.length;
    const c = dataHub.computed;
    if (!Number.isFinite(c.passRate) && !Number.isFinite(c.coverage) && !Number.isFinite(c.executionRate)) {
        rootLogger.warn('health-score: DataHub.computed has mostly invalid values — results may be unreliable');
    }
    // ... resto via c.passRate, c.coverage, c.executionRate
}
```

**Refatorar assinatura de `calculateHealthScore` — remover `metricsStore: MetricsStore`:**

```typescript
// ANTES:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {

// DEPOIS:
export function calculateHealthScore(
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {
```

**Efeito cascata:** Todos os callers de `calculateHealthScore` que passam `metricsStore` como primeiro argumento devem ser atualizados. Os callers já passam `dataHub` via options (Tarefa 1.4), então a mudança é: remover o primeiro argumento.

**Efeito em `_buildChecks` e funções auxiliares:** Todas as funções que recebem `MetricsStore` como parâmetro devem ser refatoradas para ler de `dataHub.raw.*` e `dataHub.computed.*`.

**Adicionar em `shared/quality-gate.ts`:**

```typescript
// No catch block de runQualityGate:
catch (err: unknown) {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.error(`quality-gate: ${known ? known.msg : raw}`);
    // ...
}
```

**Checkpoint:**

```bash
rg "extractErrorMessage" shared/health-score.ts      # >= 1 ocorrência
rg "humanizeError" shared/health-score.ts             # >= 1 ocorrência
rg "MetricsStore" shared/health-score.ts              # 0 parâmetros de função (apenas imports se necessário)
rg "store\.runs" shared/health-score.ts               # 0 ocorrências (usar dataHub.raw.runs)
rg "extractErrorMessage" shared/quality-gate.ts      # >= 1 ocorrência
rg "humanizeError" shared/quality-gate.ts             # >= 1 ocorrência
npx vitest run shared/__tests__/health-score*          # 100% pass
npx vitest run shared/__tests__/quality-gate*          # 100% pass
```

**Commit:** `fix(health-score,quality-gate): remove MetricsStore param — DataHub is sole source + add error handling`

---

#### Tarefa 1.6 — Dimension 5: release-score.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas, justificar pesos e thresholds.

**Mudanças em `shared/release-score.ts`:**

1. Adicionar PROVENANCE_DIMENSIONS (similar ao health-score.ts):

```typescript
const RELEASE_SCORE_PROVENANCE = {
    weights: {
        tasks: { value: 0.25, source: 'Product management best practice', standard: 'Internal' },
        health: { value: 0.3, source: 'Quality gate composite', standard: 'Internal' },
        coverage: { value: 0.25, source: 'ISO/IEC 25023:2016', standard: 'ISO/IEC 25023:2016' },
        flakiness: { value: 0.2, source: 'DORA State of DevOps 2025', standard: 'DORA' },
    },
    threshold: { value: 70, source: 'Release readiness industry standard', standard: 'Internal' },
};
```

2. Adicionar JSDoc com referências normativas
3. Validar pesos com `Number.isFinite` + soma = 1.0
4. Adicionar validação de threshold >= 0

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/release-score.ts   # >= 1 ocorrência
rg "ISO\|DORA\|ISTQB" shared/release-score.ts        # >= 1 referência
npx vitest run shared/__tests__/release-score*         # 100% pass
```

**Commit:** `docs(release-score): add Dimension 5 provenance — weights, threshold, normative references`

---

#### Tarefa 1.7 — Dimension 5: requirement-score.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas, justificar pesos e thresholds.

**Mudanças em `shared/requirement-score.ts`:**

1. Adicionar REQUIREMENT_SCORE_PROVENANCE:

```typescript
const REQUIREMENT_SCORE_PROVENANCE = {
    weights: {
        acceptance: { value: 0.5, source: 'AI acceptance rate importance', standard: 'Internal' },
        retention: { value: 0.3, source: 'Requirement retention metric', standard: 'Internal' },
        volume: { value: 0.2, source: 'Volume normalization factor', standard: 'Internal' },
    },
    gradeThresholds: {
        A: { min: 90, source: 'Industry standard grading', standard: 'Internal' },
        B: { min: 75, source: 'Industry standard grading', standard: 'Internal' },
        C: { min: 60, source: 'Industry standard grading', standard: 'Internal' },
        D: { min: 40, source: 'Industry standard grading', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referências
3. Validar pesos com `Number.isFinite` + soma = 1.0
4. Validar thresholds com `Number.isFinite` + ordem crescente

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/requirement-score.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/requirement-score*         # 100% pass
```

**Commit:** `docs(requirement-score): add Dimension 5 provenance — weights, thresholds, normative references`

---

#### Tarefa 1.8 — Dimension 5: backlog-health.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas.

**Mudanças em `shared/backlog-health.ts`:**

1. Adicionar BACKLOG_HEALTH_PROVENANCE:

```typescript
const BACKLOG_HEALTH_PROVENANCE = {
    weights: {
        stale: { value: 35, source: 'Backlog hygiene best practice', standard: 'Internal' },
        unassigned: { value: 30, source: 'Resource allocation importance', standard: 'Internal' },
        bugNoTest: { value: 35, source: 'Test coverage gap importance', standard: 'Internal' },
    },
    thresholds: {
        healthy: { value: 80, source: 'Backlog health target', standard: 'Internal' },
        warning: { value: 50, source: 'Backlog health warning', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referências
3. Validar pesos com `Number.isFinite`
4. Validar thresholds com `Number.isFinite`

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/backlog-health.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/backlog-health*         # 100% pass
```

**Commit:** `docs(backlog-health): add Dimension 5 provenance — weights, thresholds, normative references`

---

#### Tarefa 1.9 — Dimension 5: silent-regression.ts — Proveniência e Referências

**Objetivo:** Documentar base estatística dos thresholds de z-score.

**Mudanças em `shared/silent-regression.ts`:**

1. Adicionar SILENT_REGRESSION_PROVENANCE:

```typescript
const SILENT_REGRESSION_PROVENANCE = {
    severityThresholds: {
        LOW: { zScore: 1, source: 'Statistical process control (1-sigma)', standard: 'ISO 3534-2' },
        MEDIUM: { zScore: 2, source: 'Statistical process control (2-sigma)', standard: 'ISO 3534-2' },
        HIGH: { zScore: 3, source: 'Statistical process control (3-sigma)', standard: 'ISO 3534-2' },
        CRITICAL: { zScore: 5, source: 'Extreme outlier detection (5-sigma)', standard: 'ISO 3534-2' },
    },
};
```

2. Adicionar JSDoc com referência ISO 3534-2
3. Validar thresholds com `Number.isFinite` + ordem crescente

**Checkpoint:**

```bash
rg "ISO 3534\|PROVENANCE" shared/silent-regression.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/silent-regression*         # 100% pass
```

**Commit:** `docs(silent-regression): add Dimension 5 provenance — z-score thresholds, ISO 3534-2 reference`

---

#### Tarefa 1.10 — Dimension 5: quality-metrics.ts — Proveniência

**Objetivo:** Documentar threshold 2-sigma para drift detection.

**Mudanças em `shared/quality-metrics.ts`:**

1. Adicionar DRIFT_DETECTION_PROVENANCE:

```typescript
const DRIFT_DETECTION_PROVENANCE = {
    sigmaThreshold: {
        value: 2,
        source: 'Statistical process control (2-sigma rule)',
        standard: 'ISO 3534-2',
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "ISO 3534\|PROVENANCE" shared/quality-metrics.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/quality-metrics*         # 100% pass
```

**Commit:** `docs(quality-metrics): add Dimension 5 provenance — drift detection threshold, ISO 3534-2`

---

#### Tarefa 1.11 — Dimension 5: cross-squad-benchmark.ts — Proveniência

**Objetivo:** Documentar metodologia de benchmark.

**Mudanças em `shared/cross-squad-benchmark.ts`:**

1. Adicionar BENCHMARK_PROVENANCE:

```typescript
const BENCHMARK_PROVENANCE = {
    methodology: {
        source: 'Cross-team benchmarking best practice',
        standard: 'DORA / Internal',
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "PROVENANCE\|DORA" shared/cross-squad-benchmark.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/cross-squad-benchmark*     # 100% pass
```

**Commit:** `docs(cross-squad-benchmark): add Dimension 5 provenance — benchmark methodology reference`

---

#### Tarefa 1.12 — Dimension 5: impact-alert.ts — Proveniência

**Objetivo:** Documentar thresholds de alerta.

**Mudanças em `shared/impact-alert.ts`:**

1. Adicionar IMPACT_ALERT_PROVENANCE:

```typescript
const IMPACT_ALERT_PROVENANCE = {
    thresholds: {
        low: { value: 70, source: 'Quality gate minimum threshold', standard: 'Internal' },
        high: { value: 80, source: 'Quality gate target threshold', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "PROVENANCE" shared/impact-alert.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/impact-alert*  # 100% pass
```

**Commit:** `docs(impact-alert): add Dimension 5 provenance — alert thresholds reference`

---

#### Tarefa 1.13 — Testes Dimension 5: PBT + Integration

**Objetivo:** Garantir que todos os novos PROVENANCE_DIMENSIONS são validados por testes.

**Novos testes:**

1. **release-score.property.test.ts** — PBT: pesos somam 1.0, thresholds >= 0
2. **requirement-score.property.test.ts** — PBT: pesos somam 1.0, thresholds em ordem crescente
3. **backlog-health.property.test.ts** — PBT: pesos >= 0, thresholds >= 0
4. **silent-regression.property.test.ts** — PBT: z-scores em ordem crescente
5. **integration/dimension5-validation.integration.test.ts** — Valida que TODOS os módulos têm PROVENANCE_DIMENSIONS

**Checkpoint:**

```bash
npx vitest run shared/__tests__/dimension5*              # 100% pass
npx vitest run shared/__tests__/integration/dimension5*  # 100% pass
```

**Commit:** `test(dimension5): add PBT and integration tests for all provenance documentation`

---

### Checkpoint Final da Fase 1

```bash
# 1. TypeScript
npx tsc --noEmit                                    # 0 erros

# 2. Sem bypasses em health-score.ts
rg "_computeExpWeighted|_computeFlakyRate|_computeSuiteSpeed|_resolveCoverage|store\.coverageHistory|_resolvePassRate|_resolveSuiteSpeed" shared/health-score.ts  # 0

# 3. Sem bypasses em quality-gate.ts
rg "loadMetricsStore|calculateFlakyTestRate|calcTestDurationP95|calcFlakinessEntries|_resolveFlakyPct" shared/quality-gate.ts  # 0

# 4. dataHub obrigatório
rg "dataHub\?" shared/health-score.ts               # 0 (era opcional, agora é obrigatório)
rg "dataHub\?" shared/quality-gate.ts               # 0 (era opcional, agora é obrigatório)

# 5. Error handling
rg "extractErrorMessage" shared/health-score.ts     # >= 1
rg "humanizeError" shared/health-score.ts            # >= 1

# 6. Dimension 5 Provenance
rg "PROVENANCE" shared/release-score.ts              # >= 1
rg "PROVENANCE" shared/requirement-score.ts          # >= 1
rg "PROVENANCE" shared/backlog-health.ts             # >= 1
rg "PROVENANCE" shared/silent-regression.ts          # >= 1
rg "PROVENANCE" shared/quality-metrics.ts            # >= 1
rg "PROVENANCE" shared/cross-squad-benchmark.ts      # >= 1
rg "PROVENANCE" shared/impact-alert.ts               # >= 1

# 7. Normative References
rg "ISO.*25023\|DORA\|ISTQB\|ISO 3534" shared/release-score.ts  # >= 1
rg "ISO.*25023\|DORA\|ISTQB\|ISO 3534" shared/requirement-score.ts  # >= 1

# 8. Testes
npx vitest run shared/__tests__/health-score*         # 100% pass
npx vitest run shared/__tests__/quality-gate*         # 100% pass
npx vitest run shared/__tests__/integration/quality-gate*  # 100% pass
npx vitest run shared/__tests__/dimension5*           # 100% pass
npx vitest run jira_management/                       # 100% pass
npx vitest run git_triggers/                          # 100% pass
```

## Fase 2 — quality-gate.ts SSOT (absorvida pela Fase 1)

> **Nota (2026-07-10):** A Fase 2 original (quality-gate.ts SSOT) foi **absorvida pela Fase 1, Tarefa 1.3**.
> As 3 tarefas originais da Fase 2 (RED, GREEN, callers) estão cobertas pela Tarefa 1.3.
> Nenhuma ação adicional necessária nesta fase.

---

## FASE 3 — pr-report-core.ts SSOT (4 tarefas)

---

#### Tarefa 3.1 — Remover CTRF de pr-report-core.ts

**Preparação:**

```bash
grep -n "readIstanbulCoverage\|parseTestResultsFile\|ctrf\|store\.runs" shared/pr-report-core.ts
# Mapear: L36 (istanbul import), L37 (parseTestResultsFile import), L38 (ParseResult type)
# L643 (ctrfPath CliOptions), L653 (ctrfPath default), L684-685 (--ctrf case)
# L745-748 (CTRF file check), L750-754 (CTRF parsing), L791-792 (store.runs diff)
# L795-801 (result.tests/stats from CTRF)
```

**GREEN:**

1. Remover `import { readIstanbulCoverage }` (L36)
2. Remover `import { parseTestResultsFile }` (L37)
3. Remover `ParseResult` do import type (L38) — manter `FlatTest`
4. Remover `ctrfPath: string` de `CliOptions` (L643)
5. Remover default `ctrfPath: 'reports/ctrf-report.json'` (L653)
6. Remover help text `--ctrf` (L673-674)
7. Remover case `--ctrf` em `parseArgs` (L684-685)
8. Remover `if (!fs.existsSync(opts.ctrfPath))` (L745-748)
9. Remover `parseTestResultsFile(opts.ctrfPath)` + error check (L750-754)
10. Substituir diff comparison: `store.runs` → `dataHub?.computed.metricsRuns` (L791-792)
11. Substituir `result.tests`/`result.stats` → extrair de `dataHub?.computed.metricsRuns[0]` (L795-801)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "readIstanbulCoverage|parseTestResultsFile" shared/pr-report-core.ts  # 0
rg "ctrf" shared/pr-report-core.ts                 # 0
rg "store\.runs" shared/pr-report-core.ts          # 0
```

**Commit:** `refactor(pr-report-core): remove CTRF direct reads — use DataHub as SSOT`

---

#### Tarefa 3.2 — Migrar funções para DataHub

**GREEN:**

1. `resolveCoverageForReport()` (L393): substituir `return readIstanbulCoverage() ?? undefined` → `return undefined`
2. `buildFlakySection()` (L180-221):
    - Remover `isDataHubInitialized()`/`getDataHub()`/`hub.loadMetricsStore()`/`store.runs`
    - Nova assinatura: `buildFlakySection(dataHub?: DataHub): string`
    - Usar `dataHub?.computed.flakinessEntries ?? []`
3. `generateHtmlReportFile()` (L396-439):
    - Substituir `store: MetricsStore` por `dataHub?: DataHub`
    - L407: `calcFlakinessEntries(store.runs, ...)` → `dataHub?.computed.flakinessEntries ?? []`
    - L420: `calcMetricsTrends(store.runs)` → `dataHub?.computed.metricsTrends ?? []`
4. `generatePrReport()` (L494-551):
    - Remover `const store = hub?.loadMetricsStore() ?? { runs: [] }` (L501)
    - L530: `buildFlakySection()` → `buildFlakySection(dataHub)`
    - L534: `generateHtmlReportFile(..., store, ...)` → `generateHtmlReportFile(..., dataHub, ...)`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore|store\." shared/pr-report-core.ts  # 0
npx vitest run shared/__tests__/pr-report-core*     # 100% pass
```

**Commit:** `refactor(pr-report-core): migrate buildFlakySection, generateHtmlReportFile to DataHub`

---

#### Tarefa 3.3 — Atualizar ci-injector.ts (gerador de YAML)

**GREEN:**

1. Remover `const CTRF_DEFAULT` (L17)
2. Substituir `ctrfPath?: string` por `testReportPath: string` + `artifactName: string` em `PostProcessWorkflowOptions` (L23-28)
3. Substituir `ctrfPath` por `testReportPath` (L35)
4. Substituir input `ctrf-path` por `test-report-path` no YAML gerado (L49-53)
5. Adicionar input `artifact-name` no YAML gerado
6. Substituir step "Download CTRF report" por "Upload test report" — `actions/upload-artifact` com `name: ${{ inputs.artifact-name }}`, `path: ${{ inputs.test-report-path }}`
7. Remover shell check `if [ ! -f ... ]` e `--ctrf` no run command (L74-78)
8. Run simplificado: `npx tsx git_triggers/pr-report-entry.ts --project ${{ inputs.project-name }}`
9. Atualizar `generatePostProcessWorkflowFromContext` (L94-101) — usar `ctx.testReportPath` e `ctx.artifactName`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "ctrf" shared/ci-injector.ts                    # 0
npx vitest run shared/ci-injector.test.ts           # 100% pass
```

**Commit:** `refactor(ci-injector): replace CTRF with generic testReportPath + artifactName`

---

#### Tarefa 3.4 — Atualizar wizard (setup/main.ts + setup/context.ts)

**GREEN:**

1. `setup/context.ts`: substituir `ctrfReportPath: string` por `testReportPath: string`
2. `setup/context.ts`: adicionar `artifactName: string`
3. `setup/main.ts:63-65`: renomear pergunta para "Test report path" (default: detection.ctrfReportPath)
4. `setup/main.ts`: adicionar pergunta "Artifact name ['test-report']" (default: `test-report`)
5. `setup/main.ts:104-117`: atualizar return para incluir `testReportPath` e `artifactName`
6. `setup/config-writer.ts`: atualizar se referenciar `ctrfReportPath`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "testReportPath|artifactName" setup/context.ts  # >= 2
rg "ctrfReportPath" setup/context.ts               # 0
npx vitest run setup/main.test.ts                   # 100% pass
```

**Commit:** `refactor(wizard): replace ctrfReportPath with testReportPath + artifactName`

---

#### Tarefa 3.5 — Testes

**GREEN:**

| Item  | Teste                                                     | Mudanças principais                                                                            |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 3.5.1 | `shared/__tests__/pr-report-core.test.ts`                 | Remover mocks readIstanbulCoverage/parseTestResultsFile, mock DataHub com computed.metricsRuns |
| 3.5.2 | `shared/__tests__/pr-report-core.property.test.ts`        | Mesmo                                                                                          |
| 3.5.3 | `shared/__tests__/pr-report-core.wiring.property.test.ts` | Mesmo                                                                                          |
| 3.5.4 | `shared/__tests__/pr-report-core.wiring.test.ts`          | Remover parseTestResultsFile mock                                                              |
| 3.5.5 | `shared/__tests__/pr-report-core.main.test.ts`            | Reescrever — remover mocks CTRF, testar fluxo DataHub                                          |
| 3.5.6 | `shared/ci-injector.test.ts`                              | Atualizar para novos inputs (testReportPath, artifactName)                                     |
| 3.5.7 | `setup/main.test.ts`                                      | Atualizar mocks para testReportPath/artifactName                                               |

**Checkpoint:**

```bash
npx vitest run shared/__tests__/pr-report-core* shared/__tests__/pr-report.test.ts shared/ci-injector.test.ts setup/main.test.ts  # 100% pass
```

**Commit:** `test(pr-report-core, ci-injector, wizard): update mocks for DataHub SSOT`

## FASE 4 — Jira Command Handlers (6 tarefas)

---

#### Tarefa 4.1 — case12: Migrate to DataHub

**Preparação:**

```bash
grep -n "loadMetricsStore\|store\.runs\|store\.coverageHistory" jira_management/commands/case12.ts
```

**RED:**

```bash
# Criar test que FALHA:
# it('uses c.dataHub.computed.coverage instead of store.coverageHistory', () => {
#   const ctx = createMockContext({ dataHub: createTestHub({ computed: { coverage: 75 } }) });
#   await handler(ctx);
#   expect(ctx.print).toHaveBeenCalledWith(expect.stringContaining('75'));
# });
# Esperado: FALHA — case12 ainda lê store.coverageHistory
```

**GREEN:**

- Substituir `persistence.loadMetricsStore()` → `c.dataHub.computed.*`
- Substituir `store.runs` → `c.dataHub.computed.metricsRuns`
- Substituir `store.coverageHistory` → `c.dataHub.computed.coverage`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case12.ts  # 0
npx vitest run jira_management/commands/case12.test.ts     # 100% pass
```

**Commit:** `refactor(case12): migrate to DataHub — coverage, metricsRuns`

---

#### Tarefa 4.2 — case17: Migrate to DataHub

**GREEN:**

- Substituir `store.runs` (L158, 218) → `c.dataHub.computed.metricsRuns`
- Substituir `resolveTestDataSource()` chamada → usar `c.dataHub.raw.parsedArtifacts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case17.ts  # 0
npx vitest run jira_management/commands/case17.test.ts     # 100% pass
```

**Commit:** `refactor(case17): migrate to DataHub — metricsRuns, parsedArtifacts`

---

#### Tarefa 4.3 — case19: Migrate to DataHub + fix local calculation

**GREEN:**

- Substituir `(r.passed / (r.passed + r.failed)) * 100` (L21) → `calcRunPassRate(r)`
- Substituir `store.runs` (L14-68, 100) → `c.dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "passed /.*passed.*failed.*100" jira_management/commands/case19.ts  # 0
rg "loadMetricsStore" jira_management/commands/case19.ts              # 0
npx vitest run jira_management/commands/case19.test.ts                 # 100% pass
```

**Commit:** `refactor(case19): migrate to DataHub — replace local passRate calc with calcRunPassRate`

---

#### Tarefa 4.4 — case21 + case22 + case26: Migrate to DataHub

**GREEN:**

- case21: substituir `store.coverageHistory` → `c.dataHub.computed.coverage`
- case22: substituir `store.runs` → `c.dataHub.computed.flakinessEntries`
- case26: substituir `store.runs` → `c.dataHub.computed.metricsRuns` + passar `dataHub` para `calculateHealthScore`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case21.ts  # 0
rg "loadMetricsStore" jira_management/commands/case22.ts  # 0
rg "loadMetricsStore" jira_management/commands/case26.ts  # 0
npx vitest run jira_management/commands/case21.test.ts     # 100% pass
npx vitest run jira_management/commands/case22.test.ts     # 100% pass
npx vitest run jira_management/commands/case26.test.ts     # 100% pass
```

**Commit:** `refactor(case21,case22,case26): migrate to DataHub — coverage, flaky, metricsRuns`

---

#### Tarefa 4.5 — BadTesting: Fix theater tests in case commands

**GREEN:**

- `jira_management/create_tests.test.ts` (L671, 687, 702, 719, 836): substituir `toBeDefined()` por assertions de comportamento
- `jira_management/import-orchestrator.test.ts` (L189): substituir
- `jira_management/import-prep.test.ts` (L199): substituir

**Checkpoint:**

```bash
rg "expect.*toBeDefined\(\)" jira_management/create_tests.test.ts  # 0 resultados solitários
npx vitest run jira_management/                                      # 100% pass
```

**Commit:** `test(jira): replace theater tests (toBeDefined-only) with behavioral assertions`

---

#### Tarefa 4.6 — Error Handling: Jira commands

**GREEN:**

- Substituir error handling pattern por `formatErr(err)` em todos os case handlers
- Adicionar `extractErrorMessage` + `humanizeError` em catch blocks

**Checkpoint:**

```bash
rg "formatErr" jira_management/commands/  # >= 1
rg "extractErrorMessage" jira_management/commands/                # >= 1
npx vitest run jira_management/                                    # 100% pass
```

**Commit:** `fix(jira-commands): standardize error handling with extractErrorMessage + humanizeError`

## FASE 5 — git_triggers Consumers (5 tarefas)

---

#### Tarefa 5.1 — interactive-mode.ts: Migrate store.runs

**GREEN:**

- L258-259: `loadMetricsStore()` → `dataHub.raw.runs`
- L347-349: `loadMetricsStore()` → `dataHub.raw.runs` + `dataHub.computed.*`
- L442-444: `loadMetricsStore()` → `dataHub.computed.metricsRuns`
- L854-856: `loadMetricsStore()` → `dataHub.computed.metricsRuns`
- Substituir `_getErrorMessage` (L870-879) por `formatErr` de `shared/errors.ts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/interactive-mode.ts  # 0
rg "_getErrorMessage" git_triggers/interactive-mode.ts  # 0
npx vitest run git_triggers/interactive-mode.test.ts     # 100% pass
```

**Commit:** `refactor(interactive-mode): migrate to DataHub — store.runs, error handling`

---

#### Tarefa 5.2 — schedule-handler.ts: Migrate store.runs

**GREEN:**

- L158-160: `loadMetricsStore()` → `dataHub.raw.runs` + `dataHub.computed.*`
- L210: `store.runs` → `dataHub.raw.runs`
- L255: `calculatePipelineCost(runs)` → passar `dataHub`
- L308-309: `loadMetricsStore()` → `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/schedule-handler.ts  # 0
rg "store\.runs" git_triggers/schedule-handler.ts       # 0
npx vitest run git_triggers/schedule-handler.test.ts     # 100% pass
```

**Commit:** `refactor(schedule-handler): migrate to DataHub — store.runs, pipelineCost`

---

#### Tarefa 5.3 — batch-mode.ts: Migrate store.runs

**GREEN:**

- L212-213: `loadMetricsStore()` → `dataHub.raw.runs`
- L355-356: `loadMetricsStore()` → `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/batch-mode.ts     # 0
npx vitest run git_triggers/batch-mode.test.ts        # 100% pass
```

**Commit:** `refactor(batch-mode): migrate to DataHub — store.runs`

---

#### Tarefa 5.4 — pipeline-jira.ts + session-context.ts: Migrate

**GREEN:**

- `pipeline-jira.ts` L22-30: `store.failureClassifications` → `dataHub.computed.*`
- `session-context.ts` L117-178: substituir `Store` class por `DataHubPersistence`
- `session-context.ts` L202: `fetchLatestTestRun()` → `dataHub.raw.parsedArtifacts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/pipeline-jira.ts   # 0
rg "new Store" shared/session-context.ts              # 0
npx vitest run shared/session-context.test.ts          # 100% pass
```

**Commit:** `refactor(pipeline-jira,session-context): migrate to DataHub — failureClassifications, parsedArtifacts`

---

#### Tarefa 5.5 — Error Handling: git_triggers

**GREEN:**

- `github-workflow.ts:330`: bare `catch { return null; }` → adicionar `rootLogger.warn(extractErrorMessage(err))`
- `gitlab-workflow.ts:210`: bare `catch { return null; }` → adicionar `rootLogger.warn(extractErrorMessage(err))`
- `github-provider.ts`: substituir `String(err)` por `extractErrorMessage(err)` em 5 catch blocks
- `gitlab-provider.ts`: substituir `String(err)` por `extractErrorMessage(err)` em 5 catch blocks
- `coverage-provider.ts:72`: substituir `String(err)` por `extractErrorMessage(err)`
- Atualizar `git-provider-error.ts`: `handleError()` → usar `extractErrorMessage` + `humanizeError`

**Checkpoint:**

```bash
rg "bare catch.*return null" git_triggers/            # 0
rg "String(err)" shared/data-hub/providers/           # 0
rg "extractErrorMessage" shared/data-hub/providers/   # >= 5
rg "humanizeError" git-provider-error.ts              # >= 1
npx vitest run git_triggers/                           # 100% pass
```

**Commit:** `fix(error-handling): eliminate silent errors in git_triggers and data-hub providers`

## FASE 6 — Shared Consumers Restantes (3 tarefas)

---

#### Tarefa 6.1 — cli_base.ts + coverage-gap.ts: Migrate

**GREEN:**

- `cli_base.ts:218`: criar DataHub e passar para `calculateHealthScore`
- `coverage-gap.ts:104`: substituir `store.coverageHistory` por `dataHub.computed.coverage`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "store\.coverageHistory" shared/coverage-gap.ts   # 0
npx vitest run shared/cli_base.test.ts               # 100% pass
npx vitest run shared/coverage-gap.test.ts            # 100% pass
```

**Commit:** `refactor(cli_base,coverage-gap): migrate to DataHub — coverage, healthScore`

---

#### Tarefa 6.2 — traceability-matrix.ts + smoke-pipeline.ts: Migrate

**GREEN:**

- `traceability-matrix.ts:52,54,79`: garantir que `metrics.runs` é `dataHub.computed.*`
- `e2e/smoke-pipeline.ts:111`: substituir `metrics.runs` por `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/traceability-matrix.test.ts    # 100% pass
npx vitest run e2e/smoke-pipeline.test.ts            # 100% pass
```

**Commit:** `refactor(traceability-matrix,smoke-pipeline): migrate to DataHub`

---

#### Tarefa 6.3 — humanizeError: Add missing patterns (padrões 10-17)

**GREEN:**

- `shared/prompt-errors.ts`: adicionar padrões 10-17 (GitHub API, artifacts, XML, coverage)
- Verificar que `humanizeError` retorna msg+hint para cada novo padrão

**Checkpoint:**

```bash
grep -c "case\|/" shared/prompt-errors.ts            # >= 17 padrões
npx vitest run shared/__tests__/prompt-errors*         # 100% pass
```

**Commit:** `feat(prompt-errors): add 8 new error patterns for CI/GitHub/GitLab coverage`

## FASE 7 — Auditoria Pós-Migração (1 tarefa)

---

#### Tarefa 7.1 — Full Verification Audit

**Verificações:**

```bash
# A. Nenhum loadMetricsStore em produção (fora data-hub/)
rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# B. Nenhum readIstanbulCoverage em produção
rg "readIstanbulCoverage" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
# Esperado: 0 resultados

# C. Nenhum parseTestResultsFile em produção (fora data-hub/)
rg "parseTestResultsFile" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# D. Nenhum isQuarantined em produção (fora quarantine.ts)
rg "isQuarantined" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/quarantine.ts'
# Esperado: 0 resultados

# E. Nenhum import de store.ts em produção (fora data-hub/)
rg "from.*shared/store" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# F. Nenhum store.runs em produção (fora data-hub/)
rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# G. DataHub é obrigatório em health-score, quality-gate, pr-report-core
rg "dataHub\?: DataHub" shared/health-score.ts shared/quality-gate.ts shared/pr-report-core.ts
# Esperado: 0 resultados

# H. Type safety
npx tsc --noEmit
rg --pcre2 "as\s+any" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
rg "@ts-ignore|@ts-expect-error" --include="*.ts" -g '!__tests__' -g '!*.test.ts'

# I. Error handling
rg "bare catch.*return null" shared/ git_triggers/ jira_management/ --include="*.ts" -g '!test*'
rg "String(err)" shared/data-hub/providers/ --include="*.ts"

# J. Full suite
npx vitest run --reporter=verbose | tail -10
npx eslint . --max-warnings=0
```

**Checkpoint:** TODOS os comandos acima passam.

**Commit:** `audit(ssot): post-migration verification — zero bypasses confirmed`

---

## FASE 8 — Deletar Fontes Alternativas (2 tarefas)

---

#### Tarefa 8.1 — Delete alternative modules

**Preparação (OBRIGATÓRIA — executar ANTES de deletar):**

```bash
# Verificar que Fase 7 passou — executar os comandos de verificação da Fase 7 manualmente

# CRÍTICO: Verificar que NENHUM consumidor ainda importa os módulos a deletar
rg "ci-test-downloader|coverage-source|commit-log" --include="*.ts" \
  -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' -g '!docs' -g '!plans'
# Esperado: 0 resultados
# Se retornar resultados: PARAR. Migrar consumidores antes de deletar.
```

**GREEN:**

- Deletar `shared/ci-test-downloader.ts` + `shared/ci-test-downloader.test.ts`
- Deletar `shared/coverage-source.ts` + `shared/coverage-source.test.ts` + `shared/coverage-source.property.test.ts` + `shared/integration/coverage-source.integration.test.ts`
- Deletar `shared/commit-log.ts` + `shared/commit-log.test.ts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run --reporter=verbose | tail -10         # 100% pass
rg "ci-test-downloader\|coverage-source\|commit-log" --include="*.ts" -g '!docs' -g '!plans'  # 0
```

**Commit:** `refactor(data-hub): delete alternative data sources (ci-test-downloader, coverage-source, commit-log)`

---

#### Tarefa 8.2 — Remove loadMetricsStore from public interface + ESLint

**GREEN:**

- `shared/types/data-hub.ts`: remover `loadMetricsStore()` e `saveMetricsStore()` da interface `DataHubPersistence`
- `shared/data-hub/persistence.ts`: manter implementação como privada
- Criar métodos públicos: `getRuns()`, `getCoverageHistory()`, `getFailureClassifications()`
- Adicionar ESLint `no-restricted-imports` para bloquear imports de módulos deletados

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" shared/types/data-hub.ts      # 0 (removido da interface)
npx eslint . --max-warnings=0                        # 0 violações
npx vitest run --reporter=verbose | tail -10         # 100% pass
```

**Commit:** `refactor(data-hub): remove loadMetricsStore from public interface + add ESLint enforcement`

## FASE 9 — Pegar Consumidores Silenciosos (1 tarefa variável)

---

#### Tarefa 9.1 — Fix silent consumers revealed by deletion

**Preparação:**

```bash
npx tsc --noEmit 2>&1 | rg "Cannot find module"
npx vitest run 2>&1 | rg "FAIL"
```

**GREEN:**

- Para cada erro: mapear arquivo → criar DataHub → migrar
- Repetir até 0 erros

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run --reporter=verbose | tail -10         # 100% pass
```

**Commit:** `fix(data-hub): migrate silent consumers revealed by source deletion`

---

## FASE 10 — Prevenção Final (2 tarefas)

---

#### Tarefa 10.1 — ESLint: Block loadMetricsStore externally

**GREEN:**

- Adicionar `no-restricted-syntax` rule para bloquear `loadMetricsStore` fora de `shared/data-hub/`

**Checkpoint:**

```bash
npx eslint . --max-warnings=0                        # 0 violações
```

**Commit:** `feat(eslint): add SSOT enforcement rule — block loadMetricsStore externally`

---

#### Tarefa 10.2 — Update TECHDOC.md + Final Verification

**GREEN:**

- Atualizar `docs/TECHDOC.md` com DataHub como SSOT obrigatório
- Documentar que nenhum módulo fora de `data-hub/` pode acessar MetricsStore/Store

**Checkpoint Final:**

```bash
echo "=== VERIFICAÇÃO FINAL SSOT ==="
echo "1. Compilação:" && npx tsc --noEmit && echo "   ✅"
echo "2. Lint:" && npx eslint . --max-warnings=0 && echo "   ✅"
echo "3. Testes:" && npx vitest run && echo "   ✅"
echo "4. Cobertura:" && npx vitest run --coverage && echo "   ✅"
echo "5. Nenhum loadMetricsStore fora do data-hub:" && \
  rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
echo "6. Nenhum store.runs fora do data-hub:" && \
  rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
```

**Commit:** `docs(techdoc): update SSOT architecture — DataHub as mandatory single source of truth`

## Capítulo 11 — PENDING (do plano de 7 camadas, não coberto pelo SSOT original)

### 11.1 passRate SSOT (C.1-C.4)

| #    | File                       | Line | Status     |
| ---- | -------------------------- | ---- | ---------- |
| B.1  | artifact-parser.ts         | 30   | 🔜 Pending |
| B.2  | artifact-parser.ts         | 43   | 🔜 Pending |
| B.3  | json-exporter.ts           | 20   | 🔜 Pending |
| B.4  | github-provider.ts         | 170  | 🔜 Pending |
| B.5  | github-provider.ts         | 230  | 🔜 Pending |
| B.6  | gitlab-provider.ts         | 170  | 🔜 Pending |
| B.7  | gitlab-provider.ts         | 200  | 🔜 Pending |
| B.8  | junit-xml-parser.ts        | 170  | 🔜 Pending |
| B.9  | github-check-run.ts        | 78   | 🔜 Pending |
| B.10 | prompt-input-editor.ts     | 16   | 🔜 Pending |
| B.11 | Verify zero silent catches | —    | 🔜 Pending |

### Fase C — passRate SSOT Consolidation

| #   | File                        | Line | Status     |
| --- | --------------------------- | ---- | ---------- |
| C.1 | metrics-trends.ts           | 17   | 🔜 Pending |
| C.2 | report-html.ts              | 98   | 🔜 Pending |
| C.3 | health-score.ts             | 174  | 🔜 Pending |
| C.4 | Verify zero inline passRate | —    | 🔜 Pending |

### 11.2 coverage-source migration (E.1-E.3)

| E.1 | Create resolveCoverageForReport() in pr-report-core.ts | 🔜 Pending |
| E.2 | Replace resolveCoverage() call | 🔜 Pending |
| E.3 | Update 5 pr-report-core mocks | 🔜 Pending |

### Fase F — commitLog no DataHub

### 11.3 CommitLog em DataHub + case17 (F.1-F.8)

| #   | Task                                   | Status     |
| --- | -------------------------------------- | ---------- |
| F.1 | Add commitLog?: string to RawData      | 🔜 Pending |
| F.2 | Add fetchCommitLog?() to DataProvider  | 🔜 Pending |
| F.3 | Implement in GitHubDataProvider        | 🔜 Pending |
| F.4 | Implement in GitLabDataProvider        | 🔜 Pending |
| F.5 | Merge commitLog in hub.ts              | 🔜 Pending |
| F.6 | Migrate case17.ts to hub.raw.commitLog | 🔜 Pending |
| F.7 | Migrate case17-helpers.ts              | 🔜 Pending |
| F.8 | Update case17 tests                    | 🔜 Pending |
