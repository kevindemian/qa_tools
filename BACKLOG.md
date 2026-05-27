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

## 🔷 WEB_STYLE.md (ADIADA)

**Prioridade:** P3

**Problema:** `WEB_STYLE.md` descreve uma interface web, nunca implementada.

**Solução proposta:** Se houver demanda, implementar como SPA standalone.

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
| CLD-4 | Testes: happy path + auth error + GraphQL error                                   | P1   | ⬜     |
| CLD-5 | Teste de integração smoke com `XRAY_MODE=cloud`                                   | P2   | ⬜     |
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

| Fase | Descrição | Itens | Esforço |
|------|-----------|-------|---------|
| 1 | Fixes simples independentes (I5, I3, S5, S2, I4, S6, C3, I7) | 8 | ✅ |
| 2 | Circuit breaker, validateAll, Gemini system_instruction | 3 | ✅ |
| 3 | Métricas + token usage + responseFormat param | 3 | ✅ |
| 4 | Benchmark paralelo + E2E pipeline test | 2 | ✅ |

### Itens

| ID | Item | Prio | Arquivo(s) | Fase | Status |
|----|------|------|------------|------|--------|
| C3 | Prompt injection: {{FAILED_TESTS}} → user message | P0 | failure-analysis.ts, llm-benchmark.ts | 1 | ✅ |
| I5 | case18 usar tier `fast` em vez de `main` | P0 | case18.ts | 1 | ✅ |
| I3 | configUniqueKey incluir apiKey | P0 | llm-client.ts | 1 | ✅ |
| I4 | Alinhar parseVerdict/stripVerdict (mesmo regex) | P1 | llm-review.ts | 1 | ✅ |
| I7 | parseRetryAfter Date (RFC 7231) test | P1 | llm-client.test.ts | 1 | ✅ |
| S2 | callerId no cache hit/miss log | P1 | llm-client.ts | 1 | ✅ |
| S6 | Invalid response no retry prompt | P1 | llm-review.ts | 1 | ✅ |
| S5 | Sanitizar ciUrl no HTML report | P1 | report-generator.ts | 1 | ✅ |
| C4 | Circuit breaker per-provider (configUniqueKey) | P0 | llm-client.ts, llm-client.test.ts | 2 | ✅ |
| C1 | validateAll: schema validation em todos tests[i] | P1 | report-validator.ts, llm-review.ts | 2 | ✅ |
| C2 | Gemini system_instruction field (vs concat) | P2 | llm-client.ts | 2 | ✅ |
| I1 | Métricas: tokens + cache hit/miss + per-provider | P2 | llm-metrics.ts, llm-client.ts | 3 | ✅ |
| S4 | Expor token usage no parseResponse | P2 | llm-client.ts, llm-metrics.ts | 3 | ✅ |
| I6 | responseFormat param opcional em llmPrompt | P3 | llm-client.ts, callers | 3 | ✅ |
| S3 | Benchmark paralelo (Promise.allSettled) | P3 | llm-benchmark.ts | 4 | ✅ |
| S7 | E2E pipeline test (mock chain) | P3 | e2e/llm-pipeline.test.ts (novo) | 4 | ✅ |

---

## 🔬 Lote 18 — Re-audit Fixes (Pós-L17)

**Data:** 2026-05-27
**Prioridade:** P0
**Esforço total:** ~1.5h
**Base:** Re-audit llm-engineer: 7.2/10 (↑0.6)

### Execução

| Batch | Descrição | Itens | Esforço |
|-------|-----------|-------|---------|
| 1 | circuitSuccess + single parse + error check + run-comparison prompt | 3 | ✅ |
| 2 | validateAll tests + E2E mock + test prompts + benchmark cache | 4 | ✅ |

### Itens

| ID | Item | Prio | Arquivo(s) | Batch | Status |
|----|------|------|------------|-------|--------|
| R1 | recordCircuitSuccess incondicional (fallback circuit nunca resetado) | P0 | llm-client.ts | 1 | ✅ |
| R2 | API error em 200 OK + double JSON parse | P0 | llm-client.ts | 1 | ✅ |
| R3 | run-comparison.ts user data no system prompt | P1 | run-comparison.ts | 1 | ✅ |
| R4 | validateAll sem testes diretos | P2 | report-validator.test.ts | 2 | ✅ |
| R5 | E2E mock sem resetCircuitState/resetRateLimiter | P2 | e2e/llm-pipeline.test.ts | 2 | ✅ |
| R6 | Test prompts usam {{PLACEHOLDER}} obsoleto | P2 | failure-analysis.test.ts, case18.test.ts | 2 | ✅ |
| R7 | Benchmark re-read prompts do disco por fixture | P3 | llm-benchmark.ts | 2 | ✅ |

---

## 🚀 Lote 19 — Critical Fixes (8.0→9.0+)

**Data:** 2026-05-27
**Alvo:** >9.0/10
**Base:** Re-audit llm-engineer: 8.0/10

### Execução

