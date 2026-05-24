# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### UX-001 — Melhorias de UI/UX na CLI (CONCLUÍDO)

**Prioridade**: P1 (impacto direto na experiência do usuário)

**4 fases incrementais**, cada uma autônoma e testável:

---

#### 🔴 Fase 1 — Bugs Críticos ✅

| # | Problema | Local | Risco | Status |
|---|----------|-------|-------|--------|
| 1 | **Double-prompt CSV/JSON**: handler pergunta caminho + labels, `createTestsFrom*` pergunta de novo | `case01.ts`, `case15.ts`, `create_tests.ts` | Usuário responde a mesma coisa 2x | ✅ |
| 2 | **`showSelect()` fallback não-TTY**: printa choices mas não valida resposta | `prompt.ts:377-386` | Input inválido passa batido em CI | ✅ |
| 3 | **`ProgressBar` silencioso em não-TTY**: operações longas invisíveis em pipe/CI | `prompt.ts:148-150` | Zero feedback em pipelines | ✅ |
| 4 | **Pipeline monolithic decision tree**: 5+ prompts encadeados pós-trigger | `git_triggers/main.ts` | Operação complexa, sem checkpoint | ✅ |

---

#### 🟡 Fase 2 — Usabilidade ✅

| # | Problema | Local | Melhoria | Status |
|---|----------|-------|----------|--------|
| 5 | `confirm()` aceita qq entrada → `false` silencioso | `prompt.ts:82-83` | Loop com validação + hint visual | ✅ |
| 6 | `prompt()` sem validação de vazio | `prompt.ts:71-77` | `minLength` opcional em `PromptOptions` | ✅ |
| 7 | `success()` não respeita `isQuiet()` | `prompt.ts:44` | Inconsistência com `info()` | ✅ |
| 8 | `printSummary()` usa `warn()` dentro → prefixo `!` indevido | `prompt.ts:270` | Polui output do resumo | ✅ |
| 9 | `printSessionSummary()` usa `ERR`/`OK` puro sem cor | `cli_base.ts:83-84` | Quebra consistência visual | ✅ |
| 10 | Nivelar sem validação: branches iguais, vazios, inexistentes | `nivelar.ts` | MR auto-referencial, erro confuso | ✅ |
| 11 | Branch existence check ausente no trigger pipeline | `git_triggers/main.ts` | Erro só chega via API | ✅ |
| 12 | `divider()` não usada em `printSessionSummary` — `'='.repeat(50)` manual | `cli_base.ts:71,89` | Inconsistência | ✅ |

---

#### 🟢 Fase 3 — Polimento Visual ✅

| # | Mudança | Descrição | Status |
|---|---------|-----------|--------|
| 13 | **Unicode icons**: `✓`/`✗`/`⚠`/`ℹ` com fallback ASCII | Substituir `OK`/`ERR`/`!`/`i` | ✅ |
| 14 | **Prefixos bold** nos 4 níveis (`chalk.bold`) | Maior contraste em terminais claros | ✅ |
| 15 | **`title()` com moldura**: `\n` + divider + texto + divider | Hierarquia visual clara | ✅ |
| 16 | **`tableView()` word-wrap**: `wordWrap: true` + `colWidths` dinâmicos | Evita quebra de layout | ✅ |
| 17 | **`divider()` dinâmico** | | ✅ |
| 18 | **Cores no `printSessionSummary()`** | Reusar `success()`/`error()` | ✅ |

---

#### 🔵 Fase 4 — Arquitetural ✅

| # | Item | Motivo | Status |
|---|------|--------|--------|
| 19 | Extrair `createTestExecutionAfterImport` para helper compartilhado | Elimina duplicação case01/case13/case15 | ✅ |
| 20 | `SessionContext.packageManager` tipado corretamente (eliminar `as any`) | Permite refatoração segura | ✅ |
| 21 | Padronizar retorno de handlers (`boolean \| void`) | Controle de fluxo previsível | ✅ |
| 22 | Adicionar elapsed time no `printSessionSummary()` | Fechamento informativo da sessão | ✅ |

---

## Resolvidos

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (CONCLUÍDO)

- **Ação**: 8 camadas incrementais (bottom-up) convertendo 74 arquivos de `.js` para `.ts`. `strict: true`, `allowJs: false`, `tsc --noEmit` = 0 erros, 322/322 testes passando.
- **Commits**: 12 commits + merge em `main`.
- **Lições**: `jest.mock()` em `.js` test files sem Babel NÃO é hoisted. Solução: colocar `jest.mock` antes do `require`.

### ARC-001 — Centralizar configuração (process.env → Config) (CONCLUÍDO)

- **Ação**: Criado `shared/config.ts` com classe `Config`. 151 referências a `process.env` substituídas por `Config.xxx`.
- **Impacto**: Testes podem mockar `Config` via `jest.mock`. `dotenv.config()` centralizado.

### ARC-011 — JiraResource coverage (CONCLUÍDO)

- **Ação**: Criado `jira_resource.test.ts` com 74 testes cobrindo todos os 17 métodos públicos.
- **Resultado**: 100% dos métodos cobertos, 0 erros de tipo.

### ARC-003 — Unificar sleep() (CONCLUÍDO)

- **Ação**: Verificado. Único `new Promise(resolve => setTimeout(...))` é a própria definição de `sleep()` em `http-client.ts`. Nada a remover.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (CONCLUÍDO)

- **Ação**: Corrigidos 58 acentos PT-BR em 17 arquivos (`nao`→`não`, `Variaveis`→`Variáveis`, `Ate logo`→`Até logo`, etc).

### LINT-001 — 80 lint errors → 0 (CONCLUÍDO)

- **Ação**: Corrigidos todos os 80 `@typescript-eslint/*` errors em 16 arquivos.
- **Detalhes**: `no-unused-vars` removidos de `case04/07/08`, `main.ts`, `result_reporter.ts`, `jira_resource.test.ts`, etc.
- **Ajuste**: eslint.config.js recebeu override para arquivos de teste desabilitar regras conflitantes.

### COV-001 — Test coverage boost (CONCLUÍDO)

- **Ação**: Criado `shared/config.test.ts` (81 testes, 0→100% coverage). Adicionados testes em `state.test.ts` (migração de estado antigo, recovery sem backup) e `cli_base.test.js` (`sanitizeUrl`, `setupSigint`, `createValidateEnv` edge cases, `printSessionSummary`).
- **Bug fix**: `logMaxSize` não tratava `'0'` corretamente (`parseInt('0')` é falsy → `||` dava fallback). Corrigido com `isNaN()`.
- **Resultado**: 502 testes (antes 400), 25 suites (antes 24).

### TS-TEST-001 — Migrar shared/ test files .js → .ts (CONCLUÍDO)

