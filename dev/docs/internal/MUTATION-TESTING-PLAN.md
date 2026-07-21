# Mutation Testing + Strict TDD Enforcement Plan

## Overview
This plan implements mutation testing with PR-scoped mutation via `tautest` + test selection via `vitest-affected`. Target: ≥60% mutation score on PR diffs (blocking CI gate).

**Decisões arquiteturais (2026-07-21):**
- Mutation rodará em **CI (PR, blocking)** como required check, não em pre-push
- Stryker scoped ao diff do PR via `tautest` (não roda no repositório inteiro)
- Otimização de CI (paralelizar qualidade, `--diff-only`) será feita após mutation estar funcional (fase posterior)

---

## Status atual (2026-07-21)

| Item | Status |
|------|--------|
| Dependências instaladas | ✅ `tautest`, `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `vitest-affected`, `fast-check` |
| Property-based tests (`fast-check`) | ✅ 59+ `.property.test.ts` files |
| ESLint vitest rules | ✅ 30+ rules em `eslint.config.mjs` |
| `stryker.conf.json` | ✅ criado, não commitado |
| `tautest.config.json` | ✅ criado, não commitado |
| `vitest.config.ts` (vitest-affected) | ✅ modificado, não commitado |
| `ci.yml` mutation job | ✅ criado (diff), não commitado |
| `check-mock-chains.ts` | ❌ não criado |
| `audit-mock-boundaries.ts` | ❌ não criado (fase posterior) |

---

## Phase 1: Mutation Testing Setup

### 1.1 Install Dependencies
```bash
npm install -D tautest @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker vitest-affected
```
✅ **Concluído** — todos instalados em `package.json`.

### 1.2 Configure Stryker
✅ `stryker.conf.json` criado (não commitado):
- `mutate: ["shared/", "jira_management/", "git_triggers/"]` (tautest scopa ao diff)
- `thresholds: { high: 80, low: 60, break: 60 }`
- `concurrency: 1, timeoutMS: 300000` (evita timeout em CI)
- `ignorePatterns` exclui `scripts/quality-check.ts` e testes associados

### 1.3 Configure Tautest
✅ `tautest.config.json` criado (não commitado):
- `runner: vitest`, `base: origin/main`, `threshold: 60`
- `maxChangedLines: 200` — pula PRs grandes
- `promptStyle: opencode`

### 1.4 Configure vitest-affected
✅ Modificado em `vitest.config.ts` (não commitado):
- Plugin com `fullSuiteTriggers`, `staleCacheDays: 14`, `maxSelectiveRuns: 50`
- Shadow mode `VITEST_AFFECTED_SHADOW=1`

### 1.5 Initialize & Validate
⬜ A executar:
```bash
npx tautest init --yes --runner vitest --no-install
npx tautest doctor
npx vitest run --reporter=verbose 2>&1 | head -50
```

### 1.6 Target Modules for Mutation Testing
- `shared/report/coverage-gap.ts`
- `shared/report/backlog-health.ts`
- `shared/quality/health-score.ts`
- `shared/result_parser.ts`
- `shared/report/bug-report.ts`

---

## Phase 2: CI Enforcement

### 2.1 Mutation CI Job
Mutation rodará como **job blocking no CI de PR** (`ci.yml`), não em workflow separado:
- Dispara apenas em `pull_request`
- `timeout-minutes: 15` para evitar runaway cost
- `needs: quality` — só executa se quality passou
- Report upload em `.tautest/`
- Required check no GitHub para merge

### 2.2 Mock Chain Limit Check
⬜ Criar `scripts/check-mock-chains.ts`:
- Detecta `mockResolvedValueOnce().mockResolvedValueOnce()` chain > 2 sem comentário de paginação
- Será integrado ao pre-commit ou CI posteriormente

---

## Phase 3-4 (postergadas)

- **Phase 3:** Property-Based Tests — já extensos (59+ arquivos), tracking contínuo
- **Phase 4:** Mock Boundary Audit — `scripts/audit-mock-boundaries.ts` a criar

---

## Pipeline Resultante

```
Pre-commit: typecheck + lint-staged (~55s)
Pre-push: typecheck + quality + lint-staged (~40s)
CI:
  quality (sequencial) → test matrix (22+24) → post-process
  mutation (blocking, PR-only, after quality)
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Mutation score (PR diff) | ≥60% |
| CI mutation gate passes | All PRs |
| Mock chain violations | 0 |

---

## Rollback Plan
If mutation testing causes CI instability:
1. Disable CI gate: `threshold: 0` in `stryker.conf.json`
2. Keep local `tautest run` for developers
3. Shadow mode `VITEST_AFFECTED_SHADOW=1` for CI validation
4. Re-enable after 2 weeks of stable runs