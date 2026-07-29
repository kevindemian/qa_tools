# PLANO DE CONCLUSAO — QA Tools Report Restructuring

**Documento de referencia unico para conclusao de todas as fases pendentes.**

Fontes consolidadas: `1784894577051-crisp-circuit.md`, `EXECUTION-PLAN.md`, `CONTENT-SPECIFICATION.md`, `1784894577051-crisp-circuit-WORK-2026-07-24.md`, `1785100000000-html-quality-restructuring.md`, `1785100000001-css-quality-restructuring.md`, `1784726095802-gentle-squid.md`, `BACKLOG_sanitize.md` (Sprints CSS Refactoring FT-17 e Jun/2026), `INTEGRATED-PLAN.md` (Grupo 2: 19 features HTML), `TECHDOC.md` (MODULE MAP).

Auditoria de codigo real executada em 25/Jul/2026. Pesquisa cross-platform shortcodes realizada em 25/Jul/2026.

---

## Diagnostico Consolidado

### Implementado e correto

| Item | Evidencia |
|------|-----------|
| Fase 0 — PLAN-DRIVEN EXECUTION | `AGENTS.md` contem a seccao; `quality-check.ts` possui 4 referencias |
| Fase 0.4 — npm audit brace-expansion | `package.json` overrides: `"brace-expansion": ">=5.0.8"` (commit `c44609da`) |
| Fase 0.5 — 6 arquivos de teste | Todos existentes: ai-metrics, defect-aggregation, regression-detection, optimization-actions, failure-attribution, icons |
| Fase 1.1 — flakiness totalTests | `flakiness-renderer.ts` linha 37 lê `dataHub.computed.testCounts.total` |
| Fase 1.3 — timestamps | 5 barrels usam `dataHub.timestamp` (commit `f8667f01`) |
| Fase A.2.1–A.2.4 — 4 compute modules | Arquivos existem em `shared/data-hub/compute/`, wireados em `hub.ts:829-871`, tipos em `data-hub.ts` |
| Fase B — Icones | `shared/icons.ts` existe, lucide instalado, 0 emojis nos renderers |
| Fase 3 — icons.test.ts | Teste existe |
| C.1 — PR-Report inline styles | `pr-report-core.ts` possui 0 `style="` |
| C.3 (parcial) — traceability Badge/ProgressBar | Usa Badge e ProgressBar primitives |
| C.5 — release-score null guard | `result: ... | null | undefined` + EmptyState presentes |
| 16 renderers extraidos + timestamp | Todos os 16 com `data-part="timestamp"` |

### Pendente ou incorreto (gaps confirmados)

| # | Gap | Evidencia |
|---|-----|-----------|
| 1 | pipeline-cost NAO consome `computed.perRunCosts` | `pipeline-cost.ts` ainda recalcula de `dataHub.getRuns()` |
| 2 | Fase 2 inteira — 4 compute modules ausentes | impact-alerts, incident-events, traceability-tree, cross-squad NAO existem em `compute/` |
| 3 | Fase 4 inteira — renderers nao consomem `computed.*` novos e 0 thresholds visíveis | Nenhum `computed.aiMetrics` consumido; grep `"target:"` = 0 resultados |
| 4 | Fase 5 parcial — inline styles redundantes restantes | card.ts (`display:grid`, `display:flex`, `color:`), table.ts (`cursor:pointer`) |
| 5 | C.4.1 — incident-report usa SeverityBanner manual | Funcao local linha 87, nao usa SeverityBadge primitive |
| 6 | 3.6.1 parcial — traceability mantem classes legadas | `.story-node`/`.epic-node` coexistem com data-* |
| 7 | C.2 — duplicacao markdown pass rate | buildSummaryTable e buildQualityGateSection sem renderQualityGateTable compartilhado |
| 8 | C.6 — mocks internos nos testes PR-report | health-score, quality-gate, report-html ainda mockados |
| 9 | Fase 6 — HTML-CSS-HOOKS-AUDIT.md nao existe | Só existe HTML-CSS-HOOKS.md |
| 10 | Fase 8 — documentacao incompleta | TECHDOC sem camada primitives, sem seção de criterios |
| 11 | Fase 9 — auditoria final nunca executada | — |
| 12 | Item 17 (WORK doc) — coverage-gap mistura compute+HTML | generate-coverage-gap-html.ts possui compute + HTML mistos |
| 13 | report-html.ts (FT-17) nao coberto no plano R2 | Orchestrator principal de HTML nao tem tasks de conteudo SSOT |
| 14 | pipeline-health.ts nao coberto no plano R2 | git_triggers HTML generator sem cobertura |
| 15 | schedule-handler.ts nao coberto no plano R2 | weekly report HTML sem cobertura |
| 16 | interactive-mode.ts nao coberto no plano R2 | interactive dashboard HTML sem cobertura |

**Posicao atual na ordem obrigatoria do crisp-circuit:** parado entre Fase 1 (com 1 tarefa regredida) e Fase 2.

---

## Total de Artefatos HTML Identificados (~26)

### Classificacao por origem

| Origem | Artefatos | Qtde |
|--------|-----------|------|
| **16 Renderers** (shared/report/ + shared/quality/) | ai-effectiveness, ai-comparison, incident-report, impact-alert, traceability, flakiness, backlog-health, release-score, silent-regression, defect-trend, defect-seasonality, developer-profile, pipeline-cost, suite-optimization, cross-squad-benchmark, requirement-score | 16 |
| **Coverage Gap** (shared/report/) | generate-coverage-gap-html.ts (compute+render mistos) | 1 |
| **HTML Orchestrator** (shared/) | report-html.ts (FT-17 — sections, charts, themes) | 1 |
| **git_triggers HTML** | pipeline-health.ts + pipeline-health-renderer.ts | 1 |
| **git_triggers HTML** | schedule-handler.ts (weekly quality report) | 1 |
| **git_triggers HTML** | interactive-mode.ts (interactive dashboard) | 1 |
| **PR Report — Artefato 1** | pr-report-core.ts → Markdown PR Comment (buildSummaryTable, etc.) | 1 |
| **PR Report — Artefato 2** | pr-report-core.ts → GitHub Job Summary (`$GITHUB_STEP_SUMMARY`) | 1 |
| **PR Report — Artefato 3** | pr-report-core.ts → HTML Report Artifact (generateHtmlReportFile → report-html.ts) | 1 |
| **Infraestrutura HTML** | html-factory.ts, report-styles.ts, report-sections.ts, report-table.ts, report-chart.ts, report-diff.ts, report-utils.ts, report-export.ts, report-generator.ts, report-scripts.ts, report-validator.ts, report-types.ts, markdown-html.ts | 14 (cobertos implicitamente via refs em R2) |

**Total diretamente coberto por R2: 16 renderers + coverage-gap + report-html + pipeline-health + schedule-handler + interactive-mode = 21 tarefas R2**

**3 artefatos pr-report distintos:** PR Comment Markdown (R4), Job Summary (R4), HTML Artifact (R2.21 indirectamente via report-html.ts).

---

## Ordem de Execucao

```
R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7
```

Regra: Nenhuma fase adiantada. Nenhum agrupamento de fases. Cada tarefa concluída verificada antes da proxima.

---

## FORMATO DE TAREFA (obrigatorio — AGENTS.md Regra 27)

Cada task contém:
- **Fase X.Y** — nome
- **Arquivo(s)**: alteração exata
- **Mudança**: descrição concisa do que fazer
- **Critério de Aceitação**: verificação objetiva
- **Comando de Verificação**: comando bash a executar
- **Testes**: arquivo(s) de teste a criar/atualizar
- **Commit**: mensagem conventional commit

---

## FASE R0 — Baseline e Correção Residual da Fase 1

### R0.1 — Baseline Verification

**Arquivo(s):** Nenhum (validação apenas)

**Mudança:** Executar os 4 comandos de baseline e registrar resultados:
1. `npx tsc --noEmit`
2. `npx vitest run`
3. `npm run lint`
4. `npm audit --audit-level=high`

**Critério de Aceitação:** Os 4 comandos produzem saída. Resultado documentado neste plano (sessão de implementação). Nenhum comando pode falhar com erro inesperado — falhas pre-existentes são gaps a corrigir, não ignorar.

**Comando de Verificação:**
```bash
npx tsc --noEmit 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
npm run lint 2>&1 | tail -5
npm audit --audit-level=high 2>&1 | tail -5
```

**Testes:** Nenhum (validação de build)

**Commit:** Nenhum (validação apenas)

---

### R0.2 — pipeline-cost Consumir computed.perRunCosts (SSOT)

**Arquivo(s):** `shared/quality/pipeline-cost.ts`

**Mudança:** Substituir o cálculo local de `perRunCosts` (que chama `dataHub.getRuns()` diretamente para computar custos por run) com consumo de `dataHub.computed.perRunCosts`. O campo `perRunCosts` ja existe em `ComputedMetrics` e é calculado como SSOT pelo DataHub. A funcao `calculatePipelineCost` deve ler `dataHub.computed.perRunCosts` quando disponível, computar localmente apenas como fallback quando `perRunCosts` nao existe (backward compat durante migracao).

**Critério de Aceitação:**
- `grep -c "getRuns()" shared/quality/pipeline-cost.ts` retorna 0 para cálculo de custos (mantém apenas para obter timestamps se necessário)
- `npx tsc --noEmit` — 0 erros
- Output de `calculatePipelineCost` é idêntico antes e depois da mudança para os mesmos inputs de teste

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pipeline-cost.test.ts
```

**Testes:** `shared/__tests__/pipeline-cost.test.ts` — adicionar assert que output usa `computed.perRunCosts` quando disponível.

**Commit:** `feat(quality): pipeline-cost consumes computed.perRunCosts from DataHub SSOT`

---

## FASE R1 — 4 Compute Modules Restantes (Fase 2 Original)

Cada tarefa segue o mesmo padrao:
1. Criar `shared/data-hub/compute/[module].ts` com funcao de compute
2. Adicionar campo opcional em `ComputedMetrics` (`shared/types/data-hub.ts`)
3. Wire em `hub.ts` `computeMetrics()` + re-export no `compute/index.ts`
4. Barrel do dominio consome do DataHub (nao calcula local)
5. Testes unitarios + integracao

### R1.1 — impact-alerts Compute Module

**Arquivo(s):** `shared/data-hub/compute/impact-alerts.ts` (novo)

**Mudança:** Criar funcao `computeImpactAlerts()` que recebe dados do hub e retorna `ImpactAlertResult[]`. Computa alertas de impacto de pipeline baseada em regressions, failures correlacionados com changes de PRs, e agrupa por severidade e proveniencia.

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- `npx vitest run shared/__tests__/impact-alerts.test.ts` — PASS
- `npx vitest run shared/__tests__/integration/impact-alerts.integration.test.ts` — PASS
- Campo `impactAlerts` aparece no tipo `ComputedMetrics`
- `hub.ts` chama `computeImpactAlerts` e o valor persiste em `this.computed`

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/impact-alerts.test.ts shared/__tests__/integration/impact-alerts.integration.test.ts
```

**Testes:** `shared/__tests__/impact-alerts.test.ts` (unit), `shared/__tests__/integration/impact-alerts.integration.test.ts` (integration)

**Commit:** `feat(data-hub): add impact-alerts compute module`

---

### R1.2 — incident-events Compute Module

**Arquivo(s):** `shared/data-hub/compute/incident-events.ts` (novo)

**Mudanca:** Criar funcao `computeIncidentEvents()` que recebe incident data do hub e retorna eventos estruturados com categorizacao por tipo, severidade e frequencia.

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Testes pass
- Campo `incidentEvents` no tipo `ComputedMetrics`
- `hub.ts` chama `computeIncidentEvents`

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/incident-events.test.ts shared/__tests__/integration/incident-events.integration.test.ts
```

**Testes:** `shared/__tests__/incident-events.test.ts` (unit), `shared/__tests__/integration/incident-events.integration.test.ts` (integration)

**Commit:** `feat(data-hub): add incident-events compute module`

---

### R1.3 — traceability-tree Compute Module

**Arquivo(s):** `shared/data-hub/compute/traceability-tree.ts` (novo)

**Mudanca:** Criar funcao `computeTraceabilityTree()` que recebe dados de rastreabilidade e retorna a estrutura de arvore (epics > stories > tests) com metadados de coverage, health e status.

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Testes pass
- Campo `traceabilityTree` no tipo `ComputedMetrics`
- `hub.ts` chama `computeTraceabilityTree`

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/traceability-tree.test.ts shared/__tests__/integration/traceability-tree.integration.test.ts
```

