# MAPA DE IMPACTO E PLANO DE IMPLEMENTAÇÃO — Reestruturação QA Tools

**Tipo:** Documento de **PLANEJAMENTO** (não execução).
**Fonte de verdade:** `dev/docs/plans/context-graph-insights-plan.md` (fases F0–F4).
**Base de evidência:** auditoria da codebase em 2026-08-05 (rg/tsc/vitest verificados).
**Retomabilidade:** auto-contido — glossário e racionais em `context-graph-insights-plan.md` §0.4–0.7.

---

## 0. DECISÕES CONFIRMADAS (2026-08-05)

**Princípio (confirmado):** cálculos e campos `computed.*` do DataHub **sobrevivem por padrão**; somente **renderers** são deletados. Cálculo e render **nunca** no mesmo arquivo. Remoção de cálculo exige **evidência de duplicação estrutural**.

| # | Decisão | Fonte de evidência |
|---|---------|--------------------|
| Q1 | **Deletar** `computeAiEffectiveness` + `convertGenerationRecordsToFeedback` (ambos em `shared/report/ai-effectiveness.ts`) + testes. **Manter** `computeAiMetrics` (`compute/ai-metrics.ts`) como SSOT | `computeAiMetrics` preenche `requirementScores`; `computeAiEffectiveness` sempre retorna `{}` nesse campo; `computeAiEffectiveness` conta deleted via `modificationReason==='deleted'` (bug) vs `computeAiMetrics` via `action==='deleted'` (correto); base de contagem diverge |
| Q2 | Criar `formatDuration` **único** em `shared/date-utils.ts` (sanitizado Rule 24, formato compacto testado: `30s`/`2m 5s`/`1h 1m`); `pipeline-cost-renderer.ts` e `pipeline-health-renderer.ts` importam; `pipeline-cost` passa a usar versão sanitizada | Duplicação: `pipeline-health-renderer.ts:102` vs `pipeline-cost-renderer.ts:27`; versão cost mostra `NaN m NaN s` para NaN (viola Rule 24); nenhum assert de formato verboso existe (L337-403) |
| Q3 | Migrar `computeCrossSquadBenchmark` + `BENCHMARK_PROVENANCE` + tipos → `compute/cross-squad-benchmark.ts`; **remover wrapper `computeCrossSquad`** (`compute/cross-squad.ts`) que fabrica vazio via `computeCrossSquadBenchmark(undefined)` (viola Rule 25); `computed.crossSquad` fica `undefined` | `compute/cross-squad.ts:22-26` wrapper órfão fabrica resultado; hub `:916` alimenta campo que nenhum renderer sobrevivente consome |

**Pendências resolvidas (2026-08-05, instrução explícita: "solução tecnicamente superior — tempo/esforço não são variáveis"):**

| # | Questão | Solução tecnicamente superior | Evidência |
|---|---------|------------------------------|-----------|
| P-1 | `extractErrorMessages` — migrar p/ `shared/primitives/` ou acompanhar deleção? | **Acompanhar deleção (deletar).** Não é um cálculo de domínio derivado do DataHub — é helper de render de logs (regex local `ERROR_LOG_PATTERN`, `pipeline-health-renderer.ts:9`). Zero consumidores produtivos (grep: só o renderer deletado + testes). Migrar para primitives = código órfão (viola zero-deadcode); export via barrel esconderia o órfão do gate `unused-exports` = bypass. Nenhum sobrevivente (`failure-analysis.ts`, `prompt-errors.ts`) tem o mesmo padrão para consolidar | `rg "extractErrorMessages"` → apenas `pipeline-health-renderer.ts` + `pipeline-health.test.ts` |
| P-2/F-1 | `case17.ts` — o que sobrevive? | **Manter case17 inteiro (função própria).** A premissa "remoção do report-html" é falsa: `report-html.ts` é **infra preservada** (barrel `report-generator.ts` → `report-html.ts`). case17 importa apenas infra preservada + computeds preservados (`calcFlakinessEntries`, `calcRunPassRate`, `failure-analysis`, `bug-report`) — **nenhum** dos 9 deletados. Nada a remover | `case17.ts:12-38` imports; `report-generator.ts` = barrel 3 linhas |
| P-2/F-2 | `pr-report` em CI — remoção total ou reconstrução? | **Reconstruir como insight F1.3 (manter job CI + `PrReportFeatureConfig`).** pr-report é 1 dos 3 pilotos de reconstrução (D3 vinculante); specs 2025/2122/2164 permanecem (plano §0.5:459); entry point único `main.ts pr-report` → `pr-report-core.ts` (G1). Remover o job agora = estado parcial/transitório (viola Regra 7) para re-adicionar depois | `qa-post-process-workflow.ts:49`; `github-ci.ts:82`; `gitlab-ci.ts:26`; `feature-config.ts` `PrReportFeatureConfig` |
| P-2/F-3 | `pipeline-health` deletado e não reconstruído? | **Sim — deletado, NÃO reconstruído.** Todos os dados que renderiza (`passRate`, `avgDurationSec`, `topFailingJobs`, `topFailureReasons`, `branchBreakdown`) são computeds SOBREVIVENTES já consumidos por outros sobreviventes (`impact-alerts.ts:23` consome `topFailingJobs`; `interactive-mode.ts:637-655` já exibe os mesmos no resumo do hub). Reconstruir = duplicação estrutural de dados já cobertos (viola SRP/anti-duplicação) | `compute/index.ts:10-11`; `impact-alerts.ts:23`; `interactive-mode.ts:637-655`; spec 1752 na lista de 9 |
| P-3 | `computed.aiComparison` — sai do tipo `ComputedMetrics` na F0.8? | **Campo PERMANECE no tipo, valor `undefined`.** Consistência com `crossSquad` (Q3): fluxos equivalentes tratados igualmente (Regra 7); `compareAiVsManual` sobrevive (migrado p/ `compute/ai-comparison.ts`) e o campo é seu contrato de saída; princípio "campos sobrevivem por padrão"; `undefined` = ausência explícita (Rule 25.2), não silenciamento. Remoção exigiria evidência de duplicação — inexistente | `hub.test.ts:364-369` (no-data); consumidores `interactive-mode.ts:419` + `schedule-handler.ts:167` (deletados); nenhum sobrevivente consome |

