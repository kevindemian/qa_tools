# Strategic Plan — QA Tools

> **Propósito:** Consolidar as 3 análises de capacidades em um plano incremental de médio prazo.
> **Premissa:** Nenhum novo conector. Apenas orquestrar o que já existe.
> **Filosofia:** Fase 1 extrai todo o potencial do código já existente. Fase 2 entra com sinergia máxima, alimentada pelos dados acumulados na Fase 1.

---

## Sumário Executivo

### O produto hoje

10 capacidades de coleta, 14 correlações, 11 inferências, 9 automações, 9 saídas de conhecimento. Tudo implementado, testado, mas operando como **ferramentas isoladas**.

### O produto depois do plano

1 plataforma que **coleta, correlaciona, infere, decide e age** — sem um novo conector.

### Investimento total

| Fase                           | Horas | Entregas | Depende de                |
| ------------------------------ | ----- | -------- | ------------------------- |
| Fase 1 — Orquestração          | ~18h  | 10       | Código já existe          |
| Fase 2 — Acúmulo + Sinergia    | ~12h  | 6        | N runs de dados da Fase 1 |
| Fase 3 — Inteligência Avançada | ~15h  | 4        | Fases 1 + 2               |

---

## Fase 1 — Orquestração (semanas 1-2)

> **Tudo o que já existe, só não está orquestrado.** Cada entrega tem código + testes existentes. A implementação é conectar, configurar thresholds e expor como serviço.

### Ordem incremental (respeitando dependências)

```
Semana 1
├── [1] CI Quality Gate          (30min)  ← base de todos os gates
├── [2] Pre-push Hook            (1h)     ← feedback imediato ao dev
├── [3] Failure Auto-Triage      (3h)     ← inclui gap git-blame + persist classification
├── [4] Flaky Auto-Management    (15min)  ← configurar thresholds
└── [5] Quality Weekly Report    (2h)     ← schedule + HTML automático

Semana 2
├── [6] Release Readiness Score  (3h)     ← composer + HTML
├── [7] Defect Trend Dashboard   (3h)     ← agregar classifications históricas
├── [8] Traceability Matrix      (4h)     ← HTML navegável
├── [9] Backlog Health Dashboard (2h)     ← JQL + HTML
└── [10] AI Gen Effectiveness    (2h)     ← HTML dashboard
```

---

### [1] CI Quality Gate

**Problema resolvido:** "Posso fazer merge?" vira decisão objetiva com diagnóstico.

**Código existente:**

- `shared/health-score.ts` → `calculateHealthScore()` → score 0-100 + grade + qualityGate pass/fail
- `shared/coverage-gap.ts` → `analyzeCoverageGaps()` → `gateConfig.failingEpics[]`
- `shared/metrics.ts` → `calculateFlakiness()` → taxa por teste
- `shared/flaky-auto-actions.ts` → `executeFlakyActions()` → gestão completa

**O que wirear:**
Script CLI que executa 3 funções e retorna exit code 0/1:

```
qa-quality-gate           # exit 0 se todos passam, 1 senão
qa-quality-gate --json    # saída JSON para pipeline processar
```

**Thresholds (configuráveis via env):**
| Gate | Default | Justificativa |
|---|---|---|
| Pass rate | ≥ 80% | Abaixo = regressão sistêmica |
| Flaky rate | ≤ 30% | Acima = resultados não confiáveis |
| Coverage por Epic | ≥ 70% | Abaixo = Epic em risco |
| Suite speed | ≤ 8s/teste | Acima = feedback loop degradado |

**Riscos:**

- Health score sem histórico suficiente (< 3 runs): retorna `null` em vez de falhar
- Coverage gap sem linked issues: graça (N/A) em vez de zero

**Métrica de sucesso:** % de merges que passam o gate = 80% em 2 semanas

**Rollback:** Remover script gate do `.github/workflows/`

---

### [2] Pre-push Hook

**Problema resolvido:** Desenvolvedor descobre antes do commit se a mudança quebra testes ou reduz cobertura.

**Código existente:**

- `shared/test-impact.ts` → `analyzeTestImpact()` → 3 tiers (jest, keyword, mapping)
- `shared/test-impact.ts` → `generateTestSelectionJson()` → JSON pipeline-ready
- `setup/templates/pre-push-hook.ts` → template de hook (vazio)

**O que wirear:**
Preencher o template com chamada real ao `analyzeTestImpact()` + `npm test -- --selectProjects`:

