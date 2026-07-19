# Architecture Contract — Anti-Pollution Invariants

This document defines **absolute, non-overridable invariants** for the qa_tools
architecture. Violations are defects at the root cause and MUST be corrected at
origin (AGENTS.md §3/§4). No exception, no workaround, no temporary bypass.

These invariants were established after the T6.1-B refactor (PR-report entry-point
decoupling) and the documentation realocation (2026-07-18).

---

## G1 — PR Report entry point is unique and decoupled

- `shared/pr-report-core.ts` is a **pure library**. It MUST NOT contain a
  self-executing CLI entry point (`if (import.meta.main)` / shebang / argv parse
  at module top level).
- The ONLY entry point for PR Report is:
  `git_triggers/main.ts pr-report`
  → `cli-dispatch.ts` case `'pr-report'`
  → `runPrReport(createGitProvider)` (where `runPrReport` is the `main` export of
  `shared/pr-report-core.ts`).
- The Git provider is injected via factory (`createGitProvider`) — never imported
  directly by `shared/`.

Rationale: SRP + DIP. `shared/` is a cross-cutting library; executable entry
points and provider wiring belong to `git_triggers/`.

---

## G2 — CI `*.yml` are 100% generated

- All CI workflow files (`.github/workflows/*.yml`, `.github/actions/**/action.yml`,
  and any generated pipeline) MUST be produced exclusively by
  `shared/ci/ci-injector.ts` + `setup/templates/*`.
- **Manual editing of generated `*.yml` is prohibited.** To change CI, edit the
  TEMPLATE and regenerate via the wizard (`setup/main.ts`).
- Source of truth: `setup/templates/github-ci.ts`, `gitlab-ci.ts`,
  `qa-post-process-workflow.ts`. Generated artifacts reference
  `git_triggers/main.ts pr-report`.

Rationale: single source of generation prevents drift between templates and
generated files (root cause of the broken `qa-post-process.yml` fixed in T6.1-B).

---

## G3 — `shared/` must not import `git_triggers/`

- `shared/**` MUST NOT import from `git_triggers/**`.
- Upward dependency (library → app entry) is a layering violation. The Git
  provider and any app-level concern are injected from `git_triggers/` into
  `shared/` call sites.
- Enforcement target: ESLint `no-restricted-imports` disallowing
  `shared/ → git_triggers/` (to be added if no false positives).

---

## G4 — ZERO SCRIPTS at executable entry points

- The executable entry point lives in its module with an inline self-exec guard
  (`if (import.meta.main) { ... }`). A standalone `scripts/` wrapper around an
  existing entry point is an anti-pattern.
- `scripts/` is reserved for tooling/utilities that are NOT the canonical entry
  point of a feature.

---

## G5 — Runtime security-mechanism files are NOT documentation

- Files consumed at runtime by safety mechanisms (e.g. `audit/suppressions.yaml`,
  the immutable suppression ledger read by `scripts/audit-suppressions.ts` and
  `scripts/run-mutation.ts`) MUST remain at a stable runtime location.
- They MUST NOT be relocated into `dev/docs/` (documentation-only area) under the
  "documents are read-only" rule. Relocation breaks the consumer and is a
  system-level violation (AGENTS.md §5/§7).
- Classification rule: before moving any file, determine if it has a code/runtime
  consumer. If yes → it is runtime data, not documentation.

---

## Enforcement

| Invariant | Detection mechanism |
| --------- | ------------------- |
| G1 | Code review; `shared/pr-report-core.ts` has no self-exec guard |
| G2 | Diff review; generated `*.yml` matches template output |
| G3 | ESLint `no-restricted-imports` (target) |
| G4 | Code review; no `scripts/` wrapper around an entry point |
| G5 | Pre-move classification check; grep for consumers before relocating |

Any violation → STOP → correct at origin → revalidate. No compensation, no
duplication, no bypass.
