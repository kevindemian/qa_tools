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

| # | Item | Prioridade | Esforço |
|---|------|-----------|---------|
| 1 | Migrar `jira_management/` e `git_triggers/` .test.js → .ts (13 arquivos) | P2 | Médio |
| 2 | Cobertura de testes em `jira_management/commands/` handlers (20-45% → 70%+) | P2 | Alto |
| 3 | Cobertura de testes em `git_triggers/main.ts` | P2 | Alto |
| 4 | Remover `@ts-nocheck` dos shared/ test files e tipá-los corretamente | P3 | Baixo |

---