```bash
# .git/hooks/pre-push
qa-test-impact --format=json | jq -r '.impactedTests | .[]' > /tmp/impacted.txt
npx jest --listTests --findRelatedTests $(cat /tmp/impacted.txt) > /dev/null || exit 1
qa-quality-gate || exit 1
```

**Riscos:**

- Falso positivo (teste não impactado mas rodado): seguro, só roda mais testes
- Falso negativo (teste impactado não rodado): mitigado por smoke tests obrigatórios
- Tempo de execução do hook: `test-impact` leva < 1s para mapear

**Métrica de sucesso:** % de PRs com test-impact rodado = 50% em 1 mês

**Rollback:** `git config --unset core.hooksPath`

---

### [3] Failure Auto-Triage

**Problema resolvido:** Falha de teste → classificada → bug criado → assignado ao autor do diff. Zero toil.

**Código existente:**

- `shared/failure-analysis.ts` → `classifyFailure()` → ASSERTION/TIMEOUT/ENVIRONMENT/FLAKY/APPLICATION/UNKNOWN
- `shared/bug-report.ts` → `collectAutomated()` + `fileToJira()` → bug no Jira
- `shared/report-types.ts` → `categorizeFailure()` → regex fallback
- `git_triggers/pipeline-handler.ts` → `handleBugCreation()` → já cria bug (mas interativo)

**O que wirear (incluindo gaps da Análise 3):**

1. **Auto-confirm mode:** Nova flag `QA_AUTO_BUG=true` que pula `prompt.confirm()` no `handleBugCreation()`
2. **Persistir classification por run:** Salvar `FailureAnalysisResult[]` junto com `MetricsRun` no `metrics.json` (desbloqueia Defect Trend Dashboard na Fase 1)
3. **Git blame integration:** Função `getCommitAuthor(diff)` → busca autor do último commit no diff → usa como `reporter` ou `assignee` do bug

**Arquitetura da pipeline:**

```
Pipeline falha
  → classifyFailure() em cada teste falhando
  → collectAutomated() monta bug
  → getCommitAuthor() descobre responsável
  → fileToJira() cria bug + assign
  → persist classification no metrics.json
```

**Riscos:**

- LLM hallucination: mitigado por adversarial audit + Zod schema + fallback regex
- Git blame errado (commit de merge, reformatação): mitigado por `--ignore-rev`

**Métrica de sucesso:** % de falhas triadas sem intervenção humana = 70% em 2 semanas

**Rollback:** Remover `QA_AUTO_BUG=true` do env → volta a modo interativo

---

### [4] Flaky Auto-Management

**Problema resolvido:** Teste flaky detectado → bug criado → quarantine → reativado quando estabiliza. Automático.

**Código existente:**

- `shared/flaky-auto-actions.ts` → `executeFlakyActions()` → orquestra detecção + bug + quarantine
- `shared/quarantine.ts` → `quarantineTest()`, `expireQuarantine()`, `generatePipelineQuarantine()`
- `shared/metrics.ts` → `calculateFlakiness()` + `calculateFlakinessWithWindow()`
- `shared/flakiness-dashboard.ts` → `generateFlakinessHtml()` → HTML dashboard

**Status:** **Já wireado** em `batch-mode.ts`, `schedule-handler.ts`, `case19.ts`. Só precisa configurar.

**Thresholds:**
| Parâmetro | Default | Descrição |
|---|---|---|
| `QA_FLAKY_THRESHOLD` | 30% | Acima disso cria bug + quarantine |
| `QA_FLAKY_STABLE_THRESHOLD` | 5% | Abaixo disso por 10 runs → re-enable |
| `QA_FLAKY_AUTO_ACTIONS` | `true` | Auto-cria bugs Jira |

**O que wirear:**
Apenas documentar os thresholds e garantir que `QA_FLAKY_AUTO_ACTIONS=true` está no `.env.example`.

**Métrica de sucesso:** % de testes flaky com bug + quarantine automático = 90% em 2 semanas

**Rollback:** `QA_FLAKY_AUTO_ACTIONS=false`

---

### [5] Quality Weekly Report

**Problema resolvido:** Relatório de qualidade semanal gerado automaticamente, sem esforço humano.

**Código existente:**

- `shared/health-score.ts` → `calculateHealthScore()` → score + grade + gates
- `shared/coverage-gap.ts` → `analyzeCoverageGaps()` → gaps por Epic
- `shared/metrics.ts` → `getTrends()` → tendência de pass rate
- `shared/report-html.ts` → `generateReportWithFallback()` → HTML auto-contido
- `shared/report-chart.ts` → `buildTrendSection()` → chart SVG
- `git_triggers/schedule-handler.ts` → `handleRunSchedule()` → schedule GitLab

