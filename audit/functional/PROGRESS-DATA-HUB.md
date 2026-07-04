# Progress — Data Hub Refactoring

## Sprint 1 — Fase 0: Fundação + Fase 1: Compute

**Início:** 2026-07-04
**Conclusão:** 2026-07-04
**Plano:** `.mimocode/plans/data-hub-layered-architecture.md` (v2)

---

### Fase 0 — Fundação

| ID  | Tarefa                        | Status | Data       |
| --- | ----------------------------- | ------ | ---------- |
| 001 | Criar estrutura de diretórios | ✅     | 2026-07-04 |
| 002 | Criar `providers/types.ts`    | ✅     | 2026-07-04 |
| 003 | Criar `types/data-hub.ts`     | ✅     | 2026-07-04 |
| 004 | Barrel em `types.ts`          | ✅     | 2026-07-04 |
| 005 | Criar `compute/types.ts`      | ✅     | 2026-07-04 |

**Checkpoint:** `npx tsc --noEmit` = 0 erros ✅

---

### Fase 1 — Compute

| ID  | Tarefa                                       | Status | Data       |
| --- | -------------------------------------------- | ------ | ---------- |
| 010 | `compute/pass-rate.ts` + teste + PBT         | ✅     | 2026-07-04 |
| 011 | `compute/avg-duration.ts` + teste + PBT      | ✅     | 2026-07-04 |
| 012 | `compute/suite-speed.ts` + teste + PBT       | ✅     | 2026-07-04 |
| 013 | `compute/flaky-rate.ts` + teste + PBT        | ✅     | 2026-07-04 |
| 014 | `compute/failure-reasons.ts` + teste + PBT   | ✅     | 2026-07-04 |
| 015 | `compute/branch-health.ts` + teste + PBT     | ✅     | 2026-07-04 |
| 016 | `compute/coverage.ts` + teste + PBT          | ✅     | 2026-07-04 |
| 017 | `compute/trends.ts` + teste + PBT            | ✅     | 2026-07-04 |
| 018 | `compute/scoring.ts` + teste + PBT           | ✅     | 2026-07-04 |
| 019 | `compute/release-score.ts` + teste + PBT     | ✅     | 2026-07-04 |
| 020 | `compute/quarantine-status.ts` + teste + PBT | ✅     | 2026-07-04 |
| 021 | Barrel `compute/index.ts`                    | ✅     | 2026-07-04 |
| 022 | Suite de integração compute                  | ✅     | 2026-07-04 |

**Checkpoint:** `npx vitest run shared/data-hub/` = 174/174 ✅

---

### Correções D5 — Conformidade Normativa

| ID  | Correção                                     | Status | Data       | Commit   |
| --- | -------------------------------------------- | ------ | ---------- | -------- |
| D5  | D5.10 — Referências normativas em types.ts   | ✅     | 2026-07-04 | 9e84029b |
| D5  | D5.5 — Tratamento de outliers (IQR)          | ✅     | 2026-07-04 | 9e84029b |
| D5  | D5.8 — Clamp consistente em todas as funções | ✅     | 2026-07-04 | 9e84029b |

---

### Validação Final Sprint 1

| Verificação                  | Status |
| ---------------------------- | ------ |
| `npx tsc --noEmit` = 0 erros | ✅     |
| `npx eslint` = 0 errors      | ✅     |
| `npx vitest run` = 100%      | ✅     |
| `npx vitest run` = 100% pass | ⏳     |
| `npm run lint` = 0 violações | ⏳     |

---

## Sprint 2 — Reorganização + Correção de Bloqueadores

**Início:** 2026-07-04

### Fase 0 — Organização

| ID  | Tarefa                                   | Status | Data       |
| --- | ---------------------------------------- | ------ | ---------- |
| 0.1 | Criar tarefas 010a/010b no plano         | ✅     | 2026-07-04 |
| 0.2 | Stash do estado atual                    | ✅     | 2026-07-04 |
| 0.3 | Verificar PROGRESS-DATA-HUB.md commitado | ✅     | 2026-07-04 |
| 0.4 | Pop stash                                | ✅     | 2026-07-04 |
| 0.5 | Validar estado (tsc + vitest)            | ✅     | 2026-07-04 |

**Checkpoint:** Working tree organizado. 1 TS error conhecido (gitlab-workflow.ts:93). 174/174 data-hub tests passam.

---

### Fase 2 — Providers

**Início:** 2026-07-04
**Conclusão:** 2026-07-04

| ID  | Tarefa                                | Status | Data       |
| --- | ------------------------------------- | ------ | ---------- |
| 031 | `getJobLogs` na interface GitProvider | ✅     | 2026-07-04 |
| 032 | GitHub Provider + 5 testes            | ✅     | 2026-07-04 |
| 033 | GitLab Provider + 5 testes            | ✅     | 2026-07-04 |
| 034 | Coverage Provider + 4 testes          | ✅     | 2026-07-04 |
| 035 | Jira Provider + 4 testes              | ✅     | 2026-07-04 |
| 036 | Composite Provider + 6 testes         | ✅     | 2026-07-04 |
| 037 | Integration test providers            | ✅     | 2026-07-04 |

**Correções de TS durante Fase 2:**

- `PipelineJob`: campos de timing → `string | undefined` / `number | undefined` (exactOptionalPropertyTypes)
- `coverage-provider.ts`: `coverage` propriedade omitida quando `undefined`
- `jira-provider.ts`: `resolution` propriedade removida do objeto (usa omit pattern)
- `gitlab-workflow.ts:93`: job mapping inclui timing mesmo quando undefined
- Mock objects: adicionado `getJobLogs` em 7 arquivos de teste

**Checkpoint:**

- `npx tsc --noEmit` = 0 erros ✅
- `npx vitest run shared/data-hub/` = 29 files, 202 tests, 0 failures ✅
- `npx vitest run shared/data-hub/__tests__/integration/providers.integration.test.ts` = 4/4 ✅

---

### Fase 3 — Hub + Cache (próxima)
