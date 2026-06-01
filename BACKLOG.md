# Backlog

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

## 🔷 Pendentes

### 🎯 Sprint Atual — Remediação Auditoria Profunda (12 fases) 🏃

Plano completo em 12 fases, ~20 commits, cobrindo todos os 21 achados. Nenhum workaround — soluções definitivas.

**F0 — Guardrails Preventivos 🔧**

| ID   | Tipo | Item                                                                       | Esforço | Status |
| ---- | ---- | -------------------------------------------------------------------------- | ------- | ------ |
| A0.1 | 🔧   | eslint rule `no-restricted-syntax` p/ `execSync` + `execFileSync` template | 10min   | ✅     |
| A0.2 | 🔧   | CI script: detector `.only()` + `throw 'string'`                           | 10min   | ✅     |
| A0.3 | 🔧   | ts-prune já configurado no CI via `check-unused-exports.sh`                | —       | ✅     |

**F1 — Segurança (P0) 🔴**

| ID   | Tipo | Arquivo                  | Item                                                                | Esforço | Status |
| ---- | ---- | ------------------------ | ------------------------------------------------------------------- | ------- | ------ |
| A1.1 | 🐛   | `shared/publish.ts:24`   | Command injection: `execSync` → `execFileSync` com argv array       | 15min   | ✅     |
| A1.2 | 📋   | `shared/publish.test.ts` | Add test case: path com shell chars (`; rm -rf /`) prova inocuidade | 10min   | ✅     |

**F2 — DIP Violations (P1) 🟠 — Handlers não criam dependências**

| ID   | Tipo | Arquivo                                  | Item                                                                              | Esforço | Status |
| ---- | ---- | ---------------------------------------- | --------------------------------------------------------------------------------- | ------- | ------ |
| A2.1 | ♻️   | `git_triggers/pipeline-handler.ts:83-84` | `createTestExecution()` receber `JiraResource` + `JiraLinkManager` como parâmetro | 30min   | ✅     |
| A2.2 | ♻️   | `git_triggers/test-results.ts:226-227`   | `collectAndCreateTestExecution()` receber dependências como parâmetro             | 30min   | ✅     |
| A2.3 | ♻️   | `git_triggers/main.ts` + `batch-mode.ts` | Atualizar callers: criar `JiraClient` + `JiraLinkManager` e injetar               | 15min   | ✅     |

**F3 — Config Accessor Overhaul (P1+P2) ♻️**

| ID   | Tipo | Arquivo                            | Item                                                                      | Esforço | Status    |
| ---- | ---- | ---------------------------------- | ------------------------------------------------------------------------- | ------- | --------- | ---- | --- |
| A3.1 | ♻️   | `shared/config-accessor.ts`        | Substituir 101 getters por Proxy-based dynamic accessor (~379→~60 linhas) | 3h      | ⬜        |
| A3.2 | 🐛   | `shared/config-schema.ts:33`       | Hardcoded `ECSPOL` → `YOUR_PROJECT_KEY`                                   | 5min    | ⬜        |
| A3.3 | 🐛   | `git_triggers/pipeline-jira.ts:27` | Remover fallback `                                                        |         | 'ECSPOL'` | 5min | ⬜  |
| A3.4 | 📋   | `shared/config-accessor.test.ts`   | Testar get/set/reset/create/validate                                      | 30min   | A3.1      |

**F4 — Cobertura de Testes (P1) 📋**

| ID   | Tipo | Módulo                            | Item                                                                                | Esforço | Status |
| ---- | ---- | --------------------------------- | ----------------------------------------------------------------------------------- | ------- | ------ |
| A4.1 | 📋   | `shared/config-schema.test.ts`    | Testar `CONFIG_SCHEMA` fields/types/defaults                                        | 15min   | ⬜     |
| A4.2 | 📋   | `shared/config-validator.test.ts` | Testar `validateRequiredEnv()`                                                      | 15min   | ⬜     |
| A4.3 | 📋   | `shared/prompt-errors.test.ts`    | Testar `humanizeError`/`extractErrorMessage`/`printError`/`CancelError`             | 30min   | ⬜     |
| A4.4 | 📋   | `shared/prompt-format.test.ts`    | Testar `badge`/`icon`/`success`/`error`/`warn`/`info`/`title`/`divider`/`tableView` | 45min   | ⬜     |
| A4.5 | 📋   | `shared/prompt-summary.test.ts`   | Testar `printSummary` (vazio, ok, erro, misto, quiet, verbose)                      | 20min   | ⬜     |

**F5 — Dead Code & Mutable State (P2) 🧹**

