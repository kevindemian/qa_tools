# Layered Architecture — Implementation Progress

**Start:** 2026-07-05
**Plan:** `shared/plans/data-hub-layered-architecture.md`
**Last updated:** 2026-07-08

## Summary

| Phase | Description                              | Status     |
| ----- | ---------------------------------------- | ---------- |
| 0     | Cross-Cutting Modules                    | ✅ Done    |
| 18    | Data Extraction                          | ✅ Done    |
| 20    | Contents API + Framework Detection       | ✅ Done    |
| 21    | Artifact Download + Parse                | ✅ Done    |
| 22    | Consumer Migration + SSOT Centralization | ✅ Done    |
| 23    | Integration + Cascade Wiring             | 🔜 Pending |
| 24    | Migration Consumers (remaining)          | ✅ Done    |
| 25    | Tests                                    | 🔜 Pending |
| 26    | Quality Audit                            | 🔜 Pending |

---

## Phase 0 — Cross-Cutting Modules

| #   | Task                                  | Status  | Date       | Tests            | Notes                           |
| --- | ------------------------------------- | ------- | ---------- | ---------------- | ------------------------------- |
| 0.1 | test-source-fallback.ts               | ✅ Done | 2026-07-06 | 13/13 pass       | User Fallback (Layer 7)         |
| 0.2 | artifact-parser.ts                    | ✅ Done | 2026-07-06 | 16/16 pass       | ZIP + CTRF/JUnit/Mochawesome    |
| 0.3 | junit-xml-parser.ts                   | ✅ Done | 2026-07-06 | 9/9 pass         | JUnit XML via fast-xml-parser   |
| 0.4 | log-parser.ts                         | ✅ Done | 2026-07-06 | 8/8 pass         | Test summary from job logs      |
| 0.5 | extractors/                           | ✅ Done | 2026-07-06 | 20/20 pass       | coverage + test-count + failure |
| 0.6 | metrics/                              | ✅ Done | 2026-07-06 | 16/16 pass       | calculator + json + csv         |
| 0.7 | Fix type safety (as any / @ts-ignore) | ✅ Done | 2026-07-06 | 0 TS errors      | 24 → 0 errors                   |
| 0.8 | Research actions-usage                | ✅ Done | 2026-07-06 | Decisão: Opção C | Manter cálculo manual puro      |

---

## Phase 18 — Data Extraction

| #    | Task                  | Status  | Date       | Tests | Notes                        |
| ---- | --------------------- | ------- | ---------- | ----- | ---------------------------- |
| 18.1 | Extender PipelineJob  | ✅ Done | 2026-07-06 | pass  | stepConclusions + timestamps |
| 18.2 | Extender ArtifactInfo | ✅ Done | 2026-07-06 | pass  | size_in_bytes, created_at    |
| 18.3 | Mapear campos API     | ✅ Done | 2026-07-06 | pass  | GitHub + GitLab providers    |

---

## Phase 20 — Contents API + Framework Detection

| #    | Task                   | Status  | Date       | Tests | Notes                             |
| ---- | ---------------------- | ------- | ---------- | ----- | --------------------------------- |
| 20.1 | Extender GitProvider   | ✅ Done | 2026-07-07 | pass  | getFileContents + listDirectory   |
| 20.2 | Git Trees API          | ✅ Done | 2026-07-07 | pass  | Monorepo discovery                |
| 20.3 | GitHub implementation  | ✅ Done | 2026-07-07 | pass  | wfGetFileContents + wfGetRepoTree |
| 20.4 | GitLab implementation  | ✅ Done | 2026-07-07 | pass  | glGetFileContents + glGetRepoTree |
| 20.5 | framework-detection.ts | ✅ Done | 2026-07-07 | pass  | detectFrameworkFromAPI            |
| 20.6 | framework-detector.ts  | ✅ Done | 2026-07-07 | pass  | Cascata de detecção               |

---

## Phase 21 — Artifact Download + Parse

| #    | Task                         | Status  | Date       | Tests | Notes              |
| ---- | ---------------------------- | ------- | ---------- | ----- | ------------------ |
| 21.1 | downloadArtifact in provider | ✅ Done | 2026-07-07 | pass  | GitHub provider    |
| 21.2 | downloadArtifact in provider | ✅ Done | 2026-07-07 | pass  | GitLab provider    |
| 21.3 | Artifact routes in hub.ts    | ✅ Done | 2026-07-07 | pass  | extractTestResults |

---

## Phase 22 — Consumer Migration + SSOT Centralization

### 22.A — Foundation (Type System + Core Migrations)

