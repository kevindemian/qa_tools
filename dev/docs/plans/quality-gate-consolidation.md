# Quality Gate — Consolidação (D1–D5) e Correção de Achados (F1–F2)

**Data:** 2026-08-04
**Autoridade:** instrução explícita do usuário (decisões por superioridade técnica e segurança; tempo/esforço não são variáveis).
**Regime:** modo build ativo após aprovação do plano consolidado.

---

## Contexto

O sistema possuía múltiplas representações de "gate" com semânticas sobrepostas, criando
dupla contagem, inconsistência de apresentação e violações de §25/§7. Este documento é o
registro dedicado dos achados e do plano de correção na origem.

Invariantes-alvo:

1. Health = **medição** (`health-score.ts` intacto); `runQualityGate` = **decisão**/enforcement.
2. A regra do gate-de-dimensões é implementada **uma única vez** (`evaluateQualityGate` →
   `health.qualityGate`), nunca reimplementada no gate composto (§6).
3. Cada preocupação conta **1x** no score agregado (correção de dupla pesagem); média de checks
   não-`unknown`; **sem pesos inventados** (§1).
4. "Quality Gate" = **um único significado** por artefato: o gate composto (§5).
5. A seção de gate do HTML do PR existe ⇔ o gate composto rodou (§5).
6. Dados ausentes sempre explícitos (§25): dimensões não-finito → `N/A`; categorias ausentes →
   `incompleteItems` renderizado.

---

## Achados

### F1 — Incoerência status/score/threshold nas checks de categoria (EIXO C)

**Local:** `shared/quality/quality-gate.ts` `_buildCategoryChecks` (evidenciado ~linha 208-230).
**Defeito:** uma categoria **válida** emitia `status: 'pass'` com `score = confidence*100`
geralmente `< threshold: 100` (ex.: `PASS (54/100)`). Contradição interna (§5, §24-25): o
leitor não distingue pass real de pass degradado.

**Investigação de autoridade (algórica):**
- `shared/quality/data-quality.ts` `deriveStatus` (linha 105-109): o status EIXO-C é derivado
  **somente de validade** (`allValid`); `minConfidence` (linha 20-21) é **awareness/metadata**,
  não gate. `_buildCategoryChecks` já seguia esse contrato (status = validade).
- `shared/validation/pipeline-validator.ts` P-01 (`confidence ≥ 0.6`, linha 45): pertence a outra
  entidade de domínio (classificação de pipeline), **não** à proveniência de categoria. Aplicá-la
  às categorias seria inferência entre domínios **proibida por §1**.

**Conclusão (decisão):** gating por confiança **rejeitado** por falta de autoridade. A correção na
origem da incoerência é tornar `score` coerente com `status` (validade binária) e manter a
confiança como **metadata explícita** em `details` — mesma semântica de `data-quality.ts`.

**Correção (F1):**
- `score = valid ? 100 : 0`
- `status = valid ? 'pass' : 'fail'` (inalterado)
- `threshold = 100` (inalterado)
- `details` mantém confiança (ex.: `... confidence 54%`)

**Decisão do gate:** inalterada (`overall`). Caso comum (confiança 1 ou inválido) idêntico.

### F2 — `incompleteItems` invisível na UI

**Local:** `buildQualityGateSection` (`shared/report/report-sections.ts`), `buildQGCHeckSummary`/
`renderQualityGateChecksTable` (`shared/pr-report-core.ts`), `formatQualityGateText`
(`shared/quality/quality-gate.ts`).
**Defeito:** categorias de dados ausentes (parte do contrato EIXO C / `incompleteItems`) não eram
exibidas (§25: ausência deve ser explícita). O JSON já as incluía.

**Correção (F2):** renderizar `incompleteItems` (quando não-vazio) nos três renderizadores de UI
(HTML / markdown / console). Consistente entre artefatos; aproveita o result composto já fluindo ao
HTML via D2.

---

## Decisões

### D1 — `runQualityGate`: dupla checagem → check único `health-score`

**Evidência:** `evaluateQualityGate` (`health-score.ts:145-185`) já agrega as 5 dimensões com
thresholds **estritos** (`MAX_FLAKY_GATE=5%`, `MAX_SUITE_SPEED_GATE=3000ms`,
`MIN_EXECUTION_RATE_GATE=80%`, `MIN_PASS_RATE_GATE=80%`, `MIN_COVERAGE_GATE=70%`). Os checks
individuais de `quality-gate.ts` usavam thresholds **folgados** (`MAX_FLAKY_PCT=30`,
`MAX_SUITE_SPEED=8s`) ou idênticos (pass-rate/coverage). Logo eram **dominados** pelo health gate:
nunca falhavam quando ele passava, mas **pesavam 2x** na média do score. `_flakyCheck` (`?? 0`,
linha 105) e `_suiteSpeedCheck` (`?? 0`, linha 132) mascaravam dados ausentes como pass (§25).

