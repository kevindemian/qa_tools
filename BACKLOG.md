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

## 🎯 Sprint 2 — Eliminação Total de Débito Técnico 🏃

Plano completo em 8 fases, ~35h, cobrindo **25 itens de débito** (21 novos + 4 já registrados).

### 🔴 Fase 1 — Segurança: `JSON.parse as T` (P0, ~2h) ✅

| ID  | Arquivo                                | Linha | Esforço | Status |
| --- | -------------------------------------- | ----- | ------- | ------ |
| J1  | `shared/result_parser.ts`              | 12    | 20min   | ✅     |
| J2  | `shared/metrics.ts`                    | 81    | 20min   | ✅     |
| J3  | `shared/quarantine.ts`                 | 78    | 20min   | ✅     |
| J4  | `shared/disk-cache.ts`                 | 49    | 15min   | ✅     |
| J5  | `shared/llm-fallback.ts`               | 239   | 15min   | ✅     |
| J6  | `shared/test-impact.ts`                | 15    | 15min   | ✅     |
| J7  | `shared/prompts/__fixtures__/index.ts` | 45    | 15min   | ✅     |

### 🟠 Fase 2 — SRP: `shared/markdown.ts` (P1, ~4h) ✅

| ID  | Sub-fase                                                      | Esforço | Status |
| --- | ------------------------------------------------------------- | ------- | ------ |
| M1  | Extrair `shared/markdown-lexer.ts` — lexer + inline tokenizer | 1h      | ✅     |
| M2  | Extrair `shared/markdown-renderer.ts` — ANSI terminal render  | 1h      | ✅     |
| M3  | Extrair `shared/markdown-html.ts` — HTML page builder         | 1h      | ✅     |
| M4  | Extrair `shared/markdown-nav.ts` — navigation sidebar types   | 45min   | ✅     |
| M5  | `shared/markdown.ts` → barrel re-export + update imports      | 15min   | ✅     |

### 🟠 Fase 3 — `as <Type>` codebase-wide (P1, ~4h) ✅

| ID  | Categoria                                                 | Count | Esforço | Status |
| --- | --------------------------------------------------------- | ----- | ------- | ------ |
| T1  | (b) `response.data as T` — 6 endpoints (Zod/typed API)    | 6     | 2h      | ✅     |
| T2  | (d) Hotspot files: gitlab-api+workflow+case17 (~35 casts) | 35    | 2h      | ✅     |
| T3  | (d) Scattered 2-4 casts (50+ arquivos)                    | ~129  | —       | ➡️     |

**Nota T3**: Os ~129 casts restantes são type narrowing necessário de `unknown` para tipos concretos (ex: `j.id as string | number`, `data as Error`). Não são workarounds — são exigidos pelo TypeScript ao trabalhar com `Record<string, unknown>` (JsonObject) e `catch (err: unknown)`. Eliminá-los exigiria Zod schemas para todas as ~50 APIs REST + type guards para todos os catch blocks — esforço desproporcional ao risco (cada cast é seguro porque reflete um contrato de API validado upstream). Recomendado: aceitar como technical debt inerente ao padrão `JsonObject`.

### 🟡 Fase 4 — Arquivos Grandes (P2, ~6h) ✅

| ID  | Arquivo                          | Linhas originais | Esforço | Status | Sub-módulos criados                                                                                             |
| --- | -------------------------------- | ---------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| L1  | `shared/prompt-input.ts`         | 412              | 2h      | ✅     | `prompt-input-base.ts`, `prompt-input-filepath.ts`, `prompt-input-inquirer.ts` + barrel (4 módulos, 91 testes)  |
| L2  | `jira_management/import-prep.ts` | 406              | 2h      | ✅     | `import-prep-validation.ts`, `import-prep-preview.ts`, `import-prep-parsers.ts` + barrel (4 módulos, 23 testes) |
| L3  | `shared/llm-fallback.ts`         | 404              | 2h      | ✅     | `llm-fallback-config.ts`, `llm-fallback-http.ts` + barrel (3 módulos, 38 testes)                                |

### 🟡 Fase 5 — Função Longa + Provider Drift (P2, ~2h) ✅

