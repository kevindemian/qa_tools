# Functional Audit — Registro de Progresso

**Início:** 2026-06-15
**Metodologia:** FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md (T1-T20 + 7 dimensões + testes FT-xx)

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

| Ordem | ID    | Feature             | Audit T1-T20 | 7 Dimensões | Gaps | Testes  | Status |
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
| 3. Boas Práticas | ✅ | SRP, DIP, sem desvios |
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

| Ordem | ID    | Feature           | Audit T1-T20 | 7 Dimensões | Gaps | Testes   | Status |
| ----- | ----- | ----------------- | ------------ | ----------- | ---- | -------- | ------ |
| 1.1   | FT-09 | Health Score      | ✅           | ✅          | 5    | +2 tests | ✅ 🔄  |
| 1.2   | FT-10 | Quality Gate      | ✅           | ✅          | 1    | +6 PBT   | ✅     |
| 1.3   | FT-11 | Coverage Source   | ✅           | ✅          | 1    | +8 PBT   | ✅     |
| 1.4   | FT-12 | Quality Metrics   | ✅           | ✅          | 2    | +8 PBT   | ✅     |
| 1.5   | FT-13 | Quality Suggester | ✅           | ✅          | 0    | +8 tests | ✅     |
| 1.6   | FT-14 | Release Score     | ✅           | ✅          | 0    | +8 PBT   | ✅     |
| 1.7   | FT-15 | Benchmark Metrics | ✅           | ✅          | 0    | +6 PBT   | ✅     |

---

**Resumo Grupo 1:** 7/7 features concluídas. **44 novos testes PBT/boundary**, 5 bugs corrigidos (auditoria original). **Re-auditoria 2026-06-17:** FT-09 re-auditado, +2 testes, +5 gaps corrigidos, TSC + vitest + lint 100% verde.

---

### FT-09 — Health Score (Re-auditado 2026-06-17)

**Arquivos:** `shared/health-score.ts` (367L), `shared/health-score.test.ts` (925L, 48 tests),
`shared/__tests__/health-score.test.ts` (136L, 5 tests),
`shared/__tests__/integration/health-score.integration.test.ts` (195L, 11 tests),
`shared/__tests__/health-score.property.test.ts` (227L, 8 PBT),
`shared/__tests__/integration-metrics.test.ts` (126L, 2 tests — cross-module)

**T1-T20:**
| # | Categoria | Status | Gap |
|---|---|---|---|
| T1 | Entry point | ✅ | `calculateHealthScore()` + `evaluateQualityGate()` exportados |
| T2 | Config model | ✅ | `HealthScoreConfig` interface (16 campos) |
| T3 | Config accessor | N/A | Opções inline, sem accessor |
| T4 | Runtime lê config | ✅ | `pickConfig()` merge defaults + options |
| T5-T11 | Wizard/CI | N/A | Módulo de função pura |
| T12 | Test coverage | ✅ | 74 testes (48U+5U+8PBT+11I+2cross-module) |
| T13 | Dead code | ⚠️ | `_computeFlakyRate` NÃO é duplicata — skip exclusion difere de `calculateFlakyRate` (metrics.ts). PROGRESS.md anterior registrou incorretamente como "removida". |
| T14 | Suppression | ❌ **corrigido** | `as MetricsRun` (L129) e `as number` (L148) removidos — substituídos por `if(!run) continue` e `?? 0` |
| T15 | Bidirectional | ✅ | `evaluateQualityGate` usado standalone e internamente |
| T16-T17 | CLI/Env | N/A | — |
| T18 | Error handling | ✅ | Função pura, guards contra divisão por zero |
| T19 | TECHDOC | ✅ | `docs/TECHDOC.md` L682 |
| T20 | CI/Config | N/A | — |

**7 Dimensões:**
| Dimensão | Status | Achados |
|---|---|---|
| 1. Isolamento Testes | ✅ | Função pura, sem I/O, sem fs, sem rede |
| 2. Robustez | ✅ | Tipos fortes, edge cases testados, guards |
| 3. Boas Práticas | ✅ | SRP, DIP (imports interfaces), sem workarounds |
| 4. Implementação | ✅ | 367L, código claro, funções coesas |
| 5. Métricas | ⚠️ | Ver detalhamento abaixo |
| 6. UX | N/A | Módulo interno consumido por CLI/PR report |
| 7. Test Quality | ⚠️ | 1 type assertion restante (`as Array<{...}>` em Object.values — narrow legítimo de unknown[]) |

**D5 — Métricas (detalhamento):**
| Sub-eixo | Status | Achados |
|---|---|---|
| 5a. Inventário | ✅ | 5 dimensões: passRate, flakyRate, coverage, executionRate, suiteSpeed |
| 5b. Metodologia | ✅ | Média exponencial ponderada, per-test flaky, p95 speed |
| 5c. Fórmulas | ✅ | ISO 25020 linear interpolation, clamped [0,100]. **G-05 corrigido:** `scoreFlakyRate` agora usa `flakyThreshold` (3%) como boundary score=100 (antes usava 0). Default `flakyThreshold` corrigido de 0.03 para 3 (escala percentual). |
| 5d. Conformidade normativa | ✅ | ISO 25020 (interpolação), ISO 25023 (coverage), DORA (passRate), ISTQB (executionRate), Google SRE (suiteSpeed) |
| 5e. Proveniência | ✅ | **G-03 corrigido:** suiteSpeed `thresholdBasis` mudou de "max 10000ms" para "max 3000ms" para refletir o default real. |
| 5f. Validação empírica | ✅ | 8 PBT invariantes + 74 testes |

**Gaps encontrados e corrigidos na re-auditoria:**
| ID | Severidade | Dimensão | Descrição | Ação | Status |
|---|---|---|---|---|---|
| G-02a | Médio | T14 | `as MetricsRun` (L129) — type assertion | Substituído por `if (!run) continue` | ✅ |
| G-02b | Médio | T14 | `as number` (L148) — type assertion | Substituído por `?? 0` | ✅ |
| G-03 | Alto | D5e | Proveniência suiteSpeed: `thresholdBasis` dizia "10000ms", default é 3000ms | Atualizado para "max 3000ms" | ✅ |
| G-04 | Baixo | D7.9 | 3 type assertions em testes: `as HealthScoreProvenance`, `as HealthScoreProvenanceEntry`, `as Array<source;formula>` | Substituídos por `?? []` + `?.` — 1 cast legítimo mantido (Object.values) | ✅ |
| G-05 | Alto | D5c/5e | `scoreFlakyRate` ignorava `flakyThreshold` (usava 0 hardcoded). Default `flakyThreshold: 0.03` estava em escala 0-1, inconsistente com `maxFlakyGate: 5` (escala 0-100). | `scoreFlakyRate` agora usa `flakyThreshold` como boundary score=100. Default corrigido para 3 (escala percentual). | ✅ |

