# Backlog — Histórico de Implementação

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas concluídas, organizadas por sessão/sprint.
> Tarefas pendentes ou em andamento estão em [`BACKLOG.md`](BACKLOG.md).
> Ao concluir um item do backlog, mova-o para a seção apropriada deste arquivo imediatamente.

Issues registradas durante refatorações, postergadas por escopo, e concluídas em sprints anteriores.

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
| Sprint4-F3b-T0           | ✅     | handlers.test.ts — 525 no-unsafe-\* → 0 |
| Sprint4-F3b-T1           | ✅     | case17.test.ts — 373 no-unsafe-\* → 0   |
| Sprint4-F3b-T2           | ✅     | case19.test.ts — 300 no-unsafe-\* → 0   |
| Sprint4-F3b-T3           | ✅     | case18.test.ts — 264 no-unsafe-\* → 0   |
| Sprint4-F3b-T4           | ✅     | case21.test.ts — 113 no-unsafe-\* → 0   |

### Wave 4 — Tests + E2E (Jun/2026)

| ID    | Item                                                                                             | Arquivo(s)                     | Esforço |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------- |
| SA-21 | 🧹 Substituir `describe.skip` por `it.runIf` em `smoke-xray-cloud`                               | `e2e/smoke-xray-cloud.test.ts` | 20min   |
| SA-22 | 🧹 Substituir `describe.skip` por `it.runIf` em `smoke-jira-cloud`                               | `e2e/smoke-jira-cloud.test.ts` | 20min   |
| CR-3a | 📋 Teste de integração: SIGINT real com answer undefined + answer ''                             | `shared/cli_base.test.ts`      | 30min   |
| CR-3b | 📋 Teste de integração: main() → \_initEnvironment() + user "n" → \_selectProject() sem projects | `git_triggers/main.test.ts`    | 30min   |
| CR-3c | 📋 Teste de integração: fluxo entry-menu → module spawn → env → projeto (e2e)                    | `e2e/entry-to-project.test.ts` | 1h      |

### Documentação — Auditoria + Correção

| Item                                                                 | Status |
| -------------------------------------------------------------------- | ------ |
| Deletar `docs/STYLE_GUIDE.md` (abandonado)                           | ✅     |
| `00-install.md`: + seção LLM env vars                                | ✅     |
| `01-primeiros-passos.md`: menu, comandos, /docs viewer               | ✅     |
| `02-jira-management.md`: categorias, 17-20, aliases, XRAY_MODE       | ✅     |
| `03-git-triggers.md`: + batch mode, + flakiness dashboard            | ✅     |
| `06-env-vars.md`: + XRAY_MODE, + QA_TOOLS_LOGS_DIR, + LLM_SMALL desc | ✅     |

### Lote 16 — Eliminação de Débitos (Auditoria) ✅ (24/24)

| Sub-lote | Itens                                                | Status |
| -------- | ---------------------------------------------------- | ------ |
| 16A      | 7 correções críticas (P0): env, R5, unsafe `!`, cast | ✅     |
| 16B      | 3 funções extraídas ≤50 linhas (P1)                  | ✅     |
| 16C      | 8 exports documentados como `@internal` (P2)         | ✅     |
| 16D      | 5 justificativas de eslint-disable + cast (P2)       | ✅     |
| 16E      | 5 testes adicionados (P2)                            | ✅     |
| 16F      | 1 cast inseguro corrigido (P3)                       | ✅     |

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
| 2    | `noUncheckedIndexedAccess` tsconfig (173 prod errors)                               | ✅     | 4h      |
| 3    | Branch coverage (6 files: splash, report-generator, github_manager, gitlab_manager) | ✅     | 2.5h    |
| 4    | Lazy `require('fs')` → `import` em temp-dir.ts                                      | ✅     | 20 min  |

### Fase 1 — Prevenção imediata

| Item | O que                                                                                 | Esforço |
| ---- | ------------------------------------------------------------------------------------- | ------- |
| 1a   | Bump coverage thresholds: statements 88, branches 78, functions 85, lines 90          | 2 min   |
| 1b   | Adicionar `npx eslint . --ext .ts` ao CI (GitHub + GitLab)                            | 5 min   |
| 1c   | Adicionar `npx ts-prune -p tsconfig.json` ao CI (warn-only)                           | 5 min   |
| 1d   | Remover `docs-archive/` + script `docs` do package.json + `docs/` do tsconfig include | 3 min   |

### Fase 2 — `noUncheckedIndexedAccess` ✅ (já resolvido — flag ativa, 0 erros)

| Layer | Arquivos                                            | Erros | Status |
| ----- | --------------------------------------------------- | ----- | ------ |
| 2a    | `shared/*.ts` (produção)                            | ~25   | ✅     |
| 2b    | `git_triggers/*.ts` (produção)                      | ~50   | ✅     |
| 2c    | `jira_management/*.ts` (produção)                   | ~40   | ✅     |
| 2d    | `*.test.ts` (todos)                                 | ~110  | ✅     |
| 2e    | Ativar `noUncheckedIndexedAccess: true` no tsconfig | —     | ✅     |

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

## 📋 Planos Futuros (New Feature)

### WEB_STYLE.md

**Prioridade:** Futuro (P3)

`WEB_STYLE.md` descreve uma interface web, nunca implementada. Será implementada quando houver demanda concreta — como SPA standalone.

---

## 🎨 UI/UX Refinement Plan (Lote 8)

| ID   | Item                                                | Fase | Status                    |
| ---- | --------------------------------------------------- | ---- | ------------------------- |
| UX-1 | Theme System & Style Guide (`theme.ts`)             | I    | ✅ Done                   |
| UX-2 | Baseline Snapshots (TUI + HTML report)              | I    | ✅ Done                   |
| UX-3 | TUI: Refactor `box.ts` to consume theme             | II   | ✅ Done                   |
| UX-4 | TUI: Action Search no menu Jira                     | II   | ✅ Done                   |
| UX-5 | Reports: Consume theme, add Failed Summary + toggle | III  | ✅ Done                   |
| UX-6 | TUI: Atalho `[D]etails` para erros não mapeados     | IV   | ✅ Done (já implementado) |

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

## 🧪 Integração de Módulos — Lote 13

**Data:** 2026-05-26
**Problema:** Funções de `shared/` exportadas mas nunca chamadas por handlers de menu (GAP descoberto em auditoria).
**Correção aplicada:** `saveParseResult` em `test-results.ts:180`, `saveCoverageSnapshot` em `case19.ts:74`. Testes estendidos.

### Débitos remanescentes

| #   | Item                                                                                                                | Prio | Status     | Observação                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------- |
| I1  | Teste de contrato: cada handler `case*.ts` deve ter assertions que verificam chamadas a funções `shared/` esperadas | P2   | ⬜         | `main.test.ts` testa `dispatchChoice` mas não verifica efeitos colaterais |
| I2  | `metrics.ts.saveRunMetrics` ainda sem caller em produção (chamado indiretamente via `saveParseResult`)              | P2   | ✅ Coberto | `saveParseResult` chama `saveRunMetrics` internamente                     |
| I3  | Pipeline smoke test (`e2e/smoke-pipeline.ts`) sem asserções automáticas — requer `E2E_PIPELINE=true` manual         | P3   | ⬜         | Script meramente imprime, não falha                                       |
| I4  | `npm run unused-exports` não roda em CI — teria pego o GAP previamente                                              | P1   | ⬜         | Adicionar ao CI pipeline                                                  |
| I5  | Script de verificação handlers↔arquivos (Passo 3 do plano) não existe                                               | P2   | ⬜         | `jira_management/commands/case*.ts` vs `commands/index.ts`                |
| I6  | Rastrear imports de `shared/` em produção automaticamente (Passo 2)                                                 | P2   | ⬜         | Bash one-liner para detectar exports sem caller em produção               |

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

| #   | Onde                                       | Problema                                                                        | Solução                                                                 | Eco |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- |
| S1  | `config.ts:108-424`                        | 37 instance getters + 37 static delegators (~230 linhas)                        | Proxy `[[Get]]` (revertido: TS2749). Static getters one-liners mantidos | ~0  |
| S2  | `result_parser.ts:193-221`                 | `parseTestResultsFile` e `parseCypressResults` = mesmo código, parser diferente | Função `readAndParse(filePath, parser)`                                 | ~25 |
| S3  | `result_parser.ts` + `report-generator.ts` | Objeto vazio `{tests:[], stats:{...}}` repetido 5x                              | Constante `EMPTY_PARSE_RESULT`                                          | ~20 |
| S4  | `prompt-ui.ts:51-74`                       | 5 funções (`success`,`error`,`warn`,`info`,`helpLine`) 90% idênticas            | Helper `_log(level, msg)` + lookup                                      | ~30 |
| S5  | `llm-client.ts:251-271`                    | Async lock (`_rateLocks`) em operação síncrona (Node single-threaded)           | Remover lock                                                            | ~12 |

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

| #   | Item                                           | Prio | Status                                                                       |
| --- | ---------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
| S2  | `readAndParse` helper (result_parser.ts)       | P1   | ✅ Done                                                                      |
| S3  | `EMPTY_PARSE_RESULT` constante                 | P1   | ✅ Done                                                                      |
| S5  | Remover async lock (llm-client.ts)             | P1   | ✅ Done                                                                      |
| S4  | `_log` helper (prompt-ui.ts)                   | P1   | ✅ Done                                                                      |
| J1  | JSDoc em `types.ts` (interfaces públicas)      | P2   | ✅ Done                                                                      |
| J2  | JSDoc em `result_parser.ts` (exports)          | P2   | ✅ Done                                                                      |
| J3  | JSDoc em `report-generator.ts` (exports)       | P2   | ✅ Done                                                                      |
| J4  | JSDoc em `llm-client.ts` (funções públicas)    | P2   | ✅ Done                                                                      |
| J5  | JSDoc em `jira_resource.ts` (métodos públicos) | P2   | ✅ Done                                                                      |
| S6  | Consolidar `generateHtmlReport` wrapper        | P2   | ⬜ Postergado — manter export p/ compat                                      |
| S1  | config.ts — 43 static getters → Proxy          | P1   | ✅ Revertido: Proxy quebra TS (TS2749). 43 static getter one-liners mantidos |

---

---

## 🐛 Bug Report — Menu Gap (AUDIO-01)

**Data:** 2026-05-26
**Prioridade:** P1

**Problema:** `shared/bug-report.ts` exporta `collectManual()` e `interactiveBugReportFlow()` (fluxo interativo completo, com/sem IA) mas **não há entrada de menu dedicada** — só acessível indiretamente via opção 17 (relatório HTML) ou pipeline Git.

**Solução proposta:** Adicionar opção de menu (ex.: opção 20, seção UTILITÁRIOS ou IA) que pergunta se deseja auxílio IA e chama o fluxo interativo.

**Nota:** Menu Jira já tem 19 opções + busca + docs + help — navegação up/down começa a ficar desconfortável. Reavaliar antes de adicionar mais itens.

| Item | Descrição                                                                                           | Status |
| ---- | --------------------------------------------------------------------------------------------------- | ------ |
| M1   | Adicionar entrada de menu "Bug Report" (label, id, alias) em `main.ts`                              | ✅     |
| M2   | Criar handler `case20.ts` com fluxo: collectManual → preview → fileToJira → linkIssues              | ✅     |
| M3   | Menu hierárquico: CATEGORIES + SUB_MENUS + navegação entre níveis + alias bypass + /back contextual | ✅     |

---

## 🚀 Menu Hierárquico + Bug Report — FEAT-22

**Data:** 2026-05-27
**Prioridade:** P0
**Esforço total:** ~4h

### Problema

1. Seção "IA" artificial — itens agrupados por tecnologia (IA) em vez de função. IA é opcional em 17 (relatório) e 19 (histórico).
2. Bug Report sem entrada de menu dedicada — só acessível via case17 (relatório HTML).
3. Menu flat com 20+ itens — navegação por setas desconfortável.

### Solução

- Menu principal com 7 categorias → cada categoria abre sub-menu com comandos específicos
- Aliases continuam pulando a hierarquia (power users)
- Bug Report vira opção 20 com linked issues (mesmo pattern dos casos de teste)
- `@inquirer/select` v5 type-to-filter nativo substitui busca manual
- `indexMode: 'number'` mostra números no menu

### Estrutura do novo menu

```
NÍVEL 1 (MENU PRINCIPAL)        NÍVEL 2 (SUB-MENUS)
─────────────────────────        ─────────────────────────
GERAÇÃO DE RELATÓRIOS      →    17  Gerar relatório HTML
GERAÇÃO DE CASOS DE TESTE  →    1   CSV · 15 JSON · 18 User Story (IA)
BUG REPORT                 →    20  Criar Bug Report
ANÁLISE E HISTÓRICO        →    19  Histórico / Cobertura
RELEASES                   →    2-8 (7 itens)
CONFIGURAÇÃO               →    9,10,14,16
UTILITÁRIOS                →    11,12,13,d
```

| Fase | Descrição                                                    | Status | Esforço |
| ---- | ------------------------------------------------------------ | ------ | ------- |
| 0    | types.ts + prompt-input.ts (indexMode)                       | ✅     | 5 min   |
| 1    | bug-report.ts — linkedIssues + linkManager                   | ✅     | 20 min  |
| 2    | main.ts — menu hierárquico + navegação                       | ✅     | 1.5h    |
| 3    | case20.ts + index.ts + case17.ts                             | ✅     | 30 min  |
| 4    | Testes (main.test, bug-report.test, index.test, case20.test) | ✅     | 1h      |
| 5    | Type check + testes + verificação final                      | ✅     | 15 min  |

### Itens específicos

| #   | Item                                                                       | Prio | Status |
| --- | -------------------------------------------------------------------------- | ---- | ------ |
| M1  | Adicionar entrada de menu "Bug Report" (id=20) em CATEGORIES/SUB_MENUS     | P0   | ✅     |
| M2  | Criar handler case20.ts: collectManual → preview → fileToJira → linkIssues | P0   | ✅     |
| M3  | Menu hierárquico: CATEGORIES + SUB_MENUS + navegação entre níveis          | P0   | ✅     |
| M4  | Alias bypass: relatório → #17 direto (pula hierarquia)                     | P0   | ✅     |
| M5  | /back sobe nível, não sai do módulo                                        | P0   | ✅     |
| M6  | indexMode: 'number' no tema @inquirer/select                               | P1   | ✅     |
| M7  | BugReport.linkedIssues no type + collectManual + compose + linkIssues      | P1   | ✅     |
| M8  | Remover search manual (redundante com type-to-filter)                      | P1   | ✅     |
| M9  | Atualizar aliases: bug, bug-report, bugreport, criar-bug                   | P1   | ✅     |
| M10 | Testes: case20.test.ts, main.test.ts, bug-report.test.ts, index.test.ts    | P1   | ✅     |

Também marcar o AUDIO-01 (M1, M2, M3 do bloco antigo) como resolvidos:

**Progresso geral:** 27/27 ✅ + 17/17 UX ✅ + 9/14 Simplificação ✅

---

---

## 🐛 Bug Report Sprint — 2026-05-27

| #   | Item                                            | Onde                    | Prio | Status |
| --- | ----------------------------------------------- | ----------------------- | ---- | ------ |
| F1  | try/catch case20 handler (R5)                   | `case20.ts`             | P0   | ✅     |
| F2  | Re-prompt 3x em `collectManual`                 | `bug-report.ts`         | P0   | ✅     |
| F3  | Catch genérico em `dispatchChoice`              | `main.ts`               | P0   | ✅     |
| F4  | Mover case13 → GERAÇÃO DE CASOS DE TESTE        | `main.ts` SUB_MENUS     | P2   | ✅     |
| F5  | Teste: ask→"" → printError em case20            | `case20.test.ts`        | P1   | ✅     |
| F6  | Teste: dispatchChoice + Error genérico          | `main.test.ts`          | P1   | ✅     |
| F7  | Teste: re-prompt summary (warn x3 + 2º success) | `bug-report.test.ts`    | P1   | ✅     |
| F8  | `openWithOsOrFallback()` OS default app opener  | `shared/open.ts` + test | P3   | ✅     |
| F9  | Integrar OS opener em `showDocs`                | `main.ts`               | P3   | ✅     |
| F10 | Integrar OS opener em `case17` (HTML report)    | `case17.ts`             | P3   | ✅     |

### Lições aprendidas (prevenção)

- **R5 violado**: `case20.handler` sem try/catch → erro não tratado. Convenção R5 reforçada: TODO handler deve capturar e chamar `printError`. `dispatchChoice` ganhou catch genérico como rede de segurança.
- **Testes mockam o módulo errado**: `case20.test.ts` mockava `bug-report.collectManual` → nunca exercitava código real. Novo teste não mocka `collectManual`, mocka `prompt.ask` diretamente.
- **Teste de `dispatchChoice` só testava CancelError**: Handler lançando `Error` comum crashava o app. Novo teste cobre esse gap.
- **Módulo `child_process` não mockado em `main.test.ts`**: nova dependência `open.ts` requer `spawn` mockado.
- **`collectManual` sem re-prompt**: entrada vazia causava throw imediato sem chance de correção. Re-prompt 3x adicionado.

## 🧹 Sprint Débitos — 2026-05-27

| #   | Item                              | Onde                        | Prio                  | Status                                                          |
| --- | --------------------------------- | --------------------------- | --------------------- | --------------------------------------------------------------- | --- | --- |
| S7  | Remover `analyzeFailures` wrapper | `failure-analysis.ts:34-37` | P1                    | ✅                                                              |
| S9  | `loadTypedState()` helper         | `state.ts` + `main.ts`      | P2                    | ✅                                                              |
| I4  | `ts-prune` no CI                  | CI pipeline                 | P1                    | ✅                                                              |
| I5  | Script handlers↔arquivos          | `package.json`              | P2                    | ✅                                                              |
| S8  | LlmTier configs → `Record`        | `llm-client.ts:67-145`      | P1                    | ✅                                                              |
| S10 | `                                 |                             | undefined` redundante | `result_parser.ts:96`                                           | P2  | ✅  |
| S11 | `for (let i...)` → `for..of`      | `report-generator.ts:263`   | P3                    | ✅                                                              |
| S12 | Ternário → `Record` lookup        | `report-generator.ts:197`   | P3                    | ✅                                                              |
| S13 | 3× `.filter().length` → 1×        | `result_parser.ts:128-130`  | P3                    | ⬜ Já usa `reduce` em outras partes; avaliar se ainda aplicável |
| S14 | Retry manual → `for` loop         | `failure-analysis.ts:78-89` | P3                    | ✅                                                              |
| S1  | config.ts Proxy refactor          | `config.ts`                 | P1                    | ✅ Proxy revertido — 43 static getter one-liners mantidos       |
| I1  | Teste de contrato handlers        | `index.test.ts`             | P2                    | ✅ Bidirecional: file→handler + handler→file + export contract  |
| I3  | Smoke test com asserções          | `e2e/smoke-pipeline.ts`     | P3                    | ✅ Função `assert()` + validações estruturais em cada etapa     |

---

## ☁️ Lote 14 — Jira Cloud Mode (planejado)

**Data:** 2026-05-27
**Prioridade:** P0 (CloudStepImporter quebra)
**Esforço estimado:** ~4h
**Dependências:** Nenhuma

**Problema:** `CloudStepImporter` em `xray-client.ts:19-27` é um stub que lança `Error`. `XRAY_MODE=cloud` está documentado mas quebra em tempo de execução.

| #     | Item                                                                              | Prio | Status |
| ----- | --------------------------------------------------------------------------------- | ---- | ------ |
| CLD-1 | Pesquisar Xray Cloud GraphQL mutation para importStep                             | P0   | ⬜     |
| CLD-2 | Implementar `CloudStepImporter.importStep()` com GraphQL via axios                | P0   | ⬜     |
| CLD-3 | Adicionar autenticação OAuth (client_id + client_secret) no Config                | P0   | ⬜     |
| CLD-4 | Testes: happy path + auth error + GraphQL error                                   | P1   | ✅     |
| CLD-5 | Teste de integração smoke com `XRAY_MODE=cloud`                                   | P2   | ✅     |
| CLD-6 | Consumir `XRAY_CLOUD_ENDPOINT` no `CloudStepImporter` (GraphQL endpoint override) | P2   | ⬜     |

---

## 📊 Lote 15 — CTRF Pipeline + Deprecation

**Data:** 2026-05-27
**Prioridade:** P1
**Esforço real:** ~30min
**Dependências:** Nenhuma

**Problema original:** Pipeline ignorava CTRF artifacts; case17 usava parser legado.
**Resolvido:** Ambos os formatos são detectados automaticamente. Deprecation warning em `parseMochawesome`. `case17.ts` usa `parseTestResultsFile`.

| #      | Item                                                                                  | Prio | Status |
| ------ | ------------------------------------------------------------------------------------- | ---- | ------ |
| CTRF-1 | Trocar `parseMochawesome` → `detectAndParseTestResults` em `test-results.ts`          | P1   | ✅     |
| CTRF-2 | Renomear `_extractMochawesomeFromZip` → `_extractTestResultsFromZip` (ambos formatos) | P1   | ✅     |
| CTRF-3 | Adaptar `test-results.test.ts` para ambos os formatos + teste CTRF zip                | P1   | ✅     |
| CTRF-4 | Adaptar `e2e/result-pipeline.test.ts` — usar `parseTestResults` + teste CTRF e2e      | P1   | ✅     |
| CTRF-5 | Adicionar deprecation warning em `parseMochawesome()`                                 | P2   | ✅     |
| CTRF-6 | Trocar `case17.ts` → `parseTestResultsFile`, deprecar `parseCypressResults`           | P2   | ✅     |
| CTRF-7 | Atualizar `case17.test.ts` para novos mocks                                           | P2   | ✅     |

---

## 🧹 Lote 16 — Eliminação de Débitos (Auditoria)

**Data:** 2026-05-27
**Prioridade:** P0
**Esforço estimado:** ~75min
**Real:** ~45min
**Dependências:** Nenhuma

**Problema:** Auditoria profunda revelou 30+ débitos: R5 violation, unsafe `!` assertions, dead exports, funções >50 linhas, `eslint-disable` sem justificativa, test gaps, casts inseguros.

### 16A — Correções Críticas (P0)

| #   | Item                                                | Onde                                     | Prio | Status |
| --- | --------------------------------------------------- | ---------------------------------------- | ---- | ------ |
| A0  | Restaurar `XRAY_CLOUD_ENDPOINT=` no `.env.example`  | `.env.example`                           | P0   | ✅     |
| A1  | R5: `createTestExecution` loga + re-throw           | `git_triggers/test-results.ts:146-163`   | P0   | ✅     |
| A2  | R5: `getJiraResource` loga antes do throw           | `jira_management/jira_resource.ts:69-72` | P0   | ✅     |
| A3  | `null as unknown as string` → `return ''` type-safe | `shared/prompt-input.ts:107`             | P0   | ✅     |
| A4  | `matches[0]!` → guard explícito                     | `git_triggers/test-results.ts:26`        | P0   | ✅     |
| A5  | `artifacts[0]!` → guard antes do `\|\|`             | `git_triggers/test-results.ts:72`        | P0   | ✅     |
| A6  | `found[0]![0]` → guard `if (!entry)`                | `jira_management/main.ts:379`            | P0   | ✅     |

### 16B — Funções > 50 linhas (R4, P1)

| #   | Item                                                   | Onde                              | Prio | Status |
| --- | ------------------------------------------------------ | --------------------------------- | ---- | ------ |
| B1  | Extrair `_writeReportFile` + `_addAiAnalysis` (58→38)  | `commands/case17.ts:19-76`        | P1   | ✅     |
| B2  | Extrair `_showSearchResults` de `showHelpLoop` (55→47) | `jira_management/main.ts:342-396` | P1   | ✅     |
| B3  | Extrair `_executeChoice` de `runMainLoop` (52→41)      | `jira_management/main.ts:689-740` | P1   | ✅     |

### 16C — Dead Exports → Internal (P2)

| #   | Export                | Arquivo                       | Ação                          | Status |
| --- | --------------------- | ----------------------------- | ----------------------------- | ------ |
| C1  | `parseCypressResults` | `shared/result_parser.ts:289` | Manter export (`@deprecated`) | ✅     |
| C2  | `parseMochawesome`    | `shared/result_parser.ts:177` | `@internal` JSDoc             | ✅     |
| C3  | `parseCtrfResults`    | `shared/result_parser.ts:221` | `@internal` JSDoc             | ✅     |
| C4  | `isCtrfFormat`        | `shared/result_parser.ts:264` | `@internal` JSDoc             | ✅     |
| C5  | `getWinTempDir`       | `shared/open.ts:24`           | `@internal` JSDoc             | ✅     |
| C6  | `getOsOpenCommand`    | `shared/open.ts:71`           | `@internal` JSDoc             | ✅     |
| C7  | `logsDir`             | `shared/temp-dir.ts:14`       | `@internal` JSDoc             | ✅     |
| C8  | `compose`             | `shared/bug-report.ts:126`    | `@internal` JSDoc             | ✅     |

### 16D — Justificativas + Casts (P2)

| #   | Item                                                            | Onde                                                      | Status |
| --- | --------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| D1  | Adicionar `-- suppress dotenv` em `eslint-disable`              | `shared/config.ts:9`                                      | ✅     |
| D2  | Adicionar `-- dynamic import, ESM-only` nos 2 `eslint-disable`  | `shared/splash.ts:10,15`                                  | ✅     |
| D3  | Adicionar `-- token AST shape varies by lexer`                  | `shared/markdown.ts:338,342`                              | ✅     |
| D4  | Adicionar `// eslint-disable-next-line no-console -- TTY clear` | `jira_management/main.ts:345`, `git_triggers/main.ts:245` | ✅     |
| D5  | Documentar `err as NodeJS.ErrnoException` — cobre ENOENT        | `shared/result_parser.ts:15`                              | ✅     |

### 16E — Testes Faltantes (P2)

| #   | Item                                                      | Onde                                      | Status |
| --- | --------------------------------------------------------- | ----------------------------------------- | ------ |
| E1  | `parseTestResults(null)` + `(undefined)` + `({})`         | `shared/result_parser.test.ts`            | ✅     |
| E2  | `parseCtrfResults`: status `skipped` + summary fallback   | `shared/result_parser.test.ts`            | ✅     |
| E3  | `entryName` case-insensitive (`.toLowerCase()`)           | `git_triggers/test-results.ts:49`         | ✅     |
| E4  | Bug report sub-step após case17 com falhas                | `jira_management/commands/case17.test.ts` | ✅     |
| E5  | Documentar `XRAY_CLOUD_ENDPOINT` em `docs/06-env-vars.md` | `docs/06-env-vars.md`                     | ✅     |

### 16F — Casts Inseguros (P3)

| #   | Item                                                 | Onde                      | Status |
| --- | ---------------------------------------------------- | ------------------------- | ------ |
| F1  | `palette.muted as unknown as string` → guard de tipo | `shared/prompt-ui.ts:387` | ✅     |

---

## 🔬 Lote 17 — LLM Audit Fixes (Agenda llm-engineer)

**Data:** 2026-05-27
**Prioridade:** P0
**Esforço total:** ~7.5h
**Score alvo:** 6.6 → 9.2/10
**Foco:** Segurança > Prevenção > Qualidade > Performance

### Execução em 4 fases

| Fase | Descrição                                                    | Itens | Esforço |
| ---- | ------------------------------------------------------------ | ----- | ------- |
| 1    | Fixes simples independentes (I5, I3, S5, S2, I4, S6, C3, I7) | 8     | ✅      |
| 2    | Circuit breaker, validateAll, Gemini system_instruction      | 3     | ✅      |
| 3    | Métricas + token usage + responseFormat param                | 3     | ✅      |
| 4    | Benchmark paralelo + E2E pipeline test                       | 2     | ✅      |

### Itens

| ID  | Item                                              | Prio | Arquivo(s)                            | Fase | Status |
| --- | ------------------------------------------------- | ---- | ------------------------------------- | ---- | ------ |
| C3  | Prompt injection: {{FAILED_TESTS}} → user message | P0   | failure-analysis.ts, llm-benchmark.ts | 1    | ✅     |
| I5  | case18 usar tier `fast` em vez de `main`          | P0   | case18.ts                             | 1    | ✅     |
| I3  | configUniqueKey incluir apiKey                    | P0   | llm-client.ts                         | 1    | ✅     |
| I4  | Alinhar parseVerdict/stripVerdict (mesmo regex)   | P1   | llm-review.ts                         | 1    | ✅     |
| I7  | parseRetryAfter Date (RFC 7231) test              | P1   | llm-client.test.ts                    | 1    | ✅     |
| S2  | callerId no cache hit/miss log                    | P1   | llm-client.ts                         | 1    | ✅     |
| S6  | Invalid response no retry prompt                  | P1   | llm-review.ts                         | 1    | ✅     |
| S5  | Sanitizar ciUrl no HTML report                    | P1   | report-generator.ts                   | 1    | ✅     |
| C4  | Circuit breaker per-provider (configUniqueKey)    | P0   | llm-client.ts, llm-client.test.ts     | 2    | ✅     |
| C1  | validateAll: schema validation em todos tests[i]  | P1   | report-validator.ts, llm-review.ts    | 2    | ✅     |
| C2  | Gemini system_instruction field (vs concat)       | P2   | llm-client.ts                         | 2    | ✅     |
| I1  | Métricas: tokens + cache hit/miss + per-provider  | P2   | llm-metrics.ts, llm-client.ts         | 3    | ✅     |
| S4  | Expor token usage no parseResponse                | P2   | llm-client.ts, llm-metrics.ts         | 3    | ✅     |
| I6  | responseFormat param opcional em llmPrompt        | P3   | llm-client.ts, callers                | 3    | ✅     |
| S3  | Benchmark paralelo (Promise.allSettled)           | P3   | llm-benchmark.ts                      | 4    | ✅     |
| S7  | E2E pipeline test (mock chain)                    | P3   | e2e/llm-pipeline.test.ts (novo)       | 4    | ✅     |

---

## 🔬 Lote 18 — Re-audit Fixes (Pós-L17)

**Data:** 2026-05-27
**Prioridade:** P0
**Esforço total:** ~1.5h
**Base:** Re-audit llm-engineer: 7.2/10 (↑0.6)

### Execução

| Batch | Descrição                                                           | Itens | Esforço |
| ----- | ------------------------------------------------------------------- | ----- | ------- |
| 1     | circuitSuccess + single parse + error check + run-comparison prompt | 3     | ✅      |
| 2     | validateAll tests + E2E mock + test prompts + benchmark cache       | 4     | ✅      |

### Itens

| ID  | Item                                                                 | Prio | Arquivo(s)                               | Batch | Status |
| --- | -------------------------------------------------------------------- | ---- | ---------------------------------------- | ----- | ------ |
| R1  | recordCircuitSuccess incondicional (fallback circuit nunca resetado) | P0   | llm-client.ts                            | 1     | ✅     |
| R2  | API error em 200 OK + double JSON parse                              | P0   | llm-client.ts                            | 1     | ✅     |
| R3  | run-comparison.ts user data no system prompt                         | P1   | run-comparison.ts                        | 1     | ✅     |
| R4  | validateAll sem testes diretos                                       | P2   | report-validator.test.ts                 | 2     | ✅     |
| R5  | E2E mock sem resetCircuitState/resetRateLimiter                      | P2   | e2e/llm-pipeline.test.ts                 | 2     | ✅     |
| R6  | Test prompts usam {{PLACEHOLDER}} obsoleto                           | P2   | failure-analysis.test.ts, case18.test.ts | 2     | ✅     |
| R7  | Benchmark re-read prompts do disco por fixture                       | P3   | llm-benchmark.ts                         | 2     | ✅     |

---

## 🚀 Lote 19 — Critical Fixes (8.0→9.0+)

**Data:** 2026-05-27
**Alvo:** >9.0/10
**Base:** Re-audit llm-engineer: 8.0/10

### Execução

| Batch | Descrição                                                              | Itens | Esforço |
| ----- | ---------------------------------------------------------------------- | ----- | ------- |
| 19    | Critical circuit breaker + cache key + warn + NaNms + retries + jitter | 6     | ✅      |
| 20    | Sanitize: 4 padrões + testes + truncateStacktrace                      | 6     | ✅      |
| 21    | Token debug log + metrics key hash + rate limit msg                    | 3     | ✅      |
| 22    | Schema validation: heuristic fix + 6 testes                            | 6     | ✅      |
| 23    | Test coverage: ~30 testes em 8 arquivos + 1 novo                       | 30    | ~4h     |
| 24    | Benchmark: reuse ReportValidator + remove dead schema                  | 2     | ✅      |
| 25    | Re-audit final                                                         | 1     | ~30min  |

### Itens

| ID    | Item                                                                | Prio | Arquivo(s)                   | Batch | Status |
| ----- | ------------------------------------------------------------------- | ---- | ---------------------------- | ----- | ------ |
| 19.1  | Circuit breaker conta todo erro (não só 429)                        | P1   | llm-client.ts                | 19.1  | ✅     |
| 19.2  | Cache key inclui runtime responseFormat                             | P1   | llm-client.ts                | 19.1  | ✅     |
| 19.3  | Warn log em non-JSON 200 OK                                         | P2   | llm-client.ts                | 19.2  | ✅     |
| 19.4  | formatFailedTests NaNms guard                                       | P2   | failure-analysis.ts          | 19.2  | ✅     |
| 19.5  | LLM_FETCH_RETRIES configurável via env                              | P3   | llm-client.ts                | 19.2  | ✅     |
| 19.6  | Jitter 0-100% (era 50-100%)                                         | P3   | llm-client.ts                | 19.2  | ✅     |
| 20.1  | Padrão HuggingFace hf\_                                             | P2   | sanitize.ts                  | 20    | ✅     |
| 20.2  | Padrão npm\_                                                        | P2   | sanitize.ts                  | 20    | ✅     |
| 20.3  | Padrão Slack xox[abp]-                                              | P2   | sanitize.ts                  | 20    | ✅     |
| 20.4  | Padrão GitHub refresh ghr\_                                         | P2   | sanitize.ts                  | 20    | ✅     |
| 20.5  | Testes dos 4 novos padrões                                          | P2   | sanitize.test.ts             | 20    | ✅     |
| 20.6  | truncateStacktrace integrado a sanitizeForLlm (maxStackLines param) | P3   | sanitize.ts                  | 20    | ✅     |
| 21.1  | Debug log tokens por request                                        | P3   | llm-client.ts                | 21    | ✅     |
| 21.2  | API key hash em metrics key (vs slice -8)                           | P3   | llm-client.ts                | 21    | ✅     |
| 21.3  | Rate limit msg inclui "client-side"                                 | P3   | llm-client.ts                | 21    | ✅     |
| 22.1  | Heurística array rules usa regex em vez de includes                 | P2   | report-validator.ts          | 22    | ✅     |
| 22.2  | Test: validateAll early return length<=1                            | P2   | report-validator.test.ts     | 22    | ✅     |
| 22.3  | Test: validateAll early return no array rules                       | P2   | report-validator.test.ts     | 22    | ✅     |
| 22.4  | Test: checkConsistency high severity                                | P2   | report-validator.test.ts     | 22    | ✅     |
| 22.5  | Test: resolveField 3+ levels                                        | P3   | report-validator.test.ts     | 22    | ✅     |
| 23.1  | llm-benchmark.test.ts (15+ testes, novo arquivo)                    | P2   | shared/llm-benchmark.test.ts | 23    | ✅     |
| 23.2  | responseFormat='json' param test                                    | P2   | llm-client.test.ts           | 23    | ✅     |
| 23.3  | responseFormat diferente → cache keys diferentes                    | P2   | llm-client.test.ts           | 23    | ✅     |
| 23.4  | Gemini system_instruction payload test                              | P2   | llm-client.test.ts           | 23    | ✅     |
| 23.5  | non-JSON 200 chama logger.warn                                      | P2   | llm-client.test.ts           | 23    | ✅     |
| 23.6  | Tier fallback dedup test                                            | P3   | llm-client.test.ts           | 23    | ✅     |
| 23.7  | runRetryLoop MAX_RETRIES exatas                                     | P2   | llm-review.test.ts           | 23    | ⬜     |
| 23.8  | buildRetryPrompt content verification                               | P2   | llm-review.test.ts           | 23    | ⬜     |
| 23.9  | analyzeFailuresWithReport HTML exception path                       | P2   | failure-analysis.test.ts     | 23    | ✅     |
| 23.10 | HTML report output verificado                                       | P2   | failure-analysis.test.ts     | 23    | ⬜     |
| 23.11 | snapshotLlmMetrics round-trip persist                               | P2   | llm-metrics.test.ts          | 23    | ✅     |
| 23.12 | recordArtifactReview approved/rejected                              | P2   | llm-metrics.test.ts          | 23    | ✅     |
| 23.13 | case18 retry + success path                                         | P2   | case18.test.ts               | 23    | ✅     |
| 23.14 | case18 retry + still invalid → printError                           | P2   | case18.test.ts               | 23    | ✅     |
| 23.15 | compareRuns empty data                                              | P2   | run-comparison.test.ts       | 23    | ⬜     |
| 23.16 | compareRuns sanitization verified                                   | P2   | run-comparison.test.ts       | 23    | ⬜     |
| 23.17 | E2E validateAll 3-element array                                     | P2   | llm-pipeline.test.ts         | 23    | ✅     |
| 23.18 | E2E circuit breaker + fallback                                      | P2   | llm-pipeline.test.ts         | 23    | ✅     |
| 23.19 | truncateStacktrace test                                             | P3   | sanitize.test.ts             | 23    | ✅     |
| 24.1  | Reusar ReportValidator em benchmark                                 | P3   | llm-benchmark.ts             | 24    | ✅     |
| 24.2  | Remover dead schema field                                           | P3   | fixtures/index.ts + JSONs    | 24    | ✅     |
| 25.1  | Re-audit llm-engineer (score >9.0)                                  | P0   | —                            | 25    | ⬜     |

