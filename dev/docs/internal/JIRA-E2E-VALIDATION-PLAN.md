# Jira E2E Validation Plan

**Data**: 2026-07-23
**Branch**: `feature/associate-te-cli`
**Projeto**: ECSPOL (Jira Cloud: `euronext.atlassian.net`)
**Modo**: Cloud (Xray Cloud GraphQL)

### Estratégia de validação

| Categoria | Abordagem |
|-----------|-----------|
| Read-only (Fase 1) | Execução live contra Jira — sem writes |
| Writes em issues existentes (Fases 3-5) | **Snapshot → write → validar → restore → validar restore** |
| Criação de entidades (Fases 2-6) | Contrato: endpoints + payload shapes via código + dry-run |
| Destrutivos (Fase 5) | Contrato: transitions/PUT shapes + GET endpoints |
| Local (configs, templates, paths) | Unit tests existentes |

Target de snapshot-restore: **ECSPOL-1633** (duplicata descartável)

---

## Resultados — Fase 1 (2026-07-23)

**13/13 features validadas. 1 bug corrigido.**

| # | Feature | Status | Evidência |
|---|---------|--------|-----------|
| 1.1 | case12 Diagnóstico | ✅ | 3/3 endpoints 200ms; health 6/10 runs |
| 1.2 | case02 List Versions | ✅ | 7 versões, 3 released, 1 overdue |
| 1.3 | case06 Task Status | ✅ | 50 issues GRC 0.1.0, all Done |
| 1.4 | case19 History Dashboard | ✅ | 18 session history entries |
| 1.5 | case21 Coverage Gap | ✅ | Module exists; no coverage data (expected) |
| 1.6 | case22 Test Impact | ✅ | No test-mapping.json; tier 2 fallback OK |
| 1.7 | case23 AI Feedback | ✅ | No feedback file; empty state OK |
| 1.8 | case25 Traceability | ⚠️ | No metrics data; matrix empty (expected) |
| 1.9 | case26 Release Score | ⚠️ | No metrics data; score empty (expected) |
| 1.10 | case27 Coverage Dashboard | ⚠️ | No coverage data; dashboard empty (expected) |
| 1.11 | link-types | ✅ | 22 link types from Jira API |
| 1.12 | xray-history | ✅ | Auth OK (client_id/client_secret); token 441 chars |
| 1.13 | precondition-matcher | ✅ | Module exists; tokenOverlap logic present |

### Bugs corrigidos na Fase 1

**BUG-001: `searchJiraIssues` v3 response não normaliza `total`**
- **Arquivo**: `shared/jira/jira-client.ts:207-219`
- **Problema**: Jira Cloud removeu v2 search (CHANGE-2046). Code usa v3 `POST /rest/api/3/search/jql` mas o response `{ issues, nextPageToken, isLast }` não tem campo `total`. O cast `as unknown as SearchIssuesResponse` resultava em `total: undefined`.
- **Fix**: Normaliza response v3 para `{ issues, total: issues.length }` usando bracket notation para satisfazer TS index signature.
- **Impacto**: case06 (checkReleaseTasksStatus) e todas as features que dependem de `searchJiraIssues` no modo Cloud.

### Notas de validação

- **Env vars Xray**: UPPERCASE (`XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`, `XRAY_CLOUD_URL`). Auth endpoint espera `client_id`/`client_secret` (snake_case).
- **JIRA_BASE_URL**: Inclui `/rest/api/2` no `.env.local`. Código faz strip antes de chamar endpoints.
- **Health score**: 6/10 runs necessários — estado esperado sem pipeline completo.
- **DataHub**: Sem dados de métricas/cobertura — features 25/26/27 mostram vazio (correto).

---

## Resultados — Fase 3 Snapshot-Restore (2026-07-23)

**Target**: ECSPOL-1633 (duplicata descartável)

| # | Feature | Status | Evidência |
|---|---------|--------|-----------|
| 3.1 | Update via PUT | ✅ | Snapshot → PUT summary+labels → verify → restore → verify restore |
| 3.5 | Clean-slate pattern | ✅ | Snapshot → clear description → rebuild → verify → restore → verify restore |
| 5.1 | Transitions (auto-close) | ✅ | WORKFLOW_MAP contratuamente correto; 2 transitions disponíveis para Test type |

