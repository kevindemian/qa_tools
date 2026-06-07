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
| SA-20 | ♻️ Extrair CLI argument parsing de `git_triggers/main.ts` (443 linhas)                                        | `git_triggers/main.ts` → `git_triggers/cli-args.ts`                                        | 1h      | 🟡 Médio | ⏳     |
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

| #       | Item                                                                               | Severidade | Local                    |
| ------- | ---------------------------------------------------------------------------------- | ---------- | ------------------------ |
| **F0**  | `runCheck` trata `review` como inválido — aprovacão humana ignorada no pre-hook/CI | 🔴 Crítico | `runCheck()`             |
| **F1**  | Recursion depth protection ineficaz (AsyncLocalStorage reseta depth)               | 🔴 Alta    | `validateMultiCommand()` |
| **F2**  | Dupla leitura de `COMMIT_EDITMSG`                                                  | 🔴 Alta    | `runCheckCommitMsg()`    |
| **F3**  | `SED_PATTERN` backreference `\1` incorreto                                         | 🟡 Média   | `SED_PATTERN`            |
| **F4**  | Non-null assertion `match[1]!` insegura                                            | 🟡 Média   | `parseGitDiff()`         |
| **F5**  | `detectFileWrites` — aspas aninhadas truncam conteudo                              | 🟡 Média   | 6 regex patterns         |
| **F6**  | Lookbehind `\s{0,20}` só captura whitespace — falso positivo                       | 🟡 Média   | 3 lookbehinds            |
| **F7**  | `parseInt` sem fallback — env var invalida produz `NaN`                            | 🟡 Média   | Config block             |
| **F8**  | `hasDangerousCodeDensity` nao filtra `/* */` comments                              | 🟢 Baixa   | density check            |
| **F9**  | Variavel `gitDir` nome enganoso (e' caminho de arquivo)                            | 🟢 Baixa   | `runCheckCommitMsg()`    |
| **F10** | Entry point sem normalizacao de caminho (symlink quebra)                           | 🟢 Baixa   | entry point              |
| **F11** | `runCheck` com diff vazio retorna falso positivo                                   | 🟢 Baixa   | `runCheck()`             |

### Solução implementada

| Componente          | O que faz                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approval Ledger** | `~/.config/opencode/.review_approvals.json` — auto-registra `pending` entries ao detectar `review` patterns, auto-aprova por hash match no pre-hook, expira em 90 dias |
| **Block vs Review** | `validateResponse` bloqueia tudo; `runCheck` bloqueia so `block`, reporta `review`; hash-match no pre-hook aprova `review` automaticamente                             |
| **CLI expandido**   | `--full-scan`, `--audit`, `--pending`, `--approve`, `--revoke`, `--approvals`, `--summary`, `--interactive-approve`, `--json` combinavel                               |

### Lotes

| Lote | Descrição                                                | Itens | Status |
| ---- | -------------------------------------------------------- | ----- | ------ |
| A    | Correção de bugs F1–F11                                  | 11    | ⏳     |
| B    | Gap block vs review — F0a a F0f                          | 6     | ⏳     |
| C    | Approval Ledger — auto-registro, auto-match, expiração   | 6     | ⏳     |
| D    | CLI commands — 9 flags                                   | 9     | ⏳     |
| E    | Testes — `--test` expandido, ledger, runCheck, full-scan | 4     | ⏳     |

---

## 🚀 Sprint Menu — Mapeamento de Features no Menu (P0)

**Data:** 2026-06-06
**Origem:** Auditoria de menu vs. features implementadas — 25 features invisíveis ao usuário.

**Problema:** Sprints 10/11/12/V1-V5 implementaram 25 funcionalidades que não aparecem em nenhum menu. Usuário não consegue descobri-las ou acessá-las sem conhecimento prévio de comandos CLI ou env vars.

**Agrupamento das 25 features invisíveis:**

| Grupo                  | Qtd | Features                                                                                                                                                                                                                                                         | Acesso atual                  |
| ---------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Handlers órfãos        | 2   | Run Comparison, Pipeline Health                                                                                                                                                                                                                                  | Nenhum                        |
| Dashboards silenciados | 15  | Release Score, Defect Trend, Traceability, Backlog Health, AI Effectiveness, Defect Seasonality, Silent Regression, AI Comparison, Cross-Squad Benchmark, Developer Profile, Suite Optimization, Pipeline Cost, Impact Alert, Incident Report, Requirement Score | Só no relatório semanal (`r`) |
| Features CLI/env       | 2   | Quality Gate, Auto-Triage Toggle                                                                                                                                                                                                                                 | CLI/env var                   |
| Documentação           | 1   | Flaky Thresholds Docs                                                                                                                                                                                                                                            | `.env.example` + docs         |
| Infra automática       | 1   | Git Metrics Adapter                                                                                                                                                                                                                                              | Automático (fallback)         |
| Infra interna          | 4   | Circuit Breaker, Config Safety, Error Handling, Security                                                                                                                                                                                                         | Internal (não user-facing)    |

**Features user-facing a expor:** 19 (2 handlers + 15 dashboards + 2 CLI/env)

### Wave 1 — Handlers Órfãos (P0)

| ID   | Item                                                                                               | Arquivo(s)                                                  | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------- | ------ |
| WA-1 | Wirear `handleRunComparison` → handler `'c'` no ACTION_HANDLERS + menu "Comparar execuções (HTML)" | `git_triggers/main.ts`, `session-state.ts`                  | 15min   | ⏳     |
| WA-2 | Wirear Pipeline Health standalone → handler `'p'` + menu "Pipeline health (HTML)"                  | `git_triggers/batch-mode.ts`, `main.ts`, `session-state.ts` | 20min   | ⏳     |

### Wave 2 — Submenu de Dashboards Individuais (P0)

| ID   | Item                                                                                      | Arquivo(s)                                      | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ------- | ------ |
| WA-3 | Criar `_showDashboardMenu()` com `showSelect()` listando 15 dashboards                    | `git_triggers/main.ts`                          | 30min   | ⏳     |
| WA-4 | Criar funções de geração standalone p/ cada dashboard (reusa helper `_loadProjectRuns()`) | `git_triggers/schedule-handler.ts` ou `main.ts` | 2h      | ⏳     |
| WA-5 | Adicionar entry `'d'` + "Dashboards individuais" no menu UTILITARIOS                      | `session-state.ts`, `main.ts`                   | 10min   | ⏳     |

### Wave 3 — Features CLI/Env no Menu (P0)

| ID   | Item                                                                      | Arquivo(s)                                 | Esforço | Status |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------ | ------- | ------ |
| WA-6 | Wirear Quality Gate → handler `'q'` + menu "Quality Gate"                 | `git_triggers/main.ts`, `session-state.ts` | 20min   | ⏳     |
| WA-7 | Wirear Auto-Triage toggle → handler `'t'` + menu "Toggle: Bug automático" | `git_triggers/main.ts`, `session-state.ts` | 20min   | ⏳     |

### Wave 4 — Jira Management (P1)

| ID   | Item                                                                                    | Arquivo(s)                                      | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------- | ------- | ------ |
| WA-8 | Adicionar dashboards no submenu REPORTS do Jira (Traceability, Release Score, Coverage) | `jira_management/menu-data.ts`, `ui-helpers.ts` | 1h      | ⏳     |

### Wave 5 — Testes (P1)

| ID    | Item                                    | Arquivo(s)                                           | Esforço | Status |
| ----- | --------------------------------------- | ---------------------------------------------------- | ------- | ------ |
| WA-9  | Testes para novos handlers/menu entries | `git_triggers/main.test.ts`, `session-state.test.ts` | 1h      | ⏳     |
| WA-10 | Atualizar snapshot de menu se existir   | `session-state.test.ts`                              | 10min   | ⏳     |

### Métricas alvo

| Métrica                          | Alvo          |
| -------------------------------- | ------------- |
| `tsc --noEmit`                   | **0 erros**   |
| `vitest run`                     | **100% pass** |
| `npm run lint`                   | **0 erros**   |
| Handlers órfãos (sem menu)       | **0**         |
| Dashboards sem acesso individual | **0**         |
| Features CLI/env sem menu        | **0**         |

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
