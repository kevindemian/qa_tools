# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### ARC-001 — Centralizar configuração (process.env → Config) (P2)

- **Contexto**: 150+ referências a `process.env.XXX` espalhadas por 15+ arquivos. Dificulta testar, rastrear e migrar para TS. Testes precisam mutar `process.env` globalmente.
- **Ação**: Criar `shared/config.js` com objeto `Config` que lê env vars uma vez. Substituir `process.env.JIRA_BASE_URL` por `Config.jiraBaseUrl`, etc.
- **Impacto**: Testes podem mockar `Config` em vez de poluir `process.env`. Reduz acoplamento global.
- **Estimativa**: 1-2h. Tocar após migração TS ou junto dela.

### ARC-011 — JiraResource coverage (Lote 4, P2)

- **Contexto**: `jira_resource.js` (~250 linhas, 8 métodos públicos, dependência crítica para 95% dos comandos) não possui testes unitários. MockRouter pattern já está implementado e validado pela Fase 7.
- **Ação**: Criar `jira_resource.test.js` com testes para: `getProjectId`, `getProjectVersions`, `updateFixVersions`, `getReleaseTasks`, `moveCardsToDone`, `releaseVersion`, `getIssueLinkTypes`, `getJiraResource` error handling.
- **Estimativa**: 2-3h. Postergado — não está no caminho crítico das demais melhorias. Bloqueios de CI e handler de erros já foram cobertos pelos Lotes 1-3.
- **Observação**: Precisa mockar `createHttpClient` e `axiosInstance`. Aproveitar padrão de mock de `handlers.test.js`. Pendente para próxima sessão.

### ARC-003 — Unificar sleep() (P3)

- **Contexto**: Após ARQ-006, `sleep()` de `shared/http-client.js` substituiu `delay()` nos módulos principais. Verificar se não há `new Promise(resolve => setTimeout(resolve, ms))` residual.
- **Ação**: Remover implementações duplicadas de sleep.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (P3)

- **Contexto**: Acentos PT-BR inconsistentes em strings de UI. Ex: "Variaveis", "criar-versão" (com acento) vs outros sem.
- **Arquivos**: `git_triggers/main.js:277,448`, `qatools.sh:72-74`, `jira_management/main.js:97`

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (P2)

**Contexto**: `tsconfig.json` usa `strict: false + strictNullChecks: true`. `strict: true` geraria 486 erros em 17 arquivos. Em vez de remar JSDoc, migrar para `.ts`. 8 camadas incrementais, bottom-up.

**Vantagens**: `import type`/`interface` nativos, sem `@template`/`@typedef` verboso, sem `@ts-check`, tooling superior, previne débito futuro na raiz.

**Distribuição de erros**: `create_tests.js` (109), `github_manager.js` (70), `gitlab_manager.js` (63), `main.js` (git_triggers, 55), `jira_resource.js` (43), `main.js` (jira_management, 42), `prompt.js` (24), `logger.js` (21), +9 arquivos menores (~59).

**Estimativa total**: ~12h. Não executável em sessão única. Cada layer vira commit separado para `git bisect`.

---

#### Setup Inicial (antes de Layer 0)

1. `npm i -D ts-jest @types/node @types/jest`

2. Criar `jest.config.ts`:
   ```ts
   import type { Config } from 'jest';
   const config: Config = {
     transform: { '^.+\\.ts$': 'ts-jest' },
     moduleFileExtensions: ['ts', 'js'],
     testMatch: ['**/*.test.ts', '**/*.test.js'],
   };
   export default config;
   ```

3. `tsconfig.json` manter `allowJs: true` durante migração. Só ativar `strict: true` no fim.

4. Remover `**/*.test.js` e `**/__tests__/**` do `exclude` no tsconfig (precisamos typecheck tests também).

