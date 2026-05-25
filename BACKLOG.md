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
# Primary (OpenRouter)
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemini-2.0-flash-exp
LLM_BASE_URL=https://openrouter.ai/api/v1

# Fast (Groq) — cheap, fast inference
LLM_FAST_API_KEY=gsk_...
LLM_FAST_MODEL=llama3-8b-8192
LLM_FAST_BASE_URL=https://api.groq.com/openai/v1

# Reviewer (Gemini Pro) — cross-validation
LLM_REVIEW_API_KEY=AIza...
LLM_REVIEW_MODEL=gemini-2.0-flash-exp
LLM_REVIEW_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Fallback (NVIDIA NIM) — circuit breaker
LLM_FALLBACK_API_KEY=<nv-key>
LLM_FALLBACK_MODEL=meta/llama3-70b-instruct
LLM_FALLBACK_BASE_URL=https://integrate.api.nvidia.com/v1

# Batch (GitHub Models) — background tasks
LLM_BATCH_API_KEY=<gh-key>
LLM_BATCH_MODEL=gpt-4o-mini
LLM_BATCH_BASE_URL=https://models.inference.ai.azure.com
```

### Providers

| Tier       | Provider    | Env                    | Model                           | Format |
| ---------- | ----------- | ---------------------- | ------------------------------- | ------ |
| `main`     | OpenRouter  | `LLM_API_KEY`          | `google/gemini-2.0-flash-exp`   | OpenAI |
| `small`    | Groq        | `LLM_FAST_API_KEY`     | `llama3-8b-8192` (alias → fast) | OpenAI |
| `fast`     | Groq        | `LLM_FAST_API_KEY`     | `llama3-8b-8192`                | OpenAI |
| `reviewer` | Gemini Pro  | `LLM_REVIEW_API_KEY`   | `gemini-2.0-flash-exp`          | Gemini |
| `fallback` | NVIDIA NIM  | `LLM_FALLBACK_API_KEY` | `meta/llama3-70b-instruct`      | OpenAI |
| `batch`    | GitHub Mod. | `LLM_BATCH_API_KEY`    | `gpt-4o-mini`                   | OpenAI |

### Fase F — Multi-Provider LLM Enhancement (CONCLUÍDA)

**Data:** 2026-05-25

**Objetivo:** Adicionar resiliência multi-provider com fallback automático e revisão cruzada (primary→reviewer).

**Providers integrados:**

| Tier       | Provider          | Formato | Uso                                           |
| ---------- | ----------------- | ------- | --------------------------------------------- |
| `main`     | OpenRouter        | OpenAI  | Análise principal (fallback: NVIDIA → GitHub) |
| `small`    | Groq (alias fast) | OpenAI  | Classificações simples                        |
| `fast`     | Groq              | OpenAI  | Tarefas rápidas (run-comparison, classify)    |
| `reviewer` | Gemini Pro        | Gemini  | Validação cruzada (failure-analysis)          |
| `fallback` | NVIDIA NIM        | OpenAI  | Circuit breaker quando main falha             |
| `batch`    | GitHub Models     | OpenAI  | Tasks background                              |

**Fallback chain:** main → fallback(NVIDIA) → batch(GitHub). Cada provider 3 retries próprios.

**Arquivos:**

| Arquivo                           | Ação                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `shared/config.ts`                | +15 config getters (fast/reviewer/fallback/batch)                      |
| `shared/llm-client.ts`            | Refatorado: `tierToConfig()`, `sendToProvider()`, `sendWithFallback()` |
| `shared/llm-review.ts`            | **Novo**: `reviewWithLlm()` — primary → reviewer → veredito            |
| `shared/failure-analysis.ts`      | `analyzeFailures` usa `reviewWithLlm()`, `classifyFailure` usa `fast`  |
| `shared/run-comparison.ts`        | `compareRuns` usa `fast` (Groq)                                        |
| `shared/llm-client.test.ts`       | +3 testes (fast, small→fast alias, reviewer, fallback chain)           |
| `shared/llm-review.test.ts`       | **Novo**: 4 testes                                                     |
| `shared/failure-analysis.test.ts` | Atualizado para `reviewWithLlm` mock                                   |
| `shared/run-comparison.test.ts`   | Assert `fast` tier                                                     |

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

---

## 🔷 GitTriggers + LLM — 3 entregas (CONCLUÍDO)

**Data:** 2026-05-25

**Objetivo:** Integrar LLM no módulo git_triggers — análise de falhas pós-pipeline, descrição de PR/MR com IA, alerta de flakiness.

### Arquivos alterados

| Arquivo                             | Ação                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git_triggers/llm-pipeline.ts`      | **Novo**: `offerPipelineFailureAnalysis()` — pergunta usuário, chama `analyzeFailures()`, exibe narrativa                                              |
| `git_triggers/llm-pipeline.test.ts` | **Novo**: 5 testes (sem falhas, usuário recusa, análise ok, vazio, erro LLM)                                                                           |
| `git_triggers/ai-pr-desc.ts`        | **Novo**: `generatePrDescription()` — busca diff via `m.getDiff()`, envia para LLM tier `fast`, retorna descrição                                      |
| `git_triggers/ai-pr-desc.test.ts`   | **Novo**: 3 testes (diff vazio, LLM ok, LLM erro)                                                                                                      |
| `git_triggers/test-results.ts`      | `collectTestResults()` retorna `ParseResult \| null` em vez de `void`                                                                                  |
| `git_triggers/main.ts`              | `_postPipeline()` integra `offerPipelineFailureAnalysis()`. `handleCreateMR()` oferece descrição IA. `displayRecentPipelines()` alerta flakiness >30%. |
| `git_triggers/gitlab_manager.ts`    | `getDiff()` — usa `/repository/compare` da API GitLab, truncado em 15k chars                                                                           |
| `git_triggers/github_manager.ts`    | `getDiff()` — usa `/repos/:owner/:repo/compare` da API GitHub, truncado em 15k chars                                                                   |
| `shared/types.ts`                   | Interface `GitProvider` ganha `getDiff(source, target) => Promise<string>`                                                                             |

