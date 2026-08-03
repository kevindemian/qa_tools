# ARTIFACT-VALIDATION.md

**Purpose:** Validar todos os artefatos do sistema em 3 dimensões — funcional (D1), conteúdo (D2), forma (D3).
**Created:** 2026-07-31
**Status:** Auditoria completa — 24 artefatos × 3 dimensões · Em execução: Fase A (primitives — inline styles/emojis)

---

## 1. Método

| Dimensão | Critério | Evidência |
|----------|----------|-----------|
| D1 Funcional | Artefato executa com dados reais e produz saída válida | `npx vitest run` (534 files / 7375 tests) + `scripts/artifact-validation-harness.ts` (HTML real em `reports/validation/`) |
| D2 Conteúdo | Métricas, seções, ações e campos obrigatórios conforme CONTENT-SPECIFICATION + 9 critérios TECHDOC (Util, Correto, Adequado, Completeness, Legibilidade, Sem poluição, Arquitetura, Dados ausentes visíveis, Ação recomendada) | `shared/__tests__/artifact-content-validation.test.ts` (140 testes R8.1–R8.7) + verificação manual do HTML gerado |
| D3 Forma | Reuso de primitivas/CSS, `data-*` hooks, zero inline styles, zero emojis, SSOT (DataHub `computed`) | `rg` code analysis + `dev/docs/internal/visual-validation-checklist.md` |

Legenda: ✅ conforme · ❌ violação · ⚠️ parcial/risco

---

## 2. Matriz 24 × 3

### Dashboards (16)

| # | Artefato | D1 Funcional | D2 Conteúdo | D3 Forma | Evidência |
|---|----------|:---:|:---:|:---:|-----------|
| 1 | ai-effectiveness | ✅ | ✅ | ✅ | Renderiza HTML válido (35-42KB). Timestamp ✅, thresholds ✅ (target×4). SSOT: consome `hub.computed.aiMetrics` (interactive-mode:414). Renderer puro (sem lógica). |
| 2 | ai-comparison | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×4), sample-warning ✅ (fixture pequeno ativa). |
| 3 | incident-report | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×4). Consome 3 fontes externas (documentado no spec). |
| 4 | impact-alert | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |
| 5 | traceability | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |
| 6 | flakiness | ✅ | ✅ | ✅ | **B19 FIXED (2026-08-01)** — antigo BUG totalTests=0: `flakiness-renderer.ts:39` (`options?.dataHub?.computed.testCounts.total ?? 0`) + callers `schedule-handler.ts:409`/`batch-mode.ts:259` sem options → Flaky Rate sempre 0%. Agora: no-data explícito (N/A + banner, Rule 25), callers passam `{ dataHub }` (schedule-handler.ts:399, batch-mode.ts:242). Thresholds ✅ (target×3). |
| 7 | backlog-health | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×4). |
| 8 | pipeline-cost | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×3). |
| 9 | suite-optimization | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1), coluna Savings ✅. |
| 10 | cross-squad-benchmark | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1). |
| 11 | release-score | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1). F1-T3 (B3) ✅: 1 implementação (5 dims via `hub.computed.releaseScore`); `shared/quality/release-score.ts` removido. |
| 12 | silent-regression | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |
| 13 | defect-trend | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2), Avg Defects ✅, Direction ✅. |
| 14 | defect-seasonality | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×3), Avg/day ✅. |
| 15 | developer-profile | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1), ranking badges `#1` ✅. |
| 16 | requirement-score | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |

### Relatórios / Orquestradores (8)

| # | Artefato | D1 Funcional | D2 Conteúdo | D3 Forma | Evidência |
|---|----------|:---:|:---:|:---:|-----------|
| 17 | coverage-gap | ✅ | ✅ | ✅ | Renderiza HTML válido. Timestamp ✅. Compute real em `shared/data-hub/compute/coverage-gap.ts`. |
| 18 | report-html | ✅ | ✅ | ✅ | `generateHtmlReport` exige `options.computed` (report-html.ts:41,50). **F0-T8 (2026-08-01):** os 4 consumidores passam `computed: hub.computed` — `case17.ts:236,402`, `gen-report-complete.ts:174`, `artifact-validation-harness.ts:564`, `failure-analysis.ts:213`. Erro-page eliminado (`test-report.html` real, sem "DataHub precomputed data required"). Mocks de `generateHtmlReport` removidos de `case17.test.ts` (SSOT test: `computed: expect.objectContaining({ passRate })`). |
| 19 | pipeline-health | ✅ | ✅ | ⚠️ | Consumido por `batch-mode.ts:445`. Renderiza 34.1KB. **⚠️ Único renderer com inline styles (6×)** + CSS custom `_PIPELINE_CSS` (pipeline-health-renderer.ts:50,161). |
| 20 | schedule-handler | ❌ | ✅ | ⚠️ | **SSOT violation sistêmica**: computa localmente via barrels `calculateReleaseScore`, `aggregateDefectTrends`, `buildTraceabilityMatrix`, `analyzeBacklogHealth`, `aggregateDefectSeasonality`, `detectSilentRegression`, `buildDeveloperProfile`, `compareAiVsManual`, `analyzeSuiteOptimization`, `computeCrossSquadBenchmark`, `calculatePipelineCost` (schedule-handler.ts:181-275) — em vez de consumir `dataHub.computed.*`. DataHub computa `defectAggregation`, `seasonalityAggregation`, `regressionDetection`, `optimizationActions`, `impactAlerts`, `incidentEvents`, `traceabilityTree`, `crossSquad`, `coverageGap`, `suiteBreakdown` (hub.ts:836-869) com **0 consumidores**. Lógica duplicada em 2 fontes de verdade. |
| 21 | interactive-mode | ✅ | ✅ | ⚠️ | Consome SSOT para `aiMetrics`/`passRate`/`flakyRate`/`coverage` ✅. **⚠️ Sub-dashboard Quality Gate (interactive-mode.ts:579) é HTML cru inline** (sem buildHtmlPage/primitives/CSS). |
| 22 | pr-report-markdown | ✅ | ✅ | ✅ | Comentário PR com 5 métricas (Pass Rate/Passed/Failed/Skipped/Duration), timestamp, seções (CI Context, Summary Table, Coverage, Failures, Diff, Quality Gate, Flaky, Data Quality, Footer). SSOT: `dataHub` obrigatório (pr-report-core.ts:645). |
| 23 | pr-report-job-summary | ✅ | ✅ | ❌ | Escrito em `$GITHUB_STEP_SUMMARY`. **⚠️ Emojis** (`:white_check_mark:`, `:x:`, `:fast_forward:`, `:clock1:`, `:warning:`, `:large_blue_diamond:`) — viola "zero emojis" do visual-checklist. |
| 24 | pr-report-html | ✅ | ✅ | ✅ | `generateHtmlReportFile` passa `computed: dataHub.computed` (pr-report-core.ts:568) — wiring SSOT correto. |

---

## 3. Achados Prioritários

### P1 — flakiness totalTests=0 (D2) — **FIXED B19 (2026-08-01)**
- **Causa raiz:** `shared/report/flakiness-renderer.ts:39` usava `options?.dataHub?.computed.testCounts.total ?? 0`; nenhum caller passava `options`.
- **Evidência:** output real em `reports/validation/flakiness-no-datahub.html` → Flaky Rate `0%`.
- **Consumidores afetados:** `schedule-handler.ts:399`, `batch-mode.ts:242`.
- **Correção de origem (aplicada):** renderer exige `testCounts` (sem `?? 0`); callers passam `dataHub` (`schedule-handler.ts:399`, `batch-mode.ts:242`, `e2e/smoke-pipeline.ts`); ausência/não-finito/negativo → card `N/A` + banner `Insufficient Data` explícito.

### P2 — report-html produce error page em 2 consumidores (D1) — **FIXED F0-T8 (2026-08-01)**
- **Causa raiz:** `case17.ts:369` e `gen-report-complete.ts:165` chamavam `generateHtmlReport` sem `computed`.
- **Evidência:** harness `test-report.html` = ERROR-PAGE ("DataHub precomputed data required").
- **Cobertura theater:** `case17.test.ts` mockava `generateHtmlReport` (13×) → teste verde não detectava o defeito.
- **Correção de origem (aplicada):** cada consumidor agora deriva/obtém um DataHub reconciliado (`saveParseResult` F0-T8 + `createDataHubFromParseResult`) e passa `computed: hub.computed`; mocks removidos; SSOT test cobre o wiring real (`case17.ts:236,402`, `gen-report-complete.ts:174`, `artifact-validation-harness.ts:564`, `failure-analysis.ts:213`).

### P3 — SSOT violation sistêmica em schedule-handler (D3)
- **Causa raiz:** schedule-handler recomputa ~11 métricas localmente; DataHub as computa (hub.ts:836-869) com zero consumidores.
- **Duplicação confirmada:** release score tem 2 implementações divergentes (4 vs 5 dimensões).
- **Correção de origem:** schedule-handler deve consumir `dataHub.computed.*`; remover implementação duplicada.

