# Clean-Slate Tracing + Interactive Error Handler

**Status:** ACTIVE
**Author:** OpenCode Agent
**Date:** 2026-07-28
**Trigger:** ECSPOL-511/428 re-import revealed 3 bugs in clean-slate update — steps, preconditions, and linked issues silently lost during update

---

## 1. Problem Statement

The clean-slate update pipeline (`cleanSlateUpdate` in `issue-snapshot.ts`) had three bugs:

1. **Steps/preconditions/linkedIssues extracted from Jira API payload** (`testData`) instead of the `TestCase` object — payload doesn't contain them, so they were always `[]`
2. **`clearLinks` only cleared types in the default list** — missed `Test` (singular) vs `Tests` (plural) typo, plus custom types like `Pre-Condition`
3. **Link removal errors silently swallowed** — `catch` without re-throw masked failures

After fixes (TDD, all 788 tests green), ECSPOL-511 re-import showed **duplicate linked issues** — old ECSPOL-960 link persisted alongside new ECSPOL-511 link. Root cause: `Test` type not in `clearLinks` list.

**Secondary problem:** When clean-slate steps fail (rate limits, network, API errors), the system either:
- Silently continues (skip) — creates incomplete state, violates Rule 25
- Throws and rolls back everything — loses valid work from other steps

**No tracing exists** — sub-functions (`clearDescription`, `clearSteps`, `clearPreconditions`, `clearLinks`, `rebuildDescription`, `rebuildSteps`, `rebuildPreconditions`, `rebuildLinks`) have zero logging of inputs/outputs.

---

## 2. Architecture

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│  User-facing layer (UI)                             │
│  spinner → step name → ✓ done / ⚠ failed           │
│  showStepError() → skip(⚠) | abort | retry | rollback│
├─────────────────────────────────────────────────────┤
│  Structured tracing (rootLogger.info)               │
│  input: {field: value} → output: {result}           │
│  Always to file, console in normal mode              │
├─────────────────────────────────────────────────────┤
│  StepResult type                                    │
│  {ok: true, detail} | {ok: false, error, ctx}       │
├─────────────────────────────────────────────────────┤
│  SnapshotContext (partial snapshots per step)        │
│  stepSnapshots: Map<string, IssueFieldSnapshot>      │
└─────────────────────────────────────────────────────┘
```

### 2.2 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auto mode behavior | Retry 3x → interactive prompt (if TTY) | Skip creates incomplete state; user should always decide |
| CI/CD fallback (no TTY) | Retry 3x → rollback etapa → throw | Atomic consistency; no human to prompt |
| Granularity | 8 independent steps | Each step is atomic; failure in one doesn't kill others |
| Skip option | Kept with explicit warning | User informed of incomplete state risk; chooses anyway |
| Rollback scope | Per-step (not global) | Preserves valid work from other steps |
| Error display | Full error + context + input + previous results | Rule 25: zero silent errors; user needs data to decide |
| `--auto` meaning | Controls confirmations only, not error handling | Errors always need human decision (TTY) or automated rollback (CI) |

---

## 3. Types

### `shared/types/clean-slate.ts`

```ts
/** Result of a single clean-slate step */
type StepResult = {
  ok: boolean;
  step: string;           // "clear-links"
  detail: string;         // "1 link removed (ECSPOL-960 via Test)"
  error?: string;         // "HTTP 429 — Rate limit exceeded"
  context?: {
    issueKey: string;
    input: unknown;
    attempts: number;
  };
  duration: number;       // ms
  decision?: 'skip' | 'abort' | 'retry' | 'rollback';
}

/** Context passed to error handler for informed decision */
type StepInfo = {
  step: string;
  totalSteps: number;
  completedSteps: StepResult[];
  currentInput: unknown;
}

/** Partial snapshot for per-step rollback */
type SnapshotPartial = {
  step: string;
  snapshot: IssueFieldSnapshot;
}

