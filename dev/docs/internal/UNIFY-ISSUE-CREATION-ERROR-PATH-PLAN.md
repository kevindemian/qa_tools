# Unify Issue Creation Error Path — Single Tested, Deterministic, Human-Friendly Handler

**Status:** ACTIVE
**Author:** OpenCode Agent
**Date:** 2026-08-05
**Trigger:** User reported the manual (interactive) issue creation path is untested, full of traps, and the failure menu does not accept keyboard input. Confirmed `showStepError`/`buildInteractiveStepHandler` have zero test coverage.

---

## 1. Problem Statement

### 1.1 Reported bugs

1. Manual CSV issue creation shows a failure menu (skip/abort/retry/rollback) that **does not accept keyboard input**. Root cause: `ProgressBar` (`cli-progress`, `hideCursor: true`) is active when `@inquirer/select` renders — `cli-progress` steals terminal cursor control.
2. Errors are presented as **raw JSON dumps** (`JSON.stringify` of full Jira payload) labeled `Contexto:` — messy, polluted, unprofessional.

### 1.2 Root cause (confirmed)

Two parallel error-handling systems exist for the same feature (violates Rule 3 "duplicated logic", Rule 7 "system consistency"):

| | Deterministic (`--auto`) | Interactive (manual) |
|---|---|---|
| Handler | `buildAutoConfirmHandler` → `ON_ERROR` config → skip/abort | `buildInteractiveStepHandler` → `showStepError` → inquirer select (4 opts) |
| Transient | no handler → xray client auto-retry 3x then throw | `buildInteractiveTransientHandler` → inquirer select |
| Dependency | pure config | TTY + cursor + cli-progress + inquirer |
| Coverage | tested (`operation-executor.test.ts`, `xray-graphql-error-handling.test.ts`, `prompt-errors.test.ts`) | **zero** (no test references `error-report.ts`) |

### 1.3 Scope decision

- **This session:** issue creation flow (CSV/JSON) + shared `error-report.ts` (also consumed by `bug-report.ts:391` — Rule 7 system consistency).
- **Future sessions (registered, not executed today):** extend the same single-path architecture to ALL features (bug report, version management, case18/19/21/23, etc.). All features must have ONE tested, deterministic, robust, resilient, human-friendly error path.

---

## 2. Principle (agreed)

One single path: the existing **tested** deterministic handler (`buildAutoConfirmHandler` + `executeOperation`), made human-friendly. Eliminate the untested interactive duplication. No second path.

---

## 3. Changes

### 3.1 `shared/validation/config-schema.ts:158` — `ON_ERROR` 5 values

`['abort','skip','continue']` → `['abort','skip','continue','retry','rollback']`

| ON_ERROR | Decision | Behavior |
|---|---|---|
| `abort` | abort | stop import |
| `skip` / `continue` | skip | skip, continue |
| `retry` | retry | retry up to 3x → rollback (operation-executor:156) |
| `rollback` | rollback | restore previous state |

Recovery preserved via config — no capability loss. No second path.

### 3.2 `shared/ui/error-report.ts`

- `buildAutoConfirmHandler` maps all 5 values: `skip`/`continue` → `skip`, `abort` → `abort`, `retry` → `retry`, `rollback` → `rollback`.
- Handler renders a clean human-friendly error box (humanized message via `extractErrorMessage` + `humanizeError`) before deciding.
- `showStepError`: remove interactive `showSelect`; becomes pure render + decision via `ON_ERROR`. Keeps `bug-report.ts:391` consumer working deterministically.

### 3.3 `jira_management/import-orchestrator.ts`

- Delete `buildInteractiveStepHandler` (line 331) and `buildInteractiveTransientHandler` (line 317).
- `testCreationSetup` (lines 391-412): remove `isInteractive` and `isTTY` branches — always `buildAutoConfirmHandler()`.
- Transient errors: no handler → xray client embedded auto-retry 3x then throw (tested in `xray-graphql-error-handling.test.ts`).

### 3.4 `jira_management/test-case-factory.ts:308`

Remove `ProgressBar` from `_importStepsIndividually` (root of cursor conflict with inquirer; removes `░░░ 0%` output pollution). Use simple `info()` logging.

### 3.5 Human-friendly error presentation (6 locations)

Use tested `extractErrorMessage` + `humanizeError`; truncate `JSON.stringify`:

1. `shared/ui/error-report.ts:45` — summarized context, not full dump
2. `shared/ui/prompt-errors.ts:190` — truncated HTTP response
3. `shared/ui/prompt-format.ts:157-158` — truncated objects in table cells
4. `shared/jira/xray-cloud-client.ts:169` — concise log
5. `jira_management/commands/case18.ts:486` — per-test summary, not dump
6. `shared/llm/llm-fallback-http.ts:238` — clean fallback

### 3.6 Tests

- **New `shared/__tests__/error-report.test.ts`** (closes zero-coverage gap):
  - `buildAutoConfirmHandler` with all 5 `ON_ERROR` values
  - clean render (no raw JSON, no prompt)
  - `buildAutoRollbackHandler` (retry 3x → rollback)
- Update `import-orchestrator.test.ts` and `test-case-factory.test.ts` for new wiring.

---

## 4. Verification

- Full affected suite: `error-report`, `import-orchestrator`, `test-case-factory`, `import-loop`, `create_tests`, `operation-executor`, `prompt-errors`, `xray-graphql-error-handling`, `config-schema`.
- Real manual flow: create tests → error (e.g., 403) → clean box, decision via `ON_ERROR`.