**Correção (D1):**
- `_buildChecks` → adiciona apenas `_healthCheck(health)`.
- Remover `_passRateCheck`, `_flakyCheck`, `_coverageCheck`, `_suiteSpeedCheck` e `_availableStatus`.
- `_healthCheck.details` = breakdown das 5 dimensões derivado **somente** de `health.dimensions.*`
  (score/available/threshold; não-finito → `N/A`, nunca `0`).
- `THRESHOLDS` → apenas `minHealthScore` (D4 para constantes órfãs).

**Equivalência de decisão preservada; efeito colateral intencional:** score agregado deixa de
pesar dimensões 2x (correção de medição, §1 sem regra de domínio para peso duplo).

### D2 + D3 — PR report: semântica única de gate + supressão em `skipQuality`

**Changed files:**
- `shared/report/report-types.ts` → novo `qualityGateResult?: QualityGateResult` (opcional).
- `shared/report/report-html.ts` `generateHtmlReport` → se `qualityGateResult` presente, renderiza
  o composto; senão, se `qualityGate` (número) presente, fallback `toQualityGateResult`; senão,
  **sem seção de gate**.
- `shared/pr-report-core.ts`:
  - `handleQualityGate` passa a **retornar `QualityGateResult | undefined`**.
  - Call site: `const qgResult = await handleQualityGate(...); if (qgResult) sections.push(buildQualityGateSection(qgResult))`.
  - `generateHtmlReportFile` recebe `qgResult?`; `htmlOptions` seta `qualityGateResult` e **nunca**
    o número → invariante: a seção de gate do HTML do PR existe ⇔ o gate composto rodou
    (consistência com o markdown, que já omitia a seção em `skipQuality`).

**Producers não-PR** sem DataHub composto (case17, failure-analysis, artifact-harness) mantêm o
fallback pass-rate-only via `qualityGate` — classe distinta e legítima (não shim).

### D4 — Limpeza de constantes órfãs (condicionada a evidência)

Após D1, rodar grep (produção e testes) de `MAX_FLAKY_PCT`, `MAX_SUITE_SPEED`, `MIN_COVERAGE`,
`MIN_PASS_RATE`. Remover de `thresholds.ts` **somente** as com zero referências. Sabe-se que
`MIN_PASS_RATE` (usado em `pr-report-core.ts` e `report-sections.ts`) e `MIN_HEALTH_SCORE`
(mantido em D1) permanecem; `MIN_COVERAGE` depende de verificação (provável uso em
`impact-analysis.ts`).

### D5 — Desambiguar rótulo do badge de health

**Local:** `shared/report/report-sections.ts` `buildHealthSection` (`Quality Gate: ${qc.text}` → `Health Gate: ${qc.text}`).
**Motivo:** após D1, o valor `health.qualityGate` já aparece como check `health-score` no gate
composto. Manter o rótulo "Quality Gate" na seção health criaria dois rótulos com o mesmo valor.
"Health Gate" descreve o sub-status informacional; "Quality Gate" passa a ser **um único**
significado (o composto). Sem mudança de lógica.

---

## Registro de Decisões de Autoridade

- **Gating por confiança nas categorias:** REJEITADO por falta de autoridade de domínio (ver F1).
  Confiança permanece metadata. Nenhum threshold foi inventado (§1).
- **Score agregado (dupla pesagem):** corrigido por D1 — não há regra de domínio que justifique
  peso duplo das mesmas dimensões (§1).
- **Health não muda** (D3): medição e decisão permanecem abstrações separadas.

---

## Testes

**Atualizados (mesma semântica de domínio; §19.5 — só decomposição/render, expected values de
domínio preservados):**
- `shared/__tests__/quality-gate.test.ts` — lookups `'pass-rate'`/`'flaky-rate'` → `'health-score'`/agregado.
- `shared/__tests__/integration/quality-gate.integration.test.ts` — `toHaveLength(5)` → nova composição; comentário.
- `shared/__tests__/report-html.test.ts`, `report-generator.test.ts`,
  `integration/report-html.integration.test.ts` — `'Quality Gate: Pass'` → `'Health Gate: Pass'` (health, D5).

**Novos (test-first §19), incluindo integração/sistema/e2e e edge/negative:**
- D1: checks finais (`health-score`, `data-quality:*`, `metrics-data`, `error`); `details` com breakdown e `N/A` para não-finito.
- F1: categoria válida com confiança baixa → `status 'pass'`, `score 100`, confiança em details.
- D2/D3: `generateHtmlReport` com `qualityGateResult` renderiza o composto; PR `skipQuality` → HTML **sem** seção de gate; sem `skipQuality` → com gate composto.
- F2: `incompleteItems` renderizado nos 3 renderizadores.

---

## Validação

1. `npx vitest run` local — 100% de sucesso.
2. Coverage gate global: lines 90 / functions 91 / branches 80 / statements 90 (`vitest.config.ts`).
3. `npx tsc --noEmit` (0 erros); lint.
4. Push via `gh` timeout ≥ 300s; monitorar CI via GitHub API (AGENTS §13).

## Fora desta iteração (não-findings, limites de escopo)
- `health-score.ts` intacto (D3, acordado).
- Verificação de consumo de constantes para D4 (passo de verificação, não correção).