### P4 — Forma (D3)
- `pipeline-health-renderer.ts`: 6 inline styles + `_PIPELINE_CSS` custom (único renderer).
- `interactive-mode.ts:579` quality-gate: HTML cru inline.
- `pr-report-job-summary`: emojis.
- Todos os outros renderers: ✅ zero inline styles, ✅ zero emojis, ✅ reuso `buildCss`/primitives, ✅ `data-*` hooks (81 total, audit em HTML-CSS-HOOKS-AUDIT.md).

### P5 — Defeitos SISTÊMICOS de forma (primitives compartilhados)
Auditoria transversal de 2026-07-31 nos 21 artefatos (pr-report.html real + 21 outputs gerados) revelou que os defeitos de forma do pr-report NÃO são exclusivos — têm origem em **primitives compartilhados**:

| Classe | Causa raiz | Artefatos afetados |
|--------|-----------|--------------------|
| Inline styles | **6 primitives** emitem `style=` inline: `shared/primitives/badge.ts`, `layout.ts`, `card.ts`, `chart.ts`, `table.ts`, `form.ts` | Todos. 21/21 com inline styles (7–34 nos dashboards; 6.872 no pr-report; 6.816 só do badge) |
| Badge com var inexistente | `badge.ts:18-20` referencia `--color-badge-pass-fg` (NUNCA definido; só `-text` existe em report-styles.ts:47-52) → cor do texto cai para herança. Teste `badge.test.ts:23` codifica o bug. CSS `[data-component="badge"][data-variant="pass"]` (report-styles.ts:278) já estiliza — inline é duplicação com divergência | 12/21 dashboards |
| Emoji no source | `report-sections.ts:177-181` 🟢🟡🔴 (LLM confidence via `\ud83d\udfe2` etc.), `:208` 🌓 (theme toggle); `generate-coverage-gap-html.ts:111,174` ▶▼ | Todos que usam report-sections (report-html + todos com FilterBar/toggle) + coverage-gap |
| Violação visual-checklist item 10 | checklist exige "Zero inline styles" — nenhuma auditoria automatizada pegava primitives | Todos |

**Nota:** a revisão anterior (linha 81) afirmava "todos os outros renderers: ✅ zero inline styles" — INCORRETA. Inline styles vêm dos primitives, não dos renderers.

---

## 4. Estado da Documentação

- **CONTENT-SPECIFICATION.md gap table (linhas 557-576, 2026-07-11) está DESATUALIZADA:** afirmava timestamp só em traceability e thresholds em nenhum — todos os 16 dashboards agora têm timestamp ✅ + thresholds ✅ (verificado no HTML gerado).
- **Caminhos fantasma em documentos:** `shared/coverage/coverage-gap-renderer.ts` (TECHDOC:204), `shared/coverage-source.ts` (INTEGRATED-PLAN FT-11), `shared/artifact-validator.ts` (INTEGRATED-PLAN FT-101 — real: `shared/validation/artifact-validator.ts`).
- **Completion-plan "28 artefatos" desatualizado:** SSOT `artifact-specs.ts` define 24.

---

## 5. Resumo

| Dimensão | ✅ | ⚠️ | ❌ |
|----------|:---:|:---:|:---:|
| D1 Funcional | 21 | 0 | 3 (report-html, schedule-handler, flakiness) |
| D2 Conteúdo | 22 | 1 (flakiness totalTests) | 1 (flakiness BUG) |
| D3 Forma | 18 | 3 (release-score, pipeline-health, interactive-mode) | 1 (pr-report-job-summary emojis) |

---

## 6. Plano de Correção — Fase A (CONCLUÍDA — 2026-07-31)

**Objetivo:** eliminar inline styles e emojis na origem (primitives compartilhados), afetando todos os artefatos de uma vez. Foco exclusivo nesta fase — Fases B (pr-report orchestrator), C (SSOT schedule-handler) e D (fechar lacuna de validação) ficam pendentes.

### Tarefas

| # | Tarefa | Arquivo | Verificação |
|---|--------|---------|-------------|
| A1 | Remover inline styles do badge; corrigir `-fg`→`-text`; manter só `data-variant` (CSS já cobre via report-styles.ts:278) | `shared/primitives/badge.ts` | ✅ 0 `style=` emitidos; badge.test corrigido para comportamento correto |
| A2 | Migrar inline styles de layout (box-shadow, grid, flex, align) para CSS `[data-*]` | `shared/primitives/layout.ts` | ✅ 0 `style=` emitidos (exceto `grid-template-columns` dinâmica = largura dinâmica permitida); `data-gap`/`data-align`/`data-wrap` + CSS; gap fora da escala de tokens {4,8,12,16,20,24,32} → throw explícito (Rule 24/25) |
| A3 | Migrar inline styles de card (variant, color) para CSS | `shared/primitives/card.ts` | ✅ 0 `style=` emitidos; severidade via `data-severity` + CSS |
| A4 | Migrar inline styles de chart (bars, legend, mini-trend) para CSS | `shared/primitives/chart.ts` | ✅ só larguras/cores dinâmicas de dados ficam inline (exceção checklist); estáticos em `[data-part]` CSS |
| A5 | Migrar inline styles de table (width, align) para CSS | `shared/primitives/table.ts` | ✅ width dinâmica permitida inline; align via `data-align`; `↕` → `icon('arrow-up-down')` |
| A6 | Migrar inline styles de form para CSS | `shared/primitives/form.ts` | ✅ 0 `style=` emitidos; `data-variant` + `:disabled` CSS |
| A7 | Remover 🟢🟡🔴 (LLM confidence) e 🌓 (theme toggle) → ícones SVG | `shared/report/report-sections.ts` | ✅ 0 codepoints `\ud83c`/`\ud83d`; confidence → `icon('circle')` + `data-tone` CSS; toggle → `icon('moon')` |
| A8 | Remover ▶▼ → ícones SVG | `shared/report/generate-coverage-gap-html.ts` | ✅ 0 `▶`/`▼`; toggle via `chevron-right` + rotação CSS (`.tree-toggle-open`); corrigido wiring do toggle de tema `toggleTheme()`→`_toggleTheme()` (o script injeta `const _toggleTheme`, nome interno `toggleTheme` não é global — clique no botão gerava `ReferenceError`) |
| A9 | Corrigir testes que codificam inline styles + adicionar testes de regressão | `shared/primitives/__tests__/*.test.ts` + `shared/__tests__/icons.test.ts`, `report-generator.test.ts`, `report-sections.test.ts`, `generate-coverage-gap-html.test.ts` | ✅ Suíte completa 100% (534 files / 7397 tests) |

### Regras de segurança aplicáveis (obrigatórias)
- Rule 19.4/19.5: teste que codifica comportamento errado vs requisito (visual-checklist item 10 = zero inline styles) → o TESTE está errado; corrigir o teste para o comportamento correto (não o código).
- Rule 5 (Safety Mechanism Immutability): visual-checklist é mecanismo de segurança — não enfraquecer; o código deve conformar.
- Rule 25 (Zero Silencing): remover fallback `||` de `report-html.ts:119` é Fase B, NÃO desta fase.
- Rule 24 (Safeguard Clauses): todo novo helper deve validar inputs (Number.isFinite, null/undefined).
- Rule 22 (SOP): nenhuma fase de audit/functional exigida nesta entrega (não é execução de SOP).
- Rule 13 (CI Monitoring): após push, monitorar via GitHub API com `GITHUB_TOKEN` do `.env.local`.

### Critérios de aceite da Fase A
1. ✅ Nenhum primitive emite `style=` inline (exceto larguras dinâmicas permitidas pelo checklist item 10). Verificado: únicos `style=` remanescentes em `reports/validation/*.html` são larguras de coluna, geometria de barra/`ProgressBar`/`Sparkline` (dados dinâmicos) e `pipeline-health-renderer.ts` (renderer fora do escopo, gap documentado §1).
2. ✅ Zero emojis/codepoints `\ud83c`/`\ud83d` em renderers/primitives (`rg -P '[\x{1F300}-\x{1FAFF}]'` → 0 em produção).
3. ✅ Badge usa variáveis CSS corretas (`-text`, definidas em report-styles.ts:47-52).
4. ✅ Suíte completa `npx vitest run` passa 100% (534 files / 7397 tests).
5. ✅ Harness `scripts/artifact-validation-harness.ts` regenera outputs com 0 inline styles estáticos (apenas larguras/cores dinâmicas de dados).

---

## 7. PLANO DE CORREÇÃO — FASE B/C/D (SSOT + QUALIDADE DOS ARTEFATOS) — REGISTRADO 2026-07-31

**Princípio arquitetural absoluto (Invariante 0):** DataHub é a ÚNICA fonte de verdade (SSOT). Renderers consomem
exclusivamente `dataHub.computed.*`. Proibido `||`/`??` para fonte não-computed, computação paralela, leitura de
parse em renderers e acesso interno. Dado ausente ≠ 0. Se o DataHub não computa → corrigir o DataHub.
Dados externos em produção (relatório remoto, APIs de repo/Jira); fallback manual (pedido de dados) é responsabilidade
do DataHub; sem dados → artefato informa "insufficient data"; parcial permitido SOMENTE com banner
"PARTIAL — dados insuficientes, confiança baixa, visão de alto nível". Idiom: EN.

