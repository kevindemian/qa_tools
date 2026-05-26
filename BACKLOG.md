# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## ✅ Concluídos (sessões anteriores)

| Item                     | Status | Observação                              |
| ------------------------ | ------ | --------------------------------------- |
| AUDIT-15 (TTL cache)     | ✅     | llm-client.ts                           |
| AUDIT-16 (retry cleanup) | ✅     | http-client.ts                          |
| AUDIT-14 (Record→intf)   | ✅     | 84 ocorrências                          |
| Fase 6 — LLM + Reports   | ✅     | report-generator, metrics, case17/18/19 |
| AUDIT-20 Fase 0          | ✅     | ESLint rules                            |
| AUDIT-20 Fase 1          | ✅     | catch chains, empty catch               |
| AUDIT-20 Fase 2          | ✅     | 17 dead exports removidos, 2 restored   |
| AUDIT-20 Fase 3          | ✅     | 16 funções quebradas ≤50 linhas         |
| AUDIT-20 Fase 5          | ✅     | 51 magic numbers → constantes           |
| AUDIT-20 Fase 7          | ✅     | Full verification                       |
| FEAT-21                  | ✅     | File path tab-completion                |

---

## 🔷 Pendentes

### Missing Return Types ✅ (24 adicionados nesta sessão)

| Arquivo            | Funções                                                                                                                                                                     | Status |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `session-state.ts` | `setCurrentProvider`, `setCurrentProjectName`, `setProjectId`, `setIsBusy`, `setManager`, `pushHistory`, `printSessionSummary`, `displayProjects`, `displayRecentPipelines` | ✅     |
| `main.ts`          | `handleHelp`, `handleShowHistory`, `main`                                                                                                                                   | ✅     |
| `ui-helpers.ts`    | `handleHelp`, `handleShowHistory`                                                                                                                                           | ✅     |
| `test-results.ts`  | `downloadTestArtifacts`, `parseTestResults`, `createTestExecution`, `collectTestResults`                                                                                    | ✅     |

### Unused locals/params (produção) ✅ (14 removidos)

Removidos: `sourceBranch`/`targetBranch` de `updateMergeRequest` (github_manager, gitlab_manager), `ctx` de 8 handlers (mr-handler, pipeline-handler, schedule-handler), `m` de `handleChangeProject`, `tier` → `_tier` em `llm-metrics.ts`.

### Dead export `getProvidersConfig` ✅ (removido — wrapper redundante)

### Prevenção ✅

| Mecanismo                               | Onde               | Status        |
| --------------------------------------- | ------------------ | ------------- |
| `noUnusedLocals` + `noUnusedParameters` | `tsconfig.json`    | ✅            |
| `ts-prune` como devDependency           | `package.json`     | ✅            |
| `no-console` ESLint (`error`)           | `eslint.config.js` | ✅ (já ativo) |

### R1: Testes — todos os handlers já cobertos ✅

| Grupo | Arquivos               | Status | Observação                                   |
| ----- | ---------------------- | ------ | -------------------------------------------- |
| A-D   | `handlers.test.ts`     | ✅     | Todos os 16 handlers já testados (case01–16) |
| E     | `shared/temp-dir.ts`   | ✅     | 11 testes                                    |
| D     | `index.ts`             | ✅     | 4 testes (`getHandler`)                      |
| —     | `git-provider-base.ts` | ✅     | 5 testes (novo)                              |

**context.ts** — pure interface, sem lógica executável. Excluído por pragmatismo (R1 aplicado com bom senso).

### DRY: HTTP methods duplicados ✅

`_get`/`_post` extraídos para `GitProviderBase` (`git_triggers/git-provider-base.ts`). `GitHubManager` e `GitLabManager` extendem a classe base. `_patch`/`_put` mantidos nos respectivos providers.

---

## 🔷 Plano de Melhorias — 4 Fases

**Data:** 2026-05-26
**Esforço total:** ~7h

| Fase | Descrição                                                                           | Status | Esforço |
| ---- | ----------------------------------------------------------------------------------- | ------ | ------- |
| 1    | CI hardening (thresholds, eslint, ts-prune) + remove docs-archive                   | ✅     | 15 min  |
| 2    | `noUncheckedIndexedAccess` tsconfig (173 prod errors)                               | 🔴     | 4h      |
| 3    | Branch coverage (6 files: splash, report-generator, github_manager, gitlab_manager) | ✅     | 2.5h    |
| 4    | Lazy `require('fs')` → `import` em temp-dir.ts                                      | ✅     | 20 min  |

