# Especificação de Conteúdo dos Artefatos

**Objetivo:** Definir EXATAMENTE o que cada artefato deve mostrar, baseado em normas de referência, institutos de acreditação, literatura acadêmica e boas práticas da indústria.

**Base Normativa:**
- ISTQB CTFL — Requirement acceptance & validation
- ISO/IEC 25010:2023 — Product quality model & grade bands
- ISO/IEC 25023:2016 — Quality measurement (coverage)
- ISO 3534-2 — Statistical process control (z-score severity)
- DORA State of DevOps 2025 — Software delivery performance
- Allure Report 3 — Gold standard for test reporting
- Google SRE Book — Reliability engineering practices

**Regra:** Cada artefato DEVE exibir TODOS os campos obrigatórios listados. Campos "Opcional" são recomendados mas não obrigatórios.

**Regra Arquitetural (SSOT):** TODOS os artefatos consomem dados EXCLUSIVAMENTE de DataHub. NENHUM artefato busca, calcula ou processa seus próprios dados. Se um dado necessário não está no DataHub, a implementação DEVE ser feita no DataHub ANTES do renderer. Configurações (thresholds) pertencem a `config-accessor.ts`, não ao DataHub.

---

## 1. ai-effectiveness

**Propósito:** Avaliar eficácia da geração automática de testes por IA
**Auditor:** QA Lead, Tech Lead
**Referência:** ISTQB CTFL (requirement acceptance)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte do Dado | Formato | Severidade | Threshold |
|---------|---------------|---------|------------|-----------|
| Acceptance Rate | `result.acceptanceRate` | `XX%` | error < 50%, warn < 70%, info >= 70% | 50% (baixo), 70% (bom) |
| Total Records | `result.totalRecords` | `N` | info | — |
| Modified | `result.totalModified` | `N (XX%)` | warn > 30%, info | 30% |
| Deleted | `result.totalDeleted` | `N (XX%)` | error > 20%, warn > 10% | 20% |
| Top Version | `result.topPromptVersion` | nome | info | — |
| Sample Size | `result.totalRecords` | Warn badge se < 30 | warn se < 30 | 30 |

### Seções Obrigatórias

1. **Summary** — MetricGrid com as 6 métricas acima
2. **Version Breakdown** — DataTable com colunas: Version, Count, Acceptance Rate (%), Badge (pass >= 80%, warn >= 50%, fail < 50%)
3. **Daily Trend** — TrendChart com acceptance rate por dia, refLine em 80% (target), legenda de trend direction (improving/declining/stable)
4. **Recommended Actions** — Ações CONDICIONAIS baseadas nos dados:
   - Se acceptance < 50%: "Acceptance rate is XX%. Review prompt engineering and test generation quality."
   - Se deleted > 20%: "XX tests deleted (XX% of generated). Investigate deletion patterns."
   - Se sample < 30: "Only XX records. Results may not be statistically significant."
   - Se acceptance >= 80%: "Acceptance rate is XX%. Prompt version {top} is performing well."
   - Se há versão com acceptance < 50%: "Version {X} has XX% acceptance. Consider deprecating or improving this prompt."

### Timestamp
OBRIGATÓRIO: exibir `result.timestamp`

---

## 2. ai-comparison

**Propósito:** Comparar performance de testes AI vs manuais
**Auditor:** QA Lead, Test Manager
**Referência:** DORA (pass rate comparison)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade | Threshold |
|---------|-------|---------|------------|-----------|
| AI Pass Rate | `result.aiPassRate` | `XX%` | error < 50%, warn < 70%, info >= 70% | 50%, 70% |
| Manual Pass Rate | `result.manualPassRate` | `XX%` | error < 50%, warn < 70%, info >= 70% | 50%, 70% |
| AI Sample | `result.aiTotal` | `N tests` | warn se < 30 | 30 |
| Manual Sample | `result.manualTotal` | `N tests` | warn se < 30 | 30 |
| AI Flakiness | `result.aiFlakinessAvg` | `XX%` | error > 30%, warn > 10% | 30%, 10% |
| Manual Flakiness | `result.manualFlakinessAvg` | `XX%` | error > 30%, warn > 10% | 30%, 10% |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Advantage Analysis** — Se `aiAdvantage === 'pass_rate'`: "AI tests have higher pass rate (+X%). Consider increasing AI test coverage." Se `aiAdvantage === 'flakiness'`: "AI tests are less flaky (-X%). AI-generated tests are more reliable." Se `aiAdvantage === 'none'`: "No significant advantage detected between AI and manual tests."
3. **Sample Size Warning** — Se qualquer sample < 30: "⚠️ Sample size of {N} may not be statistically significant."
4. **Version Breakdown** — DataTable com: Version, Count, Pass Rate (%)
5. **Format consistency** — TODOS os rates em % (não decimais como 0.75)

### Timestamp
OBRIGATÓRIO

---

## 3. incident-report

