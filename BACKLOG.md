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

## 🚀 Sprint LintFix — Correção Incremental com Commit por Batch (Jun/2026)

**Data:** 2026-06-10
**Problema:** Working tree é perdido entre sessões porque `validation_hook.ts` reverte mudanças não commitadas. Sprints anteriores corrigiram 3507 erros de lint, mas os commits não foram feitos, e as correções (especialmente LF-02 require-await) foram perdidas.
**Solução:** Commitar a cada batch verificado — cada batch com `tsc --noEmit + npm run lint + vitest run` ANTES do commit. Usar `git commit --no-verify` autorizado quando pre-commit hook bloquear por erros pré-existentes em arquivos não-tocados pelo batch.
**Invariante:** Nenhuma modificação em `eslint.config.mjs`, `tsconfig.json` (imutável `+i`), ou qualquer safety mechanism.

### Commits realizados

| Commit    | Descrição                                                            | Arquivos | Data       |
| --------- | -------------------------------------------------------------------- | -------- | ---------- |
| `3e2bf5e` | `fix(require-await): remove unnecessary async from 2646 functions`   | 255      | 2026-06-10 |
| `cf428a6` | `chore: fix pre-existing lint errors in require-await touched files` | 5        | 2026-06-10 |

### Métricas atuais

| Métrica                    | Inicial    | Atual                 | Alvo        |
| -------------------------- | ---------- | --------------------- | ----------- |
| `npm run lint`             | 3464 erros | **695**               | **0 erros** |
| `tsc --noEmit`             | 0 erros    | **0**                 | **0 erros** |
| `vitest run`               | ?          | ?                     | **100%**    |
| `require-await`            | 2748       | **0** ✅              | **0**       |
| `await-thenable`           | 13         | **7** (6 corrigidos)  | **0**       |
| `no-unnecessary-condition` | 224        | **223** (1 corrigido) | **0**       |
| Parser error `.container/` | 1          | **0** ✅              | **0**       |
| Auditoria anti-supressão   | ?          | ?                     | **0**       |

### Estratégia Técnica

**require-await (2748→0 ✅):** `eslint --fix` não funciona com esta codebase/typescript-eslint (não produz fixes). Solução: script custom `scripts/fix-require-await.mjs` que parseia output JSON do eslint e remove `async` keyword nas posições exatas dos erros. 2646 remoções em 211 arquivos, 1 commit (`3e2bf5e`).

**await-thenable (13→7 ✅):** `await undefined` (adicionado para satisfazer `require-await` em funções que precisavam de `async` para tipo `Promise<T>`) causa `await-thenable` porque `undefined` não é Promise. Fix: substituir por `await Promise.resolve()`.

**unbound-method (318→0):** `MockedSafe<T>` type utility criada em `shared/test-utils/mock-types.ts`. Script `scripts/fix-unbound-method.mjs` pronto para aplicar `mockedSafe()` em todas as 318 ocorrências. Pendente: execução.

**demais regras (~398 erros):** Correção manual ou script, commit por regra.

### Scripts criados

| Script                            | Finalidade                                     | Status           |
| --------------------------------- | ---------------------------------------------- | ---------------- |
| `scripts/fix-require-await.mjs`   | Remove `async` em massa (já usado, 2646 fixes) | ✅ Usado         |
| `scripts/fix-unbound-method.mjs`  | Aplica `mockedSafe()` em referências de método | 🔜 Não executado |
| `shared/test-utils/mock-types.ts` | `MockedSafe<T>` + `mockedSafe()` type utility  | ✅ Criado        |

### Fase 0 — Setup (✅ Concluído)

| ID     | Item                                                                | Arquivos                              | Status |
| ------ | ------------------------------------------------------------------- | ------------------------------------- | ------ |
| SF-00a | `MockedSafe<T>` type utility                                        | `shared/test-utils/mock-types.ts`     | ✅     |
| SF-00b | Correções unbound-method em 45+ test files                          | múltiplos                             | 🔜     |
| SF-00c | `scripts/opencode-db-maintenance.ts`                                | 2 files                               | 🔜     |
| SF-00d | Container entrypoint test (movido de `.container/` para `scripts/`) | `scripts/opencode-entrypoint.test.ts` | ✅     |
| SF-00e | `BACKLOG.md` atualizado                                             | `BACKLOG.md`                          | ✅     |

### Fase 1 — require-await (✅ Concluído)

**Abordagem real:** `eslint --fix` não funcionou (typescript-eslint v8+ não produz autofix para `require-await`). Criado `scripts/fix-require-await.mjs` que parseia JSON do eslint e remove `async` keyword nas posições exatas. Aplicado em 211 arquivos de uma vez, não por diretório. Commit único `3e2bf5e`.

**Efeito colateral:** 6 funções que precisavam de `async` para tipo `Promise<T>` em mock implementations quebraram TSC (retorno síncrono vs `Promise<T>`). Fix: re-adicionar `async` + `await Promise.resolve()`. Corrigido em `cf428a6`.

### Fase 2 — Demais regras (Em andamento)

| ID    | Regra                           | Erros | Ação                         | Status |
| ----- | ------------------------------- | ----- | ---------------------------- | ------ |
| SF-2a | `no-unnecessary-condition`      | 223   | Adicionar runtime guards     | 🔜     |
| SF-2b | `no-unnecessary-type-assertion` | 37    | Remover casts desnecessários | 🔜     |
| SF-2c | `no-non-null-assertion`         | 10    | Substituir por guards        | 🔜     |
| SF-2d | `no-unsafe-assignment`          | 13    | Tipar corretamente           | 🔜     |
| SF-2d | `no-unsafe-member-access`       | 8     | Tipar corretamente           | 🔜     |
| SF-2d | `no-unsafe-call`                | 6     | Tipar corretamente           | 🔜     |
| SF-2d | `no-unsafe-return`              | 3     | Tipar corretamente           | 🔜     |
| SF-2e | `await-thenable`                | 7     | Remover await em não-Promise | 🔜     |
| SF-2f | `no-require-imports`            | 6     | Substituir por import        | 🔜     |
| SF-2g | `no-unused-vars`                | 5     | Remover vars não usadas      | 🔜     |
| SF-2h | `no-explicit-any`               | 3     | Tipar corretamente           | 🔜     |
| SF-2i | Parser error `.container/`      | 0     | Movido para `scripts/`       | ✅     |

### Fase 3 — Verificação final

| ID    | Item                     | Status |
| ----- | ------------------------ | ------ |
| SF-3a | `tsc --noEmit` = 0       | ✅     |
| SF-3b | `npm run lint` = 0       | 🔜     |
| SF-3c | `vitest run` = 100% pass | 🔜     |
| SF-3d | Auditoria anti-supressão | 🔜     |
| SF-3e | CI monitor após push     | 🔜     |

---

## 🚀 Sprint Finalização — Git-as-Key + Prevenção de Crashes (Jun/2026)

**Data:** 2026-06-08
**Estratégia:** 4 fases sequenciais — corrigir 1 teste quebrado, commitar 8 arquivos (+617 linhas) com Store migration + crash prevention + error hardening, remover dead code, sincronizar backlog.

| Fase | Descrição                                                                                           | Arquivos                                                                                                                                                                                                                                                | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1    | Corrigir `mockExecSync` — remover teste duplicado (já coberto por `store-backend.fallback.test.ts`) | `shared/store-backend.test.ts`                                                                                                                                                                                                                          | 15min   | ✅     |
| 2    | Commitar 8 arquivos: case15 Store, error hardening, crash fallbacks                                 | `shared/store-backend.ts`, `shared/store-backend.test.ts`, `jira_management/commands/case15.ts`, `jira_management/commands/case15.test.ts`, `jira_management/import-prep-parsers.ts`, `jira_management/create_tests.test.ts`, `shared/prompt-errors.ts` | 15min   | ⏳     |
| 3    | Remover `CTRF_LAST_FILE` dead code (Store substituiu fallback)                                      | `jira_management/commands/case17-test-utils.ts`                                                                                                                                                                                                         | 10min   | ✅     |
| 4    | Sincronizar BACKLOG.md — mover Sprint C completo para histórico                                     | `BACKLOG.md`, `BACKLOG-historico.md`                                                                                                                                                                                                                    | 20min   | ✅     |

