# Import Pipeline — Defect Ledger (CSV → Jira/Xray)

**Scope:** adversarial bug-discovery in the CSV→Jira (Xray) test-import pipeline.
**Method:** real pipeline functions driven with malformed/edge inputs; assertions against AGENTS.md invariants (§25 zero-silencing, §24 guards, §4 root-cause, §19.5 tests-are-not-authority).
**Harness:** `jira_management/import-safety-harness.test.ts` — one RED→GREEN test per bug, each a permanent regression guard. Run: `npx vitest run jira_management/import-safety-harness.test.ts`.

> All defects below are proven by failing tests (RED), not inferred. Fixes require root-cause correction in a separate authorized pass — these tests must stay RED until then.

---

## D2 / D3 — Missing vs empty CSV both collapse to `undefined` (indistinguishable)

- **Evidence:** `create_tests.ts:35-37` (empty → `return undefined`), `:40-42` (read error → `return undefined`), `:82` (`if (!tests) return;`).
- **Observed:** `createTestsFromCsv` returns `undefined` for BOTH an empty CSV (reads OK, 0 blocks) AND a missing file (fs rejects). The two distinct failure modes are indistinguishable to the caller.
- **Expected (AGENTS.md §25.2 / §25.3):** explicit, distinguishable failure. Consumer must tell "file missing" apart from "file empty"; neither may be silently swallowed as `undefined`.
- **Severity:** HIGH — root cause of the "CSV option bounces back to menu with no explanation" symptom.
- **Proven by:** `D2: EMPTY csv ...` and `D2: MISSING csv ...` (both RED).
- **Corrolary D3:** `createTestsFromCsv` return type `Promise<Result | undefined>` lets ANY read failure vanish.

## D4 — `case01` handler treats `undefined` as a silent no-op

- **Evidence:** `commands/case01.ts:47-57`. `createTestsFromCsv` returns `undefined` *without throwing* → `if (result)` is false → **no `pushHistory`, no user message, no error**. Handler returns to menu looking successful.
- **Observed:** a failed/empty CSV import produces a silent no-op. The menu "bounce" the user reported is this path.
- **Expected (AGENTS.md §25):** the import must surface failure explicitly (history entry with `error` status, or a thrown/returned error). Silent success-looking no-op is prohibited.
- **Severity:** HIGH — directly explains the reported production symptom.
- **Status:** documented corollary of D3; not separately RED-tested (consequence of D2/D3).

## D5 — Non-existent referenced Jira key is silently swallowed as `"skip"`

- **Evidence:** `issue-linker.ts:105-113` (precondition) and `:124-128` (linked issues). Downstream `linkManager` throws on unresolvable key (`precondition-importer.ts:42-47`); the catch converts it to `ActionResult` via `onError(...)`. `onError` may return `'skip'` (`shared/prompt-errors.ts:23`), which `linkTestRelations` (`import-loop.ts:105,117-120`) treats as **non-fatal** → link dropped, import still "succeeds".
- **Observed:** `associatePrecondition` / `linkIssues` return `{ action: 'skip' }` for a missing key `ECSPOL-0000`. The create still reports success; the missing link is invisible.
- **Expected (AGENTS.md §25.3):** a missing referenced key is a data-quality failure that must be explicit — not auto-skipped. "Best effort" skip that hides failures is prohibited (§25.1).
- **Severity:** HIGH — `TEST_SUIT.csv` references `ECSPOL-809/811/814/1339/1534/1535/1538` + `ECSPOL-1162`; any typo/pre-existence gap is silently lost.
- **Proven by:** `D5: missing Pre-condition key ...` and `D5: missing Linked Issue key ...` (both RED, received `{ action: 'skip' }`).

## D6 — Mapping-file generator swallows directory-creation failure

- **Evidence:** `mapping-file-generator.ts:34-47`. The `mkdirSync` guard catches failure, `rootLogger.warn(...)`, and `return`s. The return value of `generate()` is discarded by the orchestrator (`import-orchestrator.ts:188-189`), so a failed mapping-file write is invisible to the import result.
- **Observed:** `generate()` with a throwing `mkdirSync` does NOT throw — failure swallowed (warn+return).
- **Expected (AGENTS.md §5 safety-mechanism immutability, §25):** a write/dir failure in a reporting safety mechanism must be observable (throw or error status), not silently absorbed.
- **Severity:** MEDIUM — mapping files are non-blocking side effects, but silent loss of the audit trail violates §25.
- **Proven by:** `D6: generate() must surface directory-creation failure ...` (RED).

