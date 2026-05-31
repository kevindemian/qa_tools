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

### 🎯 Sprint Atual — Ataque Auditoria Consolidada 🏃

**Fase 0 — Diagnóstico (pré-execução) ✅**

| ID Audit  | Tipo | Item                                                                      | Esforço | Status |
| --------- | ---- | ------------------------------------------------------------------------- | ------- | ------ |
| C12-6/7/8 | 🔍   | Diagnosticar 3 E2E regressions (case15 timeout, case16 path, CSV timeout) | 30min   | ✅     |

**Fase 1 — Correção 🔴🟠 (P0 — estrutural, afeta testes se adiado)**

| ID Audit | Tipo | Arquivo                                | Item                                                                                 | Esforço | Depende | Status |
| -------- | ---- | -------------------------------------- | ------------------------------------------------------------------------------------ | ------- | ------- | ------ |
| C12-1    | ♻️   | `git_triggers/test-results.ts:162`     | DIP: `createTestExecution()` receber `JiraClient` + `JiraLinkManager` como parâmetro | 30min   | —       | 🏃     |
| C12-2    | ♻️   | `git_triggers/pipeline-jira.ts:26`     | DIP: `handleBugCreation()` receber `JiraClient` como parâmetro                       | 15min   | —       | 🏃     |
| C12-3    | ♻️   | `git_triggers/batch-mode.ts:154`       | DIP: `runFlakyAutoActions()` receber `JiraClient` como parâmetro                     | 15min   | —       | 🏃     |
| C12-4    | ♻️   | `git_triggers/schedule-handler.ts:99`  | DIP: `runFlakyAutoActionsForProject()` receber `JiraClient` como parâmetro           | 15min   | —       | 🏃     |
| C3-3     | 🐛   | `shared/llm-fallback.ts:99-122`        | Zod validation em `as LlmUsage`/`as LlmChoice[]`                                     | 30min   | —       | 🏃     |
| C3-4     | 🐛   | `shared/llm-cache.ts:69,132,153`       | Zod validation em `as unknown as T`                                                  | 30min   | —       | 🏃     |
| C11-1    | ♻️   | `shared/llm-rate-limiter.ts:5`         | Mover `LlmTier`/`ResponseFormat` para `shared/types.ts`                              | 15min   | —       | 🏃     |
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

**Fase 4 — Cobertura de testes (P1, depende de F1)**

| ID Audit | Tipo | Módulo                                     | Item                                         | Esforço | Depende      | Status |
| -------- | ---- | ------------------------------------------ | -------------------------------------------- | ------- | ------------ | ------ |
| C12-5    | 📋   | `shared/llm-rate-limiter.ts`               | Criar `.test.ts` — rate limiting logic       | 30min   | F1           | ⬜     |
| C12-5    | 📋   | `shared/llm-cache.ts`                      | Criar `.test.ts` — cache read/write/eviction | 30min   | F1 (C3-4)    | ⬜     |
| C12-5    | 📋   | `shared/llm-fallback.ts`                   | Criar `.test.ts` — fallback chain            | 30min   | F1 (C3-3)    | ⬜     |
| C12-5    | 📋   | `jira_management/precondition-matcher.ts`  | Criar `.test.ts` — matching logic            | 30min   | —            | ⬜     |
| C12-5    | 📋   | `jira_management/precondition-importer.ts` | Criar `.test.ts` — import flow               | 30min   | —            | ⬜     |
| C12-5    | 📋   | `git_triggers/github-api.ts`               | Criar `.test.ts` — API calls (P0: fundação)  | 1h      | F1 (C12-1/2) | ⬜     |
| C12-5    | 📋   | `git_triggers/github-branch.ts`            | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/github-issues.ts`            | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/github-pr.ts`                | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/github-workflow.ts`          | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/gitlab-api.ts`               | Criar `.test.ts` — API calls (P0: fundação)  | 1h      | F1 (C12-1/2) | ⬜     |
| C12-5    | 📋   | `git_triggers/gitlab-branch.ts`            | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/gitlab-issues.ts`            | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/gitlab-pr.ts`                | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/gitlab-workflow.ts`          | Criar `.test.ts`                             | 20min   | F1           | ⬜     |
| C12-5    | 📋   | `git_triggers/pipeline-jira.ts`            | Criar `.test.ts` — bug creation flow         | 20min   | F1 (C12-2)   | ⬜     |

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