### Decisões travadas
- C1 Util = modelo de valor **T0–T3** (T0 veredito sempre visível · T1 evidência · T2 detalhe só na exceção com teto · T3 ruído nunca).
- C2 Correto = 50% SSOT + 50% Dimensão 5 (5a–5f: fórmula/domínio/threshold/norma/proveniência/empírico) com hierarquia Legislação → Acreditação (ISO/INMETRO/ANSI) → Literatura → Indústria.
- Aparência = tokens `theme-tokens.ts` + contraste WCAG AA + acessibilidade + **golden reference** (aprovação única) — "modern professional", não espartano, não carnavalesco.
- **Pesos AQS:** C2 e C8 com peso dobrado. **pr-report: gate próprio** (teto rígido de T2).
- **Ordem de execução: F1 (DataHub) ANTES de F0 (renderers)** — corrigir a origem antes de validar consumidores; evita janela de regressão de valor.
- **TDD obrigatório:** cada bug → teste RED → corrigir → GREEN. Testes de integração/sistema/E2E com negativos/edge. Proibido mockar lógica interna (mocks só em fronteiras externas: HTTP/redes/e-mail).

### Achados adicionais (2026-07-31, validação de consumidores)
| # | Arquivo | Linha | Defeito |
|---|---------|-------|---------|
| N1 | `shared/validation/failure-analysis.ts` | 198 | 4º produtor de **error page**: chama `generateReportWithFallback` sem `computed` |
| N2 | `git_triggers/batch-mode.ts` | 388 | Fallback local `generateGitMetricsRuns` (dual-source no caminho de export); sem runs → `return` silencioso |
| N3 | `shared/report/report-html.ts` | 103, 229 | `generateReportWithFallback` (fallback proibido, 1 consumidor) + `generateCoverageHtml` (dead code, 0 consumidores de produção; duplica coverage-gap) |
| N4 | `shared/pr-report-core.ts` | 617 | Rule 25 (Zero Silencing): `deriveSsoTTestData` usa `duration: run?.duration ?? 0` — consumidor do PR não distingue "0s" de "sem run" (fabricação de 0 sobre dado ausente). Consumidores: `buildSummaryTable:148`, `writeToJobSummary:429,465`. Fix: contrato `PrReportStats.duration: number \| undefined` → renderers exibem `N/A` (F0-T11) |
| N5 | `shared/report/backlog-health-renderer.ts` | 89 | `result.totalIssues \|\| 0` — campo OBRIGATÓRIO no contrato (`BacklogHealthResult.totalIssues: number`); `\|\| 0` mascara violação de contrato e `NaN` (`NaN \|\| 0 = 0`). Fix: remover (contrato tipado = garantia; guarda finitude na origem, Rule 24.3) (F0-T12) |
| N6 | `shared/data-hub/hub.ts` | 882-885, 854-888 | SSOT incompleto p/ F0-T6/T7: hub NÃO computa `backlogHealth`, `developerProfile`, `aiComparison`; `computed.coverageGap` usa `new Map()` vazio (sem mapping de requisitos) → NÃO equivalente ao live Jira fetch do schedule-handler (`analyzeCoverageGaps`). Invariante 0: "se o DataHub não computa → corrigir o DataHub" |
| N7 | `shared/validation/failure-analysis.ts` | 154-198 | **Dual-source (Invariante 0/Rule 26):** `analyzeFailuresWithReport(tests, context?, {dataHub})` recebe `tests` (parse cru) E `options.dataHub` (computed) — se o hub não for derivado do mesmo parse, relatório mistura fontes (tabela do caller + summary do hub). **Error page gravada em caminho de produção:** `git_triggers/llm-pipeline.ts:24` chama `analyzeFailuresWithReport(parsed.tests)` SEM dataHub → `generateHtmlReport` sem computed grava error page em arquivo (`llm-pipeline.ts:55-56`); `offerPipelineFailureAnalysis(parsed, cb)` não propaga hub. Callers têm hub disponível (`pipeline-handler.ts:163` `getDataHub()`, `batch-mode.ts:189` `getOrFetchDataHub`, `smoke-pipeline.ts:114` `getDataHub()`). Fix (F0-T8): contrato `analyzeFailuresWithReport(dataHub, context?)` — `tests` derivado de `dataHub.computed.metricsRuns[0].tests` (fonte única); `offerPipelineFailureAnalysis(parsed, dataHub?, cb?)` propaga hub; zero error page com dado disponível |
| N8 | `shared/report/report-html.ts` + `shared/report/report-generator.ts` | 103, 229 | **Dead code (codebase não usa `deprecated` — DEVE ser deletado):** `generateReportWithFallback` (fallback proibido Rule 3/14, único consumidor `failure-analysis.ts:198`) e `generateCoverageHtml` (0 consumidores de produção; duplica `generateCoverageGapHtml`) + barrel `report-generator.ts`. Fix = F0-T9 |

### Mapa de impacto (arquivos afetados)
| Subsistema | Arquivos | Problema |
|---|---|---|
| Núcleo pr-report | `shared/pr-report-core.ts` (110-150,152-222,425-457,547-594,735-765,1043-1112) | Dual-source raw `tests`/`stats`; gate threshold self-referential (`qualityGate: Math.round(passRate)`); 3 builders de gate duplicados |
| Render HTML | `shared/report/report-html.ts` (40,103,105-110,117-124,229) | Fallbacks proibidos; error page em 4 call-sites |
| Render util | `shared/report/report-utils.ts` (9,18) | Dual-source `statsFromTests` vs `statsFromMetricsRun` |
| Render sections | `shared/report/report-sections.ts` (192-200) | `buildQualityGate` omite PASS; 8 `style=` inline |
| Render table/chart/diff | `report-table.ts` (300; 3 style=), `report-chart.ts` (3 style=), `report-diff.ts` (76) | Dump de 6740 linhas (T3); `return ''` |
| DataHub | `shared/data-hub/hub.ts` (446-510,794-914), `factory.ts` (58,110,126), `types/data-hub.ts` (694-769) | `computeMetrics` incoerente (`passRate` pipeline vs test-level); agregações com 0 consumidores |
| Health | `shared/quality/health-score.ts` (188-254) | Dimensão sem dados = 0; sem PARTIAL |
| Release score | ~~`shared/quality/release-score.ts` vs `shared/data-hub/compute/release-score.ts`~~ → 1 implementação (`shared/data-hub/compute/release-score.ts`, via `hub.computed.releaseScore`) | Dupla implementação divergente (4 vs 5 dims) — **CORRIGIDO em F1-T3 (B3)** ✅ |
| P2 consumers | `case17.ts:369`, `case17-helpers.ts` (31 style=, 7 emojis, recomputa passRate/flakiness), `gen-report-complete.ts:165`, `harness:542`, `failure-analysis.ts:198` | Error pages — **CORRIGIDO em F0-T8** ✅ (todos passam `computed: hub.computed`); mock-theater removido |
| Recomputação | `schedule-handler.ts` (181-275, 285-287, 372-378, 404), `interactive-mode.ts` (386-551, 577-583), `batch-mode.ts` (259,388,445) | 17+12 métricas recomputadas localmente em vez de `computed.*` |
| Forma residual | `pipeline-health-renderer.ts` (50-58, 6 style=, 3 emojis) | CSS custom + inline + emoji |
| Validação | `scripts/artifact-validation-harness.ts` (fixtures hardcoded, sem spec-driven, não no CI), `artifact-specs.ts`, `artifact-content-validation.test.ts` | Harness não valida; specs são o contrato de medição |
| Aparência | `shared/ui/theme-tokens.ts` (153-158), `shared/primitives/report-styles.ts` | Contraste AA falha (warn `#facc15`, info `#6366f1`, error `#ef4444`); sem focus-visible/reduced-motion/tabular-nums |
| CI | `.github/workflows/ci.yml` + `shared/ci/ci-injector.ts` + `setup/templates/*` | Novo job AQS DEVE ser gerado via injector (proibido editar yml manual, G2) |