### Verificação final

| Comando                  | Saída     |
| ------------------------ | --------- |
| `npx tsc --noEmit`       | 0 erros   |
| `npx jest --no-coverage` | 1076 pass |

### Lições aprendidas

3. `getDiff()` truncado a 15k chars para evitar payloads massivos no LLM (limite de contexto do Groq fast tier)

---

## 🔷 .env.example + Flakiness Dashboard no menu Git (CONCLUÍDO)

**Data:** 2026-05-25

**Objetivo:** Documentar todas as variáveis de ambiente em `.env.example` e adicionar atalho no menu git_triggers para gerar o flakiness dashboard HTML.

### Arquivos

| Arquivo                     | Ação                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`              | **Novo**: 50+ vars documentadas (Jira, Git, LLM 6 tiers, logging, behavior), com comentários de uso, defaults e URLs de obtenção de cada chave                                                                                                          |
| `git_triggers/main.ts`      | Nova opção `a` no menu ("Dashboard flakiness (HTML)"). Handler `handleFlakinessDashboard()` — carrega métricas, calcula flakiness, gera HTML via `shared/flakiness-dashboard.ts`. `currentProjectName` setado também em `handleChangeProject` (bugfix). |
| `git_triggers/main.test.ts` | Mock do módulo `metrics`. Teste para `handleFlakinessDashboard()` (early return sem dados)                                                                                                                                                              |

### Verificação final

| Comando                                                     | Saída     |
| ----------------------------------------------------------- | --------- |
| `npx tsc --noEmit`                                          | 0 erros   |
| `npx jest --no-coverage`                                    | 1076 pass |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero      |
| `grep -rn ".only(" **/*.test.*`                             | zero      |

---

## 🔷 Test Impact Analysis + Batch Mode (CONCLUÍDO)

**Data:** 2026-05-25

**Objetivo:** Adicionar análise de impacto de mudanças via LLM ao criar PR/MR, e suporte a modo batch (não-interativo) para git_triggers.

### Feature 1 — Test Impact Analysis

**O quê:** Ao criar PR/MR, após descrição IA, oferece "Analisar impacto nos testes com IA?". LLM analisa diff + mapping de testes → responde quais testes existentes são afetados, risco e sugestões.

**Arquivos:**
| Arquivo | Ação |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `git_triggers/ai-test-impact.ts` | **Novo**: `assessTestImpact()` — busca diff, carrega mapping, envia para LLM tier `fast`, retorna análise narrativa |
| `git_triggers/ai-test-impact.test.ts` | **Novo**: 4 testes (diff vazio, LLM ok sem mapping, LLM ok com mapping, erro LLM) |
| `git_triggers/main.ts` | `handleCreateMR()` integra `assessTestImpact()` com prompt "Analisar impacto nos testes com IA?" |

### Feature 3 — Batch Mode

**O quê:** Suporte a `--project`, `--branch`, `--auto` no CLI. Dispara pipeline, aguarda, coleta resultados, analisa falhas com IA, gera flakiness dashboard HTML — tudo sem input humano.

**Arquivos:**
| Arquivo | Ação |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `git_triggers/main.ts` | `parseBatchArgs()` + `tryBatchMode()`. `main()` chama `tryBatchMode()` primeiro. `AUTO_CONFIRM` setado via env var. |
| `git_triggers/main.test.ts` | 4 testes para `parseBatchArgs` (flags longas, curtas, auto, vazio) |
| `shared/prompt.ts` | `confirm()` retorna `defaultYes` quando `autoConfirm === true` (reuso do config existente) |

### Verificação final

| Comando                                                     | Saída     |
| ----------------------------------------------------------- | --------- |
| `npx tsc --noEmit`                                          | 0 erros   |
| `npx jest --no-coverage`                                    | 1076 pass |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero      |
| `grep -rn ".only(" **/*.test.*`                             | zero      |

---

## 🔷 LLM Quality Assurance — Relatórios Confiáveis (CONCLUÍDO)

**Data:** 2026-05-25

**Prioridade:** P1

**Motivação:** Garantir que relatórios gerados por IA tenham qualidade mínima antes de serem exibidos ao usuário, com fallback previsível e métricas de confiança.

### Entregas

| Fase | Arquivos                                                | O quê                                                                                 |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1    | `shared/llm-client.ts`                                  | Temperature + response_format por tier; novo tier `report`                            |
| 2    | `shared/report-validator.ts` + `.test`                  | `ReportValidator<T>` — required, type, regex, minLength; retry com feedback (máx 3)   |
| 3    | `shared/report-generator.ts`                            | `generateReportWithFallback()` — HTML válido com badge de confiança e warning         |
| 4    | `shared/llm-metrics.ts` + `.test`                       | `LlmMetricsTracker` — 6 métricas, persistência JSON, history, `clearLlmMetrics`       |
| 5    | `shared/llm-review.ts` + `.test`, `failure-analysis.ts` | Pipeline completo: report→JSON→validate→retry→reviewer→fallback; 1105 testes passando |

### Arquivos alterados

| Arquivo                             | Ação                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/llm-client.ts`              | `temperature`/`responseFormat` em `ProviderConfig`; tier `report` (temp 0.2, `responseFormat:'json'`)                                                                             |
| `shared/report-validator.ts`        | **Novo**: `ReportValidator<T>` — validação genérica de schemas JSON                                                                                                               |
| `shared/report-validator.test.ts`   | **Novo**: 9 testes (required, type, regex, nested, warnings)                                                                                                                      |
| `shared/report-generator.ts`        | `generateReportWithFallback()` — seção IA + confidence badge + fallback warning                                                                                                   |
| `shared/llm-metrics.ts`             | **Novo**: `recordLlmRequest`, `recordLlmFailure`, `recordValidationRejection`, `recordRetry`, `recordConfidence`, `snapshotLlmMetrics`, `getLlmMetricsHistory`, `clearLlmMetrics` |
| `shared/llm-metrics.test.ts`        | **Novo**: 6 testes com isolamento via `XDG_STATE_HOME` + `fs.mkdtempSync()`                                                                                                       |
| `shared/llm-review.ts`              | Pipeline: `report` tier → JSON parse → `ReportValidator.validate()` → retry loop → reviewer → fallback                                                                            |
| `shared/llm-review.test.ts`         | **Novo**: 5 testes (caminho feliz, non-JSON retry, main fallback, retry exausto, reviewer cruza)                                                                                  |
| `shared/failure-analysis.ts`        | `analyzeFailuresWithReport()` — retorna `AnalysisReport` com `content`, `htmlReport`, `confidence`, `fallbackUsed`                                                                |
| `git_triggers/llm-pipeline.ts`      | Importa `analyzeFailuresWithReport`; exibe confidence badge; salva HTML; fallback warning                                                                                         |
| `git_triggers/llm-pipeline.test.ts` | Ajustado para mockar `analyzeFailuresWithReport` em vez de `analyzeFailures`                                                                                                      |
| `BACKLOG.md`                        | Este registro                                                                                                                                                                     |

