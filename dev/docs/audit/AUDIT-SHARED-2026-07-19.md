# AUDIT-SHARED-2026-07-19 — Test-File Quality Audit (`shared/`)

**Date:** 2026-07-19
**Scope:** 356 `*.test.ts` files under `shared/` (directories per mandate).
**Standard:** AGENTS.md §19 (Testing Discipline) / §26 (Mock Integrity) / §25 (Zero Silencing).
**Method:** READ-ONLY. Full reads of representative files from every directory group;
three independent defect-signature scans across all 356 files (weak-only assertions,
`as never` shape masking, self-mocking of the unit under test). Every file flagged by a
scan was opened and verified in full. No source/test files modified. No test suite run.

---

## 1. Summary by Directory Group

| Directory group | Files | SÃO | NÃO |
| --- | --- | ---: | ---: |
| `shared/__tests__` (incl. `e2e/`, `integration/`, `migration/`, `system/`) | 253 | 253 | 0 |
| `shared/data-hub/__tests__` (incl. `compute/`, `extractors/`, `integration/`, `metrics/`, `providers/`) | 73 | 73 | 0 |
| `shared/data-hub/extractors/__tests__` | 5 | 5 | 0 |
| `shared/invariants/__tests__` | 4 | 4 | 0 |
| `shared/primitives/__tests__` | 6 | 6 | 0 |
| `shared/test-utils/__tests__` + `shared/test-utils/factories/__tests__` | 15 | 15 | 0 |
| **TOTAL** | **356** | **356** | **0** |

---

## 2. NÃO Files

**None.** No test file in scope meets the NÃO (defective) criteria:

- **No mock theater**: No file mocks the unit under test. `vi.mock` is used only for
  external boundaries (logger, config, `fs`, HTTP client, `child_process`/spawn, prompt/UI,
  GitProvider/JiraResource/XrayCloudClient adapters, DataProvider). Provider/extractor tests
  inject strict-shaped mocks of the external API and assert the adapter's real transformation
  logic (e.g. `github-provider.test.ts`, `gitlab-provider.test.ts`, `xray-expanded.test.ts`,
  `jira-provider.test.ts`, `composite-provider.test.ts`).
- **No `as never` shape-hiding defects**: All `as never` occurrences are legitimate test
  fixtures (empty `{}` objects, `process.exit` mock implementations, `releaseScore.dimensions`
  empty placeholder in `pr-report.test.ts`) — not casts masking real shape mismatches in
  production code paths.
- **No coverage theater**: No file asserts only `toBeDefined()` / `not.toThrow()` /
  `toBeTruthy()` as its sole verification. Even `not.toThrow()` usages are paired with
  concrete output assertions. Property-based tests (`*.property.test.ts`) use `fc.assert`
  with real postconditions (counts, sorting, math, HTML structure).
- **No partial/invalid mock shapes**: Mocked returns match the real function return types
  (verified by reading source where boundary mocking was present); mock calls verified with
  `toHaveBeenCalledWith` real-shaped args (e.g. `getRecentPipelines` called with count+since).
- **No failure swallowing**: Error paths are asserted explicitly (`toThrow`, error-page HTML
  assertions in `ai-comparison.test.ts` / `ai-effectiveness.test.ts`).

Test-utility factory self-tests (`test-utils/.../factories/...`, `mock-modules.test.ts`)
assert real behavior of the factory helpers (return shapes, override merging, instance
independence) and are therefore valid SÃO.

---

## 3. Total

**356 files audited — 356 SÃO, 0 NÃO.**