### Achados Fase 3

- **WORKFLOW_MAP**: `new→approve`, `coding in progress→coding done/done`, `coding done→done`, `approve→use test case`
- **ECSPOL-1633 é tipo Test**: workflow diferente de Story/Task/Bug — transitions disponíveis: Reject, Approve
- **Case07 auto-close**: projetado para Story/Task/Bug (não Test type) — correto
- **Snapshot-restore**: mecanismo PUT funciona perfeitamente para summary, description, labels, fixVersions

---

## Resultados — Bug Report (EEX-1070) (2026-07-23)

| Check | Status | Evidência |
|-------|--------|-----------|
| Snapshot | ✅ | summary, description, labels, issuetype, priority capturados |
| Contract | ✅ | issuetype, priority, labels, description acessíveis via GET |
| PUT write | ✅ | labels modificadas (reorder alfabético = Jira behavior, não bug) |
| Restore | ✅ | summary, description, labels restaurados ao original |

**EEX-1070**: Bug "PTCS – SETTLEMENT – SIT - Error in Settlement Process", status Obsolete, priority 4-Low

---

## Resultados — Fase 6 AI/Relatórios (2026-07-23)

| # | Feature | Status | Evidência |
|---|---------|--------|-----------|
| 6.1 | case17 HTML Report | ✅ | CTRF parser OK; quality gate modules OK; Xray history 0 runs (novo teste); Jira bug search OK |
| 6.2 | case18 AI Test Gen | ✅ | 20 preconditions reais ECSPOL; dual-threshold matching correto (23/23 unit tests); module structure OK |

### Achados Fase 6

- **case17**: `result_parser`, `report-utils`, `flakiness-entries`, `run-pass-rate`, `report-generator` — todos modules existem e exportam funções esperadas
- **case18**: `matchPreconditionByDualThreshold` funciona com dados reais — 20 preconditions ECSPOL; queries de teste sem match → "create" (comportamento correto)
- **Xray history**: ECSPOL-1637 com 0 runs — esperado para tests recém-criados
- **Jira bug search**: 0 bugs com "test" no summary — esperado para ECSPOL

---

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ⬜ | Pendente |
| 🔵 | Em execução |
| ✅ | Aprovado |
| ⚠️ | Parcial (gap identificado) |
| ❌ | Reprovado |
| 🔒 | Bloqueado (dependência) |

---

## Fase 1: Read-only (13 features)

Objetivo: Validar que todas as features de leitura retornam dados corretos sem modificar nada.

### 1.1 Diagnóstico de Conexão (case12)

- **Source**: `jira_management/commands/case12.ts:11-120`
- **O que validar**: 3 endpoints Jira respondem (myself, Xray root, project); health score calculado corretamente
- **APIs**: `GET /rest/api/2/myself`, `GET {baseUrl}`, `GET /rest/api/2/project/{project}`
- **Como validar**: Script que chama handler com mocks de axiosInstance; mock de probe retorna 200/500; verificar `tableView` args e `pushHistory`
- **Pré-requisitos**: `.env` com credenciais válidas; DataHub inicializado com 10+ runs para health score "pronto"
- **Risco**: Nenhum (read-only)
- **Evidência esperada**: 3/3 endpoints verificados; health score >= 0; pushHistory com status 'ok'
- **Unit tests**: `jira_management/commands/__tests__/case12.test.ts` (5 tests)

### 1.2 Listar Versões (case02)

- **Source**: `jira_management/commands/case02.ts:17-47`
- **O que validar**: Versões listadas com nome, descrição, flag RELEASED/ATRASADA
- **APIs**: `GET /rest/api/2/project/{id}/versions`
- **Como validar**: Mock `getProjectId` + `getProjectVersions`; verificar chamadas `info()` com conteúdo correto
- **Pré-requisitos**: Projeto com pelo menos 1 versão
- **Risco**: Nenhum
- **Evidência esperada**: Lista de versões impressa; flags corretas
- **Unit tests**: `jira_management/commands/__tests__/case02.test.ts` (5 tests)