**Propósito:** Consolidar incidentes de qualidade (falhas, regressões, gaps de cobertura)
**Auditor:** QA Manager, Release Manager
**Referência:** Internal (fail rate threshold 30%, regression count 2)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Overall Severity | `result.overallSeverity` | Badge: High/Medium/Low/None | error=high, warn=medium, success=low/none |
| Total Events | `result.eventCount` | `N` | error > 5, warn > 2 |
| High Severity | `result.highCount` | `N` | error > 0 |
| Medium Severity | `result.mediumCount` | `N` | warn > 0 |
| Low Severity | `result.lowCount` | `N` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Events Timeline** — Cards por evento com:
   - Data do evento (`event.date`)
   - Tipo com ícone (Failure=❌, Regression=📈, Coverage Gap=📊, Seasonality=📅)
   - Título e descrição
   - Severidade: Badge colorido (error/warn/info)
   - Threshold explícito: "Fail rate was XX%, threshold is 30%"
3. **Per-Type Count Summary**: "N failures, N regressions, N coverage gaps, N seasonality events"
4. **Recommended Actions**:
   - Se high > 0: "Critical incidents detected. Review recent code changes and test failures."
   - Se regressions > 0: "N regressions detected. Investigate recent deployments."
   - Se coverage gaps > 0: "N epics with coverage gaps. Add tests for uncovered requirements."
   - Se low se only: "Seasonality patterns detected. Consider test scheduling adjustments."

### Timestamp
OBRIGATÓRIO

---

## 4. impact-alert

**Propósito:** Alertar sobre impacto do pipeline na qualidade
**Auditor:** Release Manager, DevOps Lead
**Referência:** Internal (quality gate 70%/80%)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Critical | `result.criticalCount` | `N` | error > 0 |
| Warning | `result.warningCount` | `N` | warn > 0 |
| Info | `result.infoCount` | `N` | info |
| Total Alerts | critical + warning + info | `N` | error > 3, warn > 1 |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Alert Cards** — Cada alert com:
   - Severidade: Badge (critical=error, warning=warn, info=info)
   - Título do alerta (`alert.title`)
   - Mensagem com valores numéricos: "Pass rate is 65% (threshold: 70%)"
   - Área afetada (`alert.affectedArea`)
   - Recomendação (`alert.recommendation`)
3. **Recommended Actions**:
   - Se critical > 0: "Critical pipeline impact. Immediate action required for: {areas}."
   - Se warning > 0: "Pipeline warnings for: {areas}. Review before next release."
   - Se all info: "Pipeline health is acceptable. Continue monitoring."

### Timestamp
OBRIGATÓRIO

---

## 5. traceability

**Propósito:** Mapear rastreabilidade entre requisitos, testes e cobertura
**Auditor:** QA Lead, Product Owner
**Referência:** ISTQB (requirements traceability matrix)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Total Epics | `result.totalEpics` | `N` | info |
| Total Tests | `result.totalTests` | `N` | info |
| Coverage | `result.overallCoverage` | `XX%` | error < 50%, warn < 80%, info >= 80% |
| Avg Flakiness | Média dos epics | `XX%` | error > 30%, warn > 10% |
| Timestamp | `result.timestamp` | datetime | — |

### Seções Obrigatórias

1. **Summary** — MetricGrid com as 5 métricas acima
2. **Traceability Tree** — Hierarquia epic → story → test com:
   - Cada epic: nome, coverage badge (🔴 < 50%, 🟡 < 80%, 🟢 >= 80%), health badge
   - Cada story: nome, test count, pass/fail/skip badges
   - Cada test: título, status badge, duração, flakiness
3. **Uncovered Epics Highlight** — Epics com coverage < 50% destacados em vermelho
4. **Awareness Section** — Cross-references (PM issues, PRs, failures, security) com confidence scores
5. **Recommended Actions**:
   - Se há epics com coverage < 50%: "Epic {name} has XX% coverage. Add tests for uncovered stories."
   - Se há tests com flakiness > 30%: "N flaky tests detected in epic {name}."
   - Se overall < 80%: "Overall coverage is XX%. Target is 80%."

### Timestamp
OBRIGATÓRIO (já implementado — único renderer que exibe)

---

## 6. flakiness

**Propósito:** Identificar e priorizar testes instáveis
**Auditor:** QA Lead, CI/CD Engineer
**Referência:** DORA (flaky rate impact on deployment frequency)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade | Threshold |
|---------|-------|---------|------------|-----------|
| Flaky Tests | `high.length` | `N tests` | error > 5, warn > 0 | 5 |
| Flaky Rate | `high.length / totalTests * 100` | `XX%` | error > 30%, warn > 10% | 30% |
| High Flakiness | `high.filter(f => f.rate >= 0.5).length` | `N tests (>= 50%)` | error > 0 | — |
| Threshold | `thresholds.thresholdPct` | `> XX%` | info | 30% |

**ATENÇÃO BUG CONHECIDO:** `totalTests` está hardcoded como 0 no renderer atual. A métrica "Flaky Rate" e a ação "Flaky rate is X%" NÃO funcionam. CORRIGIR antes de implementar este plano.

### Seções Obrigatórias

