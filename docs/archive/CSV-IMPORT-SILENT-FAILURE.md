# CSV Import — Silent Failure Defects (Findings)

**Date:** 2026-07-16
**Author:** QA Tools audit (adversarial import harness)
**Status:** DISCOVERED — not yet fixed. Production code defects.
**Severity:** HIGH (2 defects directly explain a reported production symptom).
**Related:** technical ledger in `docs/import-pipeline-defects.md`; proof tests in `jira_management/import-safety-harness.test.ts`.

---

## What happened

On 2026-07-15 the `TEST_SUIT.csv` suite was imported into Jira/Xray **successfully**. That worked because the file is well-formed and all referenced `ECSPOL-*` keys exist in Jira. The import code is fine for the *happy path*.

On 2026-07-16 we ran an **adversarial test** against the same import code: we fed it broken inputs (empty CSV, missing CSV file, a Jira key that does not exist) and watched how it behaves. It does **not** report errors. Instead it **silently pretends success** and returns to the menu.

> The defects are in the **qa_tools program code**, not in `TEST_SUIT.csv`. The suite file is correct.

---

## The bugs (plain language)

### BUG 1 — Empty or missing CSV file disappears silently
**Where:** `jira_management/create_tests.ts` (lines 35–42, 82) and `jira_management/commands/case01.ts` (line 47).

If the CSV file is empty, or does not exist, the program returns "nothing" and goes back to the menu **as if everything worked**. No error is shown to the user.

This is **exactly the "bounce back to the menu" symptom** previously reported and left pending. Root cause identified: the import returns an empty result, the menu handler treats that as "nothing to do" instead of "it failed", and the user sees a silent no-op.

### BUG 2 — A Jira key that does not exist is ignored
**Where:** `jira_management/issue-linker.ts` (lines 105–128).

If you point the import at an `ECSPOL-XXXX` key that does not exist in Jira, the program **does not create the link**, but **continues as if it succeeded**. The missing link vanishes without warning.

Real risk for `TEST_SUIT.csv`: if any of the referenced keys
`ECSPOL-809, ECSPOL-811, ECSPOL-814, ECSPOL-1339, ECSPOL-1534, ECSPOL-1535, ECSPOL-1538` (pre-conditions) or `ECSPOL-1162` (linked issue) is wrong or missing, the tests get created but the link is dropped silently. You would only find out later.

### BUG 3 — Failure to write the mapping report is ignored
**Where:** `jira_management/mapping-file-generator.ts` (lines 34–47).

If the final mapping report cannot be written, the program logs a warning but the import still "passes". The audit trail is silently lost.

### BUG 4 — Existing tests lock the bug in place
**Where:** `jira_management/create_tests.test.ts` (lines 766, 776).

There are tests in the project that *assert* the silent behavior is correct (they expect the result to be "nothing"). That means the bug is encoded as the expected contract and will not be caught by the test suite. This violates the project rule that tests must not enshrine defects.

---

## Why it matters for the suite

- For a **correct, complete `TEST_SUIT.csv`** with all keys present: import works (proven 2026-07-15).
- The danger is only if a key is mistyped or removed: BUG 2 then drops the link **without telling anyone**.

---

## Evidence

All four defects are **proven by failing tests** (the tests are RED on purpose — that is the proof the bug exists). See `jira_management/import-safety-harness.test.ts`. The tests are kept RED as permanent regression guards until the code is fixed at the root.

## Recommended fix order (separate authorized pass)
1. BUG 1 + BUG 4 (root: make the import return/report explicit failure instead of "nothing"; correct the codifying tests).
2. BUG 2 (make a missing Jira key a visible, blocking error instead of a silent skip).
3. BUG 3 (surface the mapping-report write failure).

## Issue generation status
The 13 `TEST_SUIT.csv` test issues were **not** generated in this session from WSL. Generation must run from **Windows PowerShell** where the corporate proxy (Zscaler) is reachable and the Atlassian IP allowlist permits egress. Command: `.\generate-testsuit.ps1`.

---

## Environment / UX bugs found while attempting generation (2026-07-16, WSL)

These are NOT in the production import code (BUG 1–4 above). They are operational
defects in how the tool is launched/driven that block headless/automated import.

### BUG 5 — No headless/batch CSV-import entry point
**Where:** `jira_management/main.ts` (only `--help`, `-h`, `--version`, `--no-clear`, `--project` flags; no `--csv` / `--auto` / `--batch` for import). Menu navigation is interactive (`showSelect` / inquirer) only.

There is no CLI flag to import a CSV non-interactively. The only path is the menu:
`Geração de Casos de Teste` → `1` (Criar testes a partir de CSV). Driving
this via piped stdin or PTY (`script`) is **non-deterministic** — the menu re-renders
and the piped inputs are not consumed in order; the session exits at the main menu
with **zero issues created** (observed: `EXIT=0`, log ends at "Até logo!", no
`createTestsFromCsv` call fired). This blocks any CI/automation use.