| Batch | Descrição | Itens | Esforço |
|-------|-----------|-------|---------|
| 19 | Critical circuit breaker + cache key + warn + NaNms + retries + jitter | 6 | ✅ |
| 20 | Sanitize: 4 padrões + testes + truncateStacktrace | 6 | ✅ |
| 21 | Token debug log + metrics key hash + rate limit msg | 3 | ✅ |
| 22 | Schema validation: heuristic fix + 6 testes | 6 | ✅ |
| 23 | Test coverage: ~30 testes em 8 arquivos + 1 novo | 30 | ~4h |
| 24 | Benchmark: reuse ReportValidator + remove dead schema | 2 | ✅ |
| 25 | Re-audit final | 1 | ~30min |

### Itens

| ID | Item | Prio | Arquivo(s) | Batch | Status |
|----|------|------|------------|-------|--------|
| 19.1 | Circuit breaker conta todo erro (não só 429) | P1 | llm-client.ts | 19.1 | ✅ |
| 19.2 | Cache key inclui runtime responseFormat | P1 | llm-client.ts | 19.1 | ✅ |
| 19.3 | Warn log em non-JSON 200 OK | P2 | llm-client.ts | 19.2 | ✅ |
| 19.4 | formatFailedTests NaNms guard | P2 | failure-analysis.ts | 19.2 | ✅ |
| 19.5 | LLM_FETCH_RETRIES configurável via env | P3 | llm-client.ts | 19.2 | ✅ |
| 19.6 | Jitter 0-100% (era 50-100%) | P3 | llm-client.ts | 19.2 | ✅ |
| 20.1 | Padrão HuggingFace hf_ | P2 | sanitize.ts | 20 | ✅ |
| 20.2 | Padrão npm_ | P2 | sanitize.ts | 20 | ✅ |
| 20.3 | Padrão Slack xox[abp]- | P2 | sanitize.ts | 20 | ✅ |
| 20.4 | Padrão GitHub refresh ghr_ | P2 | sanitize.ts | 20 | ✅ |
| 20.5 | Testes dos 4 novos padrões | P2 | sanitize.test.ts | 20 | ✅ |
| 20.6 | truncateStacktrace integrado a sanitizeForLlm (maxStackLines param) | P3 | sanitize.ts | 20 | ✅ |
| 21.1 | Debug log tokens por request | P3 | llm-client.ts | 21 | ✅ |
| 21.2 | API key hash em metrics key (vs slice -8) | P3 | llm-client.ts | 21 | ✅ |
| 21.3 | Rate limit msg inclui "client-side" | P3 | llm-client.ts | 21 | ✅ |
| 22.1 | Heurística array rules usa regex em vez de includes | P2 | report-validator.ts | 22 | ✅ |
| 22.2 | Test: validateAll early return length<=1 | P2 | report-validator.test.ts | 22 | ✅ |
| 22.3 | Test: validateAll early return no array rules | P2 | report-validator.test.ts | 22 | ✅ |
| 22.4 | Test: checkConsistency high severity | P2 | report-validator.test.ts | 22 | ✅ |
| 22.5 | Test: resolveField 3+ levels | P3 | report-validator.test.ts | 22 | ✅ |
| 23.1 | llm-benchmark.test.ts (15+ testes, novo arquivo) | P2 | shared/llm-benchmark.test.ts | 23 | ⬜ |
| 23.2 | responseFormat='json' param test | P2 | llm-client.test.ts | 23 | ⬜ |
| 23.3 | responseFormat diferente → cache keys diferentes | P2 | llm-client.test.ts | 23 | ⬜ |
| 23.4 | Gemini system_instruction payload test | P2 | llm-client.test.ts | 23 | ⬜ |
| 23.5 | non-JSON 200 chama logger.warn | P2 | llm-client.test.ts | 23 | ⬜ |
| 23.6 | Tier fallback dedup test | P3 | llm-client.test.ts | 23 | ⬜ |
| 23.7 | runRetryLoop MAX_RETRIES exatas | P2 | llm-review.test.ts | 23 | ⬜ |
| 23.8 | buildRetryPrompt content verification | P2 | llm-review.test.ts | 23 | ⬜ |
| 23.9 | analyzeFailuresWithReport HTML exception path | P2 | failure-analysis.test.ts | 23 | ⬜ |
| 23.10 | HTML report output verificado | P2 | failure-analysis.test.ts | 23 | ⬜ |
| 23.11 | snapshotLlmMetrics round-trip persist | P2 | llm-metrics.test.ts | 23 | ⬜ |
| 23.12 | recordArtifactReview approved/rejected | P2 | llm-metrics.test.ts | 23 | ⬜ |
| 23.13 | case18 retry + success path | P2 | case18.test.ts | 23 | ✅ |
| 23.14 | case18 retry + still invalid → printError | P2 | case18.test.ts | 23 | ⬜ |
| 23.15 | compareRuns empty data | P2 | run-comparison.test.ts | 23 | ⬜ |
| 23.16 | compareRuns sanitization verified | P2 | run-comparison.test.ts | 23 | ⬜ |
| 23.17 | E2E validateAll 3-element array | P2 | llm-pipeline.test.ts | 23 | ✅ |
| 23.18 | E2E circuit breaker + fallback | P2 | llm-pipeline.test.ts | 23 | ✅ |
| 23.19 | truncateStacktrace test | P3 | sanitize.test.ts | 23 | ✅ |
| 24.1 | Reusar ReportValidator em benchmark | P3 | llm-benchmark.ts | 24 | ✅ |
| 24.2 | Remover dead schema field | P3 | fixtures/index.ts + JSONs | 24 | ✅ |
| 25.1 | Re-audit llm-engineer (score >9.0) | P0 | — | 25 | ⬜ |