1. **Summary** — MetricGrid com as 4 métricas
2. **Flaky Tests Table** — DataTable com colunas: Test, Flakiness (%), Severity Badge (high >= 50%, medium >= 30%), Sparkline (últimas runs), Runs
   - Ordenar por flakiness (maior primeiro)
3. **Source Quality Banner** — Se há dados de DataHub: "Source: {provider} — Confidence: {X}%"
4. **Recommended Actions**:
   - Se high >= 50% flakiness: "{N} tests have >= 50% flakiness. Consider quarantining: {test names}."
   - Se moderate (30-50%): "{N} tests with moderate flakiness. Monitor for stabilization."
   - Se flakyRate > 5%: "Flaky rate is XX% of total test suite. Investigate root causes."
   - Threshold context: "Flaky threshold: > {threshold}%. Error threshold: {errorThreshold} tests."

### Timestamp
OBRIGATÓRIO

---

## 7. backlog-health

**Propósito:** Avaliar saúde do backlog de testes
**Auditor:** QA Lead, Product Owner
**Referência:** Internal (score weights: stale 35%, unassigned 30%, bugNoTest 35%)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade | Threshold |
|---------|-------|---------|------------|-----------|
| Health Score | `result.score` | `XX/100` | error < 50, warn < 80, info >= 80 | 50, 80 |
| Stale Issues | `result.staleIssues.length` | `N issues` | error > 10, warn > 0 | 10 |
| Unassigned | `result.unassignedIssues.length` | `N issues` | error > 5, warn > 0 | 5 |
| Bugs w/o Tests | `result.bugsWithoutTests.length` | `N issues` | error > 3, warn > 0 | 3 |
| Total Issues | `result.totalIssues` | `N` | info | — |

### Seções Obrigatórias

1. **Summary** — MetricGrid com as 5 métricas + badge de severity do score
2. **Stale Issues** — Lista com até 10 issues (cap), cada uma com: key, summary, dias sem update, Badge
   - Average age: "Average age: XX days without update"
3. **Unassigned Issues** — Lista com type breakdown (Bug, Story, Task)
4. **Bugs Without Tests** — Lista com prioridade
5. **Density by Epic** — DataTable com: Epic, Bugs, Tests, Ratio, Badge (ratio < 1: fail, < 2: warn, >= 2: pass)
6. **Recommended Actions**:
   - Se score < 50: "Backlog health score is XX% (below 50% threshold). Priority: address {N} stale and {N} unassigned issues."
   - Se stale > 0: "Oldest stale issue: {key} — {N} days without update. Reassign or close."
   - Se bugNoTest > 0: "N bugs have no linked tests. Top category: {category}."
   - Se unassigned > 0: "N unassigned issues. Type breakdown: {types}."

### Timestamp
OBRIGATÓRIO

---

## 8. pipeline-cost

**Propósito:** Analisar custo computacional do pipeline de CI/CD
**Auditor:** DevOps Lead, Engineering Manager
**Referência:** Google SRE (cost optimization)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade | Threshold |
|---------|-------|---------|------------|-----------|
| Total Cost | `result.totalCost` | `$XX.XX` | error > $100, warn > $50 | $100, $50 |
| Avg Cost/Run | `result.avgCostPerRun` | `$XX.XX` | error > $20, warn > $10 | $20, $10 |
| Total Duration | `result.totalDurationSec` | `Xm Xs` | info | — |
| Run Count | `result.runCount` | `N runs` | info | — |
| Cost/Minute | `result.costPerMinute` | `$X.XX/min` | info | — |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Cost per Run** — DataTable com: Run, Duration, Cost, Status Badge
   - Ordenar por custo (maior primeiro)
   - Status: passed/failed/unknown
3. **Recommended Actions**:
   - Se avgCost > $20: "Average cost per run is $XX. Consider optimizing slow tests."
   - Se há runs com duration > 30min: "Run {id} took {X}min. Consider test parallelization."
   - Se totalCost > $100: "Total pipeline cost is $XX for {N} runs."

### Timestamp
OBRIGATÓRIO

---

## 9. suite-optimization

**Propósito:** Otimizar duração e estabilidade da suíte de testes
**Auditor:** QA Lead, CI/CD Engineer
**Referência:** DORA (test suite optimization), Google SRE (reducing toil)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade | Threshold |
|---------|-------|---------|------------|-----------|
| Tests to Optimize | `optimizations.filter(a => a.action !== 'none').length` | `N tests` | error > 10, warn > 0 | 10 |
| Potential Savings | `result.potentialSavings` | `Xs` | info | — |
| Slow Threshold | `result.slowThreshold` | `> Xs` | info | 5s |
| Flaky Threshold | `result.flakyThreshold` | `> X%` | info | 30% |
| Total Duration | `result.totalDuration` | `Xs` | info | — |

### Seções Obrigatórias

1. **Summary** — MetricGrid com savings destacado
2. **Optimization Table** — DataTable com: Test, Duration, Flakiness, Impact Badge (high/medium/low), Action, Savings
   - Ordenar por impacto (high first)
   - Savings = `duration - slowThreshold` para cada teste