| ID   | Tipo | Arquivo                 | Item                                                                                    | Esforço | Status |
| ---- | ---- | ----------------------- | --------------------------------------------------------------------------------------- | ------- | ------ |
| A5.1 | ♻️   | `shared/llm-metrics.ts` | Encapsular 12 vars module-level em classe `LlmMetricsCollector`                         | 1h      | ⬜     |
| A5.2 | 🧹   | `shared/llm-metrics.ts` | Remover dead exports: `recordArtifactReview`, `getLlmMetricsHistory`, `clearLlmMetrics` | 5min    | A5.1   |

**F6 — Mutable State HTTP Client (P2) ♻️**

| ID   | Tipo | Arquivo                 | Item                                                                              | Esforço | Status |
| ---- | ---- | ----------------------- | --------------------------------------------------------------------------------- | ------- | ------ |
| A6.1 | ♻️   | `shared/http-client.ts` | Encapsular `_sleepImpl`/`_retryCleanupTimer`/`retryCounts` em classe `HttpClient` | 1h      | ⬜     |

**F7 — Monolithic Types Split (P2) ♻️**

| ID   | Tipo | Arquivo           | Item                                              | Esforço | Status |
| ---- | ---- | ----------------- | ------------------------------------------------- | ------- | ------ |
| A7.1 | ♻️   | `shared/types.ts` | Split 763 linhas em 7 domínios + barrel re-export | 2h      | ⬜     |

**F8 — SRP Violations & Code Smells (P1+P2) ♻️**

| ID   | Tipo | Arquivo                                   | Item                                                                       | Esforço | Status |
| ---- | ---- | ----------------------------------------- | -------------------------------------------------------------------------- | ------- | ------ |
| A8.1 | ♻️   | `jira_management/import-loop.ts:248`      | Extrair `_shouldAbortOrContinue()` de `processCreationAndLinking` (52→≤50) | 15min   | ⬜     |
| A8.2 | ♻️   | `jira_management/create_tests.ts:150,166` | `TestExecutionCreator` injetado por parâmetro (não `new` inline)           | 20min   | ⬜     |
| A8.3 | ♻️   | `shared/prompt-format.ts`                 | Trocar `import Config` por import específico (evitar circular dep)         | 15min   | ⬜     |

**F9 — Magic Numbers & URL Sanitization (P2) 🔧**

| ID   | Tipo | Arquivo                 | Item                                                                                        | Esforço | Status |
| ---- | ---- | ----------------------- | ------------------------------------------------------------------------------------------- | ------- | ------ |
| A9.1 | 🔧   | `shared/box.ts`         | Nomear constantes: `TITLE_OFFSET`, `PADDING_FACTOR`, `TERMINAL_FALLBACK_WIDTH`, etc.        | 15min   | ⬜     |
| A9.2 | 🔧   | `shared/cli_base.ts:71` | URL sanitization abrangente (token, api_key, secret, password, access_token, client_secret) | 10min   | ⬜     |

**F10 — Orphan Files & Housekeeping (P3) 🧹**

| ID    | Tipo | Arquivo                                     | Item                                      | Esforço | Status |
| ----- | ---- | ------------------------------------------- | ----------------------------------------- | ------- | ------ |
| A10.1 | 🧹   | `jira_management/commands/handlers.test.ts` | Orphan test sem source — deletar          | 5min    | ⬜     |
| A10.2 | 🧹   | `git_triggers/github-e2e.test.ts`           | Orphan test sem source — deletar ou mover | 5min    | ⬜     |
| A10.3 | 🔧   | `.env.example`                              | Sincronizar com `config-schema.ts`        | 15min   | ⬜     |

**F11 — Documentation (P3) 📄**

| ID    | Tipo | Arquivo                  | Item                                                   | Esforço | Status |
| ----- | ---- | ------------------------ | ------------------------------------------------------ | ------- | ------ |
| A11.1 | 📄   | `shared/prompt-input.ts` | Documentar pattern de dynamic import (ESM lazy em CJS) | 5min    | ⬜     |

---

### Fases anteriores (ciclo C12)

**Fase 0 — Diagnóstico ✅**

| ID Audit  | Tipo | Item                                                                      | Esforço | Status |
| --------- | ---- | ------------------------------------------------------------------------- | ------- | ------ |
| C12-6/7/8 | 🔍   | Diagnosticar 3 E2E regressions (case15 timeout, case16 path, CSV timeout) | 30min   | ✅     |

**Fase 1 — Correção 🔴🟠 (P0 — estrutural)**