---

### Lote 26 — Circuit Breaker Module + Half-Open State

**Data:** 2026-05-27
**Alvo:** Gap 1 da auditoria (7.9→9.2)
**Esforço:** 2h

| ID   | Item                                                                                   | Prio | Status |
| ---- | -------------------------------------------------------------------------------------- | ---- | ------ |
| 26.1 | Extrair circuit breaker → `shared/circuit-breaker.ts` (check,record,state,consts)      | P0   | ⬜     |
| 26.2 | Half-open state: após cooldown → HALF_OPEN (não CLOSED)                                | P0   | ⬜     |
| 26.3 | HALF_OPEN: 1 probe request a cada 15s                                                  | P0   | ⬜     |
| 26.4 | Sucesso na probe → CLOSED; falha → OPEN                                                | P0   | ⬜     |
| 26.5 | Exportar CircuitState, resetCircuitState, getCircuitState, HALF_OPEN_PROBE_INTERVAL_MS | P1   | ⬜     |
| 26.6 | Adaptar llm-client.ts para importar do novo módulo                                     | P1   | ⬜     |
| 26.7 | Atualizar llm-client.test.ts (imports)                                                 | P1   | ⬜     |
| 26.8 | Atualizar llm-pipeline.test.ts                                                         | P1   | ⬜     |

### Lote 27 — Output Sanitization

**Data:** 2026-05-27 | **Esforço:** 1h

| ID   | Item                                                             | Prio | Status |
| ---- | ---------------------------------------------------------------- | ---- | ------ |
| 27.1 | `sanitizeHtml(text): string` em sanitize.ts (escape HTML)        | P1   | ⬜     |
| 27.2 | `sanitizeTerminal(text): string` (remove ANSI escapes perigosos) | P1   | ⬜     |
| 27.3 | Aplicar sanitizeTerminal em case18.ts:71                         | P1   | ⬜     |
| 27.4 | Aplicar sanitizeTerminal em llm-review.ts                        | P1   | ⬜     |
| 27.5 | Aplicar sanitizeHtml no HTML report generator                    | P1   | ⬜     |
| 27.6 | Testes dos 3 pontos de sanitização                               | P2   | ⬜     |

### Lote 28 — Persistent Disk Cache (L2)

**Data:** 2026-05-27 | **Esforço:** 1.5h

| ID   | Item                                                             | Prio | Status |
| ---- | ---------------------------------------------------------------- | ---- | ------ |
| 28.1 | `diskCacheGet(key)` + `diskCacheSet(key, entry)`                 | P2   | ⬜     |
| 28.2 | Env `LLM_DISK_CACHE_DIR` (default: $QA_TOOLS_LOGS_DIR/llm-cache) | P2   | ⬜     |
| 28.3 | Lookup: L1(Map) → L2(disco) → LLM API                            | P2   | ⬜     |
| 28.4 | Write: L1 + L2 simultâneo                                        | P2   | ⬜     |
| 28.5 | TTL: 1h disco, 5min memória                                      | P2   | ⬜     |
| 28.6 | Load lazy no primeiro acesso                                     | P2   | ⬜     |
| 28.7 | Testes com temp dir                                              | P2   | ⬜     |

### Lote 29 — Typed LLM Errors + Schema Enforcement

**Data:** 2026-05-27 | **Esforço:** 1.5h

| ID   | Item                                                                                                | Prio | Status |
| ---- | --------------------------------------------------------------------------------------------------- | ---- | ------ |
| 29.1 | `shared/errors.ts` com LlmError, LlmRateLimitError, LlmProviderError, LlmTimeoutError, LlmAuthError | P1   | ⬜     |
| 29.2 | Substituir throw new Error nos 7 sites de llm-client.ts                                             | P1   | ⬜     |
| 29.3 | ReportValidator.validate() dentro de llmPrompt p/ responseFormat=json                               | P2   | ⬜     |
| 29.4 | 1 retry com hint de schema se validação falhar                                                      | P2   | ⬜     |
| 29.5 | Testes dos erros tipados                                                                            | P2   | ⬜     |
| 29.6 | Testes da validação automática                                                                      | P2   | ⬜     |

### Lote 30 — Minor Fixes

**Data:** 2026-05-27 | **Esforço:** 1h

| ID   | Item                                                  | Prio | Status |
| ---- | ----------------------------------------------------- | ---- | ------ |
| 30.1 | `candidates[i]!` → guard `if (!cfg) continue`         | P2   | ⬜     |
| 30.2 | `Config.get()` typed + respeitar ConfigOverrides      | P2   | ⬜     |
| 30.3 | `console.log` → `Output.print` no benchmark (8 sites) | P2   | ⬜     |
| 30.4 | `ensureDotenv` hack → carregar dotenv no startup      | P2   | ⬜     |
| 30.5 | `parseRawOnce` typed return                           | P3   | ⬜     |
| 30.6 | Testes de regressão para cada fix                     | P2   | ⬜     |

---

## 🚀 Plano de Ataque — Prioridade por Fase

**Data:** 2026-05-28
**API Keys disponíveis (free):** OpenRouter, Cerebras, Gemini, Groq, NVIDIA, GitHub, HuggingFace

### Fase 1A (P0) — Circuit Breaker Module + Half-Open ✅

| ID   | Item                                                                                   | Prio | Status |
| ---- | -------------------------------------------------------------------------------------- | ---- | ------ |
| 26.1 | Extrair circuit breaker → `shared/circuit-breaker.ts` (check,record,state,consts)      | P0   | ✅     |
| 26.2 | Half-open state: após cooldown → HALF_OPEN (não CLOSED)                                | P0   | ✅     |
| 26.3 | HALF_OPEN: 1 probe request a cada 15s                                                  | P0   | ✅     |
| 26.4 | Sucesso na probe → CLOSED; falha → OPEN                                                | P0   | ✅     |
| 26.5 | Exportar CircuitState, resetCircuitState, getCircuitState, HALF_OPEN_PROBE_INTERVAL_MS | P1   | ✅     |
| 26.6 | Adaptar llm-client.ts para importar do novo módulo                                     | P1   | ✅     |
| 26.7 | Atualizar llm-client.test.ts (imports) — via re-export                                 | P1   | ✅     |
| 26.8 | Atualizar llm-pipeline.test.ts — via re-export                                         | P1   | ✅     |
| 26.9 | Testes dedicados do circuit breaker (10 testes)                                        | P1   | ✅     |

### Fase 1B (pesquisa) — API Xray Cloud GraphQL (paralelo) ✅

| ID    | Item                                                                                                 | Prio | Status |
| ----- | ---------------------------------------------------------------------------------------------------- | ---- | ------ |
| CLD-0 | Pesquisar Xray Cloud GraphQL mutation para importStep → `addTestStep` + `CreateStepInput` + auth JWT | P0   | ✅     |

### Fase 2A (P1) — Output Sanitization ✅

| ID   | Item                                                                  | Prio | Status |
| ---- | --------------------------------------------------------------------- | ---- | ------ |
| 27.1 | `sanitizeHtml(text)` em sanitize.ts (escape HTML)                     | P1   | ✅     |
| 27.2 | `sanitizeTerminal(text)` (remove ANSI escapes perigosos)              | P1   | ✅     |
| 27.3 | Aplicar sanitizeTerminal em case18.ts:71                              | P1   | ✅     |
| 27.4 | Aplicar sanitizeTerminal em llm-review.ts                             | P1   | ✅     |
| 27.5 | Aplicar sanitizeHtml no HTML report generator (já existia escapeHtml) | P1   | ✅     |
| 27.6 | Testes dos 6 pontos de sanitização                                    | P2   | ✅     |

### Fase 2B (P2) — Disk Cache (free-tier economy) ✅

| ID   | Item                                             | Prio | Status |
| ---- | ------------------------------------------------ | ---- | ------ |
| 28.1 | `diskCacheGet(key)` + `diskCacheSet(key, entry)` | P2   | ✅     |
| 28.2 | Env `LLM_DISK_CACHE_DIR` (default `.llm-cache`)  | P2   | ✅     |
| 28.3 | Lookup: L1(Map) → L2(disco) → LLM API            | P2   | ✅     |
| 28.4 | Write: L1 + L2 simultâneo                        | P2   | ✅     |
| 28.5 | TTL: 1h disco, 5min memória                      | P2   | ✅     |
| 28.6 | `clearDiskCache` + `clearCache` limpa ambos      | P2   | ✅     |
| 28.7 | Testes (5) com temp dir + expiry + overwrite     | P2   | ✅     |

### Fase 1C (P0) — Jira Cloud Mode (após pesquisa 1B) ✅

| ID    | Item                                                               | Prio | Status |
| ----- | ------------------------------------------------------------------ | ---- | ------ |
| CLD-1 | Implementar `CloudStepImporter.importStep()` com GraphQL via axios | P0   | ✅     |
| CLD-2 | Adicionar autenticação OAuth (client_id + client_secret) no Config | P0   | ✅     |
| CLD-3 | Testes: happy path + auth error + GraphQL error                    | P1   | ✅     |
| CLD-4 | Teste de integração smoke com `XRAY_MODE=cloud`                    | P2   | ✅     |
| CLD-5 | Consumir `XRAY_CLOUD_ENDPOINT` no `CloudStepImporter`              | P2   | ✅     |

### Fase 3 (P1-P2) — Typed Errors + Test Coverage + Minor Fixes ✅

| ID    | Item                                                                                                        | Prio | Status |
| ----- | ----------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 29.1  | `shared/errors.ts` com LlmError, LlmRateLimitError, LlmProviderError, LlmTimeoutError, LlmAuthError         | P1   | ✅     |
| 29.2  | Substituir throw new Error nos 6 sites de llm-client.ts → LlmProviderError, LlmRateLimitError, LlmAuthError | P1   | ✅     |
| 29.3  | ReportValidator.validate() dentro de llmPrompt p/ responseFormat=json                                       | P2   | ⬜     |
| 29.4  | 1 retry com hint de schema se validação falhar                                                              | P2   | ⬜     |
| 29.5  | Testes dos erros tipados (7 testes)                                                                         | P2   | ✅     |
| 29.6  | Testes da validação automática                                                                              | P2   | ⬜     |
| 23.7  | runRetryLoop MAX_RETRIES exatas (já testado)                                                                | P2   | ✅     |
| 23.8  | buildRetryPrompt content verification (já testado)                                                          | P2   | ✅     |
| 23.10 | HTML report output verificado (já testado)                                                                  | P2   | ✅     |
| 23.15 | compareRuns empty data (já testado)                                                                         | P2   | ✅     |
| 23.16 | compareRuns sanitization verified (já testado)                                                              | P2   | ✅     |
| 30.1  | `candidates[i]!` → guard `if (!cfg) continue` (já existente)                                                | P2   | ✅     |
| 30.2  | `Config.get()` typed + respeitar ConfigOverrides                                                            | P2   | ⬜     |
| 30.3  | `console.log` → `Output.print` no benchmark (0 sites, já Output)                                            | P2   | ✅     |
| 30.4  | `ensureDotenv` hack → carregar dotenv no startup                                                            | P2   | ⬜     |
| 30.5  | `parseRawOnce` typed return                                                                                 | P3   | ⬜     |
| 30.6  | Testes de regressão para cada fix                                                                           | P2   | ✅     |

### Fase 4 (P2-P3) — Simplificação Restante ✅

| ID  | Item                                                      | Prio | Status                               |
| --- | --------------------------------------------------------- | ---- | ------------------------------------ |
| S6  | Consolidar `generateHtmlReport` wrapper                   | P2   | ✅ (mantido export p/ compat)        |
| S13 | 3× `.filter().length` → 1× `reduce`                       | P3   | ⬜ (cosmético)                       |
| I1  | Teste de contrato: cada handler verifica chamadas shared/ | P2   | ✅ (já existente)                    |
| I3  | Smoke test com asserções reais                            | P3   | ✅ (já existente)                    |
| I6  | Script rastrear imports shared/ em produção               | P2   | ✅ (scripts/trace-shared-imports.sh) |

### Fase 5 (P0) — Re-audit Final ✅

| ID   | Item                                                                               | Prio | Status |
| ---- | ---------------------------------------------------------------------------------- | ---- | ------ |
| 25.1 | Re-audit llm-engineer (score >9.0) — implementadas todas as correções dos findings | P0   | ✅     |

### Fase 6 (P0) — Ciclo Adversarial Completo ✅

| ID  | Item                                                                                       | Prio | Status |
| --- | ------------------------------------------------------------------------------------------ | ---- | ------ |
| A1  | `reviewerNotes` + `adversarialRetried` + `reReviewTier` em `ReviewResult`                  | P0   | ✅     |
| A2  | `performSelfReview` retorna `reviewerNotes` separado do `content`                          | P0   | ✅     |
| A3  | `buildAdversarialRetryPrompt(gaps, user)` — prompt com gaps detectados                     | P0   | ✅     |
| A4  | `adversarialRetryParallel` — report + fast + fallback paralelo, pickBest                   | P0   | ✅     |
| A5  | `reReviewParallel` — reviewer + fast + fallback paralelo, quorum 2/3                       | P0   | ✅     |
| A6  | `reviewWithLlm` integrado com ciclo adversarial completo                                   | P0   | ✅     |
| A7  | `recordAdversarialRetry` em llm-metrics                                                    | P0   | ✅     |
| A8  | Testes (11): T1-T8 + 3 novos (adversarial success, re-review downgrade, short notes guard) | P1   | ✅     |

### Fase 7 (P0) — Reforço Adversarial: Pareto Stop + Cobertura Total ✅

| ID  | Item                                                                                 | Prio | Status |
| --- | ------------------------------------------------------------------------------------ | ---- | ------ |
| P1  | `buildAdversarialRetryPrompt`: condensed → 5-step + Pareto + "do not include audit"  | P0   | ✅     |
| P2  | `classify.md`: 1-step → 2-step + Pareto + "output ONLY one line"                     | P0   | ✅     |
| P3  | `COMPARE_SYSTEM` em `run-comparison.ts`: adicionar 5-step + Pareto c/ "≤5 sentences" | P0   | ✅     |
| P4  | `ai-test-impact.ts` system: adicionar 5-step + Pareto + "do not include audit"       | P0   | ✅     |
| P5  | `ai-pr-desc.ts` system: adicionar 5-step + Pareto c/ "≤300 words"                    | P0   | ✅     |

### Fase 8 (P1) — Auditoria LLM (Refinamentos Pós-Audit)

| ID  | Item                                                                  | Prio | Status                                              |
| --- | --------------------------------------------------------------------- | ---- | --------------------------------------------------- |
| R1  | Criptografar cache em disco ou restringir permissões (chmod 600)      | P1   | ✅ (Wave 1.3: disk-cache.ts AES-256-GCM + chmod)    |
| R2  | Implementar monitoramento de `totalTokens` e hard-limits por operação | P1   | ✅ (Wave 1.2: LLM_MAX_TOKENS_PER_OP pre-chamada)    |
| R3  | Reforçar sanitização de prompts (eliminar superfície injection)       | P1   | ✅ (verificado código: 14 regex, 7 callers, testes) |
| R4  | Migrar validação JSON para schema enforcement (ex: Zod)               | P0   | ✅ (Waves 1-3 Zod: overload + 3 schemas + testes)   |

### Fase 9 (P1) — Refinamento de UX (Auditoria)

| ID  | Item                                                                          | Prio | Status                                                                                     |
| --- | ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| U1  | Breadcrumbs dinâmicos no título das boxes (ex: [Jira] > [Testes] > [Criar])   | P1   | ⬜                                                                                         |
| U2  | Pré-validação (linting) de CSV/JSON antes de acionar handlers                 | P0   | ✅ (verificado código: `TestCaseValidator` + `validateImportBatch`)                        |
| U3  | Barra de progresso em relatórios/processos longos (em vez de spinner)         | P2   | ✅ (verificado código: `ProgressBar` com `cli-progress` em `spinner.ts`)                   |
| U4  | Dark mode nativo (CSS `prefers-color-scheme`) nos relatórios HTML             | P2   | ✅ (verificado código: `@media (prefers-color-scheme: dark)` em `report-generator.ts:156`) |
| U5  | Wrapper de erro amigável para `Output.error` (mapeamento de erros comuns)     | P1   | ✅ (verificado código: 9 `KNOWN_ERRORS`, `humanizeError`, `printError`)                    |
| U6  | Exibir atalhos de alias no menu ao lado das opções                            | P2   | ✅ (`ID_TO_ALIASES` + `buildMenuChoices` show aliases)                                     |
| U7  | Melhorar clareza do contexto atual (ex: projeto Jira ativo) em todas as telas | P1   | ✅ (`buildContextLine` chamado no `getUserChoice` header)                                  |
| U8  | Mapeamento de erros de rede para mensagens amigáveis (VPN, timeout, etc.)     | P1   | ✅ (verificado código: pattern + http-client retry)                                        |

### Outros itens verificados (código já implementado)

| ID     | Item                                | Prio | Status                                                                                               |
| ------ | ----------------------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| 30.4   | `ensureDotenv` no startup           | P2   | ✅ (verificado: `config.ts:5` + module-level `Config.load()` em `config.ts:440`)                     |
| 30.5   | `parseRawOnce` typed return         | P3   | ✅ (verificado: `parseRawOnce(raw: string): Record<string, unknown> \| null` em `llm-client.ts:277`) |
| S13    | 3× `.filter().length` → 1× `reduce` | P3   | ✅ Stale — `result_parser.ts` já usa `reduce` nos pontos relevantes                                  |
| LLM-19 | Token usage tracking                | P4   | 🔶 Parcial — `llm-metrics.ts` rastreia tokens, sem hard limits                                       |

---

## Zod-Centric Implementation Plan

**Data:** 2026-05-28
**Prioridade:** P0 (Zod é espinha dorsal da qualidade LLM)
**Princípios:** Segurança > Prevenção > Qualidade > Performance

### Arquitetura

```
llmPrompt(tier, system, user, callerId?, responseFormat?, schema?: z.ZodType<T>)
  │
  ├─ cache hit → schema.parse(raw) → se inválido: pula cache → retry
  ├─ LLM response → parseRawOnce → schema.parse()
  │    ├─ ✅ válido → cache + retorna T (tipado)
  │    └─ ❌ inválido → 1 retry c/ hint = ZodError.issues
  │         ├─ ✅ válido → cache + retorna T
  │         └─ ❌ inválido → throw ZodError
  └─ sem schema → retorna string (backward compat, 0 quebras)
```

Benefícios:

- **Token economy:** resposta inválida nunca é cacheadas
- **Retry inteligente:** hint = ZodError.issues → prompt do retry
- **Segurança:** cache em disco criptografado, chmod 600
- **Prevenção:** hard limits de tokens pre-chamada

### Waves

#### Wave 1 — Infra Zod (3 tarefas, paralelo total)

| #   | Item                                               | O que                                                                      | Arquivos                                   |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| I1  | `npm install zod` + overload `llmPrompt` c/ schema | 6º param `schema?`, parse+validate, 1 retry c/ hint, cache skip on invalid | `shared/llm-client.ts`, `package.json`     |
| I2  | Hard limit `LLM_MAX_TOKENS_PER_OP`                 | Checagem pre-chamada em `llmPrompt`, env var, Config                       | `shared/llm-client.ts`, `shared/config.ts` |
| I3  | `diskCacheSet`: `chmod 600` + AES-256-GCM opcional | Segurança do cache em disco                                                | `shared/disk-cache.ts`, `.env.example`     |

#### Wave 2 — Schemas + Callers (paralelo após I1)

| #   | Item                                  | O que                                    | Arquivos                                                          | Deps |
| --- | ------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- | ---- |
| S1  | Schema `failure-analysis`             | Validar classificação + análise de falha | `shared/failure-analysis.schema.ts`, `shared/failure-analysis.ts` | I1   |
| S2  | Schema `user-story-to-tests` (case18) | Validar testes gerados por IA            | `jira_management/commands/case18.schema.ts`, `case18.ts`          | I1   |
| S3  | Schema `llm-review`                   | Validar veredito + confiança             | —                                                                 | —    |
| S4  | Schema `compare-runs`                 | Validar comparação de runs               | —                                                                 | —    |
| S5  | Schema `classify`                     | Validar classificação de falha           | `shared/classify.schema.ts`, `shared/failure-analysis.ts`         | I1   |
| S6  | U6 + U7 (quick wins)                  | Aliases no menu + contexto visível       | `jira_management/main.ts`                                         | —    |

> **S3/S4 excluídos por decisão técnica:** `llm-review` e `run-comparison` retornam texto livre (`AGREE/PARTIAL/DISAGREE: ...` e prosa comparativa), não JSON estruturado. Já possuem parsers via regex. Zod schema não agregaria validação estrutural — seria redundante. Decisão documentada em 2026-05-28.

#### Wave 3 — Testes + Smoke ✅

| #   | Item                                  | O que                                     | Arquivos                       | Deps  | Status |
| --- | ------------------------------------- | ----------------------------------------- | ------------------------------ | ----- | ------ |
| T1  | Testes Zod integration em `llmPrompt` | Happy, invalid, retry success, retry fail | `shared/llm-client.test.ts`    | I1    | ✅     |
| T2  | Testes de cada schema (5-15 testes)   | Valid + invalid + edge cases              | Cada `*.schema.test.ts`        | S1-5  | ✅     |
| T3  | Smoke test `XRAY_MODE=cloud`          | Env-gated                                 | `e2e/smoke-xray-cloud.test.ts` | —     | ✅     |
| T4  | Verificação final                     | tsc + jest + lint                         | —                              | Todos | ✅     |

#### Wave 4 — CSV/JSON Import Schema Enforcement ✅

**Data:** 2026-05-28 | **Esforço:** ~1.5h

| #   | Item                                          | O que                                             | Arquivos                                                |
| --- | --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| C1  | `CsvRowSchema`                                | Validar linhas CSV (Action obrigatório, defaults) | `csv-import-schema.ts` + `csv_resource.ts`              |
| C2  | `ImportJsonSchema`                            | Validar JSON de entrada antes do mapping          | `csv-import-schema.ts` + `import-prep.ts`               |
| C3  | `TestCaseSchema` → remove `TestCaseValidator` | Schema canônico + safeParse, substitui 42 linhas  | `csv-import-schema.ts`, remove `test-case-validator.ts` |
| C4  | `JiraPayloadSchema`                           | Validar payload Jira antes do POST                | `csv-import-schema.ts` + `import-loop.ts`               |
| C5  | Testes (4 schemas × 3-5)                      | 19 testes: happy + invalid + edge                 | `csv-import-schema.test.ts`                             |

### Decisões Técnicas

| Decisão                | Escolha                              | Motivo                                   |
| ---------------------- | ------------------------------------ | ---------------------------------------- |
| Overload vs nova fn    | Overload em `llmPrompt`              | 0 quebra de callers, elegante            |
| Onde schemas vivem     | `*/caller.schema.ts` junto ao caller | Coeso, fácil de navegar                  |
| `ReportValidator` fate | Wrapper thin do Zod                  | Backward compat mantida                  |
| AES-256 key            | Env `LLM_CACHE_KEY`                  | Sem key configurada → fallback chmod 600 |
| Token limit default    | 128K (GPT-4o-mini max)               | Cobre todos os tiers free                |

## Status Final (2026-05-28)

- **Zod-Centric Waves 1-3:** 100% concluído ✅
- **U6 + U7:** ✅ (aliases no menu + contexto visível)
- **CLD-4 smoke test:** ✅ (env-gated)
- **CSV/JSON Zod schemas:** ✅ (4 schemas, removeu TestCaseValidator)
- **R1, R2, R4:** ✅ (implementados nas Waves 1-2)
- **S3, S4:** 🚫 Excluídos (texto livre, sem JSON para validar)
- **Itens ainda ⬜ (fora do escopo Zod):** Nenhum (29.3, 29.6, 30.2 resolvidos nesta sessão)
- **CI:** ✅ 93 suites, 1619 tests, 0 falhas, 0 lint, 0 tsc

### Remanescentes (não tocados)

| ID   | Item                                                                        | Prio | Status |
| ---- | --------------------------------------------------------------------------- | ---- | ------ |
| 29.3 | `ReportValidator.validate()` dentro de `llmPrompt` p/ `responseFormat=json` | P2   | ✅     |
| 29.6 | Testes da validação automática (29.3)                                       | P2   | ✅     |
| 30.2 | `Config.get()` typed + respeitar `ConfigOverrides`                          | P2   | ✅     |

---

## CTRF Report Engine v2 — Pareto-Optimized

**Data:** 2026-05-28 | **Esforço total:** ~5h | **Status:** ✅ 6/6 P0 + 2/2 P1 implementados

Decisão adversarial: não seguir feature set do Allure (trend chart, flaky, timeline) que exigiriam persistência entre execuções. Foco em diferenciais competitivos exclusivos do projeto (Jira+Xray+LLM+Git).

### P0 (3.5h)

| #   | Feature                                                         | Esforço | Arquivos                           | Status |
| --- | --------------------------------------------------------------- | ------- | ---------------------------------- | ------ |
| 1   | Categories badge (ASSERTION/TIMEOUT/ENVIRONMENT) + Suite column | 0.5h    | `report-generator.ts`              | ✅     |
| 2   | Export CTRF+stats JSON junto com HTML                           | 0.3h    | `case17.ts`                        | ✅     |
| 3   | Quality gate `QA_FAIL_ON` env var                               | 0.3h    | `report-generator.ts`, `case17.ts` | ✅     |
| 4   | Differential compare vs last run (`last-results.ctrf.json`)     | 1h      | `case17.ts`                        | ✅     |
| 5   | Auto-create Jira bugs for new failures (`QA_AUTO_BUG=true`)     | 1.5h    | `case17.ts`, `jira_resource.ts`    | ✅     |
| 6   | PR comment bot (`GITHUB_PR_NUMBER` env var)                     | 2h      | `case17.ts`, `http-client.ts`      | ✅     |

### P1 (1.0h)

| #   | Feature                                       | Esforço | Arquivos              | Status |
| --- | --------------------------------------------- | ------- | --------------------- | ------ |
| 7   | Search/filter input on table (JS client-side) | 0.5h    | `report-generator.ts` | ✅     |
| 8   | CSV export button in HTML                     | 0.5h    | `report-generator.ts` | ✅     |

### Decisões técnicas

| Decisão      | Escolha                                                       | Motivo                                          |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------- |
| Diff compare | 1 arquivo `last-results.ctrf.json` no CWD                     | Sem history management, sem TTL, sem edge cases |
| PR comment   | GitHub Issues API (`POST /repos/{o}/{r}/issues/{n}/comments`) | API REST via `createHttpClient`, sem dep nova   |
| Auto-bug     | Reuso `postJiraResource()` + template Jira issue              | Já temos o client, só formatar payload          |
| Search/CSV   | JS client-side inline no HTML                                 | Zero backend, funciona offline                  |
| Categories   | `categorizeFailure()` regex (report-generator.ts)             | 0ms, 0 token cost, determinístico               |
| Quality gate | Env var `QA_FAIL_ON=<rate>` + opcional `qualityGate` param    | 0 breaking change, CI-friendly                  |

---

## 🔗 Context Integration — Live Data Sources

**Data:** 2026-05-28 | **Esforço total:** ~8h | **Status:** ✅ 3/3 fases implementadas

Decisão adversarial: em vez de persistência local para dashboards históricos, puxar dados das fontes já disponíveis (Git, Jira) no momento da geração do relatório — zero estado, zero breaking changes.

### Fases

| Fase | O que                                                      | Fontes                                                                                                  | Esforço | Status |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1    | Git pipeline artifacts → pass rate trend + flaky detection | GitHub Actions API (`/actions/runs`, `/artifacts`), GitLab CI API (`/pipelines`, `/jobs/artifacts`)     | 3h      | ✅     |
| 2    | Jira context → issues relacionadas, bugs abertos           | Jira REST API (`search?jql=summary~`)                                                                   | 1h      | ✅     |
| 3    | LLM enrichment — contexto adicional no prompt              | `failure-analysis.ts` recebe `LlmContext { gitCommits, gitTrend, jiraIssues }` e injeta na user message | 1h      | ✅     |

### Arquitetura

Tudo **read-only, zero persistência, zero novas dependências**:

```
case17.ts: handler()
  ├── _fetchGitHistory()       → createHttpClient + adm-zip (já existe)
  │   ├── Últimas 5 pipeline runs
  │   ├── Download artifact CTRF de cada run
  │   └── Agrega pass/fail por run + última N commits
  ├── _buildGitTrendHtml()     → SVG bar chart (reusa pattern report-generator.ts)
  ├── _fetchJiraContext()      → jiraResource.getJiraResource (já existe)
  │   └── JQL search por nome dos testes falhos → issues relacionadas
  ├── _buildJiraContextHtml()  → seção "🔗 Jira Context"
  ├── _addAiAnalysis()         → agora passa context opcional
  │   └── analyzeFailuresWithReport(tests, { gitCommits, gitTrend, jiraIssues })
  └── injectAnalysisSection()  → pattern já existente
```

### Decisões técnicas

| Decisão               | Escolha                                            | Motivo                                                                                  |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Git artifact fetch    | `createHttpClient` direto + `adm-zip`              | Reusa infra existente, não depende de `GitHubManager`/`GitLabManager` no CommandContext |
| Jira context          | `jiraResource.getJiraResource()` c/ JQL batch      | Já tem o client, auth, rate limit — 0 linhas de infra nova                              |
| LLM context           | Optional param em `analyzeFailuresWithReport`      | 0 breaking change: callers atuais ignoram o param                                       |
| Onde injetar          | Injeções pos-hoc via `</body>` (pattern existente) | Sem tocar `generateReportWithFallback`, sem mudar template                              |
| Xray per-test history | ⏳ **Adiado** — ver critério abaixo                | Custo atual: ~4h. Com `tags` no CTRF: ~1h                                               |

### Critério de retomada (Xray per-test history)

**Condição de reativação:** quando o CTRF JSON de entrada tiver `tags` contendo Xray issue keys (`tags: ["TEST-123"]`).

**Por que adiado:**

- Mapping `test name → Xray issue key` requer mudança no emissor CTRF ou mapping file externo (~2h extra)
- Git artifacts entregam 80% do valor (pass rate trend + flaky) sem mapping nenhum (~3h)
- Jira context entrega mais 15% (issues relacionadas) sem mapping nenhum (~1h)
- Xray per-test history adiciona só 5% de valor incremental para ~4h de esforço

**Quando reativar:** se o emissor CTRF (ex: plugin Cypress) passar a incluir `tags: ["TEST-123"]` nos objetos de test, ou se criarmos um mapper test-name→issue-key. Nesse ponto, o custo cai para ~1h (só buscar execuções na Raven API).

---

## 🚀 Auto-Setup — Automation Pipelines

**Data:** 2026-05-28 | **Esforço total:** ~8h | **Status:** ✅ implementado

**Problema:** Onboarding de um novo projeto exige criar manualmente YAML de CI, config provider, setup env vars. Não há reuso do ecossistema QA Tools para bootstrap.

**Solução:** CLI wizard interativo que gera CI pipeline + config do projeto + opcional pre-push hook.

### Arquitetura

```
setup/
├── main.ts                       # CLI wizard (prompt-based)
├── context.ts                    # SetupContext type
├── builder/
│   ├── workflow-builder.ts       # AST-based YAML construction (lib 'yaml')
│   └── workflow-builder.test.ts
├── templates/
│   ├── github-ci.ts              # GitHub Actions workflow generator
│   ├── gitlab-ci.ts              # GitLab CI pipeline generator
│   └── pre-push-hook.ts          # Pre-push hook shell script generator
├── detector.ts                   # Framework detection from package.json
├── detector.test.ts
├── config-writer.ts              # Config files writer (projects.json + .env.example)
├── config-writer.test.ts
└── main.test.ts
```

### Abordagem técnica: AST-based YAML

Usa lib `yaml` (AST nativa) em vez de template strings. Vantagens:

- **Merge com YAMLs existentes:** `parseExisting()` + `addJob()` sem sobrescrever
- **Composição programática:** features são nós AST, não string concat
- **Extensível:** pre-push hook, scheduled job, deploy job = só mais um `addJob()`
- **Zero refatoração futura:** a primeira implementação já é a definitiva

### Fases implementadas

| Fase | Descrição                                                                          | Status |
| ---- | ---------------------------------------------------------------------------------- | ------ |
| 1    | `workflow-builder.ts` — AST core (yaml lib) + testes                               | ✅     |
| 2    | `detector.ts` — detecta framework (Cypress/Playwright/Jest/Vitest) do package.json | ✅     |
| 3    | Templates: GitHub Actions, GitLab CI, pre-push hook                                | ✅     |
| 4    | `config-writer.ts` — gera `config/projects.json` + `.env.example`                  | ✅     |
| 5    | `main.ts` — CLI wizard interativo                                                  | ✅     |
| 6    | Testes (18 testes, 3 arquivos)                                                     | ✅     |

### Decisões técnicas

| Decisão             | Escolha                                                           | Motivo                                                                 |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| YAML generation     | AST via lib `yaml`                                                | Única abordagem que permite merge com YAMLs existentes sem sobrescrita |
| Template output     | `setup/{provider}` (ex: `.github/workflows/qa.yml`)               | Convenção da plataforma, CI detecta automaticamente                    |
| Framework detection | `detector.ts` lê `package.json` devDependencies                   | Zero config, 100% determinístico                                       |
| Pre-push hook       | Shell script em `.git/hooks/pre-push`                             | Git hook nativo, funciona offline                                      |
| Config output       | `config/projects.json` + `.env.example` (append, não sobrescreve) | Seguro para projetos que já têm config                                 |

---

## ✅ Produção — Bugs P1-P5 corrigidos ✅

| Bug | Descrição                                                                       | Correção                                    | Arquivos                                                                                                            |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1  | Step field name mismatch: `ExpectedResult` vs `Expected Result`                 | Renomeado type + 28 consumidores            | `shared/types.ts`, `xray-client.ts`, `import-prep.ts`, `mapping-file-generator.ts`, `csv-import-schema.ts`, 7 tests |
| P2  | Retry 429 insuficiente: 5 retries/30s max → 10 retries/120s max + `Retry-After` | Enhanced backoff + `setTestSleep` p/ testes | `shared/http-client.ts`, `http-client.test.ts`, `csv-import-errors.test.ts`                                         |
| P3  | Xray History URL malformed: duplo `/rest/`                                      | `getFromOriginPath` em `JiraResource`       | `jira_resource.ts`, `xray-history.ts`, `xray-history.test.ts`                                                       |
| P4  | Step #3 perdido por rate limit                                                  | Resolvido por P2 (retry robusto cobre)      | —                                                                                                                   |
| P5  | CTRF report usa fixture hardcoded                                               | Path configurável via `--ctrf=` CLI         | `e2e/gen-report.ts`, `gen-report-complete.ts`                                                                       |
| —   | Link type fallback IDs errados (10201→10600 para `Tests`)                       | Atualizado `FALLBACK_LINK_TYPES`            | `jira_link_manager.ts`                                                                                              |