3. **Action Summary** — Contagem por action type: quarantine, split, parallelize, remove_wait, speed_up
4. **Recommended Actions**:
   - Se high impact > 0: "N tests need immediate attention: {test names}."
   - Se quarantine > 0: "N tests should be quarantined (flakiness > {threshold}%)."
   - Se split > 0: "N tests could be split (> {threshold*3}s)."
   - Se potentialSavings > 0: "Optimizing {N} tests could save {X}s total."

### Timestamp
OBRIGATÓRIO

---

## 10. cross-squad-benchmark

**Propósito:** Comparar performance entre squads/ projetos
**Auditor:** Engineering Manager, QA Director
**Referência:** DORA (cross-team benchmarking)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Average Score | `result.averageScore` | `XX` | info |
| Score Range | min — max | `XX — YY` | info |
| Std Deviation | `result.stdDev` | `XX` | warn > 20 (gaps significativos) |
| Top Squad | `result.topSquad` | nome | success |
| Bottom Squad | `result.bottomSquad` | nome | error (se != top) |
| Squad Count | `result.benchmarks.length` | `N squads` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Leaderboard** — DataTable com: Rank, Squad, Score, Grade Badge, Pass Rate, Flaky Rate, Coverage, Trend (↑/↓/→)
   - Ordenar por score (maior primeiro)
3. **Score Distribution** — BarChart ou visual da distribuição de scores
4. **Recommended Actions**:
   - Se stdDev > 20: "Significant quality gap between squads (stdDev: {X}). Consider standardizing practices."
   - Se bottom < 60: "Squad {name} has a health score of {X} (below 60). Immediate attention required."
   - Se top score: "Squad {name} leads with score {X}. Consider adopting their practices."

### Timestamp
OBRIGATÓRIO

---

## 11. release-score

**Propósito:** Decidir se uma release está pronta para deploy
**Auditor:** Release Manager, QA Director
**Referência:** ISO/IEC 25023:2016 (coverage), DORA (flakiness)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Release Gate | `result.grade` | Badge: ✅ READY / ❌ NOT READY | success >= 70, error < 70 |
| Score | `result.score` | `XX/100` | error < 50, warn < 70, info >= 70 |
| Grade | `result.grade` | excellent/good/needs_attention/critical | — |
| Checks Passed | `result.breakdown.filter(b => b.status === 'pass').length` | `N/M passed` | error < 50%, warn < 80% |

### Seções Obrigatórias

1. **Summary** — Deployment Gate MetricCard (destaque principal), Score, Grade, Checks
2. **Breakdown** — DataTable com: Dimension, Score, Status Badge, Threshold Hint
   - Cada linha: "passRate: 85 (score: 85, needs: 70)"
   - Status: pass se >= 70, fail se < 70
   - Weight info: "(weight: 25%)" para cada dimensão
3. **Recommendation** — Texto do `result.recommendation`
4. **Recommended Actions**:
   - Se score < 70: "Release NOT READY. Failed checks: {dimension names}."
   - Se score >= 70 && < 90: "Release ready with caveats. Review: {dimensions}."
   - Se score >= 90: "Release READY. All quality gates passed."

### Timestamp
OBRIGATÓRIO

---

## 12. silent-regression

**Propósito:** Detectar regressões sutis em duração de testes
**Auditor:** QA Lead, Performance Engineer
**Referência:** ISO 3534-2 (statistical process control, z-score)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Regressions Found | `result.regressions.length` | `N tests` | error > 0 |
| Avg Increase | média dos increases | `+XX%` | error > 50%, warn > 20% |
| Threshold (z) | `result.threshold` | `> X` | info |
| Total Tests | `result.totalTests` | `N` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Regression Table** — DataTable com: Test, Current Duration, Mean Duration, Increase (%), Z-Score, Severity Badge (critical > 5, high > 3, medium > 2, low > 1)
   - Ordenar por z-score (maior primeiro)
   - Increase = `((current - mean) / mean * 100).toFixed(0)%`
3. **Recommended Actions**:
   - Se critical > 0: "Critical regressions detected (z > 5). Investigate immediately: {test names}."
   - Se high > 0: "High-severity regressions (z > 3). Review recent changes: {test names}."
   - Se avgStdDev > 1: "High variance detected. Possible flaky tests or infrastructure issues."
   - Se avgStdDev <= 1: "Low variance. Regressions likely caused by data growth or resource contention."

### Timestamp
OBRIGATÓRIO

---

## 13. defect-trend

**Propósito:** Monitorar tendência de defeitos ao longo do tempo
**Auditor:** QA Manager, Project Manager
**Referência:** Internal (defect management best practice)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Top Category | `topCategories[0]` | nome + count | info |
| Total Defects | `topCategories[0].count` | `N` | info |
| Trend Direction | delta entre primeiro e último dia | increasing/decreasing/stable | error=increasing, success=decreasing |
| Avg Defects/Day | `sum(totals) / N days` | `X.X` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid com trend direction badge
2. **Trend Table** — DataTable com: Date, Total, per-category columns
   - Se há spike (> 1.5x média): badge destacado