### Fase 1 — Prevenção imediata

| Item | O que                                                                                 | Esforço |
| ---- | ------------------------------------------------------------------------------------- | ------- |
| 1a   | Bump coverage thresholds: statements 88, branches 78, functions 85, lines 90          | 2 min   |
| 1b   | Adicionar `npx eslint . --ext .ts` ao CI (GitHub + GitLab)                            | 5 min   |
| 1c   | Adicionar `npx ts-prune -p tsconfig.json` ao CI (warn-only)                           | 5 min   |
| 1d   | Remover `docs-archive/` + script `docs` do package.json + `docs/` do tsconfig include | 3 min   |

### Fase 2 — `noUncheckedIndexedAccess` (layer order)

| Layer | Arquivos                                            | Erros |
| ----- | --------------------------------------------------- | ----- |
| 2a    | `shared/*.ts` (produção)                            | ~25   |
| 2b    | `git_triggers/*.ts` (produção)                      | ~50   |
| 2c    | `jira_management/*.ts` (produção)                   | ~40   |
| 2d    | `*.test.ts` (todos)                                 | ~110  |
| 2e    | Ativar `noUncheckedIndexedAccess: true` no tsconfig | —     |

### Fase 3 — Branch coverage (paralelo)

| Arquivo                          | Branch atual | Meta |
| -------------------------------- | ------------ | ---- |
| `shared/splash.ts`               | 65.78%       | ≥80% |
| `shared/temp-dir.ts`             | 66.66%       | ≥80% |
| `shared/report-generator.ts`     | 71.87%       | ≥80% |
| `shared/prompt-input.ts`         | 72.97%       | ≥80% |
| `git_triggers/github_manager.ts` | 74%          | ≥80% |
| `git_triggers/gitlab_manager.ts` | 72.72%       | ≥80% |

### Fase 4 — Lazy `require('fs')`

| Item | O que                                                |
| ---- | ---------------------------------------------------- |
| 4a   | Substituir `require('fs')` por `import * as fs`      |
| 4b   | Remover eslint-disable no-require-imports            |
| 4c   | Atualizar temp-dir.test.ts p/ usar `jest.mock('fs')` |

---

## 🔷 WEB_STYLE.md (ADIADA)

**Prioridade:** P3

**Problema:** `WEB_STYLE.md` descreve uma interface web, nunca implementada.

**Solução proposta:** Se houver demanda, implementar como SPA standalone.

---

## 🎨 UI/UX Refinement Plan (Lote 8)

| ID   | Item                                                      | Fase | Status                    |
| ---- | --------------------------------------------------------- | ---- | ------------------------- |
| UX-1 | Theme System & Style Guide (`theme.ts`, `STYLE_GUIDE.md`) | I    | ✅ Done                   |
| UX-2 | Baseline Snapshots (TUI + HTML report)                    | I    | ✅ Done                   |
| UX-3 | TUI: Refactor `box.ts` to consume theme                   | II   | ✅ Done                   |
| UX-4 | TUI: Action Search no menu Jira                           | II   | ✅ Done                   |
| UX-5 | Reports: Consume theme, add Failed Summary + toggle       | III  | ✅ Done                   |
| UX-6 | TUI: Atalho `[D]etails` para erros não mapeados           | IV   | ✅ Done (já implementado) |

**Summary:** All UI/UX refinement tasks completed. Lote 8: 6/6 ✅

---

## 🤖 LLM Integration Refinement (Lote 9)

**Premissa:** Tiers gratuitos (Groq free 30 req/min, Gemini free 60 req/min, OpenRouter free).
**Critérios:** Pareto — segurança > prompts > validação > performance > testes > UX.

### Lote 9.1 — Segurança e Higiene (P0)