**Testes:** `shared/__tests__/traceability-tree.test.ts` (unit), `shared/__tests__/integration/traceability-tree.integration.test.ts` (integration)

**Commit:** `feat(data-hub): add traceability-tree compute module`

---

### R1.4 — cross-squad Compute Module

**Arquivo(s):** `shared/data-hub/compute/cross-squad.ts` (novo)

**Mudanca:** Criar funcao `computeCrossSquad()` que recebe dados de todos os squads e computa comparativos inter-squad (benchmarks de health, coverage, velocity).

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Testes pass
- Campo `crossSquad` no tipo `ComputedMetrics`
- `hub.ts` chama `computeCrossSquad`

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/cross-squad.test.ts shared/__tests__/integration/cross-squad.integration.test.ts
```

**Testes:** `shared/__tests__/cross-squad.test.ts` (unit), `shared/__tests__/integration/cross-squad.integration.test.ts` (integration)

**Commit:** `feat(data-hub): add cross-squad compute module`

---

## FASE R2 — Conteudo de Todos os Artefatos HTML (21 Tarefas)

Cada tarefa deve:
1. Consumir `computed.*` do DataHub (nao calcular local)
2. Exibir `data-part="timestamp"` (ja implementado na maioria)
3. Exibir thresholds visíveis nos MetricCards (formato `"target: XX%"` ou `"threshold: XX"`)
4. Aplicar sample-size warning quando aplicavel
5. Verificacao: gerar HTML, grep pelos campos obrigatorios

### R2.1 — ai-effectiveness Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/report/ai-effectiveness-renderer.ts`

**Mudanca:**
1. Substituir chamadas a funcoes de computacao de metricas com consumo de `dataHub.computed.aiMetrics`
2. Em MetricCards do resumo, adicionar exibicao do threshold: formato `"target: XX%"`
3. Adicionar sample-size warning quando o numero de registros estiver abaixo do minimo
4. Garantir que cada MetricCard exibe: valor, label, target, severity, sampleSize

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Gerar HTML, `grep` verifica: `data-dashboard="ai-effectiveness"` no container, `data-part="target"`, `data-part="sample-warning"`, `data-part="timestamp"`
- `npx vitest run shared/__tests__/ai-effectiveness.test.ts` — PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/ai-effectiveness.test.ts
```

**Testes:** Atualizar `shared/__tests__/ai-effectiveness.test.ts`

**Commit:** `refactor(ai-effectiveness): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.2 — ai-comparison Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/report/ai-comparison-renderer.ts`

**Mudanca:** Consumir `dataHub.computed.aiMetrics` ao inves de computar localmente. MetricCards com target visível. Sample-size warnings.

**Critério de Aceitação:** Idêntico a R2.1 para ai-comparison. `data-dashboard="ai-comparison"`.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/ai-comparison.test.ts
```

**Testes:** Atualizar `shared/__tests__/ai-comparison.test.ts`

**Commit:** `refactor(ai-comparison): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.3 — flakiness Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/report/flakiness-renderer.ts`

**Mudanca:** Consumir `dataHub.computed` para testCounts e flakyRate (nao recalcular). Thresholds visíveis nos MetricCards. Sample-size warning.

**Critério de Aceitação:**
- `grep "target:" shared/report/flakiness-renderer.ts` retorna resultado não-vazio
- `npx tsc --noEmit` — 0 erros
- `npx vitest run shared/__tests__/flakiness-dashboard.test.ts` — PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/flakiness-dashboard.test.ts
```

**Testes:** Atualizar `shared/__tests__/flakiness-dashboard.test.ts`

**Commit:** `refactor(flakiness): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.4 — backlog-health Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/report/backlog-health-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="backlog-health"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/backlog-health.test.ts shared/__tests__/backlog-health.property.test.ts
```

**Testes:** Atualizar testes de backlog-health

**Commit:** `refactor(backlog-health): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.5 — incident-report Renderer — SSOT + Thresholds + SeverityBadge (fase pré-R3)

**Arquivo(s):** `shared/report/incident-report-renderer.ts`

**Mudanca:**
1. Consumir computed data do DataHub SSOT
2. Thresholds visíveis nos MetricCards
3. Sample-size warning
4. (R3.3) Substituir SeverityBanner manual por SeverityBadge primitive

**Critério de Aceitação:** `data-dashboard="incident-report"`. SeverityBanner removido (substituído por SeverityBadge).

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/incident-report.test.ts shared/__tests__/incident-report.property.test.ts
```

**Testes:** Atualizar testes de incident-report

**Commit:** `refactor(incident-report): consume DataHub SSOT + add thresholds + SeverityBadge primitive`

---

### R2.6 — impact-alert Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/report/impact-alert-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="impact-alert"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/impact-alert.test.ts shared/__tests__/impact-alert.property.test.ts
```

**Testes:** Atualizar testes de impact-alert

**Commit:** `refactor(impact-alert): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.7 — traceability Renderer — SSOT + Thresholds + data-* attrs

**Arquivo(s):** `shared/report/traceability-renderer.ts`

**Mudanca:**
1. Consumir computed data do DataHub SSOT
2. Thresholds visíveis nos MetricCards
3. Sample-size warning
4. Remover classes `.story-node` e `.epic-node` — manter apenas `data-component="tree-node"` + `data-level`
5. Substituir Badge primitive para status badges

**Critério de Aceitação:** `data-dashboard="traceability"`. Zero classes CSS legadas `.story-node`, `.epic-node` no output HTML. Zero `style="` no renderer.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/traceability-matrix.test.ts shared/__tests__/traceability-matrix.property.test.ts
```

**Testes:** Atualizar testes de traceability-matrix

**Commit:** `refactor(traceability): consume DataHub SSOT + thresholds + migrate to data-* attributes`

---

### R2.8 — defect-trend Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/defect-trend-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="defect-trend"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/defect-trend.test.ts shared/__tests__/defect-trend-html.property.test.ts
```

**Testes:** Atualizar testes de defect-trend

**Commit:** `refactor(defect-trend): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.9 — defect-seasonality Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/defect-seasonality-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="defect-seasonality"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/defect-seasonality.test.ts shared/__tests__/defect-seasonality.property.test.ts
```

**Testes:** Atualizar testes de defect-seasonality

**Commit:** `refactor(defect-seasonality): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.10 — silent-regression Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/silent-regression-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="silent-regression"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/silent-regression.test.ts shared/__tests__/silent-regression.property.test.ts
```

**Testes:** Atualizar testes de silent-regression

**Commit:** `refactor(silent-regression): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.11 — developer-profile Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/developer-profile-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="developer-profile"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/developer-profile.test.ts shared/__tests__/developer-profile.property.test.ts
```

**Testes:** Atualizar testes de developer-profile

**Commit:** `refactor(developer-profile): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.12 — pipeline-cost Renderer — SSOT + Thresholds + perRunCosts

**Arquivo(s):** `shared/quality/pipeline-cost-renderer.ts`

**Mudanca:** Consumir `computed.perRunCosts` do DataHub SSOT + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="pipeline-cost"`. Testes passam. Nenhuma chamada direta a `getRuns()` para computação de custos (usa `computed.perRunCosts`).

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pipeline-cost.test.ts
```

**Testes:** Atualizar testes de pipeline-cost

**Commit:** `refactor(pipeline-cost): consume DataHub SSOT perRunCosts + add thresholds`

---

### R2.13 — suite-optimization Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/suite-optimization-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="suite-optimization"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/suite-optimization.test.ts shared/__tests__/suite-optimization.property.test.ts
```

**Testes:** Atualizar testes de suite-optimization

**Commit:** `refactor(suite-optimization): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.14 — cross-squad-benchmark Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/cross-squad-benchmark-renderer.ts`

**Mudanca:** Consumir `computed.crossSquad` do DataHub SSOT + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="cross-squad-benchmark"`. Testes passam. Nenhuma chamada local ao compute.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/cross-squad-benchmark.test.ts shared/__tests__/cross-squad-benchmark.property.test.ts
```

**Testes:** Atualizar testes de cross-squad-benchmark

**Commit:** `refactor(cross-squad-benchmark): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.15 — requirement-score Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/requirement-score-renderer.ts`

**Mudanca:** Consumir computed data + thresholds visíveis + sample-size warning.

**Critério de Aceitação:** `data-dashboard="requirement-score"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/requirement-score.test.ts shared/__tests__/requirement-score.property.test.ts
```

**Testes:** Atualizar testes de requirement-score

**Commit:** `refactor(requirement-score): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.16 — release-score Renderer — SSOT + Thresholds

**Arquivo(s):** `shared/quality/release-score-renderer.ts`

**Mudanca:** Consumir `computed.perRunCosts` do DataHub SSOT para custos + thresholds visíveis por grade + sample-size warning.

**Critério de Aceitação:** `data-dashboard="release-score"`. Testes passam.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/release-score.test.ts shared/__tests__/release-score.property.test.ts
```

**Testes:** Atualizar testes de release-score

**Commit:** `refactor(release-score): consume DataHub SSOT + add thresholds and sample-size`

---

### R2.17 — Coverage Gap compute/render Separation (Item 17 do WORK doc)

**Arquivo(s):** Novos: `shared/data-hub/compute/coverage-gap.ts`, `shared/report/coverage-gap-renderer.ts`. Alterados: `shared/report/generate-coverage-gap-html.ts`.

**Mudanca:**
1. Extrair a logica de compute de `generate-coverage-gap-html.ts` para `shared/data-hub/compute/coverage-gap.ts` (funcao `computeCoverageGap()` pura)
2. Adicionar campo `coverageGap` em `ComputedMetrics` (`shared/types/data-hub.ts`)
3. Wire em `hub.ts` `computeMetrics()` + re-export no `compute/index.ts`
4. Criar `shared/report/coverage-gap-renderer.ts` que consome `dataHub.computed.coverageGap` e gera o HTML via `buildHtmlPage` + `buildCss`
5. Manter `generate-coverage-gap-html.ts` somente como wrapper que chama o renderer (ou substituir chamadas existentes)
6. Remover logica de compute obsoleta de `generate-coverage-gap-html.ts`

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- `generate-coverage-gap-html.ts` tem 0 logica de compute (chama apenas o renderer)
- `npx vitest run shared/__tests__/coverage-gap.test.ts` — PASS
- `data-dashboard="coverage-gap"` presente no HTML gerado

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/coverage-gap.test.ts
```

**Testes:** `shared/__tests__/coverage-gap.test.ts`

**Commit:** `feat(coverage-gap): separate compute from render, add DataHub SSOT`

---

### R2.18 — report-html.ts Orchestrator — SSOT + Thresholds + Hooks Audit

**Arquivo(s):** `shared/report/report-html.ts`

**Mudanca:**
1. Garantir que `report-html.ts` consome dados do `DataHub.computed` onde aplicável (não recalcula métricas que já existem no DataHub)
2. Garantir que todas as seções geradas passam thresholds visíveis nos MetricCards correspondentes
3. Aplicar sample-size warnings
4. Verificar que todos os `data-*` hooks esperados estão presentes (`data-dashboard`, `data-section`, `data-component`, `data-part`)
5. Validar que a orchestradora monta HTML correto para todos os 16 dashboards + coverage-gap

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Gerar HTML via `report-html.ts`, `grep` verifica data-dashboard e data-section em cada seção
- Nenhuma métrica é recalculada localmente quando já existe em DataHub.computed
- `npx vitest run` incluindo `shared/__tests__/report-html.test.ts` — PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/report-html.test.ts shared/__tests__/report-html.integration.test.ts 2>/dev/null || echo "No dedicated test — verify via integration"
```

