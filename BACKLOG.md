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

| ID | Item | Fase | Status |
|----|------|------|--------|
| UX-1 | Theme System & Style Guide (`theme.ts`, `STYLE_GUIDE.md`) | I | ✅ Done |
| UX-2 | Baseline Snapshots (TUI + HTML report) | I | ✅ Done |
| UX-3 | TUI: Refactor `box.ts` to consume theme | II | ✅ Done |
| UX-4 | TUI: Action Search no menu Jira | II | ✅ Done |
| UX-5 | Reports: Consume theme, add Failed Summary + toggle | III | ✅ Done |
| UX-6 | TUI: Atalho `[D]etails` para erros não mapeados | IV | ✅ Done (já implementado) |

**Summary:** All UI/UX refinement tasks completed. Lote 8: 6/6 ✅

---

## 🤖 LLM Integration Refinement (Lote 9)

**Premissa:** Tiers gratuitos (Groq free 30 req/min, Gemini free 60 req/min, OpenRouter free).
**Critérios:** Pareto — segurança > prompts > validação > performance > testes > UX.

### Lote 9.1 — Segurança e Higiene (P0)

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-1 | `shared/sanitize.ts` — sanitização de secrets/PII antes de enviar a LLMs externos | P0 | ⬜ Pending |
| LLM-2 | Aplicar sanitização em `failure-analysis.ts`, `classifyFailure`, `ai-pr-desc.ts`, `ai-test-impact.ts` | P0 | ⬜ Pending |
| LLM-3 | Prompt injection protection (delimiters em `case18.ts`, error messages) | P2 | ⬜ Pending |
| LLM-4 | Gemini API key: URL param → `X-Goog-Api-Key` header | P3 | ⬜ Pending |
| LLM-5 | Sanitizar error body antes de logar em `llm-client.ts` | P4 | ⬜ Pending |

### Lote 9.2 — Prompt Engineering (foco principal)

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-6 | `failure-analysis.md`: remover "plain text", adicionar JSON schema explícito | P1 | ⬜ Pending |
| LLM-7 | `user-story-to-tests.md`: adicionar JSON schema | P2 | ⬜ Pending |
| LLM-8 | `case18.ts`: usar template como system prompt, user story como user message | P2 | ⬜ Pending |
| LLM-9 | Injetar schema do report programaticamente no prompt | P2 | ⬜ Pending |

### Lote 9.3 — Infra Free-tier

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-10 | Default `LLM_FAST_MODEL`: `llama3-8b-8192` → `llama-3.1-8b-instant` (128K context) | P1 | ⬜ Pending |
| LLM-11 | Sliding window rate limiter (30 req/min Groq) + jitter + parse `Retry-After` | P1 | ⬜ Pending |
| LLM-12 | Circuit breaker: 5 consec 429 → break 30s | P2 | ⬜ Pending |

### Lote 9.4 — Resiliência

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-13 | Fallback chain multi-tier (fast→main, report→main, etc) | P0 | ⬜ Pending |
| LLM-14 | Caller identity no cache key | P1 | ⬜ Pending |

### Lote 9.5 — Validação

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-15 | Validar resposta de `classifyFailure()`: regex + 1 retry | P0 | ⬜ Pending |
| LLM-16 | Validar resposta de `case18()`: JSON.parse + 1 retry | P0 | ⬜ Pending |
| LLM-17 | Confidence mapping: prefix match → regex `\b` | P3 | ⬜ Pending |

### Lote 9.6 — Testes

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-18 | Integration tests env-gated (INTEGRATION=true) | P2 | ⬜ Pending |
| LLM-19 | Token usage tracking (sem cost tracking) | P4 | ⬜ Pending |
| LLM-20 | Remover dead code `small` tier (com warning) | P4 | ⬜ Pending |

### Lote 9.7 — UX

| # | Item | Prio | Status |
|---|------|------|--------|
| LLM-21 | Spinner para `reviewWithLlm` | P2 | ⬜ Pending |
| LLM-22 | Comentário "diverse reviewer" no `llm-review.ts` | P2 | ⬜ Pending |

**Progresso:** 0/22 ✅
