# Correção Jira Manager first-run — Progress Tracker

## Status: IN PROGRESS

## Overview

Corrigir na origem o crash `this._getSession is not a function` (nock no Dependency Wall de runtime),
remover o wizard first-run obrigatório do startup do jira (opt-in via menu 24), e corrigir a splash.

**Plan**: `correcao-jira-manager-first-run.md`
**Start**: 2026-08-07

---

## Progress by Phase

### Fase 0 — Diagnóstico (handlers de stack)

| Task | Description                          | Status      | Notes                                     |
| ---- | ------------------------------------ | ----------- | ----------------------------------------- |
| J-0.1 | unhandledRejection loga stack (jira) | ✅ Complete | Já existia no commit `fa98607b` (verificado) |
| J-0.2 | unhandledRejection loga stack (git)  | ✅ Complete | Já existia no commit `fa98607b` (verificado) |
| J-0.3 | tsc + suíte verde                    | ✅ Complete | 2026-08-07                                 |

**Checkpoint Fase 0**: ✅ handlers registram stack completo.

### Fase 1 — Reprodução empírica

| Task | Description                        | Status      | Notes                                       |
| ---- | ---------------------------------- | ----------- | ------------------------------------------- |
| J-1.1 | Reproduzir crash com LOG_FILE=true | ✅ Complete | `XDG_STATE_HOME=/tmp/qa-repro-state ...`     |
| J-1.2 | Extrair stack do `_getSession`     | ✅ Complete | `logs/qa-tools-2026-08-07.log:11`            |
| J-1.3 | Identificar origem                 | ✅ Complete | nock v14.0.16 ativa interceptor no import     |

**Checkpoint Fase 1**: ✅ origem identificada — `node_modules/nock/index.js:47-52`.

### Fase 2 — Correção da causa raiz do `_getSession`

| Task | Description                              | Status      | Notes                                        |
| ---- | ---------------------------------------- | ----------- | -------------------------------------------- |
| J-2.1 | Corrigir origem                          | ✅ Complete | nock removido de `shared/deps.ts`             |
| J-2.2 | TDD RED→GREEN                            | ✅ Complete | `shared/__tests__/deps-runtime.test.ts`       |
| —     | Ponte test-only `shared/__tests__/nock.ts` | ✅ Complete | Imports relativos não violam o DepWall         |

**Checkpoint Fase 2**: ✅ fluxo do jira não lança mais `_getSession`.

### Fase 3 — Wizard first-run opt-in

| Task | Description                                          | Status      | Notes                                         |
| ---- | ---------------------------------------------------- | ----------- | --------------------------------------------- |
| J-3.1 | Remover auto-chamada `maybeRunFirstRunWizard`         | ✅ Complete | `jira_management/main.ts`                      |
| J-3.2 | Corrigir dead-block `offerEnvSetup`                   | ✅ Complete | Prompt removido do startup (config no menu)    |
| J-3.3 | Atualizar testes da auto-chamada                     | ✅ Complete | `main.test.ts`                                 |
| J-3.4 | TDD RED→GREEN: wizard não roda no startup            | ✅ Complete | `main.test.ts` "first-run wizard is NOT auto-run" |

**Checkpoint Fase 3**: ✅ jira abre sem wizard obrigatório; menu 24 abre sob demanda.

### Fase 4 — Splash status real

| Task | Description                     | Status      | Notes |
| ---- | ------------------------------- | ----------- | ----- |
| J-4.1 | Passar credenciais reais à splash | ✅ Complete | `initStartup` usa `_isJiraConfigured()` |
| J-4.2 | Consistência git_triggers/entry  | ✅ Complete | `shared/jira/config.ts` `isJiraConfigured()` nos 3 call-sites |
| J-4.3 | TDD splash com credenciais       | ✅ Complete | `shared/__tests__/jira-config.test.ts` (5) + splash.test.ts |

**Checkpoint Fase 4**: ✅ concluída.

### Fase 5 — Validação completa

| Task | Description                       | Status      | Notes |
| ---- | --------------------------------- | ----------- | ----- |
| J-5.1 | tsc --noEmit                      | ✅ Complete | 2026-08-07 |
| J-5.2 | vitest run completo + quality-check | ✅ Complete | 544 files / 7365 tests; quality-check 20/20 |
| J-5.3 | lint, depcruise, unused-exports   | ✅ Complete | depcruise 0 violações; unused-exports limpo |
| J-5.4 | Commit por mudança + push + CI    | ⬜ pendente  | aguardando autorização do usuário |

**Checkpoint Fase 5**: ✅ validação completa verde (J-5.1..J-5.3); J-5.4 aguarda commit.

### Fase 6 — UX: flags `[MIGRADO]` na seleção de projeto (adicional)

| Task | Description                                  | Status | Notes |
| ---- | -------------------------------------------- | ------ | ----- |
| J-6.1 | Remover `[MIGRADO]` de `displayProjects`     | ⬜      |       |
| J-6.2 | Preservar proteção D-U4 em manage            | ⬜      |       |
| J-6.3 | TDD RED→GREEN (sem MIGRADO, mantém INVÁLIDO) | ⬜      |       |

**Checkpoint Fase 6**: ⬜ pendente.

---

## Commits

| Commit | Conteúdo   | Status |
| ------ | ---------- | ------ |
| J-2    | nock fix   | ⬜ não commitado |
| J-3    | wizard opt-in | ⬜ não commitado |