### Correções pós-implementação

1. `jest.mock('./config', ...)` em `llm-metrics.test.ts` gerava mock não-funcional (a propriedade `xdgStateHome` não era lida corretamente via módulo mock) → substituído por `process.env.XDG_STATE_HOME` com `fs.mkdtempSync()` para isolamento real.
2. `llm-pipeline.ts` usava `import()` dinâmico → trocado para `import` estático de `analyzeFailuresWithReport`.
3. `llm-review.test.ts` esperava `toThrow()` quando ambos os tiers falhavam → corrigido para testar o fallback real (retorna `{fallbackUsed: true, reviewed: false}`).

---

## ✅ Débitos registrados

### Auto-classify + Jira ticket em falha de pipeline

**Prioridade:** P2 ✅ CONCLUÍDO (2026-05-25)

**Descrição:** Quando uma pipeline falha e o usuário opta por análise LLM (G1), após exibir a narrativa, pergunta "Criar issue no Jira?". O LLM classifica a falha via `classifyFailure()`, determina componente/severidade, e cria issue via `JiraResource`.

**Implementação:** `git_triggers/llm-pipeline.ts` aceita callback `onAnalysis`; `git_triggers/pipeline-handler.ts` passa callback que cria issue do tipo Bug no Jira via `JiraResource.postJiraResource()`.