| #       | Task                                        | Status  | Date       | Commit   | Notes                      |
| ------- | ------------------------------------------- | ------- | ---------- | -------- | -------------------------- |
| 22.A.1  | Extend CiContext (raw, computed, providers) | ✅ Done | 2026-07-08 | 945a622e | Core type foundation       |
| 22.A.2  | Extend RawData (workflowRunTiming)          | ✅ Done | 2026-07-08 | 945a622e | Raw data structure         |
| 22.A.3  | Extend ComputedMetrics (pipeline metrics)   | ✅ Done | 2026-07-08 | 945a622e | Computed metrics structure |
| 22.A.4  | createDataHub factory function              | ✅ Done | 2026-07-08 | 945a622e | Factory pattern            |
| 22.A.5  | Migrate ci-detect.ts consumers              | ✅ Done | 2026-07-08 | 945a622e | CiDetect → DataHub         |
| 22.A.6  | Migrate session-context.ts                  | ✅ Done | 2026-07-08 | 945a622e | SessionContext → DataHub   |
| 22.A.7  | Migrate health-score.ts                     | ✅ Done | 2026-07-08 | 945a622e | HealthScore → DataHub      |
| 22.A.8  | Migrate batch-mode.ts                       | ✅ Done | 2026-07-08 | 945a622e | BatchMode → DataHub        |
| 22.A.9  | Migrate quality-gate.ts                     | ✅ Done | 2026-07-08 | 945a622e | QualityGate → DataHub      |
| 22.A.10 | Migrate case17.ts                           | ✅ Done | 2026-07-08 | 945a622e | Case17 → DataHub           |

### 22.B-D — Remaining Foundation Migrations

| #    | Task                        | Status  | Date       | Commit   | Notes            |
| ---- | --------------------------- | ------- | ---------- | -------- | ---------------- |
| 22.B | Migrate remaining consumers | ✅ Done | 2026-07-08 | 05d167e5 | Already migrated |
| 22.C | —                           | ✅ Done | 2026-07-08 | 05d167e5 | —                |
| 22.D | —                           | ✅ Done | 2026-07-08 | 05d167e5 | —                |

### 22.E — case19 + case21 Migration

| #    | Task                      | Status  | Date       | Commit   | Notes                |
| ---- | ------------------------- | ------- | ---------- | -------- | -------------------- |
| 22.E | Migrate case19 and case21 | ✅ Done | 2026-07-08 | ce95a289 | metrics.ts → DataHub |

### 22.F — batch-mode + test-results + quality-gate

| #    | Task                                           | Status  | Date       | Commit   | Notes |
| ---- | ---------------------------------------------- | ------- | ---------- | -------- | ----- |
| 22.F | Migrate batch-mode, test-results, quality-gate | ✅ Done | 2026-07-08 | 2ae25eab | —     |

### 22.G — pr-report-core + case17

| #    | Task                              | Status  | Date       | Commit   | Notes |
| ---- | --------------------------------- | ------- | ---------- | -------- | ----- |
| 22.G | Migrate pr-report-core and case17 | ✅ Done | 2026-07-08 | 72938c27 | —     |

### 22.H — case17-test-utils Cleanup

| #    | Task                                | Status  | Date       | Commit   | Notes |
| ---- | ----------------------------------- | ------- | ---------- | -------- | ----- |
| 22.H | Remove fetchLatestTestRun re-export | ✅ Done | 2026-07-08 | 408b6d4e | —     |

### 22.I — Individual Consumer Migrations

| #      | Task                     | Status  | Date       | Commit   | Notes |
| ------ | ------------------------ | ------- | ---------- | -------- | ----- |
| 22.I.1 | Migrate pipeline-jira    | ✅ Done | 2026-07-08 | d50569aa | —     |
| 22.I.2 | Migrate smoke-pipeline   | ✅ Done | 2026-07-08 | c7995e9f | —     |
| 22.I.3 | Migrate schedule-handler | ✅ Done | 2026-07-08 | 05fdc4c0 | —     |
| 22.I.4 | Migrate interactive-mode | ✅ Done | 2026-07-08 | 14b96cad | —     |

### 22.L — Type Imports + Mock Cleanup

| #      | Task                  | Status  | Date       | Commit   | Notes                          |
| ------ | --------------------- | ------- | ---------- | -------- | ------------------------------ |
| 22.L.1 | Update type imports   | ✅ Done | 2026-07-08 | de96f19c | metrics.js → types/data-hub.js |
| 22.L.2 | Remove obsolete mocks | ✅ Done | 2026-07-08 | 59b69d4e | —                              |

### 22.M — DataHub Compute Expansion

