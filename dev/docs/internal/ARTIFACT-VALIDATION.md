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
| 6 | flakiness | ✅ | ❌ | ✅ | Renderiza, mas **BUG totalTests=0**: `flakiness-renderer.ts:37` lê `options?.dataHub?.computed.testCounts.total ?? 0`; callers `schedule-handler.ts:409` e `batch-mode.ts:259` passam **sem options** → Flaky Rate sempre 0%. Confirmado no output real (`0%`). Thresholds ✅ (target×3). |
| 7 | backlog-health | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×4). |
| 8 | pipeline-cost | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×3). |
| 9 | suite-optimization | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1), coluna Savings ✅. |
| 10 | cross-squad-benchmark | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1). |
| 11 | release-score | ✅ | ✅ | ⚠️ | Timestamp ✅, thresholds ✅ (target×1). **⚠️ Dupla implementação de release score**: `shared/quality/release-score.ts:116 calculateReleaseScore` (4 dimensões) vs `shared/data-hub/compute/release-score.ts calcReleaseScore` via `DataHubImpl.computeReleaseScore` (5 dimensões, hub.ts:949). Scores divergem para mesmos inputs. |
| 12 | silent-regression | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |
| 13 | defect-trend | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2), Avg Defects ✅, Direction ✅. |
| 14 | defect-seasonality | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×3), Avg/day ✅. |
| 15 | developer-profile | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×1), ranking badges `#1` ✅. |
| 16 | requirement-score | ✅ | ✅ | ✅ | Timestamp ✅, thresholds ✅ (target×2). |

### Relatórios / Orquestradores (8)

| # | Artefato | D1 Funcional | D2 Conteúdo | D3 Forma | Evidência |
|---|----------|:---:|:---:|:---:|-----------|
| 17 | coverage-gap | ✅ | ✅ | ✅ | Renderiza HTML válido. Timestamp ✅. Compute real em `shared/data-hub/compute/coverage-gap.ts`. |
| 18 | report-html | ❌ | ✅ | ✅ | `generateHtmlReport` exige `options.computed` (report-html.ts:40,103). **Consumidores `jira_management/commands/case17.ts:369` e `e2e/gen-report-complete.ts:165` NÃO passam `computed`** → produzem página de erro ("DataHub precomputed data required"). Harness confirma: `test-report.html` = ERROR-PAGE. Testes case17.mockam `generateHtmlReport` → não detectam o defeito (coverage theater). |
| 19 | pipeline-health | ✅ | ✅ | ⚠️ | Consumido por `batch-mode.ts:445`. Renderiza 34.1KB. **⚠️ Único renderer com inline styles (6×)** + CSS custom `_PIPELINE_CSS` (pipeline-health-renderer.ts:50,161). |
| 20 | schedule-handler | ❌ | ✅ | ⚠️ | **SSOT violation sistêmica**: computa localmente via barrels `calculateReleaseScore`, `aggregateDefectTrends`, `buildTraceabilityMatrix`, `analyzeBacklogHealth`, `aggregateDefectSeasonality`, `detectSilentRegression`, `buildDeveloperProfile`, `compareAiVsManual`, `analyzeSuiteOptimization`, `computeCrossSquadBenchmark`, `calculatePipelineCost` (schedule-handler.ts:181-275) — em vez de consumir `dataHub.computed.*`. DataHub computa `defectAggregation`, `seasonalityAggregation`, `regressionDetection`, `optimizationActions`, `impactAlerts`, `incidentEvents`, `traceabilityTree`, `crossSquad`, `coverageGap`, `suiteBreakdown` (hub.ts:836-869) com **0 consumidores**. Lógica duplicada em 2 fontes de verdade. |
| 21 | interactive-mode | ✅ | ✅ | ⚠️ | Consome SSOT para `aiMetrics`/`passRate`/`flakyRate`/`coverage` ✅. **⚠️ Sub-dashboard Quality Gate (interactive-mode.ts:579) é HTML cru inline** (sem buildHtmlPage/primitives/CSS). |
| 22 | pr-report-markdown | ✅ | ✅ | ✅ | Comentário PR com 5 métricas (Pass Rate/Passed/Failed/Skipped/Duration), timestamp, seções (CI Context, Summary Table, Coverage, Failures, Diff, Quality Gate, Flaky, Data Quality, Footer). SSOT: `dataHub` obrigatório (pr-report-core.ts:645). |
| 23 | pr-report-job-summary | ✅ | ✅ | ❌ | Escrito em `$GITHUB_STEP_SUMMARY`. **⚠️ Emojis** (`:white_check_mark:`, `:x:`, `:fast_forward:`, `:clock1:`, `:warning:`, `:large_blue_diamond:`) — viola "zero emojis" do visual-checklist. |
| 24 | pr-report-html | ✅ | ✅ | ✅ | `generateHtmlReportFile` passa `computed: dataHub.computed` (pr-report-core.ts:568) — wiring SSOT correto. |

---

## 3. Achados Prioritários

### P1 — flakiness totalTests=0 (D2)
- **Causa raiz:** `shared/report/flakiness-renderer.ts:37` usa `options?.dataHub?.computed.testCounts.total ?? 0`; nenhum caller passa `options`.
- **Evidência:** output real em `reports/validation/flakiness-no-datahub.html` → Flaky Rate `0%`.
- **Consumidores afetados:** `schedule-handler.ts:409`, `batch-mode.ts:259`.
- **Correção de origem:** renderer deve receber `testCounts` obrigatoriamente (contrato), e callers devem passar `dataHub`.

### P2 — report-html produce error page em 2 consumidores (D1)
- **Causa raiz:** `case17.ts:369` e `gen-report-complete.ts:165` chamam `generateHtmlReport` sem `computed`.
- **Evidência:** harness `test-report.html` = ERROR-PAGE ("DataHub precomputed data required").
- **Cobertura theater:** `case17.test.ts` mocka `generateHtmlReport` (13×) → teste verde não detecta o defeito.

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