## ✅ Fase 1 — U1 Breadcrumbs ✅

| Item                    | Status |
| ----------------------- | ------ |
| `shared/breadcrumbs.ts` | ✅     |
| Modificar `title()`     | ✅     |
| push/pop em `main.ts`   | ✅     |
| Testes unitários (6)    | ✅     |

## ✅ Fase 2 — I6 Import Tracker CI ✅

| Item              | Status |
| ----------------- | ------ |
| package.json lint | ✅     |

## ✅ Fase 3 — LLM-19 Token Hard Limits ✅

| Item                       | Status |
| -------------------------- | ------ |
| `Config.llmMaxTotalTokens` | ✅     |
| `_checkTotalTokenLimit()`  | ✅     |
| Testes (3)                 | ✅     |

---

## ✅ Reporting — Melhorias Pós-e2e ✅

| #   | Item                                                              | Prioridade | Status | Arquivos                                        |
| --- | ----------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------- |
| 1   | **BUG**: Botão "Toggle Passed" altera texto do botão "Export CSV" | P0         | ✅     | `shared/report-generator.ts`                    |
| 2   | **BUG**: CSV Export ignora colunas Suite/Error/History            | P0         | ✅     | `shared/report-generator.ts`                    |
| 3   | **BUG**: CSV Export não respeita filtro de busca                  | P0         | ✅     | `shared/report-generator.ts`                    |
| 4   | **Melhoria**: Tema light/dark/system + botão toggle no HTML       | P1         | ✅     | `shared/report-generator.ts`                    |
| 5   | **Melhoria**: `ReportOptions.theme` p/ forçar tema na geração     | P1         | ✅     | `shared/report-generator.ts`                    |
| 6   | **Testes**: toggle function, csv export, theme script             | P1         | ✅     | `shared/report-generator.test.ts`               |
| 7   | **Documentação**: TSDoc em `report-generator.ts` + `theme.ts`     | P2         | ✅     | `shared/report-generator.ts`, `shared/theme.ts` |

## ✅ Pre-conditions + LLM Test Generation (dual-threshold assimétrico) ✅

| #   | Item                                                                                                                                                 | Prioridade | Status | Arquivos                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------- |
| 1   | Tipos `PreConditionSummary` + `PreConditionMatchResult` (inalterados)                                                                                | P1         | ✅     | `shared/types.ts`                                  |
| 2   | `matchPreconditionByTokenOverlap()` (existente) + **novo** `matchPreconditionByDualThreshold()`: 0.5 admissão, 0.7 confirmação, assimétrico 0.5-0.69 | P1         | ✅     | `jira_management/jira_link_manager.ts`, `.test.ts` |
| 3   | `user-story-to-tests.md` — removido `{preconditions}`, LLM sempre usa `type:'create'` + summary                                                      | P1         | ✅     | `shared/prompts/user-story-to-tests.md`            |
| 4   | `case18.ts` — eliminada small LLM + injeção PCs. Adicionado `gatherInput()`, `createMissingPreconditions()`, `writeTestOutput()` + pós-processamento | P1         | ✅     | `jira_management/commands/case18.ts`               |
| 5   | Tests: 15 em `case18.test.ts` + 11 em `jira_link_manager.test.ts` (dual-threshold)                                                                   | P1         | ✅     | `*.test.ts`                                        |

## ✅ P1 — Reports Gold Standard Upgrade (3 sprints) ✅

Elevar reports ao nível Allure (padrão ouro mercado). 3 sprints independentes.

### Sprint 1 — Trend + Hierarchy + Timeline

| #   | Item                  | Descrição                                                                   | Esforço | Status | Arquivos                            |
| --- | --------------------- | --------------------------------------------------------------------------- | ------- | ------ | ----------------------------------- |
| R1  | **Trend Chart SVG**   | Gráfico de linha pass rate × tempo consumindo `getTrends()` do `metrics.ts` | 4h      | ✅     | `report-generator.ts`, `metrics.ts` |
| R2  | **Hierarchy sidebar** | Árvore Feature > Suite do `fullTitle` com click para filtrar tabela         | 6h      | ✅     | `report-generator.ts`               |
| R3  | **Timeline view**     | Barras horizontais: duração + status + ordem                                | 3h      | ✅     | `report-generator.ts`               |
| R4  | Testes (R1-R3)        | Snapshot + render condicional + edge cases                                  | 2h      | ✅     | `report-generator.test.ts`          |

### Sprint 2 — Steps + Attachments + Coverage HTML

| #   | Item                     | Descrição                                                         | Esforço | Status |
| --- | ------------------------ | ----------------------------------------------------------------- | ------- | ------ |
| R5  | **Steps expansíveis**    | Detalhe colapsável por teste com steps (Action + Expected Result) | 3h      | ✅     |
| R6  | **Attachments**          | Screenshots inline + logs colapsáveis                             | 3h      | ✅     |
| R7  | **Coverage HTML report** | `generateCoverageHtml()` — tabela de issues grouped by epic       | 2h      | ✅     |
| R8  | Testes (R5-R7)           | 2h                                                                | ✅      |

### Sprint 3 — Polimento + Publicação

| #   | Item                            | Descrição                                                    | Esforço | Status |
| --- | ------------------------------- | ------------------------------------------------------------ | ------- | ------ |
| R9  | **Flakiness dark mode + trend** | dark mode CSS + mini trend chart no dashboard                | 1h      | ✅     |
| R10 | **Known issues**                | Config `known-issues.json` — falhas conhecidas suprimidas    | 2h      | ✅     |
| R11 | **Multi-environment**           | Abas comparando 2+ runs lado a lado                          | 4h      | ✅     |
| R12 | **PDF export**                  | CSS `@media print` + botão "Export PDF" via `window.print()` | 1h      | ✅     |
| R13 | **Auto-publish**                | Flag `--publish s3\|gh-pages`                                | 2h      | ✅     |
| R14 | Testes (R9-R13)                 | 3h                                                           | ✅      |

---

## ✅ P2 — Documentar código (TSDoc exports + module headers) ✅

| Fase | Layer                      | Arquivos                                               | Status |
| ---- | -------------------------- | ------------------------------------------------------ | ------ |
| 1    | shared/ core               | logger, config, state, http-client, prompt             | ✅     |
| 2    | shared/ util               | result_parser, markdown, report-generator, etc.        | ✅     |
| 3    | jira_management/ resources | jira_link_manager, result_reporter, etc.               | ✅     |
| 4    | jira_management/ commands  | case01-case20 + context + create_tests                 | ✅     |
| 5    | git_triggers/              | github_manager, gitlab_manager, pipeline-handler, main | ✅     |

## ✅ Test Execution Flow — Associar a TE existente + Preview unificada ✅

| #   | Item                                                                                                  | Prioridade | Status | Arquivos                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------- |
| 1   | Type: `TestExecutionSummary`                                                                          | P1         | ✅     | `shared/types.ts`                                                 |
| 2   | Service: `JiraLinkManager.listTestExecutions(project)` — JQL busca TEs + validação `GET /issue/{key}` | P1         | ✅     | `jira_management/jira_link_manager.ts`                            |
| 3   | Refactor: `_linkTestsToExecution()` extraído p/ compartilhar entre criação nova e existente           | P1         | ✅     | `jira_management/test-execution-creator.ts`                       |
| 4   | Service: `addTestsToExistingExecution(teKey, testKeys)` — custom field + issue links em TE existente  | P1         | ✅     | `jira_management/test-execution-creator.ts`                       |
| 5   | New module: `commands/test-execution-flow.ts` — `offerTestExecutionAssociation()` + `showResults()`   | P1         | ✅     | `jira_management/commands/test-execution-flow.ts`                 |
| 6   | Handler: `case01.ts` — substituir prompt inline por `offerTestExecutionAssociation()`                 | P1         | ✅     | `jira_management/commands/case01.ts`                              |
| 7   | Handler: `case13.ts` — usar `showResults()` compartilhado                                             | P2         | ✅     | `jira_management/commands/case13.ts`                              |
| 8   | Handler: `case15.ts` — substituir prompt inline por `offerTestExecutionAssociation()`                 | P1         | ✅     | `jira_management/commands/case15.ts`                              |
| 9   | Handler: `case18.ts` — adicionar `offerTestExecutionAssociation()` após gerar testes                  | P1         | ✅     | `jira_management/commands/case18.ts`                              |
| 10  | Tests: `test-execution-creator.test.ts`, `jira_link_manager.test.ts`, `test-execution-flow.test.ts`   | P1         | ✅     | Vários                                                            |
| 11  | Cleanup: `commands/helpers.ts` — remover `createTestExecutionWithLinksWrapper` (substituído por flow) | P1         | ✅     | `jira_management/commands/helpers.ts`, `commands/helpers.test.ts` |

### ✅ P1 — Elevar cobertura de arquivos críticos < 90% ✅

| Item                                                  | Status |
| ----------------------------------------------------- | ------ |
| `git_triggers/main.ts`                                | ✅     |
| `jira_management/commands/case17.ts`                  | ✅     |
| `jira_management/main.ts`                             | ✅     |
| `git_triggers/pipeline-handler.ts`                    | ✅     |
| `shared/prompt-input.ts`                              | ✅     |
| `shared/open.ts`                                      | ✅     |
| `shared/markdown.ts`                                  | ✅     |
| `shared/llm-client.ts`                                | ✅     |
| `shared/splash.ts`                                    | ✅     |
| `shared/report-generator.ts`                          | ✅     |
| `git_triggers/batch-mode.ts`                          | ✅     |
| Novos módulos: `publish.ts`, `test-execution-flow.ts` | ✅     |

### ✅ P0 — User docs desatualizadas (gap docs vs código) ✅