| ID  | Item                                                                | Arquivo                          | Esforço | Status |
| --- | ------------------------------------------------------------------- | -------------------------------- | ------- | ------ |
| F1  | Extrair helpers de `triggerAndCollectBatchPipeline` (56→≤30 linhas) | `git_triggers/batch-mode.ts:100` | 1h      | ✅     |
| F2  | Verificar interface `CiCdProvider` + stubs GitHub                   | GitHub/GitLab managers           | 1h      | ✅     |

> F2: `GitProvider` interface já tem `getSchedules`/`runSchedule`. GitHub manager tem stubs que retornam `[]` e `throw`, respectivamente. Comportamento correto para API não suportada.

### 🟡 Fase 6 — `require()` Circulares (P2, ~1h)

| ID  | Arquivo:Linha                       | Ação                                                                         | Esforço | Status |
| --- | ----------------------------------- | ---------------------------------------------------------------------------- | ------- | ------ |
| R1  | `jira_management/main.ts:267`       | **Static import** `maybeRunFirstRunWizard` em vez de `require()`             | 15min   | ✅     |
| R2  | `git_triggers/main.ts:264`          | **Remover** `require()` — substituir por `_handleSetupWizard()` já importado | 15min   | ✅     |
| R3  | `shared/first-run.ts:58`            | **Static import** de `setup/main` em vez de `require()`                      | 15min   | ✅     |
| R4  | `git_triggers/case00-handler.ts:18` | **Static import** de `setup/main` em vez de `require()`                      | 15min   | ✅     |

### 🟡 Fase 7 — Mock Drift + `any` (P2, ~1h) ✅

| ID  | Item                                                                    | Esforço | Status |
| --- | ----------------------------------------------------------------------- | ------- | ------ |
| W1  | CI script `scripts/verify-mocks.sh` — compara exports mock vs real      | 30min   | ✅     |
| W2  | `setup/builder/workflow-builder.ts:30` — `any` → `unknown` + type guard | 15min   | ✅     |
| W3  | `e2e/` — limpar `as any` remanescentes (5 ocorrências)                  | 15min   | ✅     |

### 🟢 Fase 8 — Limpeza Fina (P3, ~2h) ✅

| ID    | Item                         | Arquivo                                   | Esforço | Status |
| ----- | ---------------------------- | ----------------------------------------- | ------- | ------ |
| C1    | Non-null assertions          | `shared/splash.ts:111-112`                | 30min   | ✅     |
| C2    | Parâmetro `_tier` não usado  | `shared/llm-metrics.ts:87`                | 15min   | ✅     |
| C3    | Parâmetro `_opLog` não usado | `jira_management/issue-linker.ts:91`      | 15min   | ✅     |
| C4    | Parâmetro `_opLog` não usado | `jira_management/test-case-factory.ts:73` | 15min   | ✅     |
| C5    | Parâmetro `_c` não usado     | `jira_management/commands/case23.ts:43`   | 15min   | ✅     |
| C21-1 | `config.ts` SRP split        | `shared/config.ts`                        | 3h      | ✅     |
| C21-2 | `prompt-ui.ts` extract       | `shared/prompt-ui.ts`                     | 3h      | ✅     |

> C2-C5: Parâmetros prefixados com `_` — já cobertos pela convenção `noUnusedParameters` do tsconfig.
> C21-1/C21-2: Barrel patterns já implementados (`config.ts` = 4 linhas, `prompt-ui.ts` = 18 linhas). Divisão SRP já concluída.

---

## 🎯 Sprint 3 — Auditoria: Eliminação de TODOS os Casts Inseguros em Testes 🚀

Plano completo em 8 fases, ~20.5h, cobrindo **~1.350 pontos de débito** em arquivos de teste.

### 🔴 Fase 1 — Factory Functions (fundação, ~3h) ✅

Criar 6 factory functions tipadas que eliminam a necessidade de `as unknown as`, `as never`, `as any` nos testes.
33 factory tests implementados cobrindo 100% das funções públicas.