5. **ESLint + TypeScript-ESLint**:
   ```bash
   npm i -D eslint @eslint/js typescript-eslint
   ```
   Criar `eslint.config.js`:
   ```js
   // @ts-check
   const eslint = require('@eslint/js');
   const tseslint = require('typescript-eslint');

   module.exports = tseslint.config(
     eslint.configs.recommended,
     ...tseslint.configs.recommendedTypeChecked,
     {
       languageOptions: {
         parserOptions: { project: './tsconfig.json' },
       },
       rules: {
         '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
         '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
         '@typescript-eslint/return-await': 'error',
         '@typescript-eslint/prefer-readonly': 'warn',
         'no-console': 'error',
         'no-throw-literal': 'error',
       },
     },
     { ignores: ['node_modules/', '**/*.js', 'e2e/'] }
   );
   ```
   Adicionar script no `package.json`: `"lint": "eslint . --ext .ts"`.

6. **Prettier** (formatação automática):
   ```bash
   npm i -D prettier eslint-config-prettier
   ```
   Criar `.prettierrc`:
   ```json
   {
     "semi": true,
     "singleQuote": true,
     "trailingComma": "all",
     "printWidth": 120,
     "tabWidth": 4,
     "arrowParens": "always"
   }
   ```
   Adicionar `eslint-config-prettier` ao final do array de configs do ESLint (deve ser o último):
   ```js
   const prettier = require('eslint-config-prettier');
   // ... no final do array de configs:
   prettier,
   ```

7. **Husky + lint-staged** (pre-commit hook):
   ```bash
   npm i -D husky lint-staged
   npx husky init
   ```
   Editar `.husky/pre-commit`:
   ```bash
   npx lint-staged
   ```
   Adicionar no `package.json`:
   ```json
   "lint-staged": {
     "*.ts": ["eslint --fix", "prettier --write"],
     "*.js": ["prettier --write"]
   }
   ```
   Adicionar script: `"prepare": "husky"`.

8. Scripts `package.json` atualizados:
   ```json
   {
     "scripts": {
       "setup": "bash setup.sh",
       "test": "jest",
       "typecheck": "tsc",
       "lint": "eslint . --ext .ts",
       "format": "prettier --write '**/*.{ts,js,json,md}'",
       "prepare": "husky"
     }
   }
   ```

9. CI `.github/workflows/ci.yml` — adicionar step de lint:
   ```yaml
   - run: npm run lint
   ```

---

#### Ordem de Migração (Foundation → Leaf)

```
Layer 0: shared/types.ts                  — interfaces puras
Layer 1: shared/*.ts (7 arquivos)         — prompt, logger, cli_base, state, http-client, result_parser, tls
Layer 2: shared/session-context.ts         — depende de Layer 1
Layer 3: jira_management/ (5 arquivos)    — jira_resource, csv_resource, cypress_resource, jira_validator, cypress_test
Layer 4: jira_management/ (3 arquivos)    — jira_link_manager, package_version_manager, result_reporter
Layer 5: jira_management/commands/* (17)  — handlers + context + index
Layer 6: jira_management/create_tests.ts   — maior arquivo (732 linhas, 109 erros)
Layer 7: jira_management/main.ts          — entry point
Layer 8: git_triggers/* (5 arquivos)      — github_manager, gitlab_manager, nivelar, main
```

---

### Layer 0: shared/types.ts

**Ação**: Renomear `shared/types.js` → `shared/types.ts`. Substituir `@typedef` por `interface`/`type` nativos.

**Mapping**:
| JSDoc | TypeScript |
|-------|-----------|
| `@typedef {Object} TestResult` | `interface TestResult { status: 'ok' \| 'error'; label: string; message: string }` |
| `@typedef {Object} TestStep` | `interface TestStep { fields: { Action?: string; Data?: string; ExpectedResult?: string } }` |
| `@typedef {Object} TestCase` | `interface TestCase { title: string; description?: string; steps: TestStep[]; precondition?: { type: 'inline' \| 'reference'; value: string }; group?: string; linkedIssues?: Array<{ key: string; linkType: string }> }` |
| `@typedef {Object} JiraIssue` | `interface JiraIssue { key: string; fields: { description?: string; summary?: string; project?: { key: string }; issuetype?: { name: string }; labels?: string[] } }` |
| `@typedef {Object} StateSchema` | `interface StateSchema { lastChoice?: string; lastProject?: string; ... }` |
| `@typedef {Object} ApiConfig` | `interface ApiConfig { baseUrl: string; token: string; logger?: Logger }` |
| `@typedef {Object} GitProvider` | `interface GitProvider { provider: 'gitlab' \| 'github'; triggerPipeline(...): Promise<...>; ... }` (15 métodos) |