---

## 1. MAPA DE IMPACTO

### 1.1 Visão geral — o que é deletado, migrado ou preservado

| Tipo | Artefatos | Destino |
|------|-----------|---------|
| **Deletar — renderers** (9) | ai-effectiveness, ai-comparison, cross-squad-benchmark, requirement-score, traceability, flakiness, suite-optimization, silent-regression, pipeline-health | Remoção dos **renderers** (HTML), specs, fixtures sintéticas, testes de render, handlers de orquestração |
| **Migrar — cálculos p/ compute layer** | `compareAiVsManual`, `computeCrossSquadBenchmark`+`BENCHMARK_PROVENANCE`, `calculateRequirementScores` | Mudam de `shared/report/*`/`shared/quality/*` para `shared/data-hub/compute/*` (Q3 + princípio) |
| **Preservar — cálculos** | `computeAiMetrics`, `detectSilentRegressions`, `computeOptimizationActions`, `computeTraceabilityTree`, `calcFlakinessEntries`+`flaky-rate`+`flaky-percentage`+`retry-flaky`+`metrics-trends`, `aggregateDefectSeasonality`, `computePipelineCostResult` | Intactos no compute layer (consumidos por hub/health-score/cases/report-chart) |
| **Reconstruir** (2) | coverage-gap, pr-report (html/markdown/job-summary) | Preservar dados no DataHub; extrair `generateXInsights` na Fase 1 |
| **Preservar** (8) | release-score, defect-trend, defect-seasonality, developer-profile, backlog-health, impact-alert, incident-report, pipeline-cost | Intactos; migram para consumir insights (F1.4) |
| **Infra preservada** | report-html.ts, report-styles, report-sections, report-table, report-utils, report-export, report-validator, report-generator, primitives/ (não-deletados), icons.ts, publish.ts | Não tocados — infraestrutura compartilhada |

### 1.2 Arquivos de origem a DELETAR (renderers, por artefato)

| Artefato | Arquivos de origem a deletar | Cálculo (destino) |
|----------|-----------------------------|-------------------|
| ai-effectiveness | `shared/report/ai-effectiveness.ts` (L29 `computeAiEffectiveness`, L108 `convertGenerationRecordsToFeedback`, re-export `generateAiEffectivenessHtml`), `shared/report/ai-effectiveness-renderer.ts` | **PRESERVADO** `compute/ai-metrics.ts` (`computeAiMetrics` SSOT — Q1) |
| ai-comparison | `shared/report/ai-comparison-renderer.ts` | `compareAiVsManual` (`ai-comparison.ts:61`, consumido por `hub.ts:99,932`) → **MIGRAR** p/ `compute/ai-comparison.ts`; campo `computed.aiComparison` não é mais fabricado e **PERMANECE no tipo** = `undefined` (P-3 resolvido) |
| cross-squad-benchmark | `shared/quality/cross-squad-benchmark-renderer.ts`, **wrapper** `compute/cross-squad.ts` (Q3 — fabrica vazio) | `computeCrossSquadBenchmark` + `BENCHMARK_PROVENANCE` (`cross-squad-benchmark.ts:19,55`) → **MIGRAR** p/ `compute/cross-squad-benchmark.ts`; `computed.crossSquad` → `undefined` |
| requirement-score | `shared/quality/requirement-score-renderer.ts` | `calculateRequirementScores` (`requirement-score.ts:119`, consumido por `schedule-handler.ts:162`, `interactive-mode.ts:548`) → **MIGRAR** p/ `compute/requirement-score.ts` |
| traceability | `shared/report/traceability-matrix.ts`, `shared/report/traceability-renderer.ts` | **PRESERVADOS** `compute/traceability-tree.ts`, `shared/primitives/traceability.ts` (L75 bug run errada — F0.8) |
| flakiness | `shared/report/flakiness-dashboard.ts`, `shared/report/flakiness-renderer.ts` (acoplados em ciclo: dashboard re-exporta `generateFlakinessHtml` do renderer, renderer importa `filterHighFlakiness`/`validateThresholds` do dashboard — deletar os dois juntos) | **NENHUM — os compute modules SOBREVIVEM** (`flakiness-entries.ts`, `flaky-rate.ts`, `flaky-percentage.ts`, `retry-flaky.ts`, `metrics-trends.ts`): usados por `health-score.ts`, `case17/19/22`, `failure-analysis.ts`, `report-chart.ts`, `quality-gate.ts`, `hub.ts` |
| suite-optimization | `shared/quality/suite-optimization.ts`, `shared/quality/suite-optimization-renderer.ts` | **PRESERVADO** `compute/optimization-actions.ts` (`computeOptimizationActions`) |
| silent-regression | `shared/quality/silent-regression.ts`, `shared/quality/silent-regression-renderer.ts` | **PRESERVADO** `compute/regression-detection.ts` (`detectSilentRegressions`) — consumido por `computeIncidentEvents` (`incident-events.ts:23`, incident-report sobrevive) |
| pipeline-health | `git_triggers/pipeline-health-renderer.ts` (L33 `extractErrorMessages` [P-1], L102 `formatDuration` [Q2]) | `formatDuration` → **unificar** em `shared/date-utils.ts` (Q2); `pipeline-cost-renderer.ts` passa a importar. **P-1 resolvido:** `extractErrorMessages` **acompanha a deleção** (zero consumidor produtivo; helper de render, não cálculo de domínio). **F-3 resolvido:** pipeline-health deletado e **NÃO reconstruído** (dados todos sobreviventes, já cobertos por impact-alert + interactive-mode) |

