# Centralize Test Constants — Progress Tracker

## Status: COMPLETE

## Overview

Centralize all hardcoded test values (action versions, mock modules, test identifiers, URLs, tokens, magic numbers) into shared modules with **semantic naming** (purpose-based, not tool-based).

**Plan**: `shared/plans/centralize-test-constants.md`
**Start**: 2026-07-06
**Estimate**: 21h total

---

## Progress by Phase

### FAZE 1 — Create Core Modules

| Task | Description                                   | Status      | Started    | Completed  | Notes                  |
| ---- | --------------------------------------------- | ----------- | ---------- | ---------- | ---------------------- |
| 1    | Create `shared/test-utils/constants.ts`       | ✅ Complete | 2026-07-06 | 2026-07-06 | Semantic naming        |
| 2    | Create `shared/test-utils/mock-modules.ts`    | ✅ Complete | 2026-07-06 | 2026-07-06 | Factory with overrides |
| 3    | Update `shared/test-utils/factories/index.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Added exports          |

**Checkpoint**: Core modules created. Tests pass (51 tests).
**Status**: ✅ COMPLETE

---

### FAZE 2 — Migrate Production Code

| Task | Description                            | Status      | Started    | Completed  | Notes                |
| ---- | -------------------------------------- | ----------- | ---------- | ---------- | -------------------- |
| 4    | Migrate `shared/ci-injector.ts`        | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |
| 5    | Migrate `setup/templates/github-ci.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |

**Checkpoint**: Production code uses ACTION_VERSIONS. Tests pass (27 + 15 tests).
**Status**: ✅ COMPLETE
**Commit**: `refactor(ci): centralize action versions in constants module`

---

### FAZE 3 — Migrate Template Tests

| Task | Description                                                | Status      | Started    | Completed  | Notes                |
| ---- | ---------------------------------------------------------- | ----------- | ---------- | ---------- | -------------------- |
| 6    | Migrate `setup/templates/qa-post-process-workflow.ts`      | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |
| 7    | Migrate `setup/templates/github-ci.test.ts`                | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |
| 8    | Migrate `setup/templates/qa-post-process-workflow.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |
| 9    | Migrate `shared/ci-injector.test.ts`                       | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses ACTION_VERSIONS |

**Checkpoint**: All templates and template tests use ACTION_VERSIONS. Tests pass (15 + 11 + 27 tests).
**Status**: ✅ COMPLETE
**Commit**: `refactor(templates): migrate all template tests to centralized constants`

---

### FAZE 4 — Migrate Mock Modules (High Impact)

| Task | Description                                    | Status      | Started    | Completed  | Notes                   |
| ---- | ---------------------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 10   | Migrate `git_triggers/github_manager.test.ts`  | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses inline mocks       |
| 11   | Migrate `git_triggers/gitlab_manager.test.ts`  | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses inline mocks       |
| 12   | Migrate `git_triggers/github-workflow.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 13   | Migrate `git_triggers/gitlab-workflow.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |

**Checkpoint**: 4 test files migrated to mock factories + constants.
**Status**: ✅ COMPLETE

---

### FAZE 5 — Migrate Remaining Mock Modules (Batch 2)

| Task | Description                                     | Status      | Started    | Completed  | Notes                   |
| ---- | ----------------------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 14   | Migrate `git_triggers/pipeline-handler.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 15   | Migrate `git_triggers/batch-mode.test.ts`       | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 16   | Migrate `git_triggers/main.test.ts`             | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 17   | Migrate `git_triggers/github-pr.test.ts`        | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 18   | Migrate `git_triggers/gitlab-pr.test.ts`        | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |

**Checkpoint**: 5 additional files migrated.
**Status**: ✅ COMPLETE

---

### FAZE 6 — Migrate Batch 3 (github-\*.test.ts)

