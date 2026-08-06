# VALIDATION-PLAN — Validação Determinística de Artefatos

> **Status:** ATIVO (2026-08-05) · **Autoridade:** `ARTIFACT-VALIDATION.md` §0 (Decisões D1–D6, registradas 2026-08-04, autoridade explícita do usuário) + §Fase II.
>
> Este documento é o protocolo executável da validação determinística (II.1). Define **como** a reprodutibilidade é provada e **quais gates** cada artefato deve cruzar. Não define requisitos de domínio — esses permanecem no `CONTENT-SPECIFICATION`/`artifact-specs.ts`.

---

## 1. Invariante (a regra que este plano protege)

> **Determinismo:** o MESMO commit (SHA) + o MESMO comando devem produzir OUTPUTS IDÊNTICOS, provado por **sha256 dos HTML** gerados.

Consequência arquitetural (D5): nenhum renderer de report pode gerar timestamp próprio. O único ponto canônico é `resolveGeneratedAt` (`shared/date-utils.ts`), seedado pelo harness/runner (`GENERATED_AT`). `shared/__tests__/report-determinism.architecture.test.ts` é o mecanismo de segurança (AGENTS.md Rule 5) que detecta `new Date()` cru nos 19 renderers AQS — inclusive o caso cross-day (backlog-health stale age, que a prova intra-dia não detectava).

## 2. Input — fixtures commitadas (nunca dados vivos)

- **Fonte única:** `scripts/__fixtures__/artefactos/*.json` (17 fixtures tipadas) + `scripts/artifact-fixtures.ts` (`loadFixture` com validação load-time).
- **Proibido:** dados vivos de CI, timestamps de runtime, resultados de API externa como input da validação.
- O harness e o runner consomem **exclusivamente** essas fixtures. Equivalência §9 já provada (24 outputs byte-idênticos pós-normalizar timestamp, I-9.2).

## 3. Fluxo por fase

Cada fase valida o estado commitado atual. Ordem estrita:

| Passo | Ação | Comando | Detector de violação |
|---|---|---|---|
| 1 | Regenerar harness (outputs em `reports/validation/`) | `npx tsx scripts/artifact-validation-harness.ts` | `doctype=ok` para todos os `.html`; zero `ERROR-PAGE` |
| 2 | D1 — Suíte de testes completa | `npx vitest run` | falha = defeito (Rule 19.4: culpa o código, não o teste) |
| 3 | D2 — Content validation por spec | `npx vitest run shared/__tests__/artifact-content-validation.test.ts` | R8.1–R8.7 (826 linhas): métricas, seções, ações, thresholds, SSOT, timestamp, cross-validação specs↔renderers |
| 4 | D3 — Qualidade visual/conteúdo | `npx vitest run shared/__tests__/theme-tokens.test.ts shared/__tests__/report-determinism.architecture.test.ts` + checks F5 | contraste WCAG ≥ 4.5:1; zero emoji; zero hex fora de tokens; auditoria `data-*`; zero `new Date()` cru |
| 5 | **Hashes sha256** | `sha256sum reports/validation/*.html` | registrar em `VALIDATION-REPORT.md` |
| 6 | **Re-prova** | re-rodar passo 1 + 5 | hashes IDÊNTICOS aos do passo 5 = prova de reprodutibilidade |

## 4. Checks D3 em detalhe

| Check | Comando/Teste | Exceções documentadas |
|---|---|---|
| Zero inline `style=` estático | `case17-helpers.test.ts` (29 testes) | `--bar-*`/`--dim-*` dinâmicos de dados (B17) |
| Zero emoji | `case17-helpers.test.ts` + `pr-report-core.test.ts` regex unicode | `MARKDOWN_SYMBOLS` ASCII (B18) |
| Zero hex fora de tokens | `rg` hex + `theme-tokens.test.ts` | `html-factory.ts:69` fallback error-page (documentado F5-T1) |
| Contraste WCAG ≥ 4.5:1 | `theme-tokens.test.ts` | — (Primer AA medido, F5-T1) |
| Auditoria `data-*` | `report-table/report-chart/case17` testes | — |
| Zero `new Date()` cru em renderers | `report-determinism.architecture.test.ts` | — (D5) |

## 5. Scorecard (I-9.3/I-9.4)

- `npx tsx scripts/artifact-scorecard-runner.ts` → `reports/validation/artifact-scorecard.json`
- 24 specs contabilizados: **19 scoreados** + **5 unscored** (2 orquestradores `nao-aplicavel`; 3 pr-report `gate-proprio` T2).
- `overall` = mínimo das checagens; removível < 60 (I-9.5); runner exit≠0 se houver removível.

## 6. Prova de reprodutibilidade (Fase III)

1. Estado commitado final → rodar fluxo (passos 1–5) → `VALIDATION-REPORT.md` (matriz 24×3: D1/D2/D3 por artefato + sha256).
2. Re-rodar passos 1 + 5 (re-prova).
3. Hashes idênticos nas 2 rodadas = **prova de reprodutibilidade**.

## 7. Condições de encerramento (Fase IV, §6)

O `ARTIFACT-VALIDATION.md` só é marcado encerrado com as 3 condições:
(a) commits atômicos com SHA, (b) PROGRESS completo, (c) `VALIDATION-REPORT.md` com hashes.

## 8. Anti-padrões proibidos (AGENTS.md)

- ❌ Fabricar hash (Rule 25.3): 5 unscored → `N/A` explícito, nunca hash inventado.
- ❌ Validar com dados vivos de CI como input (§2).
- ❌ Enfraquecer `report-determinism.architecture.test.ts` ou suprimir `new Date()` cru.
- ❌ Declarar "CI green" literal sem rodar CI real (D6: gate local completo + declaração precisa).
- ❌ Correção de sintoma: falha em D1/D2/D3 → causa raiz no código, nunca adaptar o teste.