### Fases e tarefas atômicas (cada uma: RED test → fix → GREEN → commit)
| Fase | Tarefa | Ação | Verificação |
|---|---|---|---|
| **F1** | F1-T1 | `computeMetrics` produz `passRate` único coerente (runs + parsedArtifacts); test-level reconciliado | PBT coherence; self-run 100%≠0 |
| F1 | F1-T2 | `health-score`: dimensão sem dados ≠ 0 → excluir do score + marcar; modo PARTIAL com banner | teste: 0 dados → PARTIAL, nunca critical |
| F1 | F1-T3 | Merge release-score em 1 implementação (5 dims via hub) | teste equivalência/paridade |
| F1 | F1-T4 | Fallback manual permanece no DataHub; sem dado → "insufficient data" | teste fallback manual |
| F1 | F1-T5 | Revisar call-sites `createDataHub*` (ci-data.ts:58) pós-contrato | typecheck + CI |
| **F0** | F0-T1..T5 | pr-report-core/report-html/report-utils/batch-mode consomem `computed.testCounts`/`runPassRate`/`metricsRuns`; remover fallbacks 119/124 e `statsFromTests` | zero `\|\|` não-computed; tests atualizados |
| F0 | F0-T6 | **Hub first (N6):** estender `ComputedMetrics` + `computeMetrics` com `backlogHealth`, `developerProfile`, `aiComparison`(→`aiMetrics`); corrigir `coverageGap` (mapping de requisitos real — equivalência c/ `analyzeCoverageGaps`, Rule 9). Depois: schedule-handler consome `dataHub.computed.*` (13 métricas, :178-275); remover recomputação local + git-metrics (:133-134,:394) | tests sem mock-theater; outputs == `computed.*` |
| F0 | F0-T7 | interactive-mode consome `dataHub.computed.*` (28 refs, :388-550); quality-gate `<pre>`:570 → primitives | tests sem mock-theater |
| F0 | F0-T8 | **SSOT-ificação failure-analysis (N7):** contrato `analyzeFailuresWithReport(dataHub, context?)` — `tests` derivado de `dataHub.computed.metricsRuns[0].tests` (fonte única); `offerPipelineFailureAnalysis(parsed, options?: { dataHub?, onAnalysis? })` propaga hub nos 3 callers (pipeline-handler/batch-mode/smoke-pipeline; defensivo `createDataHubFromParseResult`); `DataHub.saveParseResult(project, result, sourceRunId?)` reconcilia hub SSOT; remover 2 mocks de case17.test (`analyzeFailuresWithReport` + `generateHtmlReport`); + `case17.ts:369`, `gen-report-complete.ts:165`, `harness:550` | ✅ CONCLUÍDA (2026-08-01) — zero error page com dado disponível; `test-report.html` real sem ERROR-PAGE; tests sem mock-theater |
| F0 | F0-T9 | **Dead code → DELETAR (N8):** inline `generateHtmlReport` estrito (remove delegação a `generateReportWithFallback`; guards `computed`/`metricsRuns`/`passRate` finito mantidos); DELETAR `generateReportWithFallback` + `generateCoverageHtml` + helpers orfanados + barrel `report-generator.ts`; migrar `failure-analysis.ts:198` → `generateHtmlReport` com `computed: options?.dataHub?.computed`; remover mock-theater do barrel em `failure-analysis.test.ts`; DELETAR testes de `generateCoverageHtml` em 4 arquivos (`report-html.test.ts`, `report-html-project.test.ts`, `report-generator.test.ts`, `integration/report-html.integration.test.ts` FT-17b/17d) garantindo cenários de spec no renderer real (`generate-coverage-gap-html.test.ts`); docs ghost (§4 TECHDOC:204/INTEGRATED-PLAN FT-11/FT-101 + `docs/08-fluxos-completos.md`) | madge/tsc zero refs; suíte verde; docs consistentes |
| F0 | F0-T10 | Remover fallback `generateGitMetricsRuns`; export "insufficient data" explícito | batch-mode tests |
| F0 | F0-T11 | INC-1 (N4): contrato `PrReportStats.duration: number \| undefined`; `deriveSsoTTestData:617` sem `?? 0`; renderers `:148/:429/:465` → `N/A` (guard `Number.isFinite`) | RED: sem run → `'N/A'`, nunca `'0.0s'` |
| F0 | F0-T12 | INC-2 (N5): remover `result.totalIssues \|\| 0` em backlog-health-renderer (contrato obrigatório; finitude na origem) | RED: `totalIssues=0` → taxas corretas |
| **F2** | F2-T1..T4 | Todos os `return ''` → `EmptyState` (razão + ação) | grep zero `return ''` |
| **F3** | F3-T1..T3 | Gate sempre visível PASS/WARN/FAIL + score; threshold real de config-accessor; HTML não `<pre>` | buildQualityGate sempre renderiza |
| **F4** | F4-T1..T5 | test-table colapsada (teto T2); merge 3 builders de gate; hierarquia h1→h2/h3; Recommended Actions; remover badges decorativos | gate AQS pr-report |
| **F5** | F5-T1..T6 | Tokens AA (`warn→#d97706`, `info→#2563eb`, `error→#dc2626`, `success→#16a34a`); focus-visible/reduced-motion/tabular-nums/color-mix/skip-link; classificar 15 `style=`; emojis→SVG; golden reference | `rg` zero hex fora de tokens; zero emoji |
| **F6** | F6-T1..T3 | pipeline-health → primitivos; schedule `buildHtmlPage` com CSS; interactive dashboards via primitivos | D3 ✅ |
| **F7** | F7-T1..T5 | `artifact-quality-gate.ts` spec-driven; harness com fixtures externas; job CI via injector; rodar AQS 24+1; remoção AQS<60 | scorecard por artefato |

### Sanitização
- Remover: `statsFromTests`, `generateReportWithFallback`, `generateCoverageHtml`, barrel `report-generator.ts`/`report-styles.ts` (pós-migração), `reports/validation/flakiness-with-datahub.html` (órfão), `calcRunPassRate` local (case17-helpers/pr-report-core), fallback `generateGitMetricsRuns`.
- Merge: 3 builders de quality gate → 1; release-score 4 vs 5 dims → 1.
- Corrigir docs: ghost paths (ARTIFACT-VALIDATION §4), CONTENT-SPECIFICATION gap table, completion-plan "28 artifacts" → 24.
- Recomputação local em schedule-handler/interactive-mode → `computed.*` (remover lógica duplicada).

### Auditoria final (100% sem débito)
```
npx tsc --noEmit && npx vitest run && npm run lint   # após cada tarefa
npx madge --circular shared/
```
1. Zero dual-source/fallback/`return ''` de omissão em renderers.
2. Zero error-page em call-site de produção.
3. Zero `style=` estático, zero emoji, zero hex fora de tokens.
4. Zero recomputação local em schedule-handler/interactive-mode.
5. Quality gate visível em todo artefato com gate.
6. AQS ≥ 90 (C2/C8 ≥ 80) para os que permanecem; remoção dos que não atingirem.
7. CI `artifact-quality-gate` verde (gerado via injector).
8. Suíte 534 files/7397 tests 100% + lint + madge + typecheck.
9. Docs consistentes com o real.
10. Conexão E2E: funções expostas em menus/interfaces e executando de ponta a ponta.

### Regras de segurança aplicadas (obrigatórias nesta fase)
- Rule 4/13 Root Cause: corrigir na origem (DataHub primeiro).
- Rule 5/18: proibido enfraquecer/desabilitar mecanismos de segurança; nenhum bypass sem autorização explícita.
- Rule 19: TDD red→green; proibido alterar asserts existentes; mock só em fronteira externa.
- Rule 24 Safeguard Clauses: `Number.isFinite`, null/undefined guards, coleções vazias explícitas.
- Rule 25 Zero Silencing: erros explícitos com causa + correção + retomada (skip/abort); nunca hard fail sem contexto.
- Rule 26 Mock Integrity: shapes exatos; sem mock-theater.
- Rule 13 CI Monitoring: pós-push, monitorar via GitHub API com `GITHUB_TOKEN` (`.env.local`).

---

## 8. CATÁLOGO DE BUGS → TESTES RED (TDD — cada bug tem teste que falha antes do fix)

> Protocolo: para CADA bug abaixo, (1) criar teste RED que falha no código atual, (2) corrigir o código-fonte na origem, (3) verificar GREEN, (4) rodar suíte completa + lint + typecheck antes de commit. Proibido alterar asserts existentes (Rule 19.5). Mocks APENAS em fronteiras externas (HTTP/rede/e-mail) — lógica de negócio roda real (Rule 26/§19).