**O que wirear:**
Schedule handler que, uma vez por semana:

1. Chama `calculateHealthScore()` + `analyzeCoverageGaps()` + `getTrends()`
2. Compõe `ReportOptions` com todos os dados
3. Chama `generateReportWithFallback(flatTests, options)`
4. Salva em `reports/quality-weekly-{YYYY-MM-DD}.html`
5. (Opcional) Publica via `publish.ts`

**Riscos:** Relatório semanal sem dados se o schedule rodar antes da primeira run. Mitigado por guard `if (runCount < 1) return 'no data'`.

**Métrica de sucesso:** Relatórios gerados sem intervenção = 4/semana

**Rollback:** Remover entry do schedule

---

### [6] Release Readiness Score

**Problema resolvido:** "Esta release está pronta?" → score A-F com breakdown por dimensão.

**Código existente:**

- `jira_management/jira_resource.ts` → `checkReleaseTasksStatus()` → % tasks concluídas
- `shared/health-score.ts` → `calculateHealthScore()` → health + flakiness
- `shared/coverage-gap.ts` → `analyzeCoverageGaps()` → coverage por Epic

**O que wirear:**
Função `calculateReleaseScore(project, version)`:

```typescript
function calculateReleaseScore(project, version): ReleaseScore {
    const tasks = checkReleaseTasksStatus(project, version); // % done
    const health = calculateHealthScore(metricsStore); // health
    const coverage = analyzeCoverageGaps(jiraClient, project); // coverage %
    const flakiness = calculateFlakiness(metricsStore); // flaky rate

    return {
        score: weightedAverage(
            [tasks.pct, health.score, coverage.rawPct, 100 - flakiness * 100],
            [0.25, 0.3, 0.25, 0.2],
        ),
        grade: scoreToGrade(score),
        breakdown: { tasks, health, coverage, flakiness },
        recommendation: buildRecommendation(score, breakdown),
    };
}
```

HTML report com:

- Score + grade (A-F) no topo
- Breakdown por dimensão com status (pass/fail)
- Recomendação textual ("Para subir de D para C, aumentar cobertura da Epic X")

**Riscos:** Release sem tasks no Jira → score parcial (só health + coverage)

**Métrica de sucesso:** Score de release ≥ 70

**Rollback:** Não usar gate de release → score ainda calculável

---

### [7] Defect Trend Dashboard

**Problema resolvido:** "Estamos melhorando ou piorando?" → categorias de falha ao longo do tempo.

**Código existente:**

- `shared/report-chart.ts` → `buildChartSvg()` → bar chart
- `shared/report-chart.ts` → `buildMiniTrendChart()` → line chart com referência
- `shared/metrics.ts` → `getTrends()` → TrendPoint[] por run
- `shared/report-html.ts` → `buildTrendSection()` → HTML wrapper

**O que wirear (desbloqueado pelo gap da [3]):**

1. Carregar `FailureAnalysisResult[]` persistidos nas runs do `metrics.json`
2. Agregar por categoria (ASSERTION/TIMEOUT/etc) × run
3. Gerar trend chart + breakdown table + HTML

**Dados de entrada (após [3] rodar por N runs):**

```
run 1: { "ASSERTION": 3, "TIMEOUT": 1 }
run 2: { "ASSERTION": 5, "TIMEOUT": 0, "ENVIRONMENT": 2 }
...
```

**Métrica de sucesso:** % de falhas com categoria registrada = 80%

**Rollback:** Dashboard não afeta pipelines — só parar de gerar HTML

---

### [8] Traceability Matrix

**Problema resolvido:** "Dado um requisito, quais testes o cobrem? Qual a saúde desses testes?"

**Código existente:**

- `shared/coverage-gap.ts` → `analyzeCoverageGaps()` → hierarquia Epic + linked tests
- `shared/report-html.ts` → `generateReportWithFallback()` → HTML
- `shared/report-table.ts` → `buildHistoryCell()`, `buildFlakinessBadge()`
- `shared/report-sections.ts` → `buildQualityGate()`, `buildHealthSection()`

**O que wirear:**
HTML navegável com 3 níveis:

```
Epic X  (coverage: 75%, health: 82, flakiness: 12%)
├── Story Y  (coverage: 100%, health: 90, flakiness: 5%)
│   ├── Test TC-123 (passed, duration 1.2s, flakiness 0%)
│   └── Test TC-456 (failed, duration 3.4s, flakiness 20%)
└── Bug Z  (no linked tests — gap!)
    └── [Criar teste] → JQL filter for this epic
```