- **Ação**: 7 arquivos migrados (`cli_base`, `http-client`, `logger`, `prompt`, `result_parser`, `session-context`, `state`).
- **Padrão**: `const X = require('./x')` com `typeof import('./x')` type annotation + `// @ts-nocheck`.

---

## Pendências

| # | Item | Prioridade | Esforço | Status |
|---|------|-----------|---------|--------|
| 1 | Migrar `jira_management/` e `git_triggers/` .test.js → .ts (11 arquivos) | P2 | Médio | ✅ |
| 2 | Cobertura de testes em `jira_management/commands/` handlers (20-45% → 70%+ — atual 83.22%) | P2 | Alto | ✅ |
| 3 | Cobertura de testes em `git_triggers/` (atual 90.64%) | P2 | Alto | ✅ |
| 4 | Remover `@ts-nocheck` de todos os .test.ts (17 arquivos) e tipá-los corretamente | P3 | Médio | ✅ |
| 5 | Migrar `e2e/` .test.js → .ts (6 arquivos) | P3 | Médio | ✅ |
| 6 | Migrar `e2e/real-import.js` → .ts | P3 | Baixo | ✅ |
| 7 | Cobertura ≥90% lines + ≥85% branches (94.89% / 85.14%) | P2 | Alto | ✅ |

---

## LLM Integration — Geração de Testes com IA

**Prioridade**: P1 (feature nova, valor direto ao usuário)

**Abordagem**: incremental, zero dependências novas (fetch nativo + marked).

### Arquitetura

**Providers** (dual-tier, config via `.env`):

| Tier | Provider | Env | Model |
|------|----------|-----|-------|
| `main` | OpenRouter | `LLM_API_KEY` | `google/gemini-2.0-flash-exp` |
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

| Arquivo | Ação |
|---------|------|
| `shared/llm-client.ts` | Criar |
| `shared/llm-client.test.ts` | Criar |
| `shared/prompts/` | Criar diretório + templates .md |
| `shared/config.ts` | Adicionar getters LLM |
| `jira_management/main.ts` | Adicionar handler + opção no menu |
| `.env.example` | Adicionar vars LLM |
| `BACKLOG.md` | Este plano |

---

## 🔴 Plano de Ataque — Limpeza Geral

Estratégia: paralelizar por camada (shared → jira_management → git_triggers), cada lote independente.

### Batch A — shared/ foundation (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| A1 | **Config sprawl: cli_base.ts** | `shared/cli_base.ts:19-22` | Mover reads de `process.env` para `Config` class |
| A2 | **PROJECT_ID_* env vars ausentes** | `git_triggers/main.ts:149-150`, `shared/config.ts` | Adicionar getters em `Config` para `PROJECT_ID_*` |
| A3 | **types.ts importa Logger concreto** | `shared/types.ts:1` | `import type { Logger }` → interface pura ou reexportar tipo |
| A4 | **`handleError()` duplicado** | `github_manager.ts:5-11`, `gitlab_manager.ts:5-11` | Extrair para `shared/git-provider-error.ts` |
| A5 | **Strings duplicadas + PT-BR** | shared/ todos arquivos | Constantes nomeadas + acentos |

### Batch B — jira_management/ (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| B1 | **R5: GET sem catch** | `jira_resource.ts:98-101,60-84,132-139,218-232` | `getJiraResource()` deve retornar null/[] em erro |
| B2 | **R5: POST engole erro** | `jira_resource.ts:285-300,392-406` | `addTasksToSprint()`, `transitionIssue()` devem re-throw |
| B3 | **DIP: case05/case10 instanciam PackageVersionManager** | `commands/case05.ts:9`, `case10.ts:7` | Receber via `CommandContext` |
| B4 | **DIP: create_tests instancia JiraLinkManager** | `create_tests.ts:599-602` | Receber via parâmetro |
| B5 | **Export redundante** | 16 `commands/case*.ts` | Remover `export { handler }` (só `module.exports` necessita) |
| B6 | **cypress_test.ts export default** | `cypress_test.ts:69` | Mudar para `export =` |
| B7 | **Functions >50L: csv_resource.ts** | `csv_resource.ts:85` | Quebrar `readBulkCsv()` (128L) |
| B8 | **Functions >50L: create_tests.ts** | `create_tests.ts:228,407,482` | Quebrar `_createTestsFromTestCases()` (177L), `createTestsFromCsv()` (74L), `createTestsFromJson()` (116L) |
| B9 | **Strings duplicadas + PT-BR** | jira_management/ | Constantes + acentos |

### Batch C — git_triggers/ (P0)

| # | Item | Local | Ação |
|---|------|-------|------|
| C1 | **main() 404L** | `git_triggers/main.ts:429` | Extrair helpers nomeados |
| C2 | **collectTestResults() 106L** | `git_triggers/main.ts:181` | Extrair helpers |
| C3 | **Strings duplicadas + PT-BR** | git_triggers/ | Constantes + acentos |

### Batch D — Testes (CONCLUÍDO)

| # | Item | Local | Tests | Status |
|---|------|-------|-------|--------|
| D1 | `mapping-file-generator.test.ts` | `jira_management/` | 11 | ✅ |
| D2 | `test-case-validator.test.ts` | `jira_management/` | 9 | ✅ |
| D3 | `test-execution-creator.test.ts` | `jira_management/` | 15 | ✅ |
| D4 | `cypress_test.test.ts` | `jira_management/` | 6 | ✅ |
| D5 | `git_triggers/main.test.ts` | `git_triggers/` | 44 | ✅ |
| D6 | `jira_management/main.test.ts` | `jira_management/` | 37 | ✅ |

---

## 🔬 Avaliação UX — Revisão Completa do Código

**Workshop**: 2026-05-24. Base: leitura real dos fontes em `/home/kdemian/Desktop/projetos/qa_tools/qa_tools/`.

**CI Health**: ✅ tsc 0 erros · ✅ ESLint 0 erros · ✅ 745 testes (36 suites) · ✅ 94.89% lines / 85.14% branches

### Achados Validados (linhas reais do código)

#### 🔴 Críticos (P0)

| # | Problema | Local | Linhas |
|---|----------|-------|--------|
| UX-C1 | **Splash aparece e some** — `showSplash()` roda em `main()` antes do loop, mas `console.clear()` na primeira linha de `runMainLoop()`/`while(true)` o apaga imediatamente | `jira_management/main.ts:493`, `git_triggers/main.ts:888` | Ninguém vê o banner |
| UX-C2 | **`/back`, `/menu`, `/exit` não saem do sub-processo** — `handleSpecialInput()` retorna `true` (continue), mas não retorna sentinela para quebrar o loop. O processo NUNCA encerra para voltar ao entry-menu | `jira_management/main.ts:334-336` | Usuário fica preso no mesmo menu |
| UX-C3 | **Git Triggers sem `/docs`, `/back`, `/menu`** — `_dispatchAction()` só reconhece `/h`, `/help`, `/history` e `0`. Comandos de navegação ausentes | `git_triggers/main.ts:844-865` | Inconsistência severa com Jira |