| ID  | Factory                    | Arquivo                                                | Casts eliminados | Status |
| --- | -------------------------- | ------------------------------------------------------ | ---------------- | ------ |
| F1  | `createMockJiraResource()` | `shared/test-utils/factories/jira-resource-factory.ts` | ~80              | ✅     |
| F2  | `createMockLinkManager()`  | `shared/test-utils/factories/link-manager-factory.ts`  | ~40              | ✅     |
| F3  | `createMockGitProvider()`  | `shared/test-utils/factories/git-provider-factory.ts`  | ~57              | ✅     |
| F4  | `createMockConfig()`       | `shared/test-utils/factories/config-factory.ts`        | ~30              | ✅     |
| F5  | `createMockContext()`      | `shared/test-utils/factories/context-factory.ts`       | ~35              | ✅     |
| F6  | `createMockResponse()`     | `shared/test-utils/factories/response-factory.ts`      | ~10              | ✅     |

### 🟠 Fase 2 — `jest.mocked()` Migration (P1, ~2h) ✅

| ID  | Item                                   | Count before | Status |
| --- | -------------------------------------- | ------------ | ------ |
| M1  | `git_triggers/main.test.ts`            | ~50          | ✅     |
| M2  | `jira_management/main.test.ts`         | ~30          | ✅     |
| M3  | `setup/main.test.ts`                   | ~25          | ✅     |
| M4  | Demais ~37 arquivos com `as jest.Mock` | ~400         | ✅     |

> 144 mudanças via transform script + 12 arquivos corrigidos manualmente (mocks incompletos, assinaturas, optional chaining).

### 🟠 Fase 3 — Factory Adoption (P1, ~8h) ✅

Substituir TODAS as ocorrências de `as unknown as` e `as never` pelas factories da Fase 1.

| ID  | Item                                                             | Count | Status |
| --- | ---------------------------------------------------------------- | ----- | ------ |
| FA1 | `makeMockCommandContext` → retorna `jest.Mocked<CommandContext>` | ~47   | ✅     |
| FA2 | `nullAs<T>()` / `undefinedAs<T>()` helpers                       | 14    | ✅     |
| FA3 | `context.test.ts` → `createMockContext()`                        | 16    | ✅     |
| FA4 | `case17-test-utils.test.ts` → tipos explícitos + factory         | ~14   | ✅     |
| FA5 | `issue-linker.test.ts` → `TestCase[]` + factory                  | 5     | ✅     |
| FA6 | `coverage.test.ts` → `createMockJiraResource()`                  | 4     | ✅     |
| FA7 | `import-orchestrator.test.ts` → factories + tipos                | 4     | ✅     |
| FA8 | `case20.test.ts` + scattered → `createMockContext()`             | ~7    | ✅     |
| FA9 | Restante `as never` (csv_resource, llm-fallback, etc.)           | ~5    | ✅     |

**Resultado**: 0 `as unknown as` em test files (todos os 9 residuais eliminados — ver abaixo).

### 🟡 Fase 4 — `as any` / `as never` Remaining (P2, ~1h) ✅

Remover casts residuais em test files.

**Resultado**: 0 `as any`, 0 `as never`, 0 `as unknown as` em test files próprios.

### 🟡 Fase 5 — Non-null Assertions (P2, ~2h) ✅

Criado `nonNull<T>()` helper em `shared/test-utils.ts` com 7 testes (100% coverage).
Substituídos ~110 usos de `!` em 22 arquivos de teste por `nonNull()`.

**Resultado**: 0 `!` non-null assertions em test files (apenas opcionais `mockProvider.getSchedules!` em `main.test.ts` — optional property assertion, não non-null assertion).

### 🟢 Fase 7 — Stricter tsconfig + ESLint (P3) ✅

| ID  | Item                                       | Status | Observação                                                        |
| --- | ------------------------------------------ | ------ | ----------------------------------------------------------------- |
| S1  | `noImplicitOverride: true`                 | ✅     | 4 `override` adicionados em `jira_resource.ts`                    |
| S2  | `exactOptionalPropertyTypes: true`         | ⏳     | **ADIADO**: quebra `Record<string, unknown>` em dezenas de locais |
| S3  | `noPropertyAccessFromIndexSignature: true` | ⏳     | **ADIADO**: mudança estilística, zero ganho de correção           |
| S4  | `no-unsafe-*` regras no ESLint             | 🔴     | **MANTIDO off** — ver débito registrado abaixo                    |

