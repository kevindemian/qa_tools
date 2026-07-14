# DEFECT-AUDIT-22MN — DataHub Layered Architecture Defect Audit

> **Scope**: Defects identified in the `data-hub-layered-architecture.md` plan (phases 23–27) that
> were NOT closed by the original phase commits. Root-cause audit only — no workarounds.
> **Date**: 2026-07-14
> **Authority**: `shared/plans/data-hub-layered-architecture.md`, AGENTS.md (§2 Contract Immutability, §4 Root Cause, §6 No Duplicate Logic)

---

## Summary

| ID     | Defect                                          | Severity | Root Cause                                             | Status       |
| ------ | ----------------------------------------------- | -------- | ------------------------------------------------------ | ------------ |
| DEF-1  | `ComputedMetrics.runPassRate` never populated   | HIGH     | `calcRunPassRate` computed but not assigned to object  | **FIXED**    |
| DEF-2  | `RawData.annotations` missing (Check Runs)      | HIGH     | Annotations collected for classification, never stored | **FIXED**    |
| DEF-3  | `case17-test-utils.ts` orphaned module          | MEDIUM   | Utility file separated from its only consumer          | **FIXED**    |
| DEF-4  | `test-count-extractor` cascade completeness     | MEDIUM   | Verified — cascade implemented across modules          | **VERIFIED** |
| DEF-5a | Cosmetic: export `FlatTest` in junit-parser     | LOW      | Invalid — shape divergence (see rejection)             | **REJECTED** |
| DEF-5b | Cosmetic: `TEST_SUMMARY_PATTERNS` in log-parser | LOW      | Invalid — duplicates existing `HANDLERS`               | **REJECTED** |

---

## DEF-1 — `ComputedMetrics.runPassRate` never populated

**Evidence (pre-fix)**: `shared/data-hub/hub.ts` `computeMetrics()` called
`calcRunPassRate({ passed: testCounts.passed, failed: testCounts.failed })` and discarded the
result; the returned `ComputedMetrics` object omitted `runPassRate`. `ComputedMetrics.runPassRate`
existed in `shared/types/data-hub.ts` but was **always `undefined`** at runtime — a contract field
with no producer. Every consumer reading `computed.metrics.runPassRate` received `undefined`.

**Root cause**: producer (compute) and contract (type) were out of sync — the value was calculated
but never threaded into the returned object.

**Fix (root cause, not symptom)**:

- `shared/data-hub/hub.ts` `computeMetrics()`: assigned `const runPassRate = calcRunPassRate(...)` and
  added `runPassRate,` to the returned `ComputedMetrics` object.

**Verification**: `npx tsc --noEmit` → 0 errors. `ComputedMetrics.runPassRate` now has a producer.

---

## DEF-2 — `RawData.annotations` missing (GitHub Check Runs)

**Evidence (pre-fix)**: `RawData` (`shared/types/data-hub.ts`) had no `annotations` field. The
GitHub provider's `collectCheckRunAnnotations()` fetched Check Run annotations but only fed them into
failure classification (`fetchFailureReasons`). The data was never persisted in `RawData`, so any
downstream consumer (reports, traceability, audit) could not access file/line/message annotations.

**Root cause**: annotation collection existed but the contract field (`RawData.annotations`) was
never declared, so the data had no persistence target. GitLab equivalent (`gitlabTestReport`) was
already wired into `RawData`; GitHub was inconsistent.

**Fix (root cause, not symptom)**:

- `shared/types/data-hub.ts`: added `annotations?: CheckRunAnnotation[]` to `RawData` (import of
  `CheckRunAnnotation` added from `./ci-cd.js`).
- `shared/data-hub/providers/github-provider.ts`:
    - `collectCheckRunAnnotations()` now called **once** in `fetchRawData()` (commit-level) instead of
      per-run, eliminating duplicate API calls.
    - Threaded into `processRun` → `fetchFailureReasons` (failure classification, unchanged behavior).
    - Threaded into `buildExpandRawData` → emitted as `annotations` in `RawData` (conditional, only when
      non-empty — preserves the "absent ≠ empty" invariant).