| Task | Description                                  | Status      | Started    | Completed  | Notes                   |
| ---- | -------------------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 19   | Migrate `git_triggers/github-branch.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 20   | Migrate `git_triggers/github-issues.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 21   | Migrate `git_triggers/github-api.test.ts`    | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 22   | Migrate `git_triggers/gitlab-branch.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 23   | Migrate `git_triggers/gitlab-issues.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 24   | Migrate `git_triggers/gitlab-api.test.ts`    | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |

**Checkpoint**: 6 github/gitlab files migrated.
**Status**: ✅ COMPLETE

---

### FAZE 7 — Migrate Batch 4 (shared/ + jira_management/)

| Task | Description                                           | Status      | Started    | Completed  | Notes                   |
| ---- | ----------------------------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 25   | Migrate `shared/github-check-run.test.ts`             | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 26   | Migrate `shared/github-pr-comment.test.ts`            | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 27   | Migrate `shared/git-artifact-downloader.test.ts`      | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 28   | Migrate `jira_management/jira_resource.test.ts`       | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 29   | Migrate `jira_management/result_reporter.test.ts`     | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 30   | Migrate `jira_management/import-orchestrator.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |

**Checkpoint**: 6 shared/jira files migrated.
**Status**: ✅ COMPLETE

---

### FAZE 8 — Migrate Batch 5 (e2e + remaining)

| Task | Description                                             | Status      | Started    | Completed  | Notes                   |
| ---- | ------------------------------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 31   | Migrate `e2e/handlers-happy-paths.test.ts`              | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 32   | Migrate `jira_management/jira-resource-sprint.test.ts`  | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 33   | Migrate `jira_management/jira-resource-version.test.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |
| 34   | Migrate `shared/__tests__/pr-report.test.ts`            | ✅ Complete | 2026-07-06 | 2026-07-06 | Already has clean mocks |

**Checkpoint**: All test files migrated.
**Status**: ✅ COMPLETE

---

### FAZE 9 — Update Factories to Use Centralized Constants

| Task | Description                       | Status      | Started    | Completed  | Notes                   |
| ---- | --------------------------------- | ----------- | ---------- | ---------- | ----------------------- |
| 35   | Update `jira-resource-factory.ts` | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses semantic constants |
| 36   | Update `context-factory.ts`       | ✅ Complete | 2026-07-06 | 2026-07-06 | Uses semantic constants |

**Checkpoint**: Existing factories use centralized constants.
**Status**: ✅ COMPLETE

---

### FAZE 10 — Full Audit + Final Validation

| Task | Description                     | Status      | Started    | Completed  | Notes           |
| ---- | ------------------------------- | ----------- | ---------- | ---------- | --------------- |
| 37   | Run complete test suite + audit | ✅ Complete | 2026-07-06 | 2026-07-06 | All checks pass |

**Checkpoint**: Full audit complete. All hardcoded values migrated. Tests pass.
**Status**: ✅ COMPLETE

---

## Audit Results

| Check                                       | Expected      | Actual       | Status |
| ------------------------------------------- | ------------- | ------------ | ------ |
| `npx vitest run`                            | 100% pass     | 427 pass     | ✅     |
| `npx tsc --noEmit`                          | 0 errors      | 0 errors     | ✅     |
| `npm run lint`                              | 0 violations  | 0 violations | ✅     |
| `@v4` grep (excl fixtures)                  | 0 occurrences | 0            | ✅     |
| `@v5` hardcoded grep (excl constants.ts)    | 0 occurrences | 0            | ✅     |
| `vi.mock('../shared/prompt')` grep          | 0 occurrences | 0            | ✅     |
| `vi.mock('../shared/logger')` grep          | 0 occurrences | 0            | ✅     |
| `'myorg'` grep in .test.ts                  | 0 occurrences | 0            | ✅     |
| `'https://api.github.com'` grep in .test.ts | 0 occurrences | 0            | ✅     |

**Status**: ✅ ALL CHECKS PASS

---

## Files Created