/** Function that decides what to do when a step fails */
type StepFailureHandler = (
  error: Error,
  stepInfo: StepInfo,
) => Promise<'skip' | 'abort' | 'retry' | 'rollback'>;
```

---

## 4. Components

### 4.1 `shared/ui/step-reporter.ts` (NEW)

Wraps each step with spinner + tracing + error display.

```ts
async function runStep<T>(
  name: string,
  fn: () => Promise<T>,
  opts?: { quiet?: boolean; tty?: boolean },
): Promise<StepResult & { data?: T }>
```

- TTY mode: spinner → `✓ done` / `⚠ failed`
- CI mode: no spinner, structured log only
- Always records duration

### 4.2 `shared/ui/error-report.ts` (NEW)

Renders complete error information for informed user decision.

```ts
async function showStepError(
  error: Error,
  stepInfo: StepInfo,
  handler: StepFailureHandler,
): Promise<'skip' | 'abort' | 'retry' | 'rollback'>
```

Output format:
```
┌─ {step} falhou após {attempts} tentativas ─────────────┐
│ Erro: {error.message}                                  │
│ Contexto: {context.description}                        │
│ Input: {JSON(context.input)}                           │
│ Tentativas: {attempts}/3 (backoff: 1s, 2s, 4s)        │
│                                                        │
│ Etapas anteriores:                                     │
│   ✓ {step1} — {detail} ({duration}ms)                  │
│   ✓ {step2} — {detail} ({duration}ms)                  │
│   ✗ {step} — {error}                                   │
│                                                        │
│ ⚠ skip: criará estado incompleto                       │
│  [skip ⚠] [abort] [retry] [rollback]                  │
└────────────────────────────────────────────────────────┘
```

### 4.3 `jira_management/issue-snapshot.ts` (MODIFY)

Each sub-function changes signature:

| Before | After |
|--------|-------|
| `async function clearDescription(...): Promise<void>` | `async function clearDescription(...): Promise<StepResult>` |
| `async function clearSteps(...): Promise<void>` | `async function clearSteps(...): Promise<StepResult>` |
| `async function clearPreconditions(...): Promise<void>` | `async function clearPreconditions(...): Promise<StepResult>` |
| `async function clearLinks(...): Promise<void>` | `async function clearLinks(...): Promise<StepResult>` |
| `async function rebuildDescription(...): Promise<void>` | `async function rebuildDescription(...): Promise<StepResult>` |
| `async function rebuildSteps(...): Promise<void>` | `async function rebuildSteps(...): Promise<StepResult>` |
| `async function rebuildPreconditions(...): Promise<void>` | `async function rebuildPreconditions(...): Promise<StepResult>` |
| `async function rebuildLinks(...): Promise<void>` | `async function rebuildLinks(...): Promise<StepResult>` |

**SnapshotContext extended:**

```ts
interface SnapshotContext {
  // ... existing fields
  stepSnapshots: Map<string, IssueFieldSnapshot>;  // NEW: per-step snapshots
}
```

**`clearIssueFields` and `rebuildIssueFields`** change from `Promise<void>` to `Promise<StepResult[]>` — collect results, don't throw.

**`cleanSlateUpdate`** receives `onStepFailure?: StepFailureHandler`:

```ts
async function cleanSlateUpdate(
  ctx: SnapshotContext,
  issueKey: string,
  basicFields: Record<string, unknown>,
  rebuildData: { description, steps, preconditions, linkedIssues },
  opts: CleanSlateUpdateOptions & {
    onStepFailure?: StepFailureHandler;
  },
): Promise<{ success: boolean; restored: boolean; stepResults: StepResult[] }>
```

### 4.4 `jira_management/test-case-factory.ts` (MODIFY)

`_doUpdate` injects handler based on TTY + autoConfirm:

```ts
// Determine failure handler
let onStepFailure: StepFailureHandler | undefined;
if (isTTY()) {
  // Interactive mode: always prompt user
  onStepFailure = buildInteractiveStepHandler();
} else {
  // CI mode: auto-rollback
  onStepFailure = buildAutoRollbackHandler();
}
```

### 4.5 `jira_management/import-orchestrator.ts` (MODIFY)

**`buildInteractiveStepHandler`** (replaces `buildInteractiveTransientHandler`):

```ts
function buildInteractiveStepHandler(): StepFailureHandler {
  return async (error, stepInfo) => {
    return showStepError(error, stepInfo, async () => {
      // user picks from select menu
    });
  };
}
```

**`buildAutoRollbackHandler`** (new):

```ts
function buildAutoRollbackHandler(): StepFailureHandler {
  return async (error, stepInfo) => {
    rootLogger.warn(`[${stepInfo.step}] auto-rollback: ${error.message}`);
    return 'rollback';
  };
}
```

---

## 5. Flow

```
_doUpdate(key, testData, test, label)
│
├─ Determine onStepFailure (TTY-aware)
│
└─ cleanSlateUpdate(ctx, key, fields, rebuildData, {onStepFailure})
   │
   ├─ SNAPSHOT: snapshotIssueState(ctx, key, activeLinkTypes)
   │
   ├─ ETAPA 1: clearDescription
   │  ├─ snapshot parcial → ctx.stepSnapshots
   │  ├─ PUT null
   │  ├─ StepResult {ok: true, detail, duration}
   │  └─ spinner: ✓ description
   │
   ├─ ETAPA 2: clearSteps
   │  ├─ snapshot parcial
   │  ├─ removeAllTestSteps
   │  ├─ StepResult {ok: true, detail, duration}
   │  └─ spinner: ✓ steps (N removed)
   │
   ├─ ETAPA 3: clearPreconditions
   │  ├─ snapshot parcial
   │  ├─ fetch + remove
   │  ├─ StepResult {ok: true, detail, duration}
   │  └─ spinner: ✓ preconditions (N removed)
   │
   ├─ ETAPA 4: clearLinks
   │  ├─ snapshot parcial
   │  ├─ fetch ALL types + remove
   │  ├─ ON FAILURE:
   │  │  ├─ StepResult {ok: false, error, context, attempts}
   │  │  ├─ onStepFailure(error, stepInfo)
   │  │  │  ├─ SKIP: log warn + decision recorded
   │  │  │  ├─ ABORT: throw
   │  │  │  ├─ RETRY: goto ETAPA 4 (max 3x)
   │  │  │  └─ ROLLBACK: restoreStepSnapshot(ctx, key, "clear-links")
   │  │  └─ StepResult updated with decision
   │  └─ spinner: ✓ links or ⚠ links: {decision}
   │
   ├─ PUT basicFields
   │
   ├─ ETAPA 5-8: rebuild (same pattern)
   │
   └─ return {success, restored, stepResults}