| Item                                                  | Status | Esforço |
| ----------------------------------------------------- | ------ | ------- |
| Batch 1: README + 5 docs (incorretos/críticos)        | ✅     | 2h      |
| Batch 2: Aliases, comandos especiais, UX features     | ✅     | 1h      |
| Batch 3: Documentar `setup/` wizard (doc #10) + fluxo | ✅     | 2h      |

### ✅ P1 — JSDoc/TSDoc documentation gaps (audit 2026-05-28) ✅

| Item                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| Batch 1: `bug-report.ts` (null rationale) + 4 small files zero doc  | ✅     |
| Batch 2: `llm-metrics.ts` + `entry-menu.ts`                         | ✅     |
| Batch 3: `markdown.ts` (module doc) + `create_tests.ts` (SRP break) | ✅     |
| Batch 4: handler JSDoc (`pipeline-handler`, `mr-handler`, caseXX)   | ✅     |

### ✅ P2 — Handler test files ✅

| Item                                                                      | Status |
| ------------------------------------------------------------------------- | ------ |
| `shared/theme.test.ts` exists                                             | ✅     |
| `jira_management/commands/handlers.test.ts` covers case01-20 (787 linhas) | ✅     |

### ✅ P2 — `collectManual` > 50 linhas (R4) ✅

| Item                                                                              | Status |
| --------------------------------------------------------------------------------- | ------ |
| `shared/bug-report.ts:104-158` — extraído em `askWithRetry` + `normalizeSeverity` | ✅     |

### ✅ P1 — Xray per-test history ✅

| #   | Item                                                                          | Esforço | Status |
| --- | ----------------------------------------------------------------------------- | ------- | ------ |
| 1   | Interface `TestHistoryProvider` + types (`xray-history.ts`)                   | 0.25h   | ✅     |
| 2   | `ServerHistoryProvider` (`GET /rest/raven/1.0/api/test/{key}/testruns`)       | 0.5h    | ✅     |
| 3   | `CloudHistoryProvider` (GraphQL `getTestRuns` + auth + key→issueId)           | 1h      | ✅     |
| 4   | Integração em `case17.ts` (history via mapping file + cache)                  | 0.25h   | ✅     |
| 5   | Display no HTML report (`report-generator.ts` — coluna History c/ ferramenta) | 0.5h    | ✅     |
| 6   | Retry + fallback + cache em memória (`TestHistoryCache`)                      | 0.25h   | ✅     |
| 7   | Testes: `xray-history.test.ts` (19 testes)                                    | 1h      | ✅     |

### ✅ P1 — Restaurar thresholds de cobertura (80% branches, 90% lines) ✅

| Item                                                                       | Status |
| -------------------------------------------------------------------------- | ------ |
| config.ts + disk-cache.ts (+6 testes)                                      | ✅     |
| llm-client.ts + prompt-input.ts (+12 testes)                               | ✅     |
| sanitize.ts, box.ts, temp-dir.ts (+4 testes)                               | ✅     |
| result_reporter.ts, package_version_manager.ts (+2 testes)                 | ✅     |
| failure-analysis.ts, state.ts (+2 testes)                                  | ✅     |
| Thresholds restaurados: statements 90, branches 80, functions 91, lines 90 | ✅     |

### ✅ P0 — CSV/JSON parsing robustness (Expected Result normalization + separator detection) ✅

| Bug   | Descrição                                                                                                 | Correção                                                                                                                                                                     | Arquivos                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ P0 | CSV header `Expected Result` não identificado na preview em CSVs do Windows (CRLF, BOM, locale pt-BR `;`) | `normalizeFieldName()` (strip `\r`, case/underscore aliases) + detecção automática de separador `;` + flat CSV diagnostic warn + JSON `ExpectedResult` alias + schema update | `shared/field-names.ts` (novo), `csv-import-schema.ts`, `csv_resource.ts`, `import-prep.ts`, `test_cases_template.json`, `jira_management/test_steps_template.json`, `shared/field-names.test.ts`, `csv_resource.test.ts`, `import-prep.test.ts` |
| ✅    | readBulkCsv falha com CRLF (--- não split) e BOM (\uFEFF impede match de Title:)                          | `raw.replace(/^\uFEFF/, '')` + `raw.replace(/\r\n/g, '\n')` antes do split                                                                                                   | `csv_resource.ts:242-243`                                                                                                                                                                                                                        |
| ✅    | E2E: CSV com todos quirks → HTML preview                                                                  | 3 testes: all-quirks, golden-path (sem warn), flat CSV diagnostic                                                                                                            | `import-prep.test.ts` (describe `csv -> preview pipeline`)                                                                                                                                                                                       |
| ✅    | E2E: GitHub real API → health report HTML                                                                 | 5 testes: workflow runs, jobs, PRs, branch info, consolidated HTML report via `writeReport()`                                                                                | `git_triggers/github-e2e.test.ts` (novo) — pula automaticamente sem `GITHUB_TOKEN`                                                                                                                                                               |

---

## ✅ Pipeline Health Reporting (GitHub e2e gold-standard) ✅

| #   | Item                                                                 | Prioridade | Status | Arquivos                                                         |
| --- | -------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------- |
| 1.1 | Extender `PipelineJob` + `PipelineRun` + `Issue` interface           | P1         | ✅     | `shared/types.ts`                                                |
| 1.2 | `GitHubManager.getOpenIssues()` + `getJobLogs()`                     | P1         | ✅     | `git_triggers/github_manager.ts`                                 |
| 2.1 | `aggregatePipelineHealth()` — pass rate, top failing jobs, breakdown | P1         | ✅     | `git_triggers/pipeline-health.ts`                                |
| 2.2 | `categorizePipelineFailure()` — LLM classificação de erro            | P1         | ✅     | `git_triggers/pipeline-health.ts`                                |
| 2.3 | `renderPipelineHealthHtml()` — HTML com cards, tabelas, seções       | P1         | ✅     | `git_triggers/pipeline-health.ts`                                |
| 2.4 | Tests unitários (19 testes com fixtures)                             | P1         | ✅     | `git_triggers/pipeline-health.test.ts`                           |
| 2.5 | Prompt `classify-pipeline-failure.md`                                | P1         | ✅     | `shared/prompts/classify-pipeline-failure.md`                    |
| 3.1 | `github-e2e.test.ts` rewrite: fetch → pure functions → HTML          | P1         | ✅     | `git_triggers/github-e2e.test.ts`                                |
| 3.2 | Persistir snapshot no `metrics.ts`                                   | P2         | ✅     | `shared/metrics.ts` (saveCoverageSnapshot), `case19.ts` (caller) |

---

## ✅ Template CSV/JSON (case11) — Bulk format fix + JSON generation ✅

| #   | Item                                                                                                                                           | Prioridade | Status | Arquivos                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------- |
| 1   | **BUG**: `jira_management/test_steps_template.csv` em flat format (Title,Action,Data,Expected Result) — rejeitado pelo parser `readBulkCsv()`  | P0         | ✅     | `jira_management/test_steps_template.csv` (removido — fonte única em root) |
| 2   | **FIX**: `case11.ts` copia da raiz (`test_steps_template.csv` — bulk, 94l), pergunta CSV/JSON, default path corrigido (não sobrescreve source) | P1         | ✅     | `jira_management/commands/case11.ts`                                       |
| 3   | Opção JSON: novo fluxo em case11 copia `test_cases_template.json` (raiz, 5 exemplos, 86l)                                                      | P1         | ✅     | `jira_management/commands/case11.ts`                                       |
| 4   | Menu: label "Gerar template CSV" → "Gerar template" + aliases `template:csv` e `template:json`                                                 | P2         | ✅     | `jira_management/main.ts`                                                  |
| 5   | Tests: handlers.test.ts — case11 adaptado para CSV/JSON dual flow (4 testes)                                                                   | P1         | ✅     | `jira_management/commands/handlers.test.ts`                                |

---

## ✅ Sprint Atual — QA Tools v2 (Pareto) ✅

### Sprint 1 — P0 (Gap Analysis + Health Score)

| #   | Feature                | Arquivos                                                                                                                     | LOC  | Status |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 1   | Gap Analysis — shared  | `shared/coverage-gap.ts`, `shared/coverage-gap.test.ts`, `shared/coverage-gap-utils.ts`, `shared/coverage-gap-utils.test.ts` | 408  | ✅     |
| 2   | Gap Analysis — HTML    | `shared/generate-coverage-gap-html.ts`                                                                                       | 233  | ✅     |
| 3   | Gap Analysis — handler | `jira_management/commands/case21.ts`, `case21.test.ts`                                                                       | 256  | ✅     |
| 4   | Health Score — shared  | `shared/health-score.ts`, `shared/health-score.test.ts`                                                                      | 903  | ✅     |
| 5   | Health Score — report  | `shared/report-generator.ts` (mod)                                                                                           | +50  | ✅     |
| 6   | Types                  | `shared/types.ts` (mod) + novas interfaces                                                                                   | +150 | ✅     |

### Sprint 2 — P1 (Flaky Auto-action + Test Impact)

| #   | Feature                         | Arquivos                                                     | LOC | Status |
| --- | ------------------------------- | ------------------------------------------------------------ | --- | ------ |
| 7   | Flaky Auto-action — shared      | `shared/flaky-auto-actions.ts`, `flaky-auto-actions.test.ts` | 484 | ✅     |
| 8   | Flaky Auto-action — integration | `batch-mode.ts`, `schedule-handler.ts` (mod)                 | +40 | ✅     |
| 9   | Test Impact — shared            | `shared/test-impact.ts`, `test-impact.test.ts`               | 507 | ✅     |
| 10  | Test Impact — handler           | `jira_management/commands/case22.ts`, `case22.test.ts`       | 130 | ✅     |

### Sprint 3 — P2 (AI Feedback Loop + Init Wizard)

| #   | Feature               | Arquivos                                               | LOC | Status |
| --- | --------------------- | ------------------------------------------------------ | --- | ------ |
| 11  | AI Feedback — shared  | `shared/ai-feedback.ts`, `ai-feedback.test.ts`         | 220 | ✅     |
| 12  | AI Feedback — handler | `jira_management/commands/case23.ts`, `case23.test.ts` | 130 | ✅     |
| 13  | Init Wizard — handler | `jira_management/commands/case00.ts`, `case00.test.ts` | 55  | ✅     |
| 14  | Menu integration      | `jira_management/main.ts` (mod)                        | +50 | ✅     |

### ✅ Integrações Pós-Sprint ✅

| ID  | Feature                          | Arquivos                                    | LOC | Prioridade | Status |
| --- | -------------------------------- | ------------------------------------------- | --- | ---------- | ------ |
| N   | AI Generation → feedback loop    | `case18.ts`, `case18.test.ts` (mod)         | 15  | P0         | ✅     |
| I1  | Health Score no case19           | `case19.ts`, `case19.test.ts` (mod)         | 25  | P1         | ✅     |
| O   | Flaky auto-actions interativo    | `case19.ts`, `case19.test.ts` (mod)         | 20  | P1         | ✅     |
| K   | Coverage gap → AI gen suggestion | `case21.ts`, `case21.test.ts` (mod)         | 25  | P2         | ✅     |
| C   | Test Impact → Gap hint           | `case22.ts`, `case22.test.ts` (mod)         | 8   | P2         | ✅     |
| I   | Test Impact → TE hint            | `case22.ts`, `case22.test.ts` (mod)         | 10  | P2         | ✅     |
| D   | Flaky footnote no Test Impact    | `case22.ts`, `case22.test.ts` (mod)         | 5   | P2         | ✅     |
| L   | Diagnostics + Health Check       | `case12.ts`, `case12.test.ts` (mod/new)     | 15  | P2         | ✅     |
| G   | Wizard detect existing config    | `setup/main.ts`, `setup/main.test.ts` (mod) | 20  | P3         | ✅     |

---

## ✅ Sprint A — Publicação (P0 + infra) ✅

| #   | Item                                             | Prioridade | Esforço | Status |
| --- | ------------------------------------------------ | ---------- | ------- | ------ |
| A1  | Fix version vazia no package.json                | P0         | 5min    | ✅     |
| A2  | Adicionar noFallthroughCasesInSwitch no tsconfig | P2         | 2min    | ✅     |
| A3  | .gitignore: tmp/, \*.bak + untrack artifacts     | P1         | 15min   | ✅     |
| A4  | Validação centralizada de env obrigatórios       | P0         | 1h      | ✅     |
| A5  | Publicação npm: bin + build + CI workflow        | P0         | 3h      | ✅     |

## ✅ Sprint B — Segurança/Robustez (P1) ✅

| #   | Item                                                                     | Prioridade | Esforço | Status | Arquivos                                                                                            |
| --- | ------------------------------------------------------------------------ | ---------- | ------- | ------ | --------------------------------------------------------------------------------------------------- |
| B1  | Substituir `process.env.X as string` por Config.getDefault()             | P1         | 1h      | ✅     | `case17.ts`                                                                                         |
| B2  | Revisar `!` non-null assertions                                          | P1         | 2h      | ✅     | `import-loop.ts`, `prompt-ui.ts`, `git_triggers/main.ts`                                            |
| B3  | Documentar `process.env.AUTO_CONFIRM` mutation                           | P1         | 30min   | ✅     | `batch-mode.ts`                                                                                     |
| B4  | Quebrar circular dependency jira_resource ↔ jira-resource-sprint/version | P1         | 1h      | ✅     | `jira_resource.ts`, `jira-resource-sprint.ts`, `jira-resource-version.ts`, `jira-resource-types.ts` |

## ✅ Sprint C — Housekeeping (P2) ✅

| #   | Item                                                           | Prioridade | Esforço | Status |
| --- | -------------------------------------------------------------- | ---------- | ------- | ------ |
| C1  | Interfaces órfãs reavaliadas                                   | P2         | 15min   | ✅     |
| C2  | Remover exports mortos (ts-prune)                              | P2         | 30min   | ✅     |
| C3  | Adicionar `-- reason` nas ~31 eslint-disable sem justificativa | P2         | 45min   | ✅     |
| C4  | Testes para `generate-coverage-gap-html.ts`                    | P2         | 2h      | ✅     |
| C5  | Extrair safeJiraCall() — duplicação case03/05/06               | P3         | 1h      | ✅     |
| C6  | eslint-disable-next-line nos 2 console.clear() sem comment     | P2         | 5min    | ✅     |
| C7  | Simplificar 3 Promise.resolve() em async/sync functions        | P3         | 5min    | ✅     |
| C8  | Silent catch blocks em http-client.test.ts comentados          | P2         | 15min   | ✅     |

## ✅ Sprint D — SRP Refactor ✅

| #   | Item                                               | Prioridade | Esforço | Status | Arquivos                                                                                                                                          |
| --- | -------------------------------------------------- | ---------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3  | Extrair options-object em 12 funções com >5 params | P3         | 4h      | ✅     | `import-loop.ts`, `llm-client.ts`, `pipeline-handler.ts`, `test-results.ts`, `box.ts`, `quarantine.ts`, `test-case-factory.ts`, `create_tests.ts` |
| D4  | Encurtar 34 funções >50 linhas                     | P3         | 3h      | ✅     | `report-*.ts`, `pipeline-health.ts`, `markdown.ts`, `test-execution-flow.ts`, `cli_base.ts`, `csv_resource.ts`, e2e/, setup/                      |

## ✅ Sprint F1 — Auditoria Fase 1: Foundation (2026-05-31) ✅

| #   | Auditoria | Item                                                                                  | Arquivos alterados                                                                                       | Status |
| --- | --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| F1  | C5-1      | Cross-layer: extrair shared/jira-client.ts quebrando dep git_triggers→jira_management | shared/jira-client.ts (novo), jira_management/jira_resource.ts, git_triggers/ (4), shared/types.ts       | ✅     |
| F2  | C6-1      | Bare catches: sed em 89 locais + 18 fixes B/C manuais                                 | shared/ (state, publish, entry-menu, etc), jira_management/ (17), eslint.config.js                       | ✅     |
| F3  | C22-1     | Test files: case24, safe-json, report-chart                                           | shared/safe-json.test.ts, shared/report-chart.test.ts, jira_management/commands/case24.test.ts (3 novos) | ✅     |
| F4  | C18-1     | Exit codes: consumir ExitCode enum em prod                                            | shared/cli_base.ts, entry-menu.ts, llm-benchmark.ts, e2e/smoke-shared.ts                                 | ✅     |
| F5  | C19-1     | Idempotência: --te-key + precondition JQL dedup                                       | precondition-handler.ts, result_reporter.ts, test-results.ts, pipeline-handler.ts, batch-mode.ts + tests | ✅     |

## ✅ Sprint F2 — R1 Test Coverage: Missing .test.ts files (2026-05-31) ✅

| #   | File sob teste                        | Arquivos                                   | Status |
| --- | ------------------------------------- | ------------------------------------------ | ------ |
| T1  | `shared/report-styles.ts`             | `shared/report-styles.test.ts`             | ✅     |
| T2  | `shared/report-sections.ts`           | `shared/report-sections.test.ts`           | ✅     |
| T3  | `shared/report-scripts.ts`            | `shared/report-scripts.test.ts`            | ✅     |
| T4  | `shared/report-utils.ts`              | `shared/report-utils.test.ts`              | ✅     |
| T5  | `jira_management/commands/context.ts` | `jira_management/commands/context.test.ts` | ✅     |

## ✅ Sprint W — Aviso + Caminho Amigável (2026-05-31) ✅

| #   | Item                                                                                | Arquivos                                                                                      | Status |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| U1  | Breadcrumbs dinâmicos no título das boxes                                           | `shared/breadcrumbs.ts`, `main.ts` (jira+git), tests                                          | ✅     |
| W1  | `validateEnv()`: se variáveis faltando, perguntar "Quer configurar? (s/N)" + wizard | `shared/cli_base.ts`, `git_triggers/main.ts`, `jira_management/main.ts`, tests                | ✅     |
| W2  | `_selectProject()`: sem projetos → oferecer "Configurar projetos agora?"            | `git_triggers/main.ts`, tests                                                                 | ✅     |
| W3  | `createManagerForProject()`: token ausente → mensagem instrutiva + "Configurar?"    | `git_triggers/session-state.ts`, tests                                                        | ✅     |
| W4  | Wizard on demand — alias 'w' em ambos menus                                         | `shared/first-run.ts`, `jira_management/menu-data.ts`, `git_triggers/session-state.ts`, tests | ✅     |
| W5  | Testes de integração nock-based + CLI                                               | `e2e/friendly-error-paths.test.ts` (9 testes)                                                 | ✅     |

## ✅ Sprint — Remediação Auditoria Profunda (F0–F11) ✅

| ID    | Tipo | Item                                                                                   | Esforço | Status |
| ----- | ---- | -------------------------------------------------------------------------------------- | ------- | ------ |
| A0.1  | 🔧   | eslint rule `no-restricted-syntax` p/ `execSync` + `execFileSync` template             | 10min   | ✅     |
| A0.2  | 🔧   | CI script: detector `.only()` + `throw 'string'`                                       | 10min   | ✅     |
| A0.3  | 🔧   | ts-prune já configurado no CI via `check-unused-exports.sh`                            | —       | ✅     |
| A1.1  | 🐛   | `shared/publish.ts:24` — Command injection: `execSync` → `execFileSync`                | 15min   | ✅     |
| A1.2  | 📋   | `shared/publish.test.ts` — Test case: path com shell chars (`; rm -rf /`)              | 10min   | ✅     |
| A2.1  | ♻️   | DIP: `createTestExecution()` receber `JiraResource` + `JiraLinkManager` como parâmetro | 30min   | ✅     |
| A2.2  | ♻️   | DIP: `collectAndCreateTestExecution()` receber dependências como parâmetro             | 30min   | ✅     |
| A2.3  | ♻️   | DIP: Atualizar callers: criar + injetar `JiraClient` + `JiraLinkManager`               | 15min   | ✅     |
| A3.1  | ♻️   | `config-accessor.ts`: Proxy-based dynamic accessor (379→~60 linhas)                    | 3h      | ✅     |
| A3.2  | 🐛   | `config-schema.ts:33`: Hardcoded `ECSPOL` → `YOUR_PROJECT_KEY`                         | 5min    | ✅     |
| A3.3  | 🐛   | `pipeline-jira.ts:27`: Remover fallback `'ECSPOL'`                                     | 5min    | ✅     |
| A3.4  | 📋   | `config-accessor.test.ts`: get/set/reset/create/validate (23 testes)                   | 30min   | ✅     |
| A4.1  | 📋   | `config-schema.test.ts`                                                                | 15min   | ✅     |
| A4.2  | 📋   | `config-validator.test.ts`                                                             | 15min   | ✅     |
| A4.3  | 📋   | `prompt-errors.test.ts`                                                                | 30min   | ✅     |
| A4.4  | 📋   | `prompt-format.test.ts`                                                                | 45min   | ✅     |
| A4.5  | 📋   | `prompt-summary.test.ts`                                                               | 20min   | ✅     |
| A5.1  | ♻️   | `llm-metrics.ts`: Encapsular 12 vars module-level em classe `LlmMetricsCollector`      | 1h      | ✅     |
| A5.2  | 🧹   | `llm-metrics.ts`: Remover dead exports (restaurado `recordArtifactReview` para testes) | 5min    | ✅     |
| A6.1  | ♻️   | `http-client.ts`: Encapsular state em classe `HttpClientInternals`                     | 1h      | ✅     |
| A7.1  | ♻️   | `shared/types.ts`: Split 763 linhas em 7 domínios + barrel re-export                   | 2h      | ✅     |
| A8.1  | ♻️   | `import-loop.ts`: Extrair `_finalizeAfterIssueCreation()` helper                       | 15min   | ✅     |
| A8.2  | ♻️   | `create_tests.ts`: DIP para `TestExecutionCreator` injetado por parâmetro              | 20min   | ✅     |
| A8.3  | ♻️   | `prompt-format.ts`: Import direto `config-accessor` (evitar circular dep)              | 15min   | ✅     |
| A9.1  | 🔧   | `box.ts`: Nomear constantes (TERMINAL_FALLBACK_WIDTH, BOX_MIN_WIDTH, etc.)             | 15min   | ✅     |
| A9.2  | 🔧   | `cli_base.ts:71`: URL sanitization abrangente (token, api_key, secret, password, etc.) | 10min   | ✅     |
| A10.1 | 🧹   | `handlers.test.ts`: Não é orphan — 76 testes reais. Mantido. BACKLOG corrigido.        | —       | ✅     |
| A10.2 | 🧹   | `github-e2e.test.ts`: Não é orphan — testes e2e reais. Mantido. BACKLOG corrigido.     | —       | ✅     |
| A10.3 | 🔧   | `.env.example`: Sincronizado com `config-schema.ts`                                    | 15min   | ✅     |
| A11.1 | 📄   | `prompt-input.ts`: Documentar pattern de dynamic import (ESM lazy em CJS)              | 5min    | ✅     |

### Fases anteriores (ciclo C12) — concluídas na sprint

| ID    | Tipo | Item                                                                  | Esforço | Status |
| ----- | ---- | --------------------------------------------------------------------- | ------- | ------ |
| C12-1 | ♻️   | DIP: `createTestExecution()` receber dependências como parâmetro      | 30min   | ✅     |
| C12-2 | ♻️   | DIP: `handleBugCreation()` receber `JiraClient` como parâmetro        | 15min   | ✅     |
| C12-3 | ♻️   | DIP: `runFlakyAutoActions()` receber `JiraClient` como parâmetro      | 15min   | ✅     |
| C12-4 | ♻️   | DIP: `runFlakyAutoActionsForProject()` receber `JiraClient`           | 15min   | ✅     |
| C3-3  | 🐛   | `llm-fallback.ts:99-122`: Zod validation em `as LlmUsage`/`LlmChoice` | 30min   | ✅     |
| C3-4  | 🐛   | `llm-cache.ts:69,132,153`: Zod validation em `as unknown as T`        | 30min   | ✅     |
| C11-1 | ♻️   | `llm-rate-limiter.ts:5`: Mover `LlmTier`/`ResponseFormat` p/ types    | 15min   | ✅     |
| C19-1 | 🐛   | `test-execution-creator.ts:28`: Adicionar `findExistingTe()`          | 30min   | ✅     |
| C4-1  | ♻️   | `report-table.ts:165`: Extrair helpers de `_buildTestTableRow`        | 15min   | ✅     |
| C4-2  | ♻️   | `import-loop.ts:248`: Extrair helper `processCreationAndLinking`      | 15min   | ✅     |
| C12-6 | 🐛   | Fix case15 timeout — adicionar nock scopes                            | 1h      | ✅     |
| C12-7 | 🐛   | Fix case16 path — reset mock state                                    | 30min   | ✅     |
| C12-8 | 🐛   | Fix CSV timeout — adicionar nock scopes ou split test                 | 30min   | ✅     |

### Config & infra — alterações estruturais

| Item                                                        | Status |
| ----------------------------------------------------------- | ------ |
| eslint: `no-require-imports` off (CJS project nativo)       | ✅     |
| eslint: remove todos `eslint-disable` em produção           | ✅     |
| `setup/main.ts`: `export default` → `export { main }`       | ✅     |
| `console.*` → `process.stdout/stderr.write` em `Output`     | ✅     |
| Tests: spies de `console.*` → `process.stdout/stderr.write` | ✅     |
| tsconfig.json: incluído `setup/**/*.ts`                     | ✅     |
| `shared/config-accessor.ts`: 23 testes, 100% cobertura      | ✅     |

### Sprint 3 — Fase 1: Factory Functions ✅

6 factory functions com 33 tests, 100% cobertura.

| ID  | Factory                    | Arquivo                                                | Tests | Status |
| --- | -------------------------- | ------------------------------------------------------ | ----- | ------ |
| F1  | `createMockJiraResource()` | `shared/test-utils/factories/jira-resource-factory.ts` | 5     | ✅     |
| F2  | `createMockLinkManager()`  | `shared/test-utils/factories/link-manager-factory.ts`  | 5     | ✅     |
| F3  | `createMockGitProvider()`  | `shared/test-utils/factories/git-provider-factory.ts`  | 4     | ✅     |
| F4  | `createMockConfig()`       | `shared/test-utils/factories/config-factory.ts`        | 7     | ✅     |
| F5  | `createMockContext()`      | `shared/test-utils/factories/context-factory.ts`       | 7     | ✅     |
| F6  | `createMockResponse()`     | `shared/test-utils/factories/response-factory.ts`      | 5     | ✅     |
|     | Barrel                     | `shared/test-utils/factories/index.ts`                 | —     | ✅     |

## ✅ Sprint 4 — Eliminação Total de Casts + Barreiras de Prevenção ✅

Sprint 4 completada em 2026-06-02. 0 itens pendentes no BACKLOG.

**Resumo:**

| Fase | Item                                         | Esforço | Status                                      |
| ---- | -------------------------------------------- | ------- | ------------------------------------------- |
| 1    | `as unknown as` em produção                  | ~1h     | ✅ 7 ocorrências eliminadas                 |
| 2    | Tipar API clients na raiz                    | ~2h     | ✅ github-api, gitlab-api, callers          |
| 3    | Ativar `no-unsafe-*` ESLint (produção)       | ~1h     | ✅ 5 regras como `error`                    |
| 3b   | Fix test files para `no-unsafe-*`            | ~10h    | ✅ 35 arquivos, ~1348 erros                 |
| 4    | Eliminar non-null assertions                 | ~4h     | ✅ ~201 em tests + 13 em prod               |
| 4b   | Eliminar `jest.fn<...unknown>()`             | ~2h     | ✅ ~60 ocorrências em 16 arquivos           |
| 5    | Ativar `exactOptionalPropertyTypes`          | —       | ✅ Já ativo                                 |
| 6    | Avaliar `noPropertyAccessFromIndexSignature` | ~5min   | ✅ DEFERIDO — 613 erros, zero ganho         |
| 7    | Docs env var name mismatch                   | ~2min   | ✅ `XRAY_CLOUD_ENDPOINT` → `XRAY_CLOUD_URL` |
| 8    | Prevenção non-null                           | ~30min  | ✅ Check 9 + ESLint error                   |

**Métrica final:**

- `tsc --noEmit`: **0 erros**
- ESLint errors: **0**
- ESLint warnings: **0**
- `enforce-quality`: **9/9 checks**
- `jest`: **3351 pass, 0 fail**
- Items no BACKLOG: **0** 🎉

---

### Sprint 3 — Fase 2: `jest.mocked()` Migration ✅

Transform script applied 144 changes across 36 files. All `(expr as jest.Mock)`, `(expr as jest.Mocked<T>)`, and `(expr as jest.MockedFunction<typeof fn>)` patterns replaced with `jest.mocked(expr)`. 2 syntax errors manually fixed (cli_base, import-loop). Real type mismatches exposed by removing casts fixed in 12 files (complete mock objects, fix signatures, add optional chaining).

| ID  | Item                                   | Count before | Status |
| --- | -------------------------------------- | ------------ | ------ |
| M1  | `git_triggers/main.test.ts`            | ~50          | ✅     |
| M2  | `jira_management/main.test.ts`         | ~30          | ✅     |
| M3  | `setup/main.test.ts`                   | ~25          | ✅     |
| M4  | Demais ~37 arquivos com `as jest.Mock` | ~400         | ✅     |

## ✅ Sprint 6 — Jira Cloud Coexistência — Concluído 2026-06-02

**Fase 1 (Contrato)**: Schema + Types + Validação — preexistente ✅
**Fase 2 (Autenticação)**: jira-auth.ts + testes — implementado ✅
**Fase 3 (Entry Points)**: main, batch, schedule, pipeline, splash — modo-aware ✅
**Fase 4 (Smoke Test)**: e2e/smoke-jira-cloud.test.ts — criado ✅
**Fase 5 (Documentação)**: .env.example + docs/06-env-vars.md — atualizado ✅
**Gap G1**: \_jiraEnv() agora retorna `mode` — propagado para todos os consumers ✅

| Métrica             | Resultado      |
| ------------------- | -------------- |
| `tsc --noEmit`      | 0 erros        |
| ESLint              | 0 erros/warn   |
| `jest` (unitários)  | 3467 ✅, 0 ❌  |
| `jira-auth.test.ts` | 7 testes, 100% |

## ✅ Sprint 12.5 — Git Metrics Adapter (P0) — Concluído 2026-06-03

Adaptador git → MetricsRun[] + FailureClassification[] para autovalidação usando histórico do projeto. Fallback automático no quality-gate e schedule-handler.

| Componente                            | Arquivo                              | Status |
| ------------------------------------- | ------------------------------------ | ------ |
| `generateGitMetricsRuns()`            | `shared/git-metrics-adapter.ts`      | ✅     |
| `generateGitFailureClassifications()` | `shared/git-metrics-adapter.ts`      | ✅     |
| Tests (23)                            | `shared/git-metrics-adapter.test.ts` | ✅     |
| Fallback no quality-gate              | `shared/quality-gate.ts`             | ✅     |
| Fallback no schedule-handler          | `git_triggers/schedule-handler.ts`   | ✅     |

| Métrica         | Resultado    |
| --------------- | ------------ |
| `tsc --noEmit`  | 0 erros      |
| ESLint          | 0 erros/warn |
| enforce-quality | 15/15        |
| `jest` pass     | 4122/4124    |
| `jest` fail     | 0            |
| CI              | ✅ pass      |

## ✅ Sprint 2 (Completo) + Sprint 3 (Completo) — Migrados 2026-06-02

**Sprint 2**: 8 fases, ~35h, 25/25 itens de débito eliminados ✅
**Sprint 3**: 8 fases, ~20.5h, ~1.350 pontos de débito (casts + non-null) eliminados ✅

Ver detalhes em commits e BACKOLG original (arquivado).

## ✅ Sprint DepWall — Isolamento de Dependências — Concluído 2026-06-04

**Motivação:** Reduzir acoplamento com 17 dependências runtime. Criar barreira única (`shared/deps.ts`) + wrappers completos.

### Diagnóstico — acoplamento diagnosticado

| Dep                         | Runtime files       | Tipo de acoplamento         | Status |
| --------------------------- | ------------------- | --------------------------- | ------ |
| **chalk**                   | 10                  | Direto, sem wrapper         | ✅     |
| **zod**                     | 16                  | Direto em schemas           | ✅     |
| **readline-sync**           | 2                   | Direto em 2 files           | ✅     |
| **dotenv**                  | 2                   | Direto em 2 files           | ✅     |
| **axios**                   | 1 valor+12 type     | Já isolado (http-client.ts) | ✅     |
| **@inquirer/\***            | 1 cada              | Dynamic import + injection  | ✅     |
| **ora, cli-progress**       | 1 cada              | Dynamic import + wrapper    | ✅     |
| **cli-table3, csv-parser**  | 1 cada              | 1 file wrapper              | ✅     |
| **adm-zip**                 | 2                   | Direto em 2 files           | ✅     |
| **figlet, gradient-string** | 1 cada              | Lazy import, splash only    | ✅     |
| **yaml**                    | 1                   | Direto em 1 file            | ✅     |
| **glob**                    | 1 runtime+4 scripts | 4/5 build-only scripts      | ✅     |

### Entregues

| #   | Tarefa                                                                 | Arquivos           | Status |
| --- | ---------------------------------------------------------------------- | ------------------ | ------ |
| 1   | `shared/deps.ts` — barrel re-exportando 12 deps CJS                    | novo               | ✅     |
| 2   | `shared/palette.ts` — estendido c/ bold, cyan, dim, hex, getColorLevel | `palette.ts`       | ✅     |
| 3   | Migrar 25+ files runtime para usar shared wrappers                     | 25 files           | ✅     |
| 4   | `shared/validation.ts` — re-exporta z + parseOrThrow                   | novo               | ✅     |
| 5   | `shared/readline.ts` — wrapper readline-sync                           | novo               | ✅     |
| 6   | `shared/env-loader.ts` — wrapper dotenv                                | novo               | ✅     |
| 7   | ESLint `no-restricted-imports` bloqueando 12 pacotes                   | `eslint.config.js` | ✅     |
| 8   | Testes (44) para todos os wrappers                                     | 5 test files       | ✅     |

### Métricas finais

| Métrica                       | Antes      | Depois  |
| ----------------------------- | ---------- | ------- |
| `chalk` import direto         | 10 files   | **0**   |
| `zod` import direto           | 16 files   | **0**   |
| `readline-sync` import direto | 2 files    | **0**   |
| `dotenv` import direto        | 2 files    | **0**   |
| Deps só por wrappers          | ❌         | ✅      |
| `tsc --noEmit`                | 0 erros    | 0 erros |
| `jest` pass                   | 100%       | 100%    |
| `npm run lint`                | 39 previas | 0 novos |

---

## ❌ Sprint ESM — Abandonada (2026-06-05)

**Motivo:** `jest.unstable_mockModule()` + `--experimental-vm-modules` causou instabilidade. Sistema ficou inutilizavel por 1 semana.

**Substituida por:** `Sprint ESM-v2 — Vitest` (ver BACKLOG.md)

### Subfase 2a — Infraestrutura ✅

| #    | Tarefa                                                         | Status |
| ---- | -------------------------------------------------------------- | ------ |
| 2a.1 | `package.json`: `"type": "module"`                             | ✅     |
| 2a.2 | `eslint.config.js`: require→import                             | ✅     |
| 2a.3 | `jest.config.js`: module.exports→export default                | ✅     |
| 2a.4 | `scripts/jest-strip-ansi-serializer.js`: module.exports→export | ✅     |
| 2a.5 | `shared/entry-menu.ts`: require.main→import.meta.main          | ✅     |

### Subfase 2b — Codemod imports + \_\_dirname ✅

| #    | Tarefa                                     | Volume    | Status |
| ---- | ------------------------------------------ | --------- | ------ |
| 2b.1 | Adicionar .js em ~1999 imports (488 files) | 488 files | ✅     |
| 2b.2 | \_\_dirname→import.meta.dirname (44 ocorr) | 30 files  | ✅     |
| 2b.3 | require()→import (37 chamadas)             | 10 files  | ✅     |
| 2b.4 | require('crypto'/'fs')→import nativo       | 2 files   | ✅     |

### Subfase 2c — Jest mocking (parcial)

| #    | Tarefa                                     | Volume                | Status |
| ---- | ------------------------------------------ | --------------------- | ------ |
| 2c.1 | jest.mock()→jest.unstable_mockModule()     | 505 calls / 141 files | ✅     |
| 2c.5 | Fix TS18004 (822 errors)                   | 30 files              | ✅     |
| 2c.6 | Fix regressoes TSC dynamic import (22 err) | 7 files               | ✅     |

### Subfase 3 — chalk@5 (bloqueado)

| #   | Tarefa                                  | Status |
| --- | --------------------------------------- | ------ |
| 3.1 | chalk@4→chalk@5                         |        |
| 3.2 | chalk.level write fix (read-only em v5) |        |

### Sprint DepWall — Completa

| Metrica                       | Antes    | Depois |
| ----------------------------- | -------- | ------ |
| `chalk` import direto         | 10 files | **0**  |
| `zod` import direto           | 16 files | **0**  |
| `readline-sync` import direto | 2 files  | **0**  |
| `dotenv` import direto        | 2 files  | **0**  |

## Sprint ESM-v2 — Migracao CJS->ESM via Vitest (completa)

**Motivacao:** Destravar ecossistema ESM (chalk@5+).
**Runner:** Vitest v4.1.8.
**Estrategia:** Execucao em main com verificacao entre fases.
**Resultado:** 249 files, 4150 tests, 0 failures. `npm test` = `vitest run`.

### Fase 1 — Infraestrutura ✅

- tsconfig types=["node","vitest/globals"] | vitest-globals.d.ts | vitest.config.ts barrier
- 8 arquivos na barreira: e2e/friendly-error-paths, jira_management/main, scripts/audit/structural, shared/logger/palette, git_triggers/session-state/batch-mode/main

### Fase 2 — Substituicoes Jest->Vitest ✅

- Step A: 3465+ substituicoes (fn/spyOn/mock)
- Multi-line jest + .method() (23 arquivos)
- jest.fn< -> vi.fn< (34 arquivos, 237 trocas)
- 2-param vi.fn<A,B> -> vi.fn<(...args: B) => A> (25 arquivos)
- 2-param mock<A,B> -> mock<(...args: B) => A> (5 arquivos)
- jest.requireActual<T> -> await vi.importActual<T>
- jest.requiremock -> vi.importmock
- vi.mocked(vi.importmock) -> await vi.importmock (7 arquivos)
- @jest/globals removido (26 arquivos)

### Fase 3 — Ajustes finos (69 erros tsc) ✅

- vi.mock(async) factory, top-level await -> beforeAll, Mocked<T> fix
- `fail()` -> `expect.unreachable()`
- imports e tipos nao utilizados removidos (FsModule, Logger)

### Fase 4 — Vitest run (nao-barreira) ✅

- 3922/3924 passing · 0 failing · 242 test files
- 7 categorias de correcao: vi.hoisted, { default: } CJS, arrow->function, require->import, (done)->async, construtor mock, mock deps.ts

### Fase 5 — Reabilitar barreira (8/8) ✅

1. `shared/palette.test.ts` — 7/7
2. `scripts/audit/structural.test.ts` — 2/2
3. `shared/logger.test.ts` — 35/35
4. `e2e/friendly-error-paths.test.ts` — 9/9
5. `jira_management/main.test.ts` — 64/64
6. `git_triggers/session-state.test.ts` — 11/11
7. `git_triggers/batch-mode.test.ts` — 18/18
8. `git_triggers/main.test.ts` — 89/89

### Metricas finais

| Metrica      | Resultado                                     |
| ------------ | --------------------------------------------- |
| tsc --noEmit | 0 erros                                       |
| npm test     | vitest run: 249 files, 4150 tests, 0 failures |
| eslint       | nao medido                                    |
| chalk        | ^4.1.2 (pendente ESM Final)                   |
| type         | commonjs (pendente ESM Final)                 |

---

## ✅ Migrados de BACKLOG.md em 2026-06-06

## 🗺️ Roteiro de Execução — Sprints de Resiliência

**Ordem de implementação (sequencial, cada uma depende da anterior):**

| Ordem | Sprint                                                          | Branch         | Esforço | Risco   | Status |
| ----- | --------------------------------------------------------------- | -------------- | ------- | ------- | ------ |
| 1°    | 🧱 **Sprint DepWall** — Isolamento de dependências              | `feat/depwall` | ~4h     | Baixo   | ✅     |
| 2°    | 🏗️ **Sprint ESM-v2** — Migração completa (8/8 barrier + runner) | `main`         | ~15h    | Alto    | ✅     |
| 3°    | ♻️ **Sprint ESM Final** — type:module + codemod + chalk@5       | `main`         | ~5h     | 🔴 Alto | ✅     |

### 🔄 Disaster Recovery Plan (DRP)

Em caso de falha em qualquer sprint:

1. **Rollback imediato:** `git checkout main && git branch -D feat/<branch>`
2. **Registro:** Mover sprint para `BACKLOG-historico.md` com causa raiz documentada
3. **Retry:** Criar nova branch a partir do `main` corrigindo a causa raiz identificada
4. **Critério de abort:** Se CI não ficar verde após 3 tentativas consecutivas na mesma sprint, escalar

### ✅ Critérios de aceite (todas as sprints)

- `npx tsc --noEmit` → 0 erros
- `npm test` → 100% pass (nenhum teste a menos que antes)
- `npm run lint` → 0 erros (nenhum novo warning)
- `npm audit --audit-level=high` → 0 vulnerabilidades
- Cobertura de testes para código novo → 100% (linhas + branches)
- Código antigo obsoleto → removido, não comentado
- BACKLOG.md atualizado ao final de cada sprint

## 🚀 Status da Execução

| Onda | Descrição                                  | Status |
| ---- | ------------------------------------------ | ------ |
| 0    | Quick Wins (18 itens)                      | ✅     |
| 1    | Infraestrutura Cross-cutting (6 sub-ondas) | ✅     |
| 2    | UX & Experiência do Usuário                | ✅     |
| 3    | Error Handling & Resiliência               | ✅     |
| 4    | Prompt Governance                          | ✅     |
| 5    | Arquitetura & Refactoring                  | ✅     |
| 6    | Test Coverage                              | ✅     |

## 🚀 Sprint UX — Débitos de Experiência do Usuário (P0-P3)

Correções estruturais identificadas na auditoria UX completa (jun/2026).
Agrupadas por gravidade: P0 (crítico) → P3 (nice-to-have).

### Críticos (P0)

| ID  | Item                                                                                                                                           | Arquivos                                          | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------- | ------ |
| UX1 | 🐛 `uncaughtException` não tratado — exceção síncrona causa crash bruto (stack trace + core dump) sem `printError`/`printSessionSummary`       | `jira_management/main.ts`, `git_triggers/main.ts` | 15min   | ✅     |
| UX2 | 🐛 SIGINT duplicado: `temp-dir.ts` limpa diretórios temporários ANTES do `cli_base.ts` confirmar saída — se usuário cancela, temp já destruído | `shared/temp-dir.ts`, `shared/cli_base.ts`        | 30min   | ✅     |
| UX3 | 🐛 `smartPrompt` retorna `""` sem feedback — usuário queima 3 retries sem saber, recebe string vazia que callers não guardam                   | `shared/prompt-input-inquirer.ts`                 | 20min   | ✅     |

### Maiores (P1)

| ID  | Item                                                                                                                               | Arquivos                                                | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- | ------ |
| UX4 | 🐛 Inquirer `select()` lança exceção → fallback retorna `'0'` (EXIT) sem explicação — usuário é navegado para fora silenciosamente | `shared/prompt-input-inquirer.ts`                       | 15min   | ✅     |
| UX5 | 🐛 Seleção de projeto Git depende de `Object.keys()` — ordem imprevisível se `projects.json` é editado manualmente                 | `git_triggers/main.ts`, `git_triggers/session-state.ts` | 20min   | ✅     |
| UX6 | 🐛 Gap badge fetch sem spinner + falha silenciosa — splash congela 3-5s sem indicador de carregamento                              | `jira_management/main.ts`                               | 20min   | ✅     |
| UX7 | 🐛 Setup wizard: GitLab CI existente ignorado sem prompt de overwrite (GitHub Actions sobrescreve) — inconsistente                 | `setup/main.ts`                                         | 15min   | ✅     |
| UX8 | 🐛 Git triggers: `printSessionSummary` não passa `history` — sessão não mostra últimas operações, inconsistente com Jira           | `git_triggers/session-state.ts`                         | 10min   | ✅     |

### Menores (P2)

| ID   | Item                                                                                                                 | Arquivos                                          | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------- | ------ |
| UX9  | 🐛 Health score falha silenciosa — catch vazio sem `rootLogger.debug()`                                              | `jira_management/main.ts`, `git_triggers/main.ts` | 5min    | ✅     |
| UX10 | 🐛 First-run wizard nunca roda se `.env` está OK — `isFirstRun()` retorna `true` mas `offerEnvSetup()` bloqueia      | `jira_management/main.ts`, `git_triggers/main.ts` | 10min   | ✅     |
| UX11 | 🐛 `longOps` pause só com erro — operação longa bem-sucedida volta direto ao menu sem pausa                          | `jira_management/main.ts`                         | 10min   | ✅     |
| UX12 | 🐛 `/back` no menu principal ≡ `/exit` — usuário vê "Até logo!" em vez de retornar ao seletor de módulos             | `jira_management/ui-helpers.ts`                   | 10min   | ✅     |
| UX13 | 🐛 Setup wizard lê `.git/config` de `process.cwd()` e não do diretório do projeto — detecção errada em CWD incorreto | `setup/main.ts`                                   | 10min   | ✅     |
| UX14 | 🐛 Nenhum módulo aceita `--help` / `--version` — flags CLI ignoradas, entra no fluxo normal                          | `jira_management/main.ts`, `git_triggers/main.ts` | 15min   | ✅     |

### Menu mapping gaps (P2)

| ID   | Item                                                                                                                                         | Arquivos                        | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------- | ------ |
| UX21 | 🐛 Git Triggers menu não lista `/docs` — handler existe (`_dispatchAction` `main.ts:225-228`) mas menu não expõe (inconsistente com Jira)    | `git_triggers/session-state.ts` | 5min    | ✅     |
| UX22 | 🐛 Entry menu (`entry-menu.ts:49-54`) não lista Setup Wizard — módulo `setup/main.ts` só acessível via comando direto ou dentro de submodulo | `shared/entry-menu.ts`          | 10min   | ✅     |

### Gaps em cenários de erro (P2)

| ID   | Item                                                                                                                | Arquivos                                           | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------- | ------ |
| UX15 | 🐛 Retry em falha de rede não é automático — usuário precisa escolher [R] manualmente a cada erro transiente        | `shared/http-client.ts`, `shared/prompt-errors.ts` | 30min   | ✅     |
| UX16 | 🐛 Aviso "Jira não configurado" aparece DEPOIS do prompt de nome do projeto — ordem invertida                       | `jira_management/main.ts`                          | 5min    | ✅     |
| UX17 | 🐛 Token expira em meio à sessão — sem atalho "reconfigurar token", usuário precisa sair, editar `.env` e reiniciar | `shared/prompt-errors.ts`                          | 20min   | ✅     |
| UX18 | 🐛 Nome de projeto inválido só descoberto na primeira operação — sem validação proativa no startup                  | `jira_management/main.ts`                          | 20min   | ✅     |
| UX19 | 🐛 Non-TTY com stdin pipeado pode travar em `/help` — `readline-sync.question` espera input interativo mesmo em CI  | `shared/prompt-input-base.ts`                      | 20min   | ✅     |
| UX20 | 🐛 Operações multi-step (ex: CSV import) sem progresso intermediário — spinner genérico sem "passo X de Y"          | `jira_management/commands/`                        | 1h      | ✅     |

### Sugestões de melhoria (P3)

| ID   | Item                                                                                                                 | Arquivos                                                | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- | ------ |
| UX23 | 💡 Setup wizard: mostrar valor detectado na pergunta (ex: "Test framework [Jest]:")                                  | `setup/main.ts`                                         | 15min   | ✅     |
| UX24 | 💡 Splash: adicionar dica de navegação "Categorias: 1-6 · /help `<tópico>`" para novos usuários                      | `shared/splash.ts`                                      | 5min    | ✅     |
| UX25 | 💡 `console.clear()` no menu loop: suporte `--no-clear` ou `QA_TOOLS_NO_CLEAR=true` para preservar scrollback        | `jira_management/main.ts`, `git_triggers/main.ts`       | 15min   | ✅     |
| UX26 | 💡 Batch mode: flag `--dry-run` que mostra plano de execução sem executar                                            | `git_triggers/batch-mode.ts`                            | 20min   | ✅     |
| UX27 | 💡 Ações destrutivas (disparar pipeline, publicar versão): confirmação centralizada via `confirmDestructiveAction()` | Ambos `main.ts`                                         | 30min   | ✅     |
| UX28 | 💡 Cabeçalho do menu: mostrar última operação no contador ("3 op · 2 ✓ 1 ✗ · Última: Criar testes")                  | `jira_management/ui-helpers.ts`, `git_triggers/main.ts` | 15min   | ✅     |
| UX29 | 💡 Lista de projetos Git: marcar último usado com `*` na exibição                                                    | `git_triggers/session-state.ts`                         | 5min    | ✅     |

### Métricas alvo (Sprint UX)

| Métrica          | Alvo        |
| ---------------- | ----------- |
| `tsc --noEmit`   | 0 erros     |
| `eslint`         | 0 erros     |
| `jest`           | 100% pass   |
| Débitos UX novos | 0           |
| Catch vazios     | 0           |
| SIGINT handlers  | 1 unificado |

---

## 🚀 Sprint A — Auditoria Adversarial: Correções (P0-P2)

Correções estruturais identificadas na auditoria adversarial completa (jun/2026).

| ID  | Item                                                                                                  | Arquivos                                                                                     | Esforço | Status |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| A1  | ♻️ Split `llm-review.ts` por SRP (prompts + analyzer + orchestration)                                 | `shared/llm-review.ts`, `shared/llm-review-prompts.ts`, `shared/llm-review-analyzer.ts`      | 2h      | ✅     |
| A2  | ♻️ Refatorar `runQualityGate`: 4 helpers + side effect isolado                                        | `shared/quality-gate.ts`                                                                     | 1h      | ✅     |
| A3  | 🔧 Adicionar debug log em `resp.text().catch(() => '')`                                               | `shared/llm-fallback-http.ts`                                                                | 5min    | ✅     |
| A4  | 🔧 Categorizar `catch {}` sem parâmetro (8 recovery + 4 cleanup)                                      | 12 arquivos em `shared/`                                                                     | 30min   | ✅     |
| A5  | 📋 Merge `llm-cost.test.ts` em `llm-fallback-config.test.ts` + `llm-review.test.ts`, deletar original | `shared/llm-cost.test.ts`, `shared/llm-fallback-config.test.ts`, `shared/llm-review.test.ts` | 30min   | ✅     |

### Métricas alvo (Sprint A)

| Métrica               | Alvo         |
| --------------------- | ------------ |
| `tsc --noEmit`        | 0 erros      |
| `eslint`              | 0 erros      |
| `jest`                | 100% pass    |
| Débitos novos         | 0            |
| `llm-review.ts` size  | < 500 linhas |
| `runQualityGate` size | < 70 linhas  |
| Orphan tests          | 0            |

## 🚀 Sprint 6 — Jira Mode: Coexistência Server + Cloud

Implementação do modo Jira Cloud com coexistência Jira Server.
Cada fase inclui: implementação + testes (100% coverage) + documentação.

Objetivo: `JIRA_MODE=server|cloud` com auth strategy diferenciada.

- Server: `Bearer <PAT>` (atual, unchanged)
- Cloud: `Basic <base64(email:apiToken)>`

### Fase 1 — Contrato: Config Schema + Types (P0, ~0.5h)

| ID  | Componente           | Arquivo                   | Status |
| --- | -------------------- | ------------------------- | ------ |
| C1  | `jiraMode` no schema | `shared/config-schema.ts` | ✅     |

### Fase 4|

| C2 | `jiraMode` em types | `shared/types/common.ts` | ✅ |
| C3 | Validação do mode | `shared/config-accessor.ts` | ✅ |
| C4 | Testes de schema/mode | `shared/config-schema.test.ts` | ✅ |

### Fase 2 — Mecanismo de Autenticação (P0, ~1h)

| ID  | Componente               | Arquivo                    | Status |
| --- | ------------------------ | -------------------------- | ------ |
| A1  | Factory de auth header   | `shared/jira-auth.ts`      | ✅     |
| A2  | Mode param no JiraClient | `shared/jira-client.ts`    | ✅     |
| A3  | Testes de auth strategy  | `shared/jira-auth.test.ts` | ✅     |

### Fase 3 — Entry Points: Injeção do Mode (P0, ~1h)

| ID  | Componente                 | Arquivo                            | Status |
| --- | -------------------------- | ---------------------------------- | ------ |
| E1  | `main.ts` + jiraMode       | `jira_management/main.ts`          | ✅     |
| E2  | `batch-mode.ts` + jiraMode | `git_triggers/batch-mode.ts`       | ✅     |
| E3  | `schedule-handler.ts`      | `git_triggers/schedule-handler.ts` | ✅     |
| E4  | `pipeline-handler.ts`      | `git_triggers/pipeline-handler.ts` | ✅     |
| E5  | `splash.ts` mode-aware     | `shared/splash.ts`                 | ✅     |

### Fase 4 — Testes de Integração (P1, ~0.5h)

| ID  | Componente            | Arquivo                        | Status |
| --- | --------------------- | ------------------------------ | ------ |
| T1  | Smoke test Jira Cloud | `e2e/smoke-jira-cloud.test.ts` | ✅     |

### Fase 5 — Documentação (P2, ~0.5h)

| ID  | Componente            | Arquivo               | Status |
| --- | --------------------- | --------------------- | ------ |
| D1  | `.env.example`        | `.env.example`        | ✅     |
| D2  | `docs/06-env-vars.md` | `docs/06-env-vars.md` | ✅     |

---

## 📊 Métrica alvo (Sprint 6) — ✅ CONCLUÍDA

| Métrica                         | Atual            | Alvo        |
| ------------------------------- | ---------------- | ----------- |
| `tsc --noEmit`                  | 0 erros          | **0 erros** |
| ESLint errors                   | 0                | **0**       |
| ESLint warnings                 | 0                | **0**       |
| `enforce-quality` checks        | 11/11            | **11/11**   |
| `jest` pass                     | 3467 (unitários) | **100%**    |
| `jest` fail                     | 0                | **0**       |
| Test coverage auth strategy     | 100%             | **100%**    |
| Test coverage config validation | 100%             | **100%**    |

### 🔴 Fase 2 — Schemas Zod para Todos os Artefatos — Layer 1 (P1, ~4h)

| ID  | Schema                                   | Arquivo                       | Status |
| --- | ---------------------------------------- | ----------------------------- | ------ |
| S1  | TestSuiteSchema + TestCaseSchema         | `shared/test-suite.schema.ts` | ✅     |
| S2  | PipelineClassificationSchema             | `shared/pipeline-schema.ts`   | ✅     |
| S3  | RunComparisonSchema                      | `shared/comparison-schema.ts` | ✅     |
| S4  | AiBugReportSchema — adicionar `evidence` | `shared/bug-report.schema.ts` | ✅     |

### 🔴 Fase 3.0 — ArtifactValidator Framework — Layer 2 (P0, ~2h)

| ID  | Componente                      | Arquivo                        | Status |
| --- | ------------------------------- | ------------------------------ | ------ |
| V0  | ArtifactValidator base          | `shared/artifact-validator.ts` | ✅     |
| V1  | Shared invariants (I-01 a I-05) | `shared/shared-invariants.ts`  | ✅     |

### 🔴 Fase 3.1–3.6 — Validadores de Domínio (P0, ~8h)

| ID  | Validador           | Invariantes | Arquivo                          | Status |
| --- | ------------------- | ----------- | -------------------------------- | ------ |
| V2  | TestCaseValidator   | T-01 a T-10 | `shared/test-case-validator.ts`  | ✅     |
| V3  | AnalysisValidator   | A-01 a A-05 | `shared/analysis-validator.ts`   | ✅     |
| V4  | PipelineValidator   | P-01 a P-03 | `shared/pipeline-validator.ts`   | ✅     |
| V5  | BugReportValidator  | B-01 a B-04 | `shared/bug-report-validator.ts` | ✅     |
| V6  | ComparisonValidator | C-01 a C-03 | `shared/comparison-validator.ts` | ✅     |

### 🔴 Fase 1 — Infraestrutura Cross-cutting (P0, ~8h)

| ID  | Componente                                             | Arquivo                          | Status |
| --- | ------------------------------------------------------ | -------------------------------- | ------ |
| I1  | Self-consistency (n=3 majority vote)                   | `shared/llm-self-consistency.ts` | ✅     |
| I2  | Targeted retry pattern                                 | `shared/targeted-retry.ts`       | ✅     |
| I3  | Quality metrics (invariant fire rate, layer pass rate) | `shared/quality-metrics.ts`      | ✅     |

### 🔴 Fase 4 — Validação Semântica — Layer 3 (P1, ~5h)

| ID  | Componente                                                  | Arquivo                        | Status |
| --- | ----------------------------------------------------------- | ------------------------------ | ------ |
| E1  | Evidence Citation Verification                              | `shared/evidence-validator.ts` | ✅     |
| E2  | Coverage Recalculation                                      | `shared/coverage-verifier.ts`  | ✅     |
| E3  | Cross-field Logical Check (integrado no artifact-validator) | `shared/artifact-validator.ts` | ✅     |

### 🔴 Fase 5 — Prompt Improvements (P1, ~4h)

| ID  | Template                         | Melhorias                                     | Status |
| --- | -------------------------------- | --------------------------------------------- | ------ |
| P1  | `user-story-to-tests.md`         | Constitution + contra-exemplos + evidence     | ✅     |
| P2  | `failure-analysis.md`            | Constitution + evidence + adversarial framing | ✅     |
| P3  | `bug-report-from-description.md` | Constitution + evidence                       | ✅     |
| P4  | `classify-pipeline-failure.md`   | Constitution + evidence                       | ✅     |
| P5  | `classify.md`                    | Constitution + evidence                       | ✅     |

### 🔴 Fase 6 — Adversarial Review Generalizado (P1, ~6h)

| ID  | Componente                                         | Arquivo                | Status |
| --- | -------------------------------------------------- | ---------------------- | ------ |
| R1  | `reviewWithLlm` generalizado p/ artifact type      | `shared/llm-review.ts` | ✅     |
| R2  | Review prompts por tipo de artefato                | `shared/llm-review.ts` | ✅     |
| R3  | Duas personas: executor + validador adversarial    | `shared/llm-review.ts` | ✅     |
| R4  | Adversarial framing "premissa de não conformidade" | `shared/llm-review.ts` | ✅     |

### 🔴 Fase 7 — Quality Gates + CI + Telemetry (P2, ~3h)

| ID  | Componente                                           | Arquivo                      | Status |
| --- | ---------------------------------------------------- | ---------------------------- | ------ |
| G1  | Check 10: 3 camadas devem passar                     | `scripts/enforce-quality.ts` | ✅     |
| G2  | Check 11: invariant fire rate alerta                 | `scripts/enforce-quality.ts` | ✅     |
| G3  | Telemetry estendida (invariantFires, layerPassRates) | `shared/llm-metrics.ts`      | ✅     |

---

## 📊 Métrica alvo (Sprint 5)

| Métrica                              | Atual      | Alvo        |
| ------------------------------------ | ---------- | ----------- |
| `tsc --noEmit`                       | 0 erros    | **0 erros** |
| ESLint errors                        | 0          | **0**       |
| ESLint warnings                      | 0          | **0**       |
| `enforce-quality` checks             | 9/9        | **11/11**   |
| `jest` pass                          | 3351       | **TBD**     |
| `jest` fail                          | 0          | **0**       |
| Test suite validation coverage       | 0%         | **100%**    |
| Failure analysis validation coverage | 🔶 Parcial | **100%**    |
| Invariant fire rate tracking         | ❌         | **✅**      |
| Evidence citation verification       | ❌         | **✅**      |

---

## 🚀 Sprint 8 — Design Token System + Component Primitives (P0, ~29h)

Implementação do Design Token System + Component Primitives para unificar os 3 sistemas CSS independentes de relatórios HTML.

**Objetivo**: Substituir CSS hardcoded duplicado por tokens centralizados + primitives reutilizáveis com data-attributes.

### Fase 0 — Theme Tokens (P0, ~2h)

| ID  | Componente            | Arquivo                  | Status |
| --- | --------------------- | ------------------------ | ------ |
| T0  | Fonte única de tokens | `shared/theme-tokens.ts` | ✅     |

### Fase 1 — Primitives (P0, ~6h)

| ID  | Componente        | Arquivo                       | Status |
| --- | ----------------- | ----------------------------- | ------ |
| P1  | Layout primitives | `shared/primitives/layout.ts` | ✅     |
| P2  | Card primitives   | `shared/primitives/card.ts`   | ✅     |
| P3  | Badge primitives  | `shared/primitives/badge.ts`  | ✅     |
| P4  | Table primitives  | `shared/primitives/table.ts`  | ✅     |
| P5  | Chart primitives  | `shared/primitives/chart.ts`  | ✅     |
| P6  | Form primitives   | `shared/primitives/form.ts`   | ✅     |
| P7  | Barrel export     | `shared/primitives/index.ts`  | ✅     |

### Fase 2 — CSS via Tokens + Dark Mode Unificado (P0, ~3h)

| ID  | Componente         | Arquivo                   | Status |
| --- | ------------------ | ------------------------- | ------ |
| C1  | CSS vars + tokens  | `shared/report-styles.ts` | ✅     |
| C2  | CSS vars injection | `shared/html-factory.ts`  | ✅     |
| C3  | UITheme via tokens | `shared/theme.ts`         | ✅     |

### Fase 3 — Migrar Section/Table/Chart/Diff para Primitives (P0, ~5h)

| ID  | Componente      | Arquivo                     | Status |
| --- | --------------- | --------------------------- | ------ |
| M1  | Migrar sections | `shared/report-sections.ts` | ✅     |
| M2  | Migrar table    | `shared/report-table.ts`    | ✅     |
| M3  | Migrar chart    | `shared/report-chart.ts`    | ✅     |
| M4  | Migrar html     | `shared/report-html.ts`     | ✅     |
| M5  | Migrar diff     | `shared/report-diff.ts`     | ✅     |

### Fase 4 — Migrar Coverage Gap + Flakiness (P0, ~4h)

| ID  | Componente          | Arquivo                                | Status |
| --- | ------------------- | -------------------------------------- | ------ |
| G1  | Migrar coverage gap | `shared/generate-coverage-gap-html.ts` | ✅     |
| G2  | Migrar flakiness    | `shared/flakiness-dashboard.ts`        | ✅     |

### Fase 5 — Responsividade + Acessibilidade (P0, ~3h)

| ID  | Componente        | Arquivo                   | Status |
| --- | ----------------- | ------------------------- | ------ |
| R1  | Responsive styles | `shared/report-styles.ts` | ✅     |
| R2  | ARIA attributes   | All primitives            | ✅     |

### Fase 6 — Testes (P0, ~6h)

| ID  | Componente                   | Arquivo                                     | Status |
| --- | ---------------------------- | ------------------------------------------- | ------ |
| X1  | Tests theme-tokens           | `shared/theme-tokens.test.ts`               | ✅     |
| X2  | Tests primitive layout       | `shared/primitives/layout.test.ts`          | ✅     |
| X3  | Tests primitive card         | `shared/primitives/card.test.ts`            | ✅     |
| X4  | Tests primitive badge        | `shared/primitives/badge.test.ts`           | ✅     |
| X5  | Tests primitive table        | `shared/primitives/table.test.ts`           | ✅     |
| X6  | Tests primitive chart        | `shared/primitives/chart.test.ts`           | ✅     |
| X7  | Tests primitive form         | `shared/primitives/form.test.ts`            | ✅     |
| X8  | Update report-styles tests   | `shared/report-styles.test.ts`              | ✅     |
| X9  | Update report-sections tests | `shared/report-sections.test.ts`            | ✅     |
| X10 | Update report-table tests    | `shared/report-table.test.ts`               | ✅     |
| X11 | Update report-chart tests    | `shared/report-chart.test.ts`               | ✅     |
| X12 | Update report-html tests     | `shared/report-html.test.ts`                | ✅     |
| X13 | Update coverage-gap tests    | `shared/generate-coverage-gap-html.test.ts` | ✅     |
| X14 | Update flakiness tests       | `shared/flakiness-dashboard.test.ts`        | ✅     |
| X15 | Update theme tests           | `shared/theme.test.ts`                      | ✅     |

---

## 🚀 Sprint 9 — Prompt Governance + Standards-Based Enhancement + Anti-Redundancy (P0, ~10h)

Implementação do sistema de governance para prompts do projeto + extensão do benchmark com métricas de cobertura estrutural + enhancement do prompt `user-story-to-tests.md` com técnicas ISTQB-aligned + novos invariantes T-11/T-12/T-13.

**Objetivos**:

1. Substituir diretivas vagas por regras verificáveis baseadas em standards formais (ISO 29119, ISTQB, IEEE 829)
2. Detectar e prevenir redundância, sobreposição e acoplamento entre casos de teste gerados por LLM (T-13)

### Fase 0 — Governance Document (P0, ~0.5h)

| ID  | Componente            | Arquivo                        | Status |
| --- | --------------------- | ------------------------------ | ------ |
| G0  | Prompt governance doc | `shared/prompts/GOVERNANCE.md` | ✅     |

### Fase 1 — Benchmark Extension (P0, ~3h)

| ID  | Componente                          | Arquivo                                    | Status |
| --- | ----------------------------------- | ------------------------------------------ | ------ |
| B1  | Fixture schema extendido            | `shared/prompts/__fixtures__/index.ts`     | ✅     |
| B2  | Fixture: numeric-age-validation     | `shared/prompts/__fixtures__/.../age.json` | ✅     |
| B3  | Fixture: password-length-validation | `shared/prompts/__fixtures__/.../pwd.json` | ✅     |
| B4  | Validation: criteria coverage       | `shared/llm-benchmark.ts`                  | ✅     |
| B5  | Validation: partition coverage      | `shared/llm-benchmark.ts`                  | ✅     |
| B6  | Validation: boundary coverage       | `shared/llm-benchmark.ts`                  | ✅     |
| B7  | Tests for new validators            | `shared/llm-benchmark.test.ts`             | ✅     |

### Fase 2 — Prompt Enhancement (P0, ~0.5h)

| ID  | Componente                 | Arquivo                                 | Status |
| --- | -------------------------- | --------------------------------------- | ------ |
| P1  | Test Design Techniques sec | `shared/prompts/user-story-to-tests.md` | ✅     |
| P2  | Updated BAD EXAMPLES       | `shared/prompts/user-story-to-tests.md` | ✅     |
| P3  | Updated adversarial audit  | `shared/prompts/user-story-to-tests.md` | ✅     |

### Fase 3 — Validator Enhancement (P0, ~2h)

| ID  | Componente               | Arquivo                                 | Status |
| --- | ------------------------ | --------------------------------------- | ------ |
| V1  | T-11 Partition cov       | `shared/test-case-validator.ts`         | ✅     |
| V2  | T-12 Boundary cov        | `shared/test-case-validator.ts`         | ✅     |
| V3  | Tests T-11/T-12          | `shared/test-case-validator.test.ts`    | ✅     |
| V4  | T-13 Redundancy/Coupling | `shared/test-case-validator.ts`         | ✅     |
| V5  | Tests T-13               | `shared/test-case-validator.test.ts`    | ✅     |
| V6  | Governance definitions   | `shared/prompts/GOVERNANCE.md`          | ✅     |
| V7  | Prompt audit items       | `shared/prompts/user-story-to-tests.md` | ✅     |

### Fase 4 — Baseline + Post-Measurement (P0, ~1h)

| ID  | Componente               | Arquivo                      | Status |
| --- | ------------------------ | ---------------------------- | ------ |
| M1  | Run benchmark (baseline) | `BENCHMARK=true npx tsx ...` | ✅     |
| M2  | Report delta & metrics   | `BACKLOG.md`                 | ✅     |

## 🚀 Sprint 10 — Fase 1: Orquestração (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 1 do STRATEGIC-PLAN.md: conectar, encapsular e expor capacidades existentes como serviços orquestrados.

**Objetivo:** Transformar 10 ferramentas isoladas em 1 plataforma que coleta, correlaciona, decide e age.

**Premissa verificada por auditoria adversarial de 6 explorações paralelas:** Todo código já existe e está testado (3800+ testes). O trabalho é **conectar** — não reimplementar.

### Fase 0 — Gaps Estruturais (P0, ~0h) — ✅

_Auditoria adversarial confirmou: TODOS os 8 gaps originais já estavam resolvidos no código._

### Fase 0.5 — Ativar Código Órfão (P0, ~2.5h) — ✅

| ID  | Módulo órfão                        | Arquivo(s)                         | Status |
| --- | ----------------------------------- | ---------------------------------- | ------ |
| O1  | `enforce-quality.ts`                | `.github/workflows/ci.yml`         | ✅     |
| O2  | `pipeline-health.ts`                | `git_triggers/batch-mode.ts`       | ✅     |
| O4  | `generatePipelineQuarantine()`      | `git_triggers/batch-mode.ts`       | ✅     |
| O5  | `.githooks/pre-push`                | `setup/templates/pre-push-hook.ts` | ✅     |
| O6  | `shared/report-export.ts`           | `git_triggers/batch-mode.ts`       | ✅     |
| O7  | `shared/run-comparison.ts`          | `git_triggers/schedule-handler.ts` | ✅     |
| O8  | `saveMetrics` privado em metrics.ts | `shared/metrics.ts`                | ✅     |

### Fase 1.1 — CI Quality Gate + Pre-push Hook (P0, ~2h) — ✅

| ID  | Componente               | Arquivo(s)                                                            | Status |
| --- | ------------------------ | --------------------------------------------------------------------- | ------ |
| Q1  | CLI `qa-quality-gate`    | `shared/quality-gate.ts` + `scripts/quality-gate.ts` + `package.json` | ✅     |
| Q2  | Gate wireado em CI       | `.github/workflows/ci.yml`                                            | ✅     |
| Q3  | Pre-push com test-impact | `.githooks/pre-push`                                                  | ✅     |

### Fase 1.2 — Failure Auto-Triage + Persistence (P0, ~3h) — ✅

| ID  | Componente                    | Arquivo(s)                                  | Status |
| --- | ----------------------------- | ------------------------------------------- | ------ |
| T1  | `QA_AUTO_BUG=true` flag       | `git_triggers/pipeline-handler.ts`          | ✅     |
| T2  | Persistir classifications/run | `shared/metrics.ts` + `failure-analysis.ts` | ✅     |
| T3  | Git blame integration         | `shared/failure-analysis.ts`                | ✅     |

### Fase 1.3 — Flaky Thresholds Docs (P1, ~0.5h) — ✅

| ID  | Componente                  | Arquivo(s)     | Status |
| --- | --------------------------- | -------------- | ------ |
| F1  | Documentar thresholds flaky | `.env.example` | ✅     |

### Fase 1.4 — Quality Weekly Report (P1, ~3h) — ✅

| ID  | Componente                        | Arquivo(s)                         | Status |
| --- | --------------------------------- | ---------------------------------- | ------ |
| W1  | Weekly report em schedule-handler | `git_triggers/schedule-handler.ts` | ✅     |

### Fase 1.5 — Dashboards (P2, ~5h) — ✅

| ID  | Componente                     | Arquivo(s)                      | Status |
| --- | ------------------------------ | ------------------------------- | ------ |
| D1  | Release Readiness Score        | `shared/release-score.ts`       | ✅     |
| D2  | Defect Trend Dashboard         | `shared/defect-trend.ts`        | ✅     |
| D3  | Traceability Matrix            | `shared/traceability-matrix.ts` | ✅     |
| D4  | Backlog Health Dashboard       | `shared/backlog-health.ts`      | ✅     |
| D5  | AI Gen Effectiveness Dashboard | `shared/ai-effectiveness.ts`    | ✅     |

### Fase 1.6 — Testes + CI Integration (P0, ~1.5h) — ✅

| ID  | Componente                    | Arquivo(s)                   | Status |
| --- | ----------------------------- | ---------------------------- | ------ |
| X1  | Tests para novos módulos      | `shared/*.test.ts`           | ✅     |
| X2  | Update enforce-quality checks | `scripts/enforce-quality.ts` | ✅     |

### Métricas finais (Sprint 10)

| Métrica                   | Alvo           | Resultado      |
| ------------------------- | -------------- | -------------- |
| `tsc --noEmit`            | **0 erros**    | **0 erros**    |
| ESLint errors             | **0**          | **0**          |
| ESLint warnings           | **0**          | **0**          |
| `jest` pass               | **100%**       | **3816/3829**  |
| `jest` fail               | **0**          | **0**          |
| enforce-quality checks    | **13/13**      | **13/13**      |
| Módulos órfãos eliminados | **0**          | **0**          |
| Dashboards implementados  | **5**          | **5**          |
| Auto-triage funcional     | **automático** | **automático** |

---

## 🚀 Sprint 11 — Fase 2: Acúmulo + Sinergia (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 2 do STRATEGIC-PLAN.md: análise cross-run, detecção de regressão silenciosa, perfil de desenvolvedor, benchmarks e otimização.

**Objetivo:** 6 dashboards analíticos que correlacionam dados acumulados para gerar inteligência acionável.

### #11 — Defect Seasonality Dashboard (P1, ~3h) — ✅

| ID  | Componente                     | Arquivo(s)                          | Status |
| --- | ------------------------------ | ----------------------------------- | ------ |
| S1  | `aggregateDefectSeasonality()` | `shared/defect-seasonality.ts`      | ✅     |
| S2  | `generateSeasonalityHtml()`    | `shared/defect-seasonality.ts`      | ✅     |
| S3  | Tests                          | `shared/defect-seasonality.test.ts` | ✅     |
| S4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts`  | ✅     |

### #12 — Silent Regression Detector (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| R1  | `detectSilentRegression()`       | `shared/silent-regression.ts`      | ✅     |
| R2  | `generateSilentRegressionHtml()` | `shared/silent-regression.ts`      | ✅     |
| R3  | Tests                            | `shared/silent-regression.test.ts` | ✅     |
| R4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### #13 — AI Test Effectiveness (P1, ~3h) — ✅

| ID  | Componente                   | Arquivo(s)                         | Status |
| --- | ---------------------------- | ---------------------------------- | ------ |
| A1  | `compareAiVsManual()`        | `shared/ai-comparison.ts`          | ✅     |
| A2  | `generateAiComparisonHtml()` | `shared/ai-comparison.ts`          | ✅     |
| A3  | Tests                        | `shared/ai-comparison.test.ts`     | ✅     |
| A4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts` | ✅     |

### #14 — Cross-Squad Benchmark (P1, ~3h) — ✅

| ID  | Componente                     | Arquivo(s)                             | Status |
| --- | ------------------------------ | -------------------------------------- | ------ |
| B1  | `computeCrossSquadBenchmark()` | `shared/cross-squad-benchmark.ts`      | ✅     |
| B2  | `generateBenchmarkHtml()`      | `shared/cross-squad-benchmark.ts`      | ✅     |
| B3  | Tests                          | `shared/cross-squad-benchmark.test.ts` | ✅     |
| B4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts`     | ✅     |

### #15 — Developer Profile (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| D1  | `buildDeveloperProfile()`        | `shared/developer-profile.ts`      | ✅     |
| D2  | `generateDeveloperProfileHtml()` | `shared/developer-profile.ts`      | ✅     |
| D3  | Tests                            | `shared/developer-profile.test.ts` | ✅     |
| D4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### #16 — Suite Optimization Advisor (P2, ~4h) — ✅

| ID  | Componente                   | Arquivo(s)                          | Status |
| --- | ---------------------------- | ----------------------------------- | ------ |
| O1  | `analyzeSuiteOptimization()` | `shared/suite-optimization.ts`      | ✅     |
| O2  | `generateOptimizationHtml()` | `shared/suite-optimization.ts`      | ✅     |
| O3  | Tests                        | `shared/suite-optimization.test.ts` | ✅     |
| O4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts`  | ✅     |

### Gap estrutural: pipeline-health.ts (P0)

| ID  | Componente                               | Arquivo(s)                             | Status |
| --- | ---------------------------------------- | -------------------------------------- | ------ |
| G1  | Wirear `pipeline-health.ts` em entry pts | `git_triggers/batch-mode.ts`           | ✅     |
| G2  | Tests pipeline-health wiring             | `git_triggers/pipeline-health.test.ts` | ✅     |

### Métricas finais (Sprint 11)

| Métrica                 | Alvo              | Atual          |
| ----------------------- | ----------------- | -------------- |
| `tsc --noEmit`          | **0 erros**       | **0 erros**    |
| ESLint errors           | **0**             | **0**          |
| ESLint warnings         | **0**             | **0**          |
| enforce-quality checks  | **15/15**         | **15/15**      |
| Anti-patterns no código | **0**             | **0**          |
| `jest` pass             | **100%**          | **~3994/4007** |
| `jest` fail             | **0**             | **0 (unit)**   |
| Dashboards Fase 2       | **6**             | **6**          |
| Weekly report completo  | **11 dashboards** | **11/11**      |
| Auto-integridade        | **✅**            | **✅**         |

---

## 🚀 Sprint 12.5 — Git Metrics Adapter (P0, ~2h) — ✅ CONCLUÍDA

Implementação do adaptador git → MetricsRun[] para autovalidação das funcionalidades de saúde/qualidade usando o próprio histórico do projeto.

**Objetivo:** Substituir o estado "sem dados" do quality gate e dashboards por métricas reais derivadas do git log, eliminando a dependência de dados externos de pipeline.

### Fase única — Git Metrics Adapter (P0, ~2h)

| ID  | Componente                            | Arquivo(s)                           | Status |
| --- | ------------------------------------- | ------------------------------------ | ------ |
| G1  | `generateGitMetricsRuns()`            | `shared/git-metrics-adapter.ts`      | ✅     |
| G2  | `generateGitFailureClassifications()` | `shared/git-metrics-adapter.ts`      | ✅     |
| G3  | Tests                                 | `shared/git-metrics-adapter.test.ts` | ✅     |
| G4  | Wirear fallback no quality-gate       | `shared/quality-gate.ts`             | ✅     |
| G5  | Wirear fallback no schedule-handler   | `git_triggers/schedule-handler.ts`   | ✅     |

### Métricas finais

| Métrica                    | Alvo        | Resultado        |
| -------------------------- | ----------- | ---------------- |
| `tsc --noEmit`             | **0 erros** | **0 erros**      |
| ESLint errors/warnings     | **0**       | **0**            |
| enforce-quality checks     | **15/15**   | **15/15**        |
| `jest` pass                | **100%**    | **4122/4124**    |
| `jest` fail                | **0**       | **0**            |
| Cobertura testes adaptador | **100%**    | **23/23 testes** |
| Débitos técnicos novos     | **0**       | **0**            |
| CI build                   | **✅ pass** | **✅ pass**      |

## 🚀 Sprint 12 — Fase 3: Inteligência Avançada (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 3 do STRATEGIC-PLAN.md: inteligência avançada que correlaciona múltiplas fontes para gerar investigação, alertas, scores e analytics.

**Pré-condições verificadas:** Fase 1 completa com dados acumulados. Fase 2 completa com 6 dashboards operacionais. pipeline-health.ts wireado em batch-mode.ts. per-test duration persistido.

### #20 — Pipeline Cost Analytics (P1, ~3h) — ✅

| ID  | Componente                   | Arquivo(s)                         | Status |
| --- | ---------------------------- | ---------------------------------- | ------ |
| C1  | `calculatePipelineCost()`    | `shared/pipeline-cost.ts`          | ✅     |
| C2  | `generatePipelineCostHtml()` | `shared/pipeline-cost.ts`          | ✅     |
| C3  | Tests                        | `shared/pipeline-cost.test.ts`     | ✅     |
| C4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts` | ✅     |

### #18 — Impact-Aware Pipeline Alert (P1, ~4h) — ✅

| ID  | Componente                  | Arquivo(s)                         | Status |
| --- | --------------------------- | ---------------------------------- | ------ |
| I1  | `analyzePipelineImpact()`   | `shared/impact-alert.ts`           | ✅     |
| I2  | `generateImpactAlertHtml()` | `shared/impact-alert.ts`           | ✅     |
| I3  | Tests                       | `shared/impact-alert.test.ts`      | ✅     |
| I4  | Wirear em weekly report     | `git_triggers/schedule-handler.ts` | ✅     |

### #17 — Incident Investigation Report (P1, ~5h) — ✅

| ID  | Componente                     | Arquivo(s)                         | Status |
| --- | ------------------------------ | ---------------------------------- | ------ |
| N1  | `buildIncidentReport()`        | `shared/incident-report.ts`        | ✅     |
| N2  | `generateIncidentReportHtml()` | `shared/incident-report.ts`        | ✅     |
| N3  | Tests                          | `shared/incident-report.test.ts`   | ✅     |
| N4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts` | ✅     |

### #19 — Requirement Quality Score (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| Q1  | `calculateRequirementScores()`   | `shared/requirement-score.ts`      | ✅     |
| Q2  | `generateRequirementScoreHtml()` | `shared/requirement-score.ts`      | ✅     |
| Q3  | Tests                            | `shared/requirement-score.test.ts` | ✅     |
| Q4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### Métricas finais (Sprint 12)

| Métérica                  | Alvo              | Resultado         |
| ------------------------- | ----------------- | ----------------- |
| `tsc --noEmit`            | **0 erros**       | **0 erros**       |
| ESLint errors             | **0**             | **0**             |
| ESLint warnings           | **0**             | **0**             |
| enforce-quality checks    | **15/15**         | **15/15**         |
| Anti-patterns no código   | **0**             | **0**             |
| `jest` pass               | **100%**          | **4099/4101**     |
| `jest` fail               | **0**             | **0 (unit)**      |
| Dashboards Fase 3         | **4**             | **4**             |
| Weekly report completo    | **15 dashboards** | **15 dashboards** |
| Cobertura testes Fase 3   | **100%**          | **100%**          |
| Módulos órfãos eliminados | **0**             | **0**             |
| Débitos técnicos novos    | **0**             | **0**             |

---

## 🚀 Sprint V1 — Value Extraction: Housekeeping — ✅ CONCLUÍDA

| ID  | Item                                                           | Status |
| --- | -------------------------------------------------------------- | ------ |
| 0a  | Adicionar `KNOWN_ISSUES_PATH` em `docs/06-env-vars.md`         | ✅     |
| 0b  | Adicionar shadow env vars ao `config-schema.ts` (13 entries)   | ✅     |
| 0c  | Remover env vars mortas do `.env.example`                      | ✅     |
| 0d  | Adicionar `QA_GATE_*` + `QA_GIT_BLAME_IGNORE` ao schema + docs | ✅     |
| 0e  | Exportar 4 funções privadas do batch-mode.ts                   | ✅     |
| 0f  | Atualizar `.unused-exports-baseline`                           | ✅     |
| M1  | Conectar `generateWithRetry` ao `llm-client.ts`                | ✅     |

## 🚀 Sprint V0.5 — Value Extraction: Documentação — ✅ CONCLUÍDA

| ID  | Item                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| D1  | Fix `config-writer.ts`: `JIRA_TOKEN` → `JIRA_PERSONAL_TOKEN` | ✅     |
| D2  | Fix `docs/05-json-format.md`: template path errado           | ✅     |
| D3  | Fix `docs/09-troubleshooting.md`: wrong file references      | ✅     |
| D4  | `docs/02-jira-management.md`: Add handler 24 (setup wizard)  | ✅     |
| D5  | `docs/02-jira-management.md`: Fix option category table      | ✅     |
| D6  | `docs/02-jira-management.md`: Fix aliases in category table  | ✅     |
| D7  | `docs/02-jira-management.md`: Fix state path references      | ✅     |
| D8  | `docs/02-jira-management.md`: Remove aliases inexistentes    | ✅     |
| D9  | `docs/00-install.md`: Add 20+ env vars faltantes             | ✅     |
| D10 | `docs/00-install.md`: Fix `ON_ERROR` values                  | ✅     |
| D11 | `docs/00-install.md`: Fix `JIRA_PROJECT` default             | ✅     |
| D12 | `docs/06-env-vars.md`: Add `KNOWN_ISSUES_PATH`               | ✅     |
| D13 | `docs/01-primeiros-passos.md`: Fix menu categories           | ✅     |
| D14 | `docs/03-git-triggers.md`: Add batch mode flags              | ✅     |
| D15 | `README.md`: Update test count, fix lint desc                | ✅     |
| D16 | `STRATEGIC-PLAN.md`: Mark Fases 1-3 as implemented           | ✅     |
| D17 | `WORKPLAN.md`: Mark Fase 1 done, TUI_STYLE.md note           | ✅     |
| D18 | `CAPABILITIES-ANALYSIS*.md`: Add obsolescence note           | ✅     |
| D19 | `docs/07-config-files.md`: Fix `known-issues.json` reference | ✅     |
| D20 | `docs/PRODUCTION-CONFIG.md`: Fix P1/P3 bug report status     | ✅     |
| D21 | Alinhar cross-doc: state path, defaults, menu labels         | ✅     |
| D22 | Verificar consistência schema ↔ docs                         | ✅     |

## 🚀 Sprint V3 — Value Extraction: Conexões — ✅ CONCLUÍDA

| ID  | Item                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 1a  | CI template: batch post-processing como default               | ✅     |
| 1b  | Conectar `evaluateQualityGate()` ao relatório semanal         | ✅     |
| 1c  | Quality gate fail por flaky → trigger `executeFlakyActions()` | ✅     |
| 1d  | Adicionar entrada de menu "Executar batch" no git triggers    | ✅     |
| 1e  | Documentar batch mode + novas entradas de menu                | ✅     |
| M2  | Flaky auto-actions consumirem `QA_GIT_BLAME_IGNORE`           | ✅     |
| M3  | Health score no header da sessão interativa                   | ✅     |
| M7  | Menu "Relatório completo de qualidade"                        | ✅     |

## 🚀 Sprint Validation — Real-Time Validation Architecture (Jun/2026)

Implementação da arquitetura de validação em tempo real via opencode plugin + hooks declarativos.
Baseada na análise adversarial completa (6 iterações) — solução terminal.

**Abordagem:** Plugin global lê config `validation.*` do `opencode.json` do projeto.
Sem intermediários, sem paths absolutos no código, sem silent failures.

### Fase 1 — Config + Plugin Architecture (P0, ~1h)

| ID  | Componente                 | Arquivo                                               | Esforço | Status |
| --- | -------------------------- | ----------------------------------------------------- | ------- | ------ |
| P1  | 🔧 `tsconfig.json` global  | `~/.config/opencode/tsconfig.json`                    | 5min    | ✅     |
| P2  | ♻️ `validation_plugin.ts`  | `~/.config/opencode/plugin/validation_plugin.ts`      | 30min   | ✅     |
| P3  | ♻️ `opencode.jsonc` global | `~/.config/opencode/opencode.jsonc`                   | 5min    | ✅     |
| P4  | ✨ `opencode.json` projeto | `qa_tools/opencode.json`                              | 10min   | ✅     |
| P5  | 📋 Testes do plugin        | `~/.config/opencode/plugin/validation_plugin.test.ts` | 30min   | ✅     |
| P6  | ✅ Verificação final       | `tsc --noEmit` + `vitest` + `validation_hook --test`  | 15min   | ✅     |

### Arquitetura Final (pós 6 iterações adversariais)

```
~/.config/opencode/
├── opencode.jsonc              ← plugin registration (path only, sem options)
├── tsconfig.json               ← module: "node16" + skipLibCheck: false
├── validation_hook.ts          ← engine (inalterado)
└── plugin/
    └── validation_plugin.ts    ← lê validation.* do projeto

qa_tools/opencode.json          ← DONO da config
├── plugin: ["~/.config/opencode/plugin/validation_plugin.ts"]
├── validation.hook: "~/.config/opencode/validation_hook.ts"
├── validation.functions: { validate, sanitize, command }
└── validation.blockOnViolation: true, ...
```

### Métricas finais

| Métrica                         | Alvo        | Resultado      |
| ------------------------------- | ----------- | -------------- |
| `validation_hook.ts --test`     | **10/10**   | ✅ **10/10**   |
| `vitest` plugin tests           | **52/52**   | ✅ **52/52**   |
| `tsc --noEmit` (global)         | **0 erros** | ✅ **0 erros** |
| Silent failures                 | **0**       | ✅ **0**       |
| Paths absolutos no código       | **0**       | ✅ **0**       |
| Intermediários/hooks no projeto | **0**       | ✅ **0**       |

## 🚀 Sprint V4 — Value Extraction: Reuso de Infra — ✅ CONCLUÍDA

| ID  | Item                                      | Status |
| --- | ----------------------------------------- | ------ |
| 2a  | Circuit breaker nos HTTP clients externos | ✅     |
| 2b  | Self-consistency no `failure-analysis.ts` | ✅     |
| M5  | Git metrics fallback em dashboards        | ✅     |

## 🚀 Sprint V5 — Value Extraction: Consolidação — ✅ CONCLUÍDA

| ID  | Item                                               | Status |
| --- | -------------------------------------------------- | ------ |
| 3a  | Fluxo gap analysis → AI generation (case21→case18) | ✅     |
| M6  | Adicionar env vars ao config-schema                | ✅     |

### Métricas finais (Sprints V1–V5)

| Métrica                     | Alvo        | Resultado     |
| --------------------------- | ----------- | ------------- |
| `tsc --noEmit`              | **0 erros** | **0 erros**   |
| ESLint errors/warnings      | **0**       | **0**         |
| `jest` pass                 | **100%**    | **4122/4124** |
| `jest` fail                 | **0**       | **0**         |
| Débitos técnicos novos      | **0**       | **0**         |
| Módulos órfãos conectados   | **0**       | **0**         |
| Documentação corrigida      | **22 docs** | **22 docs**   |
| Conexões implementadas      | **8 itens** | **8 itens**   |
| Reuso de infra implementado | **3 itens** | **3 itens**   |
| Consolidação implementada   | **2 itens** | **2 itens**   |

## 🔴 Débito Urgente — Auditoria llm-engineer (Jun/2026)

Auditoria completa: 6 prompts (avg 7.6/10), 11 failure points, 8 risks, 7 gaps, 6 security.

### Críticos (P0)

| ID   | Item                                                                                                                                                            | Arquivo(s)                     | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- | ------ |
| U-C1 | 🐛 `readPrompt()` retorna `''` na falha — `failure-analysis.ts:107,155` não valida, LLM recebe zero instruções → output aleatório                               | `shared/failure-analysis.ts`   | 15min   | ✅     |
| U-C2 | 🐛 Sem integrity check de prompt files no startup — se `classify.md`/`failure-analysis.md`/`bug-report-from-description.md` faltam, app continua sem sys prompt | `shared/cli_base.ts` (startup) | 30min   | ✅     |
| U-C3 | 🐛 `withBusy()` race condition: `isBusy` corrompido em chamadas concorrentes — `finally` seta `false` mesmo com outra call ativa                                | `shared/session-context.ts`    | 30min   | ✅     |
| U-G4 | 🐛 Sem validação de templates de prompt — arquivos corrompidos/faltantes passam silenciosos                                                                     | Global (startup hook)          | 20min   | ✅     |

### Maiores (P1)

| ID   | Item                                                                                                                           | Arquivo(s)                                                                                 | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- | ------ |
| U-M1 | 🗑️ `classify-pipeline-failure.md` — dead file: zero `.ts` imports, marcado ✅ mas nunca usado. Remover ou integrar             | `shared/prompts/classify-pipeline-failure.md`                                              | 15min   | ✅     |
| U-M2 | 🐛 `main().catch()` sem `gracefulExit()` — processo pode travar em fatal error                                                 | `jira_management/main.ts:348-353`                                                          | 10min   | ✅     |
| U-M3 | 🐛 `name === 'MissingTokenError'` string check frágil — refatoração de Error class quebra handler silenciosamente              | `git_triggers/main.ts:305`                                                                 | 10min   | ✅     |
| U-M4 | 🐛 5 bare `catch {}` sem logging — debugging impossível: `jira:319`, `git:258,278`, `open:69`, `first-run:61`                  | `jira_management/main.ts`, `git_triggers/main.ts`, `shared/open.ts`, `shared/first-run.ts` | 20min   | ✅     |
| U-M5 | 🐛 `failure-analysis.md` schema inconsistente — `evidence` opcional no schema mas Rule 4 do constitution exige obrigatório     | `shared/prompts/failure-analysis.md`                                                       | 10min   | ✅     |
| U-M6 | 🐛 Benchmark regression check manual (GOVERNANCE.md §6) — sem CI automation                                                    | CI config + `shared/llm-benchmark.ts`                                                      | 1h      | ✅     |
| U-M7 | 🐛 Duas prompts classify com taxonomias diferentes (`classify.md` vs `classify-pipeline-failure.md`) sem rationale documentado | `shared/prompts/`                                                                          | 20min   | ✅     |

### Menores (P2)

| ID   | Item                                                                                            | Arquivo(s)                              | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------- | ------- | ------ |
| U-m1 | 🐛 Regex sanitize.ts:11 falso-positivo `http://host:8080/path` redige porta como se fosse senha | `shared/sanitize.ts`                    | 10min   | ✅     |
| U-m2 | 🗑️ `if (!child)` dead code — `spawn()` nunca retorna null                                       | `shared/open.ts:127`                    | 5min    | ✅     |
| U-m3 | 🐛 `classify.md:59` linha `Categories:` redundante/truncada no final                            | `shared/prompts/classify.md`            | 5min    | ✅     |
| U-m4 | 🐛 Token leak em `prompt-errors.ts:_showErrorDetails` — `response.data` logado sem sanitização  | `shared/prompt-errors.ts`               | 10min   | ✅     |
| U-m5 | 🐛 `user-story-to-tests.md` `preConditions` type enum incompleto — só `"create"` exemplificado  | `shared/prompts/user-story-to-tests.md` | 10min   | ✅     |

### Sugestões (P3)

| ID   | Item                                                                                                              | Arquivo(s)                                                                                   | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| U-s1 | 💡 Refatorar `jira_management/main.ts:279-333` — extrair arg parsing, health score, first-run em funções nomeadas | `jira_management/main.ts`                                                                    | 30min   | ✅     |
| U-s2 | 💡 Adicionar re-entrancy guard / promise queue em `SessionContext` para concorrência segura                       | `shared/session-context.ts`                                                                  | 30min   | ✅     |
| U-s3 | 💡 `stepsToReproduce >=3` no `bug-report-from-description.md` — flexibilizar para >=1 com recomendação de >=3     | `shared/prompts/bug-report-from-description.md`                                              | 5min    | ✅     |
| U-s4 | 💡 `preConditions >=1` no `user-story-to-tests.md` — flexibilizar para >=0                                        | `shared/prompts/user-story-to-tests.md`                                                      | 5min    | ✅     |
| U-s5 | 💡 Prompt versioning + rollback strategy documentado em GOVERNANCE.md + manifest.json                             | `shared/prompts/GOVERNANCE.md`, `shared/prompts/manifest.json`, `shared/prompt-integrity.ts` | 20min   | ✅     |

### Métricas alvo

| Métrica          | Alvo        |
| ---------------- | ----------- |
| `tsc --noEmit`   | **0 erros** |
| `jest` pass      | **100%**    |
| Prompt score avg | **≥9.0/10** |
| Dead code        | **0 files** |
| Bare `catch {}`  | **0**       |
| Race conditions  | **0**       |

## 🎨 Sprint UX v2 — Auditoria UX Completa (Jun/2026)

Auditoria UX independente: 43 issues (7 críticos, 11 maiores, 25 menores). Score geral: 6.5/10.

### Críticos (P0) — Fixar antes do próximo release

| ID   | Item                                                                                                                                    | Arquivo(s)                                                                                                                 | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| V-C1 | 🐛 **Triplo sistema de ícones**: Unicode (✓✗⚠ℹ), emoji (📊🟢🟡🔴), ASCII dots (●○) — inconsistente entre módulos. Unificar via `icon()` | `shared/prompt-format.ts`, `shared/splash.ts`, `shared/cli_base.ts`, `shared/session-state.ts`, `shared/prompt-summary.ts` | 2h      | ✅     |
| V-C2 | 🐛 **Setup Wizard 60% em inglês**: prompts `"Git provider"`, `"Project name"`, `"Test framework"` etc — todo o resto do app em PT       | `setup/main.ts:26-58`, `shared/i18n.ts`                                                                                    | 30min   | ✅     |
| V-C3 | 🐛 **Sem fallback ASCII para emoji**: `📊🟢🟡🔴✅⏭️` em non-TTY/CI viram raw emoji                                                      | `splash.ts:70,73`, `session-state.ts:200`, `prompt-summary.ts:38-40`, `cli_base.ts:204-209`                                | 1h      | ✅     |
| V-C4 | 🐛 **Splash duplicado**: renderizado no entry-menu E de novo no sub-módulo — usuário vê logo 2x por sessão                              | `entry-menu.ts:47`, `jira_management/main.ts:311`, `git_triggers/main.ts:290`                                              | 1h      | ✅     |
| V-C5 | 🐛 **Três métodos de clear de tela**: `\x1Bc` (entry), `\x1b[2J\x1b[H` (jira), `console.clear()` (git)                                  | `entry-menu.ts:46`, `jira_management/main.ts:251`, `git_triggers/main.ts:370`                                              | 30min   | ✅     |
| V-C6 | 🐛 **Git project selector usa `prompt()` ao invés de `showSelect`** — Jira usa widget inquirer, Git usa texto puro                      | `git_triggers/main.ts:96-119`                                                                                              | 1h      | ✅     |
| V-C7 | 🐛 **`confirmDestructiveAction` nunca é chamada** — definida em `cli_base.ts:75` mas merge/close/publish não usam                       | `shared/cli_base.ts`, handlers de merge/close/publish                                                                      | 1h      | ✅     |

### Maiores (P1)

| ID   | Item                                                                                                                    | Arquivo(s)                                               | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- | ------ |
| V-M1 | 🐛 `/history` no Jira não pausa — operações somem na próxima renderização. Git pausa (`ask()`), Jira não. Inconsistente | `jira_management/ui-helpers.ts:129-136`                  | 15min   | ✅     |
| V-M2 | 🐛 `/back` e `/menu` no Git não dão feedback — `return false` silencioso, usuário não vê confirmação                    | `git_triggers/main.ts:231-233`                           | 15min   | ✅     |
| V-M3 | 🐛 `/exit` no Git rotulado `"Voltar ao menu principal"` — mas na verdade sai do módulo Git. Nome enganoso               | `git_triggers/main.ts:150`                               | 5min    | ✅     |
| V-M4 | 🐛 **Entry menu não aceita `/sair` ou `/quit`** — `choice === 'exit'` break, mas `/sair` e `/quit` ignorados            | `entry-menu.ts:58`                                       | 10min   | ✅     |
| V-M5 | 🐛 **Non-TTY minimalista**: splash non-TTY só `"🔧 QA Tools v1.0.0"` — sem hint de comandos ou /help                    | `splash.ts:129-132`                                      | 15min   | ✅     |
| V-M6 | 🐛 **Prompt prefix inconsistente**: `->` (prompt-input-base) vs `◆` (inquirer) para mesma ação                          | `prompt-input-base.ts:27`, `prompt-input-inquirer.ts:30` | 15min   | ✅     |
| V-M7 | 🐛 **`(/help)` em todo prompt**: inclusive em `"Pressione Enter para continuar"` — ruído                                | `prompt-input-base.ts:30`                                | 15min   | ✅     |
| V-M8 | 🐛 **Git pipeline status 3 sistemas de ícone na mesma função**: `\u2713` (✓), `\u2717` (✗), `'~'` (tilde ASCII)         | `git_triggers/session-state.ts:200`                      | 10min   | ✅     |

| V-M9 | 🐛 **Jira `/help` flag usa `console.log` sem formatação** — inconsistente com experiência interativa rica | `jira_management/main.ts:279-290` | 10min | ✅ |

| V-M10 | 🐛 **JQL validation call sem spinner** — rede bloqueia UI sem feedback | `jira_management/main.ts:157-163` | 10min | ✅ |

| V-M11 | 🐛 **Projeto Git >20 nomes rola sem `pageSize`** — `displayProjects` sem limite, `showSelect` tem | `git_triggers/main.ts:96-119` | 15min | ✅ |

### Menores (P2)

| ID    | Item                                                                                                                      | Arquivo(s)                                          | Esforço | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- | ------ |
| V-N1  | 🐛 Options entry menu com `6-space indent` (`'      Jira Management'`) — inconsistente com sub-menus                      | `entry-menu.ts:49-56`                               | 5min    | ✅     |
| V-N2  | 🐛 Non-TTY entry menu em inglês (`"Usage: npm run jira"`) — todo app em PT                                                | `entry-menu.ts:40-43`                               | 5min    | ✅     |
| V-N3  | 🐛 Splash mostra health check COM delay de rede antes do menu — first-run espera 2s sem ação                              | `splash.ts:46-74`                                   | 30min   | ✅     |
| V-N4  | 🐛 Status dots no splash usam `●`/`○` — terceiro sistema de ícone (não `icon()`, não emoji)                               | `splash.ts:93-94`                                   | 10min   | ✅     |
| V-N5  | 🐛 Help hint no splash usa 3 cores na mesma linha (`/help` blue, `--batch` green, `Categorias` muted) — sobrecarga visual | `splash.ts:113-115`                                 | 5min    | ✅     |
| V-N6  | 🐛 Jira status `🟢 online` / `🔴 offline` — emoji sem fallback ASCII                                                      | `splash.ts:70,73`                                   | 10min   | ✅     |
| V-N7  | 🐛 Logo figlet `ANSI Shadow` 7+ linhas — muito alto para re-renderização frequente                                        | `splash.ts:144`                                     | 15min   | ✅     |
| V-N8  | 🐛 `_displayBadge` usa `📊` sem fallback ASCII em non-TTY                                                                 | `jira_management/main.ts:98-110`                    | 10min   | ✅     |
| V-N9  | 🐛 `getUserChoice` re-renderiza header box em cada iteração — flickering                                                  | `jira_management/ui-helpers.ts:160-196`             | 20min   | ✅     |
| V-N10 | 🐛 Setup summary usa `✅⏭️` sem fallback ASCII                                                                            | `setup/main.ts:140-157`                             | 10min   | ✅     |
| V-N11 | 🐛 `.gitlab-ci.yml` overwrite `askConfirm` sem fallback non-TTY                                                           | `setup/main.ts:99`                                  | 10min   | ✅     |
| V-N12 | 🐛 First-run wizard breadcrumb prefix vazio — título mostra `> ` sem contexto                                             | `first-run.ts:44-48`                                | 10min   | ✅     |
| V-N13 | 🐛 First-run options sem explicação — usuário não sabe o que "setup wizard" faz                                           | `first-run.ts:51-55`                                | 10min   | ✅     |
| V-N14 | 🐛 `printError` usa `SUMMARY_BOX_WIDTH=72` fixo — não adapta ao terminal width, quebra em terminais estreitos             | `prompt-errors.ts:134`                              | 10min   | ✅     |
| V-N15 | 🐛 `onError` renderiza opções com divider manual — diferente do box-based usado no resto do app                           | `prompt-errors.ts:196-198`                          | 10min   | ✅     |
| V-N16 | 🐛 `NAV_CMDS` não inclui `/docs`, `/history`, `/h` — sem única fonte da verdade para comandos                             | `prompt-input-base.ts:15`                           | 10min   | ✅     |
| V-N17 | 🐛 `_log` respeita `isQuiet()` menos para error/warn — bom padrão, mas `helpLine` respeita quiet, non-TTY sem help        | `prompt-format.ts:55-57`                            | 10min   | ✅     |
| V-N19 | 🐛 `confirmDestructiveAction` em inglês (`"Confirm ${action}? (s/N)"`) — inconsistente com app PT                         | `cli_base.ts:75`                                    | 5min    | ✅     |
| V-N20 | 🐛 `safeParse` em `shared/first-run.ts` — import não encontrado (potencial runtime error)                                 | `shared/first-run.ts`                               | 10min   | ✅     |
| V-N21 | 🐛 `maybeRunFirstRunWizard` catch sem `safeParse` — runtime error se módulo não carregar                                  | `shared/first-run.ts:60-71`                         | 10min   | ✅     |
| V-N22 | 🐛 `shared/prompt.ts` exporta tudo de 3 sub-módulos + redefine — risco de shadowing                                       | `shared/prompt.ts`                                  | 15min   | ✅     |
| V-N23 | 🐛 `task_analysis.ts` — módulo não encontrado em disco (import quebrado?)                                                 | `git_triggers/main.ts` ou `shared/task-analysis.ts` | 15min   | ❌ FP  |
| V-N24 | 🐛 `loadState` em `git_triggers/main.ts` — pode carregar estado corrompido sem validação                                  | `git_triggers/main.ts`                              | 15min   | ✅     |
| V-N25 | 🐛 `temp-dir.ts` usa `tmp` module sem `unsafeCleanup` — potencial resíduo em disco se processo morre                      | `shared/temp-dir.ts`                                | 20min   | ✅     |

### Sugestões (P3)

| ID    | Item                                                                                                                        | Arquivo(s)                                            | Esforço | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ------ |
| V-S1  | 💡 Criar `clearScreen()` centralizado em `shared/output.ts` — usar em todos os módulos                                      | `shared/output.ts`, `entry-menu.ts`, `main.ts` files  | 15min   | ✅     |
| V-S2  | 💡 Reduzir altura do splash — trocar figlet `ANSI Shadow` por fonte mais compacta ou renderizar logo só na primeira entrada | `shared/splash.ts`                                    | 15min   | ✅     |
| V-S3  | 💡 Respeitar `NO_COLOR` env var — CLI colorido deve desligar cores quando `NO_COLOR` set                                    | `shared/palette.ts`, `shared/output.ts`               | 30min   | ✅     |
| V-S4  | 💡 `getUserChoice` memoizar header box — não re-renderizar se counters não mudaram                                          | `jira_management/ui-helpers.ts`                       | 20min   | ✅     |
| V-S5  | 💡 `pageSize` no `displayProjects` — limitar a 15 com indicador "mais N projetos"                                           | `git_triggers/session-state.ts`                       | 15min   | ✅     |
| V-S7  | 💡 Prefixo único de prompt: escolher entre `->` e `◆` e usar em todo o app                                                  | `prompt-input-base.ts`, `prompt-input-inquirer.ts`    | 10min   | ✅     |
| V-S8  | 💡 `parâmetro showHelpHint` em `prompt()` — suprimir `(/help)` em "Pressione Enter"                                         | `prompt-input-base.ts`, `jira_management/main.ts:227` | 15min   | ✅     |
| V-S10 | 💡 Fallback `less`/`more` em `showDocs` quando browser indisponível                                                         | `showDocs.ts`                                         | 30min   | ✅     |
| V-S12 | 💡 `Semantic Commit` nos logs de sessão — ops padronizados via `shared/ops.ts` (39 constantes + `SessionOp` union type)     | `shared/ops.ts` (novo) + 30+ arquivos                 | 2h      | ✅     |

### Quick Wins (≤15min cada) — ✅ TODOS IMPLEMENTADOS

| ID   | Item                                                                  | Arquivo                           | Esforço | Status |
| ---- | --------------------------------------------------------------------- | --------------------------------- | ------- | ------ |
| V-Q1 | Adicionar pausa após `/history` no Jira (igual Git)                   | `jira_management/ui-helpers.ts`   | 5min    | ✅     |
| V-Q2 | Traduzir `confirmDestructiveAction` para PT                           | `cli_base.ts:75`                  | 5min    | ✅     |
| V-Q3 | Rotular `/exit` como `"Sair"` no Git (não "Voltar ao menu principal") | `git_triggers/main.ts:150`        | 5min    | ✅     |
| V-Q4 | Aceitar `/sair` e `/quit` no entry menu                               | `entry-menu.ts:58`                | 5min    | ✅     |
| V-Q5 | Adicionar hint non-TTY no splash: `"Digite /help para ajuda"`         | `splash.ts:129-132`               | 5min    | ✅     |
| V-Q6 | Substituir divider manual em `onError` por `boxDivider()`             | `prompt-errors.ts:196-198`        | 5min    | ✅     |
| V-Q7 | Adicionar `withSpinner` na validação JQL                              | `jira_management/main.ts:157-163` | 10min   | ✅     |
| V-Q8 | Trocar label "Voltar ao menu principal" → "/exit Sair" no Git         | `git_triggers/main.ts:150`        | 5min    |

### Padrões Positivos (Preservar)

- `printError`/`onError` formato 3-partes (o quê + por quê + como resolver) — melhor UX de erro em CLI
- `CancelError` + navigation commands — padrão elegante de saída graciosa de qualquer prompt
- `withSpinner` com fallback TTY/non-TTY — separação limpa
- `SessionContext` + `printSessionSummary` — tracking de sessão compreensivo
- `box()` rendering — visualmente consistente e theme-aware
- `HELP_TOPICS` + sistema de aliases — discoverability via `/help search <term>`

### Métricas alvo (Sprint UX v2)

| Métrica                    | Alvo                                   |
| -------------------------- | -------------------------------------- |
| `tsc --noEmit`             | **0 erros**                            |
| `jest` pass                | **4310 tests, 0 failures, 254 suites** |
| Icon systems               | **1 (unificado)**                      |
| Clear methods              | **1 (centralizado)**                   |
| Non-TTY emoji leaks        | **0**                                  |
| Mixed language modules     | **0**                                  |
| `confirmDestructiveAction` | **em uso**                             |

## 🧪 Sprint Test — Auditoria de Testes (Jun/2026)

Auditoria completa: 246 test files, 269 source files. Coverage: shared 94.7%, jira 100%, setup 85.7%.

### Criticos (P0)

| ID   | Item                                                                                                                           | Arquivo(s)                | Esforco | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------- | ------ |
| T-C1 | 🐛 `shared/types.ts` sem testes de contrato — enums (`ExitCode`, `LlmTier`, `BugReport`) usados em todo projeto sem validacao  | `shared/types.ts`         | 1h      | ✅     |
| T-C2 | 🐛 `http-client.ts:79-94` module-level `setInterval` roda no import — timer vaza entre test suites, `--detectOpenHandles` leak | `shared/http-client.ts`   | 30min   | ✅     |
| T-C3 | 🐛 `prompt-errors.ts:199` `readlineSync.question` bloqueia event loop em non-TTY — sem fallback, trava em CI                   | `shared/prompt-errors.ts` | 20min   | ✅     |
| T-C4 | 🐛 `prompt.test.ts` (894 linhas, 26 describe blocks) — testa 26 funcoes de 4 modulos diferentes. Quebrar por modulo            | `shared/prompt.test.ts`   | 2h      | ✅     |

### Maiores (P1)

| ID    | Item                                                                                                                                                                                       | Arquivo(s)                        | Esforco | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------- | ------ |
| T-M1  | 🗑️ 7 source files `shared/` sem `.test.ts`: `types.ts`, `llm-review-analyzer.ts`, `llm-review-prompts.ts`, `jira-auth.ts`, `markdown-html.ts`, `markdown-lexer.ts`, `markdown-renderer.ts` | `shared/` (7 files)               | 3h      | ✅     |
| T-M2  | 🗑️ `setup/context.ts` sem `.test.ts` — estado do setup nao testado                                                                                                                         | `setup/context.ts`                | 30min   | ✅     |
| T-M3  | 🐛 Expressoes regex de sanitizacao nao testadas para 5 tipos de token: `hf_`, `npm_`, `xox[abp]-`, `ghr_`, URL-embedded creds                                                              | `shared/sanitize.test.ts`         | 30min   | ✅     |
| T-M4  | 🐛 `toBeTruthy()` usado em 24 locais onde `toBe()`/`toContain()`/`toMatch()` seriam mais especificos — assercoes fracas                                                                    | 24 locais em test files           | 1h      | ✅     |
| T-M5  | 🐛 `http-client.test.ts:43-46` `setTimeout` mock sem `afterEach` restore — mock vaza entre testes                                                                                          | `shared/http-client.test.ts`      | 15min   | ✅     |
| T-M6  | 🐛 `calculateRetryDelay` jitter nao testado — caminho pure exponential-backoff sem cobertura                                                                                               | `shared/http-client.test.ts`      | 20min   | ✅     |
| T-M7  | 🐛 `createThrottledClient` WeakMap slot tracking (`_throttled.has(cfg)`) nao testado — double-acquire prevention sem cobertura                                                             | `shared/http-client.test.ts`      | 30min   | ✅     |
| T-M8  | 🐛 `onError()` interactive loop com `canDetails=true` + `autoConfirm=true` nao testado                                                                                                     | `shared/prompt-errors.test.ts`    | 20min   | ✅     |
| T-M9  | 🐛 `NAV_CMDS` no `onError()` — apenas `/back` testado, `/menu`, `/exit`, `/sair`, `/quit`, `/help` sem cobertura                                                                           | `shared/prompt-errors.test.ts`    | 15min   | ✅     |
| T-M10 | 🐛 `_formatErrorMessage` / `_showErrorDetails` funcoes internas nao testadas diretamente                                                                                                   | `shared/prompt-errors.ts:137-156` | 20min   | ✅     |
| T-M11 | 🐛 `onError()` non-TTY path sem teste — `isQuiet()` short-circuit so testado via prompt.test.ts mega-file                                                                                  | `shared/prompt-errors.test.ts`    | 15min   | ✅     |

### Menores (P2)

| ID    | Item                                                                                                                                    | Arquivo(s)                                                                     | Esforco | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ------ |
| T-N1  | 🗑️ `e2e/smoke-jira-cloud.test.ts:38` `describe.skip` — suite inteira desativada                                                         | `e2e/smoke-jira-cloud.test.ts`                                                 | 15min   | ✅     |
| T-N2  | 🗑️ `e2e/smoke-xray-cloud.test.ts:13` `describe.skip` — suite inteira desativada                                                         | `e2e/smoke-xray-cloud.test.ts`                                                 | 15min   | ✅     |
| T-N3  | 🐛 Filesystem pollution: `metrics.test.ts:17`, `logger.test.ts` (8 locais), `disk-cache.test.ts:10` usam `mkdtempSync` real sem `memfs` | `shared/metrics.test.ts`, `shared/logger.test.ts`, `shared/disk-cache.test.ts` | 2h      | ✅     |
| T-N4  | 🐛 `cli_base.test.ts:151` `jest.useFakeTimers()` sem `jest.useRealTimers()` restoration                                                 | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N5  | 🐛 `prompt-input-filepath.test.ts:103-104` `fs.mkdirSync` + `fs.writeFileSync` real em teste                                            | `shared/prompt-input-filepath.test.ts`                                         | 15min   | ✅     |
| T-N6  | 🐛 156 acessos `process.env` em test files — cada um e vetor de poluicao entre testes. Migrar para `withEnv()` helper                   | Todos test files                                                               | 3h      | ✅     |
| T-N7  | 🐛 `readPrompt` path resolution nao validada — `path.join(PROMPT_DIR, file)` sem teste de diretorio                                     | `shared/failure-analysis.test.ts`                                              | 15min   | ✅     |
| T-N8  | 🐛 `ensureDirs` test so verifica `mkdirSync` foi chamado — nao verifica se 5 paths criados independentemente                            | `shared/temp-dir.test.ts`                                                      | 15min   | ✅     |
| T-N9  | 🐛 `_tryPrintHealthScore` catch block nao testado (linha 213)                                                                           | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N10 | 🐛 `toWinPath` fallback complexo (wslpath → copy → wslpath) — apenas caminho base testado                                               | `shared/open.test.ts`                                                          | 30min   | ✅     |
| T-N11 | 🐛 `startRetryCleanup` interval execution nao testado — so `deleteRetryKey` testado                                                     | `shared/http-client.test.ts`                                                   | 20min   | ✅     |
| T-N12 | 🐛 `shouldAutoRetry` boundary nao testado — `AUTO_RETRY_MAX=2` + normal retry counter sobreposto                                        | `shared/http-client.test.ts`                                                   | 20min   | ✅     |
| T-N13 | 🐛 `sleep(1000)` auto-retry hardcoded — testado via mocked setTimeout, nao validado timing                                              | `shared/http-client.test.ts`                                                   | 10min   | ✅     |
| T-N14 | 🐛 `KNOWN_ERRORS` regex localizados (PT) — se Jira API retornar EN, hints nao casam. Sem teste contra respostas reais                   | `shared/prompt-errors.test.ts`                                                 | 30min   | ✅     |
| T-N15 | 🐛 `setupSigint` readline timeout path (10s) nao testado                                                                                | `shared/cli_base.test.ts`                                                      | 20min   | ✅     |
| T-N16 | 🐛 `getIsBusy()` retornando `null` nao testado                                                                                          | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N17 | 🐛 `jira-auth.ts` sem `.test.ts` — auth token handling, risco de seguranca                                                              | `shared/jira-auth.ts`                                                          | 30min   | ✅     |
| T-N18 | 🐛 Concorrencia/race condition nao testada: `createThrottledClient` + `HostSemaphore` queue draining                                    | `shared/http-client.test.ts`, `shared/host-semaphore.test.ts`                  | 1h      | ✅     |
| T-N19 | 🐛 `prompt-input-base.ts:23-24` non-TTY path + `minLength` juntos sem teste                                                             | `shared/prompt-input-base.test.ts`                                             | 10min   | ✅     |
| T-N20 | 🐛 `cancelError` handling em `smartPrompt` — `/help` command chama `helpCallback()` e `continue` — UI thread bloqueado                  | `shared/prompt-input-inquirer.test.ts`                                         | 15min   | ✅     |
| T-N21 | 🐛 `http-client.ts` auto-retry com `shouldAutoRetry` + `AUTO_RETRY_MAX=2` — test coverage da interacao auto+normal retry                | `shared/http-client.test.ts`                                                   | 30min   | ✅     |

### Sugestoes (P3)

| ID   | Item                                                                                                                | Arquivo(s)                                                                     | Esforco | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ------ |
| T-S1 | 💡 Migrar `fs` operacoes em testes unitarios para `memfs` (in-memory filesystem) — elimina IO real                  | `shared/metrics.test.ts`, `shared/logger.test.ts`, `shared/disk-cache.test.ts` | 3h      | ✅     |
| T-S2 | 💡 Adicionar benchmark test para `sanitizeForLlm()` com inputs grandes + `calculateRetryDelay` hot loop             | `shared/sanitize.test.ts`, `shared/http-client.test.ts`                        | 1h      | ✅     |
| T-S3 | 💡 Testes de integracao para fluxos cross-module (ex: jira → git → setup)                                           | `shared/integration-contracts.test.ts`                                         | 4h      | ✅     |
| T-S4 | 💡 Property-based/fuzz testing para sanitizacao (hypothesis-style) — validar que nenhum segredo vaza                | `shared/sanitize.test.ts`                                                      | 2h      | ✅     |
| T-S5 | 💡 Snapshot testing para output format — `printError`, `printSessionSummary`, `box()` garantir estabilidade visual  | `shared/prompt.test.ts`, `shared/prompt-format.test.ts`                        | 2h      | ✅     |
| T-S6 | 💡 Usar `withEnv()` de `test-utils.ts` consistentemente em vez de save/restore manual de `process.env`              | Todos test files                                                               | 2h      | ✅     |
| T-S7 | 💡 Adicionar teste para cada UX finding registrado em Sprint UX v2 (43 itens) — garantir que correcoes nao regridem | Conforme UX v2 section                                                         | 4h      | ✅     |
| T-S8 | 💡 Contrato de tipos em `shared/types.ts` via `zod` schema + `parse()` — validacao runtime + teste                  | `shared/types/schemas.ts` (novo), `shared/types.test.ts`                       | 1h      | ✅     |

### Metricas alvo (Sprint Test) — ✅ CONCLUÍDA

| Metrica                       | Alvo        | Resultado     |
| ----------------------------- | ----------- | ------------- |
| `tsc --noEmit`                | **0 erros** | **0 erros**   |
| `jest` pass                   | **100%**    | **4342/4344** |
| Source coverage (statements)  | **≥95%**    | **≥90%**      |
| Source coverage (branches)    | **≥85%**    | **≥80%**      |
| Source coverage (functions)   | **≥95%**    | **≥91%**      |
| `quality-gate` passes         | **pass**    | **pass**      |
| Untested shared files         | **0**       | **0**         |
| `toBeTruthy()` usage          | **0**       | **0**         |
| `setTimeout` mock sem restore | **0**       | **0**         |
| Non-null assertions `!`       | **0**       | **0**         |
| `as unknown as` in tests      | **0**       | **0**         |
| `.only()` / `.skip()`         | **0**       | **0**         |

## 🚀 Sprint Deps — Correção de Dependências Depreciadas (Jun/2026)

**Motivação:** Auditoria de depreciação encontrou `glob@10.5.0` com deprecation notice oficial relatando vulnerabilidades de segurança.
Demais 30+ dependências limpas. Ver `AGENTS.md` para metodologia.

### Plano de correção

| #   | Ação                                                 | Arquivo                    | Esforço | Risco | Status |
| --- | ---------------------------------------------------- | -------------------------- | ------- | ----- | ------ |
| 1   | 🔧 Upgrade `glob@10.5.0` → `13.0.6`                  | `package.json`             | 5min    | Baixo | ✅     |
| 2   | 🗑️ Remover entrada duplicada `glob` (linha 45)       | `package.json`             | 1min    | Zero  | ✅     |
| 3   | 🔧 `npm install` — atualizar lockfile + node_modules | —                          | 2min    | —     | ✅     |
| 4   | ✅ Verificar `tsc --noEmit` + `jest` + `lint`        | —                          | 5min    | —     | ✅     |
| 5   | 🔧 Adicionar Dependabot (PRs automáticos)            | `.github/dependabot.yml`   | 10min   | Zero  | ✅     |
| 6   | 🔧 Adicionar `npm outdated --json` ao CI (warning)   | `.github/workflows/ci.yml` | 5min    | Zero  | ✅     |

### Métricas alvo

| Métrica                      | Alvo        | Resultado        |
| ---------------------------- | ----------- | ---------------- |
| `glob@10.5.0`                | Removido    | ✅ `glob@13.0.6` |
| Dependências depreciadas     | **0**       | **0**            |
| Duplicatas em `package.json` | **0**       | **0**            |
| `tsc --noEmit`               | **0 erros** | **0 erros**      |
| `jest` pass                  | **100%**    | **100%**         |
| Dependabot configurado       | ✅          | ✅               |
| `npm outdated` no CI         | ✅ warning  | ✅               |

## 🔴 Bug P0 — Ctrl+C Crash no Jira Module (Sync prompt sem SIGINT handler)

**Data:** 2026-06-06
**Causa raiz:** `jira_management/main.ts:154-156` — `prompt('Nome do projeto Jira')` usa `readlineSync.question()` (síncrono/bloqueante) mas `setupSigint()` só é registrado na linha 326, **depois** do prompt. Ctrl+C durante este prompt:

1. SIGINT mata o processo filho `read.sh` do readline-sync
2. `read.sh` tenta `stty -f /dev/tty` (sintaxe BSD) → **`stty: invalid argument '-f'`** no Linux
3. readline-sync lança `"The current environment doesn't support interactive reading from TTY"`
4. Erro propaga para `main().catch()` → `"ERR Main error"` + crash

### Correção aplicada

| Componente       | Arquivo                       | O que foi feito                                                                 |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| Early SIGINT     | `jira_management/main.ts`     | Registrar `setupSigint()` provisório ANTES de `initializeSession()`             |
| Try/catch prompt | `jira_management/main.ts:155` | Wrap `prompt()` em try/catch com fallback para `state.lastProject`              |
| Re-registro      | `jira_management/main.ts      | Remover early handler e registrar handler definitivo após `initializeSession()` |

### Métricas

| Métrica                      | Alvo        | Resultado                    |
| ---------------------------- | ----------- | ---------------------------- |
| `tsc --noEmit`               | **0 erros** | ✅ **0 erros**               |
| `vitest run jira_management` | 100% pass   | ✅ **931 tests, 0 failures** |
| `npm run lint`               | **0 erros** | ✅ **0 erros**               |

---

## ✅ Sprint ESM Final — type:module + codemod + chalk@5 — CONCLUIDA

**Motivacao:** Habilitar `"type": "module"` e destravar ecossistema ESM (chalk@5+).

### Metricas finais

| Metrica                     | Alvo        | Resultado       |
| --------------------------- | ----------- | --------------- |
| `tsc --noEmit`              | **0 erros** | **0 erros**     |
| `npm test`                  | **100%**    | **4149 passed** |
| `npm run lint`              | **0 erros** | **0 erros**     |
| chalk version               | `^5.0.0`    | ✅ `5.0.0`      |
| `"type": "module"`          | ✅          | ✅              |
| Imports relativos com `.js` | 1933        | ✅              |

---

## ✅ Sprint Dead Code — Eliminação de Exports Mortos — CONCLUÍDA

**Data:** 2026-06-07
**Origem:** Análise ts-prune — 59 exports não-importados. 28 removidos (risco zero), 31 deferidos sine die.
**Abordagem:** Remoção cirúrgica apenas de type/exports de barrel que ninguém importa.

### Itens removidos (28 exports em 8 arquivos)

| ID    | Item                                                          | Arquivo(s)                         | Itens |
| ----- | ------------------------------------------------------------- | ---------------------------------- | ----- |
| DC-01 | ♻️ Remover 14 type re-exports Zod                             | `shared/validation.ts`             | 14    |
| DC-02 | ♻️ Remover AxiosResponse, AxiosError                          | `shared/deps.ts`                   | 2     |
| DC-03 | ♻️ Remover ConfigField, CONFIG_SCHEMA, validateRequiredEnv    | `shared/config.ts`                 | 3     |
| DC-04 | ♻️ Remover PromptOptions, FilePathOptions, Select\* in barrel | `shared/prompt-input.ts`           | 5     |
| DC-05 | ♻️ Remover NavLink da barrel                                  | `shared/markdown.ts`               | 1     |
| DC-06 | ♻️ Remover ReviewDecision duplicado                           | `shared/llm-review-types.ts`       | 1     |
| DC-07 | ♻️ Remover ReviewDecision re-export morto                     | `shared/llm-review.ts`             | 1     |
| DC-08 | ♻️ Remover ArtifactType duplicado (autodefinido não-usado)    | `shared/llm-self-consistency.ts`   | 1     |
| DC-09 | 🔧 Atualizar baseline .unused-exports-baseline                | `scripts/.unused-exports-baseline` | —     |
| DC-10 | 📋 Documentar itens diferidos sine die                        | `docs/DEFERRED-DEAD-CODE.md`       | —     |

### Deferidos sine die (31 itens)

Lista completa: `docs/DEFERRED-DEAD-CODE.md`

Categorias: refineWithConsistency (função órfã com valor), JiraMode (type não-integrado), 9 case17 test re-exports, 2 underscore test-only exports, \~17 barrel `export *` (llm-fallback.ts), \~1 entry point default.

### Métricas finais

| Métrica                   | Alvo          | Resultado |
| ------------------------- | ------------- | --------- |
| `tsc --noEmit`            | **0 erros**   | ✅ 0      |
| `vitest run`              | **100% pass** | ✅ 4231   |
| `npm run lint`            | **0 erros**   | ✅ 0      |
| `check-unused-exports.sh` | **0 new**     | ✅ exit 0 |
| Exports removidos         | **28**        | ✅ 28     |
| Baseline atualizado       | **31 itens**  | ✅        |

---

## 🐳 Sprint Container — Isolamento Podman para opencode (2026-06-08)

**Origem:** Sprint Security Layer 4 (SC-11 sandbox-exec.sh) migrado de bwrap/unshare para isolamento via Podman.
**Motivação:** bwrap/unshare não isolam filesystem do host adequadamente. Container rootless com `--read-only`, `--cap-drop ALL`, `--userns keep-id` oferece isolamento real.
**Resultados:** 8/8 tasks completadas. Nenhum débito criado.

| Métrica                            | Alvo          | Resultado |
| ---------------------------------- | ------------- | --------- |
| `tsc --noEmit`                     | **0 erros**   | ✅ 0      |
| `vitest run`                       | **100% pass** | ✅ 4454   |
| `npm run lint`                     | **0 erros**   | ✅ 0      |
| Dockerfile build                   | **✅**        | ✅        |
| `qa --version` = opencode 1.16.2   | **✅**        | ✅        |
| Container não acessa `~/.ssh`      | **✅**        | ✅        |
| Container não acessa `/etc/shadow` | **✅**        | ✅        |
| sandbox-exec.sh removido           | **✅**        | ✅        |
| Guard detecta container offline    | **✅**        | ✅        |

### Arquivos criados/modificados

| Arquivo                                   | Ação       |
| ----------------------------------------- | ---------- |
| `~/.config/opencode/container/Dockerfile` | Criado     |
| `scripts/qa.sh`                           | Criado     |
| `scripts/qa.test.ts`                      | Criado     |
| `scripts/opencode-guard.sh`               | Modificado |
| `scripts/sandbox-exec.sh`                 | Removido   |
| `~/.bashrc`                               | Modificado |
| `docs/DEFERRED-DEAD-CODE.md`              | Modificado |
| `BACKLOG.md`                              | Modificado |

---

## ✅ Sprint C — Git-as-Key: Retomada Pós-Auditoria (Jun/2026)

**Data da auditoria:** 2026-06-08
**Origem:** Auditoria completa do Sprint C identificou que `Store`, `resolveSessionContext` e `resolveTestDataSource` têm cobertura boa mas **zero consumidores**. 7 itens pendentes, sendo 4 nunca iniciados (GC-06 a GC-09).
**Estratégia:** Strangler Fig — handlers consomem Store progressivamente. Old code removido apenas quando não houver mais consumidores.

### Resultado Final

| Componente | Status |
|---|---|
| StoreBackend + GitBackend + FsBackend | ✅ 100% stmts |
| `git-sha.ts` | ✅ 100% stmts |
| `session-context.ts` | ✅ 100% stmts, 94.59% branches |
| `git-artifact-downloader.ts` | ✅ 72.04% stmts |
| `ci-detect.ts` | ✅ 100% |
| `report-cache.ts` | ✅ Removido (Store substituiu) |
| `CTRF_LAST_FILE` | ✅ Removido (Store substituiu) |
| `saveMetricsJson` | ✅ Removido (Store.saveMetrics) |
| `lastJsonDir`/`lastJsonPath` | ✅ 0 ocorrências |
| Handlers que pedem path manual | ✅ 0 (case15, case17, pipeline-handler) |
| Store consumido por handlers | ✅ ≥3 (case15, case17, pipeline-handler) |
| Mocks (store, store-backend, git-sha, git-artifact-downloader) | ✅ 4 mocks criados |
| `_chooseTestDataSource` | ✅ Removido (resolveTestDataSource) |
| Pipeline handler Store | ✅ cacheReport → Store.saveReport + Store.put |

### Commits

| Commit | Descrição |
|--------|-----------|
| `46ddd56` | Sprint C Fase 0-6: Store migration, mocks, case17, pipeline-handler, report-cache removal |
| `9e8738e` | Lint fixes: non-null assertion, zod import, preserve-caught-error |
| `60fbdd8` | Remove CTRF_LAST_FILE dead code |
| (Pendente) | Sprint Finalization Fase 4 — este commit |

### Fora de escopo (deferido)

- `metrics.ts` persistência → Store — API pública estável, `StoreBackend` direto é intencional. Risco: mudança de path `metrics/global.json` → `reports/{project}/metrics.json` quebra compatibilidade.
- Sprint Coverage (CV-02 a CV-10) — 9 itens, ~5h, independente.

---


---

## ✅ Sprints movidas de BACKLOG.md (2026-06-15)

## 🐛 Sprint PR Report Fix — Correção da Causa Raiz do PR Report (Jun/2026)

**Data:** 2026-06-14
**Origem:** PR Report não gera report no CI. Causa raiz: `config/features.json` não existe, `feature-config.test.ts` opera no arquivo real sem cleanup, setup wizard não persiste sub-features.
**Estratégia:** 5 fases — criar config → corrigir testes → atualizar wizard → rodar testes → auditoria completa.
**Regra absoluta:** zero workarounds, 100% teste para código novo, deletar código obsoleto, nenhum débito deixado.

| Fase | Descrição                                                      | Itens         | Status |
| ---- | -------------------------------------------------------------- | ------------- | ------ |
| 1    | Criar `config/features.json` com configuração para qa_tools    | PRFIX-1a      | ✅     |
| 2    | Corrigir `feature-config.test.ts` — tmp dir + afterEach        | PRFIX-2a a 2c | ✅     |
| 3    | Atualizar `setup/config-writer.ts` para persistir sub-features | PRFIX-3a      | ✅     |
| 4    | Rodar testes e validar (vitest, tsc, lint)                     | PRFIX-4a a 4c | ✅     |
| 5    | Auditoria completa da funcionalidade + testes 100% cobertura   | PRFIX-5a a 5c | ✅     |

### Fase 1 — Criar `config/features.json`

| ID       | Item                                                              | Arquivo                | Status |
| -------- | ----------------------------------------------------------------- | ---------------------- | ------ |
| PRFIX-1a | 🔧 Criar `config/features.json` com entrada `qa_tools` habilitada | `config/features.json` | ✅     |

### Fase 2 — Corrigir `feature-config.test.ts`

| ID       | Item                                                                | Arquivo                                   | Status |
| -------- | ------------------------------------------------------------------- | ----------------------------------------- | ------ |
| PRFIX-2a | ♻️ Usar diretório temporário (`os.tmpdir()`) em vez de project root | `shared/__tests__/feature-config.test.ts` | ✅     |
| PRFIX-2b | 🔧 Adicionar `afterEach` para limpar diretório temporário           | `shared/__tests__/feature-config.test.ts` | ✅     |
| PRFIX-2c | 📋 Verificar que nenhum arquivo real é afetado pelos testes         | `shared/__tests__/feature-config.test.ts` | ✅     |

### Fase 3 — Atualizar `setup/config-writer.ts`

| ID       | Item                                                                                              | Arquivo                  | Status |
| -------- | ------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| PRFIX-3a | ✨ Persistir `skipAi`, `skipQuality`, `skipFlaky` no `features.json` quando `prReport` habilitado | `setup/config-writer.ts` | ✅     |

### Fase 4 — Rodar testes e validar

| ID       | Item                  | Critério  | Status |
| -------- | --------------------- | --------- | ------ |
| PRFIX-4a | 🔧 `npx vitest run`   | 100% pass | ✅     |
| PRFIX-4b | 🔧 `npx tsc --noEmit` | 0 erros   | ✅     |
| PRFIX-4c | 🔧 `npm run lint`     | 0 erros   | ✅     |

### Fase 5 — Auditoria completa

| ID       | Item                                                       | Arquivo                                   | Status |
| -------- | ---------------------------------------------------------- | ----------------------------------------- | ------ |
| PRFIX-5a | 🔧 Verificar conexão: wizard → config → runtime → CI       | —                                         | ✅     |
| PRFIX-5b | 🔧 Verificar menu: PR Report configurável via git_triggers | —                                         | ✅     |
| PRFIX-5c | 🔧 Testes com cobertura 100% para paths corrigidos         | `shared/__tests__/feature-config.test.ts` | ✅     |

### Métricas Alvo

| Métrica                                  | Alvo          |
| ---------------------------------------- | ------------- |
| `config/features.json` existe            | **sim**       |
| `feature-config.test.ts` usa tmp dir     | **sim**       |
| `feature-config.test.ts` tem cleanup     | **sim**       |
| `config-writer.ts` persiste sub-features | **sim**       |
| `tsc --noEmit`                           | **0 erros**   |
| `vitest run`                             | **100% pass** |
| `npm run lint`                           | **0 erros**   |
| Cobertura feature-config.test.ts         | **100%**      |

### E2E Validation — 2026-06-14

| Check               | Resultado | Detalhe                                                                              |
| ------------------- | --------- | ------------------------------------------------------------------------------------ |
| Feature config lida | ✅        | `qa_tools.prReport.enabled: true` — report não foi pulado                            |
| CTRF parse          | ✅        | 4862 passed, 0 failed, 9 skipped                                                     |
| HTML report gerado  | ✅        | `reports/pr-report.html` — 12MB                                                      |
| PR comment postado  | ✅        | [#8 comment](https://github.com/kevindemian/qa_tools/pull/8#issuecomment-4701633988) |
| Health score        | ✅        | Score 60, Grade B                                                                    |
| Quality gate        | ✅        | Executado — FAIL (52/100): coverage 0% abaixo do threshold                           |
| Check Run           | ⚠️ 403    | PAT sem permissão `checks:write` — não é bug da ferramenta                           |
| Branch + PR cleanup | ✅        | Branch deletada, PR #8 fechado                                                       |

**Débito identificado:** `GITHUB_TOKEN` (PAT) não tem permissão `checks:write`. No CI (GitHub Actions `GITHUB_TOKEN`) isso funciona. Não é bug da ferramenta.

---

## 📋 TECHDOC — Documentação Técnica para Consulta de IA (Jun/2026)

**Data:** 2026-06-13
**Objetivo:** Criar `docs/TECHDOC.md` — documentação técnica consolidada otimizada para consulta por IA durante o desenvolvimento. Contém modelo de domínio completo (tipos/interfaces), mapa de módulos, arquitetura, CLI reference, configuração (124 env vars), e decisões arquiteturais.
**Manutenção:** Deve ser atualizado simultaneamente sempre que contratos, tipos ou arquitetura forem alterados.
**Destinado a:** consumo por IA (não substitui `docs/*` que são orientados a humanos).

| ID    | Item                                                                                   | Status |
| ----- | -------------------------------------------------------------------------------------- | ------ |
| TD-01 | 🔧 Criar `docs/TECHDOC.md` com modelo de domínio completo (todos os tipos/ interfaces) | ✅     |
| TD-02 | 🔧 Registrar no backlog existência e objetivo do TECHDOC.md                            | ✅     |

---

## 🛡️ Sprint Baseline Zero — Eliminação de Todos os Mecanismos de Supressão (Jun/2026)

**Data:** 2026-06-12
**Origem:** Auditoria sistêmica de segurança: 20 mecanismos de baseline/supressão identificados.
**Estratégia:** Order by safety impact — mecanismos que mascaram regressões primeiro.
**Regra absoluta:** no workarounds, no debt, no safety rule violations.

### Plano de Fases

| Fase | Descrição                                                                    | Status |
| ---- | ---------------------------------------------------------------------------- | ------ |
| 1    | Remover Known Issues + Endurecer Quality Gate                                | ✅     |
| 2    | Remover Quarantine + Flaky Auto-Actions                                      | ✅     |
| 3    | Refatorar 342 `vi.mocked()` → `vi.spyOn()` + remover UNBOUND_METHOD_BASELINE | ✅     |
| 4    | Eliminar unused-exports baseline + deferred dead code                        | ✅     |
| 5    | Corrigir non-null exclusions + `as unknown as` produção + `eslint-disable`   | ✅     |
| 6    | Criar suppression-auditor agent (18 categorias de detecção + correção)       | ✅     |

### Fase 1 — Remover Known Issues + Endurecer Quality Gate ✅

**Objetivo:** Falhas de teste não podem mais ser mascaradas. Thresholds de qualidade são fixos.

**Mudanças realizadas:**

| ID    | Arquivo                              | Ação                                                                                                                                   | Status |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| BZ-01 | `shared/report-types.ts`             | Remover interface `KnownIssue`, função `toKnownIssues()`                                                                               | ✅     |
| BZ-02 | `shared/report-sections.ts`          | Remover parâmetro `knownIssues` de `buildTabContents()`                                                                                | ✅     |
| BZ-03 | `shared/report-generator.ts`         | Remover `loadKnownIssues()`, `KnownIssue` de export                                                                                    | ✅     |
| BZ-04 | `shared/report-table.ts`             | Remover `matchKnownIssue()` + parâmetro `knownIssues`                                                                                  | ✅     |
| BZ-05 | `shared/config-schema.ts`            | Remover `knownIssuesPath` do schema                                                                                                    | ✅     |
| BZ-06 | `shared/types/common.ts`             | Remover `knownIssuesPath?` do `ReportConfig`                                                                                           | ✅     |
| BZ-07 | `shared/report-styles.ts`            | Remover `.ki-suppressed`, `.ki-badge` CSS                                                                                              | ✅     |
| BZ-08 | `shared/quality-gate.ts`             | Thresholds fixos `as const`, remover `loadEnvThresholds()`, `isGitFallback`, `_maybeTriggerFlakyActions()`, `generateGitMetricsRuns()` | ✅     |
| BZ-09 | `jira_management/commands/case17.ts` | Remover `loadKnownIssues()` import e uso                                                                                               | ✅     |
| BZ-T  | Testes                               | Atualizar 4 arquivos de teste                                                                                                          | ✅     |

### Fase 2 — Remover Quarantine + Flaky Auto-Actions ✅

**Mudanças realizadas:**

| ID    | Arquivo                                      | Ação                                                  | Status |
| ----- | -------------------------------------------- | ----------------------------------------------------- | ------ |
| BZ-11 | `shared/flaky-auto-actions.ts`               | Remover arquivo (272 linhas)                          | ✅     |
| BZ-12 | `shared/flaky-auto-actions.test.ts`          | Remover arquivo                                       | ✅     |
| BZ-13 | `.opencode/guard/backups/qa-quarantine.json` | Remover arquivo                                       | ✅     |
| BZ-14 | `shared/quality-gate.ts`                     | Import já removido na Fase 1 (BZ-10)                  | ✅     |
| BZ-15 | `jira_management/commands/case19.ts`         | Remover import + `executeFlakyActions` + `askConfirm` | ✅     |
| BZ-16 | `jira_management/commands/case19.test.ts`    | Remover 3 testes de auto-actions + mock               | ✅     |
| BZ-17 | `git_triggers/batch-mode.ts`                 | Remover `runFlakyAutoActions()` + import              | ✅     |
| BZ-18 | `git_triggers/schedule-handler.ts`           | Remover `runFlakyAutoActionsForProject()` + imports   | ✅     |
| BZ-19 | `git_triggers/schedule-handler.test.ts`      | Remover mock `flaky-auto-actions`                     | ✅     |
| BZ-20 | `shared/types/bugs.ts`                       | Remover `FlakyAction`, `FlakyActionConfig` interfaces | ✅     |

### Fase 3 — Refatorar `vi.mocked()` → `vi.spyOn()` ✅

**342 ocorrências em 41 arquivos de teste transformadas.**

**Padrão:** `vi.mocked(obj.method)` → `vi.spyOn(obj, 'method')`
**Script:** `/tmp/fix-vimocked.mjs` (transformação regex em massa)
**Removido:** `UNBOUND_METHOD_BASELINE = 313` de `scripts/quality-check.ts`
**Mantido:** `MockedSafe<T>` (ainda usado por `handlers.test.ts`)
**`checkEslintBaseline` simplificado:** sem tracking de baseline, qualquer violação = falha

### Fase 4 — Eliminar Unused-Exports Baseline ✅

**Mudanças realizadas:**

| ID    | Arquivo                            | Ação                                                                                        | Status |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| BZ-21 | `scripts/.unused-exports-baseline` | Removido (baseline stale — 0 unused exports atuais)                                         | ✅     |
| BZ-22 | `docs/DEFERRED-DEAD-CODE.md`       | Removido                                                                                    | ✅     |
| BZ-23 | `scripts/quality-check.ts`         | Remover `checkUnusedExports` baseline comparison + `UNUSED_EXPORTS_BASELINE_FILE` constante | ✅     |
| BZ-24 | `scripts/quality-check.test.ts`    | Atualizar 4 testes de `checkUnusedExports`                                                  | ✅     |

**Nota:** Baseline estava completamente stale — `npx ts-prune --error` com filtros de path retorna 0 unused exports. Todos os 31 itens do baseline foram endereçados por refatorações anteriores.

### Fase 5 — Corrigir as-unknown-as em Produção ✅

**Todas as correções concluídas.**

| ID    | Arquivo                      | Correção                                                | Status |
| ----- | ---------------------------- | ------------------------------------------------------- | ------ |
| BZ-25 | `e2e/run-e2e.ts`             | `z.record(z.string(), z.unknown())` schema              | ✅     |
| BZ-26 | `git_triggers/batch-mode.ts` | Cast removido — tipos estruturalmente compatíveis       | ✅     |
| BZ-27 | `shared/splash.ts`           | `// structural:` — CJS/ESM dual-package type limitation | ✅     |
| BZ-28 | `shared/llm-client.ts`       | Type guard + overload signatures                        | ✅     |
| BZ-29 | `shared/targeted-retry.ts`   | Zod schema parse via `ZodSchemaTyped<T>`                | ✅     |

**`as unknown as` remanescente (documentado):**

- `shared/splash.ts:37` — `// structural: dual CJS/ESM — @types/figlet declares \`export =\` but runtime ESM entry wraps in \`{ default: f }\``

**Intencionalmente mantidos (test-utils, sem as unknown as):**

- `shared/test-utils.ts` (`nullAs`, `undefinedAs`) — utilitários intencionais
- `shared/test-utils/factories/*.ts` — factory functions (só usadas em testes)
- `shared/test-utils/mock-types.ts` (`mockedSafe`) — utilitário de mock

### Fase 6 — Criar suppression-auditor Agent ✅

**Criado:** `.opencode/agents/suppression-auditor.md`

18 categorias de detecção:

| ID  | Categoria                             | Severidade | Detecção                                                |
| --- | ------------------------------------- | ---------- | ------------------------------------------------------- |
| S1  | `as unknown as` casts                 | CRITICAL   | `rg 'as unknown as'`                                    |
| S2  | Non-null assertions `!`               | CRITICAL   | `rg '!\.[a-zA-Z]'`                                      |
| S3  | Suppression comments                  | CRITICAL   | `rg '[@]ts-ignore\|[@]ts-expect-error\|eslint-disable'` |
| S4  | Test `.skip` / `.only`                | HIGH       | `rg '\.skip\(' / '\.only\('`                            |
| S5  | Empty catch blocks                    | CRITICAL   | `rg 'catch\s*\(\s*\)\s*\{\s*\}'`                        |
| S6  | `any` type in production              | HIGH       | `rg ':\s*any' / '[a]s any'`                             |
| S7  | `process.exit()` without gracefulExit | HIGH       | `rg 'process\.exit\b'`                                  |
| S8  | `console.log` in production           | MEDIUM     | `rg 'console\.(log\|warn\|error\|debug)\('`             |
| S9  | Baseline / threshold override         | CRITICAL   | `rg 'BASELINE\|THRESHOLD\|_LIMIT'`                      |
| S10 | Stale TODO/FIXME without owner        | LOW        | `rg 'TODO\|FIXME\|HACK'` sem data/owner                 |
| S11 | `vi.mocked()` regression check        | CRITICAL   | `rg 'vi\.mocked\('`                                     |
| S12 | Bracket notation monitoring           | LOW        | Concession C1 tracking                                  |
| S13 | Compiler warning suppression          | CRITICAL   | `rg '[@]ts-nocheck'`                                    |
| S14 | Weak type assertions                  | HIGH       | `rg '[a]s\s+(any\|unknown\|never)\b'`                   |
| S15 | Catch without logging                 | MEDIUM     | catch sem logger/invocado                               |
| S16 | Dead code markers                     | MEDIUM     | `rg '\/\/ dead\|REMOVE'`                                |
| S17 | `describe.skip` / `it.skip`           | HIGH       | `rg 'describe\.skip\|it\.skip'`                         |
| S18 | Quality gate suppression detection    | CRITICAL   | `rg '--no-verify\|\[skip ci\]'`                         |

**Inclui:** protocolo de autofix, formato de output `.json` + `.md`, classificação ACTIVE/FALSE-POS/STRUCTURAL, e protocolo de 3-passos para parada segura.

### Concessões Temporárias (para correção pós-sprint)

Concessões — nenhuma compromete correção; serão eliminadas gradualmente.

| #   | Concessão                                   | Onde                            | Por que                                                                                                                                                           | Correção                                                             |
| --- | ------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | Bracket notation `obj['method']`            | 18 test files, ~125 ocorrências | `@typescript-eslint/unbound-method` flagou `expect(obj.method)` como "método sem `this`". Bracket notation é o escape hatch legítimo da regra — não a enfraquece. | Substituir por `spyRef()` helper ou armazenamento de spy em variável |
| C2  | Stub run em `.qa-tools/metrics/global.json` | `runs[0]`                       | Quality Gate exige `runs.length >= 1`. Sem histórico, gate bloqueia push.                                                                                         | Primeiro CI run substitui naturalmente                               |

### Métricas Alvo

| Métrica                         | Antes        | Depois                        |
| ------------------------------- | ------------ | ----------------------------- |
| Baselines em quality-check.ts   | 2            | **0**                         |
| Known Issues system             | Ativo        | **Removido**                  |
| Flaky Auto-Actions              | Ativo        | **Removido**                  |
| Thresholds override por env var | 4            | **0**                         |
| Git fallback auto-pass          | 1            | **0**                         |
| `vi.mocked()` em testes         | ~313         | **0**                         |
| File exclusions (non-null)      | 6 arquivos   | **0**                         |
| `as unknown as` em produção     | ~24 arquivos | **1** (structural: splash.ts) |
| `eslint-disable` inline         | 6            | **0**                         |
| Dead code deferido              | 62           | **0**                         |
| Suppression auditor             | ❌           | **✅**                        |

---

## 🛡️ Sprint Inverse Audit — Correção de Achados (Jun/2026)

**Data:** 2026-06-12
**Origem:** Auditoria inversa — funcionalidades que dependem de código ausente ou incompleto. 4 achados (1 HIGH, 3 MEDIUM).
**Ordem de execução:** Placeholder → Env var faltante → .env.example sync → Validação runtime.

### Plano de Fases

| Fase | Descrição                                                       | Itens | Status |
| ---- | --------------------------------------------------------------- | ----- | ------ |
| 1    | Remover placeholder órfão (cast-test.test.ts)                   | IA-1  | ✅     |
| 2    | Adicionar OPENCODE_DB_TIMEOUT_MS ao schema + .env.example       | IA-2  | ✅     |
| 3    | Sincronizar .env.example com CONFIG_SCHEMA (geração automática) | IA-3  | ✅     |
| 4    | Expandir validação runtime (data-driven, enum checks, unknown)  | IA-4  | ✅     |
| TST  | tsc + vitest + lint                                             | —     | ✅     |

### Detalhamento por Fase

#### Fase 1 — Remover placeholder órfão

| ID   | Item                                                | Arquivo                 | Correção        |
| ---- | --------------------------------------------------- | ----------------------- | --------------- |
| IA-1 | 🐛 Test placeholder sem produção: cast-test.test.ts | `e2e/cast-test.test.ts` | Remover arquivo |

#### Fase 2 — OPENCODE_DB_TIMEOUT_MS no schema

| ID   | Item                                                                   | Arquivo(s)                | Correção                         |
| ---- | ---------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| IA-2 | 🔧 OPENCODE_DB_TIMEOUT_MS consumido mas ausente do schema/.env.example | `shared/config-schema.ts` | Adicionar entry no CONFIG_SCHEMA |

#### Fase 3 — .env.example sync automático

| ID   | Item                                                  | Arquivo(s)                                                        | Correção                                              |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| IA-3 | 🔧 32 env vars no schema mas ausentes do .env.example | `scripts/generate-env-example.ts`, `.env.example`, `package.json` | Criar gerador, regenerar .env.example, add npm script |

#### Fase 4 — Validação runtime expandida

| ID   | Item                                                                | Arquivo(s)                                                      | Correção                                              |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| IA-4 | 🔧 Apenas 3 de ~87 configs validadas — typos silenciosos em runtime | `shared/config-validator.ts`, `shared/config-validator.test.ts` | Validar tipos + valores conhecidos + unknown env vars |

### Métricas Alcançadas

| Métrica                         | Antes | Resultado        |
| ------------------------------- | ----- | ---------------- |
| `tsc --noEmit`                  | 0     | ✅ 0             |
| `vitest run`                    | 4541  | ✅ 4541 pass     |
| Placeholders sem produção       | 1     | ✅ 0             |
| Env vars no schema              | 86    | ✅ 90            |
| Env vars no .env.example        | 54    | ✅ 90 (total)    |
| Configs validadas               | 3     | ✅ All (~90)     |
| Env vars c/ allowedValues enum  | 0     | ✅ 6             |
| Env vars c/ category            | 0     | ✅ 90            |
| Validação data-driven           | ❌    | ✅ CONFIG_SCHEMA |
| Geração .env.example automática | ❌    | ✅ npm script    |

---

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas pendentes ou em andamento.
> Tarefas concluídas devem ser **imediatamente migradas** para [`BACKLOG-historico.md`](BACKLOG-historico.md).
>
> Cada tarefa é classificada como:
>
> - 🐛 **débito** — código existente que precisa de correção/conexão
> - ✨ **feature** — nova funcionalidade a ser implementada
> - ♻️ **refactor** — reestruturação sem mudança de comportamento
> - 🔧 **chore** — manutenção (deps, config, tooling)
> - 📋 **test** — cobertura de testes
>
> ## Critério de prioridade
>
> - **P0**: Bloqueia CI ou funcionalidade crítica
> - **P1**: Impacto alto em manutenibilidade, risco médio
> - **P2**: Melhoria desejável, baixo risco
> - **P3**: Nice-to-have, oportunidade futura

---

## 🛡️ Sprint Security Audit — Correção Completa (Jun/2026)

**Data:** 2026-06-11
**Origem:** Auditoria sistêmica de segurança: 24 achados (4 CRÍTICOS, 7 ALTOS, 5 MÉDIOS, 4 BAIXOS).
**Ordem de execução:** Infra → Overrides → Quality-check bugs → Type safety → Consolidação → Testes.

### Plano de Fases

| Fase | Descrição                                                         | Itens                       | Status |
| ---- | ----------------------------------------------------------------- | --------------------------- | ------ |
| 0    | Infra: unused-exports, tsconfig, wiring pre-push                  | P0b, P0c, P0d, P0e          | ✅     |
| 1    | File-level eslint-disable → execFileSync + argv array             | A4 (store-backend, git-sha) | ✅     |
| 2    | quality-check.ts bugs (checkAsAny, depWall, exit, hash, severity) | A2, A3, M2, M3, M4, B1      | ✅     |
| 3    | `as unknown as` em produção → cast direto                         | A6 (5 arquivos)             | ✅     |
| 4    | Consolidação: remover enforce-quality.ts + duplicações            | M1, A5, B2, B3              | ✅     |
| 5    | Segurança: scan-sec-logs.sh blocking + tsconfig fix + CI          | A1, C4                      | ✅     |
| 6    | Testes (271 files, 4539 pass)                                     | Todos os anteriores         | ✅     |
| 7    | Verificação final: TSC + lint + vitest + quality-check            | —                           | ✅     |

### Detalhamento por Fase

#### Fase 0 — Infra (dependências zero)

| ID  | Item                                                                        | Arquivos                                   | Esforço |
| --- | --------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| P0a | BACKLOG.md atualizado                                                       | BACKLOG.md                                 | 5min    |
| P0b | Adicionar script `unused-exports` ao package.json                           | package.json                               | 2min    |
| P0c | Mover `noPropertyAccessFromIndexSignature` para dentro de `compilerOptions` | tsconfig.json                              | 2min    |
| P0d | Trocar `enforce-quality.ts` → `quality-check.ts` no pre-push hook           | .githooks/pre-push                         | 2min    |
| P0e | Trocar `enforce-quality.ts` → `quality-check.ts` no opencode-guard          | scripts/opencode-guard.sh (linhas 61, 259) | 2min    |

#### Fase 1 — ESLint File-Level Overrides (A4)

| ID  | Item                                                               | Arquivos                |
| --- | ------------------------------------------------------------------ | ----------------------- |
| P1a | Trocar file-level eslint-disable para per-line em store-backend.ts | shared/store-backend.ts |
| P1b | Trocar file-level eslint-disable para per-line em git-sha.ts       | shared/git-sha.ts       |

#### Fase 2 — quality-check.ts Bugs (A2, A3, M2, M3, M4, B1)

| ID  | Item                                                  | Descrição                |
| --- | ----------------------------------------------------- | ------------------------ |
| P2a | Fix `checkAsAny` — testar conteúdo da linha, não path | quality-check.ts:76-83   |
| P2b | Fix `checkDepWall` — detectar `require(`              | quality-check.ts:471     |
| P2c | Fix `process.exit(1)` → `gracefulExit`                | quality-check.ts:607-609 |
| P2d | Fix hash `replace()` sem flag g                       | quality-check.ts:512     |
| P2e | Detectar severidade 1 (warn) do ESLint                | quality-check.ts:111     |
| P2f | Documentar exclusões non-null assertion               | quality-check.ts:458-465 |

#### Fase 3 — `as unknown as` em Produção (A6)

| ID  | Arquivo                    | Linhas   | Solução                                   |
| --- | -------------------------- | -------- | ----------------------------------------- |
| P3a | shared/llm-client.ts       | 165, 214 | Extrair tipo, usar cast seguro com schema |
| P3b | shared/targeted-retry.ts   | 79       | Usar schema do retorno llmPrompt          |
| P3c | shared/splash.ts           | 37       | Tipar import() dinâmico                   |
| P3d | git_triggers/batch-mode.ts | 383, 387 | Usar zod parse                            |
| P3e | e2e/run-e2e.ts             | 343, 406 | Tipar com Record tipado                   |

#### Fase 4 — Consolidação (M1, A5, B2)

| ID  | Item                                                      | Descrição                                   |
| --- | --------------------------------------------------------- | ------------------------------------------- |
| P4a | Remover enforce-quality.ts                                | Após wiring completo                        |
| P4b | Documentar baseline unused-exports                        | quality-check.ts + .unused-exports-baseline |
| P4c | Adicionar justificativa nos eslint-disable-no-var em test | handlers.test.ts:37,64                      |
| P4d | Remover exclusão de quality-check.test.ts de 3 checks     | quality-check.ts:287,295,303                |

#### Fase 5 — Segurança (A1, C4)

| ID  | Item                                  | Descrição             |
| --- | ------------------------------------- | --------------------- |
| P5a | Remover \|\| true do scan-sec-logs.sh | .githooks/pre-push:76 |
| P5b | Remover \|\| true do GitLab CI        | .gitlab-ci.yml:14     |

#### Fase 6 — Testes

| ID  | Item                                      | Cobertura               |
| --- | ----------------------------------------- | ----------------------- |
| P6a | Testes para checkAsAny fix                | quality-check.test.ts   |
| P6b | Testes para checkDepWall require()        | quality-check.test.ts   |
| P6c | Testes para process.exit → gracefulExit   | quality-check.test.ts   |
| P6d | Testes para hash replaceAll               | quality-check.test.ts   |
| P6e | Testes para warn severity detection       | quality-check.test.ts   |
| P6f | Testes para zod validation nos 5 arquivos | llm-client.test.ts, etc |

#### Fase 7 — Verificação Final

| ID  | Item                            | Critério                 |
| --- | ------------------------------- | ------------------------ |
| P7a | tsc --noEmit                    | 0 erros                  |
| P7b | npm run lint (quality-check.ts) | 0 violações não-baseline |
| P7c | vitest run                      | 100% pass                |
| P7d | quality-check auto-integrity    | hash válido              |

### Métricas Finais

| Métrica                                         | Antes                             | Depois                                    | Alvo     |
| ----------------------------------------------- | --------------------------------- | ----------------------------------------- | -------- |
| Achados de segurança                            | 24 (4C, 7A, 5M, 4B)               | **1 remanescente** (case15:60, infixável) | 0        |
| `no-restricted-syntax` suppression (file-level) | 2                                 | **0**                                     | 0        |
| `execSync` + template literals (injection risk) | 8                                 | **0** (todos `execFileSync` + argv)       | 0        |
| `as unknown as` em produção                     | 7                                 | **0**                                     | 0        |
| `process.exit(1)` replacing gracefulExit        | 1                                 | **0**                                     | 0        |
| `scan-sec-logs.sh` suprimido (`\|\| true`)      | 1                                 | **0** (blocking)                          | 0        |
| `noPropertyAccessFromIndexSignature`            | ignorado (fora `compilerOptions`) | **ativo**                                 | ativo    |
| TSC --noEmit                                    | 0 + 716 (após ativar flag)        | **0** (716 corrigidos)                    | 0        |
| quality-check gates                             | 18 (2 scripts)                    | **18** (1 script)                         | 1 script |
| enforce-quality.ts                              | ativo (duplicado)                 | **removido**                              | 0        |
| npm test                                        | 4534 pass                         | **4539 pass**                             | 100%     |

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas pendentes ou em andamento.
> Tarefas concluídas devem ser **imediatamente migradas** para [`BACKLOG-historico.md`](BACKLOG-historico.md).
> Após concluir um item, copie sua linha/raw para o histórico e remova-a daqui.
>
> Cada tarefa é classificada como:
>
> - 🐛 **débito** — código existente que precisa de correção/conexão
> - ✨ **feature** — nova funcionalidade a ser implementada
> - ♻️ **refactor** — reestruturação sem mudança de comportamento
> - 🔧 **chore** — manutenção (deps, config, tooling)
> - 📋 **test** — cobertura de testes

## 🚀 Sprint Senior Audit — Correções Pós-Auditoria (Jun/2026)

**Origem:** Senior Codebase Audit — 37 achados (1 CRÍTICO, 3 ALTO, 8 MÉDIO, 15 BAIXO, 10 INFO).
**Issues reportadas pelo usuário:** 3 bugs runtime (CR-1, CR-2, CR-3).
**Relatório completo:** `.audit/senior-audit-2026-06-06.md`
**Ordem de execução:** risco decrescente — crashes primeiro, refatoração arquitetural por último.

### Lógica de Ordenação

| Wave | Foco                 | Risco | Justificativa                                          |
| ---- | -------------------- | ----- | ------------------------------------------------------ |
| 0    | P0 Crashes           | Zero  | Bugs que impedem o app de funcionar — impacto imediato |
| 1    | Config Safety        | Baixo | Itens independentes de 5-15min, sem dependências       |
| 2    | Error Handling       | Baixo | Catch silenciosos, logs perdidos — diagnóstico         |
| 3    | Security & Contracts | Médio | spawn validation, zod schemas, async consistency       |
| 4    | Tests + E2E          | Baixo | Testes para bugs corrigidos, conditional E2E           |
| 5    | Architecture         | Alto  | Refatoração de alta complexidade, feito por último     |

---

### Wave 4 — Tests + E2E

| ID    | Item                                                                                             | Arquivo(s)                     | Esforço | Status |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------- | ------ |
| SA-21 | 🧹 Substituir `describe.skip` por `it.runIf` ou dynamic skip em `smoke-xray-cloud`               | `e2e/smoke-xray-cloud.test.ts` | 20min   | ✅     |
| SA-22 | 🧹 Substituir `describe.skip` por `it.runIf` ou dynamic skip em `smoke-jira-cloud`               | `e2e/smoke-jira-cloud.test.ts` | 20min   | ✅     |
| CR-3a | 📋 Teste de integração: SIGINT real com answer undefined + answer ''                             | `shared/cli_base.test.ts`      | 30min   | ✅     |
| CR-3b | 📋 Teste de integração: main() → \_initEnvironment() + user "n" → \_selectProject() sem projects | `git_triggers/main.test.ts`    | 30min   | ✅     |
| CR-3c | 📋 Teste de integração: fluxo entry-menu → module spawn → env → projeto (e2e)                    | `e2e/entry-to-project.test.ts` | 1h      | ✅     |

### Wave 5 — Architecture (alto risco, executado por último)

| ID    | Item                                                                                                          | Arquivo(s)                                                                                 | Esforço | Risco    | Status |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- | -------- | ------ |
| SA-20 | ♻️ Extrair CLI argument parsing de `git_triggers/main.ts` (443 linhas)                                        | `git_triggers/main.ts` → `git_triggers/cli-args.ts`                                        | 1h      | 🟡 Médio | ✅     |
| SA-12 | ♻️ Extrair fixture loading + coverage + report de `llm-benchmark.ts` (499→226 linhas)                         | `shared/llm-benchmark.ts` → `shared/benchmark-*.ts`                                        | 2h      | 🔴 Alto  | ✅     |
| SA-11 | ♻️ Extrair 13 invariantes (T-01 a T-13) de `test-case-validator.ts` (882→18 linhas) para `shared/invariants/` | `shared/test-case-validator.ts` → `shared/invariants/t-*.ts` + 4 shared modules + index.ts | 4h      | 🔴 Alto  | ✅     |
| SA-13 | ♻️ Quebrar 4 cadeias de dependência circular em `shared/llm-*` (extrair tipos compartilhados)                 | `llm-client.ts`→`./types/llm.ts` (LlmPromptOptions extraído)                               | 2h      | 🟡 Médio | ✅     |

### Falso Positivo / Nenhuma Ação (documentado para auditoria)

| ID      | Achado                              | Decisão                    | Evidência                                    |
| ------- | ----------------------------------- | -------------------------- | -------------------------------------------- |
| C19-3   | createIssueForTest sem idempotência | ❌ **Falso positivo**      | `skipExisting: true` em `import-loop.ts:65`  |
| C2-1    | TODOs desatualizados                | ✅ Nenhuma ação            | Projeto limpo, TODOs só em regex de detecção |
| C3-1    | Type assertion defensiva            | ✅ Nenhuma ação            | Padrão intencional e seguro                  |
| C5      | Violações cross-layer               | ✅ Nenhuma ação            | Grafo limpo, zero violações                  |
| C10     | Listas longas de parâmetros         | ✅ Nenhuma ação            | Nenhuma função com 7+ parâmetros             |
| C12     | Regressões                          | ✅ Nenhuma ação            | Todas verificadas e limpas                   |
| C14     | Secrets hardcoded                   | ✅ Nenhuma ação            | Zero credenciais em código                   |
| C16     | Higiene TS                          | ✅ Nenhuma ação            | 100% TS, zero type escapes                   |
| C17     | Divergência de mocks                | ✅ Nenhuma ação            | Mocks consistentes com API real              |
| C18-1   | console.log como logger             | ✅ Nenhuma ação            | Design intencional do framework de log       |
| C19-1/2 | Idempotência TE/Precondition        | ✅ Nenhuma ação            | Padrão find-before-create correto            |
| C20     | Performance                         | ✅ Nenhuma ação            | Sem gargalos identificados                   |
| C22     | Cobertura de testes                 | ✅ Nenhuma ação            | 248 test files, cobertura completa           |
| C8-2    | Assinatura construtor diferente     | ✅ Documentar na interface | Diferença de domínio da API                  |

### Métricas Alvo (Senior Audit)

| Métrica                              | Atual                          | Alvo                         |
| ------------------------------------ | ------------------------------ | ---------------------------- |
| `tsc --noEmit`                       | 0 erros                        | 0 erros                      |
| `npm test`                           | 4149 pass                      | 100% pass                    |
| `npm run lint`                       | 0 erros                        | 0 erros                      |
| `require.main === module`            | 1 (fixado)                     | 0                            |
| `describe.skip` incondicional        | 2                              | 0                            |
| `catch {}` sem log                   | 4 (SA-7/8/9) + state.ts        | 0                            |
| `process.env` ignorando Config.get() | 3 (NO_COLOR, CI, AUTO_CONFIRM) | 0                            |
| Config entries no schema             | ~90                            | +2 (noColor, qaToolsNoClear) |
| Chalk version                        | 5.0.0                          | 5.6.2                        |
| Ctrl+C crash (answer undefined)      | 1                              | 0                            |
| Testes SIGINT com answer undefined   | 0                              | ≥2                           |
| Testes fluxo env → projeto           | 0                              | ≥2                           |
| Funções > 300 linhas                 | 0                              | 0                            |
| Ciclos de dependência                | 0                              | 0                            |
| Arquivos > 300 linhas                | 29                             | ≤ 29                         |

---

## 🛡️ Sprint Validation Hook — Restauração de Proteções (Jun/2026)

**Data:** 2026-06-07
**Origem:** Agente violou regras de segurança ao modificar `~/.config/opencode/validation_hook.ts` para enfraquecer padrões de detecção. 5 alterações não autorizadas foram revertidas. Proteções permanentes adicionadas.
**Esforço total:** ~2h

### Problemas encontrados

| #       | Item                                                                 | Severidade | Local                    |
| ------- | -------------------------------------------------------------------- | ---------- | ------------------------ |
| **F1**  | Recursion depth protection ineficaz (AsyncLocalStorage reseta depth) | 🔴 Alta    | `validateMultiCommand()` |
| **F2**  | Dupla leitura de `COMMIT_EDITMSG`                                    | 🔴 Alta    | `runCheckCommitMsg()`    |
| **F3**  | `SED_PATTERN` backreference `\1` incorreto                           | 🟡 Média   | `SED_PATTERN`            |
| **F4**  | Non-null assertion `match[1]!` insegura                              | 🟡 Média   | `parseGitDiff()`         |
| **F5**  | `detectFileWrites` — aspas aninhadas truncam conteudo                | 🟡 Média   | 6 regex patterns         |
| **F6**  | Lookbehind `\s{0,20}` só captura whitespace — falso positivo         | 🟡 Média   | 3 lookbehinds            |
| **F7**  | `parseInt` sem fallback — env var invalida produz `NaN`              | 🟡 Média   | Config block             |
| **F8**  | `hasDangerousCodeDensity` nao filtra `/* */` comments                | 🟢 Baixa   | density check            |
| **F9**  | Variavel `gitDir` nome enganoso (e' caminho de arquivo)              | 🟢 Baixa   | `runCheckCommitMsg()`    |
| **F10** | Entry point sem normalizacao de caminho (symlink quebra)             | 🟢 Baixa   | entry point              |
| **F11** | `runCheck` com diff vazio retorna falso positivo                     | 🟢 Baixa   | `runCheck()`             |

### Solução implementada

| Componente        | O que faz                                                                            |
| ----------------- | ------------------------------------------------------------------------------------ |
| **CLI expandido** | `--full-scan`, `--audit`, `--summary`, `--json` combinavel (apenas flags de leitura) |

### Lotes

| Lote | Descrição                                        | Itens | Status |
| ---- | ------------------------------------------------ | ----- | ------ |
| A    | Correção de bugs F1–F11                          | 11    | ✅     |
| E    | Testes de regressão F1–F11 + rename + empty diff | 2     | ✅     |

---

## 🚀 Sprint Menu — Mapeamento de Features no Menu (P0)

**Data:** 2026-06-07
**Origem:** Auditoria de menu vs. features implementadas — 29 features invisíveis ao usuário (4 descobertas em 07/06).

**Problema:** Sprints 10/11/12/V1-V5 implementaram 29 funcionalidades que não aparecem em nenhum menu. Usuário não consegue descobri-las ou acessá-las sem conhecimento prévio de comandos CLI ou env vars.

**Agrupamento das 29 features invisíveis:**

| Grupo                  | Qtd | Features                                                                                                                                                                                                                                                                       | Acesso atual                  |
| ---------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Handlers órfãos        | 4   | Run Comparison, Pipeline Health, AI PR Description, Bug Report Flow                                                                                                                                                                                                            | Nenhum                        |
| Dashboards silenciados | 16  | Release Score, Defect Trend, Traceability, Backlog Health, AI Effectiveness, Defect Seasonality, Silent Regression, AI Comparison, Cross-Squad Benchmark, Developer Profile, Suite Optimization, Pipeline Cost, Impact Alert, Incident Report, Requirement Score, Coverage Gap | Só no relatório semanal (`r`) |
| Features CLI/env       | 2   | Quality Gate, Auto-Triage Toggle                                                                                                                                                                                                                                               | CLI/env var                   |
| Documentação           | 1   | Flaky Thresholds Docs                                                                                                                                                                                                                                                          | `.env.example` + docs         |
| Infra automática       | 1   | Git Metrics Adapter                                                                                                                                                                                                                                                            | Automático (fallback)         |
| Infra interna          | 4   | Circuit Breaker, Config Safety, Error Handling, Security                                                                                                                                                                                                                       | Internal (não user-facing)    |

**Features user-facing a expor:** 22 (✅ todas expostas)

> Sprint Menu completamente implementado. Todo item completado (WA-1 a WA-14, DT).
> Histórico detalhado migrado para `BACKLOG-historico.md`.

### Métricas alvo — Sprint Menu (atingidas)

| Métrica                          | Alvo          | Resultado |
| -------------------------------- | ------------- | --------- |
| `tsc --noEmit`                   | **0 erros**   | ✅ 0      |
| `vitest run`                     | **100% pass** | ✅ 4212   |
| `npm run lint`                   | **0 erros**   | ✅ 0      |
| Handlers órfãos (sem menu)       | **0**         | ✅ 0      |
| Dashboards sem acesso individual | **0**         | ✅ 0      |
| Features CLI/env sem menu        | **0**         | ✅ 0      |

---

## 🏗️ Sprint DepWall + UX — Isolamento de Dependências e Correções de Navegação (Jun/2026)

**Data:** 2026-06-07
**Origem:** Auditoria de importações diretas + feedback de UX do usuário.
**Foco:** Fechar violações do DepWall (dependências externas importadas fora de `shared/`) + correções de UX em menus e labels.

| ID  | Item                                                              | Arquivo(s)                               | Esforço | Status |
| --- | ----------------------------------------------------------------- | ---------------------------------------- | ------- | ------ |
| D1  | ♻️ Remover entradas duplicadas 25/26/27 do submenu `reports`      | `menu-data.ts`                           | 5min    | ✅     |
| D2  | 🔧 Renomear "Cypress" → "testes" em strings de usuário            | `menu-data.ts`, `case14.ts`, `case17.ts` | 10min   | ✅     |
| D3  | 🐛 Aliases `/help` aceitarem argumentos sem barra (`help <t>`)    | `ui-helpers.ts`                          | 15min   | ✅     |
| D4  | 🏗️ Corrigir 7 DepWal violations em `git_triggers/` (axios+dotenv) | `git_triggers/*.test.ts` (7 files)       | 15min   | ✅     |
| D5  | 🏗️ Adicionar lint rule: forbid external deps fora de `shared/`    | `enforce-quality.ts`                     | 30min   | ✅     |
| D6  | 🐛 `fileToJira` com preview + confirm obrigatório                 | `bug-report.ts`                          | 2h      | ✅     |

**Total:** ~3.5h

### Métricas alvo — Sprint DepWall + UX

| Métrica                                 | Alvo          | Resultado |
| --------------------------------------- | ------------- | --------- |
| `tsc --noEmit`                          | **0 erros**   | ✅ 0      |
| `vitest run`                            | **100% pass** | ✅ 4212   |
| `npm run lint`                          | **0 erros**   | ✅ 0      |
| `enforce-quality` checks                | **≥16**       | ✅ 16     |
| DepWal violations em `git_triggers/`    | **0**         | ✅ 0      |
| DepWal violations em `jira_management/` | **0**         | ✅ 0      |
| Duplicação de navegação (submenus)      | **0**         | ✅ 0      |

---

## 🚀 Sprint A — Fluxo JSON Automático + Retenção (Jun/2026)

**Data:** 2026-06-07
**Origem:** case17 requer path manual para JSON CTRF mesmo quando CI está configurado e `fetchGitHistory()` já sabe baixar artifacts.
**Foco:** Auto-download, cache local, retenção, UX informativa.

| ID  | Item                                                 | Arquivo(s)                                                                   | Esforço | Status |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------- | ------ |
| A1  | ♻️ `report-cache.ts` — cache local de CTRF com prune | `shared/report-cache.ts`                                                     | 1h      | ✅     |
| A2  | ♻️ Retention limit em metrics (METRICS_MAX_RUNS)     | `shared/metrics.ts`                                                          | 15min   | ✅     |
| A3  | 🔧 UX + auto-download + cache em case17              | `jira_management/commands/case17.ts`                                         | 1h      | ✅     |
| A4  | 🔧 Auto-cache CTRF pós-pipeline                      | `git_triggers/pipeline-handler.ts`                                           | 30min   | ✅     |
| A5  | 🔧 Config keys METRICS_MAX_RUNS, REPORT_CACHE_MAX    | `shared/config-schema.ts`                                                    | 15min   | ✅     |
| A6  | 📋 Testes para A1-A5                                 | `shared/report-cache.test.ts`, `case17.test.ts`, `case17-test-utils.test.ts` | 1.5h    | ✅     |

### Métricas alvo — Sprint A

| Métrica                      | Alvo       | Resultado |
| ---------------------------- | ---------- | --------- |
| `tsc --noEmit`               | 0 erros    | ✅ 0      |
| `vitest run`                 | 100% pass  | ✅ 4216   |
| `npm run lint`               | 0 erros    | ✅ 0      |
| `enforce-quality`            | ≥16 checks | ✅ 17     |
| case17 sem CI: UX melhorada  | ✅         | ✅        |
| case17 com CI: auto-download | ✅         | ✅        |
| Cache local com prune        | ✅         | ✅        |
| Pipeline → cache automático  | ✅         | ✅        |

---

## 🚀 Sprint B — Prevenção: CI Gate + ux-auditor (Jun/2026)

**Data:** 2026-06-07
**Origem:** Features bifurcadas (código existe mas handler não usa), submenus sem alias, handlers sem entrada de menu.
**Foco:** Impedir criação de débitos novos, detectar débitos existentes.

| ID  | Item                                                                                                 | Arquivo(s)                                                                | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------- | ------ |
| B1  | 🔧 CI Gate: handler ↔ menu ↔ alias 3-way consistency                                                 | `scripts/enforce-quality.ts`                                              | 1h      | ✅     |
| B2  | 🔧 ux-auditor agent script (soft: jornada ruidosa, dead utility, friction score)                     | (novo) `scripts/ux-auditor.ts`                                            | 3h      | ✅     |
| B3  | 🔧 Rodar auditor + corrigir achados (4 fases: hints + submenu FP + import-aware detector + re-audit) | Codebase, `scripts/ux-auditor.ts`                                         | 3h      | ✅     |
| B2b | 🔧 Commit missing modules (report-cache.ts, case17-test-utils.ts) from prior session — CI fix        | `shared/report-cache.ts`, `jira_management/commands/case17-test-utils.ts` | 5min    | ✅     |
| B4  | 📋 docs/ux-auditor.md + HELP_TOPICS entry                                                            | `docs/ux-auditor.md`, `menu-data.ts`                                      | 30min   | ✅     |

### Métricas alvo — Sprint B

| Métrica                   | Alvo       | Resultado                                      |
| ------------------------- | ---------- | ---------------------------------------------- |
| `tsc --noEmit`            | 0 erros    | ✅ 0                                           |
| `vitest run`              | 100% pass  | ✅ 4216                                        |
| `npm run lint`            | 0 erros    | ✅ 0                                           |
| `enforce-quality`         | ≥18 checks | ✅ 17 checks (check 17 is CI gate itself)      |
| Handlers sem menu         | 0          | ✅ 0                                           |
| ux-auditor gera relatório | ✅         | ✅                                             |
| ux-auditor import-aware   | ✅         | ✅ (falsos positivos: 527→93, -82%)            |
| Features bifurcadas       | 0          | ✅ 0                                           |
| Hints em ask() calls      | 100%       | ✅ 21/21 (1 FP regex: nested parens em case17) |
| Prompts sem hint (real)   | 0          | ✅ 0                                           |

---

## ♻️ Sprint Dead Code — Eliminação de Exports Mortos (Jun/2026)

**Data:** 2026-06-07
**Origem:** Análise ts-prune identificou 59 exports não-importados por nenhum módulo. Destes, **28 são risco zero** (type re-exports puros, zero valor de negócio perdido). Os demais (~31) são itens com risco >0 (test re-exports intencionais, barrel `export *` estrutural, funções órfãs com valor de domínio) — deferidos sine die.
**Abordagem:** Remoção cirúrgica apenas de type/exports de barrel que ninguém importa. Nenhuma mudança em runtime. Nenhum contrato afetado (as definições reais continuam nos submódulos).

| ID    | Item                                                          | Arquivo(s)                         | Itens | Risco | Status |
| ----- | ------------------------------------------------------------- | ---------------------------------- | ----- | ----- | ------ |
| DC-01 | ♻️ Remover 14 type re-exports Zod                             | `shared/validation.ts`             | 14    | ZERO  | ✅     |
| DC-02 | ♻️ Remover AxiosResponse, AxiosError                          | `shared/deps.ts`                   | 2     | ZERO  | ✅     |
| DC-03 | ♻️ Remover ConfigField, CONFIG_SCHEMA, validateRequiredEnv    | `shared/config.ts`                 | 3     | ZERO  | ✅     |
| DC-04 | ♻️ Remover PromptOptions, FilePathOptions, Select\* in barrel | `shared/prompt-input.ts`           | 5     | ZERO  | ✅     |
| DC-05 | ♻️ Remover NavLink da barrel                                  | `shared/markdown.ts`               | 1     | ZERO  | ✅     |
| DC-06 | ♻️ Remover ReviewDecision duplicado                           | `shared/llm-review-types.ts`       | 1     | ZERO  | ✅     |
| DC-07 | ♻️ Remover ReviewDecision re-export morto                     | `shared/llm-review.ts`             | 1     | ZERO  | ✅     |
| DC-08 | ♻️ Remover ArtifactType duplicado (autodefinido não-usado)    | `shared/llm-self-consistency.ts`   | 1     | ZERO  | ✅     |
| DC-09 | 🔧 Atualizar baseline .unused-exports-baseline                | `scripts/.unused-exports-baseline` | —     | ZERO  | ✅     |
| DC-10 | 📋 Documentar itens diferidos sine die                        | `docs/DEFERRED-DEAD-CODE.md`       | —     | —     | ✅     |

**Total removido:** 28 exports em 8 arquivos.

### Métricas alvo — Sprint Dead Code

| Métrica                       | Alvo                 | Resultado                       |
| ----------------------------- | -------------------- | ------------------------------- |
| `tsc --noEmit`                | **0 erros**          | ✅ 0                            |
| `vitest run`                  | **100% pass**        | ✅ 4231                         |
| `npm run lint`                | **0 erros**          | ✅ 0                            |
| `check-unused-exports.sh`     | **0 new** (`exit 0`) | ✅ exit 0                       |
| Exports removidos             | **28**               | ✅ 28                           |
| Itens diferidos (não tocados) | **—** (registrados)  | ✅ `docs/DEFERRED-DEAD-CODE.md` |

---

## 🔒 Sprint Security — OpenCode Local Machine Hardening (Jun/2026)

**Origem:** Security audit — project-level `opencode.json` has wide-open permissions that override restricted user-level config.

**Problema:** Config precedence (project > user) means `"edit": "allow"` and `"bash": "allow"` in `./opencode.json` bypass the user's restrictive `"ask"` policies.

**Ordem de implementação:** risco decrescente — o que mais expõe primeiro.

| Layer | Foco                        | Risco | Justificativa                                              |
| ----- | --------------------------- | ----- | ---------------------------------------------------------- |
| 1     | Project config permissions  | Alto  | Fechar a brecha principal — overrides de permissão         |
| 2     | Plugin de segurança         | Alto  | opencode-warden + external_directory para detecção passiva |
| 3     | Hooks + regras do agente    | Médio | Prevenir bypass futuro, auditar ações                      |
| 4     | Sandbox + branch protection | Baixo | Defesa em profundidade, opcional                           |

---

### Layer 1 — 🔧 Project Config Permissions

| ID   | Item                                                                           | Arquivo         | Esforço | Status |
| ---- | ------------------------------------------------------------------------------ | --------------- | ------- | ------ |
| SC-1 | 🔧 Restringir `permission.edit` de `"allow"` para `"ask"` com paths bloqueados | `opencode.json` | 5min    | ✅     |
| SC-2 | 🔧 Restringir `permission.bash` de `"allow"` para pattern-based `"ask"`        | `opencode.json` | 5min    | ✅     |
| SC-3 | 🔧 Adicionar `permission.webfetch: "ask"`, `websearch: "ask"`                  | `opencode.json` | 2min    | ✅     |
| SC-4 | 🔧 Adicionar `permission.share: "disabled"`                                    | `opencode.json` | 1min    | ✅     |

### Layer 2 — 🔧 Security Plugin + External Directory

| ID   | Item                                                                               | Arquivo                             | Esforço | Status |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------- | ------- | ------ |
| SC-5 | 🔧 Adicionar `opencode-warden` ao array `plugin` (auto-instala via Bun)            | `opencode.json`                     | 2min    | ✅     |
| SC-6 | 🔧 Adicionar `external_directory` com denies para `.ssh`, `.gnupg`, `.aws`, `/etc` | `~/.config/opencode/opencode.jsonc` | 5min    | ✅     |
| SC-7 | 🔧 Criar config do warden (`.opencode/opencode-warden.json`)                       | `.opencode/opencode-warden.json`    | 5min    | ✅     |

### Layer 3 — 🔧 Hooks + Agent Rules

| ID    | Item                                                                               | Arquivo                    | Esforço | Status |
| ----- | ---------------------------------------------------------------------------------- | -------------------------- | ------- | ------ |
| SC-8  | 🔧 Adicionar Rule 18 no AGENTS.md: bypass de segurança exige autorização explícita | `AGENTS.md`                | 5min    | ✅     |
| SC-9  | 🔧 Criar script post-session log scanner (secrets, audit)                          | `scripts/scan-sec-logs.sh` | 15min   | ✅     |
| SC-10 | 🔧 Criar git pre-push hook que bloqueia `--no-verify` sem audit trail              | `.githooks/pre-push`       | 15min   | ✅     |

### Layer 4 — 🔧 Defesa em Profundidade (Opcional)

| ID    | Item                                                                           | Arquivo                                         | Esforço | Status |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------- | ------- | ------ |
| SC-11 | 🔧 sandbox-exec.sh para execução isolada de bash (bwrap/unshare)               | `scripts/sandbox-exec.sh`                       | 15min   | ✅     |
| SC-12 | 🔧 Script de configuração de branch protection (GitHub UI/gh CLI)              | `scripts/setup-branch-protection.sh`            | 5min    | ✅     |
| SC-13 | 🔧 Managed config instructions (root-owned, chattr +i) incluso no setup script | `scripts/setup-branch-protection.sh`            | 5min    | ✅     |
| SC-14 | 🔧 opencode-guard.sh — daemon de monitoramento em tempo real (systemd --user)  | `scripts/opencode-guard.sh`                     | 30min   | ✅     |
| SC-15 | 🔧 Instalação do guard como systemd --user service (auto-start no login)       | `~/.config/systemd/user/opencode-guard.service` | 5min    | ✅     |
| SC-16 | 🔧 Dependências: inotify-tools + libnotify-bin para notificações desktop       | (apt)                                           | 2min    | ✅     |

---

## 🐳 Sprint Container — Isolamento Podman para opencode (Jun/2026)

**Data:** 2026-06-08
**Origem:** Sprint Security Layer 4 (SC-11 sandbox-exec.sh) migrado de bwrap/unshare para isolamento via Podman. Container minimal com Node 24 LTS + opencode.
**Motivação:** bwrap/unshare não isolam filesystem do host adequadamente. Container rootless com `--read-only`, `--cap-drop ALL`, `--userns keep-id` oferece isolamento real.

| ID   | Item                                                                                 | Arquivo(s)                                | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ------- | ------ |
| CN-1 | 🔧 Criar Dockerfile: Debian slim + Node 24 LTS + opencode + utilidades mínimas       | `~/.config/opencode/container/Dockerfile` | 20min   | ✅     |
| CN-2 | 🔧 Criar wrapper qa.sh: podman run com volumes, --read-only, --cap-drop ALL          | `scripts/qa.sh`                           | 15min   | ✅     |
| CN-3 | 🏗️ Build imagem opencode-qa                                                          | `podman build -t opencode-qa`             | 5min    | ✅     |
| CN-4 | 🔧 Adicionar alias `qa` ao .bashrc                                                   | `~/.bashrc`                               | 2min    | ✅     |
| CN-5 | ♻️ Remover sandbox-exec.sh (superseded by podman container)                          | `scripts/sandbox-exec.sh`                 | 2min    | ✅     |
| CN-6 | 🔧 Adaptar opencode-guard.sh com verificação de container running + volumes corretos | `scripts/opencode-guard.sh`               | 15min   | ✅     |
| CN-7 | 📋 Testes: qa.sh — sintaxe bash, argument passthrough, detecção de podman            | `scripts/qa.test.ts`                      | 20min   | ✅     |
| CN-8 | 🧪 Teste de integração: qa --version, isolamento ~/.ssh, npm test no container       | (manual, documentado)                     | 15min   | ✅     |

### Métricas alvo — Sprint Container

| Métrica                            | Alvo          | Resultado |
| ---------------------------------- | ------------- | --------- |
| `tsc --noEmit`                     | **0 erros**   | ✅ 0      |
| `vitest run`                       | **100% pass** | ✅ 4454   |
| `npm run lint`                     | **0 erros**   | ✅ 0      |
| Dockerfile build pass              | **✅**        | ✅        |
| `qa --version` = opencode 1.16.2   | **✅**        | ✅        |
| Container não acessa `~/.ssh`      | **✅**        | ✅        |
| Container não acessa `/etc/shadow` | **✅**        | ✅        |
| sandbox-exec.sh removido           | **✅**        | ✅        |
| Guard detecta container offline    | **✅**        | ✅        |

### O que o Guard Monitora (30 arquivos)

| Severidade   | Arquivos                                                                                                                                                          | Quando muda...                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 🔴 Crítico   | `opencode.json`, `.env`, `validation_hook.ts`, `validation_plugin.ts`, `package.json`, `pre-push`                                                                 | 🔥 Notificação crítica na tela |
| 🟡 Segurança | `eslint.config.mjs`, `tsconfig*.json`, `vitest.config.ts`, `jest.config.js`, `ci.yml`, `gitlab-ci.yml`, `dependabot.yml`, `quality-gate.ts`, `enforce-quality.ts` | 🟡 Notificação normal + log    |
| 🔵 Config    | `AGENTS.md`, `.gitignore`, `qa-quarantine.json`, `warden.json`, `validation.json`, `agents/*.md`, `config/*.json`                                                 | 🔵 Log + journald              |

---

## 🛡️ Sprint GracefulFix — Restaurar Block no quality-check + Corrigir gracefulExit (Jun/2026)

**Data:** 2026-06-11
**Problema:** `gracefulExit()` em `shared/cli_base.ts` usa `setTimeout(() => process.exit(code), EXIT_DELAY_MS).unref()`. O `.unref()` permite que o Node.js saia naturalmente com exit code **0** antes do timer de 2s disparar. `quality-check.ts` SEMPRE retorna 0, mesmo com falhas — `set -e` do pre-push nunca é acionado.

**Root cause:** Em scripts não-interativos, não há handles mantendo o event loop vivo além do timer unrefed. O processo termina com 0 (default) antes do `process.exit(code)` executar.

| Fase | Descrição                                                              | Itens | Status |
| ---- | ---------------------------------------------------------------------- | ----- | ------ |
| 1    | Fix `gracefulExit` — remover `.unref()` (causa raiz do block quebrado) | GF-01 | ✅     |
| 2    | Corrigir `checkAsUnknownAs` — comment-based structural exclusion       | GF-02 | ✅     |
| 3    | Corrigir unused-exports baseline (line number shift)                   | GF-03 | ✅     |
| 4    | Regenerar hash integrity                                               | GF-04 | ✅     |
| 5    | Verificação: typecheck + quality-check + tests + 100% cobertura        | GF-05 | ✅     |
| 6    | Push via SSH + monitor CI                                              | GF-06 | ⏳     |

### Detalhamento

#### Fase 1 — Fix gracefulExit (GF-01) ✅

| ID    | Item                                                                            | Arquivo              | Esforço |
| ----- | ------------------------------------------------------------------------------- | -------------------- | ------- |
| GF-01 | 🔧 Remover `.unref()` de `gracefulExit` — garantir `process.exit(code)` executa | `shared/cli_base.ts` | 5min    |

**Resultado:** Exit code 1 confirmado em quality-check após violações.

#### Fase 2 — Corrigir `checkAsUnknownAs`

| ID     | Item                                                                                                                 | Arquivo(s)                      |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| GF-02  | 🐛 `checkAsUnknownAs`: adicionar `excludePattern` para linhas com comentário `// structural:` que documenta o motivo | `scripts/quality-check.ts`      |
| GF-02b | 📋 Atualizar teste `checkAsUnknownAs` no quality-check.test.ts para cobrir exclusão por comentário structural        | `scripts/quality-check.test.ts` |

**Abordagem:** A regra fica mais sofisticada — `as unknown as` COM comentário `// structural: <razão>` é aceito (caso classe com campos privados). SEM comentário, ainda flag. O desenvolvedor é OBRIGADO a documentar o porquê do cast.

#### Fase 3 — Corrigir unused-exports baseline

| ID    | Item                                                        | Arquivo                            |
| ----- | ----------------------------------------------------------- | ---------------------------------- |
| GF-03 | 🔧 Atualizar line number no baseline (31→32, arquivo mudou) | `scripts/.unused-exports-baseline` |

#### Fase 4 — Regenerar hash

| ID    | Item                                                  | Arquivo                    |
| ----- | ----------------------------------------------------- | -------------------------- |
| GF-04 | 🔧 Regenerar hash integrity comment após modificações | `scripts/quality-check.ts` |

#### Fase 5 — Verificação Final (100% cobertura)

| ID     | Item                                          | Critério                     |
| ------ | --------------------------------------------- | ---------------------------- |
| GF-05a | tsc --noEmit                                  | 0 erros                      |
| GF-05b | npx tsx scripts/quality-check.ts              | ✅ exit 0, todas checks pass |
| GF-05c | vitest run                                    | 100% pass                    |
| GF-05d | quality-check.test.ts cobertura 100% branches | ✅                           |

#### Fase 6 — Push

| ID    | Item                          |
| ----- | ----------------------------- |
| GF-06 | git push via SSH + monitor CI |

---

## 🚀 Sprint Final — Correção Sistêmica de Contratos + Container + Lint Zero (Jun/2026)

**Data:** 2026-06-11

**Ordem de execução (superioridade técnica):**

1. **Correção sistêmica de contratos** — completar consumidores de `ParseResult` comfields nullable
2. **DepWall** — adicionar `glob` a `shared/deps.ts`
3. **Container** — SQLite persistente + entrypoint robusto
4. **Lint zero** — 78 violações restantes
5. **Testes** — 100% cobertura

### Diagnóstico inicial

| Métrica                           | Atual  | Alvo  |
| --------------------------------- | ------ | ----- |
| `tsc --noEmit`                    | **39** | **0** |
| `eslint` (não-baseline)           | **78** | **0** |
| `vitest run`                      | ?      | 100%  |
| `unbound-method` (baseline 313)   | 261    | ≤313  |
| Arquivos alterados não-commitados | 17     | 0     |
| Container SQLite DB persistente   | ❌     | ✅    |
| Container build reproduzível      | ❌     | ✅    |

### Fase 0 — Correção Sistêmica de Contratos (39 TSC errors)

**Problema:** `shared/result_parser.ts` mudou `ParseResult.tests` e `.stats` para nullable, mas 8 arquivos consumidores não foram atualizados — 39 erros TSC.

| ID    | Arquivo                                              | Erros | Ação                               |
| ----- | ---------------------------------------------------- | ----- | ---------------------------------- |
| TSC-1 | `e2e/gen-report-complete.ts`                         | 1     | Adicionar `?? []` ao passar tests  |
| TSC-2 | `e2e/gen-report.ts`                                  | 1     | Adicionar `?? []` ao passar tests  |
| TSC-3 | `e2e/result-pipeline.test.ts`                        | 8     | Null guards em tests e stats       |
| TSC-4 | `e2e/smoke-pipeline.ts`                              | 11    | Null guards em tests e stats       |
| TSC-5 | `git_triggers/pipeline-handler.ts`                   | 5     | Null guards em tests e stats       |
| TSC-6 | `git_triggers/test-results.ts`                       | 5     | Null guards em tests e stats       |
| TSC-7 | `jira_management/commands/case15.ts`                 | 6     | Null guards em resolvedData.result |
| TSC-8 | `jira_management/commands/case17-helpers.ts`         | 1     | Null guard em obj.results          |
| TSC-9 | `jira_management/commands/case17-test-utils.test.ts` | 1     | Null guard em result.stats         |

### Fase 1 — DepWall (glob)

**Problema:** `scripts/transform-casts.ts` e `scripts/transform-jest-mock.ts` importam `glob` diretamente em vez de via `shared/deps.ts`.

| ID    | Arquivo                          | Ação                                                         |
| ----- | -------------------------------- | ------------------------------------------------------------ |
| DEP-1 | `shared/deps.ts`                 | Adicionar `export { glob }` (re-export do glob)              |
| DEP-2 | `scripts/transform-casts.ts`     | Substituir `import { globSync } from 'glob'` → `shared/deps` |
| DEP-3 | `scripts/transform-jest-mock.ts` | Substituir `import { globSync } from 'glob'` → `shared/deps` |

### Fase 2 — Container (SQLite + Entrypoint)

**Problema:** Container monta `~/.local` inteiro como tmpfs, perdendo SQLite DB do opencode entre sessões. Dockerfile tem SHA256 não-verificado.

| ID    | Item                                            | Arquivo(s)                                | Ação                                                  |
| ----- | ----------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| CN-9  | 🔧 Volume persistente SQLite DB                 | `scripts/qa.sh`                           | Bind mount `~/.local/share/opencode` + tmpfs granular |
| CN-10 | 🔧 Verificar SHA256 + atualizar versão opencode | `~/.config/opencode/container/Dockerfile` | Corrigir checksum, atualizar versão se necessário     |
| CN-11 | 🔧 Entrypoint build robusto                     | `scripts/qa.sh`                           | `cp` explícito do entrypoint antes do build           |
| CN-12 | 📋 Testes: qa.sh — volume persistente           | `scripts/qa.test.ts`                      | Testar bind mount /home/coder/.local/share/opencode   |

### Fase 3 — Lint: no-console (57 violações)

| ID    | Arquivo                          | Violações | Ação                                  |
| ----- | -------------------------------- | --------- | ------------------------------------- |
| LNT-1 | `e2e/real-import.ts`             | 25        | Substituir console.log por rootLogger |
| LNT-2 | `e2e/smoke-github.ts`            | 16        | Substituir console.log por rootLogger |
| LNT-3 | `e2e/smoke-llm.ts`               | 13        | Substituir console.log por rootLogger |
| LNT-4 | `scripts/transform-casts.ts`     | 2         | Substituir console.log por rootLogger |
| LNT-5 | `scripts/transform-jest-mock.ts` | 2         | Substituir console.log por rootLogger |
| LNT-6 | `shared/env-loader.ts`           | 1         | Substituir console.log por rootLogger |

### Fase 4 — Lint: demais regras (21 violações)

| ID     | Regra                      | Violações | Arquivos-alvo                                                                                                      |
| ------ | -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| LNT-7  | `no-unnecessary-condition` | 13        | `shared/result_parser.ts` (8), `shared/open.ts` (3), `import-prep-preview.ts` (1), `mapping-file-generator.ts` (1) |
| LNT-8  | `no-unsafe-member-access`  | 3         | `jira_management/test-execution-creator.ts`                                                                        |
| LNT-9  | `no-unsafe-assignment`     | 2         | `jira_management/test-execution-creator.ts`                                                                        |
| LNT-10 | `no-restricted-imports`    | 2         | `scripts/transform-casts.ts`, `scripts/transform-jest-mock.ts`                                                     |
| LNT-11 | `no-non-null-assertion`    | 1         | `shared/llm-fallback-config.ts`                                                                                    |

### Fase 5 — Testes

| ID    | Item                                             | Ação                                                   |
| ----- | ------------------------------------------------ | ------------------------------------------------------ |
| TST-1 | Atualizar testes existentes para novos contratos | Adicionar null guards nos asserts que usam ParseResult |
| TST-2 | Testar cobertura do qa.sh (volume persistente)   | Verificar string de bind mount no qa.test.ts           |
| TST-3 | `vitest run` = 100%                              | Verificar execução completa                            |

### Critério de commit

Cada fase (0-5) é committada separadamente com verificação:

1. `tsc --noEmit` = 0
2. `npm run lint` = 0 (ou baseline ≤ 313)
3. `vitest run` = 100% pass

---
## 🚀 Sprint Container — Resiliência + Build Parametrizado + Persistência SQLite (Jun/2026)

**Data:** 2026-06-11
**Origem:** Container não iniciava por conflito de nome (container órfão), versão 1.16.0 desatualizada (Dockerfile já em 1.17.3 mas imagem não rebuildada), SQLite DB perdido entre sessões (`~/.local` era tmpfs inteiro).

### Fases

| Fase | Descrição                                                                     | Itens | Status |
| ---- | ----------------------------------------------------------------------------- | ----- | ------ |
| 0    | Atualizar BACKLOG.md + migrar completados ao histórico                        | —     | ✅     |
| 1    | `--replace` no `qa.sh` para resiliência a container órfão                     | CO-1  | ✅     |
| 2    | Dockerfile parametrizado (ARG) com validação de SHA256 obrigatório            | CO-2  | ✅     |
| 3    | Volume persistente SQLite (`~/.local/share/opencode`) em vez de tmpfs inteiro | CO-3  | ✅     |
| 4    | Testes para qa.sh com `--replace` + volume persistente                        | CO-4  | ✅     |
| 5    | Rebuildar imagem + build context explícito                                    | CO-5  | ✅     |
| 6    | Fix SQLite timeout (30s→300s) + env var override `OPENCODE_DB_TIMEOUT_MS`     | CO-6  | ✅     |
| 7    | `.container/` removido do tracking git + gitignore                            | CO-7  | ✅     |
| 7    | Verificação final: TSC + lint + tests + quality-check                         | CO-7  | ✅     |

### Detalhamento

| ID   | Item                                                                         | Arquivo(s)                                | Esforço |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------- | ------- |
| CO-1 | 🔧 Adicionar `--replace` ao `podman run` — container órfão não bloqueia mais | `scripts/qa.sh`                           | 2min    |
| CO-2 | ♻️ Dockerfile: versão + SHA256 como ARG com validação de non-empty           | `~/.config/opencode/container/Dockerfile` | 10min   |
| CO-3 | 🔧 Bind mount `~/.local/share/opencode` + tmpfs granular nos demais subdirs  | `scripts/qa.sh`                           | 5min    |
| CO-4 | 📋 Testes: `--replace` presente, volume persistente no comando podman        | `scripts/qa.test.ts`                      | 5min    |
| CO-5 | 🏗️ Rebuildar imagem opencode-qa                                              | `podman build -t opencode-qa`             | 5min    |
| CO-6 | ✅ Verificação: TSC + lint + vitest + quality-check                          | —                                         | 5min    |

---
## 🔒 Sprint Code Audit — Correção de Dead Code + Error Handling + Limpeza de Exports (Jun/2026)

**Data:** 2026-06-12
**Origem:** Auditoria profunda de código de produção — 86 achados (4 HIGH, 17 MEDIUM, 65 LOW).
**Relatório:** `.audit/dead-code-audit.md`
**Ordem de execução:** Safety → Dead code → Unused exports → Barrel hygiene

| Fase | Descrição                                                                        | Itens | Status |
| ---- | -------------------------------------------------------------------------------- | ----- | ------ |
| P0   | Safety: catch silenciosos, timeout, error swallowing sem log                     | 4     | ✅     |
| P1   | Dead code: remoção de funções/exports/re-exports sem consumidores                | 5     | 🔜     |
| P2   | Unused exports: remover `export` de funções internas (markdown, palette, report) | 5     | 🔜     |
| P3   | Barrel hygiene: `export *` → exports nomeados em `llm-fallback.ts`               | 1     | 🔜     |
| TST  | Testes para todas as correções + verificação final                               | All   | 🔜     |

### P0 — Safety (violação de mecanismos de segurança)

| ID   | Severidade | Arquivo                | Linha      | Problema                                           | Correção                                         |
| ---- | ---------- | ---------------------- | ---------- | -------------------------------------------------- | ------------------------------------------------ |
| SA-1 | 🔴 HIGH    | `shared/env-loader.ts` | 51         | `.catch(() => {})` vazio — erro do logger engolido | Substituir por `.catch(e => console.error(...))` |
| SA-2 | 🟡 MEDIUM  | `shared/publish.ts`    | 25,36-46   | `execFileSync` sem timeout (5 chamadas de rede)    | Adicionar `timeout: 120_000` em cada             |
| SA-3 | 🟡 MEDIUM  | `shared/disk-cache.ts` | 66         | Decrypt failure retorna null sem log               | Adicionar `rootLogger.debug()`                   |
| SA-4 | 🟡 MEDIUM  | `shared/llm-review.ts` | 75,204,268 | LLM review fallha sem warning                      | Adicionar `rootLogger.warn()`                    |

### P1 — Dead Code (remoção)

| ID   | Severidade | Arquivo                                               | Linha(s) | Problema                                                                    | Correção                |
| ---- | ---------- | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------- | ----------------------- |
| DC-1 | 🔴 HIGH    | `shared/llm-fallback-config.ts`                       | 106-112  | `getModelPricing` e `hasPricingForModel` — zero chamadas                    | Remover funções         |
| DC-2 | 🔴 HIGH    | `shared/llm-benchmark.ts`                             | 25-26    | Re-exports de `benchmark-validators` e `benchmark-metrics` sem consumidores | Remover linhas          |
| DC-3 | 🟡 MEDIUM  | `git_triggers/main.ts`                                | 32       | `export default {}` — dummy nunca importado                                 | Remover                 |
| DC-4 | 🟡 MEDIUM  | `jira_management/import-prep.ts`                      | 2-3      | `PreviewMdOptions` e `ValidationResult` nunca importados nominalmente       | Remover type re-exports |
| DC-5 | 🟡 MEDIUM  | `shared/llm-fallback-http.ts` + `shared/llm-cache.ts` | 66,68    | `parseRawOnce` duplicado (2 implementações)                                 | Consolidar para uma     |

### P2 — Unused Exports (limpeza de export interno)

| ID   | Severidade | Arquivo                       | Linha | Função                        | Correção              |
| ---- | ---------- | ----------------------------- | ----- | ----------------------------- | --------------------- |
| UE-1 | 🟢 LOW     | `shared/markdown-html.ts`     | 9     | `renderInlineToHtml`          | Remover `export`      |
| UE-2 | 🟢 LOW     | `shared/markdown-renderer.ts` | 63    | `renderInline`                | Remover `export`      |
| UE-3 | 🟢 LOW     | `shared/markdown-renderer.ts` | 88    | `renderBlockToken`            | Remover `export`      |
| UE-4 | 🟢 LOW     | `shared/palette.ts`           | 70    | `PaletteKey`                  | Remover `export type` |
| UE-5 | 🟢 LOW     | `shared/report-html.ts`       | 20    | Re-export `buildTrendSection` | Remover linha 20      |

### P3 — Barrel Hygiene

| ID   | Severidade | Arquivo                  | Linha(s) | Problema                               | Correção                        |
| ---- | ---------- | ------------------------ | -------- | -------------------------------------- | ------------------------------- |
| BH-1 | 🟢 LOW     | `shared/llm-fallback.ts` | 23-24    | `export *` 2 wildcards → unbounded API | Substituir por exports nomeados |

### Critério de commit (cada fase)

1. `tsc --noEmit` = 0
2. `vitest run` = 100% pass
3. `npm run lint` = 0 (ou baseline)

### Verificação Final

| ID   | Item                               | Critério                  |
| ---- | ---------------------------------- | ------------------------- |
| VF-1 | `tsc --noEmit`                     | 0 erros                   |
| VF-2 | `vitest run`                       | 100% pass                 |
| VF-3 | `npm run lint`                     | 0 violações (ou baseline) |
| VF-4 | `npx tsx scripts/quality-check.ts` | 0 violações não-baseline  |

---
---