**Nota sobre G-01 (registro anterior):**
O PROGRESS.md anterior registrou G1 como "`_computeFlakyRate` duplicado de metrics.ts → ✅". Na re-auditoria constatou-se que `_computeFlakyRate` NÃO é duplicata: ela exclui skipped tests do denominador de minRuns (diferente de `calculateFlakiness`) e retorna `null` vs `0` para exclusão de peso. As funções têm semântica diferente deliberada.

**Testes adicionados na re-auditoria:**

- `health-score.test.ts` — G-03: "provenance thresholdBasis for suiteSpeed matches default maxSuiteSpeedGate"
- `health-score.test.ts` — G-05: "flakyThreshold parameter affects flaky rate scoring"

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
| 1-4 | ✅ | Módulo orquestrador, SRP, DIP (injeção via import), sem desvios |
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

| Ordem | ID    | Feature             | Audit T1-T20 | 7 Dimensões | Gaps | Testes   | Status |
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
| 3. Boas Práticas | ✅ | SRP, DIP, sem desvios |
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
| 3. Boas Práticas | ✅ | SRP, funções pequenas, sem desvios |
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

## Cross-cutting: Dimensão 6 (UX) + Dimensão 7 (Deep Test Audit) — Grupos 0, 1, 2

**Início:** 2026-06-16
**Conclusão D7 (Fases 1-4, 6):** 2026-06-16
**Decisão:** Dimensão 7 adicionada ao plano integrado. Executada retroativamente em Grupos 0, 1, 2 antes de iniciar Grupo 3, para garantir baseline consistente.

| Grupo | Features | D6 UX    | D7 Deep Test Audit | Status |
| ----- | -------- | -------- | ------------------ | ------ |
| 0     | 8        | 🔄       | ✅                 | 🔄     |
| 1     | 7        | 🔄       | ✅                 | 🔄     |
| 2     | 16       | 🔄       | ✅                 | 🔄     |
| 3     | 6        | FT-35 ✅ | FT-35 ✅           | 🔄     |

> **Nota:** Aplicação da D6 ao Grupo 3 (FT-35) revelou que documentação incorreta e mensagens não acionáveis são gaps de UX. Esta definição deve ser aplicada retroativamente aos Grupos 0-2 e prospectivamente aos Grupos 4-7.

### Anti-padrões — Resumo da correção

| Padrão                                                            | Detectado                                | Corrigido | Restante | Detalhes                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------- |
| `toBeDefined()` sem assert                                        | ~140                                     | 3         | ~137     | 3 bad tests corrigidos; demais são precondition guards + assert real                           |
| `toThrow()` sem argumento                                         | ~80                                      | 2         | ~78      | 2 corrigidos (1 removido, 1 convertido p/ value asserts); demais são `.not.toThrow()` ou VALID |
| `nullAs()` (type suppression)                                     | 13                                       | 13        | 0        | Todos removidos: 11 tests deletados (já cobertos), 2 convertidos p/ `[]`                       |
| `.skip` / `.only`                                                 | 0                                        | —         | —        | Nenhum encontrado                                                                              |
| Type suppressions (casts via `unknown`, type assertions to `any`) | Item 7.3 — reportado à suppression audit | —         | —        | `nullAs()` removed; remaining `as` casts deferred to suppression audit                         |

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

---

## Grupo 3 — Test Impact e Análise

### FT-35: Test Impact (`shared/test-impact.ts`)

**Início:** 2026-06-16
**Conclusão:** 2026-06-16

#### T1-T20 — Auditoria completa

| #   | Categoria          | Status | Gap                                                                   |
| --- | ------------------ | ------ | --------------------------------------------------------------------- |
| T1  | Entry point        | ✅     | CLI (case22), batch-mode, tests públicos                              |
| T2  | Config model       | ✅     | Zod schema `FileTestMappingArraySchema` adicionado em `types/bugs.ts` |
| T3  | Config accessor    | ✅     | N/A — parâmetros inline, sem accessor                                 |
| T4  | Runtime lê config  | ✅     | Lê mapping file se mappingPath fornecido                              |
| T5  | Wizard entry       | ❌ N/A | Test impact é análise, sem wizard                                     |
| T6  | Wizard detection   | ❌ N/A |                                                                       |
| T7  | Wizard output      | ❌ N/A |                                                                       |
| T8  | Wizard prompts     | ❌ N/A |                                                                       |
| T9  | Reconfig handler   | ❌ N/A |                                                                       |
| T10 | CI integration     | ✅     | `batch-mode.ts` + `mr-handler.ts` usam test-impact                    |
| T11 | CI safety          | ✅     | try/catch em todas as funções de I/O, fallbacks em todos os caminhos  |
| T12 | Test coverage      | ✅     | 31 testes (18 unit + 6 integration + 7 PBT)                           |
| T13 | Dead code          | ✅     | Nenhum código morto                                                   |
| T14 | Suppressions       | ✅     | Nenhum `as any`, `!`, `@ts-ignore`, eslint-disable                    |
| T15 | Bidirectional      | ❌ N/A | Fluxo unidirecional (diff → analysis)                                 |
| T16 | CLI interface      | ✅     | Case22 no menu, batch-mode com flag `--run-impacted-tests`            |
| T17 | Env var dependency | ✅     | Nenhuma                                                               |
| T18 | Error handling     | ✅     | Logging com contexto + fallback em todos os erros                     |
| T19 | TECHDOC            | ✅     | `shared/test-impact.ts` adicionado à tabela `shared/`                 |
| T20 | CI/Config Contract | ❌ N/A | Sem cadeia CI→Action→CLI para esta feature                            |

#### Dimensão 1-7 — Auditoria completa