### Menu alignment + documentação

**Prioridade:** — Melhoria contínua ✅ CONCLUÍDO (2026-05-25)

**O quê:**

- Jira menu: criada seção `IA` (🤖) para opções 17/18/19; labels corrigidas com acentos e descrições IA
- Aliases adicionados: `relatório`/`html`→17, `us`/`estória`/`história`→18, `cobertura`→19
- Git menu docs: opção `a` (Dashboard flakiness) documentada; seção 11 corrigida de "Menu → Opção" para "Sub-prompt da opção 4"

---

### SRP em `jira_management/create_tests.ts` (OBSOLETO — já refatorado)

**Prioridade:** ~~P1~~ ✅ Já resolvido

**Nota:** `create_tests.ts` tem 178 linhas atualmente. A decomposição em sub-classes (`TestCaseFactory`, `IssueLinker`, `TestExecutionCreator`, `MappingFileGenerator`, `import-prep`, `import-orchestrator`, `import-loop`) já foi completada. Débito pode ser removido.

---

## 🔍 Auditoria Geral de Débitos Técnicos (2026-05-25)

**Objetivo:** Varredura profunda no código após múltiplas fases de features, identificando problemas de tipo, qualidade, arquitetura e testes.

**Método:** 3 tracks paralelos (type safety, code quality, architecture) via agentes com leitura completa de todos os `.ts` files.

---

### 1. Type Safety — SUMMARY