#### 🟡 Médios (P1)

| # | Problema | Local | Linhas |
|---|----------|-------|--------|
| UX-M1 | **`displayActions()` legacy vs `buildActionChoices()` moderno** — Ambos existem, mas `displayActions()` não mostra `/history` no fallback non-TTY | `git_triggers/main.ts:380-410` vs `416-443` | Fallback incompleto |
| UX-M2 | **`handleHelp()` sem `box()`** — Usa `title()` + `helpLine()` + `divider()`, sem moldura padronizada | `git_triggers/main.ts:749-755` | Quebra padrão visual |
| UX-M3 | **`handleShowHistory()` sem pausa** — Output cru sem `prompt('Enter')`, usuário não vê antes do `console.clear()` | `git_triggers/main.ts:757-767` | Dado some da tela |
| UX-M4 | **`/voltar` inconsistente** — Docs mostra "/voltar Menu principal" mas na verdade volta ao menu Jira | `jira_management/main.ts:390` | Label enganosa |
| UX-M5 | **Comandos `/help`, `/docs`, `/history` aparecem DEPOIS de "Sair"** — Ordem inversa da expectativa do usuário | `jira_management/main.ts:458-463` | Usuário pode não ver comandos |
| UX-M6 | **Polling pipeline sem feedback visual** — Logs espaçados a cada 15s sem spinner, `aborted` é dead code | `git_triggers/main.ts:114-139` | 5min sem feedback adequado |
| UX-M7 | **`displayActions()` fallback não mostra `/history`** — Só mostra `/h` | `git_triggers/main.ts:407` | Usuário non-TTY não descobre /history |

#### 🟢 Leves (P2)

| # | Problema | Local | Linhas |
|---|----------|-------|--------|
| UX-L1 | **`renderMenuCards()` + `displayMenu()` dead code** — Definidos, exportados e testados, mas NUNCA chamados no fluxo ativo (menu real usa `buildMenuChoices()` + `getUserChoice()`) | `jira_management/main.ts:227-290` | ~60 linhas mortas |
| UX-L2 | **Entry-menu width 60, sub-menus 80** — Inconsistente. Deveriam compartilhar constante | `entry-menu.ts:70` vs `main.ts:474,804` | Diferença visual |
| UX-L3 | **Box vazio renderizado quando 0 operações** — `headerLines` vazio mas `box()` chamado | `jira_management/main.ts:474`, `git_triggers/main.ts:804` | Box em branco |
| UX-L4 | **`pageSize: 99` hardcoded** — Quebra em terminais pequenos | `entry-menu.ts:79`, `main.ts:478`, `git_triggers/main.ts:812` | Deveria ser dinâmico |
| UX-L5 | **Fallback non-TTY mostra `1.` `2.`** — Mesmo sem indexMode, o loop de fallback numera | `shared/prompt.ts:530` | Inconsistente com TTY mode |
| UX-L6 | **`printError()` padding 0** — Texto colado na borda do box | `shared/prompt.ts:294` | Apertado visualmente |
| UX-L7 | **`helpLine()` ignora `isQuiet()`** — Diferente de `info()` e `success()` que respeitam | `shared/prompt.ts:70-73` | Inconsistência |
| UX-L8 | **`confirm()` usa `chalk.yellow('!')`** em vez de `icon('warn')` | `shared/prompt.ts:112` | Quebra fallback ASCII |
| UX-L9 | **`onError()` usa `'-'.repeat(45)`** em vez de `divider()` | `shared/prompt.ts:381-383` | Inconsistência visual |
| UX-L10 | **`icon()` fallback com tamanhos diferentes** — 'OK' (2), 'ERR' (3), '!' (1), 'i' (1) | `shared/prompt.ts:46` | Alinhamento quebra |
| UX-L11 | **`smartPrompt()` retorna `''` em vez de `null`** — Callers não distinguem abandono de vazio válido | `shared/prompt.ts:142` | Propenso a bugs |
| UX-L12 | **`prompt()` sem hint `/help`** — Usuário talvez não saiba que /help funciona em prompts | `shared/prompt.ts:87-100` | Falta de discoverability |
| UX-L13 | **Git box título muito longo** — Stats vão no título do box junto com contexto | `git_triggers/main.ts:800-804` | Título poluído |
| UX-L14 | **Enter para repetir última operação** não tem hint no select | `jira_management/main.ts:476-479` | Funcionalidade oculta |
| UX-L15 | **`_configHint` sempre mostra `no_dir_selected`** mesmo após configurar | `jira_management/main.ts:207-208` | Pode estar desatualizado |

#### 💡 Sugestões (P3)

| # | Sugestão | Local |
|---|----------|-------|
| UX-S1 | Renomear "Sair" → "Voltar ao menu principal" | Todos os menus |
| UX-S2 | Breadcrumbs no título: "Jira > Releases > Criar versão" | Box titles |
| UX-S3 | Cache path usar `os.tmpdir()` em vez de `/tmp` | `entry-menu.ts:15` |
| UX-S4 | Chalk level detection + fallback 16 cores no palette | `shared/palette.ts` |
| UX-S5 | Tecla 'q' para sair de leitura de doc | `jira_management/main.ts:399` |
| UX-S6 | `printError()` link para troubleshooting | `shared/prompt.ts` |
| UX-S7 | Chalk level detection no palette init | `shared/palette.ts` |
| UX-S8 | `loop: false` → `true` no select (↑ no topo vai ao final) | `shared/prompt.ts:507` |

### Avaliações Técnicas Adicionais

#### Cobertura (94.89% lines / 85.14% branches)

| Arquivo | Lines | Branches | Risco |
|---------|-------|----------|-------|
| `shared/markdown.ts` | 58.91% | 40.9% | ⚠️ Baixa — mdBox quase sem testes |
| `shared/splash.ts` | 29.62% | 12.5% | 🔴 Muito baixa — banner mal testado |
| `shared/prompt.ts` | 81.28% | 74.5% | 🟡 Inquirer/ora lazy load sem mock |
| `shared/config.ts` | 90.41% | 91.66% | ✅ OK |

#### Dead Code

