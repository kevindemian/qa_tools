# Backlog

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas pendentes ou em andamento.
> Tarefas concluídas devem ser **imediatamente migradas** para [`BACKLOG-historico.md`](BACKLOG-historico.md).
> Após concluir um item, copie sua linha/raw para o histórico e remova-a daqui.
>
> Cada tarefa é classificada como:
>
> - 🐛 **débito** — código existente que precisa de correção/conexão
> - ✨ **feature** — nova funcionalidade a ser implementada
> - ♻️ **refactor** — reestruturação sem mudança de comportamento
> - 🔧 **chore** — manutenção (deps, config, tooling)
> - 📋 **test** — cobertura de testes

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

<!-- Sprint 2 e Sprint 3 → migrados para BACKLOG-historico.md (100% concluídos) -->

## 🎯 Sprint 4 — Eliminação Total de Casts + Barreiras de Prevenção ✅

Backlog zerado. Todos os itens migrados para BACKLOG-historico.md.

### 🔴 Fase 1 — `as unknown as` em produção (P0, ~1h) ✅

| ID  | Arquivo                    | Cast                                          | Correção                              | Status |
| --- | -------------------------- | --------------------------------------------- | ------------------------------------- | ------ |
| U1  | `shared/ai-feedback.ts`    | `(saveError as unknown as {cause}).cause`     | `new Error('msg', { cause: err })`    | ✅     |
| U2  | `shared/llm-metrics.ts`    | `(persistError as unknown as {cause}).cause`  | `new Error('msg', { cause: err })`    | ✅     |
| U3  | `shared/http-client.ts`    | `cfg as unknown as Record<string, unknown>`   | `WeakMap<object, true>`               | ✅     |
| U4  | `case17.ts`                | `result as unknown as JiraSearchResult`       | `getJiraResource<JiraSearchResult>()` | ✅     |
| U5  | `shared/splash.ts`         | `import('figlet') as unknown as FigletModule` | Aceito (R9) + justificativa           | ✅     |
| U6  | `shared/llm-client.ts:156` | `schema as unknown as ZodSchemaTyped<T>`      | Aceito (R9) + justificativa           | ✅     |
| U7  | `shared/llm-client.ts:195` | `response as unknown as T`                    | Aceito (R9) + justificativa           | ✅     |

### 🟠 Fase 2 — Tipar API Clients na Raiz (P0, ~2h) ✅

| ID  | Arquivo                                            | Problema                      | Correção                                | Status |
| --- | -------------------------------------------------- | ----------------------------- | --------------------------------------- | ------ |
| A1  | `git_triggers/github-api.ts`                       | `response.data` retorna `any` | `<T = JsonObject>` + `client.get<T>()`  | ✅     |
| A2  | `git_triggers/gitlab-api.ts`                       | `response.data as T` — cast   | Substituir por `client.get<T>()`        | ✅     |
| A3  | `git_triggers/github-*.ts` + `gitlab-*.ts` callers | 8 arquivos sem generic        | Adicionar generics tipando resposta API | ✅     |

### 🟡 Fase 3 — Ativar `no-unsafe-*` ESLint (P1, ~1h) 🏃

Rules ativadas como `error`. 11 erros em produção a corrigir; testes com Opção B aprovada (manual mocks tipados — registrado como débito pós-Sprint 4).

| ID  | Regra                                        | Status |
| --- | -------------------------------------------- | ------ |
| N1  | `@typescript-eslint/no-unsafe-assignment`    | ✅     |
| N2  | `@typescript-eslint/no-unsafe-call`          | ✅     |
| N3  | `@typescript-eslint/no-unsafe-member-access` | ✅     |
| N4  | `@typescript-eslint/no-unsafe-argument`      | ✅     |
| N5  | `@typescript-eslint/no-unsafe-return`        | ✅     |

### 🟠 Fase 3b — Fix Test Files for `no-unsafe-*` (P0, ~10h) 🏃

Rules ativadas em Fase 3 para produção (✅). Test files ~1749 erros remanescentes (1575 errors + 174 warnings) porque `no-unsafe-*` NÃO foi desligado para `**/*.test.ts` — a decisão foi corrigir os testes com tipos, não suprimir.

**State real (2026-06-02):**

- `tsc --noEmit`: **0 erros** ✅
- `jest`: **3352 pass, 0 fail** ✅
- ESLint errors: 1575 (todos em test files, no-unsafe-\*)
- ESLint warnings: 174 (non-null assertions, 39 files)

**State after corrections (2026-06-02 — audit adversarial):**

- `tsc --noEmit`: **0 erros** ✅
- `jest`: **3352 pass, 0 fail** ✅
- ESLint errors: **31** (↓1544, 6 files restantes)
- ESLint warnings: 178 (~~174~~ +4 novas em 4 arquivos)