```

---

## 6. Comportamento por Contexto

| Contexto | Retry | Após falha | Menu |
|----------|-------|------------|------|
| TTY + interativo | 3x auto-retry | Prompt com erro + contexto | skip(⚠)/abort/retry/rollback |
| TTY + `--auto` | 3x auto-retry | Prompt com erro + contexto | skip(⚠)/abort/retry/rollback |
| Sem TTY (CI/CD) | 3x auto-retry | Rollback etapa → throw | N/A (automático) |

---

## 7. Test Strategy

**Priority order:**
1. **Integration tests** — real function chains, mocked external boundaries only
2. **Edge cases** — empty inputs, null values, single-step failures
3. **Negative cases** — API errors, partial failures, rollback scenarios
4. **PBT** — StepResult invariants, snapshot consistency

**Mock boundaries (allowed):**
- Jira API (HTTP calls)
- Xray Cloud API (GraphQL)
- Filesystem (config, cache)

**Never mock:**
- `cleanSlateUpdate` internal logic
- `StepResult` construction
- `clearIssueFields` / `rebuildIssueFields` flow
- `SnapshotContext` management

**Test files:**
| File | Tests | Focus |
|------|-------|-------|
| `shared/__tests__/step-reporter.test.ts` | ~8 | runStep: success, failure, duration, CI mode |
| `shared/__tests__/error-report.test.ts` | ~6 | showStepError: renders context, handles abort/retry/rollback |
| `jira_management/__tests__/issue-snapshot-stepresults.test.ts` | ~12 | 8 sub-functions return StepResult; clearIssueFields collects; rebuildIssueFields collects |
| `jira_management/__tests__/clean-slate-integration.test.ts` | ~10 | Full pipeline: all pass, one fails, multiple fail, rollback |
| `jira_management/__tests__/clean-slate-edge.test.ts` | ~8 | Empty steps, empty links, null description, single field |
| `jira_management/__tests__/clean-slate-rollback.test.ts` | ~6 | Per-step rollback, partial rollback, rollback failure |
| `jira_management/__tests__/clean-slate-pbt.test.ts` | ~4 | StepResult invariants, snapshot consistency properties |

---

## 8. Implementation Order

1. `shared/types/clean-slate.ts` — types
2. `shared/ui/step-reporter.ts` — runStep wrapper
3. `shared/ui/error-report.ts` — showStepError
4. `jira_management/issue-snapshot.ts` — refactor 8 sub-functions + partial snapshots
5. `jira_management/test-case-factory.ts` — inject handler
6. `jira_management/import-orchestrator.ts` — handlers
7. Tests (PBT first, then integration, then edge/negative)
8. Full test suite regression
9. Build clean
10. Live test — ECSPOL-511

---

## 9. Expected Terminal Output

### Interactive (TTY) — success path

```
▶ ECSPOL-1628: limpando...
  ✓ description (2ms)
  ✓ steps — 3 removidos (120ms)
  ✓ preconditions — 2 removidas (85ms)
  ✓ links — 1 removido (ECSPOL-960 via Test, 200ms)
