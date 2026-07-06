# Layered Architecture — Implementation Progress

**Start:** 2026-07-06
**Plan:** `shared/plans/data-hub-layered-architecture.md`

## Phase 0 — Cross-Cutting Modules (14h)

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

**Checkpoints:**

| Check                         | Status |
| ----------------------------- | ------ |
| `npx tsc --noEmit` = 0 errors | ⏳     |
| `npm run lint` = 0 violations | ⏳     |
| `npx vitest run` = 100% pass  | ⏳     |
| New files + tests pass        | ⏳     |

### Phase 0 Learnings

| #   | Learning                                                                                                                                                                                         | Impact                                                          | Affected Files                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| 1   | `exactOptionalPropertyTypes: true` exige spread pattern para props opcionais com `T \| undefined`. Usar `...(val !== undefined ? { prop: val } : {})` em vez de `prop: val`.                     | Padrão obrigatório em todo arquivo com props opcionais          | junit-xml-parser.ts, artifact-parser.ts |
| 2   | `fast-xml-parser` isArray callback recebe `JPathOrMatcher` (string \| MatcherView), não `string`. Usar `unknown` no param, cast interno.                                                         | Type safety reduzido no callback, necessário em todo XML parser | junit-xml-parser.ts                     |
| 3   | Convenção de paths em testes: `__tests__/extractors/*` → `../../extractors/*`, `__tests__/metrics/*` → `../../metrics/*`, `__tests__/*` → `../*`                                                 | Erro mais comum — módulo não encontrado                         | Todos os test files Phase 0             |
| 4   | Compute functions têm signatures inconsistentes: `calcPipelinePassRate(runs)`, `calcTopFailingJobs(runs, jobsMap)`, `calcReleaseScore(dimensions)`, `calcQuarantineStatus(flakyResults, config)` | metrics-calculator precisa compor com tipos corretos por função | metrics-calculator.ts                   |
| 5   | CTRF coverage field (`results.coverage`) não existe no tipo `CtrfResults`. Type assertion inline necessária.                                                                                     | Se coverage for comum em CTRF, estender CtrfResults             | coverage-extractor.ts                   |
| 6   | Edge cases sub-testados: NaN, >100%, arrays vazios, dados corrompidos — zero testes. Happy paths 100% cobertos.                                                                                  | Risco baixo para Phase 18-23, priorizar na Phase 25             | Todos os test files Phase 0             |

---

## Phase 18 — Data Extraction (3h)

| #    | Task                  | Status     | Date | Tests | Notes                        |
| ---- | --------------------- | ---------- | ---- | ----- | ---------------------------- |
| 18.1 | Extender PipelineJob  | 🔜 Pending | —    | —     | stepConclusions + timestamps |
| 18.2 | Extender ArtifactInfo | 🔜 Pending | —    | —     | size_in_bytes, created_at    |
| 18.3 | Mapear campos API     | 🔜 Pending | —    | —     | GitHub + GitLab providers    |

---

## Phase 20 — Contents API + Framework Detection (6h)

| #    | Task                   | Status     | Date | Tests | Notes                             |
| ---- | ---------------------- | ---------- | ---- | ----- | --------------------------------- |
| 20.1 | Extender GitProvider   | 🔜 Pending | —    | —     | getFileContents + listDirectory   |
| 20.2 | Git Trees API          | 🔜 Pending | —    | —     | Monorepo discovery                |
| 20.3 | GitHub implementation  | 🔜 Pending | —    | —     | wfGetFileContents + wfGetRepoTree |
| 20.4 | GitLab implementation  | 🔜 Pending | —    | —     | glGetFileContents + glGetRepoTree |
| 20.5 | framework-detection.ts | 🔜 Pending | —    | —     | detectFrameworkFromAPI            |
| 20.6 | framework-detector.ts  | 🔜 Pending | —    | —     | Cascata de detecção               |

---

## Phase 21 — Artifact Download + Parse (4h)

| #    | Task                         | Status     | Date | Tests | Notes              |
| ---- | ---------------------------- | ---------- | ---- | ----- | ------------------ |
| 21.1 | downloadArtifact in provider | 🔜 Pending | —    | —     | GitHub provider    |
| 21.2 | downloadArtifact in provider | 🔜 Pending | —    | —     | GitLab provider    |
| 21.3 | Artifact routes in hub.ts    | 🔜 Pending | —    | —     | extractTestResults |

---

## Phase 22 — Failure Classification (3h)

| #    | Task                             | Status     | Date | Tests | Notes                |
| ---- | -------------------------------- | ---------- | ---- | ----- | -------------------- |
| 22.1 | failure-classifier on Check Runs | 🔜 Pending | —    | —     | annotations per file |
| 22.2 | failure-classifier on JUnit      | 🔜 Pending | —    | —     | <testcase> failure   |
| 22.3 | Cascata no hub.ts                | 🔜 Pending | —    | —     | Orquestração         |

---

## Phase 23 — Integration + Cascade Wiring (4h)

| #    | Task                            | Status     | Date | Tests | Notes      |
| ---- | ------------------------------- | ---------- | ---- | ----- | ---------- |
| 23.1 | Cascade in test-count-extractor | 🔜 Pending | —    | —     | Full chain |
| 23.2 | Cascade in coverage-extractor   | 🔜 Pending | —    | —     | Full chain |
| 23.3 | Cascade in failure-classifier   | 🔜 Pending | —    | —     | Full chain |
| 23.4 | Integration tests               | 🔜 Pending | —    | —     | End-to-end |

---

## Phase 24 — Migration Consumers (8h)

| #    | Task               | Status     | Date | Tests | Notes                  |
| ---- | ------------------ | ---------- | ---- | ----- | ---------------------- |
| 24.1 | session-context.ts | 🔜 Pending | —    | —     | RED → GREEN → REFACTOR |
| 24.2 | test-results.ts    | 🔜 Pending | —    | —     | RED → GREEN → REFACTOR |
| 24.3 | case17.ts          | 🔜 Pending | —    | —     | RED → GREEN → REFACTOR |
| 24.4 | batch-mode.ts      | 🔜 Pending | —    | —     | RED → GREEN → REFACTOR |
| 24.5 | pr-report-core.ts  | 🔜 Pending | —    | —     | RED → GREEN → REFACTOR |

---

## Phase 25 — Tests (6h)

| #    | Task                       | Status     | Date | Tests | Notes                |
| ---- | -------------------------- | ---------- | ---- | ----- | -------------------- |
| 25.1 | Unit tests Phase 0 modules | 🔜 Pending | —    | —     | 8 new modules        |
| 25.2 | Unit tests Phases 18-23    | 🔜 Pending | —    | —     | Providers + cascades |
| 25.3 | Integration tests          | 🔜 Pending | —    | —     | Cross-layer flows    |
| 25.4 | System tests               | 🔜 Pending | —    | —     | End-to-end data flow |
| 25.5 | Property-based tests       | 🔜 Pending | —    | —     | Critical logic       |

---

## Phase 26 — Quality Audit (4h)

| #    | Task                    | Status     | Date | Tests | Notes                        |
| ---- | ----------------------- | ---------- | ---- | ----- | ---------------------------- |
| 26.1 | Code quality audit      | 🔜 Pending | —    | —     | All new modules              |
| 26.2 | Architecture compliance | 🔜 Pending | —    | —     | Verify plan adherence        |
| 26.3 | Final verification      | 🔜 Pending | —    | —     | tsc + lint + test + coverage |