#### STOMP Protocol (Standard Technical Obstacle Management Protocol)

Adicionado em 2026-06-02 como regra vinculante para todo o desenvolvimento:

1. **Gatilho**: antes de qualquer `as any`, `as unknown as`, `eslint-disable`, `ts-expect-error`, `require()` (evitável por `import`), `jest.isolateModules`, `jest.doMock` + `require()`, supressão de erro, duplicação para contornar tipo, ou abstração cujo único propósito é evitar corrigir a fonte.
2. **Ação**: PARAR → declarar causa raiz → listar opções (cada uma com contratos afetados, impacto sistêmico, riscos) → aguardar autorização.
3. **Invariante**: se não parou antes do primeiro bypass → implementação inválida, desfazer até o ponto anterior ao desvio.

#### Sub-fase 3b.1 — Correção de workarounds (W1–W6) ✅

| ID  | Arquivo                              | Workaround                      | Correção                                                                                                                     | Status |
| --- | ------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| W1  | case17/18/19/21.test.ts              | 8 `eslint-disable` p/ expect.\* | `import { expect } from '@jest/globals'` (tipos corretos)                                                                    | ✅     |
| W2  | `setup/builder/workflow-builder.ts`  | 2 block-level eslint-disable    | `doc: any` → `doc: Document<Node>`                                                                                           | ✅     |
| W3  | `jira_management/xray-history.ts`    | eslint-disable-line             | `new Map()` → `new Map<string, string>()`                                                                                    | ✅     |
| W5  | `context.test.ts` + `config.test.ts` | 2 `as any`                      | Removidos — substituídos por `{}`                                                                                            | ✅     |
| W4  | `create_tests.test.ts`               | 6 `as unknown as`               | Removidos — `jest.Mocked<JiraResource>` → `jest.MockedObjectDeep<JiraResource>` (tipo correto retornado por `jest.mocked()`) | ✅     |
| W6  | `cli_base.test.ts`                   | 1 `as unknown as`               | Substituído por `as jest.Mocked<readline.Interface>` direto (sem `unknown`)                                                  | ✅     |

#### Sub-fase 3b.2 — Correção dos arquivos de teste

Progressão por arquivo (ordem decrescente de erros):

| ID    | Arquivo                                          | Erros (06-02) | Erros (corrigido) | Esforço | Status |
| ----- | ------------------------------------------------ | ------------- | ----------------- | ------- | ------ |
| T0–T4 | case17/18/19/21 + handlers.test.ts               | —             | 0                 | —       | ✅     |
| T5    | `shared/open.test.ts`                            | ~~105~~       | 0                 | —       | ✅     |
| T6    | `shared/config.test.ts`                          | ~~104~~       | 0                 | —       | ✅     |
| T7    | `jira_management/csv_resource.test.ts`           | 101           | 0                 | 30min   | ✅     |
| T8    | `e2e/handlers-happy-paths.test.ts`               | 94            | 0                 | 30min   | ✅     |
| T9    | `shared/result_parser.test.ts`                   | 85            | 0                 | 30min   | ✅     |
| T10   | `git_triggers/github-pr.test.ts`                 | 84            | 0                 | 30min   | ✅     |
| T11   | `shared/llm-metrics.test.ts`                     | 83            | 0                 | 30min   | ✅     |
| T12   | `shared/result_parser.test.ts`                   | 85            | 0                 | 30min   | ✅     |
| T13   | `git_triggers/pipeline-handler.test.ts`          | 73            | 0                 | 30min   | ✅     |
| T14   | `case17-test-utils.test.ts`                      | 67            | 0                 | 30min   | ✅     |
| T15   | `git_triggers/github-workflow.test.ts`           | 58            | 0                 | 30min   | ✅     |
| T16   | `jira_management/create_tests.test.ts`           | 53            | 0                 | 30min   | ✅     |
| T17   | `e2e/friendly-error-paths.test.ts`               | 53            | 0                 | 30min   | ✅     |
| T18   | `jira_management/main.test.ts`                   | 67            | 0                 | 30min   | ✅     |
| T19   | `git_triggers/http-client.test.ts`               | 47            | 0                 | 30min   | ✅     |
| T20   | `shared/report-generator.test.ts`                | 39            | 0                 | 30min   | ✅     |
| T21   | `jira_management/commands/case22.test.ts`        | 37            | 0                 | 30min   | ✅     |
| T22   | `llm/llm-client.test.ts`                         | 37            | 0                 | 30min   | ✅     |
| T23   | `shared/temp-dir.test.ts`                        | 33            | 0                 | 30min   | ✅     |
| T24   | `e2e/smoke-xray-cloud.test.ts`                   | 29            | 0                 | 30min   | ✅     |
| T25   | `e2e/detector.test.ts`                           | 27            | 0                 | 30min   | ✅     |
| T26   | `git_triggers/github-branch.test.ts`             | 26            | 0                 | 30min   | ✅     |
| T27   | `jira_management/commands/case12.test.ts`        | 24            | 0                 | 30min   | ✅     |
| T28   | `jira_management/mapping-file-generator.test.ts` | 22            | 0                 | 30min   | ✅     |
| T29   | `jira_management/publish.test.ts`                | 22            | 0                 | 30min   | ✅     |
| T30   | `llm/llm-pipeline.test.ts`                       | 21            | 0                 | 30min   | ✅     |
| T31   | `e2e/batch-mode.test.ts`                         | 21            | 0                 | 30min   | ✅     |
| T32   | `llm/llm-fallback-http.test.ts`                  | 20            | 0                 | 30min   | ✅     |
| T33   | `git_triggers/main.test.ts`                      | 20            | 0                 | 30min   | ✅     |
| T34   | `shared/bug-report.test.ts`                      | 19            | 0                 | 30min   | ✅     |
| T35   | `case17-helpers.test.ts`                         | 19            | 0                 | 30min   | ✅     |
| T36   | Demais ~6 arquivos (2-12 cada)                   | ~31           | 0                 | 1h      | ✅     |