| #      | Task                         | Status  | Date       | Commit   | Notes                                                                        |
| ------ | ---------------------------- | ------- | ---------- | -------- | ---------------------------------------------------------------------------- |
| 22.M.1 | New: calcRunPassRate         | ✅ Done | 2026-07-08 | 6332199b | Test-level pass rate                                                         |
| 22.M.2 | New: calcTestDurationP95     | ✅ Done | 2026-07-08 | 6332199b | P95 of test durations                                                        |
| 22.M.3 | New: calcRunFailureRate      | ✅ Done | 2026-07-08 | 6332199b | % runs with ≥1 failure                                                       |
| 22.M.4 | New: calcTestDurationMap     | ✅ Done | 2026-07-08 | 6332199b | Per-test aggregation                                                         |
| 22.M.5 | Wire calculateFlakyTestRate  | ✅ Done | 2026-07-08 | 6332199b | Export + ComputedMetrics                                                     |
| 22.M.6 | Add 5 ComputedMetrics fields | ✅ Done | 2026-07-08 | 6332199b | runPassRate, testDurationP95, runFailureRate, testDurationMap, flakyTestRate |

### 22.N — Rogue Calculator Elimination

| #       | Task                                         | Status  | Date       | Commit   | Notes                              |
| ------- | -------------------------------------------- | ------- | ---------- | -------- | ---------------------------------- |
| 22.N.1  | pipeline-health.ts deleted                   | ✅ Done | 2026-07-08 | 6332199b | 353 lines, 5 duplicate calcs       |
| 22.N.2  | pipeline-health-renderer.ts                  | ✅ Done | 2026-07-08 | 6332199b | Extracted HTML only                |
| 22.N.3  | quality-gate.ts migrated                     | ✅ Done | 2026-07-08 | 6332199b | Uses DataHub computed              |
| 22.N.4  | schedule-handler + interactive-mode migrated | ✅ Done | 2026-07-08 | 6332199b | Uses DataHub compute               |
| 22.N.5  | case17 + case17-helpers migrated             | ✅ Done | 2026-07-08 | 6332199b | Uses calcRunPassRate               |
| 22.N.6  | pr-report-core migrated                      | ✅ Done | 2026-07-08 | 6332199b | Uses calcRunPassRate (4 locations) |
| 22.N.7  | health-score.ts DataHub-first                | ✅ Done | 2026-07-08 | 6332199b | Fallbacks preserved                |
| 22.N.8  | detectFlakyTests eliminated                  | ✅ Done | 2026-07-08 | 6332199b | CiContext.flakyEntries             |
| 22.N.9  | RunStats.passRate removed                    | ✅ Done | 2026-07-08 | 6332199b | statsFromTests consolidated        |
| 22.N.10 | metrics-calculator.ts deleted                | ✅ Done | 2026-07-08 | 6332199b | Duplicated with bugs               |

### 22.Final — ESLint Corrections

| #      | Task                   | Status  | Date       | Commit   | Notes               |
| ------ | ---------------------- | ------- | ---------- | -------- | ------------------- |
| 22.F.1 | 26 ESLint errors fixed | ✅ Done | 2026-07-08 | 6332199b | Source + test files |

---

## Gap Correction Sprint (G1-G7) — Post-Phase-22 Audit

**Started:** 2026-07-08
**Trigger:** PROGRESS-LAYERED-ARCH.md declared Phase 22 complete, but code audit found 6 categories of gaps: broken tests, inline calculations, un-deleted legacy modules, unmigrated session-context, duplicated fallbacks, and missing types.

### G1 — DataHubResult Type + Test Factories (65 failures)

| #    | Task                                     | Status     | Date | Tests | Notes                            |
| ---- | ---------------------------------------- | ---------- | ---- | ----- | -------------------------------- |
| G1.1 | Add `DataHubResult` interface            | 🔜 Pending | —    | —     | Missing from `types/data-hub.ts` |
| G1.2 | Create `createTestHub()` factory         | 🔜 Pending | —    | —     | `shared/__mocks__/data-hub.ts`   |
| G1.3 | Fix `ci-data.test.ts` (14 tests)         | 🔜 Pending | —    | —     | Destructure `const { hub } =`    |
| G1.4 | Fix `hub.integration.test.ts` (5 tests)  | 🔜 Pending | —    | —     | Destructure pattern              |
| G1.5 | Fix `ci-data-e2e.test.ts` (5 tests)      | 🔜 Pending | —    | —     | Destructure pattern              |
| G1.6 | Fix `ci-data-e2e-live.test.ts` (4 tests) | 🔜 Pending | —    | —     | Destructure + TS18046 fix        |
| G1.7 | Fix remaining failing tests (17 tests)   | 🔜 Pending | —    | —     | Various files                    |