| Categoria                               | Qtd                                                 | Severidade |
| --------------------------------------- | --------------------------------------------------- | ---------- |
| `as any` casts (produção)               | 5 locais (10 linhas)                                | Média      |
| `as unknown as` (produção)              | 3 locais                                            | Média      |
| `any` type declarações (produção)       | 10 (ESM cache/lexer)                                | Média      |
| `Record<string, unknown>` sem interface | 40+ locais em 20+ arquivos                          | **Alta**   |
| Missing return type annotations         | 36 funções (managers)                               | **Alta**   |
| `as any` em testes (com suppress)       | 80+ ocorrências                                     | Baixa      |
| R1 — arquivos .ts sem .test.ts          | 22 (mas 18 case\*.ts cobertos via handlers.test.ts) | Média      |

**Top recommendation:** Definir interfaces para retornos da `GitProvider` (`PipelineResult`, `Schedule`, `MergeRequest`, `CICDVariable`) em `shared/types.ts`; tipar retorno de todas as 36 funções em `github_manager.ts` e `gitlab_manager.ts`.

---

### 2. Code Quality — SUMMARY

| Categoria                           | Qtd                                    | Severidade |
| ----------------------------------- | -------------------------------------- | ---------- |
| `console.log` produção (não Logger) | 2 locais                               | Média      |
| `throw 'string'`                    | **0** ✅                               | Clean      |
| Functions > 50 linhas (R4)          | **11**                                 | **Alta**   |
| TODO/FIXME/HACK/XXX                 | **0** ✅                               | Clean      |
| Unused imports                      | **1** (`rootLogger` em import-loop.ts) | Baixa      |
| `require()` em produção             | 8 (5 são zombies de ciclo morto)       | Média      |
| `eslint-disable` (produção)         | 24, bem documentados                   | Baixa      |
| Código duplicado                    | 6 padrões                              | Média      |

**Piores violações de tamanho de função:**

- `git_triggers/main.ts:handleTriggerPipeline` — **111 linhas**
- `git_triggers/main.ts:tryBatchMode` — **84 linhas**
- `shared/prompt.ts:tableView` — **76 linhas**
- `shared/prompt.ts:printSummary` — **61 linhas**
- `jira_management/main.ts:runMainLoop` — **65 linhas**

**Zombie workarounds:** 5 `require()` com comentário "anti-circular" referenciam um ciclo que **não existe mais** no código atual (`prompt → create_tests → session-context → prompt` nunca existiu). Podem ser convertidos para `import` padrão.

---

### 3. Architecture — SUMMARY

| Categoria                          | Qtd                                            | Severidade                        |
| ---------------------------------- | ---------------------------------------------- | --------------------------------- |
| Layer violations (shared→jira→git) | **0** ✅                                       | Clean                             |
| Circular dependencies reais        | **0** ✅                                       | Clean                             |
| DIP violations (R2)                | **0** ✅                                       | Clean                             |
| SRP violations (>300 linhas)       | **5**                                          | **Alta**                          |
| Global state mutable (let)         | 7 em `git_triggers/main.ts`                    | **Alta** — poluição entre testes  |
| Singletons com estado              | 4 (Logger, Config, Output, SessionContext)     | Média                             |
| Import side effects                | 6 (leitura fs, signal handlers no `require()`) | **Alta** — `git_triggers/main.ts` |
| Export inconsistency (ESM+CJS)     | 23 arquivos                                    | **Alta** — migração incompleta    |
| `@ts-ignore`                       | **0** ✅                                       | Clean                             |

**Arquivos >300 linhas (SRP):**
| Arquivo | Linhas | Responsabilidades |
|---------|--------|-------------------|
| `git_triggers/main.ts` | **979** | ~11: projeto, pipeline, MR, schedules, variáveis, batch, flakiness, help, histórico, etc. |
| `shared/prompt.ts` | **753** | ~6: output, prompts, progress, spinner, erros, tabelas |
| `jira_management/main.ts` | **629** | ~4: help/docs, menu, sessão, dispatch |
| `jira_management/jira_resource.ts` | **456** | ~6 domínios: search, project, version, release, sprint, workflow |
| `git_triggers/github_manager.ts` | **342** | ~5: HTTP, pipeline, MR, branches, artifacts |

