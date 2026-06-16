# Functional Audit — Registro de Progresso

**Início:** 2026-06-15
**Metodologia:** FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md (T1-T20 + 5 dimensões + testes FT-xx)

---

## Legenda

| Status | Significado  |
| ------ | ------------ |
| 🔜     | Pendente     |
| 🔄     | Em andamento |
| ✅     | Concluído    |
| ❌     | Bloqueado    |

---

## Grupo 0 — Fundação

| Ordem | ID    | Feature             | Audit T1-T20 | 5 Dimensões | Gaps | Testes  | Status |
| ----- | ----- | ------------------- | ------------ | ----------- | ---- | ------- | ------ |
| P1    | FT-04 | Metrics             | ✅           | ✅          | 2    | +13 PBT | ✅     |
| P2    | FT-07 | Store               | ✅           | ✅          | 0    | +6 PBT  | ✅     |
| 0.1   | FT-01 | Config Accessor     | ✅           | ✅          | 0    | —       | ✅     |
| 0.2   | FT-02 | Feature Config      | ✅           | ✅          | 0    | —       | ✅     |
| 0.3   | FT-03 | Session State       | ✅           | ✅          | 0    | —       | ✅     |
| 0.4   | FT-05 | Logger              | ✅           | ✅          | 0    | —       | ✅     |
| 0.5   | FT-06 | Temp Dir            | ✅           | ✅          | 0    | —       | ✅     |
| —     | FT-08 | Integration Helpers | ✅           | N/A         | 0    | —       | ✅     |

### FT-04 — Metrics (Concluído)