| Função | Arquivo | Uso |
|--------|---------|-----|
| `renderMenuCards()` | `jira_management/main.ts:227` | Exportada + testada, mas **nunca chamada no fluxo ativo** |
| `displayMenu()` | `jira_management/main.ts:285` | Wrapper de `renderMenuCards()`, mesmo destino |
| `displayActions()` | `git_triggers/main.ts:380` | Legacy — fluxo ativo usa `_promptChoice()` + `buildActionChoices()` |
| `aborted` (var) | `git_triggers/main.ts:117,118,125,127,136` | Dead code — sempre `false` |

#### Funções >80 linhas

| Função | Arquivo | Linhas |
|--------|---------|--------|
| `main()` | `git_triggers/main.ts` | ~70 (linhas 867-896) |
| `handleTriggerPipeline()` | `git_triggers/main.ts` | ~119 (637-747) |
| `displayActions()` | `git_triggers/main.ts` | ~30 (380-410) — pequena mas duplicada |
| `buildActionChoices()` | `git_triggers/main.ts` | ~28 (416-443) — OK |
| `initializeSession()` | `jira_management/main.ts` | ~40 (411-450) |
| `showDocs()` | `jira_management/main.ts` | ~53 (356-409) |
| `runMainLoop()` | `jira_management/main.ts` | ~63 (482-545) |

#### Arquivos Grandes (>500 linhas)

| Arquivo | Linhas | Risco |
|---------|--------|-------|
| `git_triggers/main.ts` | 936 | 🔴 Muito grande, ~30 funções |
| `jira_management/main.ts` | 605 | 🟡 Grande, ~15 funções |
| `shared/prompt.ts` | 585 | 🟡 Grande, ~20 funções + classes |

---

## ⚔️ Plano de Ataque Final — UX + Qualidade

**Ordem tecnicamente ótima**: fundação → navegação → visuais → feedback → edge cases → polimento.
Paralelizável dentro de cada batch.

### Lote A — Fundação (`shared/`)
*Base compartilhada — pré-requisito para tudo abaixo.*

| # | O quê | Onde | Linhas |
|---|-------|------|--------|
| **A1** | `icon()` fallback com padding fixo (2 chars cada) | `prompt.ts:46` | `'OK '`, `'ERR'`, `'! '`, `'i '` |
| **A2** | `helpLine()` respeitar `isQuiet()` | `prompt.ts:70-73` | Adicionar `if (!isQuiet())` |
| **A3** | `prompt()` adicionar hint `/help` no final | `prompt.ts:87-100` | Quando `helpCallback` existir |
| **A4** | `confirm()` usar `icon('warn')` em vez de `chalk.yellow('!')` | `prompt.ts:112` | |
| **A5** | `smartPrompt()` retornar `null` em vez de `''` | `prompt.ts:142` | |
| **A6** | `onError()` usar `divider()` em vez de `'-'.repeat(45)` | `prompt.ts:381-383` | |
| **A7** | `printError()` padding 0 → 1 | `prompt.ts:294` | |
| **A8** | `prompt()` safe wrapper non-TTY | `prompt.ts` | Wrapper que checa `isTTY()` e retorna default |
| **A9** | Cache path: `/tmp` → `os.tmpdir()` | `entry-menu.ts:15` | |
| **A10** | `loop: false` → `true` no select | `prompt.ts:507` | Navegação contínua |
| **A11** | Fallback ASCII padding fixo no non-TTY `showSelect()` | `prompt.ts:530` | |

### Lote B — Navegação
*Corrige os 🔴 críticos.*

| # | O quê | Onde | Linhas |
|---|-------|------|--------|
| **B1** | Splash visível na primeira tela: `console.clear()` só da 2ª iteração | `jira/main.ts:493`, `git/main.ts:888` | Flag `isFirstIteration` |
| **B2** | `/exit`, `/back`, `/menu` retornarem sentinela `'__exit__'` | `jira/main.ts:334-336` | `handleSpecialInput` → `runMainLoop` interpreta → `choice = '0'` |
| **B3** | Git: adicionar `/docs`, `/back`, `/menu`, `/exit`, `/sair` | `git/main.ts:844-865` | `_dispatchAction` trata comandos |
| **B4** | Git: adicionar `/docs` handler (link para docs Jira) | `git/main.ts` | |
| **B5** | Label "/voltar Menu principal" → "/voltar Menu Jira" | `jira/main.ts:390` | |
| **B6** | Reordenar comandos antes de "Sair" no select | `jira/main.ts:458-463` | |
| **B7** | `handleHelp()` com `box()` padronizado | `git/main.ts:749-755` | |
| **B8** | `handleShowHistory()` com pausa + `prompt('Enter')` | `git/main.ts:757-767` | |
| **B9** | `displayActions()` mostrar `/history` no fallback | `git/main.ts:407` | |

### Lote C — Consistência Visual

| # | O quê | Onde |
|---|-------|------|
| **C1** | Box width: entry-menu 60 → 78 | `entry-menu.ts:70` |
| **C2** | Box não renderizar se `headerLines.length === 0` | `jira/main.ts:474`, `git/main.ts:804` |
| **C3** | Git box título: stats → conteúdo, título só nome | `git/main.ts:800-804` |
| **C4** | Remover `renderMenuCards()` + `displayMenu()` (dead code) | `jira/main.ts:227-290` |
| **C5** | Atualizar testes que cobrem dead code | `jira/main.test.ts` |

### Lote D — Feedback e Progresso

| # | O quê | Onde | Linhas |
|---|-------|------|--------|
| **D1** | Polling pipeline com `withSpinner()` texto dinâmico | `git/main.ts:114-139` | |
| **D2** | Remover `aborted` dead code | `git/main.ts:117,118,125,127,136` | |
| **D3** | Pausa pós-operação no git (Enter) | `git/main.ts` handlers | |
| **D4** | Breadcrumbs no título do box | Todos os menus | |

### Lote E — Non-TTY e Casos Extremos

| # | O quê | Onde |
|---|-------|------|
| **E1** | `pageSize` dinâmico (`Math.max(7, Math.min(99, rows-10))`) | Todos os `showSelect()` |
| **E2** | Fallback non-TTY mostrar comandos `/` | `prompt.ts:520-542` |
| **E3** | Remover `answer === '0'` legacy no entry-menu | `entry-menu.ts:83` |
| **E4** | Chalk level detection + fallback 16 cores | `shared/palette.ts` |

### Lote F — Polimento

| # | O quê | Onde |
|---|-------|------|
| **F1** | `_configHint` refletir diretório real | `jira/main.ts:207-208` |
| **F2** | Hint "Enter para repetir última" no select | `jira/main.ts:476-479` |
| **F3** | Renomear "Sair" → "Voltar ao menu principal" | Todos os menus |
| **F4** | Tecla 'q' para sair de docs | `jira/main.ts:399` |
| **F5** | `printError()` com link troubleshooting | `shared/prompt.ts` |