3. **Recommended Actions**:
   - Se trend = increasing: "Defect trend is increasing. Investigate recent changes."
   - Se trend = decreasing: "Defect trend is decreasing. Quality is improving."
   - Se há spike: "Spike detected on {date}: {N} defects ({X}x average)."

### Timestamp
OBRIGATÓRIO

---

## 14. defect-seasonality

**Propósito:** Identificar padrões sazonais na ocorrência de defeitos
**Auditor:** QA Manager, Project Manager

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Peak Day | `result.peakDay` | nome do dia | info |
| Peak Hour | `result.peakHour` | `XX:00` | info |
| Total Records | `result.totalRecords` | `N` | info |
| Avg Defects/Day | média por dia | `X.X` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Day of Week Breakdown** — DataTable com: Day, Total, vs-Avg badge (🔴 Above > 1.2x, 🟢 Below < 0.8x, 🟡 Normal), per-category
3. **Hour of Day Breakdown** — DataTable com: Hour, Total, vs-Avg badge, per-category
4. **Recommended Actions**:
   - Se high-concentration hours: "High defect concentration at {hours}. Consider additional monitoring during these periods."
   - Se peak day: "{day} has the highest defect rate. Review deployment practices for this day."

### Timestamp
OBRIGATÓRIO

---

## 15. developer-profile

**Propósito:** Analisar padrões de falha por desenvolvedor
**Auditor:** QA Lead, Engineering Manager
**Referência:** Internal (developer accountability)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Total Authors | `result.totalAuthors` | `N` | info |
| Total Failures | `result.totalFailures` | `N` | info |
| Top Contributor | `result.topContributor` | nome | info |
| Top Failure Author | `result.topFailureAuthor` | nome | warn |

### Seções Obrigatórias