### 1.3 Consumidores de produção (imports de artefatos deletados)

| Consumidor | Arquivo:linha | Imports deletados |
|-----------|--------------|-------------------|
| `git_triggers/interactive-mode.ts` | :80-95 | generateTraceabilityHtml (:80), generateAiEffectivenessHtml (:81), generateSilentRegressionHtml (:83), generateAiComparisonHtml (:84), generateBenchmarkHtml (:85), generateOptimizationHtml (:87), generateRequirementScoreHtml (:92); handlers `_dashboardXxx` L380-550 (7) |
| `git_triggers/schedule-handler.ts` | :9-27 | generateAiEffectivenessHtml, generateTraceabilityHtml, generateFlakinessHtml, generateSilentRegressionHtml, generateBenchmarkHtml, generateOptimizationHtml, generateRequirementScoreHtml |
| `git_triggers/batch-mode.ts` | :9,16-17 | generateFlakinessHtml, renderPipelineHealthHtml (+ `generateFlakinessDashboard` :257, `generatePipelineHealthReport` :420, `handlePipelineHealth` :464, `generatePrReportIfNeeded` :130) |
| `jira_management/commands/case25.ts` | :2 | buildTraceabilityMatrix, generateTraceabilityHtml (deletar arquivo inteiro) |
| `scripts/artifact-scorecard-runner.ts` | :24-61,125-208 | generateAiEffectivenessHtml, generateAiComparisonHtml, generateBenchmarkHtml, generateRequirementScoreHtml, generateTraceabilityHtml, generateFlakinessHtml, generateOptimizationHtml, generateSilentRegressionHtml, renderPipelineHealthHtml |
| `scripts/artifact-validation-harness.ts` | :15-53,100-220 | mesmos 9 |
| `scripts/quality-check.ts` | :406-435 | checks de exports dos 9 deletados |
| `e2e/smoke-pipeline.ts` | :6 | generateFlakinessHtml |

### 1.4 Camada de dados (hub.ts + compute + types)

| Arquivo | Alteração |
|---------|-----------|
| `shared/data-hub/hub.ts` | **PRESERVAR TODOS** os computes: :895 `regressionDetection`, :896 `aiMetrics`, :897-899 `optimizationActions`, :912 `traceabilityTree`, :867 `flakinessEntries`, :893-894, :933 (sobreviventes). **REMOVER** :99 import `compareAiVsManual` + :932 `aiComparison = compareAiVsManual(null)` (fabrica vazio — Rule 25, P-3) e :916 `crossSquad = computeCrossSquad(...)` (Q3 — wrapper removido, campo fica `undefined`) |
| `shared/data-hub/compute/index.ts` | **PRESERVAR** re-exports :24-25,30,33-36,38,41-42 (flakiness, ai-metrics, regression-detection, optimization-actions, traceability-tree, etc.). **REMOVER** :40 `computeCrossSquad` (wrapper Q3). **ADICIONAR** re-exports de `computeCrossSquadBenchmark` (de `compute/cross-squad-benchmark.ts`), `compareAiVsManual` (de `compute/ai-comparison.ts`), `calculateRequirementScores` (de `compute/requirement-score.ts`) |
| `shared/data-hub/compute/cross-squad.ts` | **DELETAR** (wrapper órfão :22-26 que fabrica vazio — Q3) |
| `shared/data-hub/compute/cross-squad-benchmark.ts` | **NOVO** (Q3) — `computeCrossSquadBenchmark` + `BENCHMARK_PROVENANCE` + tipos migrados de `shared/quality/cross-squad-benchmark.ts` |
| `shared/data-hub/compute/ai-comparison.ts` | **NOVO** — `compareAiVsManual` migrado de `shared/report/ai-comparison.ts` |
| `shared/data-hub/compute/requirement-score.ts` | **NOVO** — `calculateRequirementScores` migrado de `shared/quality/requirement-score.ts` |
| `shared/types/data-hub.ts` | :790 `aiMetrics`, :796 `regressionDetection`, :798 `optimizationActions`, :804 `traceabilityTree`, :806 `crossSquad`, :815 `aiComparison`, :770 `flakinessEntries` — **PRESERVAR TODOS** (princípio). **P-3 resolvido:** `aiComparison`/`crossSquad` **permanecem no tipo** como `undefined` (consistência Q3/crossSquad; contrato de saída do cálculo migrado; Rule 25.2 ausência explícita) |
| `shared/types/data-hub-extensions.ts` | **PRESERVAR** `AiMetricsResult`, `RegressionDetectionResult`, `OptimizationResult` etc. (tipos dos computeds sobreviventes) |

### 1.5 Fixtures e specs

