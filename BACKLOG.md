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

## [NEW FEATURE] QA Reports & Analytics — Relatórios, Métricas e Cobertura

**Prioridade:** P1

**Motivação:** Análise de mercado (TestRail, Katalon, Zephyr, TestComplete, Ranorex) revelou lacunas em relatórios visuais, histórico de execuções e visibilidade de cobertura — funcionalidades de alto valor que o time não tem.

**Abordagem:** Incremental, zero dependências novas (HTML inline + JSON local).

### Arquitetura Geral

```
┌─ Report Generator ─────────────────────┐
│  parseResult → HTML auto-contido       │
│  (stats, charts, falhas, duração)      │
└──────────────────────┬─────────────────┘
                       │ alimenta
┌─ Metrics Collector ──▼─────────────────┐
│  history.json (state.ts)               │
│  • timestamp, branch, pass/fail/skip   │
│  • duração, ambiente                   │
│  → trend analysis, flakiness           │
└──────────────────────┬─────────────────┘
                       │ cruza com
┌─ Coverage Analyzer ─▼──────────────────┐
│  Jira issues × test mapping files      │
│  • gaps por epic/componente            │
│  • status da última execução           │
└────────────────────────────────────────┘
```

### 🔶 Fase 1 — Report Generator (`shared/report-generator.ts`)

**Esforço:** 2-3 dias

Gerar HTML auto-contido a partir de `ParseResult` e `MatchResult`:

- Template inline com CSS + JS Chart (SVG/Canvas, zero deps)
- Seções: sumário (pass/fail/skip/duration), tabela de testes, detalhe de falhas
- Suporte a execução única e comparativo (diff entre 2 runs)
- Saída: arquivo `.html` no diretório de execução

**Inputs existentes:**
| Tipo | Fonte |
|------|-------|
| `ParseResult` | `shared/result_parser.ts` |
| `MatchResult` | `jira_management/result_reporter.ts` |
| `FlatTest[]` | `shared/result_parser.ts` |

**Arquivos:**

| Arquivo                                | Ação                  |
| -------------------------------------- | --------------------- |
| `shared/report-generator.ts`           | Criar                 |
| `shared/report-generator.test.ts`      | Criar                 |
| `shared/report-templates/default.html` | Criar (template base) |
| `BACKLOG.md`                           | Este plano            |

### 🔶 Fase 2 — Metrics Collector (`shared/metrics.ts`)

**Esforço:** 2-3 dias

Histórico local de execuções com persistência via `state.ts`:

```typescript
interface RunRecord {
    id: string;
    timestamp: string;
    branch: string;
    provider: string; // 'github' | 'gitlab' | 'manual'
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    pipelineId?: string;
    reportPath?: string; // link para HTML gerado na Fase 1
}
```

- `recordRun(data)`: persiste no history.json via `state.ts`
- `getHistory({ limit, branch, since })`: consulta com filtros
- `getFlakyTests(threshold)`: detecta testes que falham >N% das execuções
- `getTrend(days)`: agregação diária para charts

**Arquivos:**

| Arquivo                  | Ação       |
| ------------------------ | ---------- |
| `shared/metrics.ts`      | Criar      |
| `shared/metrics.test.ts` | Criar      |
| `BACKLOG.md`             | Este plano |

### 🔶 Fase 3 — Coverage Analyzer (`jira_management/coverage.ts`)

**Esforço:** 2-3 dias

Cruzar issues do Jira com mapping files de teste:

```typescript
interface CoverageItem {
    issueKey: string;
    summary: string;
    issueType: string;
    epic?: string;
    component?: string;
    hasTest: boolean;
    testKeys: string[];
    lastStatus?: 'passed' | 'failed' | 'skipped';
    lastRun?: string;
}
```

- `getCoverageMatrix(jiraResource, mappingPath)`: retorna matriz completa
- `getGaps(jiraResource, mappingPath, { epic?, component? })`: issues sem teste
- `getEpicCoverage(jiraResource, mappingPath)`: cobertura agregada por epic
- Saída TUI via `tableView()` + opção HTML via Fase 1

**Arquivos:**

| Arquivo                            | Ação       |
| ---------------------------------- | ---------- |
| `jira_management/coverage.ts`      | Criar      |
| `jira_management/coverage.test.ts` | Criar      |
| `BACKLOG.md`                       | Este plano |

### 🔶 Fase 4 — Comandos no Menu (`jira_management/main.ts`)

**Esforço:** 1 dia

Novas opções no menu principal:

| ID   | Nome                   | Ação                               |
| ---- | ---------------------- | ---------------------------------- |
| `17` | Gerar relatório HTML   | Roda Fase 1 sobre último resultado |
| `18` | Histórico de execuções | Roda Fase 2 → `tableView`          |
| `19` | Análise de cobertura   | Roda Fase 3 → `tableView` + HTML   |

### 🔶 Fase 5 — Expansão

- **Flakiness Dashboard**: highlight testes com >30% falhas no histórico
- **Coverage Trends**: chart de cobertura ao longo do tempo (Fase 1 + Fase 3)
- **Comparativo Runs**: diff entre duas execuções no HTML report
- **Export CSV/PDF**: exportar métricas para compartilhamento

### Verificação final

| Comando                                                     | Saída esperada |
| ----------------------------------------------------------- | -------------- |
| `npx tsc --noEmit`                                          | 0 erros        |
| `npx jest --no-coverage`                                    | 100% pass      |
| `grep -rn "throw '" shared/ jira_management/ git_triggers/` | zero           |
| `grep -rn ".only(" **/*.test.*`                             | zero           |

### Dependências entre fases

```
Fase 1 (Report) ──────── independente
Fase 2 (Metrics) ─────── independente
Fase 3 (Coverage) ────── depende de JiraResource (já existe)
Fase 4 (Menu) ────────── depende de F1 + F2 + F3
Fase 5 (Expansão) ────── depende de F1 + F2 + F3
```

### Considerações

- **Fases 1 e 2** podem rodar em paralelo por não terem dependências entre si
- **Fase 3** já está pronta para começar (JiraResource existe e tem testes)
- Todas as fases seguem R1 (cada .ts novo precisa de .test.ts)