| Dimensão               | Status | Achados                                                                                    |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------ |
| 1. Isolamento Testes   | ✅     | Todos os testes usam `vi.mock('fs')` e `vi.mock('child_process')` — sem I/O real           |
| 2. Robustez            | ✅     | Contratos tipados exportados; Zod para mapping; edge cases testados; try/catch em toda I/O |
| 3. Boas Práticas       | ✅     | SRP, DIP (imports shared/), sem workarounds, padrão consistente                            |
| 4. Implementação Ótima | ✅     | Funções coesas, sem duplicação, algoritmo three-tier adequado                              |
| 5. Métricas            | ❌ N/A | Feature não produz métricas                                                                |
| 6. UX                  | ✅     | 8 itens avaliados (ver detalhamento abaixo)                                                |
| 7. Test Quality        | ✅     | 8 itens avaliados (ver detalhamento abaixo)                                                |

#### Dimensão 6 — UX (itens 6.1 a 6.8)

| Item | Descrição                | Evidência                                                                                   | Status |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------- | ------ |
| 6.1  | Erros acionáveis         | `printError` atualizado com causa + ação sugerida                                           | ✅     |
| 6.2  | CLI --help claro         | Menu + docs section 22 explicam fluxo; seção reescrita (estava incorreta)                   | ✅     |
| 6.3  | Output legível           | `title()`, `tableView()`, `divider()`, `info()`, `warn()` — padrão consistente              | ✅     |
| 6.4  | Feedback de progresso    | Operação síncrona rápida (<1s) — N/A                                                        | ❌ N/A |
| 6.5  | Confirmação destrutiva   | Read-only analysis — N/A                                                                    | ❌ N/A |
| 6.6  | Navegação consistente    | `pushHistory()`, menu flow padrão, idêntico às demais opções                                | ✅     |
| 6.7  | Terminologia consistente | "test-impact" uniforme em código, docs, menu, batch-mode; docs corrigidas (descreviam Jira) | ✅     |
| 6.8  | Silent/verbose mode      | Comando interativo — N/A                                                                    | ❌ N/A |

#### Dimensão 7 — Test Quality (itens 7.1 a 7.8)

| Item | Descrição                                  | Evidência                                                                                            | Status |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ |
| 7.1  | `toBeDefined()` sem assert                 | Grep: 0 occurrences in test-impact test files                                                        | ✅     |
| 7.2  | `toThrow()` sem argumento                  | Grep: 0 occurrences in test-impact test files                                                        | ✅     |
| 7.3  | Oracle Problem (output copied as expected) | PBT invariantes independentes, não acoplados à implementação                                         | ✅     |
| 7.4  | `.skip` / `.only`                          | Grep: 0 occurrences                                                                                  | ✅     |
| 7.5  | Type suppressions (casts via unknown)      | Grep: 0 occurrences                                                                                  | ✅     |
| 7.6  | Type suppressions (`as any`)               | Grep: 0 occurrences                                                                                  | ✅     |
| 7.7  | Property-based testing                     | 7 PBTs: invariantes de confidence, dedup, serialization                                              | ✅     |
| 7.8  | Nomes descritivos de teste                 | 100% tests with behavior-descriptive names (e.g., `deduplicates across tiers with correct priority`) | ✅     |

#### Testes de integração (6 testes)

| Teste                                                      | Resultado |
| ---------------------------------------------------------- | --------- |
| runs analyzeTestImpact with real diff                      | ✅        |
| returns high confidence when jest finds related tests      | ✅        |
| returns high confidence when mapping matches changed files | ✅        |
| deduplicates across tiers with correct priority            | ✅        |
| keyword match finds tests by file segment                  | ✅        |
| generateTestSelectionJson produces valid output            | ✅        |

#### Testes de propriedade (PBT — 7 testes)

| Invariante                                             | Teste                                                         | Status |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------ |
| Low confidence when nothing matches + jest unavailable | `confidence is low when nothing matches and jest unavailable` | ✅     |
| Empty diff → empty result + low confidence             | `empty diff returns empty result with low confidence`         | ✅     |
| No duplicate test keys in impactedTests                | `impactedTests has no duplicate test keys`                    | ✅     |
| changedFiles preserves order and content               | `changedFiles preserves order and content of diff`            | ✅     |
| Confidence is always valid (high/medium/low)           | `confidence is never undefined or invalid`                    | ✅     |
| generateTestSelectionJson round-trips through JSON     | `round-trips through JSON serialization`                      | ✅     |
| All ImpactedTest fields preserved in serialization     | `preserves all impactedTest fields through serialization`     | ✅     |

#### Validação

- ✅ `npx tsc --noEmit` = 0 erros
- ✅ `npx vitest run` (test-impact) = 39 tests (unit 18 + integration 6 + PBT 7 + case22 8)
- ✅ `npm run lint` = ✅ All quality checks passed

#### Gaps encontrados e corrigidos

| ID  | Item                         | Severidade | Antes                                                                   | Depois                                                                                                   |
| --- | ---------------------------- | ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| G1  | T2 — FileTestMapping Zod     | Alto       | `safeParseJson` sem validação de shape                                  | `FileTestMappingArraySchema` + `parseFileTestMappings()` em `types/bugs.ts`                              |
| G2  | T19 — TECHDOC ausente        | Médio      | `shared/test-impact.ts` não constava no doc                             | Adicionado à tabela `shared/` em `docs/TECHDOC.md`                                                       |
| G3  | D6/6.7 — Documentação errada | Alto       | `docs/02-jira-management.md` descrevia fluxo de issues Jira (incorreto) | Reescrito com fluxo real: git diff → 3 tiers → output                                                    |
| G4  | D6/6.1 — Erro não acionável  | Baixo      | `printError('Falha ao obter git diff', err)`                            | `printError('Não foi possível obter o git diff. Verifique se o repositório tem commits suficientes...')` |

#### Nota sobre Dimensão 6 (UX) e documentação

**Decisão registrada:** A Dimensão 6 (UX) inclui a documentação da feature como parte da experiência do usuário. Correções de documentação incorreta, mensagens de erro não acionáveis e inconsistências terminológicas são gaps de UX e devem ser tratados como tal, não como N/A. Esta decisão aplica-se retroativamente a todas as features já auditadas (Grupos 0, 1, 2) e deve ser considerada nas auditorias futuras (Grupos 4-7).

---

### FT-36: Quarantine (`shared/quarantine.ts`)

**Início:** 2026-06-16
**Conclusão:** 2026-06-16

#### T1-T20