Reutilizar componentes existentes: `report-table.ts` (linhas de teste), `report-sections.ts` (cards), `report-chart.ts` (barras de cobertura).

**Riscos:** Epic sem linked tests → "sem dados" em vez de zero

**Métrica de sucesso:** Cliques para ir de requisito a teste = 1 (vs. 5+ hoje)

**Rollback:** Apenas não incluir no menu

---

### [9] Backlog Health Dashboard

**Problema resolvido:** "Quais issues estão sem dono, paradas há >30d, bugs sem testes?"

**Código existente:**

- `jira_management/jira_resource.ts` → `searchJiraIssues(jql)` → busca qualquer JQL
- `shared/report-html.ts` → `generateReportWithFallback()` → render HTML

**O que wirear:**
Módulo `shared/backlog-health.ts` com queries:

```typescript
interface BacklogHealth {
    unassignedIssues: Issue[]; // assignee = null
    staleIssues: Issue[]; // updated < 30d
    bugsWithoutTests: Issue[]; // type = Bug, no linked tests
    densityByEpic: { epic: string; bugCount: number; testCount: number }[];
    score: number; // composite 0-100
}
```

HTML dashboard com cards + tabelas.

**Riscos:** JQL syntax varia entre Jira Server e Cloud. Usar `searchJiraIssues()` que já abstrai.

**Métrica de sucesso:** Dashboard gerado sem intervenção

**Rollback:** Apenas não incluir no menu

---

### [10] AI Generation Effectiveness Dashboard

**Problema resolvido:** "Os testes gerados por AI são eficazes? Qual prompt version gera melhor resultado?"

**Código existente:**

- `shared/ai-feedback.ts` → `getAiFeedbackSummary()` → acceptance rate, top promptVersion
- `shared/ai-feedback.ts` → `getRecentAiRecords()` → últimos N registros
- `jira_management/commands/case23.ts` → `showFeedbackSummary()` → terminal display
- `shared/report-html.ts` → `generateReportWithFallback()` → render HTML

**O que wirear:**
HTML dashboard:

- Acceptance rate (kept / total)
- Breakdown por promptVersion (qual versão gera mais aceitação)
- Modification reasons (o que os humanos estão mudando)
- Trend over time

**Riscos:** Sem registros de AI feedback ainda → "sem dados" em vez de zero

**Métrica de sucesso:** Dashboard disponível com dados históricos

**Rollback:** Apenas não incluir no menu

---

### Gap estrutural da Fase 1: pipeline-health.ts

> Descoberto na Análise 3. `pipeline-health.ts` contém `aggregatePipelineHealth()` + `renderPipelineHealthHtml()` mas **nunca é chamado de entry point algum**.

**Impacto:** Bloqueia Incident Investigation Report e Impact-Aware Alert na Fase 3.

**Ação:** Wirear em `batch-mode.ts` após coleta de pipeline, salvando HTML em `reports/pipeline-health-{timestamp}.html`. ~30min de trabalho, pode ser feito em paralelo com [1].

---

## Fase 2 — Acúmulo + Sinergia (semanas 3-4)

> O que precisa de N runs de dados da Fase 1 para gerar valor máximo.

### Pré-condições para entrar na Fase 2

- Fase 1 rodando por pelo menos 2 semanas (mínimo 5 runs por projeto)
- `metrics.json` com classifications persistidas por run
- `pipeline-health.ts` wireado e gerando dados

### Entregas

| #   | Oportunidade                     | Depende de                            | Esforço | Valor                              |
| --- | -------------------------------- | ------------------------------------- | ------- | ---------------------------------- |
| 11  | **Defect Seasonality Dashboard** | F1 [3] + ~5 runs de classifications   | 3h      | Padrões temporais de falha         |
| 12  | **Silent Regression Detector**   | F1 [1] + ~5 runs de duração           | 3h      | Duração > 2σ detectada             |
| 13  | **AI Test Effectiveness**        | F1 [10] + ~5 runs de AI-gen vs manual | 3h      | "AI-generated tests são melhores?" |
| 14  | **Cross-Squad Benchmark**        | F1 [1] rodando em 2+ projetos         | 3h      | Health score comparativo           |
| 15  | **Perfil de Desenvolvedor**      | F1 [3] + git blame histórico          | 3h      | Taxa de falha por autor            |
| 16  | **Suite Optimization Advisor**   | F2 [12] + F1 [4]                      | 4h      | Sugestão de otimização             |

