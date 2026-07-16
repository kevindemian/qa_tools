# Test Execution → Test Association Defect (Xray Cloud) — RESOLVIDO

**Date:** 2026-07-16
**Author:** QA Tools audit (adversarial import + association review)
**Status:** FIXED — 2026-07-16. Código de produção corrigido e coberto por testes de fronteira (nock em cliente Xray Cloud real).
**Severity:** HIGH (tests added to a Test Execution appeared as *linked issues*, not as *Tests* of the execution — execution was unusable for Xray reporting in Cloud mode).
**Mode affected:** Xray **Cloud** only. Server mode was correct.
**Related:** `jira_management/test-execution-creator.ts`; `jira_management/result_reporter.ts`; `shared/xray-cloud-client.ts`.

---

## 1. Symptom (reported by user)

When a Test Execution is created (menu `Geração de Casos de Teste` → case01, or result import) in **Xray Cloud**, the tests were attached to the Test Execution as **issue links of type "Tests"**. They showed up under the issue's *Linked Issues*, but the Test Execution's **Tests** section was empty. The execution could not be used for Xray Cloud test reporting.

Confirmed affected executions generated this session:
- `ECSPOL-1555` (suite `TEST_SUIT`, linked `ECSPOL-1162`)
- `ECSPOL-1561` (suite `US-ECSPOL-1163`, linked `ECSPOL-1163`)
- `ECSPOL-1567` (suite `US-ECSPOL-1164`, linked `ECSPOL-1164`)
- `ECSPOL-…` (suite `US-ECSPOL-1437`, linked `ECSPOL-1164`)

> Reparo das execuções já afetadas: FORA DE ESCOPO (exigiria autorização explícita; não implementado).

---

## 2. Root Cause

In Xray Cloud, a Test is associated to a Test Execution via the **native Xray mechanism** (GraphQL mutation `addTestsToTestExecution`, or the raven REST import). A plain Jira **issue link** of type "Tests" between the Test and the Test Execution does **NOT** create that native relationship — it only creates a Jira issue link.

The codebase associated tests to the TE **only** through Jira issue links, in **two** production call sites:

1. `jira_management/test-execution-creator.ts` — `_linkTestsToExecution` (shared by `createWithLinks` and `addTestsToExistingExecution`):
   ```ts
   await this.linkManager.createIssueLink(key, teKey, 'Tests');
   ```
2. `jira_management/result_reporter.ts` — `linkTestsToTe`:
   ```ts
   await linkManager.createIssueLink(m.key, te.key, 'Tests');
   ```

Both resolved to a standard Jira REST issue link. In Cloud mode this was the wrong mechanism.

### 2.1 Missing native Cloud client method

`shared/xray-cloud-client.ts` exposed only `authenticate`, `graphql`, `graphqlMutation`, `addPreconditionsToTest`. There was **NO** `addTestsToTestExecution` method anywhere in the codebase.

### 2.2 Server mode is correct

- `create` on Server sets the Xray custom field `com.xpandit.plugins.xray:testexec-tests-custom-field` from `testKeys` (native Server association).
- `addTestsToExistingExecution` on Server reads/merges that custom field via `putJiraResource`. Correct.
- On Cloud, `_resolveTestField` returns `null`, so `create` produced an **empty** TE, and the only follow-up was the non-native issue link.

### 2.3 Incorrect comment (misleading)

`test-execution-creator.ts` previously logged `Cloud mode: associando testes à TE via issue links (Xray Cloud nativo).` — false. Removed/corrigido.

---

## 3. Fix implemented (2026-07-16)

### 3.1 Native Cloud association method
In `shared/xray-cloud-client.ts`, added `addTestsToTestExecution(testExecutionIssueId, testIssueIds, clientId, clientSecret)` (mirrors `addPreconditionsToTest`), calling the GraphQL mutation `addTestsToTestExecution` with **numeric** issue ids and returning the count of associated tests.

### 3.2 `TestExecutionCreator` Cloud path
- `_linkTestsToExecution`: when `_isCloud()`, resolves numeric ids (`_resolveNumericId`) and calls `addTestsToTestExecution` (native). Server path unchanged (issue link `'Tests'`).
- `addTestsToExistingExecution`: Cloud branch now uses the native GraphQL association (comment corrigido para "via Xray Cloud nativo (GraphQL addTestsToTestExecution)").

### 3.3 `linkTestsToTe`
`result_reporter.ts`: in Cloud mode, resolves numeric ids and calls `addTestsToTestExecution`. Server mode keeps the custom-field/issue-link behavior. Errors explicit (never silent).

### 3.4 Safety properties preserved
- Cloud requires `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET` (throws explicit if missing).
- Numeric id resolution failures are explicit (warn + counted as failed).
- Server behavior unchanged (validated by `result_reporter.test.ts` and `test-execution-creator.test.ts` server-oriented assertions).

---

## 4. Test strategy (aplicada — sem mock de lógica interna)

A nova diretriz do projeto proíbe mockar lógica/serviços internos; apenas a fronteira externa (HTTP) é mockada via **nock** contra o `XrayCloudClient` real.

- `shared/xray-cloud-client.test.ts`: describe `AddTestsToTestExecution` (guards + nome da mutation + variáveis).
- `jira_management/test-execution-creator-cloud.test.ts`: Cloud real (`new XrayCloudClient()`) + nock em `authenticate`/`graphql`; asserta que `addTestsToTestExecution` é chamado com ids numéricos (`testExecIssueId:'100'`, `testIssueIds:['200','201']`) e que `createIssueLink(...,'Tests')` **não** é chamado.
- `jira_management/result_reporter-cloud.test.ts`: mesmo padrão para `linkTestsToTe` (skipped tests excluídos).

Esses testes, ao baterem na fronteira HTTP real, capturaram 3 bugs reais de implementação que mocks internos teriam escondido:
1. import `default` errado de `XrayCloudClient` (é named export) → `new XrayCloudClient()` quebrava.
2. chamada `new XrayCloudClient(clientId, clientSecret)` — 1º arg é `baseUrl`, não clientId → URL inválida.
3. `addTestsToTestExecution` retornava `void`; caller lia `result.associatedTestCount` → `undefined` → falha silenciosa.

---

## 5. Status

- [x] Symptom confirmed
- [x] Root cause identified
- [x] Audit scope verified
- [x] Fix authorized (user directive: corrigir bug HIGH Cloud)
- [x] Fix implemented
- [x] Tests de fronteira (nock) green
- [ ] Affected executions repaired — **fora de escopo** (exigiria autorização explícita)