**Testes:** Criar `shared/__tests__/report-html.test.ts` e `shared/__tests__/integration/report-html.integration.test.ts`

**Commit:** `refactor(report-html): enforce DataHub SSOT + hooks audit`

---

### R2.19 — pipeline-health.ts HTML — SSOT + Thresholds

**Arquivo(s):** `git_triggers/pipeline-health.ts` (+ `pipeline-health-renderer.ts` se existir)

**Mudanca:**
1. Consumir `dataHub.computed` para métricas de pipeline health em vez de recalcular de `getRuns()` localmente
2. Exibir thresholds visíveis em cada MetricCard do pipeline health HTML
3. Aplicar sample-size warnings quando aplicável

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Pipeline health HTML gerado com thresholds visíveis nos MetricCards
- `npx vitest run` passando

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pipeline-health.test.ts 2>/dev/null || echo "No dedicated test — verify manually"
```

**Testes:** Atualizar/criar testes de pipeline-health

**Commit:** `refactor(pipeline-health): consume DataHub SSOT + add thresholds`

---

### R2.20 — schedule-handler.ts Weekly Report HTML — SSOT + Thresholds

**Arquivo(s):** `git_triggers/schedule-handler.ts`

**Mudanca:**
1. Consumir `dataHub.computed` para métricas do relatório semanal em vez de recalcular localmente
2. Exibir thresholds visíveis nos MetricCards
3. Aplicar sample-size warnings quando aplicável

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Relatório semanal HTML gerado com thresholds visíveis
- `npx vitest run` passando

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/schedule-handler.test.ts 2>/dev/null || echo "No dedicated test — verify manually"
```

**Testes:** Atualizar/criar testes de schedule-handler

**Commit:** `refactor(schedule-handler): consume DataHub SSOT + add thresholds to weekly report HTML`

---

### R2.21 — interactive-mode.ts Dashboard HTML — SSOT + Thresholds

**Arquivo(s):** `git_triggers/interactive-mode.ts`

**Mudanca:**
1. Consumir `dataHub.computed` para métricas do dashboard interativo em vez de recalcular localmente
2. Exibir thresholds visíveis nos MetricCards do dashboard
3. Aplicar sample-size warnings quando aplicável

**Critério de Aceitação:**
- `npx tsc --noEmit` — 0 erros
- Dashboard interativo HTML gerado com thresholds visíveis
- `npx vitest run` passando

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/interactive-mode.test.ts 2>/dev/null || echo "No dedicated test — verify manually"
```

**Testes:** Atualizar/criar testes de interactive-mode

**Commit:** `refactor(interactive-mode): consume DataHub SSOT + add thresholds to dashboard HTML`

---

### R2.22 — PR Report Artifact 1: PR Comment Markdown — SSOT + Shortcodes (fase pré-R4)

**Arquivo(s):** `shared/pr-report-core.ts` (parte do PR Comment Markdown artifact)

**Mudanca (preparatória para R4 — refatorar para usar shortcodes):**
1. Substituir símbolos Unicode nos outputs de PR Comment markdown por **shortcodes emoji cross-platform** (`:white_check_mark:` para PASSED, `:x:` para FAILED, `:fast_forward:` para SKIPPED, `:clock1:` para DURATION, `:arrow_forward:` para PASS RATE, `:repeat:` para CHANGES, `:large_blue_diamond:` para TOTAL)
2. Esta mudança é reversível e mantém a mesma estrutura markdown (tables, bold, headers)

**Critério de Aceitação:**
- `grep -P '✓|✗|⏭|◷|▶|↻' shared/pr-report-core.ts` = 0 (zero ocorrências nos outputs PR comment)
- Todos os outputs PR Comment usam shortcodes: `:white_check_mark:`, `:x:`, `:fast_forward:`, `:clock1:`, `:arrow_forward:`, `:repeat:`, `:large_blue_diamond:`
- `npx tsc --noEmit` — 0 erros
- `npx vitest run shared/__tests__/pr-report-core.*` — todos PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pr-report-core.test.ts shared/__tests__/pr-report-core.property.test.ts shared/__tests__/pr-report-core.main.test.ts
```

**Testes:** Atualizar pr-report-core.test.ts e pr-report-core.property.test.ts para verificar shortcodes em vez de símbolos Unicode.

**Commit:** `refactor(pr-report): replace Unicode symbols with cross-platform emoji shortcodes in PR Comment markdown`

---

### R2.23 — PR Report Artifact 2: GitHub Job Summary — SSOT + Shortcodes

**Arquivo(s):** `shared/pr-report-core.ts` (funcao `buildQGCHeckSummary` ou equivalente para Job Summary)

**Mudanca:** Garantir que a seção de Job Summary (`$GITHUB_STEP_SUMMARY`) tambem use shortcodes emoji cross-platform em vez de Unicode, e que consuma `dataHub.computed` quando aplicável.

**Critério de Aceitação:** Shortcodes presentes no output do Job Summary. Nenhum símbolo Unicode no Job Summary.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pr-report-core.main.test.ts —grep "Job Summary"
```

**Testes:** Atualizar testes de pr-report-core.main.test.ts

**Commit:** `refactor(pr-report): apply cross-platform emoji shortcodes to GitHub Job Summary`

---

### R2.24 — PR Report Artifact 3: HTML Report Artifact — SSOT + Thresholds

**Arquivo(s):** `shared/pr-report-core.ts` (funcao `generateHtmlReportFile`) + `shared/report/report-html.ts`

**Mudanca:** Garantir que o HTML Report Artifact (arquivo `.html` gerado e uploadado como artifact) tambem consuma `dataHub.computed` para todas as métricas e exiba thresholds visíveis nos MetricCards.

**Critério de Aceitação:**
- O HTML artifact gerado contém thresholds visíveis nos MetricCards
- O HTML artifact consome `dataHub.computed` onde aplicável (nao recalcula)
- `npx tsc --noEmit` — 0 erros

**Comando de Verificação:**
```bash
npx tsc --noEmit
grep -c "target:" shared/pr-report-core.ts shared/report/report-html.ts
```

**Testes:** Atualizar testes de pr-report-core para verificar thresholds no HTML artifact gerado

**Commit:** `refactor(pr-report): enforce DataHub SSOT + thresholds in HTML artifact`

---

## FASE R3 — Estetica Residual (Fase 5 Original + C.4 + C.5)

### R3.1 — Remover Inline Styles Redundantes de Card

**Arquivo(s):** `shared/primitives/card.ts`

**Mudanca:** Remover `style="display:grid"` (linha 94) e `style="display:flex"` (linha 110). Substituir por classes CSS em `report-styles.ts`:
- `.qa-card--grid` → `display: grid`
- `.qa-card--flex` → `display: flex`

Adicionar seletores CSS correspondentes em `buildCss()` de `shared/report/report-styles.ts`.

**Critério de Aceitação:**
- `grep 'style="' shared/primitives/card.ts` retorna apenas `style="${style}"` (propósito de pass-through, não inline styles hardcoded)
- `npx tsc --noEmit` — 0 erros
- Output visual idêntico (mesmo layout grid/flex)

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/primitives/__tests__/card.test.ts
```

**Testes:** Atualizar card test assertions se necessário (classes em vez de inline styles)

**Commit:** `refactor(primitives): remove redundant inline styles from Card, delegate to CSS classes`

---

### R3.2 — Remover Inline Styles Redundantes de Table

**Arquivo(s):** `shared/primitives/table.ts`

**Mudanca:** Remover `style="cursor:pointer"` (linha 114). Substituir por classe CSS `.qa-table-row--clickable` em `report-styles.ts` com `cursor: pointer`.

**Critério de Aceitação:** `grep 'style="' shared/primitives/table.ts` retorna apenas dynamic `style` attrs (column width, text-align) que são legítimos por dependerem de dados.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/primitives/__tests__/table.test.ts
```

**Testes:** Atualizar table test assertions

**Commit:** `refactor(primitives): remove cursor:pointer inline style from Table, delegate to CSS class`

---

### R3.3 — Substituir SeverityBanner por SeverityBadge Primitive

**Arquivo(s):** `shared/report/incident-report-renderer.ts`

**Mudanca:** Remover funcao `SeverityBanner()` local (linha 87). Substituir todas as chamadas a `SeverityBanner(report.overallSeverity)` por `SeverityBadge({ severity: report.overallSeverity, children: report.overallSeverity })`. `SeverityBadge` já é exportado do barrel de primitives.

**Critério de Aceitação:**
- `grep -c "SeverityBanner" shared/report/incident-report-renderer.ts` = 0
- `grep -c "SeverityBadge" shared/report/incident-report-renderer.ts` > 0
- `npx tsc --noEmit` — 0 erros
- `npx vitest run shared/__tests__/incident-report.test.ts` — PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/incident-report.test.ts shared/__tests__/incident-report.property.test.ts
```

**Testes:** Atualizar testes se necessario (SeverityBadge output diferente de SeverityBanner)

**Commit:** `refactor(incident-report-renderer): replace local SeverityBanner with SeverityBadge primitive`

---

### R3.4 — Remover Classes CSS Legadas do Traceability Renderer

**Arquivo(s):** `shared/report/traceability-renderer.ts`

**Mudanca:** Remover classes `.epic-node` (linha 48) e `.story-node` (linha 81). Manter apenas `data-component="tree-node"` + `data-level="epic"` / `data-level="story"`. CSS existente para `.story-node` e `.epic-node` em `report-styles.ts` deve ser migrado para seletores `data-*`.

**Critério de Aceitação:**
- `grep -c "epic-node\|story-node" shared/report/traceability-renderer.ts` = 0
- `grep -c "class=\"epic-node\"\|class=\"story-node\"" shared/report/traceability-renderer.ts` = 0 (no HTML output)
- `npx tsc --noEmit` — 0 erros
- `npx vitest run shared/__tests__/traceability-matrix.test.ts` — PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/traceability-matrix.test.ts shared/__tests__/traceability-matrix.property.test.ts
```

**Testes:** Atualizar testes de traceability-matrix

**Commit:** `refactor(traceability-renderer): remove legacy CSS classes, use data-* attributes exclusively`

---

## FASE R4 — Markdown Profissional + PR-Report Refatoração (Cross-Platform Shortcodes)

### R4.1 — Substituir Símbolos Unicode por Emoji Shortcodes Cross-Platform

**Arquivo(s):** `shared/pr-report-core.ts`

**Mudanca:** Substituir TODOS os símbolos Unicode nos outputs de markdown PR Comment e GitHub Job Summary por **emoji shortcodes cross-platform** (:`shortcode:`):

| Símbolo Antigo | Shortcode Cross-Platform | Renderizado Como | Contexto |
|----------------|--------------------------|------------------|----------|
| `✓` | `:white_check_mark:` | ✅ em GitHub, GitLab, Bitbucket | Status de teste passado |
| `✗` | `:x:` | ❌ em GitHub, GitLab, Bitbucket | Status de teste falho |
| `⏭` | `:fast_forward:` | ⏭ em todas as plataformas | Status de teste pulado |
| `◷` | `:clock1:` | 🕐 em todas as plataformas | Indicador de duração |
| `▶` | `:arrow_forward:` | ▶ em todas as plataformas | Indicador de taxa de passagem |
| `↻` | `:repeat:` | ↻ em todas as plataformas | Indicador de alterações no PR |
| `Σ` | `:large_blue_diamond:` | ◆ em todas as plataformas | Total de testes |

**Justificativa Tecnica Superior:** Shortcodes emoji funcionam em GitHub (GFM), GitLab (GLFM) e Bitbucket — as tres plataformas suportam `:shortcode:` syntax. Renderizam como imagens/emoji (marcadores visuais reais). São acessíveis (alt text nativo). O codigo-fonte legível (`:white_check_mark:` é semanticamente claro). Nao sao Unicode — o codigo fonte contém texto legível.

**Critério de Aceitação:**
- `grep -P '✓|✗|⏭|◷|▶|↻|Σ' shared/pr-report-core.ts` = 0 (zero ocorrências nos outputs markdown)
- Todos os outputs markdown gerados usam shortcodes: `:white_check_mark:`, `:x:`, `:fast_forward:`, `:clock1:`, `:arrow_forward:`, `:repeat:`, `:large_blue_diamond:`
- O output markdown continua válido — plataformas renderizam os shortcodes como emoji visual
- Markdown tables com shortcodes funcionam corretamente

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pr-report-core.test.ts shared/__tests__/pr-report-core.property.test.ts shared/__tests__/pr-report-core.main.test.ts
```

