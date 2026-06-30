# Relatório de Inconformidades — 2026-06-29

## Resumo Executivo

| Categoria    | Ferramenta       | Status     | Violations       |
| ------------ | ---------------- | ---------- | ---------------- |
| Core         | TypeScript (tsc) | ✅ PASS    | 0                |
| Core         | Quality Gate     | ⏱️ TIMEOUT | —                |
| Core         | Vitest           | ❌ FAIL    | 18 test failures |
| Security     | Gitleaks         | ✅ PASS    | 0                |
| Security     | OSV Scanner      | ⚠️ WARN    | 1 MEDIUM         |
| Security     | npm audit        | ⚠️ WARN    | 4 moderate       |
| Security     | Scan Sec Logs    | ❌ ERROR   | Script bug       |
| Security     | Rule Vigilant    | ✅ PASS    | 0                |
| Architecture | DepCruise        | ✅ PASS    | 0                |
| Architecture | Knip (unused)    | ⚠️ WARN    | 187 items        |
| Architecture | Type Coverage    | ✅ PASS    | 99.94%           |
| Structural   | Structural Audit | ⚠️ WARN    | 1 HIGH           |
| Structural   | D7 Bad Testing   | ❌ FAIL    | 55 violations    |
| Structural   | SOP Audit        | ❌ FAIL    | 45 violations    |
| Structural   | UX Auditor       | ⚠️ WARN    | 17 findings      |
| Formatting   | Prettier         | ❌ FAIL    | 290 files        |
| Dependencies | Lockfile Lint    | ✅ PASS    | 0                |
| Integrity    | Verify Registry  | ✅ PASS    | 0                |
| Integrity    | OpenCode Guard   | ✅ PASS    | 0                |
| Validation   | Validation Hook  | ✅ PASS    | 51/51            |

**Total: 6 PASS, 4 FAIL, 5 WARN, 1 TIMEOUT, 4 PASS (integrity)**

---

## 1. Vitest — 18 Test Failures

### scripts/opencode-db-maintenance.test.ts (4 failures)

| Test                                | Erro                                 |
| ----------------------------------- | ------------------------------------ |
| `prints PASS when no errors`        | `console.log` not called with "PASS" |
| `prints FAIL with error details`    | `console.log` not called with "FAIL" |
| `returns 0 when database not found` | `console.log` not called             |
| `returns 0 for check-only mode`     | `console.log` not called             |

**Causa raiz:** Mock de `console.log` não está interceptando chamadas. O código usa `rootLogger.info()` em vez de `console.log`.

### shared/logger.test.ts (12 failures)

| Test                                      | Erro                                                                |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `creates the log file when LOG_FILE=true` | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `writes a log line with INFO level`       | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `writes a log line with WARN level`       | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `writes data param as JSON`               | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `has no ANSI escape codes`                | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `writes ERROR level correctly`            | `TypeError: Cannot read properties of undefined (reading '_write')` |
| `sets _fileError on mkdir failure`        | `console.error` not called                                          |
| `logs error on rename failure`            | `console.error` not called                                          |
| `sets _fileError on append failure`       | `console.error` not called                                          |
| `appends short JSON data to ERROR`        | `console.error` not called                                          |
| `omits data when data is long`            | `Expected non-nullable value, got undefined`                        |
| `_writeConsole with unknown level`        | `console.log` not called                                            |

**Causa raiz:** Mock de `fs` não está retornando `readFileSync` (vi.mock incompleto). Erro: `[vitest] No "readFileSync" export is defined on the "node:fs" mock`.

### shared/state.test.ts (2 failures)

| Test                                 | Erro                                              |
| ------------------------------------ | ------------------------------------------------- |
| `copies old state to new path`       | `renameSync` not called                           |
| `logs warn when readFileSync throws` | `mockRootLogger.warn` called with wrong arguments |

**Causa raiz:** Mock de `fs` não está funcionando corretamente para `renameSync`.

---

## 2. D7 Bad Testing — 55 toThrow() Violations

**Regra D7.5:** `toThrow()` sem argumento específico é proibido.

55 ocorrências em 30+ arquivos usando `expect(...).not.toThrow()` ou `expect(...).resolves.not.toThrow()` sem argumento.

**Arquivos afetados (principais):**

- `shared/splash.test.ts` (12 ocorrências)
- `shared/config-validator.test.ts` (4 ocorrências)
- `shared/llm-rate-limiter.test.ts` (5 ocorrências)
- `shared/disk-cache.test.ts` (4 ocorrências)
- `shared/first-run.test.ts` (3 ocorrências)
- `jira_management/dashboard-handlers.test.ts` (4 ocorrências)