| Tipo | Arquivos | Ação |
|------|----------|------|
| Specs | `shared/types/artifact-specs.ts` (IDs 93, 207, 963, 1469, 496, 591, 867, 1152, 1752) | remover 9 |
| Fixtures sintéticas | `scripts/__fixtures__/artefactos/{ai-effectiveness,ai-comparison,cross-squad-benchmark,requirement-score,traceability,flakiness,suite-optimization,silent-regression}.json` | remover 8 |
| Fixtures preservadas | `backlog-health.json`, `defect-seasonality.json`, `defect-trend.json`, `developer-profile.json`, `impact-alert.json`, `incident-report.json`, `pipeline-cost.json`, `release-score.json`, `coverage-gap.json` | preservar (reconstruídos consomem) |

### 1.6 Testes a remover/reescrever/migrar

**Remover (testes de renderers deletados):**
- `shared/__tests__/ai-effectiveness*.test.ts` (2), `ai-comparison*.test.ts` (2 — só partes de render), `traceability*.test.ts` (4 — só partes de render), `flakiness-dashboard*.test.ts` (2), `suite-optimization*.test.ts` (2), `silent-regression*.test.ts` (2), `cross-squad*.test.ts` (3 — só partes de render), `requirement-score*.test.ts` (2 — só partes de render)
- `shared/__tests__/integration/ai-effectiveness.integration.test.ts`, `ai-comparison.integration.test.ts`, `traceability-matrix.integration.test.ts`, `traceability-tree.integration.test.ts`, `flakiness-dashboard.integration.test.ts`, `suite-optimization.integration.test.ts`, `silent-regression.integration.test.ts`, `cross-squad-benchmark.integration.test.ts`, `cross-squad.integration.test.ts`, `requirement-score.integration.test.ts`
- `git_triggers/__tests__/pipeline-health.test.ts`, `pipeline-health-html.property.test.ts`, `git_triggers/__tests__/integration/pipeline-health.integration.test.ts`

**Migrar (testes de cálculos que sobrevivem):**
- `shared/__tests__/ai-metrics.test.ts` — PRESERVAR (computeAiMetrics SSOT)
- `shared/__tests__/cross-squad-benchmark.test.ts`, `cross-squad-benchmark.property.test.ts` — migrar só os testes de `computeCrossSquadBenchmark` (não de render) p/ `compute/`
- `shared/__tests__/ai-comparison.test.ts`, `ai-comparison.property.test.ts` — migrar só os testes de `compareAiVsManual` p/ `compute/`
- `shared/__tests__/requirement-score.test.ts`, `requirement-score.property.test.ts` — migrar só os testes de `calculateRequirementScores` p/ `compute/`
- Testes de `formatDuration` (pipeline-health.test.ts:63-75) — mover para `shared/__tests__/date-utils.test.ts` (Q2, sanitizado)

**Reescrever com oráculo de requisito (F0.8):**
- `shared/__tests__/pr-report-core.test.ts:604-608` — "SSOT deliberately disagrees" (expectativa codifica bug)
- `shared/__tests__/report-html.test.ts:232` — fixou `0.0%` como correto
- Testes dos bugs de dados: `traceability.ts:75` (run errada), `flakiness-renderer.ts:40,86,247` (denominador), `metrics-runs.ts:48` (newest-first)

**Atualizar (testes de consumidores):**
- `git_triggers/__tests__/interactive-mode.test.ts` (vi.mock dos 7 deletados), `schedule-handler.test.ts` (vi.mock + expect de seções), `batch-mode.test.ts`, `integration-handlers.test.ts`, `session-state.test.ts`
- `scripts/__tests__/artifact-scorecard-runner.test.ts` (lista HTML_RENDERABLE_SPECS), `scripts/__tests__/artifact-fixtures.test.ts`
- `shared/__tests__/artifact-content-validation.test.ts` (makeOptimization/makeSilentRegression, specIds :496-534)
- `shared/__tests__/report-styles.test.ts` (:73-86 pipeline-health CSS)
- `shared/__tests__/report-determinism.architecture.test.ts` (:33-42 arquivos deletados)
- `shared/__tests__/pr-report-core.hooks.test.ts` (:30-48 lista de dashboards)
- `shared/data-hub/__tests__/hub.test.ts` (:364-369 aiComparison no-data — passa a esperar `undefined` por P-3)
- `shared/data-hub/__tests__/compute/retry-flaky.test.ts` (se usa flaky — verificar)

### 1.7 CI, templates e docs

| Tipo | Arquivos |
|------|----------|
| CI templates | `setup/templates/qa-post-process-workflow.ts`, `gitlab-ci.ts`, `github-ci.ts` (G2: editar template + regenerar, nunca o `.yml`) |
| Docs (fora lixo) | `docs/00-install.md`, `docs/02-jira-management.md`, `docs/03-git-triggers.md`, `docs/TECHDOC.md`, `docs/08-fluxos-completos.md`, `dev/docs/internal/{HTML-CSS-HOOKS,HTML-CSS-HOOKS-AUDIT,visual-validation-checklist,VALIDATION-REPORT,ARTIFACT-VALIDATION,content-validation-report}.md` |
| Scripts | `scripts/artifact-fixtures.ts` (lista de ids) |

### 1.8 Dependências entre artefatos deletados (gráfico de imports)