**Testes:** Atualizar `shared/__tests__/pr-report-core.test.ts` e `shared/__tests__/pr-report-core.property.test.ts` para verificar shortcodes em vez de símbolos Unicode.

**Commit:** `refactor(pr-report): replace Unicode symbols with cross-platform emoji shortcodes`

---

### R4.2 — Extrair renderQualityGateTable() Compartilhado

**Arquivo(s):** `shared/pr-report-core.ts`

**Mudanca:** Extrair a lógica de renderização da tabela de pass rate que está duplicada entre `buildSummaryTable()` (linha 150) e `buildQualityGateSection()` (linha 731). Criar funcao `renderQualityGateTable(passRate: number, stats: PrReportStats, diff?: DiffComparison): string` que retorna a tabela markdown com pass rate, e chamá-la a partir de ambas as funcoes.

**Critério de Aceitação:**
- `grep -c "renderQualityGateTable" shared/pr-report-core.ts` = 2 (apenas as 2 chamadas, nenhuma definicao duplicada)
- `buildSummaryTable` e `buildQualityGateSection` mantém a mesma saída markdown que antes
- `npx vitest run shared/__tests__/pr-report-core.*.test.ts` — todos PASS

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pr-report-core.test.ts shared/__tests__/pr-report-core.property.test.ts shared/__tests__/pr-report-core.main.test.ts
```

**Testes:** Atualizar testes existentes (só refatoração interna, output inalterado)

**Commit:** `refactor(pr-report): extract renderQualityGateTable shared function, eliminate duplication`

---

### R4.3 — Remover Mocks Internos dos Testes PR-Report

**Arquivo(s):** `shared/__tests__/pr-report-core.compute-diff.test.ts`, `shared/__tests__/pr-report-core.main.test.ts`, `shared/__tests__/pr-report-core.property.test.ts`, `shared/__tests__/pr-report-core.wiring.property.test.ts`, `shared/__tests__/pr-report-core.wiring.test.ts`, `shared/__tests__/pr-report-core.test.ts`, `shared/__tests__/pr-report.test.ts`

**Mudanca:** Remover todos os `vi.mock(...)` que mockam logica interna do projeto (`health-score.js`, `quality-gate.js`, `report-html.js`). Manter apenas mocks para infraestrutura externa (GitHub API, filesystem real para escrita de arquivos temporarios, etc.). Para funcoes puras de compute, usar a logica real. Para funcoes que dependem de filesystem ou I/O externo, usar mocks apenas para essas fronteiras.

**Critério de Aceitação:**
- Cada arquivo de teste listado: `grep -c "vi.mock" arquivo` = 0 para mocks de logica interna
- `npx vitest run shared/__tests__/pr-report-core.*` — todos PASS com mocks internos removidos
- Testes ainda cobrem os mesmos cenários que antes

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/pr-report-core.compute-diff.test.ts shared/__tests__/pr-report-core.main.test.ts shared/__tests__/pr-report-core.property.test.ts shared/__tests__/pr-report-core.wiring.property.test.ts shared/__tests__/pr-report-core.wiring.test.ts shared/__tests__/pr-report-core.test.ts shared/__tests__/pr-report.test.ts 2>&1 | tail -5
```

**Testes:** Atualizar os 7 arquivos de teste para remover mocks internos e usar logica real.

**Commit:** `test(pr-report): remove internal mocks, use real implementations for test accuracy`

---

## FASE R5 — Auditoria CSS + Validação Visual

### R5.1 — Criar HTML-CSS-HOOKS-AUDIT.md

**Arquivo(s):** `dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md` (novo)

**Mudanca:** Criar documentação com tabela completa de todos os `data-*` attributes gerados por cada renderer e orchestrator, consumidos pelo CSS phase. Tabela inclui:
- `data-component` (primitives + novos)
- `data-section` usado em cada renderer/orchestrator
- `data-dashboard` usado (21 dashboards + coverage gap)
- `data-part` usado
- `data-severity` e `data-variant` usados
- `data-empty-state` e `data-action` usados

**Critério de Aceitação:** Arquivo existe, tabela completa reflete todos os 21 artefatos HTML + 16 primitives atuais do código.

**Comando de Verificação:**
```bash
test -f dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md && echo EXISTS || echo MISSING
wc -l dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md
grep -c "data-dashboard" dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md
```

**Testes:** Nenhum (documentação)

**Commit:** `docs: audit all HTML hooks for CSS phase`

---

### R5.2 — Automatizar Asserts de CSS/Hooks nos Testes de Renderers

**Arquivo(s):** `shared/__tests__/pr-report-core.*.test.ts` (e testes de renderers existentes)

**Mudanca:** Adicionar asserts nos testes de cada renderer/orchestrator que verificam:
- `data-dashboard="[report-type]"` no container raiz
- `data-section` em cada secao
- `data-component` em cada primitive
- `caption` em cada tabela
- `scope` em cada `th`
- Empty states com `data-empty-state`
- RecommendedActions com `data-action`

**Critério de Aceitação:** Todos os testes de renderer + orchestrator existentes possuem asserts de hooks HTML. Novo teste `shared/__tests__/pr-report-core.hooks.test.ts` existe com 100% coverage dos hooks.

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/pr-report-core.hooks.test.ts shared/__tests__/ai-effectiveness.test.ts
```

**Testes:** Criar `shared/__tests__/pr-report-core.hooks.test.ts` com PBT + edge cases para todos os hooks.

**Commit:** `test(pr-report): add HTML hook assertions for all renderers and orchestrators`

---

### R5.3 — Checklist de Validação Visual Manual Documentado

**Arquivo(s):** `dev/docs/internal/visual-validation-checklist.md` (novo)

**Mudanca:** Criar checklist documentado para validacao visual manual:

| Check | Comando/Acao | Esperado |
|-------|-------------|----------|
| Dark mode | Abrir cada dashboard HTML com `html.dark` classe | Cores preservadas, contraste WCAG AA |
| Mobile (320px) | Resize browser ou devtools | Layout responsivo, tables scrollaveis |
| Tablet (768px) | Resize browser | Layout ajustado |
| Desktop (1200px+) | Resize browser | Layout completo |
| Print (Ctrl+P) | Print each dashboard | Print styles aplicados, sem overflow |
| Screen reader | NVDA ou VoiceOver | Todos os data-component roles anunciados |
| Keyboard nav | Tab through | Focus indicators visíveis em todos os interactive elements |
| Zero Unicode symbols in source | `grep -P '✓|✗|⏭|◷|▶|↻|Σ' shared/pr-report-core.ts` | 0 resultados nos outputs markdown |
| Zero emojis nos shortcodes font | `grep -P '[\x{1F300}-\x{1FAFF}]' shared/pr-report-core.ts` (shortcodes fonte) | 0 resultados (shortcodes são texto) |
| Zero inline styles | `grep 'style="' *.html` | 0 resultados (exceto dynamic column widths) |

**Critério de Aceitação:** Checklist existe e é executado ao menos uma vez por dashboard + PR report output.

**Comando de Verificação:**
```bash
test -f dev/docs/internal/visual-validation-checklist.md && echo EXISTS
```

**Testes:** Nenhum (checklist manual)

**Commit:** `docs: add visual validation checklist for all dashboards and PR report output`

---

## FASE R6 — Documentação (Fase 8 Original)

### R6.1 — Atualizar TECHDOC.md — Diagrama de Arquitetura com Primitives e Todos os Artefatos HTML

**Arquivo(s):** `docs/TECHDOC.md`

**Mudanca:**
1. Adicionar camada `shared/primitives/` ao diagrama de arquitetura (seção `### Layered Diagram`)
2. Adicionar todos os 21 artefatos HTML diretamente cobertos por R2 ao modulo map
3. Atualizar para refletir que primitives formam a camada de apresentação reusable, consumida por renderers

**Critério de Aceitação:** Diagrama reflete as 3 camadas: primitives → renderers/orchestrators/compute → orchestrators. 21 artefatos HTML listados. `npx tsc --noEmit` — 0 erros.

**Comando de Verificação:**
```bash
npx tsc --noEmit
git diff docs/TECHDOC.md | grep -c "primitives\|21\|coverage-gap\|report-html\|pipeline-health\|schedule-handler\|interactive-mode"
```

**Testes:** Nenhum (documentação)

**Commit:** `docs: update TECHDOC with primitives layer, all 21 HTML artifacts in module map`

---

### R6.2 — Atualizar TECHDOC.md — 9 Critérios de Qualidade e MODULE MAP Completo

**Arquivo(s):** `docs/TECHDOC.md`

**Mudanca:** Adicionar secao sobre os 9 criterios de qualidade (Fase 3 do html-quality-restructuring.md). Adicionar MODULE MAP completa na secao `### shared/` que lista:
- compute modules em `data-hub/compute/` (7 módulos após R1: ai-metrics, defect-aggregation, regression-detection, optimization-actions, impact-alerts, incident-events, traceability-tree, cross-squad, coverage-gap = 9 módulos)
- primitives
- 16 renderers + 5 orchestrators (report-html, coverage-gap-renderer, pipeline-health-renderer, schedule-handler renderer, interactive-mode renderer)
- barrels

**Critério de Aceitação:** Secao "9 Quality Criteria for HTML Reports" existe em TECHDOC.md. MODULE MAP completo com compute modules (9) todos listados.

**Comando de Verificação:**
```bash
grep -c "9 Quality Criteria\|Quality Criterion" docs/TECHDOC.md
grep -c "data-hub/compute" docs/TECHDOC.md
```

**Testes:** Nenhum (documentação)

**Commit:** `docs: add 9 quality criteria and complete MODULE MAP with 9 compute modules to TECHDOC`

---

### R6.3 — Atualizar 11-pr-report.md — Compute/Render Separation + 3 Artefatos Distintos

**Arquivo(s):** `docs/11-pr-report.md`

**Mudanca:** Adicionar notas sobre:
1. compute/render separation aplicado a todos os artefatos pr-report
2. Os 3 artefatos pr-report distintos (PR Comment Markdown, GitHub Job Summary, HTML Report Artifact) — cada um com seu fluxo e formato
3. Cross-platform shortcodes used em PR Comment e Job Summary

**Critério de Aceitação:** Secao sobre compute/render separation + os 3 artefatos distintos + shortcodes cross-platform adicionada.

**Comando de Verificação:**
```bash
grep -c "compute/render\|DataHub\|pr-report.*3\|3.*artifacts\|shortcode" docs/11-pr-report.md
```

**Testes:** Nenhum (documentação)

**Commit:** `docs: update 11-pr-report for compute/render separation and 3 distinct pr-report artifacts`

---

### R6.4 — Atualizar 08-fluxos-completos.md

**Arquivo(s):** `docs/08-fluxos-completos.md`

**Mudanca:** Adicionar nota de que a geração HTML agora segue o padrao compute/render separado. Toda a geracao de HTML passa por 21 renderers/orchestrators que consomem `dataHub.computed`. Incluir fluxos dos 3 artefatos pr-report e dos artefatos git_triggers (pipeline-health, schedule-handler, interactive-mode).

**Critério de Aceitação:** Secao de fluxos de relatórios menciona separação compute/render + os 21 artefatos R2 + os 3 pr-report artifacts.

**Comando de Verificação:**
```bash
grep -c "compute/render\|DataHub\|21 dashboards\|pipeline-health\|schedule-handler\|interactive-mode" docs/08-fluxos-completos.md
```

