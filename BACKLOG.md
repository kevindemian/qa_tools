# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## 📄 Documentação de Produção

- `jira_xray_config_backup.md` — backup do ambiente Jira/Xray/CI/CD (configurações ORIGINAIS, pré-criptografia de tokens. IDs podem diferir da instância atual. **Não alterar** — registro histórico)
- `docs/PRODUCTION-CONFIG.md` — field mappings, endpoints, **bugs P1-P5 corrigidos em 2026-05-29**. Configurações validadas em produção. Atualizar se field IDs mudarem.
- **PRODUCTION FIELD IDs** (confirmados em `jiraprod.srv.euronext.com`, **não alterar sem revalidação**):
    - Pre-condition: `customfield_13708` (schema `com.xpandit.plugins.xray:test-precondition-custom-field`)
    - Test Execution tests: `customfield_13715` (schema `com.xpandit.plugins.xray:testexec-tests-custom-field`)
    - Link type `Tests`: `10600`
    - Issue type `Test Execution`: `11802`

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

### Postergado — justificativa

| Item                                                | Prioridade | Justificativa                                                                                                                                        |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite column robustez (múltiplos formatos de suite) | P3         | `fullTitle` já usa `>` nos dois parsers (CTRF + Mochawesome). Funciona para todos os formatos suportados hoje. Sem demanda concreta de usuário.      |
| Customização de conteúdo (colunas selecionáveis)    | P3         | Exigiria UI complexa + estado persistente. Sem caso de uso validado. `ReportOptions` já permite seletividade via `includeChart`, `testHistory`, etc. |
| Flakiness dashboard integrado no report HTML        | P3         | Funcionalidade independente (outro fluxo). Não relacionado ao report e2e.                                                                            |

---

## ✅ Pre-conditions + LLM Test Generation (refatorado: dual-threshold assimétrico) ✅

| #   | Item                                                                                                                                                 | Prioridade | Status | Arquivos                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------- |
| 1   | Tipos `PreConditionSummary` + `PreConditionMatchResult` (inalterados)                                                                                | P1         | ✅     | `shared/types.ts`                                  |
| 2   | `matchPreconditionByTokenOverlap()` (existente) + **novo** `matchPreconditionByDualThreshold()`: 0.5 admissão, 0.7 confirmação, assimétrico 0.5-0.69 | P1         | ✅     | `jira_management/jira_link_manager.ts`, `.test.ts` |
| 3   | `user-story-to-tests.md` — removido `{preconditions}`, LLM sempre usa `type:'create'` + summary                                                      | P1         | ✅     | `shared/prompts/user-story-to-tests.md`            |
| 4   | `case18.ts` — eliminada small LLM + injeção PCs. Adicionado `gatherInput()`, `createMissingPreconditions()`, `writeTestOutput()` + pós-processamento | P1         | ✅     | `jira_management/commands/case18.ts`               |
| 5   | Tests: 15 em `case18.test.ts` + 11 em `jira_link_manager.test.ts` (dual-threshold)                                                                   | P1         | ✅     | `*.test.ts`                                        |

---

## 🔷 Pendentes — Próxima Sprint

### P1 — Reports Gold Standard Upgrade (3 sprints)

Elevar reports ao nível Allure (padrão ouro mercado). 3 sprints independentes.

#### Sprint 1 — Trend + Hierarchy + Timeline ✅

| #   | Item                  | Descrição                                                                   | Esforço | Status | Arquivos                            |
| --- | --------------------- | --------------------------------------------------------------------------- | ------- | ------ | ----------------------------------- |
| R1  | **Trend Chart SVG**   | Gráfico de linha pass rate × tempo consumindo `getTrends()` do `metrics.ts` | 4h      | ✅     | `report-generator.ts`, `metrics.ts` |
| R2  | **Hierarchy sidebar** | Árvore Feature > Suite do `fullTitle` com click para filtrar tabela         | 6h      | ✅     | `report-generator.ts`               |
| R3  | **Timeline view**     | Barras horizontais: duração + status + ordem                                | 3h      | ✅     | `report-generator.ts`               |
| R4  | Testes (R1-R3)        | Snapshot + render condicional + edge cases                                  | 2h      | ✅     | `report-generator.test.ts`          |