| #     | Item                                              | Prio | Status  |
| ----- | ------------------------------------------------- | ---- | ------- |
| LLM-1 | `shared/sanitize.ts` — sanitização de secrets/PII | P0   | ✅ Done |
| LLM-2 | Aplicar sanitização nos 4 callers                 | P0   | ✅ Done |
| LLM-3 | Prompt injection protection (delimiters)          | P2   | ✅ Done |
| LLM-4 | Gemini API key: URL → `X-Goog-Api-Key` header     | P3   | ✅ Done |
| LLM-5 | Sanitizar error body antes de logar               | P4   | ✅ Done |

### Lote 9.2 — Prompt Engineering (foco principal)

| #     | Item                                                      | Prio | Status  |
| ----- | --------------------------------------------------------- | ---- | ------- |
| LLM-6 | `failure-analysis.md`: JSON schema, remover contradição   | P1   | ✅ Done |
| LLM-7 | `user-story-to-tests.md`: adicionar JSON schema           | P2   | ✅ Done |
| LLM-8 | `case18.ts`: template como system, story como user        | P2   | ✅ Done |
| LLM-9 | Schema injetado programaticamente (user msg simplificada) | P2   | ✅ Done |

### Lote 9.3 — Infra Free-tier

| #      | Item                                                 | Prio | Status  |
| ------ | ---------------------------------------------------- | ---- | ------- |
| LLM-10 | Default model: 8K→128K (`llama-3.1-8b-instant`)      | P1   | ✅ Done |
| LLM-11 | Sliding window rate limiter + jitter + `Retry-After` | P1   | ✅ Done |
| LLM-12 | Circuit breaker: 5 consec 429 → break 30s            | P2   | ✅ Done |

### Lote 9.4 — Resiliência

| #      | Item                         | Prio | Status  |
| ------ | ---------------------------- | ---- | ------- |
| LLM-13 | Fallback chain multi-tier    | P0   | ✅ Done |
| LLM-14 | Caller identity no cache key | P1   | ✅ Done |

### Lote 9.5 — Validação

| #      | Item                                 | Prio | Status  |
| ------ | ------------------------------------ | ---- | ------- |
| LLM-15 | `classifyFailure()`: regex + 1 retry | P0   | ✅ Done |
| LLM-16 | `case18()`: JSON.parse + 1 retry     | P0   | ✅ Done |
| LLM-17 | Confidence mapping: regex `\b`       | P3   | ✅ Done |

### Lote 9.6 — Testes

| #      | Item                                 | Prio | Status                         |
| ------ | ------------------------------------ | ---- | ------------------------------ |
| LLM-18 | Integration tests env-gated          | P2   | ✅ Done                        |
| LLM-19 | Token usage tracking                 | P4   | ⬜ Low prio (não implementado) |
| LLM-20 | Deprecation warning for `small` tier | P4   | ✅ Done                        |

### Lote 9.7 — UX

| #      | Item                                             | Prio | Status  |
| ------ | ------------------------------------------------ | ---- | ------- |
| LLM-21 | Spinner para `reviewWithLlm`                     | P2   | ✅ Done |
| LLM-22 | Comentário "diverse reviewer" no `llm-review.ts` | P2   | ✅ Done |

**Progresso:** 21/22 ✅ (LLM-19 token tracking — P4, não implementado por ser baixa prioridade e custo zero em tiers free)

---

## 🔬 LLM Integração — Auditoria Profunda (Lote 10)

**Objetivo:** Elevar nota da auditoria de 5.2/10 para >9/10 com foco em **qualidade dos artefatos produzidos** (casos de teste, análises, relatórios).

### Fase 1 — Segurança + Prompts (5 arquivos, paralelo total)

| #     | Item                                                               | Prio | Arquivo                                                    | Status                 |
| ----- | ------------------------------------------------------------------ | ---- | ---------------------------------------------------------- | ---------------------- |
| L10-1 | Sanitizar `userMsg` em `case18.ts` (via primária + retry)          | P0   | `jira_management/commands/case18.ts`                       | ✅ Done                |
| L10-2 | Sanitizar `buildPrompt` em `run-comparison.ts`                     | P2   | `shared/run-comparison.ts`                                 | ✅ Done                |
| L10-3 | Few-shot examples em `failure-analysis.md`                         | P2   | `shared/prompts/failure-analysis.md`                       | ✅ Done                |
| L10-4 | Few-shot examples em `user-story-to-tests.md`                      | P2   | `shared/prompts/user-story-to-tests.md`                    | ✅ Done                |
| L10-5 | `classify.md`: explicitar "exactly one line" + fix regex           | P2   | `shared/prompts/classify.md`, `shared/failure-analysis.ts` | ✅ Done                |
| L10-6 | Melhorar metaprompt do reviewer p/ sugerir melhorias concretas     | P2   | `shared/llm-review.ts`                                     | ✅ Done                |
| L10-7 | Verificar conflito `response_format: json_object` vs prompt manual | P2   | `shared/llm-client.ts`                                     | ✅ Done (sem conflito) |

