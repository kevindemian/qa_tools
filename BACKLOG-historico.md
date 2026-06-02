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

### Sprint 3 — Fase 2: `jest.mocked()` Migration ✅

Transform script applied 144 changes across 36 files. All `(expr as jest.Mock)`, `(expr as jest.Mocked<T>)`, and `(expr as jest.MockedFunction<typeof fn>)` patterns replaced with `jest.mocked(expr)`. 2 syntax errors manually fixed (cli_base, import-loop). Real type mismatches exposed by removing casts fixed in 12 files (complete mock objects, fix signatures, add optional chaining).

| ID  | Item                                   | Count before | Status |
| --- | -------------------------------------- | ------------ | ------ |
| M1  | `git_triggers/main.test.ts`            | ~50          | ✅     |
| M2  | `jira_management/main.test.ts`         | ~30          | ✅     |
| M3  | `setup/main.test.ts`                   | ~25          | ✅     |
| M4  | Demais ~37 arquivos com `as jest.Mock` | ~400         | ✅     |