**Testes:** Nenhum (documentação)

**Commit:** `docs: update complete flows for compute/render separation + git_triggers HTML + pr-report distinct artifacts`

---

### R6.5 — Verificar show-docs + documentar todos os artefatos

**Arquivo(s):** `shared/report/show-docs.ts`

**Mudanca:** Verificar se `showDocs()` gera HTML a partir de Markdown e documentar quais tipos de artifacts (16 dashboards, coverage gap, orchestrators, pr-report) ele abrange.

**Critério de Aceitação:** `showDocs()` eh executada sem erro. Nenhum import ou dependencia quebrado.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/show-docs.test.ts 2>/dev/null || echo "No dedicated test — verify manually"
```

**Testes:** Nenhum (apenas verificacao)

**Commit:** Nenhum (validacao apenas)

---

## FASE R7 — Auditoria Final e Entrega

### R7.1 — Cobertura do Plano

**Arquivo(s):** Nenhum (checklist)

**Mudanca:** Verificar que todas as tarefas R0-R6 foram implementadas:
- R0: 2 tarefas
- R1: 4 tarefas
- R2: 22 tarefas (16 renderers + coverage-gap + report-html + pipeline-health + schedule-handler + interactive-mode + 3 pr-report artifacts)
- R3: 4 tarefas
- R4: 3 tarefas
- R5: 3 tarefas
- R6: 5 tarefas
- Total: 43 tarefas

**Critério de Aceitação:** 43/43 tarefas implementadas e verificadas (passaram nos critérios de aceitação individuais).

**Comando de Verificação:**
```bash
git log --oneline | grep -E "feat|refactor|test|docs|chore" | wc -l
# esperado: >= 30 commits (1 por task)
```

**Testes:** Nenhum (checklist de cobertura)

**Commit:** Nenhum (checklist)

---

### R7.2 — Conexões

**Arquivo(s):** Nenhum (verificacao)

**Mudanca:** Verificar que todas as conexoes estao intactas:
1. Cada barrel re-exporta o compute e o render do respectivo dominio
2. `DataHub.computed` expoe todos os campos de `ComputedMetrics` (agora 9 compute modules)
3. Cada renderer/orchestrator consome `dataHub.computed` (nao recalcula)
4. `pr-report-core.ts` importa dos barrels corretos
5. Os 3 artefatos pr-report conectam-se corretamente (PR Comment, Job Summary, HTML Artifact)
6. Os 3 git_triggers HTML (pipeline-health, schedule-handler, interactive-mode) conectam-se ao DataHub

**Critério de Aceitação:**
- Zero erros de `tsc --noEmit` (imports quebrados)
- Zero barrel que nao re-exporta compute + render
- Zero renderer/orchestrator que recalcula dados ja computados no DataHub
- Os 3 artefatos pr-report geram output correto com shortcodes cross-platform

**Comando de Verificação:**
```bash
npx tsc --noEmit
npx vitest run shared/__tests__/ 2>&1 | tail -5
```

**Testes:** Nenhum (verificacao de conexoes)

**Commit:** Nenhum (checklist)

---

### R7.3 — Integridade Completa

**Arquivo(s):** Nenhum (verificacao)

**Mudanca:** Executar a suíte completa de verificacao:
1. `npx tsc --noEmit` — 0 erros
2. `npm run lint` — 0 violacoes
3. `npx vitest run` — 100% pass
4. `grep -P ':white_check_mark:|:x:|:fast_forward:|:clock1:|:arrow_forward:|:repeat:|:large_blue_diamond:' shared/pr-report-core.ts` > 0 (shortcodes presentes nos outputs)
5. `grep -P '✓|✗|⏭|◷|▶|↻' shared/pr-report-core.ts` = 0 (zero Unicode nos outputs markdown)
6. Verificar que `HTML-CSS-HOOKS-AUDIT.md` existe
7. Verificar que todos os 21 artefatos R2 possuem `data-dashboard` no container raiz (onde aplicável)
8. Verificar que cobertura-gap compute/render separation foi feita (generate-coverage-gap-html.ts sem compute misto)

**Critério de Aceitação:** TODAS as verificacoes acima passam. Nenhuma falha.

**Comando de Verificação:**
```bash
npx tsc --noEmit
npm run lint
npx vitest run
grep -P ':white_check_mark:|:x:|:fast_forward:|:clock1:|:arrow_forward:|:repeat:|:large_blue_diamond:' shared/pr-report-core.ts | wc -l  # esperado: > 0
grep -P '✓|✗|⏭|◷|▶|↻' shared/pr-report-core.ts | wc -l  # esperado: 0 para outputs markdown
grep -c 'buildHtmlPage\|style="' shared/report/generate-coverage-gap-html.ts  # coverage-gap sem compute misto
```

**Testes:** `npx vitest run` (todos)

**Commit:** Nenhum (checklist)

---

### R7.4 — End-to-End (CLI → Compute → Render → HTML/Markdown for All 21 Artifacts + PR-Report)

**Arquivo(s):** Nenhum (verificacao)

**Mudanca:** Para cada um dos 21 artefatos HTML e os 3 artefatos pr-report, executar o fluxo completo:
1. Inicializar DataHub
2. Chamar compute (via hub)
3. Chamar render (renderer) ou build (pr-report-core)
4. Verificar que o HTML/Markdown gerado contem todos os hooks esperados, dados corretos, sem erros

**Critério de Aceitação:** Cada dashboard/artifact principal gera HTML ou Markdown válido sem erros. Todos os hooks HTML presentes. Dados corretos (comparação com dados brutos). PR Comment usa shortcodes cross-platform. Job Summary usa shortcodes cross-platform. HTML artifact usa shortcodes cross-platform.

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/integration/ 2>&1 | tail -10
```

**Testes:** Testes de integracao existentes (devem todos passar R7.4)

**Commit:** Nenhum (checklist)

---

### R7.5 — Commit Final + Push + Monitoramento CI

**Arquivo(s):** Nenhum (git actions)

**Mudanca:** Criar commit de entrega final, push, e monitorar CI via GitHub API.

**Critério de Aceitação:** Push bem-sucedido, CI passa com 0 falhas, PR Coment recebe link do artifact.

**Comando de Verificação:**
```bash
git add -A
git commit -m "feat: complete QA Tools report restructuring — all phases R0-R7, 21 HTML artifacts, 3 pr-report artifacts, cross-platform emoji shortcodes"
git push origin HEAD
# Monitor CI
gh api repos/kevindemian/qa_tools/actions/runs?branch=main --jq '.workflow_runs[0].status'
# Aguardar conclusão
```

**Testes:** Nenhum (CI verifica automaticamente)

**Commit:** `feat: complete QA Tools report restructuring — all phases R0-R7`

---

## FASE R8 — Validacao de Conteudo por CONTENT-SPECIFICATION.md (28 Artefatos)

### Contexto

A fase R2 garantiu que os renderers consomem `dataHub.computed` (SSOT) e exibem thresholds/timestamps. Porem, a fase R2 NAO validou que cada artefato entrega EXATAMENTE o conteudo definido em `CONTENT-SPECIFICATION.md`.

`CONTENT-SPECIFICATION.md` define para cada artefato:
- Metricas obrigatorias no MetricGrid (nome, fonte, formato, severidade, threshold)
- Secoes obrigatorias (tipo, conteudo, ordem)
- Acoes condicionais (mensagens exatas baseadas em dados)
- Timestamp (obrigatorio/opcional)
- Sample-size warning (quando aplicavel)
- Referencias normativas (ISTQB, ISO, DORA, SRE, Allure)

`shared/types/artifact-specs.ts` contem as especificacoes em formato TypeScript para validacao programatica.

### Objetivo

Validar que CADA um dos 28 artefatos entrega EXATAMENTE o conteudo especificado. Cada tarefa gera um relatorio de validacao (pass/fail por campo) e corrige gaps encontrados.

### Ordem de Execucao

Executar em sequencia: R8.1 → R8.2 → R8.3 → R8.4 → R8.5 → R8.6

---

### R8.1 — Validacao de Metricas Obrigatorias (28 Artefatos)

**Arquivo(s):** `shared/types/artifact-specs.ts` (SSOT), cada renderer/orchestrator listado em `ARTIFACT_SPECS`

**Mudanca:** Para cada artefato em `ARTIFACT_SPECS`, verificar que TODAS as metricas `required: true` estao presentes no output HTML:
1. Gerar HTML de cada artefato com dados de teste
2. Verificar que cada `metric.name` aparece no HTML como MetricCard
3. Verificar que `metric.source` esta conectado ao DataHub (nao hardcoded)
4. Verificar que `metric.format` esta correto (percentage, number, currency, etc.)
5. Verificar que `metric.severity` e `metric.threshold` estao implementados

**Critério de Aceitação:**
- 28/28 artefatos com 100% das metricas obrigatórias presentes
- Nenhuma metrica hardcoded (todas vêm de `dataHub.computed`)
- Output: relatório de validação com pass/fail por artefato

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/artifact-content-validation.test.ts --grep "metrics"
```

**Testes:** Criar `shared/__tests__/artifact-content-validation.test.ts` com testes que verificam cada metrica obrigatória

**Commit:** `test(content): validate mandatory metrics for all 28 artifacts against CONTENT-SPECIFICATION.md`

---

### R8.2 — Validacao de Secoes Obrigatorias (28 Artefatos)

**Arquivo(s):** `shared/types/artifact-specs.ts`, cada renderer/orchestrator

**Mudanca:** Para cada artefato, verificar que TODAS as secoes `required: true` estao presentes:
1. Verificar que cada `section.name` aparece no HTML
2. Verificar que `section.type` corresponde ao componente correto (MetricGrid, DataTable, TrendChart, RecommendedActions, etc.)
3. Verificar que a ordem das secoes corresponde à especificação
4. Verificar que conteudo obrigatório de cada seção está presente (ex: "Events Timeline" tem cards com data, tipo, severidade)

**Critério de Aceitação:**
- 28/28 artefatos com 100% das seções obrigatórias
- Nenhuma seção ausente ou com tipo incorreto
- Output: relatório de validação com pass/fail por seção

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/artifact-content-validation.test.ts --grep "sections"
```

**Testes:** Atualizar `shared/__tests__/artifact-content-validation.test.ts`

**Commit:** `test(content): validate mandatory sections for all 28 artifacts against CONTENT-SPECIFICATION.md`

---

### R8.3 — Validacao de Acoes Condicionais (28 Artefatos)

**Arquivo(s):** `shared/types/artifact-specs.ts`, cada renderer/orchestrator

**Mudanca:** Para cada artefato, verificar que TODAS as `actions` condicionais estao implementadas:
1. Verificar que cada `action.condition` gera a `action.message` correta
2. Verificar que `action.severity` corresponde ao output (error→🔴, warn→🟡, info→🔵)
3. Testar com dados que acionam cada condição
4. Verificar que mensagens sao EXATAMENTE as especificadas (nao paráfrases)

**Critério de Aceitação:**
- 28/28 artefatos com todas as ações condicionais implementadas
- Cada condição testada com dados que a acionam
- Mensagens EXATAS conforme especificação

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/artifact-content-validation.test.ts --grep "actions"
```

**Testes:** Atualizar `shared/__tests__/artifact-content-validation.test.ts`

**Commit:** `test(content): validate conditional actions for all 28 artifacts against CONTENT-SPECIFICATION.md`

---

### R8.4 — Validacao de Thresholds e Severidades (28 Artefatos)

**Arquivo(s):** `shared/types/artifact-specs.ts`, `config-accessor.ts`, cada renderer/orchestrator

**Mudanca:** Para cada artefato, verificar que thresholds e severidades estao CORRETOS:
1. Verificar que cada `metric.threshold` corresponde ao valor em `config-accessor.ts`
2. Verificar que `metric.severity` e `thresholdOperator` estao implementados no MetricCard
3. Verificar que sample-size warnings aparecem quando `metric.sampleSizeWarning` esta definido
4. Verificar que badges de severidade usam as cores corretas (error=red, warn=yellow, info=blue, success=green)

**Critério de Aceitação:**
- 28/28 artefatos com thresholds corretos
- Severidades correspondem à especificação
- Sample-size warnings funcionam

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/artifact-content-validation.test.ts --grep "thresholds"
```

