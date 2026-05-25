# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## ✅ Fase 6 — Correção TUI (CONCLUÍDA)

**Data:** 2026-05-25

**Objetivo:** Substituir a abordagem TUI_STYLE (custom/sync/frágil) por `@inquirer/*` first, com fallback `readlineSync` para não-TTY. Adicionar `CancelError` em todos os inputs. Remover código morto.

### Arquivos alterados

| Arquivo                                  | Ação                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TUI_STYLE.md`                           | Removido — abordagem substituída                                                                                                                                                                                         |
| `shared/prompt.ts`                       | `confirm()`/`onError()` com `CancelError`. `showSelect()` async com `@inquirer/select`. `NAV_CMDS` completo. `smartPrompt()` delegado a `ask()`. Paginação custom removida. `tableView()` com padding + `palette.border` |
| `shared/entry-menu.ts`                   | `await showSelect()`                                                                                                                                                                                                     |
| `shared/splash.ts`                       | Simplificado — sem figlet/gradient                                                                                                                                                                                       |
| `shared/box.ts`                          | `card()` removido                                                                                                                                                                                                        |
| `jira_management/main.ts`                | `getUserChoice()` async. `try/catch CancelError`.                                                                                                                                                                        |
| `jira_management/import-prep.ts`         | `showPreview()` via markdown. `prompt`→`ask`. `smartPrompt`→`ask`.                                                                                                                                                       |
| `jira_management/import-orchestrator.ts` | Ajuste fluxo preview                                                                                                                                                                                                     |
| `jira_management/commands/*.ts`          | `prompt`→`await ask`. `confirm`→`await askConfirm`. `smartPrompt`→`await ask`.                                                                                                                                           |
| `git_triggers/main.ts`                   | `_promptChoice()` async. `try/catch CancelError`.                                                                                                                                                                        |
| `git_triggers/nivelar.ts`                | `prompt`→`await ask`                                                                                                                                                                                                     |
| `git_triggers/test-results.ts`           | `prompt`→`await ask`                                                                                                                                                                                                     |
| `git_triggers/ui-helpers.ts`             | `prompt`→`await ask`                                                                                                                                                                                                     |
| `docs/help-docs.ts`                      | `await showSelect()`                                                                                                                                                                                                     |
| `shared/prompt.test.ts`                  | Testes `CancelError` em `confirm`/`onError`/`prompt`. Testes `showSelect` TTY mock.                                                                                                                                      |
| `shared/splash.test.ts`                  | Simplificado (sem figlet/gradient mock)                                                                                                                                                                                  |
| `shared/box.test.ts`                     | Testes `card()` removidos                                                                                                                                                                                                |
| `package.json`                           | `figlet`, `gradient-string`, `@types` removidos                                                                                                                                                                          |
| `BACKLOG.md`                             | Este registro                                                                                                                                                                                                            |

### Lições aprendidas

1. `@inquirer/*` é profissional e testado — não tentar substituir por custom
2. TUI_STYLE tentou "dashboard" visual com borders demais — poluição visual
3. `readlineSync` deve ser APENAS fallback não-TTY
4. `smartPrompt()` era redundante — `ask()` já faz `/help` + validação

---

## ✅ DÉBITO-001 — OOM em criação de massa (CONCLUÍDO)

**Data:** 2026-05-25

**Solução:** `BATCH_SIZE=50` com `setImmediate()` em `executeTestCreationLoop` (`import-loop.ts:148`). Yield a cada 50 itens libera event loop e previne heap overflow.

---

## [NEW FEATURE] WEB_STYLE.md (PENDENTE)

**Prioridade:** P3

**Problema:** `WEB_STYLE.md` descreve uma interface web, nunca implementada.

**Solução proposta:** Se houver demanda, implementar como SPA standalone.

---

## 🔷 Fase de Correção de Menus e Navegação (CONCLUÍDA)

**Data:** 2026-05-25

**Objetivo:** Eliminar workarounds `require()` obsoletos, corrigir navegação do menu principal, tornar `/help` interativo, e preparar base para cobertura total de testes.

### Problemas Encontrados (Auditoria)

| #   | Gravidade | Descrição                                                                           |
| --- | --------- | ----------------------------------------------------------------------------------- |
| 1   | CRÍTICO   | `showDocs()` chamado sem `await` — UI concorrente, documento nunca visível          |
| 2   | CRÍTICO   | `/help`, `/docs`, `/history` do menu mostravam "Opção inválida" após execução       |
| 3   | ALTO      | Aliases não-numéricos (`voltar`, `ajuda`, `documentação`) eram dead mappings        |
| 4   | ALTO      | `voltar` alias mapeava para `'menu'` (sem barra) — nunca funcionava                 |
| 5   | ALTO      | `showHelp()` síncrono sem loop — /help exibia ajuda e voltava ao menu imediatamente |
| 6   | MÉDIO     | `/quit` não saía do app (não listado na condição de exit)                           |
| 7   | MÉDIO     | Código morto: verificação `/exit` em `handleSpecialInput` (já convertido antes)     |

### Correções Aplicadas

| ID   | Arquivo                   | Mudança                                                                                                          |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F0.1 | `create_tests.ts`         | Removeu `_getPm()` + `require()`, adicionou `import` direto de `isQuiet, info, warn, printError, print, success` |
| F0.2 | `import-prep.ts`          | Removeu `_getPm()` + `require()`, adicionou `import` direto de 12 funções de prompt                              |
| F0.3 | `import-orchestrator.ts`  | Removeu `_getPm()` + `require()`, adicionou `import` direto                                                      |
| F0.4 | `case01.ts`               | Substituiu `require('../create_tests')` por `import createTests = require('../create_tests')`                    |
| F0.5 | `case15.ts`               | Mesmo padrão                                                                                                     |
| F0.6 | `helpers.ts`              | Mesmo padrão                                                                                                     |
| F0.7 | `result_reporter.ts`      | Mesmo padrão (removeu bloco `require` com type annotation)                                                       |
| F0.8 | `session-context.ts`      | `import type { withSpinner }` → `import { withSpinner }`, removeu `require()`                                    |
| F1.1 | `main.ts`                 | `showDocs()` agora com `await` (2 locais: L292, L479)                                                            |
| F1.2 | `main.ts`                 | `handleSpecialInput` retorna `true` → main loop faz `continue` (sem "Opção inválida")                            |
| F1.3 | `main.ts`                 | `resolveAlias` movido para ANTES de `handleSpecialInput`                                                         |
| F1.4 | `main.ts`                 | `voltar` alias: `'menu'` → `'/menu'`                                                                             |
| F1.5 | `main.ts`                 | Nova `showHelpLoop()` — menu interativo de ajuda com navegação por tópicos                                       |
| F1.6 | `main.ts`                 | `/help` em `handleSpecialInput` agora chama `await showHelpLoop()` (não mais `showHelp()` síncrono)              |
| F1.7 | `main.ts`                 | `/quit` adicionado à condição de exit (linha 463)                                                                |
| F1.8 | `main.ts`                 | Código morto `/exit` removido de `handleSpecialInput`                                                            |
| F1.9 | `docs/` → `docs-archive/` | `historico-concluido.md` e `help-docs.ts` movidos para `docs-archive/`                                           |

### Verificação

- `npx tsc --noEmit`: 0 erros
- `npx jest --no-coverage`: 950/950 testes

### Arquivos alterados

| Arquivo                                  | Ação                        |
| ---------------------------------------- | --------------------------- |
| `shared/session-context.ts`              | Editado                     |
| `jira_management/create_tests.ts`        | Editado                     |
| `jira_management/import-prep.ts`         | Editado                     |
| `jira_management/import-orchestrator.ts` | Editado                     |
| `jira_management/commands/case01.ts`     | Editado                     |
| `jira_management/commands/case15.ts`     | Editado                     |
| `jira_management/commands/helpers.ts`    | Editado                     |
| `jira_management/result_reporter.ts`     | Editado                     |
| `jira_management/main.ts`                | Editado                     |
| `docs/historico-concluido.md`            | Movido para `docs-archive/` |
| `docs/help-docs.ts`                      | Movido para `docs-archive/` |
| `BACKLOG.md`                             | Este registro               |

---

## ✅ Fase de Expansão de Testes (CONCLUÍDA)

**Data:** 2026-05-25

**Resultado:** 997 testes, 47 suites. Cobertura expandida para case01 (onBusy + exec flow), case04 (manual + sprint), case15 (relative path), case12 (branches HTTP/network), case13 (user decline). Novo `helpers.test.ts` (error path). showHelpLoop/showDocs edge cases.

**Verificação final:**

| Comando                                                     | Saída esperada |
| ----------------------------------------------------------- | -------------- |
| `npx tsc --noEmit`                                          | ✅ 0 erros     |
| `npx jest --no-coverage`                                    | ✅ 997/997     |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | ✅ zero        |
| `grep -rn ".only(" **/*.test.*`                             | ✅ zero        |

---

## 🔷 Plano Integrado — LLM + Reports & Analytics (6 Fases)

**Prioridade:** P1

**Motivação:** Unificar LLM Integration com Reports & Analytics — LLM é a camada de inteligência que transforma reports de "display de dados" em "análise narrativa".

**Abordagem:** Incremental, zero dependências novas (fetch nativo, HTML inline, JSON local).

**Branch:** `feat/reports-analytics-llm`

### Mapa de Dependências

```
        ┌── A1 (LLM client) ──┬── B1 (prompts) ──┬── C1 (menu IA)
        │                     │                  │