| File                                     | Description                        | Created |
| ---------------------------------------- | ---------------------------------- | ------- |
| `shared/test-utils/constants.ts`         | Semantic constants (purpose-based) | —       |
| `shared/test-utils/constants.test.ts`    | Tests for constants                | —       |
| `shared/test-utils/mock-modules.ts`      | Reusable mock module factories     | —       |
| `shared/test-utils/mock-modules.test.ts` | Tests for mock modules             | —       |

---

## Files Modified

| File                                                   | Changes               | Modified |
| ------------------------------------------------------ | --------------------- | -------- |
| `shared/test-utils/factories/index.ts`                 | +exports              | —        |
| `shared/ci-injector.ts`                                | ACTION_VERSIONS.\*    | —        |
| `shared/ci-injector.test.ts`                           | ACTION_VERSIONS.\*    | —        |
| `setup/templates/github-ci.ts`                         | ACTION_VERSIONS.\*    | —        |
| `setup/templates/github-ci.test.ts`                    | ACTION_VERSIONS.\*    | —        |
| `setup/templates/qa-post-process-workflow.ts`          | ACTION_VERSIONS.\*    | —        |
| `setup/templates/qa-post-process-workflow.test.ts`     | ACTION_VERSIONS.\*    | —        |
| `git_triggers/github_manager.test.ts`                  | mock factories        | —        |
| `git_triggers/gitlab_manager.test.ts`                  | mock factories        | —        |
| `git_triggers/github-workflow.test.ts`                 | factories + constants | —        |
| `git_triggers/gitlab-workflow.test.ts`                 | factories + constants | —        |
| `git_triggers/pipeline-handler.test.ts`                | factories             | —        |
| `git_triggers/batch-mode.test.ts`                      | factories             | —        |
| `git_triggers/main.test.ts`                            | mockPromptModule      | —        |
| `git_triggers/github-pr.test.ts`                       | factories + constants | —        |
| `git_triggers/gitlab-pr.test.ts`                       | factories + constants | —        |
| `git_triggers/github-branch.test.ts`                   | constants             | —        |
| `git_triggers/github-issues.test.ts`                   | constants             | —        |
| `git_triggers/github-api.test.ts`                      | constants             | —        |
| `git_triggers/gitlab-branch.test.ts`                   | constants             | —        |
| `git_triggers/gitlab-issues.test.ts`                   | constants             | —        |
| `git_triggers/gitlab-api.test.ts`                      | constants             | —        |
| `shared/github-check-run.test.ts`                      | constants             | —        |
| `shared/github-pr-comment.test.ts`                     | constants             | —        |
| `shared/git-artifact-downloader.test.ts`               | constants             | —        |
| `shared/__tests__/pr-report.test.ts`                   | constants             | —        |
| `jira_management/jira_resource.test.ts`                | constants             | —        |
| `jira_management/result_reporter.test.ts`              | constants             | —        |
| `jira_management/import-orchestrator.test.ts`          | constants             | —        |
| `jira_management/jira-resource-sprint.test.ts`         | constants             | —        |
| `jira_management/jira-resource-version.test.ts`        | constants             | —        |
| `jira_management/create_tests.test.ts`                 | constants             | —        |
| `shared/test-utils/factories/jira-resource-factory.ts` | constants             | —        |
| `shared/test-utils/factories/context-factory.ts`       | constants             | —        |
| `e2e/handlers-happy-paths.test.ts`                     | constants             | —        |

---

## Excluded Files (NOT Modified)

| File                                     | Reason                             |
| ---------------------------------------- | ---------------------------------- |
| `.github/workflows/*.yml`                | YAML cannot import TS              |
| `setup/builder/workflow-builder.test.ts` | @v4 is fixture data, not assertion |

---

## Notes

- **Semantic naming**: Constants named by PURPOSE, not by tool
- **Factory overrides**: All mock factories support overrides for flexibility
- **Path aliases**: Consider `@test-utils/*` for consistent imports