| ID Audit | Tipo | Arquivo                                | Item                                                                                 | Esforço | Depende | Status |
| -------- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------ | ------- | ------- | ------ |
| C12-1    | ♻️   | `git_triggers/test-results.ts:162`     | DIP: `createTestExecution()` receber `JiraClient` + `JiraLinkManager` como parâmetro | 30min   | —       | ⬜     |
| C12-2    | ♻️   | `git_triggers/pipeline-jira.ts:26`     | DIP: `handleBugCreation()` receber `JiraClient` como parâmetro                       | 15min   | —       | ⬜     |
| C12-3    | ♻️   | `git_triggers/batch-mode.ts:154`       | DIP: `runFlakyAutoActions()` receber `JiraClient` como parâmetro                     | 15min   | —       | ⬜     |
| C12-4    | ♻️   | `git_triggers/schedule-handler.ts:99`  | DIP: `runFlakyAutoActionsForProject()` receber `JiraClient` como parâmetro           | 15min   | —       | ⬜     |
| C3-3     | 🐛   | `shared/llm-fallback.ts:99-122`        | Zod validation em `as LlmUsage`/`as LlmChoice[]`                                     | 30min   | —       | ⬜     |
| C3-4     | 🐛   | `shared/llm-cache.ts:69,132,153`       | Zod validation em `as unknown as T`                                                  | 30min   | —       | ⬜     |
| C11-1    | ♻️   | `shared/llm-rate-limiter.ts:5`         | Mover `LlmTier`/`ResponseFormat` para `shared/types.ts`                              | 15min   | —       | ⬜     |
| C12-6    | 🐛   | `e2e/handlers-happy-paths.test.ts:510` | Fix case15 timeout — adicionar nock scopes                                           | 1h      | F0      | ✅     |
| C12-7    | 🐛   | `e2e/handlers-happy-paths.test.ts:560` | Fix case16 path — reset mock state                                                   | 30min   | F0      | ✅     |
| C12-8    | 🐛   | `e2e/csv-import.test.ts`               | Fix CSV timeout — adicionar nock scopes ou split test                                | 30min   | F0      | ✅     |

**Fase 2 — Idempotência + Funções longas (P2)**

| ID Audit | Tipo | Arquivo                                        | Item                                                      | Esforço | Status |
| -------- | ---- | ---------------------------------------------- | --------------------------------------------------------- | ------- | ------ |
| C19-1    | 🐛   | `jira_management/test-execution-creator.ts:28` | Adicionar `findExistingTe()` antes de criar TE            | 30min   | ⬜     |
| C4-1     | ♻️   | `shared/report-table.ts:165`                   | Extrair helpers de `_buildTestTableRow` (55 linhas)       | 15min   | ⬜     |
| C4-2     | ♻️   | `jira_management/import-loop.ts:248`           | Extrair helper de `processCreationAndLinking` (52 linhas) | 15min   | ⬜     |

**Fase 3 — SRP splits (P3, ~6h)**

| ID Audit | Tipo | Arquivo               | Item                                                                            | Esforço | Status |
| -------- | ---- | --------------------- | ------------------------------------------------------------------------------- | ------- | ------ |
| C21-1    | ♻️   | `shared/config.ts`    | Split: `ConfigSchema` + `ConfigValidator` + `ConfigAccessor` (<200 linhas cada) | 3h      | ⬜     |
| C21-2    | ♻️   | `shared/prompt-ui.ts` | Extrair `prompt-format.ts`, `prompt-summary.ts`, `prompt-errors.ts`             | 3h      | ⬜     |

**Fase 5 — Código morto + Limpeza (P2/P3) ✅**

| ID Audit | Tipo | Arquivo                                 | Item                                                            | Esforço | Status |
| -------- | ---- | --------------------------------------- | --------------------------------------------------------------- | ------- | ------ |
| C1-4     | 🧹   | `shared/types.ts:580`                   | Remover `XrayTestRun` (0 imports)                               | 5min    | ✅     |
| C1-5     | 🧹   | `jira_management/commands/helpers.ts`   | Remover arquivo (re-export morto)                               | 5min    | ✅     |
| C1-6     | 🧹   | `jira_management/commands/case17.ts:34` | Remover re-exports não utilizados                               | 5min    | ✅     |
| C1-1/2/3 | 🔧   | `shared/llm-metrics.ts`                 | Adicionar `@internal` nos 3 exports de teste                    | 10min   | ✅     |
| C3-1/2   | ♻️   | `git_triggers/pipeline-health.ts:75-76` | Substituir `runs[0]!`/`runs[len]!` por var temporária           | 10min   | ✅     |
| C15-1    | 🔧   | `package.json`                          | Documentar: chalk@4 mantido (CJS), decisão registrada           | 5min    | ✅     |
| C15-2    | 🔧   | `package.json`                          | Documentar: glob@10 mantido (sync), reavaliar quando necessário | 5min    | ✅     |