```
interactive-mode.ts ─┬→ traceability-matrix.ts → compute/traceability-tree.ts [PRESERVADO] → primitives/traceability.ts [PRESERVADO]
                     ├→ ai-effectiveness.ts → compute/ai-metrics.ts [PRESERVADO, SSOT Q1]
                     ├→ ai-comparison.ts → (compareAiVsManual) [MIGRA p/ compute]
                     ├→ cross-squad-benchmark.ts → compute/cross-squad.ts [WRAPPER DELETADO Q3] → quality/cross-squad-benchmark.ts [CALC MIGRA p/ compute]
                     ├→ suite-optimization.ts → compute/optimization-actions.ts [PRESERVADO]
                     ├→ silent-regression.ts → compute/regression-detection.ts [PRESERVADO]
                     └→ requirement-score.ts [CALC MIGRA p/ compute]
schedule-handler.ts → (mesmos 7 + flakiness-dashboard.ts → compute/flakiness-entries.ts [PRESERVADO])
batch-mode.ts → flakiness-dashboard.ts, pipeline-health-renderer.ts
scripts/{quality-check,scorecard-runner,validation-harness} → todos os 9
case25.ts → traceability-matrix.ts
```

**Regra de ouro da deleção (hub-first):** remover a partir da base (primitives → compute → renderers) para cima (orquestradores → scripts), nunca o inverso. Ver F0.3–F0.8 do plano. **Cálculos preservados/migrados NUNCA são removidos por estarem "sem render".**

---

## 2. PASSO A PASSO DA IMPLEMENTAÇÃO

> Ordem: **base → produtores → consumidores → orquestradores → scripts/CI → specs/fixtures → testes → docs**. Cada passo termina com gate verde (tsc + vitest + lint).

### 2.1 Etapa 0 — Baseline (1 tarefa)

| # | Ação | Verificação |
|---|------|-------------|
| S0.1 | Rodar os 8 comandos de baseline e registrar no PROGRESS | tsc, vitest, lint, depcruise, unused-exports, type-coverage, no-swallow, audit-suppressions |

### 2.2 Etapa 1 — Camada de dados (3 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S1.1 | **Migrar cálculos p/ compute**: criar `compute/cross-squad-benchmark.ts` (Q3), `compute/ai-comparison.ts`, `compute/requirement-score.ts`; remover wrapper `compute/cross-squad.ts`; remover re-export `computeCrossSquad` de `compute/index.ts`; adicionar novos re-exports | `compute/*` (novos), `compute/cross-squad.ts` (delete), `compute/index.ts` | `rg "computeCrossSquad\b"` = 0 em produção; tsc limpo; `computeCrossSquadBenchmark`/`compareAiVsManual`/`calculateRequirementScores` resolvem de `compute/` |
| S1.2 | Remover fabricações do hub + atualizar types: remover `:99` import + `:932` `compareAiVsManual(null)` (P-3), remover `:916` `computeCrossSquad(...)`; campos `aiComparison`/`crossSquad` ficam `undefined`; **NÃO remover** nenhum field de `ComputedMetrics` | `hub.ts` (:99, :916, :932), `types/data-hub.ts` | `rg "compareAiVsManual|crossSquad"` em `hub.ts` = 0; campos sobreviventes ainda lidos por sobreviventes (`flakinessEntries` em pr-report-core/session-state/case17) |
| S1.3 | **Q2** — adicionar `formatDuration` sanitizado a `shared/date-utils.ts` + testes (`30s`/`2m 5s`/`1h 1m`, NaN/Infinity/negativo rejeitados Rule 24); `pipeline-cost-renderer.ts` passa a importar; `pipeline-health-renderer.ts` (antes de ser deletado) referencia o mesmo | `shared/date-utils.ts`, `shared/quality/pipeline-cost-renderer.ts`, `shared/__tests__/date-utils.test.ts` | `vitest shared/__tests__/date-utils.test.ts` verde; `rg "function formatDuration"` em produção = 1 (só date-utils) |

### 2.3 Etapa 2 — Casos Jira (3 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S2.1 | Deletar case25 (wrapper puro de traceability) | `jira_management/commands/case25.ts` | arquivo ausente; nenhum `case25` em `jira_management/` |
| S2.2 | Refatorar case17 — **F-1 resolvido: manter inteiro** (nenhum import dos 9 deletados; `report-html` é infra preservada; computeds usados são sobreviventes). Verificar `case17.ts:12-38` | `case17.ts` | caso passa testes; sem import de nenhum dos 9 deletados |
| S2.3 | Refatorar case21/27 — manter CLI, remover export HTML (coverage-gap reconstruído) | `case21.ts`, `case27.ts` | CLI funciona; HTML passa a consumir insight (F1.2) |

### 2.4 Etapa 3 — Orquestradores (3 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S3.1 | Podar interactive-mode: remover 7 imports (:80-95) + 7 handlers `_dashboardXxx` (:380-550) + 7 entries de menu | `interactive-mode.ts` | menu expõe só os 8 sobreviventes + quality-gate + coverage-gap |
| S3.2 | Podar schedule-handler: remover 8 imports + 9 seções (usava `calculateRequirementScores` :162 — migrado) | `schedule-handler.ts` | seções deletadas ausentes; relatório semanal intacto |
| S3.3 | Podar batch-mode: remover `generateFlakinessDashboard`, `generatePipelineHealthReport`, `handlePipelineHealth`, import de pipeline-health-renderer; **F-2 resolvido: `generatePrReportIfNeeded` PERMANECE** (pr-report reconstruído como insight F1.3; job CI + `PrReportFeatureConfig` mantidos) | `batch-mode.ts` | `rg "flakiness-dashboard|pipeline-health"` em `git_triggers/` = 0 |

