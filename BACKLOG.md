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
| UX-2 | Baseline Snapshots (TUI + HTML report) | I | 🔄 In Progress |
| UX-3 | TUI: Refactor `box.ts` + `prompt-ui.ts` to consume theme | II | ⬜ Pending |
| UX-4 | TUI: Action Search no menu Jira | II | ⬜ Pending |
| UX-5 | Reports: Consume theme, add Failed Summary + toggle | III | ⬜ Pending |
| UX-6 | TUI: Atalho `[D]etails` para erros não mapeados | IV | ⬜ Pending |