| Bug | Causa raiz (origem) | Teste RED a criar (arquivo sugerido + expect) | Fix na origem | Fase |
|---|---|---|---|---|
| B1 | `computed.passRate` = 0 quando só há parsedArtifacts (sem pipeline runs) → contradição summary 100% vs health critical 8 | `shared/data-hub/__tests__/compute/phase22-foundation.test.ts`: `createDataHubFromParseResult` (via `DataHubImpl.createFromParseResult`) com 6790 passed/0 failed e `runs: []` → `computed.passRate === 100` | `hub.ts computeMetrics:795` — `passRate` = pipeline; se `withConclusion===0` e testes executados>0 → usar `runPassRate` (test-level) | F1-T1 |
| B2 | `health-score.ts computeActualMetrics:188` lê dimensões sem dados como 0 → score critical falso; sem modo PARTIAL | `shared/quality/__tests__/health-score.test.ts`: hub sem nenhum dado de passRate/coverage/execution → health NÃO critical; dimensões "no data" excluídas do score; banner PARTIAL presente | `health-score.ts` — dimensão sem dado ≠ 0; excluir do score; `mode: 'partial'` + lista de dimensões excluídas | F1-T2 |
| B3 | release-score duplicado: `shared/quality/release-score.ts` (4 dims) vs `shared/data-hub/compute/release-score.ts` (5 dims) — divergem p/ mesmos inputs | equivalência: mesmo input → ambos produzem MESMO resultado (após merge, 1 implementação) | merge em 1 implementação (5 dims, via hub); remover `shared/quality/release-score.ts`; atualizar consumidores (case26, schedule-handler, interactive-mode) | F1-T3 |
| B4 | pr-report consome `stats`/`tests` crus (`buildSummaryTable:184`, `buildFailureTable:199`, `writeToJobSummary:425`, `calcRunPassRate:697`) | `shared/__tests__/pr-report-core.test.ts`: valores do summary/job-summary idênticos aos derivados de `computed.runPassRate`/`testCounts`; zero import de `statsFromMetricsRun` no caminho | pr-report-core: consumir `computed.testCounts`/`runPassRate`/`metricsRuns`; remover recomputação local | F0-T1/T2 |
| B5 | `report-html.ts:119` fallback `computed.passRate \|\| derive(metricsRuns)` → contradição (100 vs 0); `:124` `metricsTrends ?? options.trends` | `shared/__tests__/report-html.test.ts`: `computed.passRate=0` + metricsRuns com 100% → HTML mostra 0 (nunca 100 derivado); trends só de `computed.metricsTrends` | remover fallbacks 119/124; consumir exclusivamente `computed` | F0-T3 |
| B6 | 4 call-sites chamavam `generateHtmlReport` sem `computed` → ERROR-PAGE (`case17.ts:369`, `gen-report-complete.ts:165`, `harness:542`, `failure-analysis.ts:198`) | `jira_management/commands/__tests__/case17.test.ts`: remover mock de `generateHtmlReport`; com dataHub → HTML real sem "Error generating report". Mesmo p/ gen-report (E2E) e failure-analysis | ✅ F0-T8 — cada call-site constrói/deriva DataHub e passa `computed: hub.computed` |
| B7 | `report-sections.ts:192-200` `buildQualityGate` retorna `''` quando PASS (omissão do veredito) | `shared/__tests__/report-sections.test.ts`: gate com passRate≥threshold → HTML NÃO vazio com "PASS" + score | `buildQualityGate` sempre renderiza (PASS/WARN/FAIL + checks) | F3-T2 |
| B8 | `pr-report-core.ts:569` `generateHtmlReportFile` passa `qualityGate: Math.round(passRate)` (threshold=self) → gate nunca falha/omite | pr-report-core test: threshold real de config → gate FAIL quando passRate < threshold | threshold de `config-accessor`; gate com semântica real | F3-T1 |
| B9 | `report-table.ts buildTestTable:300` renderiza TODOS os testes (6740 linhas no self-run) | `shared/__tests__/report-table.test.ts`: >cap de passes → tabela colapsada ("Show all N"/teto), não 1 linha por teste passado | colapso por padrão (T2: só falhas/flaky/amostra) + teto + "view all" | F4-T1 |
| B10 | `report-html.ts:103` `generateReportWithFallback` (fallback proibido) + `:229` `generateCoverageHtml` (dead code, 0 consumidores prod; duplica coverage-gap) | remoção: `madge`/`tsc` sem referências; testes de cobertura migrados p/ `generate-coverage-gap-html.test.ts` | deletar ambas; failure-analysis usa `generateHtmlReport` estrito com `computed` | F0-T9 |
| B11 | `batch-mode.ts:366-402` fallback local `generateGitMetricsRuns` (dual-source); sem runs → `return` silencioso (:387-398) | `git_triggers/__tests__/batch-mode.test.ts`: sem `computed.metricsRuns` → saída explícita "insufficient data", nunca skip silencioso | remover fallback local; produção de runs é do DataHub; no-data explícito | F0-T10 |
| B12 | `schedule-handler.ts:178-275` recomputa 13 métricas localmente (defectAggregation, traceability, seasonality, regression, developerProfile, aiComparison, suiteOptimization, crossSquad, incident, pipelineCost, impact, backlogHealth, coverageGap). **Hub não computa `backlogHealth`/`developerProfile`/`aiComparison` e `coverageGap` é não-equivalente (N6)** | `git_triggers/__tests__/schedule-handler.test.ts`: remover mocks de função; outputs iguais a `dataHub.computed.*` | **Hub first:** adicionar `backlogHealth`/`developerProfile`/`aiComparison` ao `ComputedMetrics` + corrigir `coverageGap`; depois consumir `computed.*` | F0-T6 |
| B13 | `interactive-mode.ts:577-583` quality-gate em HTML cru `<pre>` sem CSS | `git_triggers/__tests__/interactive-mode.test.ts`: dashboard contém `<!DOCTYPE html>` + primitivos/CSS | usar `buildHtmlPage` + primitivos + `computed` | F3-T3 |
| B14 | `pipeline-health-renderer.ts` `_PIPELINE_CSS` custom (:50-58), 6 inline styles, 3 emojis | `git_triggers/__tests__/pipeline-health.test.ts`: 0 `style=` estático, 0 emoji, tokens `buildCss` presentes | migrar p/ primitivos + `buildCss`; emojis→SVG | F6-T1 |
| B15 | `case17-helpers.ts`: 31 inline styles, 7 emojis, recomputa `calcRunPassRate`/`calcFlakinessEntries` | `jira_management/commands/__tests__/case17-helpers.test.ts`: 0 inline/emoji; consumir `computed` | sanitizar helpers; consumir `computed.*` | F5-T4/F6 |
| B16 | `theme-tokens.ts:153-158` cores light falham contraste AA (warn `#facc15`≈1.5:1, info `#6366f1`≈4.3:1, error `#ef4444`≈3.7:1) | `shared/ui/__tests__/theme-tokens.test.ts`: razão de contraste (rel. luminância) ≥4.5:1 p/ texto em branco | tokens AA (pesquisa): warn→`#d97706`, info→`#2563eb`, error→`#dc2626`, success→`#16a34a` + dark pairs | F5-T1 |
| B17 | inline styles estáticos em `report-sections.ts` (8), `report-table.ts` (3), `report-chart.ts` (3), `generate-coverage-gap-html.ts:120` (1) | `shared/__tests__/report-sections.test.ts` etc: 0 `style=` estático (permitido só largura/geometria de dados dinâmica) | classificar: estáticos→classes CSS; dinâmicos→documentar | F5-T3 |
| B18 | `pr-report-job-summary` emojis (`:white_check_mark:`, `:x:`, etc.) | pr-report-core test: 0 codepoints emoji no job-summary | substituir por texto/símbolos ASCII | F5 |
| B19 | `flakiness-renderer.ts:39` `options?.dataHub?.computed.testCounts.total ?? 0` → Flaky Rate 0% (P1); callers `schedule-handler:399`/`batch-mode:242` sem options | `shared/__tests__/flakiness-dashboard.test.ts`: com dataHub → total correto; sem dataHub → "no data" explícito (nunca 0) | renderer exige dataHub (contrato); callers passam hub; no-data explícito | F0/F1 |
| B20 | `report-export.ts` ok (projeção pura), MAS input deve vir de DataHub; call-site `batch-mode.ts:402` já usa `computed.metricsRuns[].tests` | `shared/__tests__/report-export.test.ts`: projeção pura (zero recomputação); call-site testa "insufficient data" | manter puro; garantir input dataHub-sourced | F0-T10 |
| B21 | `report-html.ts:46,59`, `report-sections.ts:30,52,72,90,168,213,411`, `report-table.ts:75,100,187`, `report-chart.ts:30,43,51`, `report-diff.ts:76`, `report-utils.ts:46` — `return ''` = omissão silenciosa | por função: ausência → `EmptyState` com razão+ação (teste: HTML contém `data-component="empty-state"`) | substituir por primitivo `EmptyState` | F2 |
| B22 | `generatePrReport` `pr-report-core.ts:1057` (`main()`) passa `tests`/`stats` raw ao gerar markdown/job-summary/html | pr-report-core test: output derivado só de `computed` | `main` passa `computed`; diff via `metricsRuns` | F0-T1 |

## 9. PROTOCOLO DE RETOMADA (para agente não familiarizado)