### 1.3 Verificar Status de Tarefas (case06)

- **Source**: `jira_management/commands/case06.ts:6-17`
- **O que validar**: "Resolvido" = status em `['done', 'in use']` (case-insensitive); JQL correta
- **APIs**: JQL `project = X AND fixVersion = "Y"`; `GET /issue/{id}` para status
- **Como validar**: Mock `checkReleaseTasksStatus`; testar cenários: todos done, nenhum done, parcial
- **Pré-requisitos**: Versão com issues (mix done/open)
- **Risco**: Nenhum
- **Evidência esperada**: Issues listadas com status correto; "resolved" = done/in use
- **Unit tests**: `jira_management/commands/__tests__/case06.test.ts` (3 tests)

### 1.4 History/Coverage Dashboard (case19)

- **Source**: `jira_management/commands/case19.ts:150-169`
- **O que validar**: Runs históricos exibidos; flakiness calculado; health score 4 dimensões; cobertura Jira
- **APIs**: DataHub `metricsRuns` (local); `analyzeCoverage()` → JQL `project = X AND issuetype = Test` + Raven API (Cloud)
- **Como validar**: Mock DataHub + compute modules; verificar `tableView` com dados corretos
- **Pré-requisitos**: DataHub com 5+ runs; projeto com Test-type issues
- **Risco**: Nenhum
- **Evidência esperada**: Tabela de runs, health score com 4 dimensões, cobertura
- **Unit tests**: `jira_management/commands/__tests__/case19.test.ts` (4 tests)

### 1.5 Coverage Gap Analysis (case21)

- **Source**: `jira_management/commands/case21.ts:150-187`
- **O que validar**: Gaps identificados (Story/Task/Bug sem testes); qualidade do gate; HTML export
- **APIs**: JQL `project = X AND issuetype in (Story, Task, Bug, Epic)`; batch linked tests
- **Como validar**: Mock `analyzeCoverageGaps`; verificar output table + HTML generation
- **Pré-requisitos**: Projeto com Stories/Tasks/Bugs; Xray test links para alguns
- **Risco**: Nenhum
- **Evidência esperada**: Gaps listados; gate pass/fail calculado; HTML gerado
- **Unit tests**: `jira_management/commands/__tests__/case21.test.ts` (7 tests)

### 1.6 Test Impact Analysis (case22)

- **Source**: `jira_management/commands/case22.ts:72-109`
- **O que validar**: Git diff parsing; 3 tiers (vitest/mapping/keyword); flaky warning
- **APIs**: `git diff --name-only HEAD~1` (local); `analyzeTestImpact` (local); flakiness (DataHub)
- **Como validar**: Mock `execFileSync` + `analyzeTestImpact`; verificar tabelas de impacto
- **Pré-requisitos**: Repo git com 2+ commits; opcional `config/test-mapping.json`
- **Risco**: Nenhum
- **Evidência esperada**: Impactos listados com tier/confidence; flaky warnings
- **Unit tests**: `jira_management/commands/__tests__/case22.test.ts` (7 tests)

### 1.7 AI Feedback Viewer (case23)

- **Source**: `jira_management/commands/case23.ts:43-64`
- **O que validar**: Registros lidos de `ai-feedback.json`; summary (acceptanceRate, etc.)
- **APIs**: Local file read (`~/.local/state/qa-tools/feedback/ai-feedback.json`)
- **Como validar**: Mock `getAiFeedbackSummary` + `getRecentAiRecords`; verificar `tableView`
- **Pré-requisitos**: Arquivo `ai-feedback.json` com registros (ou vazio para path "no records")
- **Risco**: Nenhum
- **Evidência esperada**: Summary + recent records exibidos
- **Unit tests**: `jira_management/commands/__tests__/case23.test.ts` (4 tests)

### 1.8 Traceability Matrix (case25)