### BUG 6 — `DRY_RUN` mode is not headless either
**Where:** `jira_management/import-prep-parsers.ts:54` + `create_tests.ts` dry-run path.

`DRY_RUN=true` does NOT make the import headless. Observed: `createTestsFromCsv`
with `DRY_RUN=true` still opens a **browser preview** (`Preview aberto no navegador`)
and waits for an interactive confirm (`Operação cancelada` → returns `undefined`).
So even a dry-run cannot be driven from a script/PTY. The "no write" guarantee holds
(no Jira POST), but the flow is still interactive.

> Verified-good fact: with `CSV_PATH=TEST_SUIT.csv` + `DRY_RUN=true`, the real
> pipeline **parses all 13 blocks** and reaches the preview step. The CSV file is
> valid and the parser is correct. The blocker is purely the interactive shell, not the data.

### BUG 7 — WSL cannot reach Jira without the Windows corporate proxy
**Where:** `shared/proxy-config.ts:48-55` (`resolveProxyUrl`); `.env.local` `QA_PROXY_URL=http://127.0.0.1:9000`; `BACKLOG.md:147,158`.

The Jira egress proxy is a **Windows-loopback** address. From WSL:
- `curl http://127.0.0.1:9000` → `000` (proxy down / unreachable from WSL).
- Direct egress `curl https://euronext.atlassian.net` → `403` ("IP address is not
  listed in the IP allowlist") — Atlassian blocks non-corporate IPs.
- After VPN connect: direct egress → `302` (VPN IP is allowlisted), but the
  app still forces the dead `127.0.0.1:9000` proxy because `ensureDotenv()`
  reloads `QA_PROXY_URL` from `.env.local` at runtime (`shared/env-loader.ts:18`),
  so a shell `unset QA_PROXY_URL` is ineffective.

**Net:** live import from WSL is impossible. It must run from **Windows PowerShell**
where the Zscaler proxy is up and the IP is allowlisted. This is why the
2026-07-15 successful generation ran on Windows, not WSL.

### BUG 8 — `unset` of `QA_PROXY_URL` is ineffective at runtime
**Where:** `shared/env-loader.ts:18` (`dotenv.config({ path: '.env.local' })` reloads
process.env from the file on every `ensureDotenv()` call).

Even with the proxy var commented out / shell `unset`, the app re-reads `.env.local`
and restores `QA_PROXY_URL`. Confirmed: commenting the line in `.env.local` made
the app stop using `127.0.0.1:9000` (no `ECONNREFUSED`), but it then hit the
`403` allowlist. So editing `.env.local` IS the effective lever — `unset` alone is not.

---

## Recommended operational fix (separate authorized pass)
- BUG 5/6: add a headless import entry (e.g. `npx tsx jira_management/main.ts --csv TEST_SUIT.csv --auto`) that skips the menu and the browser preview confirm.
- BUG 7/8: document that live generation requires Windows+proxy; or make `resolveProxyUrl` honor an explicit empty/`DIRECT` override that survives `ensureDotenv` reload.

---

## Delivery — TEST_SUIT.csv generated (2026-07-16, WSL, VPN direct egress)

**Executed:** invoked the real `createTestsFromCsv` pipeline directly (same code path as
menu option "Criar testes a partir de CSV") with `CSV_PATH=TEST_SUIT.csv`,
`AUTO_CONFIRM=true`, proxy var disabled, VPN-connected direct egress (Jira 302).
No interactive menu (BUG 5/8 workaround — direct invocation, not the TTY menu).

**Result (factual, from run output + `reports/TEST_SUIT-jira-mapping.json`):**
- `13/13 testes criados` — STATUS: ok, 100% pass rate.
- **Generated keys (ECSPOL-15xx):**
  `1542, 1543, 1544, 1545, 1546, 1547, 1548, 1549, 1550, 1551, 1552, 1553, 1554`.
- **Pre-conditions** (all 13 issues): `ECSPOL-809, 811, 814, 1339, 1534, 1535` — present.
- **Linked issue** `ECSPOL-1162` (is a test for): linked on all 13; run log shows
  `ECSPOL-1554 -> ECSPOL-1162 (tipo: is a test for) ... 1 linked issue(s) criados`.
- **Groups** cross-referenced: `GROUP-ENDPOINT-REMOVAL` (ECSPOL-1549, 1550) descriptions updated.
- Mapping written: `reports/TEST_SUIT-jira-mapping.json` + `.md`.

**BUG 2 verification:** all referenced `ECSPOL-*` keys EXISTED in Jira, so the
silent-skip path (issue-linker.ts:105-128) was NOT triggered — links landed.
BUG 2 remains a latent defect: if any of those keys were missing, the link
would be silently dropped (proven RED by the harness). No missing-key condition
occurred in this run.

**Cleanup:** helper script `_run_import.ts` removed after run. `.env.local` left with
`QA_PROXY_URL` commented out (direct egress works via VPN).