### Como continuar a partir deste ponto
1. **Estado atual:** Fase A concluída (primitives) · Plan v2 registrado (§7) · F1-T1 (B1) ✅ · F1-T2 (B2) ✅ · F1-T3 (B3 merge release-score) ✅ · F1-T4 (Layer 7 SSOT) ✅ · F1-T5 (revisão call-sites `createDataHub*`) ✅ · F0-T1 (B4+B22 — pr-report computado-driven) ✅ · F0-T2 (remover `statsFromTests`) ✅ · F0-T3 (B5 — remover fallbacks report-html 119/124) ✅ · F0-T4 (sweep zero `||` não-computed — remover `testCategories` dual-source) ✅ · F0-T10 (B11+B20 — remover fallback `generateGitMetricsRuns` em batch-mode; no-data explícito) ✅ · B19 (flakiness-renderer `?? 0` → no-data explícito + callers passam DataHub) ✅ · Auditoria final E2E da fase ✅ (refs §8 corrigidas) · Plano INCs + F0 restante + F2–F7 REGISTRADO (2026-08-01, achados N4/N5/N6/N7/N8) ✅ · **F0-T9 (N8 — dead code deletado) ✅** · **F0-T8 (N7/B6/P2 — SSOT-ificação failure-analysis + reconciliação hub) ✅** — próxima: F0-T6 (hub first: `backlogHealth`/`developerProfile`/`aiComparison` + `coverageGap` equivalente) — ver PROGRESS abaixo.
2. **Princípio:** corrigir DataHub (F1) ANTES de renderers (F0) — nunca o inverso.
3. **Ordem das fases:** F1 → F0 → F2 → F3 → F4 → F5 → F6 → F7.
4. **Por tarefa:** (1) ler bug na §8, (2) criar teste RED no arquivo indicado, (3) confirmar que FALHA (`npx vitest run <arquivo>`), (4) corrigir código na origem, (5) GREEN, (6) `npx tsc --noEmit && npx vitest run && npm run lint`, (7) commit atômico.
5. **Arquivos-chave:**
   - SSOT compute: `shared/data-hub/hub.ts` (`computeMetrics:794-914`, factories `:446-510`, Layer 7 `applyLayer7Fallback:408`/`resolveLayer7:481`), `shared/data-hub/factory.ts` (`createDataHub`, `createDataHubFromFallback`), `shared/types/data-hub.ts:694-769` (contrato `ComputedMetrics`).
   - Health: `shared/quality/health-score.ts` (`computeActualMetrics:188` consume `computed.dataAvailability`; `partial`/`partialReasons`/grade `'unknown'` em `_computeHealthScore:417`).
   - Release score (F1-T3 ✅): única implementação em `shared/data-hub/compute/release-score.ts` (`calcReleaseScore`), consumida via `hub.computed.releaseScore`; renderer `shared/quality/release-score-renderer.ts`.
   - Render: `shared/report/report-html.ts` (:40,103,105-110,117-124,229), `report-sections.ts` (:192-200), `report-table.ts:300`, `report-utils.ts:9,18`.
   - pr-report: `shared/pr-report-core.ts` (:110-222,425-457,547-594,735-765,1043-1112).
   - Consumers P2: `case17.ts:369`, `case17-helpers.ts`, `gen-report-complete.ts:165`, `scripts/artifact-validation-harness.ts:542`, `shared/validation/failure-analysis.ts:198`.
   - Recomputação: `git_triggers/schedule-handler.ts:181-275`, `git_triggers/interactive-mode.ts:386-551`, `batch-mode.ts:242,366`.
   - Tokens: `shared/ui/theme-tokens.ts:151-208`, `shared/primitives/report-styles.ts`.
   - Validação: `shared/types/artifact-specs.ts`, `scripts/artifact-validation-harness.ts`, `shared/__tests__/artifact-content-validation.test.ts`, `shared/validation/artifact-validator.ts`.
   - CI (gerado): `.github/workflows/ci.yml` ← `shared/ci/ci-injector.ts` + `setup/templates/*` (PROIBIDO editar yml manual, G2).