### Fase 2 — Core da LLM Client (infra + corretude, 1 arquivo)

| #      | Item                                                   | Prio | Arquivo                                        | Status  |
| ------ | ------------------------------------------------------ | ---- | ---------------------------------------------- | ------- |
| L10-8  | Circuit breaker: reset só no primário (`i === 0`)      | P0   | `shared/llm-client.ts`                         | ✅ Done |
| L10-9  | Rate limiter thread-safe (per-tier lock)               | P0   | `shared/llm-client.ts`                         | ✅ Done |
| L10-10 | HTTP timeout com AbortController (30s)                 | P1   | `shared/llm-client.ts`                         | ✅ Done |
| L10-11 | Cache key incluir model + temperature + responseFormat | P1   | `shared/llm-client.ts`                         | ✅ Done |
| L10-12 | Rate limit configurável via `LLM_RATE_LIMIT` env       | P1   | `shared/llm-client.ts`, `shared/config.ts`     | ✅ Done |
| L10-13 | `parseRetryAfter` lidar com formato data (RFC 7231)    | P3   | `shared/llm-client.ts`                         | ✅ Done |
| L10-14 | Circuit success decrementar em vez de deletar          | P2   | `shared/llm-client.ts`                         | ✅ Done |
| L10-15 | Remover tier `small` do type + código                  | P4   | `shared/llm-client.ts`                         | ✅ Done |
| L10-16 | Report fallback pular main quando config === main      | P2   | `shared/llm-client.ts`, `shared/llm-review.ts` | ✅ Done |

### Fase 3 — Validação semântica (qualidade dos artefatos)

| #      | Item                                                                 | Prio | Arquivo                              | Status  |
| ------ | -------------------------------------------------------------------- | ---- | ------------------------------------ | ------- |
| L10-17 | `case18.ts`: validar conteúdo (steps.length, expectedResult.length)  | P2   | `jira_management/commands/case18.ts` | ✅ Done |
| L10-18 | `report-validator.ts`: regra de consistência severity+recommendation | P2   | `shared/report-validator.ts`         | ✅ Done |
| L10-19 | `llm-metrics.ts`: rastrear artifactApprovedCount/rejectedCount       | P3   | `shared/llm-metrics.ts`              | ✅ Done |
| L10-20 | `classifyFailure`: fallback UNKNOWN após 2 falhas de regex           | P2   | `shared/failure-analysis.ts`         | ✅ Done |

### Fase 4 — Infra/config + isolamento de testes

| #      | Item                                                  | Prio | Arquivo                          | Status  |
| ------ | ----------------------------------------------------- | ---- | -------------------------------- | ------- |
| L10-21 | Exportar `resetRateLimiter()` + `resetCircuitState()` | P2   | `shared/llm-client.ts`           | ✅ Done |
| L10-22 | Teste de integração JSON response format              | P2   | `shared/llm-integration.test.ts` | ✅ Done |

### Fase 5 — Testes unitários de infra

| #      | Item                                                  | Prio | Arquivo                           | Status  |
| ------ | ----------------------------------------------------- | ---- | --------------------------------- | ------- |
| L10-23 | Rate limiter: 3 testes (allow, deny, clear)           | P2   | `shared/llm-client.test.ts`       | ✅ Done |
| L10-24 | Circuit breaker: 4 testes (open, block, clear, reset) | P2   | `shared/llm-client.test.ts`       | ✅ Done |
| L10-25 | Testes de sanitização p/ case18 + run-comparison      | P2   | `shared/sanitize.test.ts`         | ✅ Done |
| L10-26 | Mutation tests do `classifyRegex` com entradas borda  | P2   | `shared/failure-analysis.test.ts` | ✅ Done |

### Fase 6 — Golden dataset / benchmark (opcional)

