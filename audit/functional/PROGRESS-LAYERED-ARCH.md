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

## Phase 23 — Integration + Cascade Wiring

| #    | Task                            | Status     | Date | Tests | Notes      |
| ---- | ------------------------------- | ---------- | ---- | ----- | ---------- |
| 23.1 | Cascade in test-count-extractor | 🔜 Pending | —    | —     | Full chain |
| 23.2 | Cascade in coverage-extractor   | 🔜 Pending | —    | —     | Full chain |
| 23.3 | Cascade in failure-classifier   | 🔜 Pending | —    | —     | Full chain |
| 23.4 | Integration tests               | 🔜 Pending | —    | —     | End-to-end |

---

## Phase 24 — Migration Consumers (remaining)

| #    | Task               | Status  | Date | Tests | Notes                  |
| ---- | ------------------ | ------- | ---- | ----- | ---------------------- |
| 24.1 | session-context.ts | ✅ Done | —    | —     | Migrated in Phase 22.A |
| 24.2 | test-results.ts    | ✅ Done | —    | —     | Migrated in Phase 22.F |
| 24.3 | case17.ts          | ✅ Done | —    | —     | Migrated in Phase 22.G |
| 24.4 | batch-mode.ts      | ✅ Done | —    | —     | Migrated in Phase 22.A |
| 24.5 | pr-report-core.ts  | ✅ Done | —    | —     | Migrated in Phase 22.G |

---

## Phase 25 — Tests

| #    | Task                       | Status     | Date | Tests | Notes                |
| ---- | -------------------------- | ---------- | ---- | ----- | -------------------- |
| 25.1 | Unit tests Phase 0 modules | 🔜 Pending | —    | —     | 8 new modules        |
| 25.2 | Unit tests Phases 18-23    | 🔜 Pending | —    | —     | Providers + cascades |
| 25.3 | Integration tests          | 🔜 Pending | —    | —     | Cross-layer flows    |
| 25.4 | System tests               | 🔜 Pending | —    | —     | End-to-end data flow |
| 25.5 | Property-based tests       | 🔜 Pending | —    | —     | Critical logic       |

---

## Phase 26 — Quality Audit

| #    | Task                    | Status     | Date | Tests | Notes                        |
| ---- | ----------------------- | ---------- | ---- | ----- | ---------------------------- |
| 26.1 | Code quality audit      | 🔜 Pending | —    | —     | All new modules              |
| 26.2 | Architecture compliance | 🔜 Pending | —    | —     | Verify plan adherence        |
| 26.3 | Final verification      | 🔜 Pending | —    | —     | tsc + lint + test + coverage |

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