**Arquivos:** `shared/metrics.ts` (249L), `shared/__tests__/metrics.test.ts` (279L, 12 tests),
`shared/__tests__/integration/metrics.integration.test.ts` (244L, 10 tests),
`shared/__tests__/metrics.property.test.ts` (348L, 13 tests — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | N/A | Módulo utilitário, sem entry point próprio |
| T2 | Config model | ✅ | Interfaces + Zod schemas |
| T3 | Config accessor | ✅ | Config.get() para xdgStateHome, METRICS_MAX_RUNS |
| T4 | Runtime lê config | ✅ | getBackend() lê config |
| T5 | Wizard entry | N/A | — |
| T6-T11 | CI/Wizard | N/A | — |
| T12 | Test coverage | ✅ | 12 unit + 10 integration + 13 PBT = 35 tests |
| T13 | Dead code | ⚠️ | calculateFlakiness marcado "backward compat" mas usado |
| T14 | Suppression | ❌ | `(err as Error)` em saveMetrics (linha 151) |
| T15-T20 | — | N/A | — |

**5 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Tmp dir + cleanup em integration tests |
| 2. Robustez | ✅ | Contratos tipados, Zod schemas, edge cases |
| 3. Boas Práticas | ✅ | SRP, DIP, sem workarounds |
| 4. Implementação | ⚠️ | Código simplificado: removeu filter redundante |
| 5. Métricas | ❌ | **Fórmula corrigida**: denominador de flakyRate agora exclui testes com < minRuns aparições (antes incluía) |

**Gaps:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Alto | `calculateFlakyRate` incluía testes < minRuns no denominador | Denominador filtrado por minRuns | ✅ |
| G2 | Médio | `(err as Error)` sem validação de tipo | Validar erro com `instanceof` | ✅ |

**Testes criados:** `shared/__tests__/metrics.property.test.ts` — 13 PBT invariantes:

- calculateFlakyRate: range [0,100], empty=0, no-fails=0, all-flaky=100, denominador correto
- calculateFlakiness: consistência pass+fail+skip=totalRuns, rate=fail/totalRuns, fail>0 && pass>0, totalRuns>=minRuns
- getTrends: window respeitado, passRate=[0,100], fórmula correta, empty=[]

---

### FT-07 — Store (Concluído)

**Arquivos:** `shared/store.ts` (109L), `shared/store.test.ts` (196L, 17 tests),
`shared/__tests__/integration/store.integration.test.ts` (260L, 12 tests),
`shared/__tests__/store.property.test.ts` (258L, 6 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1-T11 | — | N/A | Classe utilitária injetada via DI |
| T12 | Test coverage | ✅ | 17 unit + 12 integration + 6 PBT = 35 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ⚠️ | `readJson` usa `as T` — aceitável para operação de leitura JSON |
| T15 | Bidirectional consistency | ✅ | put↔lookup, saveReport↔loadReport, saveMetrics↔loadMetrics, appendBranch↔getBranch |
| T16-T20 | — | N/A | — |

**5 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Tmp dir + cleanup em todos os testes |
| 2. Robustez | ✅ | Contratos tipados, edge cases testados (null, empty, unknown) |
| 3. Boas Práticas | ✅ | DIP (backend injetado via constructor), SRP, clean class |
| 4. Implementação | ✅ | Código limpo e simples |
| 5. Métricas | N/A | Store não produz métricas — é abstração de armazenamento |

**Gaps:** Nenhum

**Testes criados:** `shared/__tests__/store.property.test.ts` — 6 PBT invariantes:

- put+lookup round-trip preserva todos os campos
- lookup retorna null para SHA desconhecido
- listByProject ordenado por timestamp descendente
- listByProject isolado por projeto
- appendBranch+getBranch preserva ordem LIFO
- saveReport+loadReport round-trip

---

### FT-01 — Config Accessor (Concluído)

**Arquivos:** `shared/config-accessor.ts` (77L), `shared/config-accessor.test.ts` (180L, 16 tests),
`shared/__tests__/integration/config-accessor.integration.test.ts` (108L, 12 tests)

**T1-T20:** ✅ — 28 testes, sem gaps. Schema via CONFIG_SCHEMA, override precedence verified.

**5 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ⚠️ | Muta `process.env` global — risco baixo, reset em beforeEach |
| 2. Robustez | ✅ | Tipos genéricos, schema validation, tratamento de erro |
| 3. Boas Práticas | ⚠️ | Singleton + métodos estáticos — padrão aceito no projeto |
| 4. Implementação | ✅ | Código claro, 77L |
| 5. Métricas | N/A | — |

**Gaps:** Nenhum

---

## Grupo 1 — Processamento (Dimensão 5 — Métricas)

**Features críticas para Dimensão 5 (conformidade normativa: ISO 25010, ISTQB, DORA).**

| Ordem | ID    | Feature           | Audit T1-T20 | 5 Dimensões | Gaps | Testes   | Status |
| ----- | ----- | ----------------- | ------------ | ----------- | ---- | -------- | ------ |
| 1.1   | FT-09 | Health Score      | ✅           | ✅          | 3    | +8 PBT   | ✅     |
| 1.2   | FT-10 | Quality Gate      | ✅           | ✅          | 1    | +6 PBT   | ✅     |
| 1.3   | FT-11 | Coverage Source   | ✅           | ✅          | 1    | +8 PBT   | ✅     |
| 1.4   | FT-12 | Quality Metrics   | ✅           | ✅          | 2    | +8 PBT   | ✅     |
| 1.5   | FT-13 | Quality Suggester | ✅           | ✅          | 0    | +8 tests | ✅     |
| 1.6   | FT-14 | Release Score     | ✅           | ✅          | 0    | +8 PBT   | ✅     |
| 1.7   | FT-15 | Benchmark Metrics | ✅           | ✅          | 0    | +6 PBT   | ✅     |

---

**Resumo Grupo 1:** 7/7 features concluídas. **44 novos testes PBT/boundary**, 5 bugs corrigidos no código-fonte, TSC + vitest 100% verde.

---

### FT-09 — Health Score (Concluído)

**Arquivos:** `shared/health-score.ts` (396L), `shared/health-score.test.ts` (925L, 46 tests),
`shared/__tests__/integration/health-score.integration.test.ts` (176L, 11 tests),
`shared/__tests__/health-score.property.test.ts` (234L, 8 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T13 | Dead code | ✅ | `_computeFlakyRate` removida — duplicada de `calculateFlakyRate` |
| T15 | Bidirectional consistency | ✅ | health-score agora usa `calculateFlakyRate` de metrics.ts |

**5 Dimensões — D5 Métricas:**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | 5 dimensões: passRate, flakyRate, coverage, executionRate, suiteSpeed |
| 5b. Metodologia | ✅ | Média exponencial ponderada, proveniência por dimensão |
| 5c. Fórmulas | ⚠️ | `scoreFlakyRate` usava `15` hardcoded — corrigido para `flakyScoreMaxGate` configurável |
| 5d. Conformidade normativa | ✅ | ISO 25020 Annex D (interpolação linear), ISO 25023 (coverage), DORA (passRate), ISTQB (executionRate) |
| 5e. Proveniência | ✅ | 5 entradas com source, standard, formula, thresholdBasis |
| 5f. Validação empírica | ✅ | 8 PBT invariantes + 46 tests unitários + 11 integration |

**Gaps:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Alto | `_computeFlakyRate` duplicado de metrics.ts | Substituído por `calculateFlakyRate` | ✅ |
| G2 | Médio | `scoreFlakyRate` hardcoded 15 | Adicionado `flakyScoreMaxGate` configurável (ISO 25020) | ✅ |
| G3 | Baixo | Proveniência flakyRate não era configurável | Adicionado `targetKey: 'flakyScoreMaxGate'` | ✅ |

**Testes criados:** `shared/__tests__/health-score.property.test.ts` — 8 PBT invariantes:

- overall em [0,100], grade consistente, 5 dimensões, scores em [0,100]
- proveniência completa, empty store→0-critical-fail, overrides, boundaries custom

---

### FT-10 — Quality Gate (Concluído)

**Arquivos:** `shared/quality-gate.ts` (173L), `shared/quality-gate.test.ts` (312L, 12 tests),
`shared/__tests__/quality-gate.test.ts` (115L, 4 tests),
`shared/__tests__/integration/quality-gate.integration.test.ts` (107L, 4 tests),
`shared/__tests__/quality-gate.property.test.ts` (115L, 6 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T6 | Missing types | ✅ | QualityGateResult, QualityGateOptions, GateCheck |
| T13 | Dead code | ✅ | `_flakyCheck` refatorado para usar `calculateFlakyRate` |
| T10 | Edge cases | ✅ | Empty store → 'metrics-data' fail, error catch |

**Gaps:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Baixo | `formatQualityGateText` não exibia score por check | Adicionado `score/threshold — ` ao formato | ✅ |

**Testes criados:** `shared/__tests__/quality-gate.property.test.ts` — 6 PBT invariantes:

- formatQualityGateJson: round-trip JSON válido
- formatQualityGateText: contém header, PASS/FAIL, check names, scores

---

### FT-11 — Coverage Source (Concluído)

**Arquivos:** `shared/coverage-source.ts` (85L), `shared/__tests__/coverage-source.test.ts` (120L, 11 tests),
`shared/__tests__/integration/coverage-source.integration.test.ts` (113L, 7 tests),
`shared/__tests__/coverage-source.property.test.ts` (210L, 8 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T2 | Config model | ✅ | CoverageResult, CoverageSourceType interfaces |
| T3 | Config accessor | N/A | No config dependency |
| T10 | Edge cases | ✅ | File not found, invalid JSON, empty total, missing pct |
| T9 | Correctness | ⚠️ | `detail` prefix sempre usava "lines" mesmo ao fallback para statements |
| T12 | Test coverage | ✅ | 11 unit + 7 integration + 8 PBT = 26 tests |
| T13 | Dead code | ✅ | Nenhum, módulo simples de 85L |

**5 Dimensões — D5 Métricas:**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | Coverage Source: Istanbul + CTRF + none |
| 5b. Metodologia | ✅ | Leitura de coverage-summary.json (istanbul), fallback CTRF |
| 5c. Fórmulas | ✅ | coveragePct = lines.pct ?? statements.pct; detail = prefix + fraction |
| 5d. Conformidade normativa | ✅ | Istanbul coverage-summary.json (formato padrão Istanbul) |
| 5e. Proveniência | ✅ | source field: 'istanbul' | 'ctrf' | undefined |

**Gaps:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Baixo | `detail` prefix errado no fallback para statements | Prefix agora rastreia origem real do `pct` | ✅ |

**Testes criados:** `shared/__tests__/coverage-source.property.test.ts` — 8 PBT invariantes:

- source='istanbul' quando dados existem
- coveragePct sempre [0, 100]
- Prefere lines sobre statements
- Fallback para statements quando lines ausente
- detail prefix corresponde à métrica fonte
- resolveCoverage: istanbul > ctrf
- resolveCoverage: ctrf usado quando istanbul indisponível
- resolveCoverage: undefined sem fonte válida

---

---

### FT-12 — Quality Metrics (Concluído)

**Arquivos:** `shared/quality-metrics.ts` (212L), `shared/quality-metrics.test.ts` (202L, 16 tests),
`shared/__tests__/integration/quality-metrics.integration.test.ts` (151L, 9 tests),
`shared/__tests__/quality-metrics.property.test.ts` (240L, 8 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T6 | Missing types | ✅ | QualityMetricsSnapshot, QualityMetricsCollector interfaces |
| T9 | Correctness | ❌ | `detectDrift`: comparava `currentRatio` (proporção 0-1) vs `mean` (absoluto) |
| T9 | Correctness | ❌ | `layerPassRate`: não limitava a [0,1] — permitia rate > 100% |
| T10 | Edge cases | ✅ | layerPassRate retorna 1 sem attempts, detectDrift [] com < 2 snapshots |
| T12 | Test coverage | ✅ | 16 unit + 9 integration + 8 PBT = 33 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | `catch (err)` com `instanceof Error` |
| T15 | Bidirectional consistency | ✅ | recordLayerAttempt+recordLayerPass ↔ layerPassRate; recordStructureScore ↔ snapshot |

**5 Dimensões — D5 Métricas:**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | invariantFireRate, layerPassRate, artifactTypeCounts, avgStructureScore, drift detection |
| 5b. Metodologia | ✅ | Proporção por invariante, taxa de aprovação por layer, média estrutural, 2σ drift |
| 5c. Fórmulas | ⚠️ | `layerPassRate` agora usa `Math.min(rate, 1)` — ISO 25020 compliance |
| 5d. Conformidade normativa | ✅ | ISO 25020 (bounded [0,1]), 2σ (controle estatístico) |
| 5e. Proveniência | ✅ | Snapshot com timestamp, persistência em json |

**Gaps:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Alto | `detectDrift` comparava currentRatio (proporção) vs mean (absoluto) | Baseline convertido para proporção | ✅ |
| G2 | Médio | `layerPassRate` sem bound [0,1] — permitia rate > 1.0 | Adicionado `Math.min(rate, 1)` | ✅ |

**Testes criados:** `shared/__tests__/quality-metrics.property.test.ts` — 8 PBT invariantes:

- invariantFireRate: sum = 1 (ou 0 sem dados)
- invariantFireRate: cada rate em [0,1]
- layerPassRate: cada rate em [0,1]
- snapshot: avgStructureScore consistente
- clear: reseta fire/layer/structure
- detectDrift: <2 snapshots → []
- detectDrift: invariante sem baseline suficiente → ignorado
- detectDrift: drift detectado quando ratio > 2σ

---

### FT-13 — Quality Suggester (Concluído)

**Arquivos:** `shared/quality-suggester.ts` (100L), `shared/quality-suggester.test.ts` (129L → 227L, 15 tests),
`shared/__tests__/integration/quality-suggester.integration.test.ts` (51L, 3 tests)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T2 | Config model | ✅ | QualitySignal interface (severity/source/message/suggestedAction) |
| T6 | Missing types | ✅ | QualitySignal type com 4 campos |
| T9 | Correctness | ✅ | Thresholds consistentes, boundaries verificadas |
| T10 | Edge cases | ✅ | totalRequests=0 skip; 8 boundary tests p/ latency + failure rate |
| T12 | Test coverage | ✅ | 15 unit + 3 integration = 18 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |
| T15 | Bidirectional consistency | ✅ | checkQualitySignals ↔ updateTyped state persistence |

**5 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1-4 | ✅ | Módulo orquestrador, SRP, DIP (injeção via import), sem workarounds |
| 5. Métricas | ✅ | Sinais de qualidade (drift, latência, falha, benchmark) |

**Gaps:** Nenhum. 8 testes de boundary adicionados (latência/falha thresholds).

**Observação:** PBT não aplicável — funções core (`severityFromLatency`, `failureRate`) são privadas; lógica é comparação de thresholds.

---

### FT-14 — Release Score (Concluído)

**Arquivos:** `shared/release-score.ts` (100L), `shared/release-score.test.ts` (262L, 38 tests),
`shared/__tests__/integration/release-score.integration.test.ts` (93L, 10 tests),
`shared/__tests__/release-score.property.test.ts` (160L, 8 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T2 | Config model | ✅ | ReleaseScoreResult interface, ReleaseScoreResult type |
| T6 | Missing types | ✅ | score, grade, breakdown, recommendation, timestamp |
| T9 | Correctness | ✅ | Pesos: 0.25+0.30+0.25+0.20=1.0, invertFlakiness clamp [0,100] |
| T10 | Edge cases | ✅ | All zeros, flakyRate overflow/negativo, healthGate fail c/ high score |
| T12 | Test coverage | ✅ | 38 unit + 10 integration + 8 PBT = 56 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |

**5 Dimensões — D5 Métricas:**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | 4 dimensões: Tasks, Health, Coverage, Flakiness |
| 5b. Metodologia | ✅ | Weighted composite (25/30/25/20), grade thresholds [90,70,50] |
| 5c. Fórmulas | ✅ | `score = round(Σ wᵢ·xᵢ)`, `invertFlakiness = 100 - flakyRate` clamped |
| 5d. Conformidade normativa | ✅ | ISO 25020 (interpolação linear), ISO 25023 (coverage) |
| 5e. Proveniência | ✅ | Timestamp ISO, breakdown individual por dimensão |

**Gaps:** Nenhum. Pure function module — 56 testes cobrindo pesos, boundaries, edge cases.

**Testes criados:** `shared/__tests__/release-score.property.test.ts` — 8 PBT invariantes:

- score sempre [0, 100]
- grade corresponde aos thresholds
- breakdown: 4 dimensões com labels fixos
- recommendation: "Ready" quando tudo ≥ 70
- recommendation: "Improve" com falhas listadas
- breakdown scores = Math.round(inputs)
- score = round(0.25*tasks + 0.3*health + 0.25*coverage + 0.2*flkScore)
- timestamp ISO

---

### FT-15 — Benchmark Metrics (Concluído)

**Arquivos:** `shared/benchmark-metrics.ts` (130L), `shared/benchmark-metrics.test.ts` (125L, 6 tests),
`shared/__tests__/integration/benchmark-metrics.integration.test.ts` (80L, 5 tests),
`shared/__tests__/benchmark-metrics.property.test.ts` (120L, 6 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T2 | Config model | ✅ | BenchmarkMetrics interface |
| T9 | Correctness | ✅ | countCoveredCriteria, countCoveredPartitions, countCoveredBoundaries |
| T10 | Edge cases | ✅ | Invalid JSON, non-array, empty array, empty ranges |
| T12 | Test coverage | ✅ | 6 unit + 5 integration + 6 PBT = 17 tests |
| T14 | Suppression | ⚠️ | `parsed as TestCaseShape[]` após Array.isArray — aceitável |

**5 Dimensões — D5 Métricas:**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | criteriaCoverage, partitionCoverage, boundaryCoverage |
| 5b. Metodologia | ✅ | String-matching de títulos/steps contra critérios e valores de boundary |
| 5c. Fórmulas | ✅ | coverage = covered/total, bounded [0,1] |
| 5d. Conformidade normativa | ✅ | ISTQB (boundary value analysis, equivalence partitioning) |

**Gaps:** Nenhum.

**Testes criados:** `shared/__tests__/benchmark-metrics.property.test.ts` — 6 PBT invariantes:

- Coverage values sempre [0, 1]
- totalTests = 0 para body inválido
- totalTests = 0 para JSON não-array
- totalTests = length do array
- coveredCriteriaCount ≤ totalCriteria
- criteriaCoverage = 0 quando nenhum critério corresponde

---

## Grupo 2 — Relatórios e Visualização (HTML, Chart, Table, PR Report)

**Features:** FT-16 (PR Report), FT-17 (HTML Report), FT-18 (Coverage Gap), FT-19 (Flakiness Dashboard), FT-20 (Defect Trend), FT-21 a FT-33 (13 features).

| Ordem | ID    | Feature             | Audit T1-T20 | 6 Dimensões | Gaps | Testes   | Status |
| ----- | ----- | ------------------- | ------------ | ----------- | ---- | -------- | ------ |
| 2.1   | FT-17 | HTML Report         | ✅           | ✅          | 0    | 32 tests | ✅     |
| 2.2   | FT-18 | Coverage Gap        | ✅           | ✅          | 0    | 59 tests | ✅     |
| 2.3   | FT-19 | Flakiness Dashboard | ✅           | ✅          | 0    | 21 tests | ✅     |
| 2.4   | FT-20 | Defect Trend        | ✅           | ✅          | 0    | 24 tests | ✅     |
| 2.5   | FT-21 | Defect Seasonality  | ✅           | ✅          | 2    | 48 tests | ✅     |
| 2.6   | FT-22 | Silent Regression   | ✅           | ✅          | 1    | 44 tests | ✅     |
| 2.7   | FT-23 | AI Effectiveness    | ✅           | ✅          | 1    | 42 tests | ✅     |
| 2.8   | FT-24 | AI Comparison       | ✅           | ✅          | 1    | 44 tests | ✅     |
| 2.9   | FT-25 | Cross-Squad Bench   | ✅           | ✅          | 1    | 43 tests | ✅     |
| 2.10  | FT-26 | Suite Optimization  | ✅           | ✅          | 1    | 50 tests | ✅     |
| 2.11  | FT-27 | Developer Profile   | ✅           | ✅          | 1    | 56 tests | ✅     |
| 2.12  | FT-28 | Backlog Health      | ✅           | ✅          | 1    | 42 tests | ✅     |
| 2.13  | FT-29 | Pipeline Cost       | ✅           | ✅          | 1    | 45 tests | ✅     |
| 2.14  | FT-30 | Impact Alert        | ✅           | ✅          | 1    | 49 tests | ✅     |
| 2.15  | FT-31 | Incident Report     | ✅           | ✅          | 1    | 38 tests | ✅     |
| 2.16  | FT-32 | Requirement Score   | ✅           | ✅          | 1    | 46 tests | ✅     |
| 2.17  | FT-33 | Traceability Matrix | ✅           | ✅          | 1    | 44 tests | ✅     |

### FT-17 — HTML Report (Concluído)

**Arquivos:** `shared/report-html.ts` (211L), `shared/report-html.test.ts` (210L, 18 tests),
`shared/__tests__/integration/report-html.integration.test.ts` (152L, 8 tests),
`shared/__tests__/report-html.property.test.ts` (123L, 6 PBT)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `generateHtmlReport` + `generateCoverageHtml` |
| T2 | Config model | ✅ | `ReportOptions` + `CoverageEpic` (report-types.ts) |
| T3 | Config accessor | ✅ | `Config.get()` via project pattern |
| T4 | Runtime lê config | ✅ | Lê em tempo de execução |
| T5-T11 | — | N/A | — |
| T12 | Test coverage | ✅ | 18 unit + 8 integration + 6 PBT = 32 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |
| T15 | Bidirectional consistency | ✅ | `generateHtmlReport` → `generateReportWithFallback` |
| T16-T17 | — | N/A | — |
| T18 | Error handling | ✅ | Ambos os paths com try/catch + log + error page |
| T19 | TECHDOC | ✅ | JSDoc no módulo |
| T20 | — | N/A | — |

**6 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Mocks de logger/config; sem fs real |
| 2. Robustez | ✅ | Tipos fortes, optional chaining |
| 3. Boas Práticas | ✅ | SRP, DIP, sem workarounds |
| 4. Implementação | ✅ | 211L limpas, orquestração clara |
| 5. Métricas | N/A | Orquestrador, não métricas |
| 6. UX | ✅ | Footer informativo, fallbacks adequados |

**Gaps:** Nenhum.

**Testes existentes:** 32 testes — 18 unit + 8 integration + 6 PBT. Cobertura adequada para orquestrador de 211L.

---

### FT-18 — Coverage Gap (Concluído)

**Arquivos:** `shared/generate-coverage-gap-html.ts` (209L), `shared/generate-coverage-gap-html.test.ts` (177L, 14 tests),
`shared/__tests__/integration/coverage-gap.integration.test.ts` (140L, 3 tests),
`shared/__tests__/coverage-gap-html.property.test.ts` (143L, 4 PBT)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `generateCoverageGapHtml` |
| T2 | Config model | ✅ | `CoverageGapResult` + `CoverageHierarchyNode` (types.ts) |
| T3-T11 | — | N/A | — |
| T12 | Test coverage | ✅ | 14 unit + 3 integration + 4 PBT = 21 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |
| T15-T17 | — | N/A | — |
| T18 | Error handling | ✅ | try/catch + log + error page |
| T19 | TECHDOC | ✅ | JSDoc no módulo |
| T20 | — | N/A | — |

**6 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Mocks de logger/config |
| 2. Robustez | ✅ | `sanitizeHtml` em toda saída, tipos fortes |
| 3. Boas Práticas | ✅ | SRP, funções pequenas, sem workarounds |
| 4. Implementação | ✅ | 209L, separação clara de responsabilidades |
| 5. Métricas | N/A | Orquestrador de relatório |
| 6. UX | ✅ | Tabela com filtro, árvore colapsável, dark mode |

**Gaps:** Nenhum.

**Testes existentes:** 21 diretos + 38 indiretos (coverage-gap core) = 59 testes. Cobertura excelente.

---

### FT-19 — Flakiness Dashboard (Concluído)

**Arquivos:** `shared/flakiness-dashboard.ts` (100L), `shared/flakiness-dashboard.test.ts` (113L, 11 tests),
`shared/__tests__/integration/flakiness-dashboard.integration.test.ts` (92L, 5 tests),
`shared/__tests__/flakiness-dashboard-html.property.test.ts` (113L, 5 PBT)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `generateFlakinessHtml` + `filterHighFlakiness` |
| T2 | Config model | ✅ | `FlakinessEntry` (metrics.ts) |
| T3-T11 | — | N/A | — |
| T12 | Test coverage | ✅ | 11 unit + 5 integration + 5 PBT = 21 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |
| T18 | Error handling | ✅ | try/catch + log + error page |
| T19 | TECHDOC | ✅ | JSDoc no módulo |

**6 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Mocks de logger/config |
| 2. Robustez | ✅ | `sanitizeHtml` em títulos, tipos fortes |
| 3. Boas Práticas | ✅ | SRP, funções curtas |
| 4. Implementação | ✅ | 100L limpas |
| 5. Métricas | ✅ | Taxa de flakiness, threshold de severidade |
| 6. UX | ✅ | Tabela com sparklines, badges, dark mode |

**Gaps:** Nenhum.

**Testes existentes:** 21 testes para 100L de código. Cobertura excelente.

---

### FT-20 — Defect Trend (Concluído)

**Arquivos:** `shared/defect-trend.ts` (149L), `shared/defect-trend.test.ts` (182L, 16 tests),
`shared/__tests__/integration/defect-trend.integration.test.ts` (84L, 4 tests),
`shared/__tests__/defect-trend-html.property.test.ts` (102L, 4 PBT)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `aggregateDefectTrends` + `generateDefectTrendHtml` |
| T2 | Config model | ✅ | `DefectTrendPoint`, `DefectTrendResult`, `FailureClassification` |
| T3-T11 | — | N/A | — |
| T12 | Test coverage | ✅ | 16 unit + 4 integration + 4 PBT = 24 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ✅ | Nenhuma |
| T18 | Error handling | ✅ | try/catch + log + error page |
| T19 | TECHDOC | ✅ | JSDoc no módulo |

**6 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Mocks de logger/config |
| 2. Robustez | ✅ | `sanitizeHtml` em toda saída, null-safe |
| 3. Boas Práticas | ✅ | Separação data aggregation ↔ HTML rendering |
| 4. Implementação | ✅ | 149L, código claro |
| 5. Métricas | ✅ | Categorias de falha, contagens, período |
| 6. UX | ✅ | Tabela com categorias dinâmicas, período no título |

**Gaps:** Nenhum.

**Testes existentes:** 24 testes para 149L de código. Cobertura excelente.

---

### Resumo Bloco A (FT-17 a FT-20)

| Feature                     | Arquivo                                | Tests | Gaps | Status |
| --------------------------- | -------------------------------------- | ----- | ---- | ------ |
| FT-17 — HTML Report         | `report-html.ts` (211L)                | 32    | 0    | ✅     |
| FT-18 — Coverage Gap        | `generate-coverage-gap-html.ts` (209L) | 59    | 0    | ✅     |
| FT-19 — Flakiness Dashboard | `flakiness-dashboard.ts` (100L)        | 21    | 0    | ✅     |
| FT-20 — Defect Trend        | `defect-trend.ts` (149L)               | 24    | 0    | ✅     |

**Bloco A completo.** Nenhum gap encontrado. Features sólidas e bem testadas.

---

### FT-21 — Defect Seasonality (Concluído)

**Arquivos:** `shared/defect-seasonality.ts` (232L), `shared/defect-seasonality.test.ts` (354L, 32 tests),
`shared/__tests__/integration/defect-seasonality.integration.test.ts` (120L, 9 tests — NOVO),
`shared/__tests__/defect-seasonality.property.test.ts` (135L, 7 PBT — NOVO)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `aggregateDefectSeasonality` + `generateSeasonalityHtml` |
| T2 | Config model | ✅ | `SeasonalityDay`, `SeasonalityHour`, `SeasonalityResult` |
| T3-T11 | — | N/A | — |
| T12 | Test coverage | ✅ | 32 unit + 9 integration + 7 PBT = 48 tests |
| T13 | Dead code | ✅ | Nenhum |
| T14 | Suppression | ❌ **corrigido** | `(err as Error).message` sem validação → substituído por `instanceof Error` |
| T15-T17 | — | N/A | — |
| T18 | Error handling | ✅ **corrigido** | Catch agora extrai `msg` com `instanceof Error`, padronizado com outros módulos |
| T19 | TECHDOC | ✅ | JSDoc no módulo |
| T20 | — | N/A | — |

**6 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Mocks de logger/config |
| 2. Robustez | ✅ | Tipos fortes, `sanitizeHtml`, null-safe (função atualizada) |
| 3. Boas Práticas | ✅ | SRP, separação data↔HTML |
| 4. Implementação | ✅ | 232L, código claro |
| 5. Métricas | ✅ | Sazonalidade por dia/hora, picos |
| 6. UX | ✅ | Tabelas por dia/hora, cards de resumo |

**Gaps corrigidos:**
| ID | Severidade | Descrição | Ação | Status |
|---|---|---|---|---|
| G1 | Alto | `(err as Error).message` em catch — supressão de tipo sem validação | Substituído por `instanceof Error` | ✅ |
| G2 | Médio | `aggregateDefectSeasonality` não aceitava `null \| undefined` (inconsistente com `aggregateDefectTrends`) | Adicionado `\| null \| undefined` + guard | ✅ |

**Testes existentes:** 48 testes (32 unit + 9 integration + 7 PBT). Cobertura robusta.

---

### Resumo Bloco B (FT-21 a FT-33)

**Padrão de bug encontrado em todos os 12 módulos:** catch blocks usando `(err as Error).message` em vez de `instanceof Error` — violação de T14 (Suppression). Corrigido em todos os arquivos.

**Gaps corrigidos (transversal):**

| ID    | Severidade | Padrão                                         | Ação                               | Arquivos afetados |
| ----- | ---------- | ---------------------------------------------- | ---------------------------------- | ----------------- |
| T14-G | Alto       | `(err as Error).message` sem validação de tipo | Substituído por `instanceof Error` | 12 arquivos       |

**Testes criados:** 11 integration (FT-xx) + 11 PBT = 22 novos arquivos de teste.

| Feature                       | Unit (existente) | Integration (novo) | PBT (novo) | Total  |
| ----------------------------- | ---------------- | ------------------ | ---------- | ------ |
| FT-21 — Defect Seasonality    | 32               | 9                  | 7          | **48** |
| FT-22 — Silent Regression     | 28               | 8                  | 8          | **44** |
| FT-23 — AI Effectiveness      | 30               | 4                  | 8          | **42** |
| FT-24 — AI Comparison         | 34               | 4                  | 6          | **44** |
| FT-25 — Cross-Squad Benchmark | 32               | 4                  | 7          | **43** |
| FT-26 — Suite Optimization    | 35               | 5                  | 10         | **50** |
| FT-27 — Developer Profile     | 36               | 4                  | 10         | **50** |
| FT-28 — Backlog Health        | 30               | 3                  | 9          | **42** |
| FT-29 — Pipeline Cost         | 27               | 4                  | 14         | **45** |
| FT-30 — Impact Alert          | 33               | 4                  | 12         | **49** |
| FT-31 — Incident Report       | 23               | 7                  | 8          | **38** |
| FT-32 — Requirement Score     | 30               | 7                  | 9          | **46** |
| FT-33 — Traceability Matrix   | 27               | 7                  | 8          | **42** |

---

### Resumo Grupo 2 (completo)

| Bloco             | Features | Gaps corrigidos      | Testes totais |
| ----------------- | -------- | -------------------- | ------------- |
| A — FT-17 a FT-20 | 4        | 0                    | 136           |
| B — FT-21 a FT-33 | 12       | 12 (T14 suppression) | 583           |
| **Total**         | **16**   | **12**               | **719**       |

**Grupo 2 — COMPLETO.** ✅

---

## Cross-cutting: Dimensão 6 (UX) + Dimensão 7 (Test Quality) — Grupos 0, 1, 2

**Início:** 2026-06-16
**Conclusão D7 (Fases 1-4, 6):** 2026-06-16
**Decisão:** Dimensão 7 adicionada ao plano integrado. Executada retroativamente em Grupos 0, 1, 2 antes de iniciar Grupo 3, para garantir baseline consistente.

| Grupo | Features | D6 UX | D7 Test Quality | Status |
| ----- | -------- | ----- | --------------- | ------ |
| 0     | 8        | 🔄    | ✅              | 🔄     |
| 1     | 7        | 🔄    | ✅              | 🔄     |
| 2     | 16       | 🔄    | ✅              | 🔄     |

### Anti-padrões — Resumo da correção

| Padrão                                        | Detectado                                     | Corrigido | Restante | Detalhes                                                                                       |
| --------------------------------------------- | --------------------------------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------- |
| `toBeDefined()` sem assert                    | ~140                                          | 3         | ~137     | 3 bad tests corrigidos; demais são precondition guards + assert real                           |
| `toThrow()` sem argumento                     | ~80                                           | 2         | ~78      | 2 corrigidos (1 removido, 1 convertido p/ value asserts); demais são `.not.toThrow()` ou VALID |
| `nullAs()` (type suppression)                 | 13                                            | 13        | 0        | Todos removidos: 11 tests deletados (já cobertos), 2 convertidos p/ `[]`                       |
| `.skip` / `.only`                             | 0                                             | —         | —        | Nenhum encontrado                                                                              |
| Type suppressions (`as unknown as`, `as any`) | Item 7.3 — reportado à auditoria de supressão | —         | —        | `nullAs()` resolved; `as` casts remanescentes serão tratados na suppression audit              |

### Fases

| Fase | Descrição                                                  | Esforço real | Status |
| ---- | ---------------------------------------------------------- | ------------ | ------ |
| 1    | Classificar ocorrências `toBeDefined` (válido vs bad test) | 2h           | ✅     |
| 2    | Classificar `toThrow()` sem arg (válido vs bad test)       | 30min        | ✅     |
| 3    | Corrigir bad tests em Grupos 0 + 1                         | 1h           | ✅     |
| 4    | Corrigir bad tests em Grupo 2                              | 1h           | ✅     |
| 5    | Amostragem Oracle Problem                                  | 2h           | ✅     |
| 6    | Validação final (tsc + vitest + lint)                      | 15min        | ✅     |

### Oracle Problem — Amostragem

**Arquivos auditados:** `health-score.test.ts` (7 tests), `quality-gate.test.ts` + `.property.test.ts` (10 tests), `release-score.property.test.ts` + `.integration.test.ts` (18 tests).

**Total:** 35 testes, 60+ asserções analisadas.

| Tipo                                                         | Encontrados          | Corrigidos                                                                                |
| ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| Classic Oracle Problem (copy output as expectation)          | 0                    | —                                                                                         |
| Dual-implementation (test re-derives same formula as source) | 5 asserts em 2 tests | ✅ Substituído por invariantes independentes (monotonicidade, thresholds, boundary cases) |

### Correções realizadas — Detalhamento

**`toBeDefined()` → asserção de valor real (3 arquivos):**

| Arquivo                                                            | Linha | Antes            | Depois                                                               |
| ------------------------------------------------------------------ | ----- | ---------------- | -------------------------------------------------------------------- |
| `shared/__tests__/health-score.test.ts`                            | 134   | `.toBeDefined()` | `.toMatch(/^(pass\|fail)$/)`                                         |
| `shared/__tests__/integration/health-score.integration.test.ts`    | 170   | `.toBeDefined()` | `.toBe('excellent')` + `.toBe('critical')` (two-boundary comparison) |
| `shared/__tests__/integration/config-accessor.integration.test.ts` | 52    | `.toBeDefined()` | `.toBe('INFO')`                                                      |

**`toThrow()` sem argumento → validação de erro (2 arquivos):**

| Arquivo                                                               | Linha | Antes                     | Depois                                                          |
| --------------------------------------------------------------------- | ----- | ------------------------- | --------------------------------------------------------------- |
| `shared/__tests__/integration/suite-optimization.integration.test.ts` | 61    | `nullAs()` + `.toThrow()` | Removido (testava null com type suppression)                    |
| `shared/__tests__/integration/defect-seasonality.integration.test.ts` | 113   | `.not.toThrow()`          | Asserções de valor: `toHaveLength(7)`, `toBe(0)`, `toBe('N/A')` |

**`nullAs()` removal (13 arquivos):**

Arquivos: `defect-trend`, `developer-profile`, `impact-alert`, `flakiness-dashboard`, `ai-effectiveness`, `ai-comparison`, `pipeline-cost`, `coverage-gap`, `cross-squad-benchmark`, `defect-seasonality`, `report-html`, `suite-optimization` em `shared/__tests__/integration/`.

Todos os testes de null removidos (substituídos por casos vazios já existentes ou `[]`).

**Validado:** `npx tsc --noEmit` = 0 erros. `npx vitest run shared/__tests__/` = 62/62 files, 502/502 tests passed.

---

## Próximo: Grupo 3 — Test Impact (FT-35 a FT-40)