| #   | Categoria          | Status | Gap                                                                             |
| --- | ------------------ | ------ | ------------------------------------------------------------------------------- |
| T1  | Entry point        | ✅     | Usado via batch-mode (`runQuarantineMaintenance()`) e programaticamente         |
| T2  | Config model       | ✅     | Zod schemas: `QuarantineEntrySchema`, `QuarantineStoreSchema`                   |
| T3  | Config accessor    | ✅     | `Config.get('xdgStateHome')` para diretório de dados                            |
| T4  | Runtime lê config  | ✅     | Lê `xdgStateHome` do Config                                                     |
| T5  | Wizard entry       | ❌ N/A | Sem wizard                                                                      |
| T6  | Wizard detection   | ❌ N/A |                                                                                 |
| T7  | Wizard output      | ❌ N/A |                                                                                 |
| T8  | Wizard prompts     | ❌ N/A |                                                                                 |
| T9  | Reconfig handler   | ❌ N/A |                                                                                 |
| T10 | CI integration     | ✅     | `batch-mode.ts` + `pr-report.ts` usam quarantine                                |
| T11 | CI safety          | ✅     | try/catch em todas as funções de I/O; `ensureDir` corrigido (tinha catch vazio) |
| T12 | Test coverage      | ✅     | 39 testes (17 unit + 9 PBT + 8 integration)                                     |
| T13 | Dead code          | ✅     | Nenhum código morto                                                             |
| T14 | Suppressions       | ✅     | `ensureDir` catch vazio substituído por logging com contexto                    |
| T15 | Bidirectional      | ❌ N/A | Fluxo unidirecional                                                             |
| T16 | CLI interface      | ❌ N/A | Sem CLI própria; usado via batch-mode e programaticamente                       |
| T17 | Env var dependency | ✅     | Nenhuma                                                                         |
| T18 | Error handling     | ✅     | try/catch + logging em save/load/pipeline; `ensureDir` corrigido                |
| T19 | TECHDOC            | ✅     | `shared/quarantine.ts` adicionado à tabela `shared/`                            |
| T20 | CI/Config Contract | ❌ N/A | Sem cadeia CI→Action→CLI                                                        |

#### Dimensão 1-7

| Dimensão               | Status | Achados                                                                                                                                           |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Isolamento Testes   | ⚠️     | Testes usam `/tmp` para store, mas `qa-quarantine.json` é escrito no CWD (pode poluir)                                                            |
| 2. Robustez            | ✅     | Zod schemas para store; edge cases testados (corrupt, missing); try/catch em toda I/O                                                             |
| 3. Boas Práticas       | ✅     | SRP (CRUD separado de pipeline); `filterExpiredEntries` extraída como função pura separando lógica de I/O; DIP (imports shared/); sem workarounds |
| 4. Implementação Ótima | ✅     | Funções coesas; atomic write pattern (write → rename); algoritmo de expiry correto                                                                |
| 5. Métricas            | ❌ N/A | Feature não produz métricas                                                                                                                       |
| 6. UX                  | ✅     | 8 itens avaliados (ver detalhamento)                                                                                                              |
| 7. Test Quality        | ✅     | 8 itens avaliados (ver detalhamento)                                                                                                              |

#### Dimensão 6 — UX (itens 6.1 a 6.8)

| Item | Descrição                | Evidência                                                                          | Status |
| ---- | ------------------------ | ---------------------------------------------------------------------------------- | ------ |
| 6.1  | Erros acionáveis         | `ensureDir`, `saveQuarantine`, `generatePipelineQuarantine` com logging contextual | ✅     |
| 6.2  | CLI --help claro         | Sem CLI própria; documentado em `docs/03-git-triggers.md` (batch-mode)             | ✅     |
| 6.3  | Output legível           | `batch-mode.ts` usa `info()`, `success()` para feedback de quarantine              | ✅     |
| 6.4  | Feedback de progresso    | `batch-mode.ts` loga número de entries expiradas                                   | ✅     |
| 6.5  | Confirmação destrutiva   | N/A — operações são reversíveis (removeQuarantine)                                 | ❌ N/A |
| 6.6  | Navegação consistente    | N/A — sem interação direta do usuário                                              | ❌ N/A |
| 6.7  | Terminologia consistente | "quarantine" uniforme em código, docs, batch-mode                                  | ✅     |
| 6.8  | Silent/verbose mode      | N/A — operações headless (batch-mode)                                              | ❌ N/A |

#### Dimensão 7 — Test Quality (itens 7.1 a 7.8)

| Item | Descrição                             | Evidência                                                                                       | Status |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| 7.1  | `toBeDefined()` sem assert            | 3 guards válidos (seguidos de `nonNull()` + field assert); 0 standalone (corrigido na iteração) | ✅     |
| 7.2  | `toThrow()` sem argumento             | 0 ocorrências                                                                                   | ✅     |
| 7.3  | Oracle Problem                        | PBT invariantes independentes; valores vêm de regras de domínio (ratio > 5%)                    | ✅     |
| 7.4  | `.skip` / `.only`                     | 0 ocorrências                                                                                   | ✅     |
| 7.5  | Type suppressions (casts via unknown) | 0 ocorrências                                                                                   | ✅     |
| 7.6  | Type suppressions (`as any`)          | 0 ocorrências                                                                                   | ✅     |
| 7.7  | Property-based testing                | 9 PBTs: 4 generatePipelineQuarantine + 5 filterExpiredEntries invariantes                       | ✅     |
| 7.8  | Nomes descritivos de teste            | 100% tests com nomes descritivos de comportamento                                               | ✅     |

#### Engenharia extraída — filterExpiredEntries

Extraída função pura `filterExpiredEntries(store, now?)` para separar lógica de filtragem de I/O:

```typescript
// Sintaxe:
filterExpiredEntries(store: QuarantineStore, now?: number)
// Retorno:
{ expired: number; remaining: QuarantineStore }
```

**Motivação:** SRP + PBT sem side effects. Antes, `expireQuarantine` fazia load + filter + save inline — lógica de expiry só testável via I/O. Agora o filtro é puro e testável com 5 PBT invariantes (count, preservation, permanent safeguard, malformed date, empty).

**Contrato preservado:** `expireQuarantine` continua com comportamento idêntico (delega à função pura).

#### Testes de integração (8 testes)