**Adicionar (novos)**:
- `interface JiraIssueLinkType { id: string; name: string; inward: string; outward: string }`
- `interface ProjectVersion { id: string; name: string; released: boolean; ... }`
- `class JiraResourceError extends Error { status?: number; resource?: string }`
- `type SearchResult = { issues: JiraIssue[]; total: number }`

**Testes**: Nenhum (só tipos). Rodar `tsc --noEmit` + verificar imports tipo-only.

---

### Regras硬 (Hard Rules) — Obrigatórias por Layer

#### R1: Obrigação de Testes Unitários

| Item | Regra | Verificação |
|------|-------|-------------|
| R1.1 | Cada método público de classe OU função exportada deve ter ≥1 teste | `grep -rn "it("` + `grep -rn "\.exports"` — comparar |
| R1.2 | Nenhum `.ts` mergeado sem `source.test.ts` correspondente | CI falha se test file ausente |
| R1.3 | Cobertura mínima por teste: fluxo feliz + fluxo de erro + edge case (null/undefined/empty) | 3 cenários por método |
| R1.4 | Mocks tipados: `jest.mocked(Class)` ou `jest.Mocked<Interface>` | `tsc --noEmit` nos testes |
| R1.5 | Testes HTTP usam nock ou mock de axiosInstance. Separação: `*.test.ts` (unit) vs `*.integration.test.ts` (nock) | Sem chamada HTTP real em testes |
| R1.6 | Coverage mínimo por arquivo: 70% lines, 60% branches | `jest --coverage` opcional, verificar em PR |

**Sanção**: PR que adiciona método sem teste é rejeitado no code review.

#### R2: SOLID Obrigatório

| Princípio | Aplicação | Verificação |
|-----------|-----------|-------------|
| **SRP** | `create_tests.js` (732 linhas) DEVE ser quebrado durante migração. Extrair: `CsvImporter`, `TestCaseFactory`, `IssueLinker`, `TestExecutionCreator` | Cada classe ≤200 linhas. Se >300, refatorar |
| **OCP** | `GitProvider` interface aberta para extensão, fechada para modificação | Novos providers implementam interface, não herdam classe |
| **LSP** | `GitHubManager` e `GitLabManager` implementam `GitProvider`. Nenhum pode ter `throw new Error('not implemented')`. | Todos métodos da interface têm implementação |
| **ISP** | `GitProvider` (15 métodos) é OK pois ambas implementações usam todos. Se criar interfaces menores (`PipelineProvider`, `MRProvider`), avaliar custo-benefício. | Nenhuma classe depende de método que não usa |
| **DIP** | Módulos de alto nível (handlers, create_tests) NÃO instanciam `JiraResource`. Recebem por constructor/parâmetro. | `new JiraResource(...)` só em entry points (`main.ts`) |

**Sanção**: Handler que faça `new JiraResource(...)` ou `new JiraLinkManager(...)` internamente = violação de DIP. Rejeitar.

#### R3: Design Patterns Obrigatórios

| Pattern | Onde | Regra |
|---------|------|-------|
| **Repository** | `JiraResource` | Único módulo que acessa Jira REST API. Nenhum outro faz HTTP direto para Jira. |
| **Factory** | `git_triggers/main.ts` | Seleciona `GitHubManager` vs `GitLabManager` por config de provider. |
| **Strategy** | `commands/` | 16 handlers, mesma interface `(ctx: CommandContext) => Promise<boolean>`. Manter. |
| **Dependency Injection** | Toda classe com dependência externa | Constructor recebe dependências. Proibido `new` interno (exceto value objects). |
| **Value Object** | `JiraIssueLinkType`, `ProjectVersion`, `TestStep` | Imutáveis, só dados. Sem comportamento. |
| **Error as Class** | `JiraResourceError extends Error` | Proibido `throw 'string'` ou `throw { message }`. Toda exceção = instância de `Error`. |