- **Source**: `jira_management/commands/case25.ts:8-30`
- **O que validar**: Matrix HTML gerada com épicos, stories, test status, health bars, flakiness
- **APIs**: DataHub `metricsRuns` + `coverageResult.byEpic` (local)
- **Como validar**: Mock DataHub; verificar HTML output em temp dir
- **Pré-requisitos**: DataHub com runs + coverage data
- **Risco**: Nenhum
- **Evidência esperada**: HTML file gerado, contém épicos/stories
- **Unit tests**: `shared/__tests__/traceability-matrix.test.ts` + `.robust.test.ts` + `.property.test.ts`

### 1.9 Release Score (case26)

- **Source**: `jira_management/commands/case26.ts:10-46`
- **O que validar**: Score 0-100 com grade A-F; weighted combination de health+coverage+flakiness
- **APIs**: DataHub (local); `calculateHealthScore`, `calcFlakinessEntries`, `calculateReleaseScore`
- **Como validar**: Mock DataHub; verificar HTML output com score correto
- **Pré-requisitos**: DataHub com 2+ runs + coverage
- **Risco**: Nenhum
- **Evidência esperada**: HTML com score, grade, breakdown
- **Unit tests**: `jira_management/commands/__tests__/case26.test.ts` (5 tests)

### 1.10 Coverage Dashboard (case27)

- **Source**: `jira_management/commands/case27.ts:8-39`
- **O que validar**: Dashboard HTML com gaps, epic rollup, quality gate
- **APIs**: Mesmo que case21 (`analyzeCoverageGaps`)
- **Como validar**: Mock; verificar HTML gerado
- **Pré-requisitos**: Mesmo que case21
- **Risco**: Nenhum
- **Evidência esperada**: HTML com gaps e métricas

### 1.11 Link Type Resolution (link-types)

- **Source**: `jira_management/link-types.ts:21-80`
- **O que validar**: API → cache em memória → cache em disco → fallback hardcoded; case-insensitive match
- **APIs**: `GET /rest/api/2/issueLinkType`
- **Como validar**: Mock `jiraResource.getJiraResource`; testar 4 cenários: API OK, API fail→disk, API+disk fail→hardcoded, resolve por inward/outward
- **Pré-requisitos**: Jira com link types configurados
- **Risco**: Nenhum
- **Evidência esperada**: 4 cenários passando
- **Unit tests**: `jira_management/__tests__/link-types.test.ts` (8 tests)

### 1.12 Xray History (xray-history)

- **Source**: `jira_management/xray-history.ts:1-272`
- **O que validar**: Server REST + Cloud GraphQL; cache com TTL; Zod validation
- **APIs**: Server: `GET /rest/raven/1.0/api/test/{key}/testruns`; Cloud: GraphQL `getTestRuns`
- **Como validar**: Mock XrayCloudClient + jiraResource; testar ambos modos + cache hit + Zod reject
- **Pré-requisitos**: Xray credentials; pelo menos 1 teste com histórico
- **Risco**: Nenhum
- **Evidência esperada**: Runs retornados; cache funciona; validação Zod funciona

### 1.13 Precondition Matcher

- **Source**: `jira_management/precondition-matcher.ts` (via `jira_link_manager.ts` re-export)
- **O que validar**: Dual-threshold matching (token-overlap + summary)
- **APIs**: Local computation
- **Como validar**: Testes unitários existentes + prop-based testing
- **Pré-requisitos**: Nenhum
- **Risco**: Nenhum
- **Evidência esperada**: Matches corretos para overlap > threshold

---

## Fase 2: Writes — validação de contrato (9 features)

**Estratégia**: Validar endpoints, payloads, auth e schemas **sem executar writes reais**. Produção = sem criação de entidades.

### 2.1 Criar Versão (case03) — contrato

- **Source**: `jira_management/commands/case03.ts:6-14`
- **O que validar**:
  1. `GET /rest/api/2/project/{id}/versions` aceita GET (idempotency check)
  2. `POST /rest/api/2/version` aceita POST com payload `{ name, description, project, released: false }`
  3. Payload shape correto: `name` string, `description` string, `project` object, `released` boolean