#### Sprint 2 — Steps + Attachments + Coverage HTML ✅

| #   | Item                     | Descrição                                                         | Esforço | Status |
| --- | ------------------------ | ----------------------------------------------------------------- | ------- | ------ |
| R5  | **Steps expansíveis**    | Detalhe colapsável por teste com steps (Action + Expected Result) | 3h      | ✅     |
| R6  | **Attachments**          | Screenshots inline + logs colapsáveis                             | 3h      | ✅     |
| R7  | **Coverage HTML report** | `generateCoverageHtml()` — tabela de issues grouped by epic       | 2h      | ✅     |
| R8  | Testes (R5-R7)           | 2h                                                                | ✅      |

#### Sprint 3 — Polimento + Publicação ✅

| #   | Item                            | Descrição                                                    | Esforço | Status |
| --- | ------------------------------- | ------------------------------------------------------------ | ------- | ------ |
| R9  | **Flakiness dark mode + trend** | dark mode CSS + mini trend chart no dashboard                | 1h      | ✅     |
| R10 | **Known issues**                | Config `known-issues.json` — falhas conhecidas suprimidas    | 2h      | ✅     |
| R11 | **Multi-environment**           | Abas comparando 2+ runs lado a lado                          | 4h      | ✅     |
| R12 | **PDF export**                  | CSS `@media print` + botão "Export PDF" via `window.print()` | 1h      | ✅     |
| R13 | **Auto-publish**                | Flag `--publish s3\|gh-pages`                                | 2h      | ✅     |
| R14 | Testes (R9-R13)                 | 3h                                                           | ✅      |

---

### P2 — Documentar código (TSDoc exports + module headers)

| Fase | Layer                      | Arquivos                                               | Status |
| ---- | -------------------------- | ------------------------------------------------------ | ------ |
| 1    | shared/ core               | logger, config, state, http-client, prompt             | ✅     |
| 2    | shared/ util               | result_parser, markdown, report-generator, etc.        | ✅     |
| 3    | jira_management/ resources | jira_link_manager, result_reporter, etc.               | ✅     |
| 4    | jira_management/ commands  | case01-case20 + context + create_tests                 | ✅     |
| 5    | git_triggers/              | github_manager, gitlab_manager, pipeline-handler, main | ✅     |

---

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

### P1 — Elevar cobertura de arquivos críticos < 90% ✅

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

### P0 — User docs desatualizadas (gap docs vs código)