**Regra de ouro**: `grep -rn "throw '"` + `grep -rn 'throw "'` — **zero ocorrências** no código de produção.

#### R4: Clean Code / Boas Práticas

| Regra | Descrição |
|-------|-----------|
| **Nomes** | `getProjectId()` e não `getprojID()`. Inglês consistente. |
| **Funções pequenas** | Nenhuma função >50 linhas. Se >50, extrair helper nomeado. |
| **Early return** | Guard clauses no topo para null/undefined/invalid input. |
| **Async/await** | Preferir sobre `.then()/.catch()`. `try/catch` para tratamento de erro. |
| **No magic numbers** | `MAX_RETRIES = 5`, não `5` solto no código. |
| **No console.log** | Proibido em produção. Usar `Logger` ou `prompt.print()`. |
| **Tipos explícitos** | Nenhum `any` ou `as any` sem comentário `// eslint-disable-next-line @typescript-eslint/no-explicit-any — <motivo>`. |
| **Null vs undefined** | `null` = ausência intencional, `undefined` = não definido. Consistente. |
| **Readonly** | Campos de constructor que não mudam → `readonly`. |
| **Private/Protected** | Métodos internos → `private`. Métodos de herança → `protected`. |
| **No cyclical requires** | `session-context.ts` faz `require` dinâmico dentro de método para evitar circular. Manter como `require()` com `typeof import(...)`. |

#### R5: Error Handling Pattern

```
Fluxo de leitura (GET/search):
  logError + return [] | null | {}

Fluxo de escrita (POST/PUT/DELETE):
  logError + throw new SpecificError()

Handlers (commands/):
  try/catch → printError() + return false (nunca deixa exceção escapar)
```

**Verificação**: Nenhum método `get*` ou `search*` pode `throw`. Nenhum método `create*`, `update*`, `delete*` pode `return` silencioso em caso de erro de escrita.

#### R6: Pipeline de Verificação por Layer

Cada layer, antes de ser considerado "concluído":

```bash
# 1. Type check — 0 errors
npx tsc --noEmit

# 2. Testes da camada — 100% pass
npx jest shared/logger.test.ts --no-coverage

# 3. Testes globais — nada quebrou
npx jest --no-coverage

# 4. Regras automáticas
grep -rn "throw '" shared/ jira_management/ git_triggers/   # zero
grep -rn ".only(" **/*.test.ts                               # zero (no test exclusivo)
```

#### R7: Estratégia de Commit

Cada layer = commit separado:

```
feat(ts): add shared/types.ts with all interfaces
feat(ts): migrate shared/ foundation modules (.js→.ts)
feat(ts): migrate shared/session-context.ts
feat(ts): migrate jira_management/ resource layer
feat(ts): migrate jira_management/ service layer
feat(ts): migrate jira_management/commands
feat(ts): migrate jira_management/create_tests.ts (break into sub-classes)
feat(ts): migrate jira_management/main.ts
feat(ts): migrate git_triggers/
chore(ts): enable strict:true, remove allowJs
```

#### R8: Regra de Ouro — Não Começar sem Certeza de Término

Cada layer é um commit atômico. Se não puder terminar o layer inteiro (todos arquivos + testes + `tsc --noEmit` + `jest` passando), **não comece**.

**R8.1 — Critério de início**: Só iniciar um layer se houver tempo disponível para completá-lo. Base:
- Layer 0 (types): ~10min
- Layer 1 (shared): ~1h
- Layer 2 (session-context): ~15min
- Layer 3 (jira_resource + csv + cypress): ~1.5h
- Layer 4 (link_manager + pkg_version + reporter): ~1h
- Layer 5 (commands/): ~1.5h
- Layer 6 (create_tests): ~2h (maior risco)
- Layer 7 (main): ~1h
- Layer 8 (git_triggers): ~3h (maior risco)
- Config final: ~30min

Se o tempo disponível for menor que a estimativa, não inicie o layer.