### 2.5 Etapa 4 — Scripts CI/harness (2 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S4.1 | quality-check: remover checks dos 9 deletados (:412-435) | `scripts/quality-check.ts` | `npm run lint` verde |
| S4.2 | scorecard-runner + validation-harness: remover 9 renders, atualizar fixtures | `artifact-scorecard-runner.ts`, `artifact-validation-harness.ts`, `scripts/__tests__/artifact-fixtures.test.ts` | scorecard avalia 8 sobreviventes + coverage-gap + pr-report |

### 2.6 Etapa 5 — Specs e fixtures (2 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S5.1 | Remover 9 specs | `shared/types/artifact-specs.ts` (IDs 93,207,496,591,867,963,1152,1469,1752) | loop `rg "id: '<deletado>'"` retorna vazio |
| S5.2 | Remover 8 fixtures sintéticas | `scripts/__fixtures__/artefactos/` | `ls` sem os 8 |

### 2.7 Etapa 6 — Testes (4 tarefas)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S6.1 | Remover testes de renderers deletados; **migrar** testes de cálculos sobreviventes p/ `compute/` (lista §1.6) | ~23 arquivos de teste + novos em `compute/` | `vitest` verde sem eles e com os migrados |
| S6.2 | Atualizar testes de consumidores (vi.mock, listas, CSS, determinismo) | interactive-mode.test.ts, schedule-handler.test.ts, batch-mode.test.ts, integration-handlers.test.ts, session-state.test.ts, artifact-scorecard-runner.test.ts, artifact-fixtures.test.ts, artifact-content-validation.test.ts, report-styles.test.ts, report-determinism.architecture.test.ts, pr-report-core.hooks.test.ts, hub.test.ts | todos verdes |
| S6.3 | **F0.8 (oráculos)**: reescrever com oráculo de requisito + RED do bug (Regra 19.11) → corrigir implementação | pr-report-core.test.ts:604-608, report-html.test.ts:232, traceability.ts:75, flakiness-renderer.ts:40,86,247, metrics-runs.ts:48 | bug reproduzido → corrigido na origem |
| S6.4 | **P-1 resolvido** — `extractErrorMessages` **acompanha a deleção** (zero consumidor produtivo; não é cálculo de domínio; evitar código órfão em primitives) | deleção em `pipeline-health-renderer.ts` | decisão registrada; gate verde |

### 2.8 Etapa 7 — CI templates (1 tarefa)

| # | Ação | Arquivos | Verificação |
|---|------|----------|-------------|
| S7.1 | **F-2 resolvido: manter** job `pr-report` nos templates (reconstrução F1.3); remover só `flakiness`/`pipeline-health`; regenerar via wizard; **nunca** editar `.yml` gerado | `setup/templates/qa-post-process-workflow.ts`, `gitlab-ci.ts`, `github-ci.ts` | `rg "flakiness|pipeline-health"` em templates = 0; `pr-report` presente |

### 2.9 Etapa 8 — Docs (1 tarefa)

| # | Ação | Verificação |
|---|------|-------------|
| S8.1 | Sanear referências nos docs (lista §1.7) | `rg "deletado"` em docs = 0 (exceto referência histórica em lixo/) |

### 2.10 Etapa 9 — Fases F1–F4 (novas camadas, ver plano principal)

| Fase | Foco | Saída |
|------|------|-------|
| F1 | Camada de insights (contrato + 3 pilotos + migração renderers + fixtures reais) | `shared/insights/*` |
| F2 | Graph builder (PoC PAY-431 → schema → builder → store → queries) | `shared/graph/*` |
| F3 | SPA React (server layer, Home, entidade, correlação, insights, busca, a11y) | `ui/*`, `git_triggers/ui.ts` |
| F4 | Search semântico (go/no-go explícito) | `shared/search/*` |

---

## 3. ESTRATÉGIA DE SANITIZAÇÃO

### 3.1 Princípios (AGENTS.md)

- **Zero deadcode:** arquivos sem consumidor produtivo são removidos, não comentados.
- **Zero resquício:** após deleção, `rg` de cada nome deletado retorna **0 resultados** no código de produção.
- **Zero oráculo contaminado:** nenhum teste codifica valor bugado como correto (Regra 19.3/19.5).
- **Sem camadas mortas:** `compute/*` preservado não deixa renderer fantasma; renderer deletado não deixa import órfão.
- **Cálculo sobrevive por padrão:** nenhum compute é removido sem evidência de duplicação estrutural (Q1 foi a única exceção aceita).

### 3.2 Categorias de sanitização

| Categoria | Ação | Exemplo |
|-----------|------|---------|
| **Deadcode de renderer** | Remover arquivo de render + re-export + import | `ai-effectiveness-renderer.ts`, `flakiness-renderer.ts` |
| **Wrapper fabricador** | Remover wrapper que fabrica resultado vazio (Rule 25) | `compute/cross-squad.ts` (Q3) |
| **Cálculo migrado** | Mover função + tipos + testes para `compute/`, remover do arquivo de render | `computeCrossSquadBenchmark`, `compareAiVsManual`, `calculateRequirementScores` |
| **Deadcode de consumidor** | Remover import + função + entry de menu/seção | handlers `_dashboardAiEffectiveness` etc. |
| **Fabricação no hub** | Remover chamada que fabrica campo vazio; campo fica `undefined` | `hub.ts:932 compareAiVsManual(null)` |
| **Fixture órfã** | Remover JSON sintético | `scripts/__fixtures__/artefactos/ai-effectiveness.json` |
| **Spec órfã** | Remover entrada de `artifact-specs.ts` | IDs 93, 207, ... |
| **Teste de render deletado** | Remover arquivo de teste inteiro (ou só partes de render) | `shared/__tests__/ai-effectiveness.test.ts` |
| **Teste de consumidor com mock de deletado** | Remover `vi.mock` + asserções da seção | `interactive-mode.test.ts:146-315` |
| **Oráculo contaminado** | **Nunca** alterar expectativa para passar — reescrever com oráculo de requisito + corrigir implementação | `pr-report-core.test.ts:604-608` |
| **Doc com referência morta** | Remover seção/linha que descreve artefato deletado | `docs/02-jira-management.md` case25 |
| **Import do hub não usado** | Remover do bloco de imports | `hub.ts:95 compareAiVsManual` |