**Ação:** Cada `toThrow()` sem argumento deve especificar o tipo de erro esperado.

---

## 3. SOP Audit — 45 Violations

### Phase 2 — Entry Points & Config

- **D2.1** Entry points: 38 violações (variáveis reatribuídas com `let` que poderiam ser `const`)
- **D2.2** Config model: 1 violação

### Phase 3 — Code Quality

- **D7.1** toThrow without argument: 55 violações (mesmo do D7)
- **D11.4** Object.entries propagation: 259 ocorrências
- **D11.5** I/O sem try/catch: 1 ocorrência
- **D11.6** Empty catch: 0 ocorrências
- **D11.7** DepWall violations: 0 ocorrências
- **D11.8** Magic constants: 12 ocorrências
- **D11.9** Division without guard: 3 ocorrências
- **D11.10** Falsy coalescence: 1 ocorrência
- **D11.11** Reduce sem initial value: 1 ocorrência
- **D11.12** Deep clone via JSON: 1 ocorrência
- **D11.13** typeof object without null check: 15 ocorrências
- **D11.14** for-in on arrays: 1 ocorrência
- **D11.15** Unvalidated Date: 3 ocorrências
- **D11.16** Console in production: 0 ocorrências
- **D11.17** Parameter reassignment: 259 ocorrências
- **D11.18** var hoisting: 1 ocorrência (`shared/html-factory.ts:58`)

---

## 4. Prettier — 290 Files

290 arquivos com problemas de formatação. Distribuição:

- `shared/` — ~120 arquivos
- `jira_management/` — ~50 arquivos
- `git_triggers/` — ~30 arquivos
- `e2e/` — ~20 arquivos
- `scripts/` — ~15 arquivos
- `setup/` — ~5 arquivos

**Ação:** `npx prettier --write '**/*.{ts,js,json}'`

---

## 5. Knip — Unused Exports (187 items)

| Categoria                    | Qtd |
| ---------------------------- | --- |
| Unused files                 | 7   |
| Unused devDependencies       | 4   |
| Unlisted binaries            | 5   |
| Unused exports               | 65  |
| Unused exported types        | 109 |
| Unused exported enum members | 2   |

**Total: 187 itens para revisar e potencialmente remover.**

---

## 6. Structural Audit — 1 HIGH Finding

**HTML wrapper boilerplate:** 6 arquivos geram páginas HTML completas.

- 3 arquivos ainda usam `qa-report-theme` em vez de `qa-theme`
- **Ação:** Migrar para `shared/html-factory.ts buildHtmlPage()`

---

## 7. UX Auditor — 17 Dead Utilities

17 exports chamados apenas de testes, nunca de código de produção:

- `shared/analysis-validator.ts` — 5 invariant functions
- `shared/bug-report-validator.ts` — 4 invariant functions
- `shared/comparison-validator.ts` — 3 invariant functions
- `shared/pipeline-validator.ts` — 3 invariant functions
- `shared/test-utils.ts` — `nullAs` function
- `shared/validation.ts` — `parseOrThrow` function

---

## 8. Vulnerabilidades

### OSV Scanner (1 MEDIUM)

- **js-yaml <=4.1.1** — Quadratic-complexity DoS in merge key handling
- **CVSS:** 5.3
- **Fix:** `npm audit fix --force` (breaking change: lockfile-lint downgrade)

### npm audit (4 moderate)

- Todas relacionadas a `js-yaml` via `@yarnpkg/parsers` → `lockfile-lint-api` → `lockfile-lint`

---

## 9. Script Bugs

### scan-sec-logs.sh (line 71)

```
scripts/scan-sec-logs.sh: line 71: 0
0: syntax error in expression (error token is "0")
```

**Causa:** Expressão aritmética mal formada.

---

## Priorização de Correção

### P0 — Crítico (bloqueia CI)

1. Corrigir 18 test failures (logger.test.ts, opencode-db-maintenance.test.ts, state.test.ts)
2. Corrigir bug em scan-sec-logs.sh

### P1 — Alto

3. Rodar `npx prettier --write` para corrigir 290 arquivos
4. Corrigir 55 toThrow() violations (especificar tipo de erro)
5. Corrigir bug em quality-check.ts (timeout)

### P2 — Médio

6. Revisar 187 unused exports do Knip
7. Corrigir 1 violação de `var` em html-factory.ts
8. Migrar HTML wrappers para buildHtmlPage()

### P3 — Baixo

9. Atualizar js-yaml (dependência vulnerável)
10. Revisar 17 dead utilities do UX Auditor