---

### Lote 26 — Circuit Breaker Module + Half-Open State

**Data:** 2026-05-27
**Alvo:** Gap 1 da auditoria (7.9→9.2)
**Esforço:** 2h

| ID | Item | Prio | Status |
|----|------|------|--------|
| 26.1 | Extrair circuit breaker → `shared/circuit-breaker.ts` (check,record,state,consts) | P0 | ⬜ |
| 26.2 | Half-open state: após cooldown → HALF_OPEN (não CLOSED) | P0 | ⬜ |
| 26.3 | HALF_OPEN: 1 probe request a cada 15s | P0 | ⬜ |
| 26.4 | Sucesso na probe → CLOSED; falha → OPEN | P0 | ⬜ |
| 26.5 | Exportar CircuitState, resetCircuitState, getCircuitState, HALF_OPEN_PROBE_INTERVAL_MS | P1 | ⬜ |
| 26.6 | Adaptar llm-client.ts para importar do novo módulo | P1 | ⬜ |
| 26.7 | Atualizar llm-client.test.ts (imports) | P1 | ⬜ |
| 26.8 | Atualizar llm-pipeline.test.ts | P1 | ⬜ |

### Lote 27 — Output Sanitization

**Data:** 2026-05-27 | **Esforço:** 1h

| ID | Item | Prio | Status |
|----|------|------|--------|
| 27.1 | `sanitizeHtml(text): string` em sanitize.ts (escape HTML) | P1 | ⬜ |
| 27.2 | `sanitizeTerminal(text): string` (remove ANSI escapes perigosos) | P1 | ⬜ |
| 27.3 | Aplicar sanitizeTerminal em case18.ts:71 | P1 | ⬜ |
| 27.4 | Aplicar sanitizeTerminal em llm-review.ts | P1 | ⬜ |
| 27.5 | Aplicar sanitizeHtml no HTML report generator | P1 | ⬜ |
| 27.6 | Testes dos 3 pontos de sanitização | P2 | ⬜ |

### Lote 28 — Persistent Disk Cache (L2)

**Data:** 2026-05-27 | **Esforço:** 1.5h

| ID | Item | Prio | Status |
|----|------|------|--------|
| 28.1 | `diskCacheGet(key)` + `diskCacheSet(key, entry)` | P2 | ⬜ |
| 28.2 | Env `LLM_DISK_CACHE_DIR` (default: $QA_TOOLS_LOGS_DIR/llm-cache) | P2 | ⬜ |
| 28.3 | Lookup: L1(Map) → L2(disco) → LLM API | P2 | ⬜ |
| 28.4 | Write: L1 + L2 simultâneo | P2 | ⬜ |
| 28.5 | TTL: 1h disco, 5min memória | P2 | ⬜ |
| 28.6 | Load lazy no primeiro acesso | P2 | ⬜ |
| 28.7 | Testes com temp dir | P2 | ⬜ |

### Lote 29 — Typed LLM Errors + Schema Enforcement

**Data:** 2026-05-27 | **Esforço:** 1.5h

| ID | Item | Prio | Status |
|----|------|------|--------|
| 29.1 | `shared/errors.ts` com LlmError, LlmRateLimitError, LlmProviderError, LlmTimeoutError, LlmAuthError | P1 | ⬜ |
| 29.2 | Substituir throw new Error nos 7 sites de llm-client.ts | P1 | ⬜ |
| 29.3 | ReportValidator.validate() dentro de llmPrompt p/ responseFormat=json | P2 | ⬜ |
| 29.4 | 1 retry com hint de schema se validação falhar | P2 | ⬜ |
| 29.5 | Testes dos erros tipados | P2 | ⬜ |
| 29.6 | Testes da validação automática | P2 | ⬜ |

### Lote 30 — Minor Fixes

**Data:** 2026-05-27 | **Esforço:** 1h

| ID | Item | Prio | Status |
|----|------|------|--------|
| 30.1 | `candidates[i]!` → guard `if (!cfg) continue` | P2 | ⬜ |
| 30.2 | `Config.get()` typed + respeitar ConfigOverrides | P2 | ⬜ |
| 30.3 | `console.log` → `Output.print` no benchmark (8 sites) | P2 | ⬜ |
| 30.4 | `ensureDotenv` hack → carregar dotenv no startup | P2 | ⬜ |
| 30.5 | `parseRawOnce` typed return | P3 | ⬜ |
| 30.6 | Testes de regressão para cada fix | P2 | ⬜ |