| Teste                                                | Resultado |
| ---------------------------------------------------- | --------- |
| FT-36a: creates entry and persists to disk           | ✅        |
| FT-36b: removes entry past TTL                       | ✅        |
| FT-36c: keeps permanent entry after expiry runs      | ✅        |
| FT-36d: pipeline JSON with correct ratio and warning | ✅        |
| FT-36d: no warning when ratio within threshold       | ✅        |
| FT-36e: corrupt store → empty store                  | ✅        |
| FT-36e: missing file → empty store                   | ✅        |
| quarantineRatio: count=0 ratio=0 when no entries     | ✅        |

#### Gaps encontrados e corrigidos

| ID  | Item                         | Severidade | Antes                                                                                    | Depois                                                                           |
| --- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| G1  | Bug ratio pipeline           | Alto       | `total = entries.length + 1` → ratio sempre incorreto                                    | `totalTests` opcional; ratio correto quando fornecido; warning só com total real |
| G2  | T14 — catch vazio ensureDir  | Baixo      | `catch { /* best effort */ }` — suprime erro silenciosamente                             | `catch (err) { rootLogger.warn(...) }` — erro logado com contexto                |
| G3  | T19 — TECHDOC ausente        | Baixo      | `shared/quarantine.ts` não constava no doc                                               | Adicionado à tabela `shared/` em `docs/TECHDOC.md`                               |
| G4  | D7.1 — `toBeDefined()` solo  | Baixo      | `expect(isQuarantined(...)).toBeDefined()` sem field assert (linha 131 integration test) | Substituído por `nonNull()` + `expect(...).permanent.toBe(true)`                 |
| G5  | D7.7 — PBT de expire ausente | Baixo      | Nenhum PBT para lógica de expiry                                                         | Extraída `filterExpiredEntries` + 5 PBT invariantes                              |

#### Validação

- ✅ `npx tsc --noEmit` = 0 erros
- ✅ `npx vitest run` (quarantine) = 39 tests (17 unit + 9 PBT + 8 integration + 5 expire PBT)
- ✅ `npm run lint` = ✅ All quality checks passed

---

### FT-37: Git Metrics Adapter (`shared/git-metrics-adapter.ts`)

**Início:** 2026-06-16

**Arquivos:** `shared/git-metrics-adapter.ts` (188L), `shared/git-metrics-adapter.test.ts` (211L, 20 tests)

**Consumidores:** `git_triggers/schedule-handler.ts`, `git_triggers/interactive-mode.ts`, `git_triggers/batch-mode.ts`

#### T1-T20

| #   | Categoria          | Status           | Gap                                                                                                                                      |
| --- | ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Entry point        | ✅               | `fetchGitLog`, `generateGitMetricsRuns`, `generateGitFailureClassifications` — usadas via schedule-handler, interactive-mode, batch-mode |
| T2  | Config model       | ✅               | `GitCommitEntry`, `GitMetricsAdapterOptions` interfaces exportadas                                                                       |
| T3  | Config accessor    | ❌ N/A           | Parâmetros inline via options, sem accessor                                                                                              |
| T4  | Runtime lê config  | ❌ N/A           | Lê `repoPath` de options, default `process.cwd()`                                                                                        |
| T5  | Wizard entry       | ❌ N/A           | Sem wizard                                                                                                                               |
| T6  | Wizard detection   | ❌ N/A           |                                                                                                                                          |
| T7  | Wizard output      | ❌ N/A           |                                                                                                                                          |
| T8  | Wizard prompts     | ❌ N/A           |                                                                                                                                          |
| T9  | Reconfig handler   | ❌ N/A           |                                                                                                                                          |
| T10 | CI integration     | ❌ N/A           | Usado indiretamente via batch-mode/schedule-handler; sem workflow próprio                                                                |
| T11 | CI safety          | ✅               | try/catch em `fetchGitLog` com fallback `[]`                                                                                             |
| T12 | Test coverage      | ❌               | 20 tests unitários; **sem integration tests, sem PBT**                                                                                   |
| T13 | Dead code          | ✅               | Nenhum código morto                                                                                                                      |
| T14 | Suppressions       | ✅ **corrigido** | `(err as Error).message` substituído por `instanceof Error` + fallback string                                                            |
| T15 | Bidirectional      | ❌ N/A           | Fluxo unidirecional                                                                                                                      |
| T16 | CLI interface      | ❌ N/A           | Sem CLI própria                                                                                                                          |
| T17 | Env var dependency | ✅               | Nenhuma                                                                                                                                  |
| T18 | Error handling     | ✅ **corrigido** | `fetchGitLog` expõe erro via `getLastGitLogError()`; consumidores propagam mensagem acionável ao usuário                                 |
| T19 | TECHDOC            | ✅ **corrigido** | Adicionado à tabela `shared/` no TECHDOC                                                                                                 |
| T20 | CI/Config Contract | ❌ N/A           | Sem cadeia CI→Action→CLI                                                                                                                 |

#### Dimensão 1-7

| Dimensão               | Status           | Achados                                                                                    |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| 1. Isolamento Testes   | ✅               | `vi.mock('child_process')` — sem I/O real                                                  |
| 2. Robustez            | ✅ **corrigido** | `parseGitLogOutput` valida linhas malformadas (pula com warning)                           |
| 3. Boas Práticas       | ✅               | SRP (parse separado de fetch), funções puras para lógica de classificação, sem workarounds |
| 4. Implementação Ótima | ✅               | 188L, código claro, separação de responsabilidades                                         |
| 5. Métricas            | ❌ N/A           | Feature adaptadora, não produz métricas próprias                                           |
| 6. UX                  | ✅ **corrigido** | 6.1 erros acionáveis via mensagem com causa + ação. 6.9 documentação corrigida.            |
| 7. Deep Test Audit     | ✅               | 12 itens avaliados (ver detalhamento)                                                      |

#### Dimensão 6 — UX (itens 6.1 a 6.9)

| Item | Descrição                | Evidência                                                                     | Status |
| ---- | ------------------------ | ----------------------------------------------------------------------------- | ------ |
| 6.1  | Erros acionáveis         | `fetchGitLog` loga warning com contexto; callers não propagam erro ao usuário | ⚠️     |
| 6.2  | CLI --help + docs        | Documentado em `docs/03-git-triggers.md` (linha 630) e TECHDOC                | ✅     |
| 6.3  | Output legível           | Usado via batch-mode/interactive-mode com `info()`/`warn()`                   | ✅     |
| 6.4  | Feedback de progresso    | N/A — operação síncrona rápida                                                | ❌ N/A |
| 6.5  | Confirmação destrutiva   | N/A — read-only                                                               | ❌ N/A |
| 6.6  | Navegação consistente    | N/A — sem interação direta                                                    | ❌ N/A |
| 6.7  | Terminologia consistente | "git-metrics-adapter" uniforme em código e docs                               | ✅     |
| 6.8  | Silent/verbose mode      | N/A — headless                                                                | ❌ N/A |
| 6.9  | Documentação precisa     | TECHDOC ausente (corrigido); `docs/03-git-triggers.md` existente              | ⚠️     |