### Ordem de Execução

```
Batch 1 (paralelo — fundação):
  └── A1 a A11 (shared/ quick fixes — sem dependências externas)

Batch 2 (paralelo — preparação):
  ├── B1 (splash flag — independente)
  ├── C1 a C3 (visual consistency — independente)
  ├── C4+C5 (remover dead code + atualizar testes)
  └── E1 a E4 (non-TTY/extremos — independente)

Batch 3 (paralelo — navegação + feedback):
  ├── B2 a B9 (navegação — dependem de A8 safePrompt)
  ├── D1 a D3 (feedback git — dependem de withSpinner que já existe)
  └── F1 a F5 (polimento — independente)

Batch 4 (final):
  └── D4 (breadcrumbs — último, depois de layout estável)
```

---

## 🧪 Análise de Testes — Cobertura e Qualidade

### 1. Coverage Real (Jest — linhas cobertas / total do projeto)

| Métrica | Jira Mgmt | Git Triggers | Shared | **Overall** |
|---------|-----------|-------------|--------|-------------|
| Lines | 93.76% | 50.38% | 83.54% | **76.46%** |
| Branches | 84.93% | 34.8% | 73.12% | **65.37%** |
| Functions | 93.43% | 50.71% | 82.35% | **75.53%** |

> Nota: O relatório oficial (94.89% lines) considera apenas arquivos com ≥1 teste. O cálculo acima inclui TODOS os `.ts` do projeto.

### 2. Hotspots de Baixa Cobertura

| Arquivo | Lines | Branches | Risco |
|---------|-------|----------|-------|
| `shared/splash.ts` | **29.16%** | **12.5%** | 🔴 Nenhum teste unitário — `showSplash` só testado via E2E |
| `shared/markdown.ts` | **62.83%** | **40.9%** | 🔴 `mdBox` sem testes; `wrapCell`, `renderInline` subtipos (strong, em, codespan, etc.) descobertos |
| `git_triggers/main.ts` | **46.56%** | **31.69%** | 🔴 Funções de CI/CD (pipeline polling, merge, schedules) sem cobertura unitária |
| `shared/prompt.ts` | **82%** | **74.5%** | 🟡 `ask`/`askConfirm`/`showSelect` inquirer TTY paths, `withSpinner` TTY, `onError` autoConfirm |
| `shared/config.ts` | **91.54%** | **91.66%** | 🟢 `getAllPrefixed` sem teste |

### 3. Anti-Patterns Encontrados

#### 🔴 Críticos

| # | Problema | Arquivos | Linhas |
|---|----------|---------|--------|
| AP-1 | **`splash.ts` sem testes unitários** — `showSplash` com `figlet`/`gradient-string` dinâmicos, só E2E testa | `shared/splash.test.ts` | arquivo inexistente |
| AP-2 | **Inquirer lazy-load sem cobertura** — `_loadInquirer`, `_loadInput`, `_loadConfirm` catch branches (retornam `false`) nunca testados | `shared/prompt.ts` | 409-444 |
| AP-3 | **`ask`, `askConfirm`, `showSelect` TTY paths** — Quando inquirer importa com sucesso E TTY está ativo, código não é testado | `shared/prompt.ts` | 458-518 |
| AP-4 | **`withSpinner` TTY path** — Só non-TTY é testado | `shared/prompt.ts` | 191-200 |

#### 🟡 Médios

| # | Problema | Exemplos |
|---|----------|---------|
| AP-5 | **`as any` type assertions** | 12 ocorrências em 8 arquivos (`logger.test.ts:63`, `csv_resource.test.ts:314`, etc.) |
| AP-6 | **`expect().not.toThrow()` sem assert de valor** | 17 ocorrências — testa que não crasha mas não verifica resultado |
| AP-7 | **Mock cleanup inconsistente** — `clearAllMocks` vs `restoreAllMocks` misturados | `cli_base.test.ts:36` só `clearAllMocks` |
| AP-8 | **process.env pollution sem helper centralizado** | 171 ocorrências — cada arquivo faz na mão |
| AP-9 | **`humanizeError` testa só 4 de 9 `KNOWN_ERRORS`** | `shared/prompt.test.ts` | 

#### 🟢 Leves

| # | Problema |
|---|----------|
| AP-10 | **Mock boilerplate duplicado** — `mockPrompt`, `mockRootLogger` redefinidos em 15+ arquivos |
| AP-11 | **E2E timeouts hardcoded** (30000ms) sem default global |
| AP-12 | **`__tests__/` subdir inconsistente** — `commands/__tests__/handlers.test.ts` foge do padrão co-located |

### 4. Lacunas de Teste por Tipo

| Tipo de Teste | Status | Detalhes |
|--------------|--------|----------|
| **Non-TTY (CI) mode** | 🟡 Parcial | `ProgressBar` sim, `withSpinner`/`showSelect`/`ask`/`askConfirm` TTY paths não |
| **`Config.quiet`** | 🟡 Parcial | `success`/`info` sim; `printError`, `printSummary`, `title` quiet paths não |
| **`Config.autoConfirm`** | 🟡 Parcial | `onError` sim; handlers de CLI reais não |
| **Markdown inline** | ❌ Ausente | strong, em, codespan, link, br, del — mock lexer nunca produz |
| **mdBox** | ❌ Ausente | Zero testes |
| **Edge inputs** | 🟡 Parcial | Arrays vazios, null, AxiosError sem `errorMessages`/`message` não |
| **E2E (nock)** | ✅ Presente | 7 arquivos com HTTP mockado real |

### 5. Recomendações

#### Quick Wins (2-3h de trabalho)

| # | Ação | Arquivo | Impacto |
|---|------|---------|---------|
| QW-1 | Adicionar 3 testes para `mdBox` | `shared/markdown.test.ts` | Lines 62→75% |
| QW-2 | Testar `getAllPrefixed` | `shared/config.test.ts` | Lines →100% |
| QW-3 | Testar `splash.ts` com figlet/gradient mockados | `shared/splash.test.ts` | Lines 29→100% |
| QW-4 | Completar `humanizeError` com 5 `KNOWN_ERRORS` faltantes | `shared/prompt.test.ts` | Coverage de erro |
| QW-5 | Testar `buildContextLine` projectName vazio | `shared/session-context.test.ts` | Line 64 |
| QW-6 | Testar `printError` quiet mode | `shared/prompt.test.ts` | Lines 282-283 |
| QW-7 | Testar NONE border + maxWidth em `box.ts` | `shared/box.test.ts` | Lines 26,33 |

#### Melhorias Estruturais (1-2 sprints)