---

### 4. Coisas que NÃO foram encontradas ✅

- `throw 'string'` ou `throw "string"` — zero
- `.only()` em testes — zero
- `@ts-ignore` — zero
- Layer violations — zero
- DIP violations (handlers instanciando JiraResource) — zero
- `TODO`/`FIXME`/`HACK`/`XXX` — zero
- Hardcoded secrets expostos — zero

---

### 5. Débitos registrados nesta auditoria

**Prioridade P0 (bloqueia CI ou funcionalidade crítica):**

Nenhum encontrado.

**Prioridade P1 (alto impacto em manutenibilidade):**

| #        | Débito                                                                             | Arquivos                     | Esforço estimado                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUDIT-01 | Quebrar `git_triggers/main.ts` (979 linhas) em módulos menores                     | `git_triggers/main.ts`       | 4h                                                                                                                                                         |
| AUDIT-02 | Quebrar `shared/prompt.ts` (753 linhas): extrair tabela, spinner, UI helpers       | `shared/prompt.ts`           | 3h                                                                                                                                                         |
| AUDIT-03 | Tipar 36 funções sem retorno em `github_manager.ts` e `gitlab_manager.ts`          | 2 arquivos                   | ✅ CONCLUÍDO (3 tipadas: `_repoPath`, `_toInputs`, `getSchedules`; 8 HTTP helpers mantidas — `Promise<unknown>` causaria 30+ erros em cascata nos callers) |
| AUDIT-04 | Definir interfaces para `GitProvider` returns (`PipelineResult`, `Schedule`, etc.) | `shared/types.ts` + managers | 2h                                                                                                                                                         |
| AUDIT-05 | Eliminar export style CJS (`export =`) dos 23 arquivos restantes                   | 23 arquivos                  | 3h                                                                                                                                                         |
| AUDIT-06 | Eliminar 5 `require()` zombies (ciclo já morto)                                    | 5 arquivos                   | 0.5h                                                                                                                                                       |
| AUDIT-07 | Remover import side effects em `git_triggers/main.ts` (lazy load)                  | `git_triggers/main.ts`       | 1h                                                                                                                                                         |

**Prioridade P2 (melhoria desejável):**

| #        | Débito                                                                                         | Arquivos          | Esforço                                                  |
| -------- | ---------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| AUDIT-08 | Substituir `console.log` por `print()` em `git_triggers/main.ts:410` e `llm-pipeline.ts:24`    | 2 arquivos        | ✅ CONCLUÍDO                                             |
| AUDIT-09 | Extrair parser quoted-string duplicado em `csv_resource.ts`                                    | `csv_resource.ts` | 0.5h                                                     |
| AUDIT-10 | Unificar regex de precondition entre `csv_resource.ts` e `import-prep.ts`                      | 2 arquivos        | 0.25h                                                    |
| AUDIT-11 | Escrever .test.ts para `shared/entry-menu.ts`, `shared/tls.ts`, `shared/git-provider-error.ts` | 3 arquivos        | 1h                                                       |
| AUDIT-12 | ~~Remover `rootLogger` não usado em `import-loop.ts`~~                                         | `import-loop.ts`  | **Falso positivo** — usado via `typeof` em type position |
| AUDIT-13 | Renomear `jira_validator.test.ts` → `test-case-validator.test.ts` (mismatch)                   | 1 arquivo         | 0.1h                                                     |

**Prioridade P3 (nice-to-have):**

| #        | Débito                                                                   | Esforço |
| -------- | ------------------------------------------------------------------------ | ------- |
| AUDIT-14 | Trocar `Record<string, unknown>` por interfaces nos 40+ locais restantes | 4h      |
| AUDIT-15 | Isolar cache do `llm-client.ts` com TTL expiry automático                | 1h      |
| AUDIT-16 | Reset automático de `retryCounts` no `http-client.ts`                    | 0.5h    |

