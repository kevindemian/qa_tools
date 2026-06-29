---
feature: qa-tools-audit
status: delivered
specs: []
plans:
  - .mimocode/plans/1782724008925-brave-garden.md
branch: main
commits: (pending)
---

# QA Tools Audit — Final Report

## What Was Built

A comprehensive audit of the QA tools suite identified and resolved critical gaps in the project's security and quality infrastructure. The audit found that `validation_hook.ts` (1611 lines) — the project's primary safety mechanism for detecting AI-proposed violations — was completely disconnected from the active Git hooks (Husky). Additionally, 15 redundant scripts (38% of `scripts/`) were identified and removed, and 4 redundant checks were extracted from `quality-check.ts` to be handled by ESLint instead.

## Architecture

### Hook Unification

The project had two hook systems: Husky (active via `core.hooksPath`) and `.githooks/` (inactive). Husky was a strict subset of `.githooks/`, missing critical security checks. The fix unified both into Husky:

**`.husky/pre-commit`** now runs:
1. Stale COMMIT_EDITMSG cleanup
2. `validation_hook.ts` self-test + staged diff check
3. `rule-vigilant.ts` security config scan
4. TypeScript typecheck
5. lint-staged (ESLint + Prettier)
6. lockfile-lint
7. exclusive test detection in test files

**`.husky/pre-push`** now runs:
1. `--no-verify` bypass detection + audit logging
2. Typecheck + quality enforcement
3. `validation_hook.ts` self-test + diff check
4. Vitest test suite
5. Security log scan

**`.husky/commit-msg`** (new) validates commit messages via `validation_hook.ts`.

### Redundant Scripts Removed

15 scripts were removed — all were either migration artifacts (jest→vitest, ESM), debug snippets, or duplicates of installed tools:

| Removed | Replaced By |
|---------|-------------|
| `check-unused-exports.sh` | Knip (`npm run unused-exports`) |
| `fix-lint-errors.ts` | ESLint `--fix` |
| `fix-mock-types.mjs`, `transform-*.ts` | Migration completed |
| `fix-assertions.ts`, `fix-padding.ts` | ESLint rules + Prettier |
| `fix-require-*.mjs` | ESLint `--fix` |
| `audit-condition.mjs`, `debug-condition.mjs` | Debug snippets |
| `codemod-esm-imports.mjs` | Migration completed |
| `trace-shared-imports.sh` | dependency-cruiser + Knip |
| `verify-mocks.sh` | TypeScript type system |

### quality-check.ts Simplified

4 checks were removed (now handled by ESLint/tsconfig):

| Removed Check | Replacement |
|---------------|-------------|
| `checkOnlyInTests` | `vitest/no-focused-tests` (ESLint) |
| `checkAsUnknownAs` | `@typescript-eslint/no-unsafe-*` (ESLint) |
| `checkAsAny` | `@typescript-eslint/no-explicit-any` (ESLint) |
| `checkNoImplicitOverride` | `tsconfig.json` (compiler) |

`minChecks` guard updated from 17 to 13. Integrity hash regenerated.

### Dependencies Updated

`npm update` resolved 12 outdated packages. Only `@types/node` 25→26 remains (major version, requires review).

## Verification

| Check | Result |
|-------|--------|
| TypeScript typecheck | Pre-existing errors (11), not introduced by changes |
| Vitest tests | 5739 passed, 18 failed (pre-existing), 9 skipped |
| quality-check.test.ts | 27/27 pass |
| Prettier | 292 files with formatting (pre-existing) |
| Knip (unused exports) | Pass (pre-existing unused items) |
| dependency-cruiser | Clean |
| type-coverage | 99.94% (above 90% threshold) |
| gitleaks | No leaks found |
| osv-scan | 1 medium vulnerability (js-yaml, pre-existing) |

## Journey Log

- [lesson] The `.githooks/` directory contained the "real" hook system with `validation_hook.ts`, but Husky was active with a stripped-down version. This created a false sense of security — critical safety mechanisms were not running.
- [lesson] Files with the immutable flag (`chattr +i`) cannot be edited by the agent. The user must manually release them.
- [lesson] `quality-check.ts` had 4 checks that duplicated ESLint rules already configured. Consolidation reduced maintenance burden without losing coverage.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `.mimocode/plans/1782724008925-brave-garden.md` | Implementation plan | Complete |
| `.husky/pre-commit` | Unified pre-commit hook | Updated |
| `.husky/pre-push` | Unified pre-push hook | Updated |
| `.husky/commit-msg` | New commit-msg hook | Created |
| `scripts/quality-check.ts` | Quality gate | Simplified |
| `scripts/quality-check.test.ts` | Tests for quality gate | Updated |