▶ ECSPOL-1628: reconstruindo...
  ✓ description (PUT ok, 15ms)
  ✓ steps — 3 adicionados (180ms)
  ✓ preconditions — 2 associadas (95ms)
  ✓ links — 1 linkado (ECSPOL-511 via is a test for, 110ms)
✓ ECSPOL-1628: clean-slate update concluído (907ms)
```

### Interactive (TTY) — failure with rollback

```
▶ ECSPOL-1628: limpando...
  ✓ description (2ms)
  ✓ steps — 3 removidos (120ms)
  ✓ preconditions — 2 removidas (85ms)
  ✗ links — HTTP 429 Rate limit exceeded (tipo: Test, 0 removidos)

  ┌─ clear-links falhou após 3 tentativas ─────────────────┐
  │ Erro: HTTP 429 — Rate limit exceeded                  │
  │ Contexto: limpando links tipo "Test" em ECSPOL-1628   │
  │ Tentativas: 3/3 (backoff: 1s, 2s, 4s)                │
  │                                                        │
  │ Etapas anteriores:                                     │
  │   ✓ description (2ms)                                  │
  │   ✓ steps — 3 removidos (120ms)                        │
  │   ✓ preconditions — 2 removidas (85ms)                 │
  │   ✗ links — 0 removidos                                │
  │                                                        │
  │ ⚠ skip: criará estado incompleto                       │
  │  [skip ⚠] [abort] [retry] [rollback]                  │
  └────────────────────────────────────────────────────────┘

  → rollback
  ⟳ links: rollback — 1 link restaurado (ECSPOL-960)
✓ ECSPOL-1628: update concluído com rollback parcial (links)
```

### CI/CD (no TTY)

```
▶ ECSPOL-1628: limpando...
  ✓ description (2ms)
  ✓ steps — 3 removidos (120ms)
  ✓ preconditions — 2 removidas (85ms)
  ✗ links — HTTP 429 (3/3 retries exhausted)
  ⟳ links: auto-rollback — 1 link restaurado
  ✗ FALHA: clean-slate interrompido em "clear-links"
    Etapas: 3/4 clear, 0/4 rebuild
    Rollback parcial aplicado
    Retry manual: --target-keys ECSPOL-1628
  Exit code: 1
```

---

## 10. Related Rules

- **Rule 4 (Root Cause Invariant):** Every defect corrected at origin
- **Rule 5 (Safety Mechanism Immutability):** Tests not weakened
- **Rule 25 (Zero Silencing):** All errors explicit, no silent degradation
- **Rule 19 (Testing Discipline):** TDD, PBT, strict mocks, tests as source of truth
