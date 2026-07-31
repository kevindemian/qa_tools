# Universal Operation Executor — Zero Silent Failure in Jira Writes

**Status:** ACTIVE
**Author:** OpenCode Agent
**Date:** 2026-07-31
**Trigger:** User reported a test case was created WITHOUT steps and no error/warning was shown during creation.

---

## 1. Problem Statement

### 1.1 Reported bug

A test case was created in Jira **without its steps**, and the tool reported it as `ok` with no warning/error.

### 1.2 Root cause chain (confirmed)

1. `_importStepsIndividually` (`jira_management/test-case-factory.ts:285-304`): if `importStep` fails and user/auto picks `skip`, the step is **silently skipped**. If ALL steps fail → `abortSteps` stays `false` → returns `null` (no error marker).
2. `linkTestRelations` (`jira_management/import-loop.ts:124-128`): `stepsResult === null` → not `abort` → `errored` stays `false` → test reported **`ok`** (`import-loop.ts:418`).
3. `createIssueForTest` (`jira_management/import-loop.ts:94`): `action === 'retry'` → `return null` → `processCreationAndLinking` line 443 treats it as `'continue'` → **retry chosen by the user is silently discarded** (issue neither created nor reported).

### 1.3 Structural defect

Two parallel error-handling systems exist (violates Rule 3 "duplicated logic", Rule 7 "system consistency"):

| | Create flow | Update flow (clean-slate) |
|---|---|---|
| Handler | `onError` (prompt-errors.ts) — retry/skip/abort/details, readline | `StepFailureHandler` + `showStepError` (error-report.ts) — skip/abort/retry/rollback, inquirer |
| Auto/CI | `handleAutoConfirm` (config `onError`) | `buildAutoRollbackHandler` (TTY detect) |
| Transient retry | POST never retried (http-client.ts:168: GET/PUT only) | embedded in XrayCloudClient |

Worst: the orchestrator **already** wires `factory.setStepFailureHandler(...)` (`import-orchestrator.ts:389-394`), but `_importStepsIndividually`/`_replaceSteps` **ignore it** and use `onError`. Handler connected and unused.

### 1.4 Scope decision

- **Universal in design:** one primitive (`executeOperation`) importable by any feature from `shared/`.
- **Adopted this session:** test import flow (CREATE + UPDATE clean-slate + issue-linker) + `bug-report.ts`.
- **Deferred (infrastructure ready, adoption in future sessions):** case04 (sprint/fixVersion), case17 (auto-bug CI), version/sprint low-level ops. These features must define their own rollback semantics before adopting; forcing them now would be an artificial workaround.

---

## 2. Architecture

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│  Feature callers                                     │
│  CREATE: steps, replaceSteps, createIssue            │
│  UPDATE: cleanSlateUpdate (clear+rebuild phases)     │
│  linker: preconditions, linkedIssues, cross-ref      │
│  bug-report: createBugIssue                          │
├─────────────────────────────────────────────────────┤
│  executeOperation (shared/ui/operation-executor.ts)  │
│  run → transient? auto-retry(3x, backoff)            │
│      → persistent? onFailure(err, stepInfo)          │
│      → retry | skip | abort | rollback               │
├─────────────────────────────────────────────────────┤
│  Decision UI (shared/ui/error-report.ts)             │
│  showStepError (interactive) / buildAutoRollback     │
├─────────────────────────────────────────────────────┤
│  Shared helpers                                      │
│  isTransientError (dedup from issue-snapshot +       │
│  xray-cloud-client)                                  │
└─────────────────────────────────────────────────────┘
```

### 2.2 New primitive — `shared/ui/operation-executor.ts`

```ts
export interface OperationContext {
    label: string;            // "Step 2 de \"Test\"", "Criar issue ..."
    step: string;             // step identifier
    totalSteps: number;
    completedSteps: StepResult[];
    currentInput?: unknown;
}