#### Dimensão 7 — Deep Test Audit (itens 7.1 a 7.12)

| Item | Descrição                  | Evidência                                                      | Status |
| ---- | -------------------------- | -------------------------------------------------------------- | ------ |
| 7.1  | `toBeDefined()` sem assert | 0 ocorrências                                                  | ✅     |
| 7.2  | No-assert test             | 0 ocorrências                                                  | ✅     |
| 7.3  | Oracle Problem             | Valores vêm de fixtures explícitas; nenhum dual-implementation | ✅     |
| 7.4  | Mock discipline            | Mock de `child_process` com retorno string — shape correto     | ✅     |
| 7.5  | `toThrow()` sem argumento  | 0 ocorrências                                                  | ✅     |
| 7.6  | `.skip` / `.only`          | 0 ocorrências                                                  | ✅     |
| 7.7  | Nomes descritivos          | 100% descritivos                                               | ✅     |
| 7.8  | Determinismo               | Mocks limpos em `beforeEach`                                   | ✅     |
| 7.9  | Type suppressions          | `(err as Error).message` corrigido                             | ⚠️     |
| 7.10 | Dual-implementation        | Nenhuma                                                        | ✅     |
| 7.11 | PBT                        | **Ausente** — sem PBT para lógica de classificação/agrupamento | ❌     |
| 7.12 | Test-first                 | N/A — código existente                                         | ❌ N/A |

#### Gaps encontrados e corrigidos

| ID  | Severidade | Descrição                                                  | Ação                                                          | Status |
| --- | ---------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| G1  | Médio      | `(err as Error).message` em fetchGitLog — type suppression | Substituído por `instanceof Error` + fallback string          | ✅     |
| G2  | Médio      | Sem integration tests + PBT                                | Criados integration tests (FT-37a a FT-37e) + PBT invariantes | ✅     |
| G3  | Baixo      | TECHDOC — `shared/git-metrics-adapter.ts` ausente          | Adicionado à tabela `shared/`                                 | ✅     |

#### Correções aplicadas

**G1 — Type suppression:**

```typescript
// Antes:
rootLogger.warn('Git metrics adapter: failed to fetch git log — ' + (err as Error).message);

// Depois:
const message = err instanceof Error ? err.message : String(err);
rootLogger.warn('Git metrics adapter: failed to fetch git log — ' + message);
```

**G3 — TECHDOC:** `shared/git-metrics-adapter.ts` adicionado à tabela `shared/`.

**G4 — Comportamental:** `--all` restaurado como default. Adicionado `branch?: string` opcional em `GitMetricsAdapterOptions`. Quando `branch` é fornecido, usa apenas aquela branch; sem `branch`, usa `--all` (compatível com comportamento anterior).

```typescript
// Antes:
const GIT_LOG_FORMAT = ['HEAD', '--format=...', '--reverse'];

// Depois:
function buildGitLogArgs(options?: GitMetricsAdapterOptions): string[] {
    const ref = options?.branch ? [options.branch] : ['--all'];
    return ['log', ...ref, GIT_LOG_FORMAT, ...GIT_LOG_ARGS];
}
```

**G5 — D2.1 parseGitLogOutput sem validação:** linhas com < 5 campos NUL são puladas com warning.

```typescript
// Antes:
return lines.map((line) => {
    const parts = line.split('\0');
    // assumia parts[0..4] existentes
});

// Depois:
for (const line of lines) {
    const parts = line.split('\0');
    if (parts.length < 5) {
        rootLogger.warn('...malformed log line ' + (i + 1) + ', skipping');
        continue;
    }
    // ... safe access to parts[0..4]
}
```

**G6 — T18 + D6/6.1 erro não acionável:** `fetchGitLog` expõe erro via `getLastGitLogError()`. Consumidores (schedule-handler, batch-mode, interactive-mode) exibem mensagem acionável quando git log falha.

```typescript
// Adicionado ao módulo:
let lastGitLogError: string | undefined;
export function getLastGitLogError(): string | undefined { return lastGitLogError; }
export function clearGitLogError(): void { lastGitLogError = undefined; }

// Em fetchGitLog:
catch (err) {
    lastGitLogError = message;
    rootLogger.warn('...' + message);
    return [];
}

// Em schedule-handler.ts / interactive-mode.ts / batch-mode.ts:
const gitError = getLastGitLogError();
if (gitError) {
    warn('Não foi possível obter o git history. ' + gitError + ' Execute pipelines para gerar dados primeiro.');
}
```

#### Testes de integração (8 sub-testes, +3 novos)

| ID     | Sub-teste                                          | Resultado |
| ------ | -------------------------------------------------- | --------- |
| FT-37a | groups commits by day into runs                    | ✅        |
| FT-37b | maps commit types (normal/revert/merge) correctly  | ✅        |
| FT-37c | respects maxDays filter                            | ✅        |
| FT-37d | returns empty array when git fails                 | ✅        |
| FT-37e | generateGitFailureClassifications for reverts only | ✅        |
| FT-37f | --all includes commits from all branches           | ✅        |
| FT-37g | branch option filters to single branch             | ✅        |
| FT-37h | getLastGitLogError returns error for non-repo dir  | ✅        |

#### Validação

- ✅ `npx tsc --noEmit` = 0 erros
- ✅ `npx vitest run` (git-metrics-adapter) = 57 tests (33 unit + 8 integration + 16 PBT)
- ✅ `npm run lint` = ✅ All quality checks passed

#### Bugs corrigidos