1. **Summary** — MetricGrid
2. **Author Ranking** — Cards ou lista com: Rank (#1, #2, #3), Author, Failures, Tests Touched, Failure Rate (%), Top Category
   - Ordenar por failure rate (maior primeiro)
3. **Category Ranking** — Contagem de falhas por categoria
4. **Recommended Actions**:
   - Se topFailureAuthor tem failureRate > 30%: "{author} has a {X}% failure rate. Consider code review focus."
   - Se top category: "Most common failure category: {category} ({N} failures)."

### Timestamp
OBRIGATÓRIO

---

## 16. requirement-score

**Propósito:** Avaliar qualidade das requirements para geração de testes
**Auditor:** QA Lead, Product Owner
**Referência:** ISTQB CTFL (acceptance weight 0.5), ISO/IEC 25010 (grade bands)

### Métricas Obrigatórias no MetricGrid

| Métrica | Fonte | Formato | Severidade |
|---------|-------|---------|------------|
| Requirements | `result.totalRequirements` | `N` | info |
| Overall Score | `result.overallGrade` | Badge: A/B/C/D/F | A/B=success, C=warn, D/F=error |
| Acceptance Rate | `result.averageAcceptanceRate` | `XX%` | error < 50%, warn < 70%, info >= 70% |
| Kept/Modified/Deleted | rates calculados | `XX%/XX%/XX%` | info |
| Generated Tests | `result.totalGenerated` | `N` | info |

### Seções Obrigatórias

1. **Summary** — MetricGrid com grade badge colorido
2. **Score Breakdown** — DataTable ordenado por score (menor primeiro): Requirement, Score, Grade Badge, Acceptance (%), Generated, Kept, Modified, Deleted
3. **Recommended Actions**:
   - Se overallScore < 40: "Overall requirement quality score is {X} (grade {Y}). Immediate action required."
   - Se averageAcceptance < 50%: "Average acceptance rate is {X}%. Review test generation quality."
   - Se há requirements com score < 40: "{N} requirement(s) have scores below 40: {names}."
   - Se high deletion rate: "{N} tests were deleted ({X}% of generated). Review deletion reasons."

### Timestamp
OBRIGATÓRIO

---

## CAMPOS OBRIGATÓRIOS TRANSVERSAIS

### Para TODOS os 16 artefatos:

| Campo | Obrigatório? | Presente atualmente? |
|-------|-------------|---------------------|
| `timestamp` | SIM | Apenas em traceability |
| `Sample size warning` | SIM (quando aplicável) | Apenas em ai-effectiveness e ai-comparison |
| `Thresholds no MetricCard` | SIM (meta: XX%) | NENHUM |
| `Trend/comparison` | RECOMENDADO | Apenas em ai-effectiveness |
| `Conditional actions` | SIM | A maioria sim |
| `EmptyState` | SIM (quando sem dados) | A maioria sim |

---

## RESUMO DE GAPS POR ARTEFATO

> **Atualizado (2026-08-05):** todos os 16 artefatos agora exibem `timestamp` (via `resolveGeneratedAt`/`result.timestamp`) e `thresholds` nos cards. Gap table original de 2026-07-11 está obsoleta — resolvido no plano `ARTIFACT-VALIDATION.md` (F5-T1..T6, I-8.2, D5).

| # | Artefato | Gaps de Conteúdo |
|---|----------|-----------------|
| 1 | ai-effectiveness | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 2 | ai-comparison | ~~Timestamp, thresholds, formato consistente (tudo %)~~ → ✅ |
| 3 | incident-report | ~~Timestamp, thresholds explícitos, per-type count~~ → ✅ |
| 4 | impact-alert | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 5 | traceability | ~~Thresholds nos cards (já tem timestamp)~~ → ✅ |
| 6 | flakiness | ~~**BUG: totalTests=0**, timestamp, thresholds~~ → ✅ (I-4) |
| 7 | backlog-health | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 8 | pipeline-cost | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 9 | suite-optimization | ~~Timestamp, thresholds, savings column~~ → ✅ |
| 10 | cross-squad-benchmark | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 11 | release-score | ~~Timestamp, threshold hints na breakdown~~ → ✅ |
| 12 | silent-regression | ~~Timestamp, thresholds nos cards~~ → ✅ |
| 13 | defect-trend | ~~Timestamp, trend direction badge, avg/defects day~~ → ✅ |
| 14 | defect-seasonality | ~~Timestamp, avg defects/day~~ → ✅ |
| 15 | developer-profile | ~~Timestamp, ranking badges~~ → ✅ |
| 16 | requirement-score | ~~Timestamp, thresholds nos cards~~ → ✅ |

---

## MAPEAMENTO DataHub → Artefatos

**Regra:** Cada campo obrigatório DEVE ser rastreável até um accessor do DataHub. Se o accessor não existe, é GAP que deve ser implementado no DataHub PRIMEIRO.

### Fontes de dados DataHub disponíveis

| Accessor | Tipo | Dados |
|----------|------|-------|
| `dataHub.timestamp` | `Date` | Quando o hub foi criado/atualizado |
| `dataHub.raw.jiraIssues` | `RawJiraIssue[]` | Issues Jira completas (key, summary, status, type, priority, assignee, updated, parentKey) |
| `dataHub.raw.aiRecords` | `AiGenerationRecord[]` | Registros de geração AI (promptVersion, generatedTests, accepted, modificationReason) |
| `dataHub.raw.xray.requirementCoverage` | `XrayRequirementCoverage[]` | Cobertura de requirements por Jira |
| `dataHub.raw.coverageHistory` | `CoverageSnapshot[]` | Histórico de cobertura |
| `dataHub.raw.failureClassifications` | `FailureClassification[]` | Falhas classificadas (timestamp, testTitle, category) |
| `dataHub.raw.failureRecords` | `FailureRecord[]` | Falhas estruturadas (name, suite, status, message, source) |
| `dataHub.getRuns()` | `PipelineRun[]` | Runs CI (id, status, duration, timestamps, head_commit) |
| `dataHub.getPullRequests()` | `RawPullRequest[]` | PRs/MRs |
| `dataHub.getSecurityFindings()` | `SecurityFinding[]` | Findings de segurança |
| `dataHub.getPmIssues()` | `RawIssue[]` | Issues GitHub/GitLab |
| `dataHub.getCoverageFiles()` | `CoverageFile[]` | Cobertura por arquivo |
| `dataHub.getCoverage()` | `RawCoverage` | Cobertura agregada |
| `dataHub.getDoraMetrics()` | `DoraMetrics` | Métricas DORA |
| `dataHub.getDeployments()` | `Deployment[]` | Deployments |
| `dataHub.getReleases()` | `Release[]` | Releases/tags |
| `dataHub.getPerformanceMetrics()` | `PerformanceMetrics` | Performance CI |
| `dataHub.getQuality(cat)` | `QualityReport` | Quality gate por categoria |
| `dataHub.getQuarantine()` | `QuarantineStore` | Testes em quarentena |
| `dataHub.computed.passRate` | `number` | Taxa de pass (0-100) |
| `dataHub.computed.testCounts` | `{ passed, failed, skipped, total }` | Contagem de testes |
| `dataHub.computed.flakyRate` | `FlakyResult[]` | Jobs flaky |
| `dataHub.computed.flakinessEntries` | `FlakinessEntry[]` | Detalhe pass/fail por teste |
| `dataHub.computed.metricsTrends` | `TrendPoint[]` | Tendências de teste |
| `dataHub.computed.defectTrends` | `DateTrendPoint[]` | Tendências de defeito |
| `dataHub.computed.perRunCosts` | `PerRunCost[]` | Custo por run |
| `dataHub.computed.pipelineCost` | `CostEstimate` | Custo agregado |
| `dataHub.computed.testDurationMap` | `Record<string, number[]>` | Duração por teste (histórico) |
| `dataHub.computed.releaseScore` | `ReleaseScoreResult` | Score de release |
| `dataHub.computed.branchBreakdown` | `Record<string, BranchHealth>` | Pass rate por branch |
| `dataHub.computed.topFailingJobs` | `FailingJob[]` | Jobs mais falhosos |
| `dataHub.computed.executionRate` | `number` | Taxa de execução |
| `dataHub.computed.flakyPercentage` | `number` | % de jobs flaky |

### Mapeamento: Artefato → Fonte DataHub → Gaps

#### 1. ai-effectiveness

| Campo Obrigatório | Fonte DataHub | Status |
|-------------------|---------------|--------|
| acceptanceRate | `raw.aiRecords` → calcular (kept+modified)/total*100 | ⚠️ Cálculo no barrel, não em DataHub |
| totalRecords | `raw.aiRecords.length` | ✅ Direto |
| totalModified | `raw.aiRecords` → filter (!accepted && !deleted) | ⚠️ Cálculo no barrel |
| totalDeleted | `raw.aiRecords` → filter (!accepted && deleted) | ⚠️ Cálculo no barrel |
| topPromptVersion | `raw.aiRecords` → group by promptVersion, max count | ⚠️ Cálculo no barrel |
| byVersion | `raw.aiRecords` → group by promptVersion | ⚠️ Cálculo no barrel |
| trend | `raw.aiRecords` → group by date | ⚠️ Cálculo no barrel |
| timestamp | `dataHub.timestamp` ou barrel gera local | ✅ (design choice) |

**GAP:** Barrel `ai-effectiveness.ts` calcula tudo a partir de `raw.aiRecords`. Esses cálculos deveriam estar como computed metrics no DataHub.

#### 2. ai-comparison

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| aiTotal, aiPassRate, aiFlakinessAvg | `raw.aiRecords` filtrado por source=ai | ⚠️ Barrel calcula |
| manualTotal, manualPassRate, manualFlakinessAvg | `raw.aiRecords` filtrado por source=manual | ⚠️ Barrel calcula |
| aiAdvantage | Derivado dos rates | ⚠️ Barrel calcula |
| byVersion | Group by version | ⚠️ Barrel calcula |

**GAP:** Barrel `ai-comparison.ts` calcula tudo. Deveria ser computed no DataHub.

#### 3. incident-report

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| events (failure) | `computed.flakyRate` + `computed.topFailingJobs` | ⚠️ Barrel monta eventos |
| events (regression) | `computed.testDurationMap` → detect regressions | ⚠️ Barrel calcula |
| events (coverage_gap) | Externo: `CoverageGapResult` (não DataHub) | ❌ **GAP** |
| events (seasonality) | Externo: `SeasonalityResult` (não DataHub) | ❌ **GAP** |
| overallSeverity | Derivado dos eventos | ⚠️ Barrel calcula |

**GAP CRÍTICO:** incident-report consome dados de 3 fontes externas (coverage-gap, seasonality, flakiness) que não estão todas no DataHub.

#### 4. impact-alert

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| alerts | Derivado de `computed.passRate`, `computed.coverage`, `getPmIssues()` | ⚠️ Barrel calcula |
| criticalCount/warningCount/infoCount | Derivado | ⚠️ Barrel calcula |

**GAP:** Barrel `impact-alert.ts` combina dados de múltiplas fontes DataHub. O compute deveria estar no DataHub.

#### 5. traceability

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| nodes (epic/story/test) | `raw.xray` + `raw.pmIssues` + `computed.flakinessEntries` | ⚠️ Barrel monta |
| overallCoverage | `computed.coverage` ou `computed.testCounts` | ✅ Parcial |
| awareness | `getPmIssues()`, `getPullRequests()`, `getFailureRecords()`, `getSecurityFindings()` | ✅ DataHub |

**GAP:** A montagem da árvore epic→story→test requer join de `raw.pmIssues` com `raw.xray` — deveria ser computed no DataHub.

#### 6. flakiness

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| flaky tests list | `computed.flakinessEntries` | ✅ Direto |
| totalTests | `computed.testCounts.total` | ✅ **EXISTE mas renderer hardcodes 0** |
| severity per test | `computed.flakinessEntries` → rate * 100 | ✅ Derivável |

**GAP:** Renderer ignora `computed.testCounts.total`. Bug de implementação, não de dados.

#### 7. backlog-health

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| staleIssues | `raw.jiraIssues` → filter updated > 30 days | ✅ Direto |
| unassignedIssues | `raw.jiraIssues` → filter assignee empty | ✅ Direto |
| bugsWithoutTests | `raw.jiraIssues` → filter type=Bug && linkedTestCount=0 | ✅ Direto |
| densityByEpic | `raw.jiraIssues` → group by parentKey | ✅ Direto |
| score | Derivado dos counts | ⚠️ Barrel calcula |

**GAP:** O campo `linkedTestCount` em `BacklogHealthIssue` precisa vir do DataHub. Atualmente `raw.jiraIssues` não tem `linkedTestCount`.

#### 8. pipeline-cost

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| costByRun | `computed.perRunCosts` | ✅ Direto |
| totalCost | `computed.pipelineCost.total` | ✅ Direto |
| avgCostPerRun | Derivado | ⚠️ Barrel calcula |

**GAP:** Barrel recalcula custo com `costPerMinute` próprio em vez de usar `computed.perRunCosts`. Deveria consumir direto.

#### 9. suite-optimization

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| test durations | `computed.testDurationMap` | ✅ Direto |
| flakiness per test | `computed.flakinessEntries` | ✅ Direto |
| optimizations | Derivado dos dados acima | ⚠️ Barrel calcula ações |

**GAP:** Barrel calcula as otimizações. O compute (quarantine/split/parallelize) deveria ser computed metric no DataHub.

#### 10. cross-squad-benchmark

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| scores per squad | Externo: múltiplos DataHubs ou aggregate | ❌ **GAP** |
| trend per squad | Externo: histórico por squad | ❌ **GAP** |

**GAP CRÍTICO:** Cross-squad requer aggregação de MÚLTIPLOS DataHubs (um por squad). Não existe accessor DataHub para isso.

#### 11. release-score

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| score | `computed.releaseScore.score` | ✅ Direto |
| grade | `computed.releaseScore.grade` | ✅ Direto |
| breakdown | `computed.releaseScore.breakdown` | ✅ Direto |
| recommendation | `computed.releaseScore.recommendation` | ✅ Direto |

**SEM GAPS.** Dados completos no DataHub.

#### 12. silent-regression

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| testDurationMap | `computed.testDurationMap` | ✅ Direto |
| regressions | Derivado: z-score calculation | ⚠️ Barrel calcula |

**GAP:** Barrel calcula z-scores. A detecção de regressão deveria ser computed metric no DataHub.

#### 13. defect-trend

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| trends | `computed.defectTrends` | ✅ Direto |
| topCategories | Derivado | ⚠️ Barrel agrupa |

**GAP MENOR:** Agrupamento por categoria deveria ser computed.

#### 14. defect-seasonality

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| raw failure data | `raw.failureClassifications` | ✅ Direto |
| byDayOfWeek, byHour | Derivado: agrupamento temporal | ⚠️ Barrel agrupa |

**GAP MENOR:** Agrupamento por dia/hora deveria ser computed.

#### 15. developer-profile

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| failures per author | `raw.failureRecords` (sem `author` field) | ❌ **GAP** |
| categories per author | `raw.failureClassifications` (sem `author` field) | ❌ **GAP** |

**GAP CRÍTICO:** `FailureRecord` e `FailureClassification` não têm campo `author`. `PipelineRun.head_commit.author.name` existe mas não está linkageado a test failures individuais.

#### 16. requirement-score

| Campo | Fonte DataHub | Status |
|-------|---------------|--------|
| aiRecords | `raw.aiRecords` | ✅ Direto |
| scores per requirement | Derivado: scoring formula | ⚠️ Barrel calcula |
| overallScore, overallGrade | Derivado | ⚠️ Barrel calcula |

**GAP:** Scoring formula (acceptance*0.5 + retention*0.3 + volume*0.2) deveria ser computed metric no DataHub.

---

## RESUMO DE GAPS DataHub

### Gaps Críticos (implementação obrigatória no DataHub)

| # | Gap | Artefatos Afetados | Módulo DataHub Necessário |
|---|-----|--------------------|-----------------------------|
| **G1** | AI effectiveness computed metrics | ai-effectiveness, ai-comparison, requirement-score | `compute/ai-metrics.ts` — acceptanceRate, byVersion, trend, scores |
| **G2** | Incident computed events | incident-report | `compute/incident-events.ts` — failures, regressions, coverage gaps, seasonality |
| **G3** | Impact alerts computed | impact-alert | `compute/impact-alerts.ts` — severity classification, alert generation |
| **G4** | Traceability tree computed | traceability | `compute/traceability-tree.ts` — epic→story→test join |
| **G5** | Cross-squad aggregation | cross-squad-benchmark | `compute/cross-squad.ts` — multi-hub aggregation |
| **G6** | Developer failure attribution | developer-profile | Enrich `FailureRecord` com `author` field no ingest boundary |
| **G7** | Suite optimization actions | suite-optimization | `compute/optimization-actions.ts` — quarantine/split/parallelize decisions |
| **G8** | Silent regression detection | silent-regression | `compute/regression-detection.ts` — z-score calculation |
| **G9** | Backlog linkedTestCount | backlog-health | Enrich `raw.jiraIssues` com `linkedTestCount` no ingest boundary |
| **G10** | Defect aggregation by category/time | defect-trend, defect-seasonality | `compute/defect-aggregation.ts` — group by category, day, hour |

### Gaps de Consumo (renderer ignora dados existentes)

| # | Gap | Artefato | Correção |
|---|-----|----------|---------|
| **C1** | totalTests hardcoded 0 | flakiness | Usar `computed.testCounts.total` |
| **C2** | Barrel recalcula custo | pipeline-cost | Usar `computed.perRunCosts` diretamente |
| **C3** | Barrel gera timestamp local | todos | Usar `dataHub.timestamp` |

### Ordem de Implementação

```
1. G6 (developer attribution) — enriquecimento no ingest boundary
2. G9 (linkedTestCount) — enriquecimento no ingest boundary
3. G1 (AI metrics) — compute module
4. G10 (defect aggregation) — compute module
5. G8 (regression detection) — compute module
6. G7 (optimization actions) — compute module
7. G4 (traceability tree) — compute module
8. G3 (impact alerts) — compute module
9. G2 (incident events) — compute module
10. G5 (cross-squad) — multi-hub aggregation
11. C1-C3 (correções de consumo) — fixes nos renderers
```