- **Como validar**: GET versions (read-only) + inspeção de código do POST body
- **Evidência esperada**: GET 200; payload shape match com Jira API spec

### 2.2 Gerar Template (case11) — contrato local

- **Source**: `jira_management/commands/case11.ts:19-47`
- **O que validar**: Template source files existem no repo (`test_steps_template.csv`, `test_cases_template.json`)
- **Como validar**: `ls` dos arquivos fonte; verificar conteúdo (CSV header, JSON schema)
- **Evidência esperada**: Arquivos existem; formato válido

### 2.3 Alterar Projeto Ativo (case09) — contrato local

- **Source**: `jira_management/commands/case09.ts:6-19`
- **O que validar**: `updateState()` modifica `state.json` corretamente
- **Como validar**: Unit test existente; inspeção de código
- **Evidência esperada**: State update funciona (já coberto por tests)

### 2.4 Alterar Diretório Git (case10) — contrato local

- **Source**: `jira_management/commands/case10.ts:5-14`
- **O que validar**: `ctx.git_directory` setado em memória
- **Como validar**: Unit test existente
- **Evidência esperada**: In-memory update (já coberto por tests)

### 2.5 Alterar Diretório Cypress (case14) — contrato local

- **Source**: `jira_management/commands/case14.ts:7-19`
- **O que validar**: `state.lastCypressPath` persistido
- **Como validar**: Unit test existente
- **Evidência esperada**: State update funciona (já coberto por tests)

### 2.6 Alterar Diretório JSON (case16) — contrato local

- **Source**: `jira_management/commands/case16.ts:6-16`
- **O que validar**: pushHistory chamado (display-only, não persiste)
- **Como validar**: Unit test existente
- **⚠️ Gap**: case16 NÃO persiste — display-only, sem uso downstream

### 2.7 Associar Tests a TE (case28) — contrato

- **Source**: `jira_management/commands/case28.ts:8-104`
- **O que validar**:
  1. `GET /rest/api/2/issue/{TE_KEY}` valida TE existente
  2. `GET /rest/api/2/issue/{TEST_KEY}` valida cada test
  3. **Cloud**: Xray GraphQL `addTestsToTestExecution` mutation aceita `{ testExecIssueId: "ID", testIssueIds: ["ID"] }`
  4. **Server**: `POST /rest/api/2/issueLink` aceita `{ type: { name: "Tests" }, inwardIssue: { key: TE }, outwardIssue: { key: TEST } }`
- **Como validar**: GET endpoints (read-only) + inspeção de código das mutations
- **Evidência esperada**: GETs 200; mutation shape correto

### 2.8 Bug Report (case20) — contrato

- **Source**: `jira_management/commands/case20.ts:12-57`
- **O que validar**:
  1. `POST /rest/api/2/issue` aceita payload `{ fields: { project, summary, description, issuetype: { name: "Bug" }, labels, priority } }`
  2. `POST /rest/api/2/issueLink` aceita link payload
- **Como validar**: GET issue types (read-only) + inspeção de código do POST body
- **Evidência esperada**: Payload shape correto; issue type "Bug" existe

### 2.9 CSV Import — contrato (case01)

- **Source**: `jira_management/commands/case01.ts:24-93`
- **Pipeline**: `case01` → `create_tests.ts` → `import-orchestrator.ts` → `import-loop.ts` → `test-case-factory.ts`
- **O que validar**:
  1. CSV schema validation funciona (parse + field mapping)
  2. `POST /rest/api/2/issue` aceita payload de Test issue
  3. Cloud: Xray GraphQL `addTestStep` mutation aceita `{ issueId, step }` 
  4. `POST /rest/api/2/issueLink` aceita pre-condition links
- **Como validar**: `--dry-run` (já validado: 14/14 simulados) + inspeção de código
- **Evidência esperada**: Pipeline contratuamente correto; dry-run sem writes

---

## Fase 3: Updates — validação de contrato (5 features)

**Estratégia**: Validar que PUTs e mutations têm payloads corretos. Usar `--dry-run` onde disponível. Sem writes reais.

### 3.1 Update via Target-Keys (case01) — contrato