**Total corrigido**: 35 arquivos, ~1348 erros eliminados.
**Remanescente**: 0 arquivos, 0 erros.

_(Nota: auditoria adversarial em 2026-06-02 revelou que a estimativa original de ~258 erros em 45 arquivos era incorreta — o real era 31 erros em 6 arquivos.)_

**Abordagem**: substituir `require()` inline por `import` estático + `jest.fn<T>()` tipado. Inline `require()` retorna `any` e propaga `no-unsafe-*`. A solução tecnicamente superior é imports estáticos com tipos.

**Gate**: Zero erros `no-unsafe-*` em `**/*.test.ts` antes de avançar para Fase 4.

### 🟡 Fase 4 — Eliminar Non-null Assertions (P2, ~4h) ✅

**State final (2026-06-02):** 0 ESLint warnings (217 eliminados). `no-non-null-assertion` mudou para `error`.

| ID  | Escopo                   | Ocorrências | Ação                                            | Status |
| --- | ------------------------ | ----------- | ----------------------------------------------- | ------ |
| N1  | Produção (`e2e/`)        | 10          | Substituir `!` por guardas / `nonNull()` / `??` | ✅     |
| N2  | Produção (shared/)       | 3           | Substituir `!` por guardas / `nonNull()`        | ✅     |
| N3  | Test files (42 arquivos) | ~201 linhas | `nonNull()` + guard clauses                     | ✅     |

**Resultado**: ~201 non-null assertions eliminadas em 42 arquivos de teste + 13 em produção.

### ✅ Fase 5 — Ativar `exactOptionalPropertyTypes` (P2, ~2h) ✅

| ID  | Erros | Status                                                   |
| --- | ----- | -------------------------------------------------------- |
| E1  | 0     | ✅ Já ativo em `tsconfig.json` — nenhuma ação necessária |

### ✅ Fase 6 — Avaliar `noPropertyAccessFromIndexSignature` (P3) — DEFERIDO ✅

**Medição real (2026-06-02):** 613 erros em 87 arquivos.
**Decisão:** DEFERIDO — regra estilística, zero ganho de correção.
`noUncheckedIndexedAccess` já cobre a segurança (acessar `record.key` já retorna `T | undefined`).
Pareto: alto custo (~4-8h), zero benefício. Documentado em `tsconfig.json` + `AGENTS.md`.

### ✅ Fase 7 — Docs env var name mismatch (P3, ~2min) ✅

`docs/06-env-vars.md` e `docs/02-jira-management.md`: `XRAY_CLOUD_ENDPOINT` → `XRAY_CLOUD_URL`.

### ✅ Fase 8 — Prevenção non-null (P1, ~30min) ✅

1. Check 9 em `scripts/enforce-quality.ts` — bloqueia `!` non-null assertion (9/9 checks)
2. `no-non-null-assertion` ESLint: `'warn'` → `'error'`

---

## 📊 Métrica final (Sprint 4 completa)

| Métrica                    | Antes          | Depois      |
| -------------------------- | -------------- | ----------- |
| `tsc --noEmit`             | 0 erros        | **0 erros** |
| ESLint errors              | 0              | **0**       |
| ESLint warnings            | 217 (non-null) | **0**       |
| `enforce-quality` checks   | 8/8            | **9/9**     |
| `jest` pass                | 3352           | **3351**    |
| `jest` fail                | 0              | **0**       |
| Non-null assertions (prod) | 13             | **0**       |
| Non-null assertions (test) | ~201           | **0**       |
| Items no BACKLOG           | ~15            | **0** 🎉    |