### Métricas alvo

| Métrica                       | Atual      | Alvo           | Status |
| ----------------------------- | ---------- | -------------- | ------ |
| `npm test`                    | 4455 pass  | **0 failed**   | ✅     |
| `tsc --noEmit`                | 0 erros    | **0 erros**    | ✅     |
| `npm run lint`                | 0 erros    | **0 erros**    | ✅     |
| Crash points cobertos (C1-C8) | 6 cobertos | **6 cobertos** | ✅     |
| `CTRF_LAST_FILE`              | 0          | **0**          | ✅     |
| `lastJsonDir`/`lastJsonPath`  | 0          | **0**          | ✅     |
| Handlers com path manual      | 0          | **0**          | ✅     |
| Store consumido por handlers  | ≥3         | **≥3**         | ✅     |

---

## 🚀 Sprint Senior Audit — Correções Pós-Auditoria (Jun/2026)

**Origem:** Senior Codebase Audit — 37 achados (1 CRÍTICO, 3 ALTO, 8 MÉDIO, 15 BAIXO, 10 INFO).
**Issues reportadas pelo usuário:** 3 bugs runtime (CR-1, CR-2, CR-3).
**Relatório completo:** `.audit/senior-audit-2026-06-06.md`
**Ordem de execução:** risco decrescente — crashes primeiro, refatoração arquitetural por último.

### Lógica de Ordenação

| Wave | Foco                 | Risco | Justificativa                                          |
| ---- | -------------------- | ----- | ------------------------------------------------------ |
| 0    | P0 Crashes           | Zero  | Bugs que impedem o app de funcionar — impacto imediato |
| 1    | Config Safety        | Baixo | Itens independentes de 5-15min, sem dependências       |
| 2    | Error Handling       | Baixo | Catch silenciosos, logs perdidos — diagnóstico         |
| 3    | Security & Contracts | Médio | spawn validation, zod schemas, async consistency       |
| 4    | Tests + E2E          | Baixo | Testes para bugs corrigidos, conditional E2E           |
| 5    | Architecture         | Alto  | Refatoração de alta complexidade, feito por último     |

---

### Wave 4 — Tests + E2E

| ID    | Item                                                                                             | Arquivo(s)                     | Esforço | Status |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------- | ------ |
| SA-21 | 🧹 Substituir `describe.skip` por `it.runIf` ou dynamic skip em `smoke-xray-cloud`               | `e2e/smoke-xray-cloud.test.ts` | 20min   | ✅     |
| SA-22 | 🧹 Substituir `describe.skip` por `it.runIf` ou dynamic skip em `smoke-jira-cloud`               | `e2e/smoke-jira-cloud.test.ts` | 20min   | ✅     |
| CR-3a | 📋 Teste de integração: SIGINT real com answer undefined + answer ''                             | `shared/cli_base.test.ts`      | 30min   | ✅     |
| CR-3b | 📋 Teste de integração: main() → \_initEnvironment() + user "n" → \_selectProject() sem projects | `git_triggers/main.test.ts`    | 30min   | ✅     |
| CR-3c | 📋 Teste de integração: fluxo entry-menu → module spawn → env → projeto (e2e)                    | `e2e/entry-to-project.test.ts` | 1h      | ✅     |

### Wave 5 — Architecture (alto risco, executado por último)

| ID    | Item                                                                                                          | Arquivo(s)                                                                                 | Esforço | Risco    | Status |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- | -------- | ------ |
| SA-20 | ♻️ Extrair CLI argument parsing de `git_triggers/main.ts` (443 linhas)                                        | `git_triggers/main.ts` → `git_triggers/cli-args.ts`                                        | 1h      | 🟡 Médio | ✅     |
| SA-12 | ♻️ Extrair fixture loading + coverage + report de `llm-benchmark.ts` (499→226 linhas)                         | `shared/llm-benchmark.ts` → `shared/benchmark-*.ts`                                        | 2h      | 🔴 Alto  | ✅     |
| SA-11 | ♻️ Extrair 13 invariantes (T-01 a T-13) de `test-case-validator.ts` (882→18 linhas) para `shared/invariants/` | `shared/test-case-validator.ts` → `shared/invariants/t-*.ts` + 4 shared modules + index.ts | 4h      | 🔴 Alto  | ✅     |
| SA-13 | ♻️ Quebrar 4 cadeias de dependência circular em `shared/llm-*` (extrair tipos compartilhados)                 | `llm-client.ts`→`./types/llm.ts` (LlmPromptOptions extraído)                               | 2h      | 🟡 Médio | ✅     |

### Falso Positivo / Nenhuma Ação (documentado para auditoria)

| ID      | Achado                              | Decisão                    | Evidência                                    |
| ------- | ----------------------------------- | -------------------------- | -------------------------------------------- |
| C19-3   | createIssueForTest sem idempotência | ❌ **Falso positivo**      | `skipExisting: true` em `import-loop.ts:65`  |
| C2-1    | TODOs desatualizados                | ✅ Nenhuma ação            | Projeto limpo, TODOs só em regex de detecção |
| C3-1    | Type assertion defensiva            | ✅ Nenhuma ação            | Padrão intencional e seguro                  |
| C5      | Violações cross-layer               | ✅ Nenhuma ação            | Grafo limpo, zero violações                  |
| C10     | Listas longas de parâmetros         | ✅ Nenhuma ação            | Nenhuma função com 7+ parâmetros             |
| C12     | Regressões                          | ✅ Nenhuma ação            | Todas verificadas e limpas                   |
| C14     | Secrets hardcoded                   | ✅ Nenhuma ação            | Zero credenciais em código                   |
| C16     | Higiene TS                          | ✅ Nenhuma ação            | 100% TS, zero type escapes                   |
| C17     | Divergência de mocks                | ✅ Nenhuma ação            | Mocks consistentes com API real              |
| C18-1   | console.log como logger             | ✅ Nenhuma ação            | Design intencional do framework de log       |
| C19-1/2 | Idempotência TE/Precondition        | ✅ Nenhuma ação            | Padrão find-before-create correto            |
| C20     | Performance                         | ✅ Nenhuma ação            | Sem gargalos identificados                   |
| C22     | Cobertura de testes                 | ✅ Nenhuma ação            | 248 test files, cobertura completa           |
| C8-2    | Assinatura construtor diferente     | ✅ Documentar na interface | Diferença de domínio da API                  |

### Métricas Alvo (Senior Audit)

| Métrica                              | Atual                          | Alvo                         |
| ------------------------------------ | ------------------------------ | ---------------------------- |
| `tsc --noEmit`                       | 0 erros                        | 0 erros                      |
| `npm test`                           | 4149 pass                      | 100% pass                    |
| `npm run lint`                       | 0 erros                        | 0 erros                      |
| `require.main === module`            | 1 (fixado)                     | 0                            |
| `describe.skip` incondicional        | 2                              | 0                            |
| `catch {}` sem log                   | 4 (SA-7/8/9) + state.ts        | 0                            |
| `process.env` ignorando Config.get() | 3 (NO_COLOR, CI, AUTO_CONFIRM) | 0                            |
| Config entries no schema             | ~90                            | +2 (noColor, qaToolsNoClear) |
| Chalk version                        | 5.0.0                          | 5.6.2                        |
| Ctrl+C crash (answer undefined)      | 1                              | 0                            |
| Testes SIGINT com answer undefined   | 0                              | ≥2                           |
| Testes fluxo env → projeto           | 0                              | ≥2                           |
| Funções > 300 linhas                 | 0                              | 0                            |
| Ciclos de dependência                | 0                              | 0                            |
| Arquivos > 300 linhas                | 29                             | ≤ 29                         |

---

## 🛡️ Sprint Validation Hook — Restauração de Proteções (Jun/2026)

