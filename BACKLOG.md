# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## [NEW FEATURE] LLM Integration — Geração de Testes com IA

**Prioridade**: P1 (feature nova, valor direto ao usuário)

**Abordagem**: incremental, zero dependências novas (fetch nativo + marked).

### Arquitetura

**Providers** (dual-tier, config via `.env`):

| Tier    | Provider   | Env                 | Model                            |
| ------- | ---------- | ------------------- | -------------------------------- |
| `main`  | OpenRouter | `LLM_API_KEY`       | `google/gemini-2.0-flash-exp`    |
| `small` | Gemini API | `LLM_SMALL_API_KEY` | `gemini-2.0-flash-lite` (grátis) |

- `main` → tarefas pesadas (gerar casos, analisar falhas)
- `small` → tarefas leves (classificar, extrair keywords, sanitizar)

### Fases

#### 🔶 Fase 1 — Core (`shared/llm-client.ts`)

- Função `llmPrompt(tier: 'main'|'small', system: string, user: string): Promise<string>`
- Abstrai diferenças entre APIs: OpenRouter (formato OpenAI `/v1/chat/completions`) vs Gemini (`/v1beta/models/{model}:generateContent`)
- Retry via `http-client.js` (reuso), cache de respostas (hash do prompt, TTL)
- Headers: `Authorization: Bearer {{key}}`, fallback tratado com `printError`

#### 🔶 Fase 2 — Prompt Templates (`shared/prompts/*.md`)

Arquivos markdown editáveis sem recompilar, placeholders `{{var}}`:

- `user-story-to-tests.md` — user story + AC → CSV de casos de teste (steps, pre-conditions, tags)
- `failure-analysis.md` — diff de execuções → causas raiz sugeridas
- `classify.md` — descrição de bug → severidade/área (tier small)
- Template carregado via `readFileSync` + `replace` simples

#### 🔶 Fase 3 — Comando no Menu (`jira_management/main.ts`)

Nova opção **"Gerar testes com IA"** (id `18`):

1. Input: issue key (ex. `ECSPOL-123`)
2. `JiraResource.getIssue(key)` → summary + description
3. Carrega `user-story-to-tests.md` → substitui placeholders
4. `llmPrompt('main', system, user)` → CSV como string
5. Preview com `mdBox()` — aprovação do usuário
6. Invoca pipeline de criação existente (CSV → Xray)

#### 🔶 Fase 4 — Expansão

- **Analisar falhas**: parse de resultados de teste → LLM sugere causas raiz
- **Resumir execução**: resultado de teste → relatório legível para stakeholders
- **Classificar bugs**: descrição → severidade/área (tier small)
- **Traduzir planos**: PT-BR ↔ EN
- **Mais provedores**: Anthropic, Ollama (local), outras chaves open-source

### Config (`shared/config.ts` + `.env`)

```
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemini-2.0-flash-exp          # default
LLM_BASE_URL=https://openrouter.ai/api/v1       # default
LLM_SMALL_API_KEY=AIza...
LLM_SMALL_MODEL=gemini-2.0-flash-lite           # default
```

### Arquivos envolvidos

| Arquivo                     | Ação                              |
| --------------------------- | --------------------------------- |
| `shared/llm-client.ts`      | Criar                             |
| `shared/llm-client.test.ts` | Criar                             |
| `shared/prompts/`           | Criar diretório + templates .md   |
| `shared/config.ts`          | Adicionar getters LLM             |
| `jira_management/main.ts`   | Adicionar handler + opção no menu |
| `.env.example`              | Adicionar vars LLM                |
| `BACKLOG.md`                | Este plano                        |

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

## DÉBITO-001 — OOM em criação de massa (>500 testes)

**Prioridade:** P2

**Problema:** `createTestsFromCsv()` carrega todos os testes em memória. Com >500 testes, o processo estoura heap (512MB default Node).

**Solução proposta:** Processamento em lotes de 50 com `setImmediate()` ou `p-limit`.

**Arquivos:** `create_tests.ts`, `import-loop.ts`

---

## [NEW FEATURE] DÉBITO-002 — WEB_STYLE.md não implementado

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

## 🔷 Fase de Expansão de Testes (PLANEJADA)

**Prioridade:** P0 (R1 obriga cobertura)

### Dependências

1. **F4**: Extrair `dispatchChoice` de `runMainLoop` (SRP + testabilidade)
2. **F5**: Unit tests para handlers com cobertura insuficiente (case01, case12, case04, case07, case10, case11, case13, case15)
3. **F3**: Testes para `showDocs()`, `showHelpLoop()`, e menu integrado

### Verificação final

| Comando                                                     | Saída esperada |
| ----------------------------------------------------------- | -------------- |
| `npx tsc --noEmit`                                          | 0 erros        |
| `npx jest --no-coverage`                                    | 100% pass      |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero           |
| `grep -rn ".only(" **/*.test.*`                             | zero           |