---

### 🎯 Fase 1 — Orquestração (Semana 1) — pós auditoria

| #   | Tipo | Item                                                                                    | Esforço | Depende      | Status |
| --- | ---- | --------------------------------------------------------------------------------------- | ------- | ------------ | ------ |
| 1   | ✨   | **CI Quality Gate** — script health + coverage + flakiness com exit code                | 30min   | Fase 4       | ⬜     |
| 2   | ✨   | **Pre-push Hook** — test-impact + coverage gate antes do commit                         | 1h      | [1]          | ⬜     |
| 3   | ✨   | **Failure Auto-Triage** — falha → classificação → bug → assign + persist classification | 3h      | [1] + Fase 1 | ⬜     |
| 4   | 🔧   | **Flaky Auto-Management** — configurar thresholds                                       | 15min   | —            | ⬜     |
| 5   | ✨   | **Quality Weekly Report** — schedule + HTML automático                                  | 2h      | [1]          | ⬜     |

### 🏗️ Gap estrutural (pós auditoria)

| Tipo | Item                                           | Esforço | Depende | Status |
| ---- | ---------------------------------------------- | ------- | ------- | ------ |
| 🐛   | Wirear `pipeline-health.ts` em `batch-mode.ts` | 30min   | Fase 4  | ⬜     |

### 📦 Fase 2 — Acúmulo + Sinergia (pós Semana 2)

| #   | Tipo | Item                         | Esforço | Depende                       |
| --- | ---- | ---------------------------- | ------- | ----------------------------- |
| 11  | ✨   | Defect Seasonality Dashboard | 3h      | F1: ~5 runs c/ classification |
| 12  | ✨   | Silent Regression Detector   | 3h      | F1: ~5 runs c/ duration       |
| 13  | ✨   | AI Test Effectiveness        | 3h      | F1: ~5 runs AI-gen vs manual  |
| 14  | ✨   | Cross-Squad Benchmark        | 3h      | F1 rodando em 2+ projetos     |
| 15  | ✨   | Perfil de Desenvolvedor      | 3h      | F1: git blame histórico       |
| 16  | ✨   | Suite Optimization Advisor   | 4h      | F2[12] + F1[4]                |

### 🧠 Fase 3 — Inteligência Avançada (Mês 2+)

| #   | Tipo | Item                          | Esforço | Depende                                     |
| --- | ---- | ----------------------------- | ------- | ------------------------------------------- |
| 17  | ✨   | Incident Investigation Report | 5h      | F1[3] + pipeline-health + F2 + coverage-gap |
| 18  | ✨   | Impact-Aware Pipeline Alert   | 4h      | F1[1] + pipeline-health + coverage-gap      |
| 19  | ✨   | Requirement Quality Score     | 3h      | F1[10] + ai-feedback acumulado              |
| 20  | ✨   | Pipeline Cost Analytics       | 3h      | pipeline-health + duration history          |

### 📦 Adiados sine die (reavaliar oportunidade futura)

| Tipo | Item                                          | Prio original | Motivo do adiamento                                    |
| ---- | --------------------------------------------- | ------------- | ------------------------------------------------------ |
| ✨   | `jira mapping generate` — CLI mapping via JQL | P2            | Ambiguidade `summary` ≠ `CTRF test name` não resolvida |
| ✨   | Docker image + npm package (CI/CD)            | P2            | Implementação prematura sem caso de uso concreto       |

---

## 🎯 Debt Attack — Dia 1 ✅

| Lote                           | Status | Resultado                                                   |
| ------------------------------ | ------ | ----------------------------------------------------------- |
| L1 — Segurança 🔴 (F1-F3)      | ✅     | `execSync` → `spawnSync`/`execFileSync`; testes atualizados |
| L2 — Null Safety 🟠 (F4-F14)   | ✅     | `getLine()` em markdown.ts (26 occs) + 10 isolados          |
| L3 — Código Morto 🧹 (F15-F19) | ✅     | `XrayGetTestRunsResponse` removido; 3 re-exports limpos     |
| L6 — CLI UX 🖥️ (F25-F27)       | ✅     | `gracefulExit()` centralizado; entry-menu + llm-benchmark   |
| **R6**                         | ✅     | tsc 0 erros, 2850 pass, 0 `throw 'string'`, 0 `.only(`      |

## 📊 Métrica atual

- `npx tsc --noEmit`: **0 erros**
- `npx jest --no-coverage`: **2865 pass, 1 skip (Xray Cloud)**
- `throw 'string'`: **0 ocorrências**
- `.only(`: **0 ocorrências**