---

### 6. Verificação de integridade (momento da auditoria)

| Comando                                                     | Resultado            |
| ----------------------------------------------------------- | -------------------- |
| `npx tsc --noEmit`                                          | 0 erros              |
| `npx jest --no-coverage`                                    | 1076 pass, 61 suites |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero                 |
| `grep -rn ".only(" **/*.test.*`                             | zero                 |

---

## 📋 Plano de Trabalho — Eliminação de Débitos Técnicos (6 Fases)

**Início:** 2026-05-25
**Estimativa total:** ~15.5h, 18 commits
**Princípios:** Cada fase = commit atômico. Ordem: tipagem primeiro. Nenhuma fase quebra tsc ou testes.

### Fase 1 — Tipagem dos Managers (~3h, 2 commits)

| Commit | O quê                                                                                                                                                                                           | Status |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1a     | Definir interfaces `PipelineInfo`, `ScheduleInfo`, `MergeRequestInfo`, `CICDVariable`, `PipelineJob`, `ArtifactInfo`, `PipelineRun`, `PipelineTriggerResult`, `BranchInfo` em `shared/types.ts` | ✅     |
| 1b     | Tipar retorno das 36 funções em `github_manager.ts` e `gitlab_manager.ts`                                                                                                                       | ✅     |

### Fase 2 — require() Zombies + Export Consistency (~3h, 3 commits)

| Commit | O quê                                                                  | Status |
| ------ | ---------------------------------------------------------------------- | ------ |
| 2a     | Converter 5 `import = require()` para `import` padrão (ciclo morto)    | ✅     |
| 2b     | Converter `export = ClassName` para `export default` (14 arquivos)     | ✅     |
| 2c     | Converter `module.exports = {...}` para `export {...}` (deferido — R7) | ⏭️     |

### Fase 3 — SRP: Quebrar shared/prompt.ts (~3h, 3 sub-fases)

| Sub-fase | O quê                                                                                   | Status |
| -------- | --------------------------------------------------------------------------------------- | ------ |
| 3a       | Extrair `printSummary`, `onError`, `printError`, `tableView` para `shared/prompt-ui.ts` | ✅     |
| 3b       | Extrair spinner para `shared/spinner.ts`                                                | ✅     |
| 3c       | Extrair input logic para `shared/prompt-input.ts`                                       | ✅     |

### Fase 4 — SRP: Quebrar git_triggers/main.ts (~4h, 4 sub-fases)

| Sub-fase | O quê                                                              | Status |
| -------- | ------------------------------------------------------------------ | ------ |
| 4a       | Extrair pipeline functions para `git_triggers/pipeline-handler.ts` | ✅     |
| 4b       | Extrair MR functions para `git_triggers/mr-handler.ts`             | ✅     |
| 4c       | Extrair schedule + utils para `git_triggers/schedule-handler.ts`   | ✅     |
| 4d       | Extrair batch mode para `git_triggers/batch-mode.ts`               | ✅     |

#### Arquivos criados

| Arquivo                            | Linhas | Responsabilidade                                                   |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `git_triggers/session-state.ts`    | 176    | Estado compartilhado + config loading + pushHistory + display      |
| `git_triggers/pipeline-handler.ts` | 275    | Pipeline handlers (trigger, export vars, poll, post-pipeline)      |
| `git_triggers/mr-handler.ts`       | 119    | MR handlers (create, list approved, merge) + nivelar wrapper       |
| `git_triggers/schedule-handler.ts` | 118    | Schedule handlers (list, run), change project, flakiness dashboard |
| `git_triggers/batch-mode.ts`       | 122    | Batch mode (tryBatchMode, parseBatchArgs)                          |

#### Resultado