export interface OperationOutcome {
    ok: boolean;
    decision?: 'skip' | 'abort' | 'retry' | 'rollback';
    attempts: number;
    error?: Error;
}

export function executeOperation(opts: {
    run: () => Promise<void>;
    ctx: OperationContext;
    onFailure?: StepFailureHandler;      // absent → default rollback
    maxTransientRetries?: number;        // default 3
    isTransient?: (err: unknown) => boolean;
    onRollback?: () => Promise<void>;    // UPDATE: restore snapshot; CREATE: delete issue
    onSkip?: () => void;                 // register skip for counting
}): Promise<OperationOutcome>;
```

Flow: `run` → transient error? auto-retry 3x (exponential backoff, log each attempt) → persistent failure → `onFailure(error, stepInfo)` → `retry` (re-execute, bounded loop) / `skip` (call `onSkip`) / `abort` / `rollback` (call `onRollback`).

### 2.3 `isTransientError` — shared helper (dedup)

Currently duplicated 4x: `issue-snapshot.ts:98,135`, `xray-cloud-client.ts:75,148`. Extract to `shared/infra/transient-error.ts` (or export from operation-executor) with the union of all predicates:
- Codes: `ECONNRESET, ECONNREFUSED, ETIMEDOUT, EINVAL, EAI_AGAIN, ECONNABORTED`
- Message: `/read EINVAL|ECONNRESET/i`
- HTTP: 429, 5xx

---

## 3. Tasks

### T1 — Create `shared/ui/operation-executor.ts` (RED test first)

**Obligations:**
- `executeOperation` per §2.2.
- Auto-retry transient (3x, exponential backoff + jitter), logging each attempt.
- On persistent failure: no handler → default rollback; handler → decision dispatch (retry/skip/abort/rollback).
- Bounded retry loop for `retry` decisions.
- `OperationOutcome` with `attempts`.

**Tests (new):**
- transient error retried 3x then handler called
- non-transient error → handler called immediately
- `retry` decision re-executes `run`
- `skip` decision calls `onSkip` and returns `{ok:false, decision:'skip'}`
- `abort` decision returns `{ok:false, decision:'abort'}`
- `rollback` decision calls `onRollback`
- no handler → default rollback called
- success path → `{ok:true, attempts:1}`

**Verification:** `npx vitest run shared/ui/__tests__/operation-executor.test.ts`

### T2 — Refactor `cleanSlateUpdate` to use `executeOperation` (UPDATE)

**Obligations:**
- Replace duplicated retry/decision loops at `issue-snapshot.ts:635-686` (clear) and `717-766` (rebuild).
- `onRollback` → `restoreStepSnapshot`.
- Preserve `StepResult` output shape and decision semantics exactly (Rule 10 equivalence).
- Remove internal `handleStepFailure`.

**Verification:** existing suites stay green:
`issue-snapshot.test.ts`, `clean-slate-edge.test.ts`, `clean-slate-integration.test.ts`, `clean-slate-pbt.test.ts`, `issue-snapshot-cleanslate-red.test.ts`, `test-case-factory-cleanslate-red.test.ts`.

### T3 — CREATE steps never silent (test-case-factory.ts)

**Obligations:**
- `StepsResult` → `{ action?: 'abort' | 'rollback'; failedSteps: number; totalSteps: number }`.
- `_importStepsIndividually`: each step via `executeOperation` using `this._stepFailureHandler` (not `onError`). `onSkip` → `failedSteps++`. Returns `{ action:'abort'|'rollback' }` on abort, else `{ failedSteps, totalSteps }` (never `null` on failure).
- `_replaceSteps`: same; `setSteps` via `executeOperation`.
- `postSteps` propagates new shape.

**Tests (RED first):**
- step fails + skip → `{ failedSteps: 1, totalSteps: 2 }` (today `toBeNull()` at `test-case-factory.test.ts:496` codifies the bug — correct expectation per Rule 20)
- all steps fail → `{ failedSteps: N, totalSteps: N }`
- manual retry re-executes step
- auto transient retry 3x with backoff
- `_replaceSteps` fails + skip → `{ failedSteps: 1 }`

**Verification:** `npx vitest run jira_management/__tests__/test-case-factory.test.ts`

### T4 — `import-loop.ts`: propagate error + real retry

**Obligations:**
- `linkTestRelations` (line 124): `stepsResult.failedSteps > 0` → `errored = true` + `results.push({ status:'error', label: testTitle, message: 'Issue criada sem X/N steps' })`. Test NEVER `ok` with missing steps.
- Abort/rollback → `rollbackCreatedIssue`.
- `createIssueForTest` (line 88-97): real retry loop — `action === 'retry'` re-invokes `factory.createIssue` (max 3). After exhaustion → `results.push({ status:'error', message: 'Falha na criação (após N tentativas)' })`. Never returns `null`.

**Tests (RED first):**
- `action:'retry'` → `factory.createIssue` re-invoked; after exhaustion → result `status:'error'`
- steps failed → test `status:'error'` with "Issue criada sem X/N steps"

**Verification:** `npx vitest run jira_management/__tests__/import-loop.test.ts`

### T5 — `issue-linker.ts` migrates `onError` → executor

**Obligations:**
- `associatePrecondition` (line 148), `linkIssues` (line 196), cross-ref (line 99): replace `onError` with `executeOperation`.
- Handler source: factory/orchestrator-provided `StepFailureHandler`.
- `rollback` for links → treat as abort (propagate `failedLinkKeys`).

**Verification:** `npx vitest run jira_management/__tests__/issue-linker.test.ts` (if exists) + affected import tests.

### T6 — `createIssue` POST via executor (test-case-factory.ts:261-272)

**Obligations:**
- POST wrapped in `executeOperation` with transient retry + handler.
- Preserve `{ action }` return shape for `createIssueForTest` compatibility.

**Verification:** existing `test-case-factory.test.ts` CreateIssue suite stays green.

### T7 — `bug-report.ts` adopts executor

**Obligations:**
- `bug-report.ts:360` `postJiraResource('issue', { fields })` wrapped in `executeOperation`.
- Show `showStepError` on persistent failure (interactive) / auto-rollback (CI).

**Verification:** `npx vitest run shared/__tests__/bug-report.test.ts` (if exists) + affected suites.

---

## 4. Acceptance Criteria

1. Test with failing steps + skip is reported `status:'error'` with message "Issue criada sem X/N steps" — never `ok`.
2. `action === 'retry'` in `createIssueForTest` actually re-invokes creation (no silent discard).
3. `executeOperation` is importable from `shared/` by any feature (universal design).
4. `cleanSlateUpdate` behavior unchanged (Rule 10) — all existing clean-slate suites green.
5. `isTransientError` deduplicated (no 4x copy).
6. `npx tsc --noEmit` clean.
7. `npm run lint` passes.

---

## 5. Contract Changes (authorized by explicit requirement §1/§6)

- `StepsResult` shape (new fields `failedSteps`, `totalSteps`).
- `postSteps`/`linkTestRelations` semantics (failure → error, never ok).
- `_importStepsIndividually`/`_replaceSteps` use `StepFailureHandler` instead of `onError`.
- `cleanSlateUpdate` refactored (behavior identical, proof = existing tests).

---

## 6. Verification Checklist

- [ ] `npx vitest run jira_management/__tests__/test-case-factory.test.ts`
- [ ] `npx vitest run jira_management/__tests__/import-loop.test.ts`
- [ ] `npx vitest run jira_management/__tests__/issue-snapshot.test.ts jira_management/__tests__/clean-slate-edge.test.ts jira_management/__tests__/clean-slate-integration.test.ts jira_management/__tests__/clean-slate-pbt.test.ts jira_management/__tests__/issue-snapshot-cleanslate-red.test.ts jira_management/__tests__/test-case-factory-cleanslate-red.test.ts`
- [ ] `npx vitest run shared/ui/__tests__/operation-executor.test.ts`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