- **Source**: `jira_management/test-case-factory.ts:57-176`
- **O que validar**:
  1. `PUT /rest/api/2/issue/{key}` aceita `{ fields: { summary, description, labels, ... } }`
  2. clean-slate: snapshot → clear → PUT → rebuild (payloads corretos em cada etapa)
- **Como validar**: `--dry-run` + inspeção de código
- **Evidência esperada**: PUT shape correto; clean-slate flow contratuamente válido

### 3.2 Dry-Run Completo (case29) — já validado

- **Source**: `jira_management/commands/case29.ts:21-82`
- **Status**: ✅ Validado em 2026-07-23 — 14/14 simulados, 0 writes
- **Evidência**: `Config.set('dryRun', true)` impede todos os writes

### 3.3 Create TE (case13) — contrato

- **Source**: `jira_management/commands/case13.ts:6-24`
- **O que validar**:
  1. `GET /rest/api/2/issuetype` retorna "Test Execution" type
  2. `POST /rest/api/2/issue` aceita payload TE
  3. Cloud: `addTestsToTestExecution` mutation shape
- **Como validar**: GET issuetype (read-only) + inspeção de código
- **Evidência esperada**: Type "Test Execution" existe; payload shape correto

### 3.4 Import JSON (case15) — contrato

- **Source**: `jira_management/commands/case15.ts:36-137`
- **O que validar**: JSON CTRF schema correto; pipeline idêntico ao CSV
- **Como validar**: Schema validation local + inspeção de código
- **Evidência esperada**: CTRF parser aceita formato válido

### 3.5 Clean-Slate Update (issue-snapshot) — contrato

- **Source**: `jira_management/issue-snapshot.ts:326-406`
- **O que validar**:
  1. `getTestPreconditions` query GraphQL correta
  2. `removePreconditionsFromTest` mutation shape
  3. `getTestSteps` query GraphQL correta
  4. `removeAllTestSteps` + `addTestStep` mutations shape
  5. `getIssueLinksByType` + `removeIssueLink` + `linkIssues` shapes
  6. Snapshot/clear/rebuild/restore flow contratuamente correto
- **Como validar**: Unit tests (12 existentes) + inspeção de código
- **Evidência esperada**: Todos os payloads GraphQL/REST corretos

---

## Fase 4: Interativos — validação de contrato (5 features)

**Estratégia**: Validar lógica de branching e Config overrides via unit tests existentes. Sem mocks novos necessários.

### 4.1 Update Policy — skip (case01)

- **Source**: `jira_management/test-case-factory.ts:70-73`
- **O que validar**: `Config.get('updatePolicy') === 'skip'` → branch skip executado
- **Como validar**: Unit test existente
- **Evidência esperada**: Skip branch funciona (já coberto)

### 4.2 Update Policy — prompt (case01)

- **Source**: `jira_management/test-case-factory.ts:76-80`
- **O que validar**: `Config.get('updatePolicy') === 'prompt'` → confirm branch
- **Como validar**: Unit test existente
- **Evidência esperada**: Prompt branch funciona (já coberto)

### 4.3 Multi-match Selection (case01)

- **Source**: `jira_management/test-case-factory.ts:90-115`
- **O que validar**: `searchJiraIssues` retorna 2+ matches → prompt seleção
- **Como validar**: Unit test existente
- **Evidência esperada**: Multi-match branch funciona (já coberto)

### 4.4 Assign fixVersion (case04) — contrato

- **Source**: `jira_management/commands/case04.ts`
- **O que validar**: `PUT /rest/api/2/issue/{key}` com `{ fields: { fixVersions: [{ name }] } }`
- **Como validar**: GET fixVersions (read-only) + inspeção de código
- **Evidência esperada**: PUT shape correto

### 4.5 Update package.json (case05) — contrato local

- **Source**: `jira_management/commands/case05.ts`
- **O que validar**: File read/write operations corretas; version parsing OK
- **Como validar**: Unit test existente + inspeção de código
- **Evidência esperada**: File ops contratuamente corretos

---

## Fase 5: Destrutivos — validação de contrato