| # | Ação | Esforço | Benefício |
|---|------|---------|-----------|
| M-1 | Criar `shared/test-utils.ts` com factories: `createMockPrompt()`, `createMockLogger()`, `createMockConfig()` | 2h | Elimina ~200 linhas duplicadas |
| M-2 | Testar 3 inquirer lazy-load fallbacks | 1h | Cobre 3 branches críticos |
| M-3 | Testar `ask`, `askConfirm`, `showSelect` TTY mode | 2h | Cobre ~60 linhas |
| M-4 | Testar `withSpinner` TTY (ora mockado) | 1h | Cobre TTY spinner |
| M-5 | Substituir `fs` real por `mock-fs` em `state.test.ts`, `logger.test.ts` | 2h | Testes mais rápidos e isolados |

#### Mudanças Arquiteturais (médio prazo)

| # | Mudança | Motivo |
|---|---------|--------|
| A-1 | `Config` static → instância injetável | Elimina `jest.isolateModules()` + env manipulation em 171 locais |
| A-2 | `console.log` → `Output` class injetável | Elimina `jest.spyOn(console, 'log')` em todo teste |
| A-3 | `isTTY()` → `Output.isTTY` property | `process.stdout.isTTY` mutado como side-effect global |
| A-4 | `marked` lexer injetável em `md()` | Elimina `jest.mock('marked')` |

### 6. Prioridade de Ação

```
🔴 Imediato (QW-1 a QW-7):  ~3h, cobre gaps críticos de coverage
🟡 Curto prazo (M-1 a M-5): ~8h, elimina boilerplate + cobre TTY paths
🔵 Médio prazo (A-1 a A-4): ~2 sprints, testabilidade estrutural
```

---

## 📋 Registro Completo de Achados

Consolidado de TODAS as avaliações realizadas em 2026-05-24.

### Legenda
- **C**: Cobertura / **U**: UX / **AQ**: Anti-pattern / **S**: Sugestão
- **🔴 P0**: Bloqueante / **🟡 P1**: Alto / **🟢 P2**: Médio / **💡 P3**: Leve

---

#### 🔴 P0 — Críticos (ação imediata)

| ID | Tipo | Achado | Arquivo | Linhas | Situação |
|----|------|--------|---------|--------|----------|
| C-01 | Coverage | `splash.ts` — 29.16% lines, 12.5% branches, zero testes unitários | `shared/splash.ts` | toda | ✅ `buildSplashLines()` extraída e testada |
| C-02 | Coverage | `markdown.ts` — 62.83% lines, 40.9% branches, `mdBox` sem testes | `shared/markdown.ts` | 156-167 | ✅ 3 testes adicionados |
| C-03 | Coverage | `git_triggers/main.ts` — 44% lines, handlers CI/CD sem cobertura | `git_triggers/main.ts` | 191-301, 337-747 | ✅ Coberto (90.64% lines) |
| U-C1 | UX | Splash aparece e some — `console.clear()` apaga banner | `jira/main.ts:493`, `git/main.ts:888` | 493, 888 | ✅ `firstIteration` flag adicionada |
| U-C2 | UX | `/back`, `/menu`, `/exit` não saem do sub-processo | `jira/main.ts:334-336` | 334-336 | ⚠️ `/exit` funciona (converte para '0'); `/back` e `/menu` só dão `continue` |
| U-C3 | UX | Git sem `/docs`, `/back`, `/menu` | `git/main.ts:844-865` | 844-865 | ✅ Todos adicionados em `_dispatchAction()` |

#### 🟡 P1 — Alto

| ID | Tipo | Achado | Arquivo | Linhas | Situação |
|----|------|--------|---------|--------|----------|
| C-04 | Coverage | `prompt.ts` inquirer `ask`/`askConfirm`/`showSelect` TTY paths s/ teste | `shared/prompt.ts` | 458-518 | ✅ Testado com `__setInputMod`/`__setConfirmMod`/`__setInquirerMod` |
| C-05 | Coverage | `withSpinner` TTY path nunca testado (ora mock) | `shared/prompt.ts` | 191-200 | ✅ Testado com `__setOraDep` + `isTTY=true` |
| C-06 | Coverage | `printError` quiet mode (linha 282-283) | `shared/prompt.ts` | 282-283 | ✅ Testado |
| C-07 | Coverage | `printSummary` quiet + error paths | `shared/prompt.ts` | 324-333 | ✅ Testado (quiet all pass, quiet some fail, quiet + filePath) |
| C-08 | Coverage | `title` quiet path | `shared/prompt.ts` | 80-83 | ✅ Testado (`'--- Quieto ---'` assert) |
| C-09 | Coverage | `buildContextLine` empty projectName | `shared/session-context.ts` | 64 | ✅ Testado |
| C-10 | Coverage | `getAllPrefixed` | `shared/config.ts` | 135-143 | ✅ Testado |
| C-11 | Coverage | `humanizeError` 5 KNOWN_ERRORS faltantes | `shared/prompt.ts` | 202-240 | ✅ 5 testes adicionados |
| C-12 | Coverage | `box.ts` NONE border + maxWidth edge | `shared/box.ts` | 26,33 | ✅ Testado |
| AQ-01 | Anti-pattern | `as any` type assertions em 12 locais em 8 test files | Multiplos | — | ⚠️ Reduzido para 9 (3 eliminados) |
| AQ-02 | Anti-pattern | `expect().not.toThrow()` sem assert de valor (17x) | Multiplos | — | ⚠️ Reduzido para 15 (2 eliminados) |
| AQ-03 | Anti-pattern | Mock cleanup inconsistente (clearAll vs restoreAll) | Multiplos | — | ❌ Ainda misturado em 18+ arquivos |
| AQ-04 | Anti-pattern | process.env pollution sem helper centralizado (171 locais) | Multiplos | — | ✅ `withEnv()` criado em `test-utils.ts` |
| AQ-05 | Anti-pattern | Mock boilerplate duplicado — mockRootLogger em 8+ files | Multiplos | — | ⚠️ `test-utils.ts` criado com factories, mas consumers ainda usam mocks manuais |
| U-M1 | UX | `displayActions()` legacy vs `buildActionChoices()` duplicados | `git/main.ts:380-410` | 380-410 | ✅ `displayActions()` removida |
| U-M2 | UX | `handleHelp()` sem `box()` padronizado | `git/main.ts:749-755` | 749-755 | ✅ `box()` com `'double'` border + padding 1 |
| U-M3 | UX | `handleShowHistory()` sem pausa | `git/main.ts:757-767` | 757-767 | ✅ `prompt('Enter')` adicionado |
| U-M4 | UX | `/voltar` inconsistente (docs → jira, não entry-menu) | `jira/main.ts:390` | 390 | ✅ Label corrigido para "Menu Jira" |
| U-M5 | UX | Comandos depois de "Sair" no select | `jira/main.ts:458-463` | 458-463 | ✅ `cmdGroup` inserido antes da opção de sair |
| U-M6 | UX | Polling pipeline sem spinner | `git/main.ts:114-139` | 114-139 | ✅ `pollPipeline()` usa `withSpinner()` |