| Item                                                  | Status | Esforço |
| ----------------------------------------------------- | ------ | ------- |
| Batch 1: README + 5 docs (incorretos/críticos)        | ✅     | 2h      |
| Batch 2: Aliases, comandos especiais, UX features     | ✅     | 1h      |
| Batch 3: Documentar `setup/` wizard (doc #10) + fluxo | ✅     | 2h      |

### P1 — JSDoc/TSDoc documentation gaps (audit 2026-05-28)

| Item                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| Batch 1: `bug-report.ts` (null rationale) + 4 small files zero doc  | ✅     |
| Batch 2: `llm-metrics.ts` + `entry-menu.ts`                         | ✅     |
| Batch 3: `markdown.ts` (module doc) + `create_tests.ts` (SRP break) | ✅     |
| Batch 4: handler JSDoc (`pipeline-handler`, `mr-handler`, caseXX)   | ✅     |

### P2 — Handler test files

| Item                                                                      | Status |
| ------------------------------------------------------------------------- | ------ |
| `shared/theme.test.ts` exists                                             | ✅     |
| `jira_management/commands/handlers.test.ts` covers case01-20 (787 linhas) | ✅     |

### P2 — `collectManual` > 50 linhas (R4)

| Item                                                                              | Status |
| --------------------------------------------------------------------------------- | ------ |
| `shared/bug-report.ts:104-158` — extraído em `askWithRetry` + `normalizeSeverity` | ✅     |

### P1 — Xray per-test history ✅

| #   | Item                                                                          | Esforço | Status |
| --- | ----------------------------------------------------------------------------- | ------- | ------ |
| 1   | Interface `TestHistoryProvider` + types (`xray-history.ts`)                   | 0.25h   | ✅     |
| 2   | `ServerHistoryProvider` (`GET /rest/raven/1.0/api/test/{key}/testruns`)       | 0.5h    | ✅     |
| 3   | `CloudHistoryProvider` (GraphQL `getTestRuns` + auth + key→issueId)           | 1h      | ✅     |
| 4   | Integração em `case17.ts` (history via mapping file + cache)                  | 0.25h   | ✅     |
| 5   | Display no HTML report (`report-generator.ts` — coluna History c/ ferramenta) | 0.5h    | ✅     |
| 6   | Retry + fallback + cache em memória (`TestHistoryCache`)                      | 0.25h   | ✅     |
| 7   | Testes: `xray-history.test.ts` (19 testes)                                    | 1h      | ✅     |

**API**: Server → Raven REST. Cloud → GraphQL `getTestRuns` (requer `key→issueId`). Ambos implementados via strategy pattern.

### P2 — `jira mapping generate` (mapping para testes manuais)

| Item                                                      | Status                  | Nota                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI command para gerar mapping file `summary→key` via JQL | 📝 Pendente refinamento | **Débito conhecido**: `fields.summary` ≠ `CTRF test name` em casos gerais. `_fuzzyMatch` mitiga parcialmente com risco de falso positivo. Necessário definir convenção (`summary = test name`) ou abordagem alternativa antes de implementar. |

### P1 — Restaurar thresholds de cobertura (80% branches, 90% lines) ✅

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

| #   | Item                                                                 | Prioridade | Status | Arquivos                                      |
| --- | -------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------- |
| 1.1 | Extender `PipelineJob` + `PipelineRun` + `Issue` interface           | P1         | ✅     | `shared/types.ts`                             |
| 1.2 | `GitHubManager.getOpenIssues()` + `getJobLogs()`                     | P1         | ✅     | `git_triggers/github_manager.ts`              |
| 2.1 | `aggregatePipelineHealth()` — pass rate, top failing jobs, breakdown | P1         | ✅     | `git_triggers/pipeline-health.ts`             |
| 2.2 | `categorizePipelineFailure()` — LLM classificação de erro            | P1         | ✅     | `git_triggers/pipeline-health.ts`             |
| 2.3 | `renderPipelineHealthHtml()` — HTML com cards, tabelas, seções       | P1         | ✅     | `git_triggers/pipeline-health.ts`             |
| 2.4 | Tests unitários (19 testes com fixtures)                             | P1         | ✅     | `git_triggers/pipeline-health.test.ts`        |
| 2.5 | Prompt `classify-pipeline-failure.md`                                | P1         | ✅     | `shared/prompts/classify-pipeline-failure.md` |
| 3.1 | `github-e2e.test.ts` rewrite: fetch → pure functions → HTML          | P1         | ✅     | `git_triggers/github-e2e.test.ts`             |
| 3.2 | Persistir snapshot no `metrics.ts`                                   | P2         | 🚧     | —                                             |

---

## ✅ Template CSV/JSON (case11) — Bulk format fix + JSON generation ✅

| #   | Item                                                                                                                                           | Prioridade | Status | Arquivos                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------- |
| 1   | **BUG**: `jira_management/test_steps_template.csv` em flat format (Title,Action,Data,Expected Result) — rejeitado pelo parser `readBulkCsv()`  | P0         | ✅     | `jira_management/test_steps_template.csv` (removido — fonte única em root) |
| 2   | **FIX**: `case11.ts` copia da raiz (`test_steps_template.csv` — bulk, 94l), pergunta CSV/JSON, default path corrigido (não sobrescreve source) | P1         | ✅     | `jira_management/commands/case11.ts`                                       |
| 3   | Opção JSON: novo fluxo em case11 copia `test_cases_template.json` (raiz, 5 exemplos, 86l)                                                      | P1         | ✅     | `jira_management/commands/case11.ts`                                       |
| 4   | Menu: label "Gerar template CSV" → "Gerar template" + aliases `template:csv` e `template:json`                                                 | P2         | ✅     | `jira_management/main.ts`                                                  |
| 5   | Tests: handlers.test.ts — case11 adaptado para CSV/JSON dual flow (4 testes)                                                                   | P1         | ✅     | `jira_management/commands/handlers.test.ts`                                |

## ✅ Histórico

Itens concluídos em sessões anteriores: [`BACKLOG-historico.md`](BACKLOG-historico.md).