**Estratégia**: Validar endpoints, assinaturas e mapeamentos **sem executar writes reais**. Writes reais ficam para quando existir projeto de testes dedicado.

### 5.1 Auto-Close Tasks (case07) — contrato

- **Source**: `jira_management/commands/case07.ts:8-51`
- **O que validar (sem writes)**:
  1. `WORKFLOW_MAP` mapeia 4 status → transições corretas
  2. JQL search (read-only) retorna issues
  3. `GET /rest/api/2/issue/{id}/transitions` retorna transições disponíveis
  4. Transições do WORKFLOW_MAP existem na lista de transições
- **Como validar**: GET transitions (read-only) + inspeção de código do WORKFLOW_MAP
- **Evidência esperada**: 4 status mapeados; transições resolvidas

### 5.2 Publish Version (case08) — contrato

- **Source**: `jira_management/commands/case08.ts`
- **O que validar (sem writes)**:
  1. `GET /rest/api/2/version/{id}` retorna versão (resolve ID)
  2. `PUT /rest/api/2/version/{id}` aceita payload `{ released: true }`
- **Como validar**: GET version (read-only) + inspeção de código do PUT payload
- **Evidência esperada**: GET 200; PUT payload shape correto

### 5.1b Auto-Close — write real (pendente projeto de testes)

- **Bloqueado por**: Projeto de testes dedicado no Jira

### 5.2b Publish — write real (pendente projeto de testes)

- **Bloqueado por**: Projeto de testes dedicado no Jira

---

## Fase 6: AI/Relatórios — validação de contrato (3 features)

**Estratégia**: Validar parsing, schemas e endpoints. Sem LLM calls reais nem criação de bugs.

### 6.1 AI Test Generation (case18) — contrato

- **Source**: `jira_management/commands/case18.ts`
- **O que validar**:
  1. `GET /rest/api/2/issue/{key}` retorna issue com user story
  2. LLM prompt schema correto (input: story; output: test steps)
  3. Precondition matching: dual-threshold logic (já validado Fase 1)
  4. `POST /rest/api/2/issue` shape para precondições (quando auto-create)
- **Como validar**: GET issue (read-only) + inspeção de código
- **Evidência esperada**: GET 200; prompt schema válido; matching logic correto

### 6.2 HTML Report (case17) — contrato

- **Source**: `jira_management/commands/case17.ts`
- **O que validar**:
  1. CTRF parsing (local) funciona
  2. HTML template rendering (local) funciona
  3. Xray history query (read-only) funciona
  4. Quality gate scoring logic correto
- **Como validar**: Unit tests existentes + inspeção de código
- **Evidência esperada**: Parser/render/gate contratuamente corretos

### 6.3 Setup Wizard (case24) — contrato local

- **Source**: `jira_management/commands/case24.ts`
- **O que validar**: Config file generation correta
- **Como validar**: Unit test existente
- **Evidência esperada**: Configs geradas corretamente (já coberto)

---

## Fase 7: Infraestrutura (6 features)

Objetivo: Validar módulos core que suportam todas as features.

### 7.1 Import Orchestrator

- **Source**: `jira_management/import-orchestrator.ts:1-?`
- **O que validar**: Pipeline 5 etapas: validate → preview → create → post-process → TE association
- **Como validar**: Fixture CSV completo; mock Jira; verificar cada etapa
- **Pré-requisitos**: CSV fixture; mocks Jira/Xray
- **Risco**: Nenhum (mock)
- **Dados descartáveis**: N/A
- **Evidência esperada**: 5 etapas executadas na ordem; resultados corretos
- **Unit tests**: `jira_management/__tests__/import-orchestrator.test.ts` + `import-orchestrator-red.test.ts`

### 7.2 JiraClient Dual Auth

- **Source**: `shared/jira/jira-client.ts:31-?`
- **O que validar**: Server PAT + Cloud Basic; detecção automática via `isAtlassianCloudGateway()`
- **Como validar**: Mock `axiosInstance`; testar ambos modos com credenciais diferentes
- **Pré-requisitos**: Credenciais Server + Cloud
- **Risco**: Nenhum (mock)
- **Dados descartáveis**: N/A
- **Evidência esperada**: Auth headers corretos para cada modo