| #      | Item                                               | Prio | Arquivo                                                   | Status  |
| ------ | -------------------------------------------------- | ---- | --------------------------------------------------------- | ------- |
| L10-27 | Criar fixtures de referência e script de benchmark | P4   | `shared/prompts/__fixtures__/`, `shared/llm-benchmark.ts` | ✅ Done |

## 🎨 UI/UX Audit — Score 6.5→9.0 (Lote 11)

**Data:** 2026-05-26
**Esforço total:** ~5.5h
**Score alvo:** 9.0/10

| Fase | Descrição                                                   | Status | Esforço |
| ---- | ----------------------------------------------------------- | ------ | ------- |
| A    | `result_parser`: CTRF parser + dispatch + fixtures + testes | ✅     | 1.5h    |
| B    | `report-generator`: 9 fixes CSS/render + testes             | ✅     | 2.5h    |
| C    | `prompt-ui`: error fallback com status/url                  | ✅     | 0.3h    |
| D    | `case17` + `failure-analysis`: metadados no footer          | ✅     | 0.3h    |
| E    | Type check + validação final (0 erros, 100% pass)           | ✅     | 0.2h    |

### Fase A — CTRF co-existence (result_parser)

| #     | Item                                             | Prio | Status  |
| ----- | ------------------------------------------------ | ---- | ------- |
| UX-7  | `CtrfData` types + `parseCtrfResults()`          | P1   | ✅ Done |
| UX-8  | `detectFormat()` + `parseTestResults()` dispatch | P1   | ✅ Done |
| UX-9  | Fixture `ctrf-report.json` (e2e)                 | P2   | ✅ Done |
| UX-10 | Testes CTRF (14 testes)                          | P2   | ✅ Done |
| UX-11 | `FlatTest` ganha `fullTitle?: string`            | P2   | ✅ Done |

### Fase B — Report renderer (report-generator)

| #     | Item                                                      | Prio | Status  |
| ----- | --------------------------------------------------------- | ---- | ------- |
| UX-12 | WCAG AA: footer `#4b5563`, labels `#4b5563`, th `#4b5563` | P0   | ✅ Done |
| UX-13 | Coluna erro na tabela (truncado 120 chars) + tooltip full | P0   | ✅ Done |
| UX-14 | Toggle condicional (só se `stats.passed > 0`)             | P1   | ✅ Done |
| UX-15 | Skipped → "—" em vez de "0s"                              | P2   | ✅ Done |
| UX-16 | Footer com timestamp + source + branch (auto env vars)    | P0   | ✅ Done |
| UX-17 | Dark mode: `@media (prefers-color-scheme: dark)`          | P1   | ✅ Done |
| UX-18 | Chart SVG labels text em barras > 20px                    | P2   | ✅ Done |
| UX-19 | Zebra striping + hover fix                                | P2   | ✅ Done |
| UX-20 | `border-left` → `box-shadow inset` (radius fix)           | P2   | ✅ Done |

### Fase C — TUI error fallback

| #     | Item                                            | Prio | Status  |
| ----- | ----------------------------------------------- | ---- | ------- |
| UX-21 | `extractErrorMessage` incluir status code + URL | P1   | ✅ Done |

### Fase D — Metadata propagation

| #     | Item                                                   | Prio | Status  |
| ----- | ------------------------------------------------------ | ---- | ------- |
| UX-22 | `case17.ts`: passar `generatedAt` + `source`           | P2   | ✅ Done |
| UX-23 | `failure-analysis.ts`: passar `generatedAt` + `source` | P2   | ✅ Done |

---

---

## 🔧 Simplificação Estrutural — Lote 12

**Data:** 2026-05-26
**Score atual:** 9.3/10
**Foco:** Reduzir duplicação + complexidade acidental. Zero mudança de comportamento.

| Fase | Descrição                                                           | Status | Esforço |
| ---- | ------------------------------------------------------------------- | ------ | ------- |
| A    | `result_parser.ts`: `readAndParse` + `EMPTY_PARSE_RESULT` + limpeza | ⬜     | 0.5h    |
| B    | `llm-client.ts`: remover async lock desnecessário                   | ⬜     | 0.2h    |
| C    | `prompt-ui.ts`: helper `_log` para 5 funções duplicadas             | ⬜     | 0.3h    |
| D    | JSDoc nas 5 APIs públicas críticas                                  | ⬜     | 0.5h    |
| E    | Type check + testes + commit                                        | ⬜     | 0.2h    |