### 3.3 Checklist de sanitização por artefato deletado

Para **cada** um dos 9 (`ai-effectiveness`, `ai-comparison`, `cross-squad-benchmark`, `requirement-score`, `traceability`, `flakiness`, `suite-optimization`, `silent-regression`, `pipeline-health`):

```
[ ] Renderer (shared/report/* ou shared/quality/* ou git_triggers/*) removido
[ ] Cálculo embutido no arquivo de render analisado: preservado (compute/ ou primitives/) OU removido só com evidência de duplicação (ex.: Q1)
[ ] Wrapper fabricador removido (ex.: compute/cross-squad.ts)
[ ] imports removidos em interactive-mode, schedule-handler, batch-mode, scripts/*, e2e/*
[ ] handlers/menu/seções removidos
[ ] NENHUM field removido de ComputedMetrics sem evidência; fabricações no hub removidas (campos ficam undefined)
[ ] spec removida de artifact-specs.ts
[ ] fixture sintética removida
[ ] arquivos de teste de render removidos; testes de cálculo migrados p/ compute/; mocks em testes de consumidores removidos
[ ] docs saneadas
[ ] `rg "<nome>"` em produção = 0 (fora de dev/docs/archive/lixo/ e este documento)
```

### 3.4 Riscos de sanitização (o que NÃO remover)

| Cuidado | Razão |
|---------|-------|
| `shared/primitives/traceability.ts` | **PRESERVAR** — consumido por `compute/traceability-tree.ts` (sobrevivente) e caso F1. Corrigir bug :75 na F0.8 |
| `shared/data-hub/compute/flakiness-entries.ts` (`calcFlakinessEntries`) | **NÃO deletar.** Consumido por case17:193, case19:38, case22:64, schedule-handler:339, batch-mode:267, smoke-pipeline:122 — todos sobreviventes. O renderer HTML é que é deletado |
| `shared/data-hub/compute/flaky-rate.ts`, `flaky-percentage.ts`, `retry-flaky.ts`, `metrics-trends.ts` | **NÃO deletar.** `flaky-rate`+`flaky-percentage` → `health-score.ts:22-23,239-240`; `retry-flaky` → `hub.ts:81,873`; `metrics-trends` → `case19.ts:6` e `report-chart.ts` (infra sobrevivente) |
| `shared/data-hub/compute/ai-metrics.ts` | **PRESERVAR (Q1)** — `computeAiMetrics` é o SSOT; o deletado é `computeAiEffectiveness` (duplicação). Único consumer produtivo: `hub.ts:896` |
| `shared/data-hub/compute/cross-squad.ts` | **DELETAR (Q3)** — wrapper órfão que fabrica vazio via `computeCrossSquadBenchmark(undefined)`; a função real migra para `compute/cross-squad-benchmark.ts` |
| `shared/data-hub/compute/regression-detection.ts`, `optimization-actions.ts`, `traceability-tree.ts` | **NÃO deletar** — cálculos preservados por princípio; `detectSilentRegressions` ainda alimenta `computeIncidentEvents` (`incident-events.ts:23`, incident-report sobrevive) |
| `shared/data-hub/compute/defect-aggregation.ts` | **NÃO deletar.** Serve defect-trend E defect-seasonality (ambos sobreviventes) |
| `shared/data-hub/compute/pipeline-cost.ts`, `defect-seasonality.ts` | **NÃO deletar** — `aggregateDefectSeasonality`/`computePipelineCostResult` são usados por sobreviventes |
| `shared/data-hub/compute/metrics-runs.ts` | **NÃO deletar** — base de toda a hub; corrigir bug :48 (newest-first) na F0.8 |
| `shared/quality/failure-analysis.ts` | **NÃO deletar** — usado por `bug-report.ts:8` (case17), `llm-review-prompts.ts`, `llm-benchmark.ts` |
| `shared/report/ai-comparison.ts` L61 `compareAiVsManual` | **NÃO deletar** — migrar p/ `compute/ai-comparison.ts` (consumido por `hub.ts:99,932`); só o render é deletado |

> **Regra:** separar **cálculo** (preservar ou migrar para compute/) de **render** (o que é deletado). A auditoria antes de cada deleção é obrigatória.

---

## 4. PLANO DE AUDITORIA

### 4.1 Critérios objetivos de "100% funcional"