**Verification**: `npx tsc --noEmit` → 0 errors. GitHub provider now populates `RawData.annotations`
and retains failure-classification input. Collection guarded by `VITEST` env (no network in tests).

---

## DEF-3 — `case17-test-utils.ts` orphaned module

**Evidence (pre-fix)**: `jira_management/commands/case17-test-utils.ts` was imported by exactly ONE
file — `case17.ts` (symbols `computeDiff`, `resolveTestHistory`). The module was a standalone file
for logic used only by `case17`. Plan Phase 23 (Deprecation + Cleanup) listed it for deletion.

**Root cause**: utility file separated from its single consumer, increasing navigation cost with no
reuse benefit (Tier-3 removal per Merge-First Rule 23; user-explicit request).

**Fix (root cause, not symptom)**:

- Inlined `getMappingCandidates`, `parseTestFile`, `resolveMapping`, `resolveTestHistory`,
  `loadLastTests`, `computeDiff` into `case17.ts` (reusing its existing imports:
  `fs`, `Config`, `sanitizePath`, `rootLogger`, `FlatTest`, `TestHistoryRun`,
  `createHistoryProvider`, `TestHistoryCache`, `CommandContext`, `DataHub`).
- Deleted `jira_management/commands/case17-test-utils.ts`.
- Removed the now-dead `import { computeDiff, resolveTestHistory } from './case17-test-utils.js'`.

**Verification**: `npx tsc --noEmit` → 0 errors. Repo-wide grep for `case17-test-utils` → 0 references.

---

## DEF-4 — `test-count-extractor` cascade (VERIFIED, no defect)

**Audit claim**: `extractors/test-count-extractor.ts` possibly absent.

**Finding**: the cascade (CTRF → JUnit → Check Runs → Regex → User) is **fully implemented**, just not
as a single standalone file:

- **CTRF / JUnit / mochawesome** → `shared/data-hub/artifact-parser.ts` (`isCTRF` / `isJUnit` / `isMochawesome`).
- **Check Runs + Regex** → `shared/log-parser.ts` `HANDLERS` (jest `/Tests:\s+(\d+)\s+failed.../`,
  vitest, dotnet, pytest, …).
- **User fallback** → `DataHubImpl.requestUserFallback()` (Layer 7, `hub.ts`).
- **Aggregation** → `DataHubImpl.aggregateTestCounts()` (`hub.ts`) sums `parsedArtifacts[].data.stats`.

**Decision**: creating a separate `test-count-extractor.ts` would violate AGENTS §6 (no duplicate /
parallel implementation). No change required.

---

## DEF-5 — Cosmetic items (REJECTED per AGENTS rules)

### DEF-5a — export `FlatTest` in `junit-xml-parser.ts`

**Rejection**: `junit-xml-parser.ts` defines `FlatTestEntry` (fields: `title`, `classname`, `time`,
`status`). `result_parser.ts` defines `FlatTest` (fields: `title`, `fullTitle`, `duration`, `state`,
…). The shapes **diverge**. Renaming `FlatTestEntry` → `FlatTest` would create two distinct
same-named types — a contract change without authority (AGENTS §2/§6). **Not a defect.**

### DEF-5b — `TEST_SUMMARY_PATTERNS` in `log-parser.ts`

**Rejection**: the test-summary regexes already exist in `log-parser.ts` `HANDLERS` (line ~113) as a
named, structured registry (name + test + extract). Extracting them into a separate
`TEST_SUMMARY_PATTERNS` constant would duplicate logic (AGENTS §6). **Not a defect.**

---

## Safety Mechanisms Preserved

- No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `as any` introduced.
- `RawData.annotations` is conditionally emitted (absent when empty) — preserves "absent ≠ empty"
  invariant (no silent default to `[]`).
- `collectCheckRunAnnotations` still guarded by `VITEST` env (no network in tests).
- All fixes compile under `tsc --noEmit` with 0 errors.

---

## Follow-up

- Add regression tests asserting `ComputedMetrics.runPassRate` is populated (DEF-1) and
  `RawData.annotations` is populated from Check Runs (DEF-2). See Phase 25 work.