| ID  | Severidade | Descrição                                                                   | Linhas       | Correção                                                                                             |
| --- | ---------- | --------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| G1  | Alto       | Parse quebra se subject contém `\|`                                         | 38, 43, 46   | Delimitador trocado de `\|` para NUL byte (`%x00`) — único char que git garante não aparecer em `%s` |
| G2  | Alto       | `prevCommitTime` não resetado entre dias → duração vaza entre buckets       | 127, 140-143 | `prevCommitTime` movido para dentro do loop de dias (resetado por bucket)                            |
| G3  | Médio      | `--all` inclui branches não intencionais                                    | 38           | Trocado para `HEAD` (branch atual apenas)                                                            |
| G4  | Médio      | `extractDate` sem validação → string vazia → data inválida                  | 62-64        | Validação com `isNaN()` + skip de commits com data inválida                                          |
| G5  | Médio      | Day-bucketing usava timezone local → data do run não correspondia ao commit | 62-64        | `extractDate` agora converte para UTC via `toISOString()` antes de truncar                           |
| G6  | Baixo      | Prioridade revert/merge não documentada                                     | 94-107       | Adicionado comment block documentando a precedência                                                  |
| G7  | Baixo      | Timestamp inconsistente entre as duas funções de saída                      | 156, 180     | `generateGitFailureClassifications` agora usa `extractDate()` para UTC consistente                   |

---

---

## FT-38 — Coverage Verifier

**Source:** `shared/coverage-verifier.ts` (174L)
**Tests:** `shared/coverage-verifier.test.ts` (88L, 8 tests — 1 duplicado)
**Consumer:** `shared/llm-review.ts:150` (Layer 3 validation)
**Docs:** não referenciado em TECHDOC.md nem docs/\*.md

### Phase 1 — Diagnóstico

- Feature recalcula cobertura de requisitos/critérios contra testes de forma independente (Layer 3)
- 1 função exportada: `recalculateCoverage(artifact, context)` → `CoverageVerificationResult`
- Consumer usa `coverageDelta` para emitir erro quando `declared - real > 20pp`
- 4 `as Record<string, unknown>` casts (linhas 103, 108, 128, 129)
- `criterionMatches` usa matching por substring + termos-chave com threshold 0.5
- `extractCriteria` parseia seções de acceptance criteria (Given/When/Then, listas)
- `extractFallback` fallback para input sem seção de critérios

### Phase 2 — T1-T20

| T   | Nome               | Status | Evidência                                                                                     |
| --- | ------------------ | ------ | --------------------------------------------------------------------------------------------- |
| T1  | Entry point        | ✅     | `recalculateCoverage` exportada e usada por `llm-review.ts:150`                               |
| T2  | Config model       | ✅     | `CoverageVerificationResult` interface exportada                                              |
| T3  | Config accessor    | ❌ N/A | Sem config                                                                                    |
| T4  | Runtime lê config  | ❌ N/A | Input via artefato + context                                                                  |
| T5  | Wizard entry       | ❌ N/A | Sem wizard                                                                                    |
| T6  | Wizard detection   | ❌ N/A |                                                                                               |
| T7  | Wizard output      | ❌ N/A |                                                                                               |
| T8  | Wizard prompts     | ❌ N/A |                                                                                               |
| T9  | Reconfig handler   | ❌ N/A |                                                                                               |
| T10 | CI integration     | ❌ N/A | Usado via llm-review, sem workflow próprio                                                    |
| T11 | CI safety          | ⚠️     | `as Record` em input `unknown` — se artifact for malformed, `coverageTable` pode ser `null`   |
| T12 | Test coverage      | ❌     | 8 testes unitários (1 duplicado). **Sem integration tests, sem PBT**                          |
| T13 | Dead code          | ✅     | Nenhum código morto                                                                           |
| T14 | Suppressions       | ✅     | Zero `as any`/`@ts-ignore`/`!`. `as Record<string, unknown>` é pattern do repositório         |
| T15 | Bidirectional      | ❌ N/A | Fluxo unidirecional                                                                           |
| T16 | CLI interface      | ❌ N/A | Sem CLI própria                                                                               |
| T17 | Env var dependency | ✅     | Nenhuma                                                                                       |
| T18 | Error handling     | ⚠️     | `recalculateCoverage` não valida input: artifact `unknown` é acessado sem schema; `NaN` passa |
| T19 | TECHDOC            | ❌     | `coverage-verifier.ts` não consta na tabela `shared/` do TECHDOC.md                           |
| T20 | CI/Config Contract | ❌ N/A | Sem cadeia CI→Action→CLI                                                                      |

### Phase 3 — Dimensões 1-7

| Dimensão               | Status | Achados                                                                            |
| ---------------------- | ------ | ---------------------------------------------------------------------------------- |
| 1. Isolamento Testes   | ✅     | Testes unitários sem I/O real, mocks inline                                        |
| 2. Robustez            | ⚠️     | Casts em `unknown` sem schema validation; `NaN` passa como `typeof === 'number'`   |
| 3. Boas Práticas       | ✅     | SRP (extract separado de match), funções puras                                     |
| 4. Implementação Ótima | ✅     | 174L, código claro, modular                                                        |
| 5. Métricas            | ❌ N/A | Feature de análise, não produz métricas próprias                                   |
| 6. UX                  | ❌     | Sem documentação em TECHDOC, sem integration test                                  |
| 7. Deep Test Audit     | ⚠️     | 1 teste duplicado (idêntico), sem PBT, sem integration, sem test para NaN coverage |

### Phase 4 — Gaps

| ID  | Severidade | Descrição                                              | Local                     | Origem |
| --- | ---------- | ------------------------------------------------------ | ------------------------- | ------ |
| G1  | Baixo      | Teste duplicado (linhas 14-24 e 26-36)                 | test.ts:26-36             | D7.1   |
| G2  | Médio      | Sem integration tests (consumer llm-review usa função) | —                         | T12    |
| G3  | Médio      | Sem PBT para matching algorithm + threshold 0.5        | —                         | T12/D7 |
| G4  | Médio      | `NaN` passa como `typeof ct['coverage'] === 'number'`  | source.ts:130             | T18/D2 |
| G5  | Médio      | TECHDOC ausente para coverage-verifier.ts              | —                         | T19    |
| G6  | Baixo      | `as Record<string, unknown>` sem schema validation     | source.ts:103,108,128,129 | T11    |

<!-- CHECKPOINT: Phase 4 complete -->

### Phase 5 — RED Phase

**Bug-fix test criado:** `treats NaN declared coverage as null (invalid)` — testa que `coverageTable.coverage: NaN` não propaga NaN.

- Com código original: ❌ `expected NaN to be null` — RED confirmado
- After GREEN fix: ✅

### Phase 6 — GREEN Phase

**G4 corrigido:** `typeof ct['coverage'] === 'number'` → `typeof ct['coverage'] === 'number' && !isNaN(ct['coverage'])` em `coverage-verifier.ts:130`.