### Findings registrados (auditoria de simplificação)

#### 🔴 Alto impacto (100–250 linhas, risco baixo)

| #   | Onde                                       | Problema                                                                        | Solução                                 | Eco  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------- | ---- |
| S1  | `config.ts:108-424`                        | 37 instance getters + 37 static delegators (~230 linhas)                        | Proxy `[[Get]]` ou geração programática | ~200 |
| S2  | `result_parser.ts:193-221`                 | `parseTestResultsFile` e `parseCypressResults` = mesmo código, parser diferente | Função `readAndParse(filePath, parser)` | ~25  |
| S3  | `result_parser.ts` + `report-generator.ts` | Objeto vazio `{tests:[], stats:{...}}` repetido 5x                              | Constante `EMPTY_PARSE_RESULT`          | ~20  |
| S4  | `prompt-ui.ts:51-74`                       | 5 funções (`success`,`error`,`warn`,`info`,`helpLine`) 90% idênticas            | Helper `_log(level, msg)` + lookup      | ~30  |
| S5  | `llm-client.ts:251-271`                    | Async lock (`_rateLocks`) em operação síncrona (Node single-threaded)           | Remover lock                            | ~12  |

#### 🟡 Médio impacto (10–30 linhas, risco médio)

| #   | Onde                          | Problema                                       | Solução                                           |
| --- | ----------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| S6  | `report-generator.ts:154-156` | `generateHtmlReport` = wrapper 1-liner         | Consolidar                                        |
| S7  | `failure-analysis.ts:34-37`   | `analyzeFailures` wrapper descarta HTML report | Remover, callers usam `analyzeFailuresWithReport` |
| S8  | `llm-client.ts:67-145`        | 6 funções de tier config quase idênticas       | Tabela `Record<LlmTier, ProviderConfig>`          |
| S9  | `main.ts:235-692`             | `(loadState() as StateSchema)` repetido 11x    | `loadTypedState()` em `state.ts`                  |
| S10 | `result_parser.ts:96`         | final `\|\| undefined` redundante              | Remover                                           |

#### 🟢 Baixo impacto (<10 linhas, refatoração cosmética)

| #   | Onde                        | Solução                                                        |
| --- | --------------------------- | -------------------------------------------------------------- |
| S11 | `report-generator.ts:263`   | `for (let i...)` com `tests[i]!` → `for (const t of tests)`    |
| S12 | `report-generator.ts:197`   | Ternário aninhado confidence → `Record<string, string>` lookup |
| S13 | `result_parser.ts:128-130`  | 3× `.filter().length` → 1 `reduce`                             |
| S14 | `failure-analysis.ts:78-89` | Retry manual → `for` loop com array de tentativas              |

### Sprint atual (Lote 12)

| #   | Item                                           | Prio | Status                                  |
| --- | ---------------------------------------------- | ---- | --------------------------------------- |
| S2  | `readAndParse` helper (result_parser.ts)       | P1   | ✅ Done                                 |
| S3  | `EMPTY_PARSE_RESULT` constante                 | P1   | ✅ Done                                 |
| S5  | Remover async lock (llm-client.ts)             | P1   | ✅ Done                                 |
| S4  | `_log` helper (prompt-ui.ts)                   | P1   | ✅ Done                                 |
| J1  | JSDoc em `types.ts` (interfaces públicas)      | P2   | ✅ Done                                 |
| J2  | JSDoc em `result_parser.ts` (exports)          | P2   | ✅ Done                                 |
| J3  | JSDoc em `report-generator.ts` (exports)       | P2   | ✅ Done                                 |
| J4  | JSDoc em `llm-client.ts` (funções públicas)    | P2   | ✅ Done                                 |
| J5  | JSDoc em `jira_resource.ts` (métodos públicos) | P2   | ✅ Done                                 |
| S6  | Consolidar `generateHtmlReport` wrapper        | P2   | ⬜ Postergado — manter export p/ compat |

---

**Progresso geral:** 27/27 ✅ + 17/17 UX ✅ + 9/14 Simplificação
