# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

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

## 🔷 Pendentes — Próxima Sprint

### P2 — Documentar código (TSDoc exports + module headers)

| Fase | Layer                      | Arquivos                                               | Status |
| ---- | -------------------------- | ------------------------------------------------------ | ------ |
| 1    | shared/ core               | logger, config, state, http-client, prompt             | ✅     |
| 2    | shared/ util               | result_parser, markdown, report-generator, etc.        | ✅     |
| 3    | jira_management/ resources | jira_link_manager, result_reporter, etc.               | ✅     |
| 4    | jira_management/ commands  | case01-case20 + context + create_tests                 | ✅     |
| 5    | git_triggers/              | github_manager, gitlab_manager, pipeline-handler, main | ✅     |

### P1 — Elevar cobertura de arquivos críticos < 90%

| Item                                 | Status | Stmts faltando |
| ------------------------------------ | ------ | -------------- |
| `git_triggers/main.ts`               | 🚧     | 101            |
| `jira_management/commands/case17.ts` | 🚧     | 184            |
| `jira_management/main.ts`            | 🚧     | 81             |
| `git_triggers/pipeline-handler.ts`   | 🚧     | 62             |
| `shared/prompt-input.ts`             | 🚧     | 25             |
| `shared/open.ts`                     | 🚧     | 20             |
| `shared/markdown.ts`                 | 🚧     | 23             |
| `shared/llm-client.ts`               | 🚧     | 21             |
| `shared/splash.ts`                   | 🚧     | 15             |
| `shared/report-generator.ts`         | 🚧     | 14             |
| `git_triggers/batch-mode.ts`         | 🚧     | 10             |

### P0 — User docs desatualizadas (gap docs vs código)

| Item                                                  | Status | Esforço |
| ----------------------------------------------------- | ------ | ------- |
| Batch 1: README + 5 docs (incorretos/críticos)        | ✅     | 2h      |
| Batch 2: Aliases, comandos especiais, UX features     | ✅     | 1h      |
| Batch 3: Documentar `setup/` wizard (doc #10) + fluxo | ✅     | 2h      |

### P2 — Fechar 16 arquivos com 1 stmt descoberto

| Item                                          | Stmt descoberto                      |
| --------------------------------------------- | ------------------------------------ |
| `shared/logger.ts:144`                        | Dead code (unreachable)              |
| `shared/spinner.ts:20`                        | ESM `import('ora')` (uncov. em Jest) |
| `git_triggers/github_manager.ts:113`          | `_toInputs` non-array edge           |
| `git_triggers/mr-handler.ts:40`               | IA não retornou análise edge         |
| `jira_management/commands/case09.ts:15`       | `updateState` callback               |
| `jira_management/commands/case14.ts:14`       | `updateState` callback               |
| `jira_management/commands/case16.ts:14`       | `updateState` callback               |
| `jira_management/import-orchestrator.ts:60`   | `validateImportBatch` undefined      |
| `jira_management/jira-resource-version.ts:76` | total > MAX_TOTAL warn               |
| `jira_management/xray-client.ts:43`           | Empty token response                 |
| `shared/state.ts:61-62,75,111,160-165`        | Múltiplos edges (session-state)      |
| `shared/config.ts`                            | 2 stmts remanescentes                |

### P0 — AI-assisted bug report from description ✅

| Item                                                           | Status |
| -------------------------------------------------------------- | ------ |
| `shared/prompts/bug-report-from-description.md` + schema `.ts` | ✅     |
| `shared/bug-report.ts` — `generateBugReportFromDescription()`  | ✅     |
| `jira_management/commands/case20.ts` — AI path bifurcation     | ✅     |
| `shared/prompts/user-story-to-tests.md` — fix example PT→EN    | ✅     |
| Tests: `bug-report.schema.test.ts` + `bug-report.test.ts`      | ✅     |

### P1 — JSDoc/TSDoc documentation gaps (audit 2026-05-28)

| Item                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| Batch 1: `bug-report.ts` (null rationale) + 4 small files zero doc  | ✅     |
| Batch 2: `llm-metrics.ts` + `entry-menu.ts`                         | ✅     |
| Batch 3: `markdown.ts` (module doc) + `create_tests.ts` (SRP break) | 🚧     |
| Batch 4: handler JSDoc (`pipeline-handler`, `mr-handler`, caseXX)   | 🚧     |

### P2 — Handler test files ausentes (16 handlers + theme.ts)

| Item                                                     | Status |
| -------------------------------------------------------- | ------ |
| `shared/theme.ts` — sem `.test.ts` para `getTheme()`     | 🚧     |
| `jira_management/commands/case01-16.ts` — sem `.test.ts` | 🚧     |

### P2 — `collectManual` > 50 linhas (R4)

| Item                                                  | Status |
| ----------------------------------------------------- | ------ |
| `shared/bug-report.ts:101-155` — refatorar em helpers | 🚧     |

### P3 — Xray per-test history

| Item                                          | Status                 |
| --------------------------------------------- | ---------------------- |
| Aguardar `tags: ["TEST-123"]` no emissor CTRF | 🚧 Bloqueado (externo) |

### P1 — Restaurar thresholds de cobertura (80% branches, 90% lines) ✅

| Item                                                                       | Status |
| -------------------------------------------------------------------------- | ------ |
| config.ts + disk-cache.ts (+6 testes)                                      | ✅     |
| llm-client.ts + prompt-input.ts (+12 testes)                               | ✅     |
| sanitize.ts, box.ts, temp-dir.ts (+4 testes)                               | ✅     |
| result_reporter.ts, package_version_manager.ts (+2 testes)                 | ✅     |
| failure-analysis.ts, state.ts (+2 testes)                                  | ✅     |
| Thresholds restaurados: statements 90, branches 80, functions 91, lines 90 | ✅     |

## ✅ Histórico

Itens concluídos em sessões anteriores: [`BACKLOG-historico.md`](BACKLOG-historico.md).