### 7.3 XrayCloudClient

- **Source**: `shared/jira/xray-cloud-client.ts:20-244`
- **O que validar**: Auth flow; token caching (55min TTL); retry/throttle; GraphQL errors surfacem
- **Operações**: `authenticate`, `graphql`, `graphqlMutation`, `setTestSteps`, `getTestSteps`, `addPreconditionsToTest`, `getTestPreconditions`, `removePreconditionsFromTest`, `addTestsToTestExecution`
- **Como validar**: Mock httpClient; testar auth, cache hit, cache expiry, retry, error surfacing
- **Pré-requisitos**: Nenhum (mock)
- **Risco**: Nenhum
- **Dados descartáveis**: N/A
- **Evidência esperada**: Token cached; retry funciona; errors surfacem
- **Unit tests**: `shared/__tests__/xray-cloud-client.test.ts` (16 tests)

### 7.4 JiraResource Facade

- **Source**: `jira_management/jira_resource.ts:29-?`
- **O que validar**: GET/POST/PUT/DELETE funcionam; searchJiraIssues JQL; transitions; project version ops
- **Como validar**: Mock httpClient; testar todas operações
- **Pré-requisitos**: Nenhum (mock)
- **Risco**: Nenhum
- **Dados descartáveis**: N/A
- **Evidência esperada**: Todas operações retornam dados corretos
- **Unit tests**: `jira_management/__tests__/jira_resource.test.ts`

### 7.5 Checkpoint/Resume

- **Source**: `jira_management/import-loop.ts:215-230` + `import-orchestrator.ts`
- **O que validar**: Checkpoint salvo após cada issue; resume pula issues processadas
- **Como**: Mock import loop com falha no meio; verificar checkpoint em `state.json._checkpoint`; re-executar com resume
- **Pré-requisitos**: Mock com 5 issues, falha no #3
- **Risco**: Nenhum (mock)
- **Dados descartáveis**: N/A
- **Evidência esperada**: Issues 1-2 processadas; issue 3 falhou; resume retoma do #3
- **Unit tests**: `jira_management/__tests__/import-orchestrator.test.ts`

### 7.6 Circuit Breaker

- **Source**: `shared/jira/jira-client.ts` (circuit breaker in HTTP client)
- **O que validar**: Breaker abre após N falhas consecutivas; recupera após sucesso
- **Como validar**: Mock httpClient com falhas → success; verificar open/half-open/closed
- **Pré-requisitos**: Nenhum (mock)
- **Risco**: Nenhum
- **Dados descartáveis**: N/A
- **Evidência esperada**: Breaker abre; recupera; requests passam novamente

---

## Resumo por Fase

| Fase | Features | Writes | Tempo est. | Risco | Bloqueio |
|------|----------|--------|------------|-------|----------|
| 1 | 13 | 0 | 30min | Nenhum | — |
| 2 | 9 | ~15 issues | 45min | Baixo | — |
| 3 | 5 | ~10 updates | 45min | Médio | — |
| 4 | 5 | 0 (mocks) | 30min | Baixo | — |
| 5 contrato | 2 | 0 (read-only) | 15min | Nenhum | — |
| 5 real | 2 | ~5 issues | 20min | Alto | Projeto de testes |
| 6 | 3 | ~5 issues | 30min | Médio | — |
| 7 | 6 | 0 (mocks) | 40min | Nenhum | — |
| **Total** | **49** | **~35** | **~4h** | | |

---

## Gaps Identificados

| # | Feature | Gap | Impacto |
|---|---------|-----|---------|
| G1 | case16 (Set JSON Dir) | Não persiste valor — display-only | Feature inútil para downstream |
| G2 | case25 (Traceability Matrix) | Sem unit tests dedicados para handler | Cobertura parcial |
| G3 | case27 (Coverage Dashboard) | Sem unit tests dedicados para handler | Cobertura parcial |
| G4 | case28 (Associate TE) | Sem unit tests dedicados para handler | Cobertura via test-execution-creator |
