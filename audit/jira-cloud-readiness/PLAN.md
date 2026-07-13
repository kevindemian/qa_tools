# Jira Cloud Readiness — Implementation Plan

**Branch:** `feat/jira-cloud-readiness` (forked from `main` @ `df702ef4`)
**Mode:** build (implementation, not plan)
**Goal:** make `qa_tools` Jira/Xray integration 100% functional against **Jira Cloud** after the Server→Cloud migration.
**Go-live (per migration email):** 2026-07-13 (today).

## Context (authoritative evidence)

- Migration email: API gateway `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/...`, `Authorization: Bearer <TOKEN>` (service account). Cloud ID `a50cba0f-47dc-432a-a135-a2146d44b907`.
- Egress proxy mandatory in corp env: Zscaler `http://127.0.0.1:9000` (laptop/VDI) or `proxy.*.exch.int:8080` (on-prem). AWS/Azure Euronext VPC = no proxy.
- Field dump: **no `com.xpandit.plugins.xray:*` custom fields** present in the Cloud instance → Xray Server plugin model does not exist on Cloud. Epic Link = `customfield_10014` (same ID as tool's assumption — OK). Sprint = `customfield_10020` (`gh-sprint`) present.
- Decisions confirmed with user:
    - **Q1 = B**: Xray Cloud is a separate app (native relations / GraphQL), not Jira custom fields.
    - **Q2**: qa_tools is project-agnostic; operate on user-supplied project key(s). Dump was only a schema sample.
    - **Q3 = A**: gateway requires `Bearer`; tool's cloud `Basic` auth is wrong → **C-auth**.
    - **Q4**: egress proxy is mandatory → **C-proxy** (confirmed missing in `http-client.ts` / `tls.ts`).

## Gap model

| ID      | Gap                                                        | Root cause                                   | Fix location                                           |
| ------- | ---------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| C-proxy | No egress proxy support                                    | `http-client.ts` / `tls.ts` never set proxy  | `http-client.ts`, `config-schema.ts`, `jira-client.ts` |
| C-auth  | Gateway needs `Bearer`; cloud uses `Basic`                 | `jira-auth.ts` + `jira-client.ts`            | `jira-auth.ts`, `jira-client.ts`                       |
| C3      | `customfield_13708` hardcoded + Server custom-field model  | `precondition-importer.ts:40`                | `precondition-importer.ts`                             |
| C5      | `/rest/api/2/sprint/{id}/issue` (Server GreenHopper)       | `jira-resource-sprint.ts:29`                 | `jira-resource-sprint.ts`, `jira-client.ts`            |
| C4      | Coverage reads Server `steps` field (absent on Cloud)      | `coverage.ts:27`                             | `coverage.ts`                                          |
| C1/C2   | `testexec-tests-custom-field` (Server) for TE↔Test         | `test-execution-creator.ts:122-131,206-212`  | `test-execution-creator.ts`                            |
| C0      | Execution result import (PASS/FAIL→Xray) never implemented | `result_reporter.ts` only creates TE + links | `result_reporter.ts`, `xray-cloud-client.ts`           |

## Implementation strategy (root-cause, no workaround)

1. **C-proxy**: `createHttpClient` accepts `proxyUrl`; parse to axios `proxy` config; honor `HTTPS_PROXY`/`HTTP_PROXY` env fallback. Invalid URL → throw (fail-loud). New config key `proxyUrl` (`QA_PROXY_URL`).
2. **C-auth**: `createJiraAuthHeader(token, mode, scheme?)` with `'auto'|'bearer'|'basic'`; `isAtlassianCloudGateway(url)` detects `api.atlassian.com/ex/jira/`. `JiraClient` uses `bearer` scheme when gateway detected. Smoke test updated to assert gateway→Bearer.
3. **C3**: `PreconditionHandler` mode-aware. Cloud → associate via Jira issue link type `Pre-Condition` (native, Xray-Cloud-compatible), not custom field. Server → unchanged custom-field path. Hardcoded `13708` fallback removed for cloud; explicit error if link manager missing in cloud.
4. **C5**: `addTasksToSprint` cloud-aware. Cloud → `POST {apiRoot}/rest/agile/1.0/sprint/{id}/issue` (via new optional `postToApiRoot` on `JiraClient`). Server → unchanged GreenHopper path.
5. **C4**: `analyzeCoverage` cloud-aware. Cloud → query Xray Cloud `test(id){steps}` via `XrayCloudClient`; if unavailable, explicit log + unmapped (never silent).
6. **C1/C2**: `test-execution-creator` cloud-aware. Cloud → skip Server custom-field lookup/PUT; associate via `Tests` issue links only (native on Cloud). Server → unchanged.
7. **C0**: New `ResultImporter` with server (`/rest/raven/1.0/import/execution/json`) and cloud (`/api/v2/import/execution/json` via `XrayCloudClient`) paths. `result_reporter.createTestExecutionFromResults` calls it after TE creation (cloud mode for migration target). Fails loud on import error.

## Tests (all new gaps; negative + edge cases prioritized)

- `http-client.test.ts`: proxy config applied; invalid proxy throws; env fallback.
- `jira-auth.test.ts`: gateway detection; scheme resolution.
- `precondition-importer.test.ts`: cloud uses link, not custom field; server uses field.
- `jira-resource-sprint.test.ts`: cloud→agile endpoint; server→GreenHopper.
- `coverage.test.ts`: cloud step query path; missing Xray → explicit unmapped.
- `test-execution-creator.test.ts`: cloud skips custom field, links only.
- `xray-cloud-client.test.ts` / `result_reporter.test.ts`: import execution success + failure (fail-loud).

## e2e smoke

- Extend `e2e/smoke-jira-cloud.test.ts` (gateway→Bearer, proxy config) and `e2e/smoke-xray-cloud.test.ts` (import + cloud links) using existing `it.runIf` env-gated pattern (NOT `.skip`).

## Definition of done

- `npx tsc --noEmit` clean.
- `npx vitest run` all green (incl. new tests).
- `npm run lint` clean.
- Push via `gh` (timeout ≥300s); monitor CI on `main` with `GITHUB_TOKEN` (Bearer).

## Out of scope / requires live confirmation (Fase B, user-supplied creds)

- Live execution against `a50cba0f…` with real Bearer token + proxy.
- Confirmation that the chosen project key exposes Xray Cloud Test/Test Execution/Precondition issue types.
- Xray Cloud GraphQL `test(id){steps}` and `import/execution/json` exact response shapes (implemented against documented contracts; fail-loud if divergent).