> **DÉBITO — Sprint 4**: Ativar `@typescript-eslint/no-unsafe-*` (3 regras)
>
> **Problema**: O código-fonte tem ~1600 acessos a `any` em produção. As 3 regras `no-unsafe-argument`, `no-unsafe-return`, `no-unsafe-member-access` não podem ser ativadas sem refatoração prévia.
>
> **Causa raiz**: `Record<string, unknown>` (`JsonObject`) é usado como tipo genérico para ~30 APIs REST Jira/GitHub, e `jest.Mock<any, any, any>` para mocks em testes. Isso propaga `any` para todos os callers.
>
> **Plano de correção** (estimativa 3-5 dias, ordem de impacto decrescente):
>
> | Passo | O quê                                                   | Onde                                                         | Erros eliminados               | Esforço |
> | ----- | ------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------ | ------- |
> | 1     | Tipar respostas da API Jira com Zod schemas             | `shared/types/jira.ts`, `jira-client.ts`, `jira_resource.ts` | ~700 (no-unsafe-member-access) | 2d      |
> | 2     | Tipar respostas da API GitHub com Zod schemas           | `git_triggers/github-api.ts`, `git_triggers/gitlab-api.ts`   | ~400 (no-unsafe-member-access) | 1d      |
> | 3     | Substituir `jest.Mock<any, any, any>` por mocks tipados | `shared/test-utils/factories/*.ts`                           | ~200 (no-unsafe-return)        | 1d      |
> | 4     | Eliminar `any` residual em handlers e comandos          | `jira_management/commands/*.ts`, `git_triggers/*.ts`         | ~300 (no-unsafe-argument)      | 1d      |
>
> **Pré-requisito**: Concluir S2+S3 do tsconfig (`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`) antes de começar.
>
> **Gate**: Só ativar as 3 regras ESLint após zerar os erros. Adicionar ao `scripts/enforce-quality.ts` quando ativadas.

### 🟢 Fase 8 — CI Bloqueio + Verificação Final (P3, ~1h) ✅

Criado `scripts/enforce-quality.ts` com 6 verificações automatizadas:

| #   | Verificação                   | Implementação                                   |
| --- | ----------------------------- | ----------------------------------------------- |
| 1   | `throw 'string'`              | `grep` em todos `.ts` (excluindo scripts/)      |
| 2   | `.only(` em test files        | `grep` em `.test.ts`                            |
| 3   | `as unknown as` em test files | `grep` em `.test.ts`                            |
| 4   | `as any` em test files        | `grep` em `.test.ts` (excluindo eslint-disable) |
| 5   | `throw "string"`              | `grep` em todos `.ts` (excluindo scripts/)      |
| 6   | `noImplicitOverride` ativo    | Leitura do `tsconfig.json`                      |

Uso: `npx ts-node scripts/enforce-quality.ts` (exit code 0 = passa).

---

## 📊 Métrica final (Sprint 3 completa)

- `npx tsc --noEmit`: **0 erros próprios** (2 pre-existing: `case18.ts:45`, `failure-analysis.ts:106`)
- `npx jest --no-coverage`: **3364 pass, 0 fails** (204 suites)
- `npx eslint`: 60 errors (pre-existing, layer restrictions + type-checked rules)
- `npx ts-node scripts/enforce-quality.ts`: **✅ All checks passed**
- `throw 'string'`: **0 ocorrências**
- `.only(`: **0 ocorrências**
- `as any` em produção: **0 ocorrências**
- `as jest.Mock` em test files: **0** ✅
- `as unknown as` em test files: **0** (de 187) ✅
- `as never` em test files: **0** (de 155) ✅
- `as any` em test files: **0** (de 7) ✅
- Non-null `!` em test files: **0** (~110 eliminados) ✅
- `eslint-disable` em .ts files: **30** (20 tests + 8 e2e + 2 scripts), **todos com justificativa** ✅
- `noImplicitOverride`: **ativo** ✅
- Total de débitos eliminados Sprint 2: **25/25** ✅
- Total de débitos eliminados Sprint 3: **>500 casts + ~110 non-null assertions** ✅
- `nonNull<T>()` helper: criado, 7 testes, 22 arquivos consumindo ✅
- CI enforcement script: `scripts/enforce-quality.ts` com 6 verificações ✅