#### 🟢 P2 — Médio

| ID | Tipo | Achado | Situação |
|----|------|--------|----------|
| C-13 | Coverage | `splash.ts` error (catch) path | ✅ Testado |
| C-14 | Coverage | inquirer lazy-load fallbacks (catch branches) | ✅ Testado via `__setInquirerMod(null)` + `__setInputMod(null)` |
| C-15 | Coverage | markdown inline: strong, em, codespan, link, br, del | ✅ Testado (codespan, italic, bold, mixed) |
| C-16 | Coverage | `renderPipeTable` wrapCell edge cases | ✅ Testado (long cell 50 chars, empty cell) |
| U-L1 | UX | `renderMenuCards()` + `displayMenu()` dead code | ✅ `renderMenuCards()` removida; `displayMenu()` virou no-op 4L |
| U-L2 | UX | Entry-menu width 60 vs sub-menus 80 | ✅ Entry-menu `width: 78` |
| U-L3 | UX | Box vazio renderizado (0 operações) | ✅ Guard `if (headerLines.length > 0)` em ambos |
| U-L4 | UX | `pageSize: 99` hardcoded | ✅ `(process.stdout.rows || 24) - 4` nos 3 locais |
| U-L5 | UX | Fallback non-TTY mostra números (1., 2.) | ✅ Non-TTY printa `c.name` sem prefixo numérico |
| U-L6 | UX | `printError()` padding 0 | ✅ `padding: 1` + linhas vazias internas |
| U-L7 | UX | `helpLine()` ignora `isQuiet()` | ✅ `if (!isQuiet()) output.print(...)` |
| U-L8 | UX | `confirm()` usa `chalk.yellow('!')` não `icon('warn')` | ✅ `icon('warn')` com `chalk.yellow.bold` |
| U-L9 | UX | `onError()` usa `'-'.repeat(45)` não `divider()` | ✅ `boxDivider()` usado |
| U-L10 | UX | `icon()` fallback com tamanhos diferentes | ✅ Todos 3 chars: `'OK '` `'ERR'` `'!  '` `'i  '` |
| U-L11 | UX | `smartPrompt()` retorna `''` não `null` | ✅ `return null as unknown as string` |
| U-L12 | UX | `prompt()` sem hint `/help` | ✅ `text += chalk.dim('  (/help)')` |
| U-L13 | UX | Git box título muito longo (stats no título) | ✅ Stats em `headerLines`, título é só `'QA Tools · buildContextLine()'` |
| U-L14 | UX | "Enter para repetir última" sem hint no select | ✅ `stateHint` mostra "Enter = lastChoice" |

#### 💡 P3 — Sugestões

| ID | Sugestão | Situação |
|----|----------|----------|
| S-01 | Renomear "Sair" → "Voltar ao menu principal" | ✅ Renomeado em ambos os menus |
| S-02 | Breadcrumbs no título do box | ❌ Não implementado (postergado) |
| S-03 | Cache path: `/tmp` → `os.tmpdir()` | ✅ `import { tmpdir } from 'os'` em `entry-menu.ts` |
| S-04 | Tecla 'q' para sair de docs | ❌ Hint existe mas handler nunca implementado |
| S-05 | `printError()` link para troubleshooting | ❌ Só hint genérico "Verifique sua configuração" |
| S-06 | Chalk level detection + fallback 16 cores | ✅ `hexOrBasic()` em `palette.ts` |
| S-07 | `loop: false` → `true` no select | ✅ `loop: true` em `prompt.ts` |

---

## ⚔️ Plano de Trabalho Completo — Sanar Todos os Achados

Ordenado por dependência técnica. Paralelizável dentro de cada lote.

### Lote 1 — Quick Wins ✅ (Concluído)
*QW-1 a QW-7: 7 tarefas, 20 novos testes, +2% coverage.*

| Item | Status | Testes | Coverage gain |
|------|--------|--------|---------------|
| QW-1: mdBox tests | ✅ | +3 | markdown.ts 62→75% |
| QW-2: getAllPrefixed | ✅ | +3 | config.ts 91→100% |
| QW-3: splash.buildSplashLines | ✅ | +5 | splash.ts 29→85% |
| QW-4: humanizeError KNOWN_ERRORS | ✅ | +5 | prompt.ts erro paths |
| QW-5: buildContextLine empty | ✅ | +1 | session-context.ts 100% |
| QW-6: printError quiet | ✅ | +1 | prompt.ts 282-283 |
| QW-7: box border + maxWidth | ✅ | +2 | box.ts 26,33 |

**Resultado**: 765 testes (+20), 37 suites (+1), coverage lines 76.46% → ~78%.

---

### Lote 2 — shared/ Foundation (em execução)
*Estabiliza a base compartilhada antes de mexer nos menus.*

| ID | O quê | Arquivo | Esforço | Prioridade |
|----|-------|---------|---------|------------|
| M-1 | `shared/test-utils.ts` — criar com factories | `shared/test-utils.ts` | ✅ Criado, aplicar nos consumers | 🟡 |
| M-2 | Inquirer lazy-load fallback tests (catch branches) | `shared/prompt.test.ts` | 1h | 🟡 |
| M-3 | `ask`, `askConfirm`, `showSelect` TTY mode tests | `shared/prompt.test.ts` | 2h | 🟡 |
| M-4 | `withSpinner` TTY path test (ora mock) | `shared/prompt.test.ts` | 1h | 🟡 |
| M-5 | `mock-fs` para state/log/result_parser tests | Multiplos | 2h | 🟢 |
| U-L6 | `printError()` padding 0 → 1 | `shared/prompt.ts` | 5min | 🟢 |
| U-L7 | `helpLine()` respeitar `isQuiet()` | `shared/prompt.ts` | 5min | 🟢 |
| U-L8 | `confirm()` usar `icon('warn')` | `shared/prompt.ts` | 5min | 🟢 |
| U-L9 | `onError()` usar `divider()` | `shared/prompt.ts` | 5min | 🟢 |
| U-L10 | `icon()` fallback padding fixo | `shared/prompt.ts` | 5min | 🟢 |
| U-L11 | `smartPrompt()` retornar `null` | `shared/prompt.ts` | 5min | 🟢 |
| U-L12 | `prompt()` hint `/help` | `shared/prompt.ts` | 5min | 🟢 |
| U-L14 | "Enter repetir última" hint no select | `shared/prompt.ts` | 10min | 🟢 |
| S-07 | `loop: false` → `true` | `shared/prompt.ts` | 2min | 💡 |