Fase A ─┤                     └── D1 (failure    │
        │                        analysis)       │
        ├── A2 (HTML report) ──┬── C2 (menu rpt) ┤
        │                     └── D2 (resumo     │
        │                        narrativo)      │
        └── A3 (Metrics) ─────┬── C3 (menu hist) ┤
                              └── B2 (Coverage) ─┘
                                              │
                                              └── E (expansão)
```

### Fase A — Fundação (paralelizável, ~4-5 dias)

| Item   | O que                                                            | Arquivos                                          | Deps | Dias |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------- | ---- | ---- |
| **A1** | LLM core client (dual-tier OpenRouter + Gemini, retry, cache)    | `shared/llm-client.ts` + `.test`                  | —    | 1-2  |
| **A2** | HTML Report Generator (auto-contido, charts SVG, zero deps)      | `shared/report-generator.ts` + `.test` + template | —    | 2    |
| **A3** | Metrics Collector (history JSON via state.ts, flakiness, trends) | `shared/metrics.ts` + `.test`                     | —    | 1-2  |

### Fase B — Templates + Análise (1-2 dias)

| Item   | O que                                                                  | Arquivos                                | Deps         | Dias |
| ------ | ---------------------------------------------------------------------- | --------------------------------------- | ------------ | ---- |
| **B1** | Prompt templates .md (user-story-to-tests, failure-analysis, classify) | `shared/prompts/` (3 arquivos .md)      | A1           | 1    |
| **B2** | Coverage Analyzer (Jira issues × mapping files, gaps por epic)         | `jira_management/coverage.ts` + `.test` | JiraResource | 1-2  |

### Fase C — Comandos no Menu (~2 dias)

| Item   | O que                                                     | Deps    | Dias |
| ------ | --------------------------------------------------------- | ------- | ---- |
| **C1** | "Gerar testes com IA" (menu id 18) + handler `case18.ts`  | A1 + B1 | 1    |
| **C2** | "Gerar relatório HTML" (menu id 17) + handler `case17.ts` | A2      | 1    |
| **C3** | "Histórico / Cobertura" (menu ids 19-20) + handlers       | A3 + B2 | 1    |

### Fase D — Análise Inteligente (LLM + Reports, ~2-3 dias)

| Item   | O que                                                                  | Deps         | Dias |
| ------ | ---------------------------------------------------------------------- | ------------ | ---- |
| **D1** | Failure analysis: LLM analisa `FlatTest[]` → narrative summary no HTML | A1 + B1 + A2 | 2    |
| **D2** | Resumo narrativo no Metrics trend (LLM resume diff entre runs)         | A1 + B1 + A3 | 1-2  |

### Fase E — Expansão (~3-4 dias)

| Item                                         | Deps    | Dias |
| -------------------------------------------- | ------- | ---- |
| Flakiness Dashboard (testes >30% falha)      | D1 + D2 | 2    |
| Coverage Trends (chart cobertura × tempo)    | B2 + A2 | 1-2  |
| Comparativo Runs (diff HTML entre execuções) | A2 + D1 | 1    |
| Export CSV / Markdown                        | A2      | 1    |

### Config (`shared/config.ts` + `.env`)

```
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemini-2.0-flash-exp          # default
LLM_BASE_URL=https://openrouter.ai/api/v1       # default
LLM_SMALL_API_KEY=AIza...
LLM_SMALL_MODEL=gemini-2.0-flash-lite           # default
```

### Providers

| Tier    | Provider   | Env                 | Model                            |
| ------- | ---------- | ------------------- | -------------------------------- |
| `main`  | OpenRouter | `LLM_API_KEY`       | `google/gemini-2.0-flash-exp`    |
| `small` | Gemini API | `LLM_SMALL_API_KEY` | `gemini-2.0-flash-lite` (grátis) |

### Verificação final (cada PR)

| Comando                                                     | Saída     |
| ----------------------------------------------------------- | --------- |
| `npx tsc --noEmit`                                          | 0 erros   |
| `npx jest --no-coverage`                                    | 100% pass |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero      |
| `grep -rn ".only(" **/*.test.*`                             | zero      |

### WEB_STYLE (adiada)

Interface web SPA (servidor + frontend) postergada. Será revisitada após Fase E, quando o pipeline de dados estiver maduro e validado.

### Arquivos envolvidos (visão geral)

| Arquivo                                 | Fase | Ação                        |
| --------------------------------------- | ---- | --------------------------- |
| `shared/llm-client.ts`                  | A1   | Criar                       |
| `shared/llm-client.test.ts`             | A1   | Criar                       |
| `shared/config.ts`                      | A1   | Adicionar getters LLM       |
| `.env.example`                          | A1   | Adicionar vars LLM          |
| `shared/report-generator.ts`            | A2   | Criar                       |
| `shared/report-generator.test.ts`       | A2   | Criar                       |
| `shared/report-templates/default.html`  | A2   | Criar (template inline)     |
| `shared/metrics.ts`                     | A3   | Criar                       |
| `shared/metrics.test.ts`                | A3   | Criar                       |
| `shared/prompts/user-story-to-tests.md` | B1   | Criar                       |
| `shared/prompts/failure-analysis.md`    | B1   | Criar                       |
| `shared/prompts/classify.md`            | B1   | Criar                       |
| `jira_management/coverage.ts`           | B2   | Criar                       |
| `jira_management/coverage.test.ts`      | B2   | Criar                       |
| `jira_management/commands/case17.ts`    | C2   | Criar                       |
| `jira_management/commands/case18.ts`    | C1   | Criar                       |
| `jira_management/commands/case19.ts`    | C3   | Criar                       |
| `jira_management/main.ts`               | C    | Editar (adicionar handlers) |
| `jira_management/main.test.ts`          | C    | Atualizar                   |