---

## Fase 3 — Inteligência Avançada (mês 2+)

> O que depende das fases anteriores e de múltiplas fontes correlacionadas.

### Pré-condições

- Fase 1 e 2 completas
- pipeline-health.ts gerando dados (Gap estrutural)
- linked issues populados no Jira

### Entregas

| #   | Oportunidade                      | Depende de                                        | Esforço | Valor                               |
| --- | --------------------------------- | ------------------------------------------------- | ------- | ----------------------------------- |
| 17  | **Incident Investigation Report** | F1 [3] + pipeline-health + F2 [11] + coverage-gap | 5h      | Timeline 5-fontes em minutos        |
| 18  | **Impact-Aware Pipeline Alert**   | F1 [1] + pipeline-health + coverage-gap           | 4h      | "Falha crítica: área sem cobertura" |
| 19  | **Requirement Quality Score**     | F1 [10] + ai-feedback acumulado                   | 3h      | Score de testabilidade do requisito |
| 20  | **Pipeline Cost Analytics**       | pipeline-health + duration history                | 3h      | $$ por falha, por pipeline          |

---

## Matriz consolidada de riscos

| Risco                              | Oportunidades afetadas | Probabilidade         | Mitigação                                   |
| ---------------------------------- | ---------------------- | --------------------- | ------------------------------------------- |
| LLM hallucination em classificação | [3], [7], [11], [17]   | Média                 | Adversarial audit + Zod + regex fallback    |
| Falso negativo em test-impact      | [2]                    | Média                 | Tier 3 mapping explícito + smoke tests      |
| health-score sem histórico         | [1], [5], [6]          | Alta (projetos novos) | Guard `if (runCount < 3) return null`       |
| Dados Jira inconsistentes          | [6], [8], [9]          | Alta                  | Graceful degradation (N/A)                  |
| per-test duration não persistido   | [12], [16]             | **Certa**             | Adicionar ao MetricsRun (1h pré-Fase 2)     |
| pipeline-health.ts não wireado     | [17], [18]             | **Certa**             | Wirear em batch-mode.ts (30min, já incluso) |

---

## Resumo financeiro

| Fase      | Esforço total | Entregas | ROI                                                        |
| --------- | ------------- | -------- | ---------------------------------------------------------- |
| Fase 1    | ~18h          | 10       | Pipeline gate + auto-triage + weekly report + 7 dashboards |
| Fase 2    | ~16h          | 6        | Seasonality + regression + perfis + benchmarks             |
| Fase 3    | ~15h          | 4        | Incident report + alerts + cost analytics                  |
| **Total** | **~49h**      | **20**   | Plataforma completa de inteligência de qualidade           |

---

## Como medir o sucesso

| Métrica                         | Baseline     | Fase 1 (2 sem) | Fase 2 (1 mês) | Fase 3 (2 meses) |
| ------------------------------- | ------------ | -------------- | -------------- | ---------------- |
| Merges com quality gate         | 0%           | 80%            | 90%            | 95%              |
| Falhas triadas sem humano       | 0%           | 70%            | 85%            | 90%              |
| Testes flaky gerenciados        | 0%           | 90%            | 95%            | 99%              |
| Relatórios semanais automáticos | 0            | 4              | 8              | 12               |
| Releases com score ≥ 70         | —            | —              | 80%            | 90%              |
| Dashboards disponíveis          | 4 (parciais) | 10             | 16             | 20               |
| Incidentes investigados em < 1h | manual       | manual         | manual         | 80%              |

---

## Visão de longo prazo

> QA Tools não é "ferramenta que gera relatórios de teste".
> É **a plataforma central de inteligência de qualidade** que sabe, entende, recomenda e automatiza.

```
Fase 1: [Pipeline explica POR QUE passou/falhou]
Fase 2: [Pipeline mostra saúde + tendência + risco]
Fase 3: [Pipeline RECOMENDA o que fazer]
```

Cada fase é aditiva. Rollback é sempre trivial (remover script/flag). Nenhum fluxo existente é substituído — apenas aumentado com inteligência.

---

_Plano consolidado em 2026-05-31. Baseado em 3 análises de capacidades do código-fonte do QA Tools:_

- _Análise 1 — CAPABILITIES-ANALYSIS.md (capacidades, sinergias, top 20)_
- _Análise 2 — CAPABILITIES-ANALYSIS-2.md (inteligência de qualidade)_
- _Análise 3 — Blueprint de Implementação (dependências, riscos, thresholds)_