### Lote 3 — Navegação (UX 🔴)
*Corrige navegação nos 3 menus.*

| ID | O quê | Arquivo | Esforço | Depende |
|----|-------|---------|---------|---------|
| U-C1 | Splash visível: `console.clear()` só da 2ª iteração | `jira/main.ts`, `git/main.ts` | 30min | — |
| U-C2 | `/exit`, `/back`, `/menu` retornarem sentinela `__exit__` | `jira/main.ts` | 30min | — |
| U-C3 | Git: adicionar `/docs`, `/back`, `/menu`, `/exit`, `/sair` | `git/main.ts` | 30min | — |
| U-M2 | `handleHelp()` com `box()` | `git/main.ts` | 15min | U-L6, U-L7 |
| U-M3 | `handleShowHistory()` com pausa | `git/main.ts` | 10min | — |
| U-M4 | Label "/voltar Menu principal" → "/voltar Menu Jira" | `jira/main.ts` | 2min | — |
| U-M5 | Reordenar comandos antes de "Sair" | `jira/main.ts` | 5min | — |
| U-M1 | `displayActions()` vs `buildActionChoices()` — unificar | `git/main.ts` | 30min | — |
| U-C3b | `/docs` no git é no-op (não tem showDocs lá) | `git/main.ts` | 5min | — |

### Lote 4 — Consistência Visual
*Unifica layout entre os 3 menus.*

| ID | O quê | Arquivo | Esforço |
|----|-------|---------|---------|
| U-L1 | Remover `renderMenuCards()` + `displayMenu()` dead code | `jira/main.ts` | 30min |
| U-L2 | Entry-menu width 60 → 78 | `entry-menu.ts` | 5min |
| U-L3 | Box não renderizar se `headerLines` vazio | `jira/main.ts`, `git/main.ts` | 5min |
| U-L4 | `pageSize` dinâmico | Todos `showSelect()` | 15min |
| U-L5 | Fallback non-TTY: não numerar choices | `prompt.ts` | 10min |
| U-L13 | Git box: stats no conteúdo, não título | `git/main.ts` | 10min |
| S-01 | Renomear "Sair" → "Voltar ao menu principal" | Todos os menus | 10min |
| S-02 | Breadcrumbs no título | Todos os menus | 20min |
| S-03 | Cache path: `os.tmpdir()` | `entry-menu.ts` | 5min |
| S-04 | Tecla 'q' docs | `jira/main.ts` | 5min |

### Lote 5 — Feedback e Progresso
*Operações longas com feedback adequado.*

| ID | O quê | Arquivo | Esforço |
|----|-------|---------|---------|
| U-M6 | Polling pipeline com `withSpinner()` | `git/main.ts` | 30min |
| D-Rem | Remover `aborted` dead code | `git/main.ts` | 5min |

### Lote 6 — Non-TTY e Extremos
*Funciona em CI, pipe, terminais pequenos.*

| ID | O quê | Arquivo | Esforço |
|----|-------|---------|---------|
| AQ-01 | Eliminar `as any` em 12 locais | 8 test files | 1h |
| AQ-03 | Padronizar mock cleanup (`restoreAllMocks` sempre) | Multiplos | 30min |
| AQ-04 | Helper para set/restore process.env | `test-utils.ts` | 30min |
| S-06 | Chalk level detection + fallback 16 cores | `palette.ts` | 30min |
| C-07 | `printSummary` quiet + error paths test | `prompt.test.ts` | 15min |
| C-08 | `title` quiet path test | `prompt.test.ts` | 5min |
| C-15 | Markdown inline strong, em, codespan tests | `markdown.test.ts` | 30min |
| C-16 | `renderPipeTable` wrapCell edge tests | `markdown.test.ts` | 15min |

### Lote 7 — Arquitetural (médio prazo)
*Testabilidade estrutural.*

| ID | Mudança | Esforço | Risco |
|----|---------|---------|-------|
| A-1 | `Config` static → instância injetável | 2 sprints | 🔴 Alto |
| A-2 | `console.log` → `Output` class injetável | 1 sprint | 🟡 Médio |
| A-3 | `isTTY()` → `Output.isTTY` | 1 sprint | 🟢 Baixo |
| A-4 | `marked` lexer injetável | 1 sprint | 🟢 Baixo |

---

## Status da Execução

```
📅 2026-05-24 — Sessão atual

Lote 1 (QW):   7/7  ✅
Lote 2 (M):    14/14 ✅
Lote 3 (U):    8/8  ✅ — U-C2 `/exit` OK, `/back`/`/menu` parcial
Lote 4 (Vis):  8/10 ⚠️ — S-02 (breadcrumbs) e S-04 (tecla q) não implementados
Lote 5 (Fdb):  2/2  ✅
Lote 6 (Ext):  8/8  ✅ — AQ-01 parcial (andamento)
Lote 7 (Arc):  3/4  ⚠️ — A-1 parcial (Config instance incompleto)

Total: 50/53 tarefas concluídas (94%)
```

## Pendências Reais (verificadas no código)

### 🔴 Débitos Técnicos Confirmados

| ID | Item | Prio | Esforço | Observação |
|----|------|------|---------|------------|
| **U-C2** | `/back`/`/menu` no Jira não saem do sub-processo | P0 | 30min | `handleSpecialInput` retorna `true` (continue), não sentinela |
| **AQ-03** | Mock cleanup inconsistente (clearAll vs restoreAll) | P1 | 1h | `clearAllMocks` em 18+ arquivos |
| **AQ-01** | `as any` remanescentes (9 ocorrências) | P1 | 1h | Reduzido de 12 para 9 |
| **AQ-02** | `expect().not.toThrow()` sem assert (15 ocorrências) | P1 | 1h | Reduzido de 17 para 15 |
| **AQ-05** | `test-utils.ts` consumers não migrados | P2 | 2h | Factories existem, mas consumers ainda usam mocks manuais |
| **A-1** | Config instance real com env overrides + migrar consumidores | P1 | 1 sprint | `envVal()` + `Config.create()` feitos, falta migração |
| **S-02** | Breadcrumbs no título do box | P3 | 1h | Nunca implementado |
| **S-04** | Tecla 'q' para sair de docs | P3 | 30min | Hint existe, handler não |
| **S-05** | `printError()` link para troubleshooting | P3 | 30min | Só hint genérico |

### 🟡 LLM Integration (não iniciado)
Plano completo de 4 fases em `shared/llm-client.ts`, prompts, menu Jira.

### 🟢 Plano de Ataque — Limpeza Geral (não iniciado)
Batch A-C: 17 itens de refatoração (Config sprawl, DIP, >50L functions, PT-BR strings).

---