**R8.2 — Se encontrar surpresa no meio do layer**:
1. PARE imediatamente
2. `git diff` para entender o que mudou
3. Se houver arquivos `.ts` parciais: `git checkout -- <arquivo>` (descarta mudanças)
4. Se houver testes `.ts` parciais: `git checkout -- <teste>`
5. Documente a surpresa como comentário no BACKLOG.md (abaixo da entrada do layer)
6. **NUNCA** commitar um layer incompleto. Commits parciais quebram `git bisect` e impedem rollback limpo.

**R8.3 — Se um layer quebrou testes existentes**:
1. NÃO tente "consertar depois". Reverta o commit do layer.
2. `git revert HEAD` se já commitou. `git checkout -- .` se não.
3. Analise por que quebrou: erro de tipo, mudança de assinatura, mock desatualizado.
4. Documente a causa no BACKLOG.md.
5. Só tente de novo após entender a causa raiz.

**R8.4 — Fallback padrão**: Se qualquer layer falhar no pipeline de verificação (R6):
```bash
# Se já commitou:
git revert HEAD --no-edit
git push

# Se ainda não commitou:
git checkout -- shared/ jira_management/ git_triggers/
git clean -fd
```

Isso restaura o estado anterior. O trabalho perdido é só o tempo gasto — não há risco de repositório quebrado.

**R8.5 — Estado intermediário proibido**: Em nenhum momento pode haver:
- `.ts` e `.js` coexistindo para o **mesmo** módulo (ex: `logger.js` + `logger.ts`)
- Teste `.ts` sem fonte `.ts` correspondente (ex: `logger.test.ts` testando `logger.js`)
- `tsc --noEmit` com erros >0 em arquivos já migrados (erros em `.js` remanescentes são tolerados até a migração deles)

**R8.6 — Stash para trabalho interrompido**: Se absolutamente preciso interromper no meio:
```bash
git add -A
git stash push -m "ts-migration-WIP: layer-1 (incomplete)"
# Depois:
git stash pop
# Verificar: tsc --noEmit + jest antes de continuar
```
Mas isto é exceção. A regra é: não comece se não puder terminar.

---

### Detalhamento por Layer

#### Layer 1: shared/*.ts (7 arquivos)

Ordem (dependências mínimas primeiro):

| Arquivo | Linhas | Erros TS | Dependências |
|---------|--------|----------|-------------|
| `logger.ts` | 171 | 21 | `fs`, `path`, `os` |
| `http-client.ts` | 62 | 0 | `axios` |
| `prompt.ts` | 380 | 24 | `readline-sync`, `@inquirer/*` |
| `cli_base.ts` | 86 | 0 | `prompt`, `logger` |
| `state.ts` | 86 | 0 | `fs` |
| `result_parser.ts` | 79 | 0 | — |
| `tls.ts` | 9 | 0 | `tls` |

**Atenção**: `prompt.ts` depende de `readline-sync` sem tipos. Criar `shared/types/readline-sync.d.ts`:
```ts
declare module 'readline-sync' {
  export function question(query?: string, options?: { hideEchoBack?: boolean }): string;
  export function keyInYN(query?: string): boolean;
  export function keyInSelect(items: string[], query?: string): number;
}
```

#### Layer 3: jira_management/jira_resource.ts (386 linhas, 43 erros)

**Pontos críticos**:
- `getJiraResource<T = any>(resource: string): Promise<T>` — usar generics
- `searchJiraIssues` retorna `SearchResult` (interface em types.ts)
- `JiraResourceError class extends Error { status?: number; resource?: string; body?: any }`
- Mapper: `getTransitionsForIssue` retorna `Record<string, string>` (nome → id)
- `updateFixVersions` payload já é tipado por Jira API

#### Layer 5: jira_management/commands/ (17 arquivos)

- `context.ts` → `interface CommandContext` em vez de JSDoc `@typedef`
- Cada handler: `function handler(c: CommandContext): Promise<boolean>`
- `index.ts`: `handlers: Record<string, (ctx: CommandContext) => Promise<boolean>>`

#### Layer 6: jira_management/create_tests.ts (732 linhas, 109 erros)

**Obrigatório quebrar SRP durante migração**:

| Classe extraída | Responsabilidade | Métodos |
|-----------------|------------------|---------|
| `CsvImporter` | Parse CSV → `TestCase[]` | `import(path: string): TestCase[]` |
| `TestCaseFactory` | Criar issues Jira para test cases | `create(projectKey: string, testCase: TestCase): Promise<JiraIssue>` |
| `IssueLinker` | Gerenciar links entre issues | `link(source: string, targets: LinkTarget[]): Promise<void>` |
| `TestExecutionCreator` | Criar Test Execution + associar testes | `create(projectKey: string, testKeys: string[], ...): Promise<JiraIssue>` |
| `PreconditionAssociator` | Associar pre-conditions a testes | `associate(testKey: string, preconditionKey: string): Promise<void>` |

O `create_tests.ts` original pode manter `createTestsFromCsv`, `createTestsFromJson` como funções orquestradoras que delegam para as classes acima.

#### Layer 8: git_triggers/*.ts

| Arquivo | Linhas | Erros TS | Observação |
|---------|--------|----------|------------|
| `github_manager.ts` | 329 | 70 | `class GitHubManager implements GitProvider` |
| `gitlab_manager.ts` | 205 | 63 | `class GitLabManager implements GitProvider` |
| `nivelar.ts` | ~80 | 0 | |
| `main.ts` | 686 | 55 | Entry point, factory |

**Atenção**: `GitProvider` tem 15 métodos. `GitHubManager` e `GitLabManager` implementam todos. Garantir que tipos dos parâmetros e retornos sejam consistentes entre as duas implementações. `isApproved()` no GitHub retorna boolean; no GitLab também. Consistente.

---