6. **Comandos de verificação:** `npx vitest run <arquivo>` · `npx tsc --noEmit` · `npm run lint` · `npx madge --circular shared/` · suite completa `npx vitest run --testTimeout=120000`.
7. **CI monitoring pós-push:** `curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/kevindemian/qa_tools/actions/runs?branch=main` (token em `.env.local`/`.env`).
8. **Proibições absolutas:** sem bypass de segurança (Rule 18); sem alterar asserts existentes (Rule 19.5); sem `// TODO`/stub/placeholder; sem catch vazio/erro silencioso (Rule 25); sem mock de lógica interna (Rule 26); sem fallback fora do DataHub (Rule 3/14).
9. **Inconformidades descobertas durante a execução → ciclo obrigatório de registro (REPETIR o processo de 2026-08-01):** sempre que uma inconformidade for encontrada ao longo de qualquer tarefa, PARAR a execução e repetir o ciclo completo:
   1. **Avaliar** a inconformidade: causa raiz (origem), produtores/consumidores, impacto de contrato, evidência (Rule 12 — factual, não especulativo), e decidir a correção pela superioridade técnica + segurança (tempo/esforço NÃO são variáveis).
   2. **Registrar como novo achado** (N#) na §7 "Achados adicionais" com arquivo/linha/defeito + fix proposto.
   3. **Distribuir a correção ao longo das tarefas pendentes:** adicionar linha(s) atômica(s) na tabela §7 (F0-T#/fase apropriada com RED test → fix → verificação), linha no catálogo §8 (se aplicável), e linha ⏳ PENDENTE no PROGRESS com a ordem de execução ajustada (re-sequenciar dependências — hub first se a origem for o DataHub).
   4. **Somente então** retomar a execução na ordem atualizada.
   - Proibido: corrigir uma inconformidade recém-encontrada sem registrá-la primeiro; adiar o registro ("depois eu anoto"); resolver a inconformidade por workaround/bypass (Rule 3/14) sob qualquer justificativa.

### PROGRESS (atualizado a cada tarefa concluída)
| Data | Fase/Tarefa | Status | Notas |
|---|---|---|---|
| 2026-07-31 | Fase A (A1-A9 primitives) | ✅ CONCLUÍDA | 0 inline styles/emojis em primitives; 534 files/7397 tests |
| 2026-07-31 | Plan v2 registrado (§7) + Catálogo bugs (§8) + Protocolo (§9) | ✅ | — |
| 2026-07-31 | F1-T1 (B1 — passRate coerente) | ✅ CONCLUÍDA | `hub.ts computeMetrics` — passRate = pipeline se runs com conclusion existem; senão test-level `runPassRate`; 0 só sem dados. Teste RED→GREEN em `hub.test.ts` (2 testes novos). Suíte data-hub+pr-report 732 tests ✅; tsc ✅ |
| 2026-07-31 | F1-T2 (B2 — health no-data ≠ 0 + PARTIAL) | ✅ CONCLUÍDA | SSOT: `ComputedMetrics.dataAvailability` (novo contrato) computado em `hub.ts computeMetrics` (presença de fonte real: runs/coverage/jobs/timing). `health-score` consome `dataAvailability` (fallback finitude p/ hubs legados/mocks); `available.flaky` consistente no composite/dimensions; grau `'unknown'` adicionado a `HealthScoreGrade` (zero dims disponíveis); campos `partial`/`partialReasons` em `HealthScoreResult`; banner `PARTIAL — insufficient data, low confidence` em `buildHealthSection` (Badge warn, dims excluídas no title/aria). RED→GREEN: 2 testes novos em `health-score.test.ts` (hub parsed-only + hub vazio) + 2 em `report-sections.test.ts` (banner). Consumidores de grade atualizados (`cli_base.ts` ⚪, `splash.ts` muted). Suíte completa 535 files/7418 tests ✅; tsc ✅; lint ✅ |
| 2026-08-01 | F1-T3 (B3 — merge release-score duplicado) | ✅ CONCLUÍDA | SSOT: `shared/data-hub/compute/release-score.ts` `calcReleaseScore(dimensions, weights?, availability?)` (5 dims; DORA boundaries excellent≥90/good≥80/needs_attention≥70/poor≥60/critical<60; weights 30/20/25/15/10). `hub.ts computeReleaseScore` repassa `dataAvailability` (B2/§25); `shared/quality/release-score.ts` (4 dims) REMOVIDO. Consumidores migrados p/ `hub.computed.releaseScore`: `case26.ts` (reescrito, fluxo real), `interactive-mode.ts`, `schedule-handler.ts`; imports de tipo p/ `shared/types/data-hub.js`; renderer com guards `breakdown ?? []`, noData → `N/A`/EmptyState `Insufficient data for release score`, recommendation sanitizada. Testes migrados p/ contrato 5-dim (4 arquivos antigos reescritos: unit/boundaries, robust no-fabricação, property, integration) + fixtures 5-dim (harness + content-validation) + 3 suites de consumidor com hub REAL (`DataHubImpl.createFromParseResult`) e renderer REAL (anti-mock-teatro); fix `benchmarkInput` em schedule-handler (mock registra 2 chamadas: compute cross-squad + handler). Gate completo: tsc ✅ · vitest 535 files/7409 tests ✅ · lint ✅ |
| 2026-08-01 | F1-T4 (Layer 7 SSOT no DataHub) | ✅ CONCLUÍDA | Fallback manual consolidado no DataHub: novo entry de factory `createDataHubFromFallback(repo)` → `DataHubImpl.create([], {repo, allowEmpty:false})` (mesmo caminho de CI: `resolveLayer7`→`applyLayer7Fallback`→`requestUserFallback`→`askTestSource`). `pr-report-core` removeu a chamada direta a `askTestSource`/`createDataHubFromParseResult` (dual Layer-7, Rule 3/SSOT) e agora orquestra os 3 desfechos por códigos do hub (dados → Caso 1; `LAYER7_NO_FILE` → Caso 2 declinou; `Layer7UnavailableError` → Caso 3 erro explícito). `createDataHubFromParseResult` (morto em produção) removido; `DataHubImpl.createFromParseResult` permanece (consumido por 4+ suites, anti-mock-teatro). RED→GREEN: `hub-layer7.test.ts` (5 testes: skip/arquivo/NO_TTY/NO_DATA_SOURCE/allowEmpty) com mock só de `askTestSource` (fronteira externa, Rule 26) + wiring tests atualizados (novo entry; caso local passa pelo factory; §10 equivalência). Bônus: `fileName` passa a refletir o `source` real (antes hardcoded `'user-fallback'`). Suíte 4 arquivos/24 testes ✅; tsc ✅ |
| 2026-08-01 | F1-T5 (revisão call-sites `createDataHub*` pós-contrato) | ✅ CONCLUÍDA | Revisados todos os call-sites de produção: `ci-data.ts:58` (`createDataHub(provider, repo, {allowEmpty:true})` — resiliente, testado), `pr-report-core.ts:928` (`createDataHub` estrito → erro explícito) e `pr-report-core.ts:990` (`createDataHubFromFallback` — local Layer-7). Consumidores (`session-state`, `batch-mode`, `prefetchAllProjects`) tratam `undefined` explicitamente com logs (Rule 25 ok). Nenhum defeito de código nos call-sites. Novo teste de wiring `factory-fallback.test.ts` (entry real → `DataHubImpl.create([],...)` real → mock só de `askTestSource`): arquivo manual → hub ok com source preservado; `NO_TTY` → `Layer7UnavailableError`. Docs: 3 refs ghost `createDataHubFromParseResult` corrigidas p/ `DataHubImpl.createFromParseResult` no plan doc (`data-hub-ssot-enforcement.md:3666,3670,3671,3687`) + referência de linha `pr-report-core.ts:824` → `:1010`. Gate completo: tsc ✅ · vitest completo ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage ✅ |
| 2026-08-01 | F0-T1 (B4+B22 — pr-report computado-driven) | ✅ CONCLUÍDA | `PrReportCoreOptions` remove `tests`/`stats`; `generatePrReport` deriva via `deriveSsoTTestData`: contagens de `computed.testCounts`, taxa de `computed.runPassRate` (ausência/não-finito → erro explícito, §25), testes de `computed.metricsRuns[0].tests`, duration do run. Removidos `calcRunPassRate` local, `validatePrReportStats` (checagem dual-source contraditória pós-SSOT), param `_stats` de `buildCiContextSection`, param `stats` de `generateHtmlReportFile`. passRate flui de computed p/ summary/job-summary/html (formato 1-decimal preservado). Call-sites (B22): `main()` de pr-report-core (diff ainda via `metricsRuns[0]/[1]`) e `generatePrReportIfNeeded` de batch-mode (param `parsed` removido) passam só `dataHub`. Testes migrados (helpers constroem hub SSOT testCounts/runPassRate/metricsRuns) + 2 testes novos: summary/job-summary idênticos a testCounts/runPassRate com metricsRuns divergente; runPassRate ausente → erro explícito. Gate completo: tsc ✅ · vitest 537 files/7421 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% ✅ |
| 2026-08-01 | F0-T2 (remover `statsFromTests`) | ✅ CONCLUÍDA | `statsFromTests` (dual-source fallback, §8 row F0-T1..T5) removido de `shared/report/report-utils.ts` — 0 consumidores em produção (só testes). Remove import `FlatTest` (morto) e bloco `describe('StatsFromTests')` (4 testes) de `report-utils.test.ts`. `statsFromMetricsRun` permanece (SSOT, usado por report-html/session-context). Gate completo: tsc ✅ · vitest 537 files/7417 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% ✅ |
| 2026-08-01 | F0-T3 (B5 — remover fallbacks report-html 119/124) | ✅ CONCLUÍDA | `shared/report/report-html.ts`: `passRate` passou de `computed.passRate || derive(metricsRuns)` (contradição 100 vs 0) para consumo exclusivo de `computed.passRate`, com guard §24/§25.3: não-finito → erro explícito (página de erro, nunca derive/NaN silencioso). `trends` passou de `computed.metricsTrends ?? options.trends ?? []` para `computed.metricsTrends ?? []` (campo `ReportOptions.trends` removido do contrato — 0 consumidores). Call-site `pr-report-core.ts` (`trends: computed.metricsTrends ?? []`) e 6 call-sites de teste migrados p/ `computed.metricsTrends`. Testes: RED → `computed.passRate=0` + metricsRuns 100% → valor do card Pass Rate = `0.0%` (assert preciso no `data-part="value"`, nunca 100.0% derivado); non-finite → erro explícito; fixtures `computedFor` corrigidas para `passed+failed>0 ? ... : 0` (nunca NaN — shape fiel ao hub real, que emite passRate sempre finito). Gate completo: tsc ✅ · vitest 537 files/7419 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% (302034/302165) ✅ |
| 2026-08-01 | F0-T4 (sweep zero `\|\|` não-computed — remover `testCategories` dual-source) | ✅ CONCLUÍDA | `report-html.ts:125` `options.testCategories || computed.failureClassifications || {}` → consumo exclusivo de `computed.failureClassifications ?? {}`. `ReportOptions.testCategories` removido do contrato (0 produtores em produção e testes — dead dual-source; classificação de falha é SSOT do DataHub). Sweep em `shared/report/*` + `session-context.ts` + `pr-report-core.ts` + `batch-mode.ts`: restantes são exceções legítimas (defaults de apresentação `title || DEFAULT_TITLE`, badges/cores, metadata CI/env, guards `Number.isFinite`, projeção `statsFromMetricsRun(computed.metricsRuns[0])` — derivada de computed, não dual-source). Teste novo: categories renderizam exclusivamente de `computed.failureClassifications`. Gate completo: tsc ✅ · vitest 537 files/7420 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% (302047/302178) ✅ |
| 2026-08-01 | F0-T10 (B11+B20 — remover fallback `generateGitMetricsRuns` em batch-mode; no-data explícito) | ✅ CONCLUÍDA | B11 (`batch-mode.ts:379/388` dual-source): `generateTestExport` e `generateFlakinessDashboard` passaram a consumir exclusivamente `hub.computed.metricsRuns` — fallback local p/ `generateGitMetricsRuns`/`getLastGitLogError` removido (import morto eliminado; batch-mode não alcança mais fora do DataHub, Rule 3/14). No-data NUNCA silencioso (Rule 25): export sem runs → `warn('Dados insuficientes para export de testes de <proj> — sem computed.metricsRuns. Execute pipelines primeiro.')`; última run sem testes → warn explícito; flakiness com <2 runs → `warn('Dados insuficientes para flakiness dashboard...')`. B20 (`report-export`): permanece projeção pura (0 alterações); input agora 100% `computed.metricsRuns[].tests`; call-site testa no-data. RED→GREEN: 2 testes novos em `batch-mode.test.ts` (fluxo real via `tryBatchMode`, mock só do adapter git externo `git-metrics-adapter` — fronteira de subprocesso, Rule 26): sem `computed.metricsRuns` → `warn` com 'insuficiente' para export e para flakiness, nunca skip silencioso. Gate completo: tsc ✅ · vitest 537 files/7422 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ (3873 deps, -1) · type-coverage 99.95% (302112/302243) ✅ |
| 2026-08-01 | B19 (P1 — flakiness-renderer `?? 0` → no-data explícito) | ✅ CONCLUÍDA | `flakiness-renderer.ts:37` `options?.dataHub?.computed.testCounts.total ?? 0` (masking silencioso → Flaky Rate sempre 0%) substituído por no-data EXPLÍCITO (Rule 25.3): `testCounts.total` ausente/não-finito/negativo → card Flaky Rate `N/A` + banner `Insufficient Data` (`dataHub.computed.testCounts.total ausente/inválido (SSOT)`); total 0 real → `0%` (distinção dado-0 vs dado-ausente). Callers de produção agora passam o hub: `batch-mode.ts` (`{ dataHub: hub }`), `schedule-handler.ts` (`{ dataHub: hub }`), `e2e/smoke-pipeline.ts` (`{ dataHub: hub }`). Testes RED→GREEN em `flakiness-dashboard.test.ts` (2 novos): sem dataHub → Flaky Rate `N/A` + banner (nunca `0%`); com `testCounts.total=100` → `1%` real. Assert do caller em `schedule-handler.test.ts` atualizado p/ verificar passagem de `{ dataHub }` (contrato B19 — antigo 2-arg refletia o bug). Gate completo: tsc ✅ · vitest 537 files/7424 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% (302210/302342) ✅ |
| — | Auditoria final E2E da fase | ✅ CONCLUÍDA | refs stale §8 corrigidas (linha flakiness §3, P1, B11 `batch-mode.ts:366`, B19 `flakiness-renderer.ts:39`/callers `:399/:242`, B22 `pr-report-core.ts:1057`, §9 recomputação `:242,366`). Verificação E2E escopo F0: zero fallback `generateGitMetricsRuns`/`getLastGitLogError` em batch-mode; zero `statsFromTests` em consumers; zero `?? 0`/`|| 0` masking em flakiness-renderer/report-html/report-export; callers flakiness/export passam `{ dataHub }`; repo limpo (scripts de sync não commitados). Observações registradas (§7, fora do escopo F0): `pr-report-core.ts:617` `run?.duration ?? 0` = projeção coerente de dataset vazio (não masking — `runPassRate` ausente já lança); `backlog-health-renderer.ts:89` `totalIssues || 0` = default defensivo sobre campo obrigatório; schedule-handler/interactive-mode ainda usam git-metrics (B12 → F0-T6); `e2e/gen-report-complete.ts:165` sem `computed` (P2 → F0-T9). Gate completo: tsc ✅ · vitest 537 files/7424 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ · type-coverage 99.95% ✅ |
| 2026-08-01 | Plano de ataque INCs + F0 restante + F2–F7 REGISTRADO | 📋 REGISTRADO | Decisões: INC-1 (N4) = fix com contrato `duration: number \| undefined` → `N/A` (Rule 25.1); INC-2 (N5) = remover `\|\| 0` (campo obrigatório; guard na origem Rule 24.3); escopo = F0-T6..T9/T11/T12 + F2–F7 detalhado. Achados N4/N5/N6 adicionados à §7; F0-T6/T7 marcados **hub first** (hub não computa `backlogHealth`/`developerProfile`/`aiComparison`; `coverageGap` não-equivalente — `new Map()` vazio, N6). Ordem de execução: F0-T9 → F0-T8 → F0-T6 (hub-ext → consumers) → F0-T7 → F0-T11 → F0-T12 → F2 → F3 → F4 → F5 → F6 → F7 → auditoria final. Nenhum código alterado — apenas registro do plano. |
| 2026-08-01 | Ciclo §9 item 9 — N7/N8 + F0-T8/F0-T9 re-escopados | 📋 REGISTRADO | Soluções tecnicamente superiores por ponto levantado: P1/P2 — dead code deletado (0 consumidores → equivalência não exigível); P3 — hub propagado nos 3 callers do llm-pipeline (pipeline-handler/batch-mode/smoke-pipeline têm hub) + `DataHubImpl.createFromParseResult` defensivo → zero error page com dado disponível; P4 — remover param `tests` de `analyzeFailuresWithReport` (fonte única = hub); P5 — remover 2 mocks de case17.test; P6 — docs ghost corrigidas na origem; P7 — F0-T9 mecânico/atômico, F0-T8 absorve SSOT-ificação (P3+P4+P5). N7 (dual-source + error page llm-pipeline) e N8 (dead code `generateReportWithFallback`/`generateCoverageHtml`/barrel) registrados na §7. F0-T8 e F0-T9 re-escopados na tabela §7 + PROGRESS. Nenhum código alterado — apenas registro do plano. |
| 2026-08-01 | F0-T9 (N8 — dead code deletado) | ✅ CONCLUÍDA | inline `generateHtmlReport` estrito (guards `computed`/`metricsRuns`/`passRate` finito mantidos; `tests` → `_tests`, param de contrato não lido no corpo). DELETADOS: `generateReportWithFallback`, `generateCoverageHtml`, helpers orfanados (`_coverageStatusClass`/`_renderEpicRow`), interface morta `CoverageEpic` (0 consumidores pós-remoção), import `COVERAGE_TARGET`. Barrel `report-generator.ts` → só `generateHtmlReport` + `categorizeFailure` + tipos (sem `generateCoverageHtml`/`CoverageEpic`). `failure-analysis.ts:198` → `generateHtmlReport` com `computed: options.dataHub.computed` (spread condicional — `exactOptionalPropertyTypes`). Testes: mock-theater do barrel REMOVIDO em `failure-analysis.test.ts` (report REAL com hub REAL shape-fiel via `computedWith`; no-hub → error page explícito; LLM throw → `htmlReport` undefined); testes de `generateCoverageHtml` DELETADOS em 4 arquivos (`report-html`, `report-html-project`, `report-generator`, `integration` FT-17b/17d); edge vazio adicionado em `generate-coverage-gap-html.test.ts`. Docs: `08-fluxos-completos.md` (7 paths reais), `03-git-triggers.md`, `TECHDOC.md` (coverage-source → `shared/data-hub/compute/coverage.ts`; tree ghost corrigida). Gate completo: tsc ✅ · vitest 537 files/7405 tests ✅ · lint ✅ · unused-exports ✅ · depcruise ✅ (953 modules/3870 deps) · madge ✅ · type-coverage 99.95% (301615/301746) ✅ |
| 2026-08-01 | F0-T8 (N7/B6/P2 — SSOT-ificação failure-analysis + reconciliação hub) | ✅ CONCLUÍDA | Contrato `analyzeFailuresWithReport(dataHub, context?)` — `tests` derivado de `dataHub.computed.metricsRuns[0].tests` (fonte única); `metricsRuns[0]` ausente → throw (Rule 25, nunca análise stale). `offerPipelineFailureAnalysis(parsed, options?: { dataHub?, onAnalysis? })` — hub explícito > global `getDataHub()` > defensivo `createDataHubFromParseResult` (factory pública síncrona `shared/data-hub/factory.ts`); callback `onAnalysis` FORA do catch de análise (§25 propagação). `DataHub.saveParseResult(project, result, sourceRunId?)` reconcilia SSOT: persiste + `raw.parsedArtifacts.set(sourceRunId ?? 0, [artifact])` (idempotente dedup por run real) + recomputa `computed` + refresh timestamp; guard inteiro §24. `shared/ci/run-id.ts` (`normalizeRunId`/`getCiRunId`) — dedup key numérica (testes usam `run-123` → `undefined` → slot 0). Callers: `test-results.ts` (`normalizeRunId(pipelineId)`), `pr-report-core.ts:469` (`getCiRunId()`), `batch-mode.ts` (reconcilia ANTES de `setDataHub`), `smoke-pipeline.ts`, `case17.ts:236,402` (reportHub → `computed: reportHub.computed`), `gen-report-complete.ts:174`, harness `:564`, `failure-analysis.ts:213`. Mocks removidos: `analyzeFailuresWithReport` + `generateHtmlReport` em `case17.test.ts`; logger mock de gen-report ganhou `warn` (shape fidelity §26). Testes novos: hub.test.ts (delega/reconcilia/dedup/guard), factory.test.ts (`createDataHubFromParseResult` SSOT + user-fallback + síncrono/sem cache), run-id.test.ts (property-based §19.6), failure-analysis throw-on-missing-run. Zero error page com dado disponível. Gate completo: tsc ✅ · vitest 538 files/7426 tests ✅ |
| — | F0-T6 (B12/N6 — hub first: `backlogHealth`/`developerProfile`/`aiComparison` no hub + `coverageGap` equivalente; schedule-handler → `computed.*`) | ⏳ PENDENTE | extensão `ComputedMetrics` + `computeMetrics`; remover recomputação local + git-metrics; tests sem mock-theater |
| — | F0-T7 (interactive-mode → `computed.*`; quality-gate `<pre>` → primitives) | ⏳ PENDENTE | 28 refs :388-550; forma final em F3-T3/F6 |
| — | F0-T11 (INC-1/N4 — contrato `PrReportStats.duration: number \| undefined`; renderers → `N/A`) | ⏳ PENDENTE | RED: sem run → `'N/A'`, nunca `'0.0s'` |
| — | F0-T12 (INC-2/N5 — remover `result.totalIssues \|\| 0` em backlog-health-renderer) | ⏳ PENDENTE | RED: `totalIssues=0` → taxas corretas |
| — | F2-T1..T4 (B21 — `return ''` → `EmptyState` em 8+ renderers/primitives) | ⏳ PENDENTE | grep zero `return ''`; ausência → `data-component="empty-state"` |
| — | F3-T1..T3 (B8 gate threshold real; B7 gate sempre visível; B13 `<pre>` → HTML) | ⏳ PENDENTE | gate FAIL real; `buildQualityGate` sempre renderiza |
| — | F4-T1..T5 (B9 tabela colapsada; merge 3 builders gate; hierarquia; Recommended Actions; badges) | ⏳ PENDENTE | teto T2 + "Show all N" |
| — | F5-T1..T6 (B16 tokens AA; focus-visible/reduced-motion; B17 classificar `style=`; B15 case17-helpers; B18 emojis job-summary; golden reference) | ⏳ PENDENTE | `rg` zero hex fora de tokens; zero emoji |
| — | F6-T1..T3 (B14 pipeline-health → primitives; schedule/interactive `buildHtmlPage`) | ⏳ PENDENTE | D3 ✅ |
| — | F7-T1..T5 (AQS spec-driven; harness fixtures externas; job CI via injector; AQS 24+1; remoção AQS<60) | ⏳ PENDENTE | scorecard por artefato |

> **Nota:** a parametrização pré-existente de `git_triggers/__tests__/pipeline-health.test.ts` e `jira_management/__tests__/jira_link_manager.test.ts` foi commitada (2026-08-01, `3f73837f`).