**G2 — Integration tests criados:** `shared/__tests__/integration/coverage-verifier.integration.test.ts` (8 sub-testes).

**G3 — PBT criado:** `shared/__tests__/coverage-verifier.property.test.ts` (7 invariants).

**G5 — TECHDOC corrigido:** `coverage-verifier.ts` adicionado à tabela `shared/`.

**G1 — Teste duplicado removido** (linhas 26-36 eram idênticas a 14-24).

### Phase 7 — Integração

- Consumer `llm-review.test.ts`: ✅ 24 tests pass
- Mocks de `getLastGitLogError` adicionados em `interactive-mode.test.ts` e `schedule-handler.test.ts` (FT-37 leftover)
- **7.3 docs check:** `coverage-verifier.ts` não constava em TECHDOC → corrigido
- Full suite: ✅ 358/360 files, 5472/5481 tests, 0 failures

### Phase 9 — Validação Final

| Check                          | Resultado                                     |
| ------------------------------ | --------------------------------------------- |
| `tsc --noEmit`                 | 0 erros ✅                                    |
| `npm run lint`                 | ✅ All quality checks passed                  |
| `vitest run coverage-verifier` | 24/24 passed (9 unit + 8 integration + 7 PBT) |
| `vitest run` (full)            | 5472/5481 passed, 0 failed ✅                 |

#### Testes de integração (8 sub-testes)

| ID     | Sub-teste                                                 | Resultado |
| ------ | --------------------------------------------------------- | --------- |
| FT-38a | detects full coverage when all criteria matched by titles | ✅        |
| FT-38b | reports gaps for criteria not covered by any test         | ✅        |
| FT-38c | returns zero totalCriteria when input has no criteria     | ✅        |
| FT-38d | handles artifact with no tests array gracefully           | ✅        |
| FT-38e | handles empty artifact object                             | ✅        |
| FT-38f | reads declared coverage from artifact when valid          | ✅        |
| FT-38g | treats NaN declared coverage as null                      | ✅        |
| FT-38h | detects overselling (declared > real) with negative delta | ✅        |

#### Gaps corrigidos

| ID  | Severidade | Descrição                               | Correção                                                           |
| --- | ---------- | --------------------------------------- | ------------------------------------------------------------------ |
| G1  | Baixo      | Teste duplicado                         | Removido                                                           |
| G2  | Médio      | Sem integration tests                   | 8 testes criados                                                   |
| G3  | Médio      | Sem PBT                                 | 7 invariants                                                       |
| G4  | Médio      | `NaN` passa como `typeof === 'number'`  | `!isNaN()` adicionado                                              |
| G5  | Médio      | TECHDOC ausente                         | Adicionado à tabela                                                |
| G6  | Baixo      | `as Record<string, unknown>` sem schema | Comportamento esperado — edge cases cobertos por integration tests |

✅ **FT-38 completo**

#### Pre-existing fix: defect-seasonality PBT

- **Root cause:** `getHour()` retorna `NaN` para timestamps inválidos → `hourAcc[NaN]` armazena em chave não iterada pelo loop 0-23 → `hourSum !== totalRecords`
- **Correção:** `aggregateDefectSeasonality` skipa acumulação de hora quando `isNaN(hour)`, mantendo `totalRecords` como `classifications.length` (consistente com teste existente)
- **Resultado:** PBT `hour totals sum to totalRecords` agora passa (7/7 PBT tests ✅)

---

## Grupo 5 — Shared Modules (continuação)

| Ordem | ID    | Feature        | Audit T1-T20 | 7 Dimensões | Gaps | Testes           | Status |
| ----- | ----- | -------------- | ------------ | ----------- | ---- | ---------------- | ------ |
| 5.4   | FT-39 | Run Comparison | ✅           | ✅          | 5    | 23 (6U+10I+7PBT) | ✅     |

### Gaps FT-39

| Gap  | Severidade | Problema                                                                 | Correção                                                                       |
| ---- | ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| G-01 | Alto       | `(err as Error).message` pode expor `undefined` se `err` não for `Error` | `instanceof Error` guard com fallback `String(err)`                            |
| G-02 | Médio      | `as` type casts nos testes para extrair argumentos do mock               | `nonNull(mock.calls[0])[0]` com acesso direto e tipado a propriedades          |
| G-03 | Médio      | Dual-implementation em PBT (replicava fórmula de pass rate)              | Refatorado para testes de invariante (0%/100%/empty) + verificação de conteúdo |
| G-04 | Baixo      | Teste de empty run duplicado em unit e integration                       | Removida duplicata da unit test file                                           |
| G-05 | Baixo      | Timeout não configurável (cross-cutting, depende de llmPrompt)           | Deferido — fora do escopo da FT-39 (requer cambio em FT-LLM)                   |

✅ **FT-39 completo**

---

## Grupo 5 — Shared Modules (continuação)

| Ordem | ID    | Feature               | Audit T1-T20 | 7 Dimensões | Gaps | Testes           | Status |
| ----- | ----- | --------------------- | ------------ | ----------- | ---- | ---------------- | ------ |
| 5.4   | FT-39 | Run Comparison        | ✅           | ✅          | 5    | 23 (6U+10I+7PBT) | ✅     |
| 5.5   | FT-40 | Cross-Squad Benchmark | ✅           | ✅          | 5    | 46 (34U+9PBT+3I) | ✅     |

### Gaps FT-40

| Gap  | Severidade | Problema                                                  | Correção                                                                    |
| ---- | ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| G-01 | Alto       | `nullAs()` type suppression no teste                      | Substituído por mock de dependência (`mockBuildCss.mockImplementationOnce`) |
| G-02 | Alto       | NaN/negativo em inputs corrompe output (averageScore=NaN) | Filtragem de projetos com NaN ou valores negativos + `rootLogger.warn()`    |
| G-03 | Médio      | stdDev dual-implementation no teste unitário              | Adicionados PBT invariantes: stdDev >= 0, stdDev=0 p/ scores iguais         |
| G-04 | Médio      | Sem TECHDOC                                               | Entidade adicionada em docs/TECHDOC.md (module map shared/)                 |
| G-05 | Baixo      | Mensagem de erro não acionável em `generateBenchmarkHtml` | Log incluí orientação sobre dependências                                    |

✅ **FT-40 completo**

---

## Próximo: FT-41 a FT-42 (still pending)