### G2 — SSOT: Eliminate Inline Calculations (9 sites)

| #     | Task                                             | Status     | Date | Notes                                |
| ----- | ------------------------------------------------ | ---------- | ---- | ------------------------------------ |
| G2.1  | `metrics-trends.ts:20` — inline passRate         | 🔜 Pending | —    | → `calcRunPassRate(r)`               |
| G2.2  | `report-html.ts:98` — inline passRate            | 🔜 Pending | —    | → `calcRunPassRate()`                |
| G2.3  | `case19.ts:21` — inline passRate                 | 🔜 Pending | —    | → `calcRunPassRate(r)`               |
| G2.4  | `health-score.ts:176` — inline passRate fallback | 🔜 Pending | —    | → `calcRunPassRate()`                |
| G2.5  | `run-comparison.ts:13` — inline passRate         | 🔜 Pending | —    | → `calcRunPassRate()`                |
| G2.6  | `health-score.ts:181` — inline executionRate     | 🔜 Pending | —    | → new `calcTestExecutionRate()`      |
| G2.7  | `health-score.ts:153` — `_computeSuiteSpeed` dup | 🔜 Pending | —    | Delete, use `calcTestDurationP95`    |
| G2.8  | `health-score.ts:108-137` — `_computeFlakyRate`  | 🔜 Pending | —    | Delete, use `calculateFlakyTestRate` |
| G2.9  | `quality-gate.ts:99-115` — `_resolveFlakyPct`    | 🔜 Pending | —    | Delete, use `calculateFlakyTestRate` |
| G2.10 | New module: `calcTestExecutionRate`              | 🔜 Pending | —    | `compute/test-execution-rate.ts`     |
| G2.11 | Add to barrel `compute/index.ts`                 | 🔜 Pending | —    | + PBT + unit tests                   |

### G3 — DataProvider Commit Log (Option A: technical superiority)

| #    | Task                                                    | Status     | Date | Notes                              |
| ---- | ------------------------------------------------------- | ---------- | ---- | ---------------------------------- |
| G3.1 | Add `commitLog?: string` to `RawData`                   | 🔜 Pending | —    | types/data-hub.ts                  |
| G3.2 | Add `fetchCommitLog()` to `DataProvider`                | 🔜 Pending | —    | Default empty for compat           |
| G3.3 | Implement in GitHub provider                            | 🔜 Pending | —    | Reuse fetchGitHubHistory logic     |
| G3.4 | Implement in GitLab provider                            | 🔜 Pending | —    | Reuse fetchGitLabHistory logic     |
| G3.5 | Merge commitLog in hub.ts                               | 🔜 Pending | —    | mergeRawData                       |
| G3.6 | Migrate case17.ts to hub.raw.commitLog                  | 🔜 Pending | —    | Replace fetchGitHistory()          |
| G3.7 | Migrate case17-helpers.ts                               | 🔜 Pending | —    | Accept string instead of CiContext |
| G3.8 | Remove fetchGitHistory re-export from case17-test-utils | 🔜 Pending | —    | barrel cleanup                     |

### G4 — session-context.ts Migration

| #    | Task                                         | Status     | Date | Notes                             |
| ---- | -------------------------------------------- | ---------- | ---- | --------------------------------- |
| G4.1 | Extend DataHubPersistence with SHA-keyed ops | 🔜 Pending | —    | saveReport, loadReport, branches  |
| G4.2 | Rewrite resolveTestDataSource()              | 🔜 Pending | —    | Use DataHub persistence           |
| G4.3 | Simplify resolveSessionContext()             | 🔜 Pending | —    | Remove store field                |
| G4.4 | Migrate case15.ts                            | 🔜 Pending | —    | Use DataHub persistence           |
| G4.5 | Migrate case17.ts                            | 🔜 Pending | —    | Use DataHub persistence           |
| G4.6 | Update tests                                 | 🔜 Pending | —    | session-context + case15 + case17 |

### G5 — coverage-source.ts → DataHub

| #    | Task                                           | Status     | Date | Notes                                    |
| ---- | ---------------------------------------------- | ---------- | ---- | ---------------------------------------- |
| G5.1 | Replace resolveCoverage() in pr-report-core.ts | 🔜 Pending | —    | Use hub.raw.coverage + Istanbul fallback |
| G5.2 | Update mocks in 5 pr-report-core test files    | 🔜 Pending | —    | Remove coverage-source mocks             |
| G5.3 | Delete coverage-source.ts                      | 🔜 Pending | —    | + 3 test files                           |