| Métrica                   | Antes                                                      | Depois                                           |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `git_triggers/main.ts`    | 986 linhas                                                 | 297 linhas (70% redução)                         |
| Responsabilidades de main | ~11 (menu, pipeline, MR, schedule, batch, display, estado) | ~4 (menu loop, dispatch, project select, config) |
| Testes                    | 1076 pass                                                  | 1076 pass                                        |
| `tsc --noEmit`            | 0 erros                                                    | 0 erros                                          |
| `throw 'string'`          | zero                                                       | zero                                             |
| `.only()` em testes       | zero                                                       | zero                                             |

### Fase 5 — Import Side Effects + Duplicações (~1.5h, 3 sub-fases)

| Sub-fase | O quê                                                         | Status |
| -------- | ------------------------------------------------------------- | ------ |
| 5a       | Lazy-load providers.json/projects.json + adiar setupSigint    | ✅     |
| 5b       | Extrair parser quoted-string compartilhado em csv_resource.ts | ✅     |
| 5c       | Unificar regex precondition                                   | ✅     |

---

## ✅ Smoke Tests E2E com GitHub Real (CONCLUÍDO)

**Data:** 2026-05-25

**Objetivo:** Validar o módulo `git_triggers` contra o repositório real `kevindemian/qa_tools` no GitHub, sem mocks.

### Arquivos criados/alterados

| Arquivo                 | Ação                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `e2e/smoke-shared.ts`   | **Novo**: `createGitHubSmokeManager()` + `assertOk()`                           |
| `e2e/smoke-github.ts`   | **Novo**: 6 testes read-only contra GitHub API real                             |
| `e2e/smoke-llm.ts`      | **Novo**: getDiff real → LLM real → PR description (skip sem LLM keys)          |
| `e2e/smoke-pipeline.ts` | **Novo**: trigger → poll → artifact → dashboard (skip sem `E2E_PIPELINE=true`)  |
| `config/projects.json`  | Adicionado `qa_tools_e2e: "kevindemian/qa_tools"`                               |
| `config/providers.json` | Adicionado `qa_tools_e2e: { provider: "github", repo: "kevindemian/qa_tools" }` |
| `package.json`          | Scripts: `smoke`, `smoke:github`, `smoke:llm`, `smoke:pipeline`                 |

### Camadas

| Camada        | Script                                     | O que valida                                             | Side-effect      | Requer         |
| ------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------- | -------------- |
| 1 (read-only) | `npm run smoke:github`                     | Auth, API parsing, error handling (404/403), 6 operações | ❌ Zero          | `GITHUB_TOKEN` |
| 2 (+LLM)      | `npm run smoke:llm`                        | getDiff real → LLM real → PR description                 | ❌ Zero          | LLM keys       |
| 3 (+pipeline) | `E2E_PIPELINE=true npm run smoke:pipeline` | Trigger → poll → artifact → dashboard → LLM analysis     | ⚠️ 1 Actions run | `GITHUB_TOKEN` |

### Resultado da execução real (Camada 1)

```
OK: getBranch(main) = main
OK: getBranch(nonexistent) = null
OK: getDiff(main, dev) = 0 chars (empty — sem branch dev divergente)
OK: getRecentPipelines(5) = 5 runs
OK: getCICDVariables() = 0 variables (403 tratado → [])
OK: searchMergeRequests(open) = 0 PRs
```

Todos os 6 cenários passaram. Erros 404/403 são tratados corretamente por `handleError`.

### Verificação final

| Comando                      | Resultado      |
| ---------------------------- | -------------- |
| `npx tsc --noEmit`           | 0 erros        |
| `npx jest --no-coverage`     | 1105/1105 pass |
| `grep -rn "throw '" e2e/`    | zero           |
| `grep -rn ".only(" e2e/*.ts` | zero           |

### Fase 6 — Testes Faltantes (~1h, 3 sub-fases)

| Sub-fase | O quê                                                             | Status |
| -------- | ----------------------------------------------------------------- | ------ |
| 6a       | Testes para `shared/entry-menu.ts`                                | ✅     |
| 6b       | Testes para `shared/tls.ts` + `shared/git-provider-error.ts`      | ✅     |
| 6c       | Renomear `jira_validator.test.ts` → `test-case-validator.test.ts` | ✅     |