| # | Critério | Evidência |
|---|----------|-----------|
| A1 | Nenhum renderer deletado é referenciado em código de produção | `for id in <9>; do rg "$id" --glob '!**/__tests__/**' --glob '!dev/docs/**' --glob '!docs/**'; done` = 0 |
| A2 | Nenhum spec órfã em artifact-specs.ts | loop `rg "id: '<deletado>'"` = 0 |
| A3 | Nenhuma fixture sintética de deletado | `ls scripts/__fixtures__/artefactos/` sem os 8 |
| A4 | Nenhum campo `computed.*` removido sem evidência; fabricações do hub removidas | `rg "compareAiVsManual\(|computeCrossSquad\(" hub.ts` = 0; `rg "computed.(aiMetrics|regressionDetection|optimizationActions|traceabilityTree|flakinessEntries)" shared/ git_triggers/ jira_management/` retorna consumidores sobreviventes |
| A5 | Menu expõe só os 8 sobreviventes + coverage-gap | `interactive-mode.ts:704+` — 10 entries |
| A6 | Schedule sem seções deletadas | `schedule-handler.ts` — `rg "data-section=\""` só sobreviventes |
| A7 | batch-mode sem `flakiness-dashboard`/`pipeline-health` | `rg` = 0 |
| A8 | Renderers sobreviventes não calculam dados próprios | `rg "compute|aggregate|calculate" shared/report/*-renderer.ts` (auditoria F1.4) |
| A9 | Oráculos saneados — nenhum teste codifica valor bugado | `rg "deliberately disagrees|0\.0%" shared/__tests__/` = 0 (após correção) |
| A10 | Bugs de dados corrigidos na origem (não no render) | teste reproduz bug → correção em traceability.ts/flakiness-renderer.ts/metrics-runs.ts |
| A11 | `formatDuration` único e sanitizado | `rg "function formatDuration"` em produção = 1 (`date-utils.ts`); NaN/Infinity/negativo rejeitados (Rule 24) |
| A12 | Cálculos migrados resolvem de `compute/` (nenhum import residual de `quality/`/`report/` para eles) | `rg "from '.*(quality|cross-squad-benchmark|requirement-score|ai-comparison).*'"` sem referência a funções migradas |

### 4.2 Gate de qualidade (por tarefa e por fase)

```
npx tsc --noEmit              # zero erros
npx vitest run                # todos verdes
npm run lint                  # quality-check + lint rules
npm run depcruise             # sem violação de layering (G1–G5)
npm run unused-exports        # zero exports órfãos (detecta deadcode)
npm run type-coverage         # ≥ 95%
npm run no-swallow            # zero silenciamento
npm run audit-suppressions    # zero novas supressões
```

### 4.3 Auditoria de implementação planejada (não só testes)

| O quê | Comando |
|-------|---------|
| Import órfão removido | `rg "from '.*(ai-|traceability|flakiness|cross-squad|suite-optimization|silent-regression|requirement-score|pipeline-health)" shared/ git_triggers/ jira_management/ scripts/ e2e/` = 0 (exceto computeds migrados) |
| Arquivo deletado inexistente | `test -f <arquivo>` → false |
| Menu podado | `rg "dashboardEntries|menuItems" interactive-mode.ts` + contagem |
| CI template regenerado | `setup/` gerou `.yml` sem job de deletado |
| Sobre a fundação de dados | `npx vitest run shared/data-hub` + `scripts/__tests__/artifact-scorecard-runner.test.ts` |

### 4.4 Validação de não-regressão dos sobreviventes

Após cada etapa, os 8 sobreviventes + infra devem permanecer funcionais:

```
npx vitest run shared/__tests__/artifact-content-validation.test.ts   # conteúdo
npx vitest run shared/__tests__/report-determinism.architecture.test.ts  # determinismo
npx vitest run shared/__tests__/integration/{defect-trend,release-score,incident-report,impact-alert,developer-profile,backlog-health,defect-seasonality,pipeline-cost}.integration.test.ts
```

### 4.5 Definição de DONE da demanda

| Camada | Done quando |
|--------|-------------|
| Deleção | 9 renderers sem referência em produção; cálculos preservados/migrados (A4, A12); A1–A7 atendidos; gates verdes |
| Sanitização | §3.3 checklist completo por artefato; `unused-exports` e `no-swallow` verdes |
| Reconstrução | 3 pilotos com `generateXInsights` consumindo dados reais; renderers migrados (F1.4) |
| Novas camadas | F2 (grafo) e F3 (SPA) com checkpoints completos em PROGRESS.md |
| Auditoria final | A1–A12 atendidos; CI real verde (Regra 13); PROGRESS.md com todos os checkpoints |

---

## 5. Ordem de execução consolidada

```
S0.1 → S1.1 → S1.2 → S1.3 → S2.1 → S2.2 → S2.3 → S3.1 → S3.2 → S3.3 → S4.1 → S4.2
     → S5.1 → S5.2 → S6.1 → S6.2 → S6.3 → S6.4 → S7.1 → S8.1
     → F1 (F1.0 → F1.5) → F2 (F2.0 → F2.4) → F3 (F3.0 → F3.6) → F4 (go/no-go)
```

**Invariantes de sequência:**
1. Deleção de um renderer NUNCA precede a remoção de seus consumidores de produção (hub-first).
2. F0.2 (decisões F-1/F-2/F-3, P-2) é requisito de S2.2, S3.3 e S7.1 — resolver no início.
3. F0.8 (oráculos) precede F1 (pilotos) — nenhum insight sobre dados com bug.
4. Nenhuma fase adiantada; cada tarefa verificada (gate + auditoria) antes da próxima (Regra 27).
5. **Cálculos e campos `computed.*` sobrevivem por padrão; só renderers são deletados. Qualquer remoção de cálculo exige evidência de duplicação estrutural registrada neste documento.**