### G6 — Silent Errors Audit

| #    | Task                                              | Status     | Date | Notes                                   |
| ---- | ------------------------------------------------- | ---------- | ---- | --------------------------------------- |
| G6.1 | Audit all catch blocks in data-hub/               | 🔜 Pending | —    | Zero tolerance for silent errors        |
| G6.2 | Fix run-comparison.ts:54                          | 🔜 Pending | —    | Add extractErrorMessage + humanizeError |
| G6.3 | Fix report-html.ts:116                            | 🔜 Pending | —    | Add rootLogger.error                    |
| G6.4 | Verify zero empty catch blocks in production code | 🔜 Pending | —    | grep + validate                         |

### G7 — Documentation + Final Verification

| #    | Task                                 | Status     | Date | Notes                      |
| ---- | ------------------------------------ | ---------- | ---- | -------------------------- |
| G7.1 | Update PROGRESS-LAYERED-ARCH.md      | 🔜 Pending | —    | Correct Phase 22/23 status |
| G7.2 | Final: `npx tsc --noEmit` = 0        | 🔜 Pending | —    | Must pass                  |
| G7.3 | Final: `npm run lint` = 0            | 🔜 Pending | —    | Must pass                  |
| G7.4 | Final: `npx vitest run` = 0 failures | 🔜 Pending | —    | Must pass                  |

---

## Phase 23 — Deprecation + Cleanup (deferred to after Gaps)

| #    | Task                           | Status     | Date | Tests | Notes       |
| ---- | ------------------------------ | ---------- | ---- | ----- | ----------- |
| 23.1 | Delete git-artifact-downloader | 🔜 Pending | —    | —     | After G3+G4 |
| 23.2 | Delete case17-test-utils       | 🔜 Pending | —    | —     | After G3    |
| 23.3 | Delete coverage-source         | 🔜 Pending | —    | —     | After G5    |
| 23.4 | Final legacy module audit      | 🔜 Pending | —    | —     | After all   |

---

## Phase 24 — Tests

| #    | Task                       | Status     | Date | Tests | Notes                |
| ---- | -------------------------- | ---------- | ---- | ----- | -------------------- |
| 24.1 | Unit tests Phase 0 modules | 🔜 Pending | —    | —     | 8 new modules        |
| 24.2 | Unit tests Phases 18-23    | 🔜 Pending | —    | —     | Providers + cascades |
| 24.3 | Integration tests          | 🔜 Pending | —    | —     | Cross-layer flows    |
| 24.4 | System tests               | 🔜 Pending | —    | —     | End-to-end data flow |
| 24.5 | Property-based tests       | 🔜 Pending | —    | —     | Critical logic       |

---

## Phase 25 — Quality Audit

| #    | Task                    | Status     | Date | Tests | Notes                        |
| ---- | ----------------------- | ---------- | ---- | ----- | ---------------------------- |
| 25.1 | Code quality audit      | 🔜 Pending | —    | —     | All new modules              |
| 25.2 | Architecture compliance | 🔜 Pending | —    | —     | Verify plan adherence        |
| 25.3 | Final verification      | 🔜 Pending | —    | —     | tsc + lint + test + coverage |

---

## Lessons Learned

| #   | Learning                                                                                          | Impact                                                | Affected Phases          |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | --- | ---------------------------------------- | --------------------------------------- | ---- |
| 1   | `exactOptionalPropertyTypes: true` exige spread pattern para props opcionais com `T \| undefined` | Padrão obrigatório                                    | 0, 22                    |
| 2   | Planos com premissas incorretas devem ser corrigidos ANTES da execução                            | Evita bugs silenciosos                                | 22.M/22.N                |
| 3   | `detectFlakyTests()` não tinha algorimo errado — exclusão era por SSOT, não correção              | Confusão quase justificou exclusão pelo motivo errado | 22.N                     |
| 4   | lint-staged como barreira final captura erros ESLint que passam despercebidos                     | 26 erros capturados no pre-commit                     | 22.Final                 |
| 5   | `                                                                                                 |                                                       | `→`??`não é cosmético —` |     | `avalia falsy,`??` avalia null/undefined | Mudança semântica correta para nullable | 22.N |

## Final Status

- **Commit:** `6332199b` — 40 files, +1570/-1252 lines
- **TSC:** 0 errors
- **ESLint:** 0 errors (lint-staged passed)
- **Tests:** 6309+ passing
- **SSOT audit:** 8/8 checks passed
- **Defects fixed:** 34 sites across 13 files