## D7 — Existing tests codify the silent-`undefined` contract (§19.5 violation)

- **Evidence:** `create_tests.test.ts:766` (`expect(result).toBeUndefined()` for empty CSV) and `:776` (`expect(result).toBeUndefined()` for read error).
- **Observed:** the suite asserts the DEFECTIVE behavior as the expected contract.
- **Expected (AGENTS.md §19.5 / §8):** tests define correctness of *implementation* relative to requirements, not the reverse. These expectations must be corrected to assert explicit failure once D2/D3 are fixed at root.
- **Severity:** HIGH (process defect) — locks the bug in place.
- **Status:** documented; must be corrected in the fix pass (do NOT weaken the new RED harness to match).

---

## Summary

| ID | Location | Class | Severity | Red test |
|----|----------|-------|----------|----------|
| D2/D3 | `create_tests.ts:35-42,82` | SILENT-SWALLOW | HIGH | ✓ (2) |
| D4 | `commands/case01.ts:47-57` | SILENT-SWALLOW | HIGH | doc-only |
| D5 | `issue-linker.ts:105-128` | NON-FATAL-CATCH | HIGH | ✓ (2) |
| D6 | `mapping-file-generator.ts:34-47` | NON-FATAL-CATCH | MED | ✓ (1) |
| D7 | `create_tests.test.ts:766,776` | TEST-AS-DEFECT | HIGH | doc-only |

**Recommended fix order (separate authorized pass):** D2/D3 (root: make `createTestsFromCsv` return explicit result/throw) → D4 (surface in `case01`) → D5 (make missing-key non-fatal-skip into explicit error) → D6 (surface generator failure) → D7 (correct codifying tests to match fixed behavior).

---

## BUG5 — No headless entry point for CSV import (CI/automation cannot run import non-interactively)

- **Evidence:** `main.ts` only launches the interactive `runMainLoop`; there was no `--csv <path>` / `--auto` flag wired to `createTestsFromCsv`. Automation had to drive the menu or script `stdin`.
- **Observed:** importing via CSV from CI required interactive prompts; failures could not be detected via exit code because the path did not exist.
- **Expected (UX principle — recoverable errors must expose a recovery path; CI needs deterministic non-zero exit on failure):** a headless entry that runs the real pipeline, prints an explicit result, and exits `0` on success / non-zero on any explicit failure.
- **Severity:** MEDIUM (automation/CI gap).
- **Status:** RESOLVED. `main.ts` now parses `--csv <path>` (and `--auto` with `CSV_PATH` env), calls `createTestsFromCsv` directly, prints the `summary`, and calls `gracefulExit(ExitCode.ERROR)` on any `!outcome.ok` or thrown error. Verified: missing/empty/unreadable CSV and Jira-unreachable errors all exit non-zero with an explicit message; no interactive prompt is shown.

---

## Resolution status (fix pass applied)

| ID | Fix | Verification |
|----|-----|--------------|
| D2/D3 | `readCsvTests`/`readJsonTests` return explicit `ReadTestsResult`; `createTestsFromCsv`/`Json` return `CsvImportOutcome` (never `undefined`). Empty vs missing vs read-error remain distinguishable. | `import-safety-harness.test.ts` d2/d3 GREEN |
| D4 | `case01.ts` treats `!result.ok` with `warn` + `pushHistory(..., 'error')` + `return` (no silent no-op). | `case01.integration.test.ts` FT-41d GREEN |
| D5 | `issue-linker.ts` `isMissingKeyError` + abort with `missingKey`; `failedLinks` threaded through loop → orchestrator → `summary` (`N vínculo(s) perdido(s): KEY`). Recoverable 403/network errors keep `onError`. | `import-safety-harness.test.ts` d5a/d5b GREEN |
| D6 | `MappingFileGenerator.generate` throws on dir/write failure (cause preserved); dead path-traversal guards removed. | `import-safety-harness.test.ts` d6 GREEN |
| D7 | `create_tests.test.ts:766,776` corrected to assert explicit failure; all consumers (`case01`, `case15`, `handlers`, e2e, integration) updated to the new contract. | `create_tests.test.ts`, `handlers.test.ts`, `case15.test.ts` GREEN |
| BUG5 | Headless `--csv`/`--auto` entry in `main.ts` with deterministic exit codes. | manual `tsx main.ts --csv` smoke (exit 1 on failure) |

**Validation:** `npx tsc --noEmit` clean; `npm run lint` clean (pre-existing `fs` non-literal warnings only); full `jira_management` suite GREEN (1044 tests). No workarounds, no silenced errors, no safety-mechanism weakening.