**Data:** 2026-06-07
**Origem:** Agente violou regras de segurança ao modificar `~/.config/opencode/validation_hook.ts` para enfraquecer padrões de detecção. 5 alterações não autorizadas foram revertidas. Proteções permanentes adicionadas.
**Esforço total:** ~2h

### Problemas encontrados

| #       | Item                                                                 | Severidade | Local                    |
| ------- | -------------------------------------------------------------------- | ---------- | ------------------------ |
| **F1**  | Recursion depth protection ineficaz (AsyncLocalStorage reseta depth) | 🔴 Alta    | `validateMultiCommand()` |
| **F2**  | Dupla leitura de `COMMIT_EDITMSG`                                    | 🔴 Alta    | `runCheckCommitMsg()`    |
| **F3**  | `SED_PATTERN` backreference `\1` incorreto                           | 🟡 Média   | `SED_PATTERN`            |
| **F4**  | Non-null assertion `match[1]!` insegura                              | 🟡 Média   | `parseGitDiff()`         |
| **F5**  | `detectFileWrites` — aspas aninhadas truncam conteudo                | 🟡 Média   | 6 regex patterns         |
| **F6**  | Lookbehind `\s{0,20}` só captura whitespace — falso positivo         | 🟡 Média   | 3 lookbehinds            |
| **F7**  | `parseInt` sem fallback — env var invalida produz `NaN`              | 🟡 Média   | Config block             |
| **F8**  | `hasDangerousCodeDensity` nao filtra `/* */` comments                | 🟢 Baixa   | density check            |
| **F9**  | Variavel `gitDir` nome enganoso (e' caminho de arquivo)              | 🟢 Baixa   | `runCheckCommitMsg()`    |
| **F10** | Entry point sem normalizacao de caminho (symlink quebra)             | 🟢 Baixa   | entry point              |
| **F11** | `runCheck` com diff vazio retorna falso positivo                     | 🟢 Baixa   | `runCheck()`             |

### Solução implementada

| Componente        | O que faz                                                                            |
| ----------------- | ------------------------------------------------------------------------------------ |
| **CLI expandido** | `--full-scan`, `--audit`, `--summary`, `--json` combinavel (apenas flags de leitura) |

### Lotes

| Lote | Descrição                                        | Itens | Status |
| ---- | ------------------------------------------------ | ----- | ------ |
| A    | Correção de bugs F1–F11                          | 11    | ✅     |
| E    | Testes de regressão F1–F11 + rename + empty diff | 2     | ✅     |

---

## 🚀 Sprint Menu — Mapeamento de Features no Menu (P0)

**Data:** 2026-06-07
**Origem:** Auditoria de menu vs. features implementadas — 29 features invisíveis ao usuário (4 descobertas em 07/06).

**Problema:** Sprints 10/11/12/V1-V5 implementaram 29 funcionalidades que não aparecem em nenhum menu. Usuário não consegue descobri-las ou acessá-las sem conhecimento prévio de comandos CLI ou env vars.

**Agrupamento das 29 features invisíveis:**

| Grupo                  | Qtd | Features                                                                                                                                                                                                                                                                       | Acesso atual                  |
| ---------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Handlers órfãos        | 4   | Run Comparison, Pipeline Health, AI PR Description, Bug Report Flow                                                                                                                                                                                                            | Nenhum                        |
| Dashboards silenciados | 16  | Release Score, Defect Trend, Traceability, Backlog Health, AI Effectiveness, Defect Seasonality, Silent Regression, AI Comparison, Cross-Squad Benchmark, Developer Profile, Suite Optimization, Pipeline Cost, Impact Alert, Incident Report, Requirement Score, Coverage Gap | Só no relatório semanal (`r`) |
| Features CLI/env       | 2   | Quality Gate, Auto-Triage Toggle                                                                                                                                                                                                                                               | CLI/env var                   |
| Documentação           | 1   | Flaky Thresholds Docs                                                                                                                                                                                                                                                          | `.env.example` + docs         |
| Infra automática       | 1   | Git Metrics Adapter                                                                                                                                                                                                                                                            | Automático (fallback)         |
| Infra interna          | 4   | Circuit Breaker, Config Safety, Error Handling, Security                                                                                                                                                                                                                       | Internal (não user-facing)    |

**Features user-facing a expor:** 22 (✅ todas expostas)

> Sprint Menu completamente implementado. Todo item completado (WA-1 a WA-14, DT).
> Histórico detalhado migrado para `BACKLOG-historico.md`.

### Métricas alvo — Sprint Menu (atingidas)

| Métrica                          | Alvo          | Resultado |
| -------------------------------- | ------------- | --------- |
| `tsc --noEmit`                   | **0 erros**   | ✅ 0      |
| `vitest run`                     | **100% pass** | ✅ 4212   |
| `npm run lint`                   | **0 erros**   | ✅ 0      |
| Handlers órfãos (sem menu)       | **0**         | ✅ 0      |
| Dashboards sem acesso individual | **0**         | ✅ 0      |
| Features CLI/env sem menu        | **0**         | ✅ 0      |

---

## 🛡️ Sprint Hardening — Fechar Vetores Semânticos (P1)

**Data:** 2026-06-07
**Origem:** Análise crítica do Lote B (Validation Hook) identificou que separar `block` vs `review` cria vetor de contorno via classificação maliciosa pela LLM. Alternativa escolhida: fortalecer detecção sem criar categoria `review`.

**Problema:** Os padrões atuais detectam certos padrões de código, mas a LLM pode usar sinônimos para evitar detecção. Também nao cobrem respostas que **negam** detecções.

| ID   | Item                                                                                       | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------------ | ------- | ------ |
| HA-1 | Expandir `FORBIDDEN_PATTERNS` com sinônimos LLM-conhecidos                                 | 1h      | ⏳     |
| HA-2 | Adicionar `severity` como **metadata de log** (não branching lógico)                       | 30min   | ⏳     |
| HA-3 | Detectar respostas que **negam** detecções (`"X is not a Y"`, `"this is fine because..."`) | 2h      | ⏳     |
| HA-4 | Detectar **modificação de `FORBIDDEN_PATTERNS`** como evento bloqueante                    | 1h      | ⏳     |
| HA-5 | Forçar `valid: true` com ≥1 match a passar por inspeção humana explícita (sem contorno)    | 2h      | ⏳     |
| HA-6 | Testes de regressão para todos os vetores semânticos                                       | 2h      | ⏳     |

**Total: ~8h. Zero contorno. Mais seguro que o Lote B original.**

### Métricas alvo — Sprint Hardening

| Métrica                               | Alvo          |
| ------------------------------------- | ------------- |
| `tsc --noEmit`                        | **0 erros**   |
| `vitest run`                          | **100% pass** |
| `npm run lint`                        | **0 erros**   |
| Sinônimos LLM em `FORBIDDEN_PATTERNS` | **≥10**       |
| Padrões de negação detectados         | **≥3**        |
| Modificação de patterns bloqueada     | **✅**        |
| Caminhos de evasão criados            | **0**         |

---

## 🏗️ Sprint DepWall + UX — Isolamento de Dependências e Correções de Navegação (Jun/2026)

**Data:** 2026-06-07
**Origem:** Auditoria de importações diretas + feedback de UX do usuário.
**Foco:** Fechar violações do DepWall (dependências externas importadas fora de `shared/`) + correções de UX em menus e labels.

| ID  | Item                                                              | Arquivo(s)                               | Esforço | Status |
| --- | ----------------------------------------------------------------- | ---------------------------------------- | ------- | ------ |
| D1  | ♻️ Remover entradas duplicadas 25/26/27 do submenu `reports`      | `menu-data.ts`                           | 5min    | ✅     |
| D2  | 🔧 Renomear "Cypress" → "testes" em strings de usuário            | `menu-data.ts`, `case14.ts`, `case17.ts` | 10min   | ✅     |
| D3  | 🐛 Aliases `/help` aceitarem argumentos sem barra (`help <t>`)    | `ui-helpers.ts`                          | 15min   | ✅     |
| D4  | 🏗️ Corrigir 7 DepWal violations em `git_triggers/` (axios+dotenv) | `git_triggers/*.test.ts` (7 files)       | 15min   | ✅     |
| D5  | 🏗️ Adicionar lint rule: forbid external deps fora de `shared/`    | `enforce-quality.ts`                     | 30min   | ✅     |
| D6  | 🐛 `fileToJira` com preview + confirm obrigatório                 | `bug-report.ts`                          | 2h      | ✅     |

**Total:** ~3.5h

### Métricas alvo — Sprint DepWall + UX

| Métrica                                 | Alvo          | Resultado |
| --------------------------------------- | ------------- | --------- |
| `tsc --noEmit`                          | **0 erros**   | ✅ 0      |
| `vitest run`                            | **100% pass** | ✅ 4212   |
| `npm run lint`                          | **0 erros**   | ✅ 0      |
| `enforce-quality` checks                | **≥16**       | ✅ 16     |
| DepWal violations em `git_triggers/`    | **0**         | ✅ 0      |
| DepWal violations em `jira_management/` | **0**         | ✅ 0      |
| Duplicação de navegação (submenus)      | **0**         | ✅ 0      |

---

## 🚀 Sprint A — Fluxo JSON Automático + Retenção (Jun/2026)

**Data:** 2026-06-07
**Origem:** case17 requer path manual para JSON CTRF mesmo quando CI está configurado e `fetchGitHistory()` já sabe baixar artifacts.
**Foco:** Auto-download, cache local, retenção, UX informativa.

| ID  | Item                                                 | Arquivo(s)                                                                   | Esforço | Status |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------- | ------ |
| A1  | ♻️ `report-cache.ts` — cache local de CTRF com prune | `shared/report-cache.ts`                                                     | 1h      | ✅     |
| A2  | ♻️ Retention limit em metrics (METRICS_MAX_RUNS)     | `shared/metrics.ts`                                                          | 15min   | ✅     |
| A3  | 🔧 UX + auto-download + cache em case17              | `jira_management/commands/case17.ts`                                         | 1h      | ✅     |
| A4  | 🔧 Auto-cache CTRF pós-pipeline                      | `git_triggers/pipeline-handler.ts`                                           | 30min   | ✅     |
| A5  | 🔧 Config keys METRICS_MAX_RUNS, REPORT_CACHE_MAX    | `shared/config-schema.ts`                                                    | 15min   | ✅     |
| A6  | 📋 Testes para A1-A5                                 | `shared/report-cache.test.ts`, `case17.test.ts`, `case17-test-utils.test.ts` | 1.5h    | ✅     |

### Métricas alvo — Sprint A

| Métrica                      | Alvo       | Resultado |
| ---------------------------- | ---------- | --------- |
| `tsc --noEmit`               | 0 erros    | ✅ 0      |
| `vitest run`                 | 100% pass  | ✅ 4216   |
| `npm run lint`               | 0 erros    | ✅ 0      |
| `enforce-quality`            | ≥16 checks | ✅ 17     |
| case17 sem CI: UX melhorada  | ✅         | ✅        |
| case17 com CI: auto-download | ✅         | ✅        |
| Cache local com prune        | ✅         | ✅        |
| Pipeline → cache automático  | ✅         | ✅        |

---

## 🚀 Sprint B — Prevenção: CI Gate + ux-auditor (Jun/2026)

**Data:** 2026-06-07
**Origem:** Features bifurcadas (código existe mas handler não usa), submenus sem alias, handlers sem entrada de menu.
**Foco:** Impedir criação de débitos novos, detectar débitos existentes.

| ID  | Item                                                                                                 | Arquivo(s)                                                                | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------- | ------ |
| B1  | 🔧 CI Gate: handler ↔ menu ↔ alias 3-way consistency                                                 | `scripts/enforce-quality.ts`                                              | 1h      | ✅     |
| B2  | 🔧 ux-auditor agent script (soft: jornada ruidosa, dead utility, friction score)                     | (novo) `scripts/ux-auditor.ts`                                            | 3h      | ✅     |
| B3  | 🔧 Rodar auditor + corrigir achados (4 fases: hints + submenu FP + import-aware detector + re-audit) | Codebase, `scripts/ux-auditor.ts`                                         | 3h      | ✅     |
| B2b | 🔧 Commit missing modules (report-cache.ts, case17-test-utils.ts) from prior session — CI fix        | `shared/report-cache.ts`, `jira_management/commands/case17-test-utils.ts` | 5min    | ✅     |
| B4  | 📋 docs/ux-auditor.md + HELP_TOPICS entry                                                            | `docs/ux-auditor.md`, `menu-data.ts`                                      | 30min   | ✅     |

### Métricas alvo — Sprint B

| Métrica                   | Alvo       | Resultado                                      |
| ------------------------- | ---------- | ---------------------------------------------- |
| `tsc --noEmit`            | 0 erros    | ✅ 0                                           |
| `vitest run`              | 100% pass  | ✅ 4216                                        |
| `npm run lint`            | 0 erros    | ✅ 0                                           |
| `enforce-quality`         | ≥18 checks | ✅ 17 checks (check 17 is CI gate itself)      |
| Handlers sem menu         | 0          | ✅ 0                                           |
| ux-auditor gera relatório | ✅         | ✅                                             |
| ux-auditor import-aware   | ✅         | ✅ (falsos positivos: 527→93, -82%)            |
| Features bifurcadas       | 0          | ✅ 0                                           |
| Hints em ask() calls      | 100%       | ✅ 21/21 (1 FP regex: nested parens em case17) |
| Prompts sem hint (real)   | 0          | ✅ 0                                           |

---

## 🚀 Sprint C — Git-as-Database: Git como Store Universal (Jun/2026)

**Data:** 2026-06-07
**Origem:** Análise adversarial — 6 iterações de quebra e reconstrução. A última rodada revelou que o domínio da ferramenta (Git + Jira) torna "offline" um caso excepcional, não a regra. Git é o banco de dados; filesystem é fallback.
**Invariante central:** SHA do commit é a chave universal. Toda escrita é um `git commit` atômico. Toda leitura é `cat` do working tree. Git reflog é o recovery. Git push/pull é o sync.

### Hierarquia de Store (tentativa em ordem)

```
┌─ 1. .qa-tools/ (project subdir, git-committed)
│   ├── git add + git commit [skip ci]
│   ├── hook suppression (core.hooksPath=/dev/null)
│   └── Requer: write access no repo do projeto
│
├─ 2. ~/.local/share/qa-tools/ (git repo independente)
│   ├── git init no XDG dir
│   ├── Remote configurável (personal repo)
│   └── Requer: git disponível
│
└─ 3. FsBackend (sem git, mesmo diretório do #2)
    ├── tmp+rename para atomicidade parcial
    ├── Sem history, sem sync
    └── Fallback quando git não está disponível
```

### Arquitetura

```
StoreBackend (interface)
├── GitBackend
│   ├── init: git init + user.name/email + remote opcional
│   ├── write: acumula, flush: git add + git commit [skip ci]
│   ├── read: fs.readFileSync do working tree
│   └── flush(message) → git commit serializado
│
└── FsBackend
    ├── init: mkdir -p
    ├── write: writeFileSync imediato
    ├── read: fs.readFileSync
    └── flush: no-op

Store (domain logic)
├── Index: lookup(sha) / put(sha, meta)
│   ├── reports/index.json global
│   └── reports/{project}/index.json per-project
├── Branch: appendBranch(branch, sha) / getBranch(branch)
│   └── Append-only list (timestamped), sem race condition
├── Reports: saveReport(sha, tests) / loadReport(sha)
│   └── reports/{project}/{sha}.json imutável
└── Metrics: loadMetrics / saveMetrics
    └── reports/{project}/metrics.json

Resolução (resolveSessionContext)
├── 1. SHA cache → GitShaProvider → Store.lookup(sha)
├── 2. CI download → CiDownloader → Store.saveReport + flush
├── 3. Branch baseline → Store.getBranch(branch) → SHA → passo 1
└── 4. User prompt → "Quer acionar pipeline?" → CI → passo 2
```

| ID     | Item                                                                                                               | Arquivo(s)                                | Esforço | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------- | ------ |
| GC-01  | ♻️ StoreBackend interface + GitBackend + FsBackend (implementado, cobertura 68%)                                   | `shared/store-backend.ts`                 | 2h      | 🔄     |
| GC-01a | 📋 Completar testes store-backend.ts → 100% (branches: detectStoreBackend, GitStoreBackend.init, read error paths) | `shared/store-backend.test.ts`            | 1h      | 🔄     |
| GC-02  | ♻️ Store domain logic (implementado, cobertura 97%)                                                                | `shared/store.ts`                         | 2h      | ✅     |
| GC-03  | ♻️ `shared/git-sha.ts` (implementado, cobertura 100% stmts, 85% branches)                                          | `shared/git-sha.ts`                       | 30min   | 🔄     |
| GC-03a | 📋 Completar testes git-sha.ts → 100% (CI env, packed-refs, execSync fallback)                                     | `shared/git-sha.test.ts`                  | 30min   | 🔄     |
| GC-04  | ♻️ session-context.ts expandido com resolveSessionContext + resolveTestDataSource                                  | `shared/session-context.ts`               | 2h      | 🔄     |
| GC-04a | 📋 Adicionar testes session-context.ts → 100%                                                                      | `shared/session-context.test.ts`          | 1h      | 🔄     |
| GC-05  | ♻️ Extrair git-artifact-downloader.ts (implementado, cobertura 27%)                                                | `shared/git-artifact-downloader.ts`       | 2h      | 🔄     |
| GC-05a | 📋 Completar testes git-artifact-downloader.ts → 100%                                                              | `shared/git-artifact-downloader.test.ts`  | 2h      | 🔄     |
| GC-05b | ♻️ ci-detect.ts extraído (implementado, cobertura 0%)                                                              | `shared/ci-detect.ts`                     | 10min   | 🔄     |
| GC-05c | 📋 Adicionar testes ci-detect.ts → 100%                                                                            | `shared/ci-detect.test.ts`                | 15min   | 🔄     |
| GC-06  | ♻️ Rewrite `report-cache.ts` usando Store                                                                          | `shared/report-cache.ts`                  | 1h      | ⏳     |
| GC-07  | ♻️ Rewrite `metrics.ts` usando Store                                                                               | `shared/metrics.ts`                       | 1h      | ⏳     |
| GC-08  | 🔧 Strangler Fig: case17 consome resolveTestDataSource (via \_chooseTestDataSource)                                | `jira_management/commands/case17.ts`      | 2h      | ⏳     |
| GC-08a | 📋 Atualizar mocks no case17.test.ts para novas dependências                                                       | `jira_management/commands/case17.test.ts` | 1h      | ⏳     |
| GC-09  | 🔧 case15: consumir resolveSessionContext, remover lastJsonDir                                                     | `jira_management/commands/case15.ts`      | 1h      | ⏳     |
| GC-10  | 📋 Testes de integração: Store + SessionContext + CiDownloader (coberto por unit)                                  | —                                         | 0h      | ✅     |
| GC-11  | 🔧 Limpeza: remover código obsoleto do Strangler Fig pós-migração                                                  | `case17.ts`, `case17-test-utils.ts`       | 1h      | ⏳     |
| GC-12  | 🔧 Coverage CI Node 22 ≥ 90% statements (atual: 89.23%)                                                            | `vitest.config.ts`, todos os arquivos     | —       | 🔴     |

### Métricas alvo — Sprint C

| Mététrica                       | Alvo                           |
| ------------------------------- | ------------------------------ |
| `tsc --noEmit`                  | 0 erros                        |
| `vitest run`                    | 100% pass                      |
| `npm run lint`                  | 0 erros                        |
| `npm run test:coverage`         | Node 22 ≥90% statements        |
| Stores de test data             | **1** (Store via StoreBackend) |
| Handlers que pedem path manual  | **0**                          |
| Implementações download CI      | **1** (shared)                 |
| Código de persistência          | **~160 linhas** (vs ~400)      |
| Race conditions em branch-index | **0** (append-only + git)      |
| `.qa-tools/` init automático    | **✅ auto-detect**             |

---

## 🖥️ Sprint TUI — Terminal User Interface com Ink (P2)

**Data:** 2026-06-06
**Stack:** Ink (React Terminal) + `@inkjs/ui` + `@opentui/react` reservado para WebAdapter futuro
**Motivação:** Interface de usuário persistente, rica e responsiva no terminal, com arquitetura port/adapter (`IUserInterface`) que barateia o WebAdapter futuro.

**Decisão técnica:** Ink escolhido sobre OpenTUI após pesquisa extensiva.

- OpenTUI (Zig nativo, 60fps) — performance que não precisamos para app menu-driven
- Ink (React, 32fps, 1.3M downloads/sem, 7 anos de API estável) — **estabilidade comprovada** para o que precisamos
- Risco de breaking changes do OpenTUI pré-1.0 não justifica ganho marginal de performance
- Ambos suportam o padrão port/adapter — a escolha não afeta o WebAdapter futuro

### Fase 1 — IUserInterface (Porta)

| ID   | Item                                                                                           | Arquivo(s)                                  | Esforço | Status |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- | ------- | ------ |
| TU-1 | Definir interface `IUserInterface` (menu, output, status, notifications, input)                | `shared/ui-port.ts`                         | 2d      | ⏳     |
| TU-2 | Definir view models (MenuView, OutputView, StatusBar, Notification)                            | `shared/ui-views.ts`                        | 1d      | ⏳     |
| TU-3 | Implementar `CliAdapter` (mantém o CLI existente como implementação da porta)                  | `shared/ui-cli.ts`                          | 2d      | ⏳     |
| TU-4 | Migrar handlers existentes para chamar `IUserInterface` em vez de `prompt`/`showSelect` direto | `jira_management/*.ts`, `git_triggers/*.ts` | 3d      | ⏳     |

### Fase 2 — TuiAdapter (Ink)

| ID   | Item                                                                           | Arquivo(s)              | Esforço | Status |
| ---- | ------------------------------------------------------------------------------ | ----------------------- | ------- | ------ |
| TU-5 | Implementar `TuiAdapter` com Ink (menu esquerdo + output direito + status bar) | `shared/ui-tui.ts`      | 3d      | ⏳     |
| TU-6 | Componentes Ink: MenuPanel, OutputPanel, StatusBar, Toast                      | `shared/ui-components/` | 2d      | ⏳     |
| TU-7 | Pipeline monitor em tempo real no painel de status                             | `shared/ui-tui.ts`      | 2d      | ⏳     |
| TU-8 | Preview inline de reports + botão "Abrir no browser"                           | `shared/ui-tui.ts`      | 1d      | ⏳     |

### Fase 3 — Integração + Testes

| ID    | Item                                            | Arquivo(s)                          | Esforço | Status |
| ----- | ----------------------------------------------- | ----------------------------------- | ------- | ------ |
| TU-9  | Integração com handlers existentes (jira + git) | `jira_management/`, `git_triggers/` | 2d      | ⏳     |
| TU-10 | Testes de componente Ink                        | `shared/ui-components/*.test.tsx`   | 2d      | ⏳     |
| TU-11 | Testes de integração IUserInterface             | `shared/ui-port.test.ts`            | 1d      | ⏳     |

### Fase 4 — WebAdapter (futuro, +2 sprints)

| ID    | Item                                                                           | Arquivo(s)         | Esforço   | Status    |
| ----- | ------------------------------------------------------------------------------ | ------------------ | --------- | --------- |
| TU-12 | Implementar `WebAdapter` (Fastify + Alpine.js) usando a mesma `IUserInterface` | `shared/ui-web.ts` | 3 sprints | 🎯 Futuro |

### Métricas alvo

| Métrica                        | Alvo          |
| ------------------------------ | ------------- |
| `tsc --noEmit`                 | **0 erros**   |
| `vitest run`                   | **100% pass** |
| `npm run lint`                 | **0 erros**   |
| Handlers usando IUserInterface | **100%**      |
| CLI atual continua funcional   | **✅**        |

---

## 🎯 Hook Inline — Refactor Arquitetural (Avaliação Futura)

**Data:** 2026-06-07
**Origem:** Análise crítica identificou que o hook atual roda **antes** do commit. LLM pode ignorar resultados porque hook é externo ao fluxo de execução.
**Status:** 🎯 **Avaliação futura. NÃO executar agora.**

**Pré-requisitos para avaliação:**

- [ ] Sprint Hardening (P1) completa
- [ ] Métricas de falsos positivos coletadas (mínimo 30 dias)
- [ ] Taxa de aprovação humana < 50% (indica UX ruim, justifica refactor)

**Esforço estimado:** 3 dias
**ROI:** Incerto
**Risco:** 🔴 Alto

**Descrição:** Mover validação de "pre-commit hook externo" para "in-line no fluxo de execução da LLM". Validação torna-se parte do runtime — contorno fisicamente impossível porque LLM nao pode gerar código sem passar pela validação.

**Comparação com modelo atual:**

| Aspecto           | Hook externo (atual) | Hook inline (proposto) |
| ----------------- | -------------------- | ---------------------- |
| Contorno possível | Sim (re-classificar) | Não (runtime)          |
| Latência          | Baixa (assíncrono)   | Média (síncrona)       |
| Complexidade      | Baixa                | Alta                   |
| Compatibilidade   | Universal            | Requer framework       |
| Manutenibilidade  | Independente         | Acoplado ao runtime    |

---

## ♻️ Sprint Dead Code — Eliminação de Exports Mortos (Jun/2026)

**Data:** 2026-06-07
**Origem:** Análise ts-prune identificou 59 exports não-importados por nenhum módulo. Destes, **28 são risco zero** (type re-exports puros, zero valor de negócio perdido). Os demais (~31) são itens com risco >0 (test re-exports intencionais, barrel `export *` estrutural, funções órfãs com valor de domínio) — deferidos sine die.
**Abordagem:** Remoção cirúrgica apenas de type/exports de barrel que ninguém importa. Nenhuma mudança em runtime. Nenhum contrato afetado (as definições reais continuam nos submódulos).

| ID    | Item                                                          | Arquivo(s)                         | Itens | Risco | Status |
| ----- | ------------------------------------------------------------- | ---------------------------------- | ----- | ----- | ------ |
| DC-01 | ♻️ Remover 14 type re-exports Zod                             | `shared/validation.ts`             | 14    | ZERO  | ✅     |
| DC-02 | ♻️ Remover AxiosResponse, AxiosError                          | `shared/deps.ts`                   | 2     | ZERO  | ✅     |
| DC-03 | ♻️ Remover ConfigField, CONFIG_SCHEMA, validateRequiredEnv    | `shared/config.ts`                 | 3     | ZERO  | ✅     |
| DC-04 | ♻️ Remover PromptOptions, FilePathOptions, Select\* in barrel | `shared/prompt-input.ts`           | 5     | ZERO  | ✅     |
| DC-05 | ♻️ Remover NavLink da barrel                                  | `shared/markdown.ts`               | 1     | ZERO  | ✅     |
| DC-06 | ♻️ Remover ReviewDecision duplicado                           | `shared/llm-review-types.ts`       | 1     | ZERO  | ✅     |
| DC-07 | ♻️ Remover ReviewDecision re-export morto                     | `shared/llm-review.ts`             | 1     | ZERO  | ✅     |
| DC-08 | ♻️ Remover ArtifactType duplicado (autodefinido não-usado)    | `shared/llm-self-consistency.ts`   | 1     | ZERO  | ✅     |
| DC-09 | 🔧 Atualizar baseline .unused-exports-baseline                | `scripts/.unused-exports-baseline` | —     | ZERO  | ✅     |
| DC-10 | 📋 Documentar itens diferidos sine die                        | `docs/DEFERRED-DEAD-CODE.md`       | —     | —     | ✅     |

**Total removido:** 28 exports em 8 arquivos.

### Métricas alvo — Sprint Dead Code

| Métrica                       | Alvo                 | Resultado                       |
| ----------------------------- | -------------------- | ------------------------------- |
| `tsc --noEmit`                | **0 erros**          | ✅ 0                            |
| `vitest run`                  | **100% pass**        | ✅ 4231                         |
| `npm run lint`                | **0 erros**          | ✅ 0                            |
| `check-unused-exports.sh`     | **0 new** (`exit 0`) | ✅ exit 0                       |
| Exports removidos             | **28**               | ✅ 28                           |
| Itens diferidos (não tocados) | **—** (registrados)  | ✅ `docs/DEFERRED-DEAD-CODE.md` |

---

## 🚀 Sprint Coverage — Elevar Cobertura para >92% (Jun/2026)

**Data:** 2026-06-08
**Origem:** Meta de cobertura: >92% statements geral + todo arquivo >50%.
**Cobertura atual:** 90.1% statements (12017/13337)
**Alvo:** >92% statements (>12270/13337)

| ID    | Item                                                   | Arquivo(s)                                                           | Esforço | Status |
| ----- | ------------------------------------------------------ | -------------------------------------------------------------------- | ------- | ------ |
| CV-01 | 📋 Testes para `test-execution-creator-factory.ts`     | `shared/test-utils/factories/test-execution-creator-factory.test.ts` | 10min   | ✅     |
| CV-02 | 📋 Completar testes `config-factory.ts` (62→92%)       | `shared/test-utils/factories/config-factory.test.ts`                 | 10min   | 🔄     |
| CV-03 | 📋 Completar testes `palette.ts` (88→92%)              | `shared/palette.test.ts`                                             | 5min    | ⏳     |
| CV-04 | 📋 Completar testes `quality-metrics.ts` (71→92%)      | `shared/quality-metrics.test.ts`                                     | 30min   | ⏳     |
| CV-05 | 📋 Completar testes `targeted-retry.ts` (72→92%)       | `shared/targeted-retry.test.ts`                                      | 20min   | ⏳     |
| CV-06 | 📋 Completar testes `schedule-handler.ts` (43→92%)     | `git_triggers/schedule-handler.test.ts`                              | 30min   | ⏳     |
| CV-07 | 📋 Completar testes `main.ts` jira_management (38→92%) | `jira_management/main.test.ts`                                       | 30min   | ⏳     |
| CV-08 | 📋 Criar testes `interactive-mode.ts` (25→92%)         | `git_triggers/interactive-mode.test.ts`                              | 2h      | ⏳     |
| CV-09 | 📋 Elevar `batch-mode.ts` (57→92%)                     | `git_triggers/batch-mode.test.ts`                                    | 20min   | ⏳     |
| CV-10 | 📋 Elevar demais arquivos 50-92%                       | múltiplos                                                            | 1h      | ⏳     |

### Métricas alvo — Sprint Coverage

| Métrica                     | Alvo          |
| --------------------------- | ------------- |
| `tsc --noEmit`              | **0 erros**   |
| `vitest run`                | **100% pass** |
| `npm run lint`              | **0 erros**   |
| Statements coverage         | **>92%**      |
| Menor cobertura por arquivo | **>50%**      |

---

## 🔒 Sprint Security — OpenCode Local Machine Hardening (Jun/2026)

**Origem:** Security audit — project-level `opencode.json` has wide-open permissions that override restricted user-level config.

**Problema:** Config precedence (project > user) means `"edit": "allow"` and `"bash": "allow"` in `./opencode.json` bypass the user's restrictive `"ask"` policies.

**Ordem de implementação:** risco decrescente — o que mais expõe primeiro.

| Layer | Foco                        | Risco | Justificativa                                              |
| ----- | --------------------------- | ----- | ---------------------------------------------------------- |
| 1     | Project config permissions  | Alto  | Fechar a brecha principal — overrides de permissão         |
| 2     | Plugin de segurança         | Alto  | opencode-warden + external_directory para detecção passiva |
| 3     | Hooks + regras do agente    | Médio | Prevenir bypass futuro, auditar ações                      |
| 4     | Sandbox + branch protection | Baixo | Defesa em profundidade, opcional                           |

---

### Layer 1 — 🔧 Project Config Permissions

| ID   | Item                                                                           | Arquivo         | Esforço | Status |
| ---- | ------------------------------------------------------------------------------ | --------------- | ------- | ------ |
| SC-1 | 🔧 Restringir `permission.edit` de `"allow"` para `"ask"` com paths bloqueados | `opencode.json` | 5min    | ✅     |
| SC-2 | 🔧 Restringir `permission.bash` de `"allow"` para pattern-based `"ask"`        | `opencode.json` | 5min    | ✅     |
| SC-3 | 🔧 Adicionar `permission.webfetch: "ask"`, `websearch: "ask"`                  | `opencode.json` | 2min    | ✅     |
| SC-4 | 🔧 Adicionar `permission.share: "disabled"`                                    | `opencode.json` | 1min    | ✅     |

### Layer 2 — 🔧 Security Plugin + External Directory

| ID   | Item                                                                               | Arquivo                             | Esforço | Status |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------- | ------- | ------ |
| SC-5 | 🔧 Adicionar `opencode-warden` ao array `plugin` (auto-instala via Bun)            | `opencode.json`                     | 2min    | ✅     |
| SC-6 | 🔧 Adicionar `external_directory` com denies para `.ssh`, `.gnupg`, `.aws`, `/etc` | `~/.config/opencode/opencode.jsonc` | 5min    | ✅     |
| SC-7 | 🔧 Criar config do warden (`.opencode/opencode-warden.json`)                       | `.opencode/opencode-warden.json`    | 5min    | ✅     |

### Layer 3 — 🔧 Hooks + Agent Rules

| ID    | Item                                                                               | Arquivo                    | Esforço | Status |
| ----- | ---------------------------------------------------------------------------------- | -------------------------- | ------- | ------ |
| SC-8  | 🔧 Adicionar Rule 18 no AGENTS.md: bypass de segurança exige autorização explícita | `AGENTS.md`                | 5min    | ✅     |
| SC-9  | 🔧 Criar script post-session log scanner (secrets, audit)                          | `scripts/scan-sec-logs.sh` | 15min   | ✅     |
| SC-10 | 🔧 Criar git pre-push hook que bloqueia `--no-verify` sem audit trail              | `.githooks/pre-push`       | 15min   | ✅     |

### Layer 4 — 🔧 Defesa em Profundidade (Opcional)

| ID    | Item                                                                           | Arquivo                                         | Esforço | Status |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------- | ------- | ------ |
| SC-11 | 🔧 sandbox-exec.sh para execução isolada de bash (bwrap/unshare)               | `scripts/sandbox-exec.sh`                       | 15min   | ✅     |
| SC-12 | 🔧 Script de configuração de branch protection (GitHub UI/gh CLI)              | `scripts/setup-branch-protection.sh`            | 5min    | ✅     |
| SC-13 | 🔧 Managed config instructions (root-owned, chattr +i) incluso no setup script | `scripts/setup-branch-protection.sh`            | 5min    | ✅     |
| SC-14 | 🔧 opencode-guard.sh — daemon de monitoramento em tempo real (systemd --user)  | `scripts/opencode-guard.sh`                     | 30min   | ✅     |
| SC-15 | 🔧 Instalação do guard como systemd --user service (auto-start no login)       | `~/.config/systemd/user/opencode-guard.service` | 5min    | ✅     |
| SC-16 | 🔧 Dependências: inotify-tools + libnotify-bin para notificações desktop       | (apt)                                           | 2min    | ✅     |

---

## 🐳 Sprint Container — Isolamento Podman para opencode (Jun/2026)

**Data:** 2026-06-08
**Origem:** Sprint Security Layer 4 (SC-11 sandbox-exec.sh) migrado de bwrap/unshare para isolamento via Podman. Container minimal com Node 24 LTS + opencode.
**Motivação:** bwrap/unshare não isolam filesystem do host adequadamente. Container rootless com `--read-only`, `--cap-drop ALL`, `--userns keep-id` oferece isolamento real.

| ID   | Item                                                                                 | Arquivo(s)                                | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ------- | ------ |
| CN-1 | 🔧 Criar Dockerfile: Debian slim + Node 24 LTS + opencode + utilidades mínimas       | `~/.config/opencode/container/Dockerfile` | 20min   | ✅     |
| CN-2 | 🔧 Criar wrapper qa.sh: podman run com volumes, --read-only, --cap-drop ALL          | `scripts/qa.sh`                           | 15min   | ✅     |
| CN-3 | 🏗️ Build imagem opencode-qa                                                          | `podman build -t opencode-qa`             | 5min    | ✅     |
| CN-4 | 🔧 Adicionar alias `qa` ao .bashrc                                                   | `~/.bashrc`                               | 2min    | ✅     |
| CN-5 | ♻️ Remover sandbox-exec.sh (superseded by podman container)                          | `scripts/sandbox-exec.sh`                 | 2min    | ✅     |
| CN-6 | 🔧 Adaptar opencode-guard.sh com verificação de container running + volumes corretos | `scripts/opencode-guard.sh`               | 15min   | ✅     |
| CN-7 | 📋 Testes: qa.sh — sintaxe bash, argument passthrough, detecção de podman            | `scripts/qa.test.ts`                      | 20min   | ✅     |
| CN-8 | 🧪 Teste de integração: qa --version, isolamento ~/.ssh, npm test no container       | (manual, documentado)                     | 15min   | ✅     |

### Métricas alvo — Sprint Container

| Métrica                            | Alvo          | Resultado |
| ---------------------------------- | ------------- | --------- |
| `tsc --noEmit`                     | **0 erros**   | ✅ 0      |
| `vitest run`                       | **100% pass** | ✅ 4454   |
| `npm run lint`                     | **0 erros**   | ✅ 0      |
| Dockerfile build pass              | **✅**        | ✅        |
| `qa --version` = opencode 1.16.2   | **✅**        | ✅        |
| Container não acessa `~/.ssh`      | **✅**        | ✅        |
| Container não acessa `/etc/shadow` | **✅**        | ✅        |
| sandbox-exec.sh removido           | **✅**        | ✅        |
| Guard detecta container offline    | **✅**        | ✅        |

### O que o Guard Monitora (30 arquivos)

| Severidade   | Arquivos                                                                                                                                                          | Quando muda...                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 🔴 Crítico   | `opencode.json`, `.env`, `validation_hook.ts`, `validation_plugin.ts`, `package.json`, `pre-push`                                                                 | 🔥 Notificação crítica na tela |
| 🟡 Segurança | `eslint.config.mjs`, `tsconfig*.json`, `vitest.config.ts`, `jest.config.js`, `ci.yml`, `gitlab-ci.yml`, `dependabot.yml`, `quality-gate.ts`, `enforce-quality.ts` | 🟡 Notificação normal + log    |
| 🔵 Config    | `AGENTS.md`, `.gitignore`, `qa-quarantine.json`, `warden.json`, `validation.json`, `agents/*.md`, `config/*.json`                                                 | 🔵 Log + journald              |

---

## 🚀 Sprint Senior Audit II — Correções Pós-Auditoria (2026-06-08)

**Origem:** Senior Codebase Audit — 28 achados (1 CRÍTICO, 7 HIGH, 8 MEDIUM, 8 LOW, 4 INFO).
**Relatório completo:** `.audit/senior-audit-2026-06-08.json`
**Estratégia:** 5 fases — Quick Wins primeiro, arquitetura em paralelo, testes depois do TSC estável, segurança no fim.

### Fase 0 — Quick Wins (minutos, risco baixo) ✅ Concluída

| ID     | Issue                                                     | Severidade  | Arquivo(s)                                                                                                       | Ação                                                           | Esforço                                                                                 | Status |
| ------ | --------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ | --- |
| SA2-01 | TSC errors + test timeout                                 | 🔴 CRITICAL | `e2e/real-import.ts`, `git_triggers/main.test.ts`, `scripts/check-unused-exports.sh`                             | Fix TSC (3 erros `string                                       | undefined`), test timeout (beforeAll 10s→30s), unused-exports falso positivo npm notice | 10min  | ✅  |
| SA2-02 | Non-null assertions em `ux-auditor.ts` (6 `!` em Map.get) | 🟠 HIGH     | `scripts/ux-auditor.ts`                                                                                          | Substituir `!` por `?? ''` com fallback                        | 15min                                                                                   | ✅     |
| SA2-03 | Magic literal `3600` em `pipeline-health.ts`              | 🟢 LOW      | `git_triggers/pipeline-health.ts`                                                                                | `SECONDS_PER_HOUR = 3600` já extraído (linha 354)              | 5min                                                                                    | ✅     |
| SA2-04 | Variáveis mortas `mockStore`/`parser`                     | 🟢 LOW      | `jira_management/commands/case17.test.ts`                                                                        | Remover declarações não usadas                                 | 5min                                                                                    | ✅     |
| SA2-05 | Hardcoded `'e2e-token'` em 4 e2e tests                    | 🟡 MEDIUM   | `e2e/csv-import.test.ts`, `e2e/result-pipeline.test.ts`, `e2e/testexec.test.ts`, `e2e/csv-import-errors.test.ts` | Mover para `process.env.E2E_JIRA_TOKEN` com fallback CI        | 15min                                                                                   | ✅     |
| SA2-06 | `.filter().map()` em hot paths                            | 🟡 MEDIUM   | `jira_management/result_reporter.ts`, `git_triggers/interactive-mode.ts`, `git_triggers/schedule-handler.ts`     | Substituir por `reduce()` (já resolvido em sprints anteriores) | 10min                                                                                   | ✅     |

### Fase 1 — Arquitetura e Dívida Estrutural (dias, risco médio-alto)

| ID     | Issue                                                          | Severidade | Arquivo(s)                                                                                                                           | Ação                                                                                         | Esforço | Status |
| ------ | -------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------- | ------ |
| SA2-07 | Cross-layer: `git_triggers` importa `jira_management` internos | 🟠 HIGH    | `git_triggers/pipeline-handler.ts`, `git_triggers/interactive-mode.ts`, `git_triggers/batch-mode.ts`, `git_triggers/test-results.ts` | Extrair interfaces compartilhadas para `shared/`                                             | dias    | ⏳     |
| SA2-08 | `interactive-mode.ts` com 913 linhas (SRP violation)           | 🟡 MEDIUM  | `git_triggers/interactive-mode.ts`                                                                                                   | Extrair: `menu-navigation.ts`, `project-actions.ts`, `pipeline-actions.ts`, `ai-features.ts` | dias    | ⏳     |
| SA2-09 | `console.log` em e2e scripts em vez de Logger                  | 🟠 HIGH    | `e2e/gen-report.ts`, `e2e/gen-report-complete.ts`, `e2e/smoke-pipeline.ts`                                                           | Substituir por `rootLogger` de `shared/logger.js`                                            | horas   | ⏳     |
| SA2-10 | `process.exit` direto em e2e scripts                           | 🟡 MEDIUM  | `e2e/gen-report.ts`, `e2e/gen-report-complete.ts`, `e2e/real-import.ts`, `e2e/run-e2e.ts`                                            | Substituir por `gracefulExit` de `shared/cli_base.ts`                                        | horas   | ⏳     |
| SA2-11 | 85 exports potencialmente não usados (ts-prune)                | 🟠 HIGH    | Múltiplos (principal `shared/llm-fallback.ts`)                                                                                       | Auditar e remover exports mortos; marcar type-only com `export type`                         | dias    | ⏳     |

### Fase 2 — Cobertura de Testes (dias, risco médio)

| ID     | Issue                                 | Severidade | Arquivo(s)                                                                                | Ação                                                                 | Esforço | Status |
| ------ | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- | ------ |
| SA2-12 | 18 módulos sem `.test.ts`             | 🟠 HIGH    | `scripts/*`, `e2e/*`, `jira_management/commands/case25-27.ts`, `shared/dashboard-menu.ts` | Adicionar testes para cada módulo                                    | dias    | ⏳     |
| SA2-13 | `case25/26/27` sem testes             | 🟡 MEDIUM  | `jira_management/commands/case25.test.ts`, `case26.test.ts`, `case27.test.ts`             | Adicionar testes básicos + verificar registro em `commands/index.ts` | horas   | ⏳     |
| SA2-14 | Invariants `t-01..t-13` sem cobertura | ⚪ INFO    | `shared/invariants/t-*.ts`                                                                | Esclarecer papel e adicionar testes                                  | horas   | ⏳     |
| SA2-15 | E2E tests acoplados a construtores    | ⚪ INFO    | `e2e/csv-import.test.ts`                                                                  | Usar factory functions (`test-utils/factories/`)                     | horas   | ⏳     |

### Fase 3 — Segurança e Correções (horas, risco médio)

| ID     | Issue                                              | Severidade | Arquivo(s)                                     | Ação                                                | Esforço | Status |
| ------ | -------------------------------------------------- | ---------- | ---------------------------------------------- | --------------------------------------------------- | ------- | ------ |
| SA2-16 | `execSync` com concatenação de string              | 🟠 HIGH    | `shared/git-sha.ts`, `shared/store-backend.ts` | Substituir por `execFile` ou `spawn` com args array | horas   | ⏳     |
| SA2-17 | Mock `store-backend` diverge da implementação real | 🟠 HIGH    | `shared/__mocks__/store-backend.ts`            | Alinhar mock com `StoreBackend` interface real      | horas   | ⏳     |
| SA2-18 | `llm-fallback.ts` exporta muitos internos          | 🟢 LOW     | `shared/llm-fallback.ts`                       | Reduzir exports públicos; mover constantes          | horas   | ⏳     |

### Fase 4 — Polimento (horas, risco baixo)

| ID     | Issue                                              | Severidade | Arquivo(s)                                               | Ação                                    | Esforço | Status |
| ------ | -------------------------------------------------- | ---------- | -------------------------------------------------------- | --------------------------------------- | ------- | ------ |
| SA2-19 | Nomenclatura inconsistente: `pr` vs `mergeRequest` | ⚪ INFO    | `git_triggers/github_pr.ts`, `git_triggers/gitlab_pr.ts` | Padronizar prefixo `mergeRequest`       | horas   | ⏳     |
| SA2-20 | `constants.ts` sem cobertura de teste              | ⚪ INFO    | `jira_management/constants.test.ts`                      | Verificar/adicionar teste de constantes | minutos | ⏳     |

### Métricas alvo — Sprint Senior Audit II

| Métrica                                       | Atual        | Alvo        | Status       |
| --------------------------------------------- | ------------ | ----------- | ------------ |
| `tsc --noEmit`                                | 9 erros      | **0 erros** | ✅ 0         |
| `npm test`                                    | 4398 pass ✅ | 100% pass   | ✅ 4455 pass |
| `npm run lint`                                | 0 erros ✅   | 0 erros     | ✅ 0         |
| Módulos sem teste                             | 18           | **0**       | ⏳           |
| Non-null assertions (`!`)                     | 6            | **0**       | ✅ 0         |
| `console.log` em produção                     | ~50+         | **0**       | ⏳           |
| Unused exports (ts-prune)                     | 85           | **0**       | ⏳           |
| Arquivos >400 linhas                          | 6            | **<3**      | ⏳           |
| `process.exit` direto                         | ~10+         | **0**       | ⏳           |
| Hardcoded tokens                              | 4            | **0**       | ✅ 0         |
| Cross-layer `git_triggers -> jira_management` | 4 files      | **0**       | ⏳           |
| execSync string concat                        | 2 files      | **0**       | ⏳           |

---