### Configuração Final (após migração completa)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "node16",
    "moduleResolution": "node16",
    "allowJs": false,
    "checkJs": false,
    "noEmit": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["shared/**/*.ts", "jira_management/**/*.ts", "git_triggers/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Remover `allowJs: true` — só `.ts`. Ativar `strict: true`. CI roda `npx tsc --noEmit` + `npx jest`.

---

### Armadilhas Conhecidas

1. **`readline-sync` sem tipos** → `declare module` local (Layer 1)
2. **axios `Response<T>` genérico** → `await this.axiosInstance.get<T>(url)` → `const { data } = response` tipado
3. **`require()` dinâmico anti-circular** (`session-context` → `prompt`) → manter `require()` com `typeof import('./prompt').withSpinner`
4. **`@ts-check` + `.ts` coexistindo** → JSDoc em `.js` pode referenciar tipos de `.ts` via `import('./types').JiraIssue`
5. **`jest.mock()` com `.ts`** → `jest.mock('../../shared/logger')` resolve sem extensão (ts-jest cuida disso)
6. **`override` keyword** → Se método sobrescreve superclasse, usar `override` (ES2020+). `tsconfig` já target ES2020.
7. **Jest globals no tsconfig** → `npx tsc --noEmit` nos testes exige `@types/jest` instalado.
8. **`module.exports` vs `export`** → Durante migração incremental, manter `module.exports = { ... }` em `.ts` files para compatibilidade com `require()` dos `.js` remanescentes. Só converter tudo para `import`/`export` no fim (R7 último commit).

---

### Checklist de Conclusão (pós-Layer 8 + config final)

- [ ] `npx tsc --noEmit` = 0 errors com `strict: true`
- [ ] `npx jest --no-coverage` = mesmos testes passando que pré-migração
- [ ] `grep -rn "throw '"` + `grep -rn 'throw "'` = 0 ocorrências
- [ ] `grep -rn ".only("` = 0 ocorrências
- [ ] Nenhum `any` sem comentário de justificativa
- [ ] `create_tests.ts` ≤300 linhas (refatorado em sub-classes)
- [ ] Cobertura mínima 70% lines por arquivo
- [ ] `allowJs: false`, `strict: true` no tsconfig
- [ ] `jest.config.ts` com `ts-jest`
- [ ] Todos arquivos `.js` removidos do `include` no tsconfig

---

## Resolvidos

Estes foram resolvidos durante a sessão de refatoração de Maio/2026:

### ARC-002 (CONCLUÍDO)

- **Ação**: `console.log` migrado para `print()` de `shared/prompt.js` em:
  - `jira_management/commands/case04.js` (4 usos)
  - `jira_management/create_tests.js` (2 usos)
  - `shared/cli_base.js` (4 usos em `printSessionSummary`)
- **Testes**: Mocks atualizados em `handlers.test.js`, `create_tests.test.js`. 295+ testes passando.
- **Observação**: `e2e/real-import.js` mantido como está — script standalone de baixa prioridade.

### ARQ-001 (CONCLUÍDO)

- **Ação**: `shared/session-context.js` criado com class `SessionContext` (métodos: `resetResults()`, `withBusy()`, `pushHistory()`, `buildContextLine()`). `git_triggers/main.js` e `jira_management/main.js` refatorados para usar a classe.
- **Testes**: `shared/session-context.test.js` — 6 testes unitários.

### ARQ-002 (CONCLUÍDO)

- **Ação**: `withSpinner(label, fn)` exportado de `shared/prompt.js`. 12 usos manuais de `new Spinner()` substituídos em `git_triggers/main.js` (9), `git_triggers/nivelar.js` (2) e `jira_management/create_tests.js` (1). `session-context.withBusy(label)` delega para `withSpinner`.
- **Testes**: Mocks atualizados.

### ARQ-003 (CONCLUÍDO)

- **Ação**: Helpers `_get/_post/_put/_patch` + `handleError()` em `gitlab_manager.js` e `github_manager.js`. Erro logging centralizado, ~45 linhas economizadas.
- **Testes**: 86 testes passando nos 3 arquivos.

### ARQ-004 (CONCLUÍDO)

- **Ação**: `sleep(ms)` exportado via `module.exports = { createHttpClient, sleep }`.

### ARQ-006 (CONCLUÍDO)

- **Ação**: `delay()` removido de `git_triggers/main.js` e `jira_management/create_tests.js`. Substituído por `sleep()` de `shared/http-client.js`.

### ARQ-007 (CONCLUÍDO)

- **Ação**: `_resolveGlob(pattern)` em `git_triggers/main.js` substituído por `glob.sync(pattern)`.

### ARQ-008 (CONCLUÍDO)

- **Ação**: `parseMochawesome` e `matchResultsToTests` já estavam em módulos compartilhados (`shared/result_parser.js`, `jira_management/result_reporter.js`). Zero duplicação.

### ARQ-009 (CONCLUÍDO)

- **Ação**: Todos os calls de `withBusy` em `jira_management/main.js` já possuíam label.

### ARQ-010 (CONCLUÍDO)

- **Ação**: Teste adicionado para `withSpinner` em modo quiet (`shared/prompt.test.js`).

### UX-001 (CONCLUÍDO)

- **Ação**: `_createTestsFromTestCases` já utiliza `ProgressBar` para feedback visual durante CSV/JSON import.

### UX-002 (CONCLUÍDO)

- **Ação**: Ambos `jira_management/main.js` e `git_triggers/main.js` já chamam `setupSigint` antes do `while(true)`.

### TS-002 + ARQ-005 (CONCLUÍDO)

- **Ação**: 16 handlers extraídos de `jira_management/main.js` para `jira_management/commands/`. `main.js` delegado via `commands/index.js`. Testes criados para handlers críticos (1, 4, 7, 8, 15).

### TS-003 (CONCLUÍDO)

- **Ação**: `getJiraResource()` alterado para lançar `JiraResourceError` em vez de retornar `null`. 24 callers atualizados.

---

## Legado (pré-refatoração)

Estes existiam antes das nossas alterações e não foram tratados (serão resolvidos pela migração TS):

- `jira_management/create_tests.js`: 109 erros TS
- `git_triggers/github_manager.js`: 70 erros TS
- `git_triggers/gitlab_manager.js`: 63 erros TS
- `shared/logger.js`: `_logDir` com inferência cíclica (linha 33)
- `shared/prompt.js`: módulo `readline-sync` sem tipos
- `shared/result_parser.js`: propriedades de objeto sem declaração