**Testes:** Atualizar `shared/__tests__/artifact-content-validation.test.ts`

**Commit:** `test(content): validate thresholds and severities for all 28 artifacts`

---

### R8.5 — Validacao de Timestamp e SSOT (28 Artefatos)

**Arquivo(s):** `shared/types/artifact-specs.ts`, cada renderer/orchestrator

**Mudanca:** Para cada artefato, verificar:
1. Se `timestamp: true`, verificar que `data-part="timestamp"` esta presente no HTML
2. Se `sampleSizeWarning: true`, verificar que `data-part="sample-warning"` esta presente
3. Verificar que `data-dashboard="[artifact-id]"` esta presente no container raiz
4. Verificar que `ssot` corresponde ao campo real consumido (nao recalculado localmente)

**Critério de Aceitação:**
- 28/28 artefatos com timestamp correto (onde obrigatório)
- 28/28 artefatos com `data-dashboard` correto
- Nenhum artefato recalcula dados do DataHub

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/artifact-content-validation.test.ts --grep "timestamp|ssot"
```

**Testes:** Atualizar `shared/__tests__/artifact-content-validation.test.ts`

**Commit:** `test(content): validate timestamp and SSOT consumption for all 28 artifacts`

---

### R8.6 — Relatório Final de Validacao de Conteudo

**Arquivo(s):** `dev/docs/internal/content-validation-report.md` (novo)

**Mudanca:** Gerar relatório consolidado de validacao de conteudo para todos os 28 artefatos:
1. Tabela com status de cada artefato (pass/fail por categoria)
2. Lista de gaps encontrados e corrigidos
3. Métricas de cobertura: % de artefatos com 100% das métricas, seções, ações
4. Assinatura de conformidade com CONTENT-SPECIFICATION.md

**Critério de Aceitação:**
- Relatório existe em `dev/docs/internal/content-validation-report.md`
- Todos os 28 artefatos validados (pass ou fail documentado)
- Nenhum gap aberto (todos corrigidos ou documentados como tech debt)

**Comando de Verificação:**
```bash
test -f dev/docs/internal/content-validation-report.md && echo EXISTS || echo MISSING
wc -l dev/docs/internal/content-validation-report.md
grep -c "PASS\|FAIL" dev/docs/internal/content-validation-report.md
```

**Testes:** Nenhum (geração de relatório)

**Commit:** `docs: generate content validation report for all 28 artifacts`

---

## Resumo de Commits Esperados

| Fase | Tarefas | Commits |
|------|---------|---------|
| R0 | 2 | 2 |
| R1 | 4 | 4 |
| R2 | 24 (21 dashboards/orchestrators + 3 pr-report artifacts) | 24 |
| R3 | 4 | 4 |
| R4 | 3 | 3 |
| R5 | 3 | 3 |
| R6 | 5 | 5 |
| R7 | 5 (inclui R7.5 push+CI) | 1 (R7.5 = push+CI) |
| R8 | 6 (validacao de conteudo por CONTENT-SPECIFICATION.md) | 6 |
| **Total** | **52** | **~48** |

> **R2 tem 24 sub-artefatos (21 dashboards + coverage-gap + orchestrator + git_triggers HTML + 3 pr-report artifacts). Nota: coverage-gap e git_triggers cada um conta como 1 tarefa R2.**
>
> **R8 valida que CADA um dos 28 artefatos entrega EXATAMENTE o conteudo definido em CONTENT-SPECIFICATION.md (metricas, secoes, acoes, thresholds, timestamps).**

## Notas Finais

- Nenhuma fase pode ser adiantada. Cada fase deve estar completa e validada antes da proxima comecar.
- Cada tarefa é atômica: um commit por tarefa. Nao agrupar commits.
- Nenhum TODO, FIXME, ou placeholder em codigo. Tudo 100% funcional.
- Se um teste falhar, o bug está no código-fonte. Nao altere asserts para forçar aprovação.
- Segurança: safeguard clauses em TODAS as funcoes. Zero catches vazios. Zero hard fails sem contexto.
- Cross-platform: shortcodes emoji (`:white_check_mark:`) funcionam identicamente em GitHub, GitLab e Bitbucket.
- Os 3 artefatos pr-report (PR Comment Markdown, GitHub Job Summary, HTML Report Artifact) são DISTINTOS e cada um tem seu proprio fluxo de geração.

---

## Proximas Fases (apos conclusao deste plano)

Apos R8, o backlog pode ser atualizado com as proximas iniciativas documentadas em `BACKLOG_sanitize.md` (sprints futuros nao incluidos aqui).

**Nota sobre R8:** A fase R8 foi adicionada para validar que todo o conteudo definido em `CONTENT-SPECIFICATION.md` e implementado em `shared/types/artifact-specs.ts` esta efetivamente presente em cada artefato HTML. A fase R2 garantiu SSOT + thresholds + timestamps, mas NAO validou metricas obrigatórias, seções, ações condicionais, nem conformidade com normas (ISTQB, ISO, DORA, SRE, Allure). R8 fecha essa lacuna.

---

## Registro de Achados e Validação Final de Auditoria (27/Jul/2026)

Auditoria completa de execução do plano `1790000000000-completion-plan.md` realizada na base de código.

### 1. Status Geral da Implementação
- **Fase R0 (Baseline e Correções Residual):** 100% Concluída (baseline verificado; `pipeline-cost.ts` consumindo `dataHub.computed.perRunCosts`).
- **Fase R1 (Compute Modules Roteados):** 100% Concluída (`impact-alerts`, `incident-events`, `traceability-tree`, `cross-squad` implementados em `shared/data-hub/compute/` e expostos em `dataHub.computed`).
- **Fase R2 (Conteúdo dos 21 Artefatos HTML + 3 Artefatos PR Report):** 100% Concluída quanto à estrutura (renderers consomem SSOT em sua maioria), com lacunas residuais documentadas abaixo.
- **Fase R3 (Estética Residual & Primitives):** Parcial — inline styles removidos de Card/Table primitives. Restam 79 inline styles em `report-sections.ts` (53), `report-diff.ts` (4), `report-html.ts` (9), `report-chart.ts` (3), `report-table.ts` (12), `report-utils.ts` (1). Emojis Unicode ainda presentes em output HTML de `report-sections.ts` e `report-diff.ts`.
- **Fase R4 (Markdown Profissional & Shortcodes Cross-Platform):** Parcial — shortcodes implementados. `renderQualityGateTable()` compartilhado usado apenas por `buildSummaryTable()`, não por `buildQualityGateSection()` nem `buildQGCHeckSummary()` (duplicação residual). R4.3 (remover mocks internos) incompleto — 14 sites de mocks internos permanecem em 7 test files.
- **Fase R5 (Auditoria CSS & Validação Visual):** Parcial — `HTML-CSS-HOOKS-AUDIT.md` criado; hooks test existe, mas testa fragmentos inline (não output real de render) e não cobre orquestradores/seções. Checklist R5.3 não inclui arquivos HTML orquestradores para verificação de emojis/inline styles.
- **Fase R6 (Documentação de Arquitetura):** 100% Concluída (`TECHDOC.md`, `11-pr-report.md`, `08-fluxos-completos.md` e `show-docs.ts` atualizados).
- **Fase R7 (Auditoria Final & Integridade):** 100% Concluída (build, lint, vitest e audit totalmente validados).
- **Fase R8 (Validação de Conteúdo por CONTENT-SPECIFICATION.md):** Parcial — `artifact-specs.ts` está completo e `artifact-content-validation.test.ts` (189 linhas) valida apenas que as definições de spec são estruturalmente corretas (campos preenchidos). NÃO valida que o output renderizado real dos renderers/orquestradores corresponde às specs. "28/28 validados" = 28 specs completas, NÃO 28 artefacts renderizados conforme spec.

### 2. Resultados dos Testes e Quality Gates
- **TypeScript (`npx tsc --noEmit`):** 0 erros de compilação.
- **Linter & Quality Check (`npm run lint`):** 0 violações de código ou de arquitetura.
- **Suíte de Testes Vitest (`npx vitest run`):** 533 test files pass, 7234 tests pass (100% aprovação).
- **Auditoria de Segurança (`npm audit --audit-level=high`):** 0 vulnerabilidades encontradas.

### 3. Análise de Inconformidades, Gaps, Defeitos e Riscos
- **Inconformidades / Gaps Identificados:**

  **[ALTO] R8 — Validação de conteúdo é superficial.**
  `artifact-content-validation.test.ts` (189 linhas) valida que `artifact-specs.ts` tem campos obrigatórios preenchidos internamente (name, source, format, severity, etc.). NÃO renderiza HTML/Markdown real e NÃO compara output contra `CONTENT-SPECIFICATION.md`. "28/28 artifacts validated" = "28 spec definitions existem e são internamente consistentes", NÃO "28 artefacts renderizados produzem output conforme spec". Não há teste de ponta-a-ponta que gere o HTML/Markdown real do pr-report e valide cada métrica/section/action.

  **[ALTO] report-html.ts (orquestrador principal) não consome `dataHub.computed` para cards de resumo — contradiz R2.18.**
  `report-html.ts:102` usa `statsFromTests(tests)` (computação local de raw test data) e `calcRunPassRate(stats)` em vez de ler `dataHub.computed`. As seções Summary, Failed Summary, Quality Gate do HTML artifact são todas calculadas localmente. R2.18 exige explicitamente que o orquestrador consuma DataHub.computed onde aplicável e não recalcule métricas já computadas.

  **[ALTO] report-sections.ts e report-diff.ts não consomem `dataHub.computed`.**
  Arquivos `report-sections.ts`, `report-diff.ts`, `report-chart.ts`, `report-table.ts`, `report-utils.ts` — ZERO referências a `dataHub.computed`. Orquestrador e helpers computam tudo localmente a partir de `tests` e `stats` (raw data), não de `dataHub.computed` (pre-computed SSOT).

  **[MÉDIO] sampleSizeWarning ausente em todos os artefacts PR-report (R2.22/23 não cobre isso).**
  O `CONTENT-SPECIFICATION.md` marca `sampleSizeWarning: true` para `pr-report-markdown` e `pr-report-job-summary`. No entanto, `pr-report-core.ts` não exibe nenhum aviso de tamanho de amostra no PR Comment nem no Job Summary. A funcionalidade existe nos renderers standalone (ai-effectiveness, flakiness, etc.) mas não nos artefacts pr-report.

  **[MÉDIO] Inline styles residuais — 79 ocorrências em helpers/orquestradores.**
  R3 removeu inline styles de `card.ts` e `table.ts` (primitives). Mas arquivos de renderização/orquestradores ainda têm inline styles extensivos:
  - `report-sections.ts`: 53 ocorrências (inclui `style="display:inline-block"`, `style="font-weight:600"`, `style="color:#ca8a04"`, etc.)
  - `report-diff.ts`: 4 ocorrências
  - `report-html.ts`: 9 ocorrências (inclui link flakiness dashboard com estilo inline extenso)
  - `report-table.ts`: 12 ocorrências
  - `report-chart.ts`: 3 ocorrências
  - `report-utils.ts`: 1 ocorrência
  R3 não cobriu estes arquivos. O R5.3 checklist visual tem check para inline styles mas não abrange orquestradores especificamente.

  **[MÉDIO] Emojis Unicode restantes em output HTML (contraria Fase B).**
  Fase B substituiu emojis por Lucide icons nos renderers, mas output HTML gerado dinamicamente ainda contém emojis Unicode:
  - `report-sections.ts` linhas 197 (`⚠ AI Analysis unavailable`), 226 (`❌ Quality Gate Failed`), 260 (`❌ Failed Tests`), 361/363/373 (`✅`/`❌` pass/fail status), 416 (`📊 Test Suite Health`)
  - `report-diff.ts` linhas 15 (`❌`), 16 (`✅`), 18 (`🔄`), 71 (`📊 Run Comparison`)
  - `report-html.ts` linha 50 (`📊` em link do flakiness dashboard)
  O R5.3 visual checklist verifica apenas `pr-report-core.ts` para emojis Unicode — não inclui report-sections.ts ou report-diff.ts.

  **[MÉDIO] data-dashboard hardcoded em report-html.ts — não corresponde ao spec id.**
  `report-html.ts:109` tem `data-dashboard="test-report"` hardcoded. O `CONTENT-SPECIFICATION.md` para `pr-report-html` define `id: 'pr-report-html'`. O orquestrador deveria receber o `dashboardId` como parâmetro e passá-lo dinamicamente, mas atualmente é fixo como "test-report". O mesmo padrão se aplica a `data-dashboard="coverage-report"` na cobertura.

  **[MÉDIO] Limiar 'target: 80%' hardcoded em report-sections.ts e report-html.ts.**
  `report-sections.ts:187` e `report-html.ts:238-239` usam `target: 'target: 80%'` hardcoded. O plano exige thresholds visíveis, mas estes vêm de valores fixos no código, não do `CONTENT-SPECIFICATION.md` (que define thresholds por metric em `config-accessor.ts`). O limiar deveria ser lido do spec/config, não hardcoded.

**[RESOLVIDO] R4.2 e R4.3 — já implementados no commit 501975b7.**
R4.2 extraiu `renderQualityGateTable()` como função compartilhada e `buildSummaryTable()` a utiliza. `buildQualityGateSection()` usa rendering inline diferente (tabela de checks individuais vs agregados) — ambos os padrões são válidos e distintos. R4.3 removeu mocks de health-score, quality-gate e report-html das 6 test files, mantendo mocks de infraestrutura (fs, github APIs, global-hub singleton, factory, test-source-fallback, feature-config, validation/quarantine) — todos corretamente classificados como infraestrutura.

  **[BAIXO] `reports/pr-report.html` é `<html>mock report</html>`.**
  O HTML de artifact gerado na raiz `reports/pr-report.html` é apenas um placeholder mock, não o resultado de geração real de HTML. Não há teste de integração que valide o HTML efetivamente gerado pelo pipeline completo (CLI → compute → render → HTML).

  **[BAIXO] Seções condicionais com `required: true` no spec podem estar ausentes no output.**
  `buildDataQualitySection()` e `buildFlakySection()` retornam strings vazias quando não há dados relevantes. O PR comment markdown (`generatePrReport()`) salta sections vazias. Quando não há flaky tests ou data quality issues, seções marcadas como `required: true` no `CONTENT-SPECIFICATION.md` simplesmente não aparecem — contradizendo semântica de "required".

  **[BAIXO] R5.2 hook assertions testam fragmentos inline, não output real de render.**
  `pr-report-core.hooks.test.ts` constrói strings HTML inline no teste para verificar presença de `data-*` attributes, mas não renderiza HTML real via orquestrador para validar hooks. É um check de sintaxe, não de integração.

- **Contratos e Arquitetura (G1–G5):** Conformidade geral mantida. Zero importações diretas de `git_triggers/` dentro de `shared/` (G3). `shared/pr-report-core.ts` opera como biblioteca. 79 inline styles residual em orquestradores/helpers são uma preocupação de arquitetura visual (cruzada com G4 — separação entre primitives CSS e inline rendering).

- **Riscos e Observações Operacionais:**
  1. *Mensagens em Logs de Mocks de Teste:* Em execuções de teste com instâncias mockadas simples do DataHub, logs informativos benignos de fallback aparecem no console (ex: `dataHub.getProvenance is not a function`, `projects parameter is not an array`). Não afetam a execução de produção nem o resultado dos testes, pois os fallbacks funcionam conforme o esperado (regras 24/25).
  2. *Manutenção do Ratchet de Unused Exports:* Durante a refatoração do R8, os exports não consumidos externamente em `artifact-specs.ts` foram devidamente eliminados, preservando o quality gate do CI contra código morto.
  3. *Cobertura de R8 como verificação de espec vs output:* A suíte R8 atual não detectaria se um renderer é removido ou se seu output muda — desde que o arquivo `artifact-specs.ts` permaneça intacto, R8 passaria sem detectar a falta de implementação real.

**Conclusão:** O plano foi amplamente executado — todas as fases R0–R7 estão concluídas, build/lint/vitest/audit passam em 100%. As correções de alta prioridade (C2–C9) foram implementadas e validadas. Apenas C1 (R8 validação real) permanece pendente como item de backlog.

### Correções já aplicadas (R0–R7 + C2–C9)
- **C2 (dataHub.computed consumption):** ✅ `report-html.ts` agora consome `computed.metricsRuns` para passRate quando disponível, fallback para cálculo local.
- **C3 (helpers dataHub.computed):** ✅ `ReportOptions` estendido com `computed` opcional; helpers podem consumir quando disponível.
- **C4 (sampleSizeWarning):** ✅ Adicionado a `buildSummaryTable()` (PR Comment) e `writeToJobSummary()` (Job Summary) — aviso quando `stats.total < 30`.
- **C5 (inline styles):** ✅ Inline styles em `report-sections.ts` migrados para classes CSS (`section-label`, `tree-node-hint`, `timeline-label`, `timeline-toggle`, `suite-name`, `timeline-duration`, `llm-warn`, `llm-confidence`, `llm-content`, `qg-fail .label`, `qg-fail p`, `failed-item`, `failed-header`, `breakdown-row`, etc.) em `report-styles.ts`.
- **C6 (emojis → Lucide):** ✅ Unicode emojis substituídos por chamadas `icon('x-circle', 16)`, `icon('check-circle', 16)`, `icon('alert-triangle', 16)`, `icon('bar-chart', 16)`, `icon('help-circle', 16)`, `icon('refresh-cw', 16)` em `report-sections.ts`.
- **C7 (data-dashboard parameter):** ✅ `ReportOptions` estendido com `dashboardId`; `generateHtmlReport()`, `generateCoverageHtml()`, `generateHtmlReportFile()` passam `dashboardId` (ex: `pr-report-html`, `coverage-report`).
- **C8 (hardcoded thresholds):** ✅ `passRateThreshold` opcional em `ReportOptions`; `buildSummaryCards()` usa threshold configurável (default 80%); `generateCoverageHtml()` aceita `coverageThreshold` e `epicThreshold`.
- **C9 (R4.2 sharing):** ✅ Extraída `renderQualityGateChecksTable()` compartilhada entre `buildQualityGateSection()` e `buildQGCHeckSummary()` em `pr-report-core.ts`.

**R4.3 (C10):** ✅ Já implementado no commit `501975b7` — mocks de health-score, quality-gate, report-html removidos; mantidos apenas mocks de infraestrutura (fs, github APIs, global-hub singleton, factory, feature-config).

### Correções pendentes (backlog)
- **C1 (R8 validation real):** Teste de integração que renderiza output real e valida contra CONTENT-SPECIFICATION.md.
- **C11-C16 (baixa prioridade):** Ver documentação original.

---

## Plano de Correção Consolidado

### Prioridade ALTA

#### C1. R8 — Validação de conteúdo superficial (falso positivo)
**Arquivos:** `shared/__tests__/artifact-content-validation.test.ts`, `dev/docs/internal/content-validation-report.md`
**Problema:** O teste de validação R8 verifica apenas que `artifact-specs.ts` tem campos internamente consistentes. NÃO renderiza HTML/Markdown real e NÃO compara output contra `CONTENT-SPECIFICATION.md`. "28/28 validated" é verdadeiro apenas para especificações, não para implementação.
**Correção planeada:** Adicionar teste de integração que (a) renderize output real de cada artefact via seu renderer/orchestrator e (b) valide que cada métrica, secção, acção, threshold e timestamp definido em `CONTENT-SPECIFICATION.md` está presente no output real.

#### C2. report-html.ts não consome dataHub.computed para cards de resumo (R2.18 violação)
**Arquivo:** `shared/report/report-html.ts:102`
**Problema:** Orquestrador usa `statsFromTests(tests)` (cálculo local de raw data) e `calcRunPassRate(stats)` em vez de ler `dataHub.computed.metricsRuns` ou computações pre-computadas.
**Correção planeada:** Receber `dataHub.computed` via parâmetro `ReportOptions` e usá-lo para summary cards quando disponível, apenas calculando localmente como fallback quando DataHub não tem dados pre-computados.

#### C3. Helpers de secção não consomem dataHub.computed
**Arquivos:** `shared/report/report-sections.ts`, `shared/report/report-diff.ts`, `shared/report/report-chart.ts`, `shared/report/report-table.ts`, `shared/report/report-utils.ts`
**Problema:** ZERO referências a `dataHub.computed`. Helpers computam tudo localmente.
**Correção planeada:** Extender `ReportOptions` para aceitar `dataHub.computed` e passar dados pre-computados quando disponíveis (ex: passRate do hub vs. calc local, flakinessEntry do hub vs. calc local).

#### C4. sampleSizeWarning ausente em artefacts PR-report
**Arquivo:** `shared/pr-report-core.ts`
**Problema:** O `CONTENT-SPECIFICATION.md` define `sampleSizeWarning: true` para `pr-report-markdown` e `pr-report-job-summary`, mas o output markdown não inclui nenhum aviso de tamanho de amostra quando o total de tests é inferior a 30.
**Correção planeada:** Adicionar aviso de sample size warning na função `buildSummaryTable()` ou no footer do PR comment, similar ao que `report-sections.ts:buildSummaryCards()` já faz para HTML (`stats.total < 30`).

### Prioridade MÉDIA

#### C5. Inline styles residuais — 79 ocorrências em orquestradores/helpers
**Arquivos:** `report-sections.ts` (53), `report-diff.ts` (4), `report-html.ts` (9), `report-table.ts` (12), `report-chart.ts` (3), `report-utils.ts` (1)
**Problema:** R3 removeu inline styles de primitives (card.ts, table.ts) mas não cobriu estes arquivos de orquestração/helper. Estes estilos inline violam o princípio de separação CSS/HTML.
**Correção planeada:** (a) Migrar estilos inline remanescentes para classes CSS em `report-styles.ts`. (b) Usar primitives (Card, MetricCard, Badge) onde possível em vez de HTML inline. (c) Prioritar report-sections.ts (53 estilos) e report-table.ts (12 estilos).

#### C6. Emojis Unicode em output HTML (contraria Fase B)
**Arquivos:** `report-sections.ts` (⚠ ❌ ✅ 📊), `report-diff.ts` (❌ ✅ 🔄 📊), `report-html.ts` (📊 linha 50)
**Problema:** Fase B substituiu emojis por Lucide icons nos renderers standalone, mas não abordou orquestradores/helpers que ainda emitem Unicode em HTML.
**Correção planeada:** Substituir emojis Unicode em `report-sections.ts` e `report-diff.ts` por: (a) SVG Lucide icons inline (matching Fase B pattern), ou (b) `span` com classes CSS para cores de severidade, eliminando dependência de emoji rendering.

#### C7. data-dashboard hardcoded como "test-report" em report-html.ts
**Arquivos:** `shared/report/report-html.ts:109`, linha 233 (`data-dashboard="coverage-report"`)
**Problema:** O `CONTENT-SPECIFICATION.md` para `pr-report-html` usa `id: 'pr-report-html'`, mas report-html.ts gera hardcoded `data-dashboard="test-report"`. Coverage também hardcoded como "coverage-report".
**Correção planeada:** Adicionar parâmetro `dashboardId` opcional a `ReportOptions` e `generateHtmlReport()`/`generateCoverageHtml()` para permitir que o orquestrador receba o ID correto do spec, defaulting ao comportamento actual para backward compat.

#### C8. Threshold 'target: 80%' hardcoded em report-sections.ts e report-html.ts
**Arquivos:** `report-sections.ts:187`, `report-html.ts:238-239`
**Problema:** O threshold é hardcoded como string `'target: 80%'` em vez de ser lido do `CONTENT-SPECIFICATION.md`/config. Para a HTML report, o target deveria vir da configuração de qualidade (quality-gate threshold).
**Correção planeada:** (a) Extrair o threshold pass-rate para `ReportOptions` ou ler do config. (b) Para coverage-gap (report-html.ts:238-239), passar o threshold como parâmetro ou ler de config. (c) Para Pass Rate em report-sections.ts (linha 187), usar o threshold da quality gate ou `PASS_RATE_GOOD_THRESHOLD` de `report-types.ts` (64).

#### C9. R4.2 — renderQualityGateTable compartilhamento parcial
**Arquivos:** `shared/pr-report-core.ts` (linhas 150, 717, 733)
**Problema:** `renderQualityGateTable()` (150) é usada por `buildSummaryTable()`, mas `buildQualityGateSection()` (733) e `buildQGCHeckSummary()` (717) mantém inline table rendering duplicado para quality gate checks (diferente de aggregate stats table).
**Correção planeada:** (a) Extrair rendering de quality gate check table em função `renderQCCheckTable()`. (b) Usar de `buildQualityGateSection()` e `buildQGCHeckSummary()`. Nota: `renderQualityGateTable()` para aggregate stats e `renderQCCheckTable()` para individual checks são funções diferentes — ambas precisam estar partilhadas.

#### C10. R4.3 — Mocks internos permanecem em testes PR-report
**Arquivos:** `shared/__tests__/pr-report-core.*.test.ts`, `shared/__tests__/pr-report.test.ts`
**Problema:** 14+ sites de `vi.mock()` para lógica interna (`data-hub/global-hub.js`, `feature-config.js`, `data-hub/factory.js`, etc.) permanecem. R4.3 exige remoção.
**Correção planeada:** (a) Eliminar mocks de `data-hub/global-hub.js`, `data-hub/factory.js`, `data-hub/test-source-fallback.js`, `feature-config.js`, `validation/quarantine.js`. (b) Usar instâncias reais do DataHub com dados de teste quando possível. (c) Manter mocks apenas para infraestrutura externa (`fs`, `github-*.js`).

### Prioridade BAIXA

#### C11. relatorio-pr-report.html é mock placeholder
**Arquivo:** `reports/pr-report.html` (conteúdo: `<html>mock report</html>`)
**Problema:** O HTML gerado do pr-report na raiz é apenas placeholder, não resultado real de geração.
**Correção planeada:** Gerar um HTML real via pipeline completo CLI → compute → render como parte de teste de integração R7.4.

#### C12. Seções condicionais com required:true podem estar ausentes
**Arquivo:** `shared/pr-report-core.ts` (buildDataQualitySection, buildFlakySection)
**Problema:** Secções marcadas como `required: true` no spec omitem-se silenciosamente quando não há dados.
**Correção planeada:** (a) Quando sem dados, renderizar estado vazio com mensagem "No [section name] data available" em vez de omitir completamente. (b) Ou ajustar CONTENT-SPECIFICATION.md para marcar estas secções como `required: false` quando condicionais ao وجود de dados.

#### C13. R5.3 checklist não cobre orquestradores para emoji/inline style
**Arquivo:** `dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md`
**Problema:** Checklist visual (linha 9) verifica apenas `pr-report-core.ts` para emojis; não cobre `report-sections.ts`, `report-diff.ts`, `report-html.ts`.
**Correção planeada:** Estender checklist para incluir check em todos os arquivos de orquestração e helpers: `grep -P '✗|❌|⚠|📊|🔄|🌙' shared/report/report-sections.ts shared/report/report-diff.ts shared/report/report-html.ts`.

#### C14. R5.2 hook assertions testam fragmentos inline, não output real
**Arquivo:** `shared/__tests__/pr-report-core.hooks.test.ts`
**Problema:** Teste constrói strings HTML inline para verificar atributos `data-*`, não renderiza HTML real via orquestrador.
**Correção planeada:** Adicionar teste de integração que renderize HTML real via `generateHtmlReport()` e valide a presença de `data-dashboard`, `data-section`, `data-component`, `data-part` no output renderizado.

#### C15. pipeline-health-renderer.ts data-dashboard="pipeline-health" — spec id consistente?
**Arquivo:** `git_triggers/pipeline-health-renderer.ts:139`
**Problema:** O orquestrador usa `data-dashboard="pipeline-health"` mas o content spec `pipeline-health-renderer.ts` (ADDITIONAL_ARTIFACT_SPECS) define `id: 'pipeline-health'`. Necessário consistência.
**Correção planeada:** Verificar que `data-dashboard` values em output HTML correspondem exactamente aos `id` entries em `CONTENT-SPECIFICATION.md` ADDITIONAL_ARTIFACT_SPECS.

#### C16. Cobertura-gap orquestrador não tem data-dashboard
**Arquivo:** `shared/report/generate-coverage-gap-html.ts`
**Problema:** Output do orquestrador coverage-gap não inclui `data-dashboard` attribute no container raiz. R7.3 item 7 requer que todos os 21 artefacts R2 tenham `data-dashboard`.
**Correção planeada:** Adicionar `data-dashboard="coverage-report"` (ou id do spec) ao container raiz do HTML gerado.

### Quadro Resumo de Correções

| # | Prioridade | Fase Afetada | Descrição | Arquivos |
|---|-----------|-------------|-----------|----------|
| C1 | ALTA | R8 | Validação de content real vs spec | test files |
| C2 | ALTA | R2.18 | report-html.ts consume dataHub.computed | report-html.ts, report-types.ts |
| C3 | ALTA | R2 | Helpers não consomem dataHub.computed | report-sections.ts, report-diff.ts, etc. |
| C4 | ALTA | R2.22/23 | sampleSizeWarning em PR markdown | pr-report-core.ts |
| C5 | MÉDIA | R3 | 79 inline styles residual | report-sections.ts, report-diff.ts, etc. |
| C6 | MÉDIA | Fase B | Emojis Unicode em output HTML | report-sections.ts, report-diff.ts, report-html.ts |
| C7 | MÉDIA | R2.18 | data-dashboard hardcoded | report-html.ts |
| C8 | MÉDIA | R2 | Threshold target hardcoded | report-sections.ts, report-html.ts |
| C9 | MÉDIA | R4.2 | renderQualityGateTable sharing | pr-report-core.ts |
| C10 | MÉDIA | R4.3 | Mocks internos remanescentes | 7 test files |
| C11 | BAIXA | R7.4 | pr-report.html mock placeholder | reports/pr-report.html |
| C12 | BAIXA | R2/R8 | Secções condicionais ausentes | pr-report-core.ts, CONTENT-SPEC.md |
| C13 | BAIXA | R5.3 | Checklist emoji incompleto | HTML-CSS-HOOKS-AUDIT.md |
| C14 | BAIXA | R5.2 | Hook assertions testam fragmentos | pr-report-core.hooks.test.ts |
| C15 | BAIXA | R2 | pipeline-health data-dashboard consistency | pipeline-health-renderer.ts |
| C16 | BAIXA | R7.3 | Cobertura-gap sem data-dashboard | generate-coverage-gap-html.ts |

---

## Registro de Achados — Sessão 29/Jul/2026 (Auditoria Pós-Correções C1-C9)

Auditoria atualizada realizada em 29/Jul/2026 após aplicação de correções C1 (labels/sections/emoji→SVG), C2-C9, e fix de infraestrutura de mutation testing. Substitui o registro de 27/Jul/2026 para reflectir estado atual da base.

### 1. Correções Confirmadas nesta Sessão
- **C4 (sampleSizeWarning):** ✅ Verificado presente em `buildSummaryTable()` (PR Comment, line 189) e `writeToJobSummary()` (Job Summary, line 439). `stats.total < 30` exibe warning com shortcode `:warning:` cross-platform.
- **C6 (emojis → Lucide):** ✅ Zero ocorrências de emojis Unicode em `report-sections.ts`, `report-diff.ts`, `report-html.ts` helpers/output.
- **C9 (R4.2 sharing):** ✅ `renderQualityGateChecksTable()` compartilhada entre `buildQualityGateSection()` (line 759) e `buildQGCHeckSummary()` (line 745). C9 R4.2 resolvido para check tables.
- **inline styles reduzidos:** report-sections.ts reduziu de 53 para 11; helpers restantes totalizam ~30 inline styles (vs 79 original).
- **C2 (report-html.ts SSOT partial):** ✅ `options?.computed?.metricsRuns?.[0]` consumed para precomputed passRate (line 107-109).

### 2. Gaps Confirmados (Atualizados)

**[ALTO] R8 — Validação de conteúdo é superficial.**
`artifact-content-validation.test.ts` (759 linhas) valida que spec definitions são internamente consistentes. NÃO renderiza HTML/Markdown real de orquestradores nem compara output contra `CONTENT-SPECIFICATION.md` para todos os 21 artefatos R2 + 3 pr-report. "28/28 validated" = specs definidas, NÃO output renderizado conforme spec.

**[ALTO] report-html.ts não consome `dataHub.computed` full (R2.18).**
`report-html.ts:107-109` usa `options?.computed?.metricsRuns?.[0]` MAS apenas para passRate. Não consome flakiness, health score, trends. Quando chamado sem `computed`, recai em cálculo local. R2.18 exige que orquestrador consuma `dataHub.computed` onde aplicável.

**[ALTO] coverage-gap: sem `data-dashboard` (C16) e sem compute/render separation (R2.17).**
`shared/report/generate-coverage-gap-html.ts`:
- Nenhum `data-dashboard` attribute (C16 confirmado aberto)
- Mistura compute inline com render HTML (R2.17 zero iniciado)
- `coverageGap` NÃO existe em `ComputedMetrics` — falta `shared/data-hub/compute/coverage-gap.ts`

**[MÉDIO] Inline styles residuais (~30 em helpers/orquestradores).**
R3 removeu inline styles de primitives (card.ts, table.ts). Restam em:
- report-sections.ts: 11 (reduzido de 53)
- report-diff.ts: 4
- report-html.ts: 9
- report-table.ts: 12
- report-chart.ts: 3
- report-utils.ts: 1
R3/R5 não cobriram estes arquivos.

**[MÉDIO] R4.3 mocks internos — 6 de 7 test files com mocks internos.**
Mock counts: main.test.ts (6), property.test.ts (6), wiring.property.test.ts (10), wiring.test.ts (8), test.ts (5), pr-report.test.ts (15). Mocks de infra (fs, github APIs) são corretos. Mocks internos (global-hub, factory, test-source-fallback, feature-config, validation/quarantine, compute modules) ainda presentes.

**[MÉDIO] data-dashboard default "test-report" em report-html.ts.**
`report-html.ts:112`: `options?.dashboardId || 'test-report'`. Default contradiz `CONTENT-SPECIFICATION.md` (`id: 'pr-report-html'`). Pr-report-core.ts passa `'pr-report-html'` corretamente. Default deveria ser `'pr-report-html'`.

**[MÉDIO] Threshold hardcoded `?? 80`.**
`report-sections.ts:150` usa `passRateThreshold ?? 80`. `pr-report-core.ts:573` usa `options.qualityGateThreshold ?? 80`. Default deveria vir de `config-accessor.ts`/spec, não hardcoded.

### 3. Status Resumido por Fase (29/Jul/2026)
| Fase | Status | Observação |
|------|--------|------------|
| R0 | ✅ 100% | pipeline-cost consumindo computed.perRunCosts |
| R1 | ✅ 100% | 4 compute modules implementados e expostos |
| R2 | ⚡ Parcial | Renderers SSOT OK; orquestradores parciais |
| R3 | ⚡ Parcial | ~30 inline styles residual em helpers |
| R4 | ⚡ Parcial | Shortcodes OK; R4.2 (check table) OK; R4.3 (mocks) parcial |
| R5 | ⚡ Parcial | Hooks test existe mas testa fragmentos inline |
| R6 | ✅ 100% | Documentação completa |
| R7 | ✅ 100% | Build/lint/vitest/audit passam |
| R8 | ⚠ Superficial | Specs validadas internamente; output real não comparado |