# Multi-Projeto — Suporte a Múltiplos Projetos (v1)

> **SUPERSEDED** por `.mimocode/plans/multi-project-support-RECONCILED.md` (v2, CLOSED).
> v1 é histórico/exploratório. O plano finalizado com todas as decisões (D1–D3, D-U1–D-U4, D-E1–D-E3) e correções de reconcilação está em v2. Use v2 como fonte de verdade para implementação.

## Registro de Progresso

> **Documento de progresso:** `audit/functional/PROGRESS-MULTI-PROJECT.md`
>
> Ao iniciar uma nova sessão, ler esse documento para retomar de onde parou.
> Ao finalizar cada tarefa, atualizar o status no documento de progresso.

## Visão

Implementar suporte completo a múltiplos projetos gerenciados por uma única instalação do QA Tools. O sistema passa a operar com um **registry centralizado** (`~/.config/qa-tools/projects.json`) que aponta para diretórios arbitrários no disco. Cada projeto gera relatórios no seu próprio diretório, mantém state isolado, e é selecionado em um **menu inicial único** antes de entrar nos módulos Jira ou Git. Projetos existentes são migrados automaticamente. Backward compatibility é preservada — sem projeto selecionado, o sistema opera como hoje.

## Contexto

O QA Tools atual gerencia múltiplos projetos, mas todos compartilham o mesmo `.env`, state, logs e diretório de relatórios. Os config files (`projects.json`, `providers.json`) vivem na árvore de código-fonte. Em produção, o QA Tools precisa gerenciar projetos em diversas pastas espalhadas pelo disco, cada um com seu próprio contexto.

## Pesquisa de Mercado — Padrões Ouro

### Ferramentas Analisadas

| Ferramenta | Categoria | Padrão Principal |
|---|---|---|
| **VS Code** | IDE | Multi-root workspace: `.code-workspace` lista pastas com paths |
| **Docker Compose** | Container orchestration | Project name isola recursos (containers, networks, volumes) |
| **Moon** | Monorepo tool | `.moon/workspace.yml` com globs para auto-detecção |
| **Nx** | Monorepo tool | `project.json` por projeto + `nx.json` global |
| **Turborepo** | Build system | `turbo.json` global + `package.json` por workspace |
| **Allure** | Test reporting | Resultados por projeto + aggregate report |
| **Lerna** | Package management | `--scope`, `--since`, `--include-dependencies` |
| **ReportPortal** | Test dashboard | Projetos independentes, sem cross-project view |

### Padrões Adotados

**1. VS Code-style workspace (ALTA relevância)**
- Cada projeto é uma "past root" com config independente
- Workspace file lista projetos com paths
- Settings podem ser globais ou por pasta
- **Nosso equivalente:** `~/.config/qa-tools/projects.json` como workspace file

**2. Docker Compose-style isolation (ALTA relevância)**
- Project name isola todos os recursos (containers, networks, volumes)
- Mesmo compose file pode rodar múltiplas instâncias
- Override files para ambientes diferentes
- **Nosso equivalente:** `QA_CURRENT_PROJECT` isola state, reports, logs

**3. Allure-style reports (ALTA relevância)**
- Cada projeto gera seus resultados em diretório próprio
- Aggregate report combina resultados de múltiplos projetos
- Plugin system permite extensão
- **Nosso equivalente:** `<projectDir>/reports/` + futuro aggregate dashboard

**4. Moon-style auto-discovery (MÉDIA relevância)**
- Globs detectam projetos automaticamente
- `moon.yml` por projeto configura tasks/metadata
- Tags agrupam projetos para filtering
- **Nosso equivalente:** Setup wizard pode detectar projetos via globs

**5. Lerna-style filtering (MÉDIA relevância)**
- `--scope <glob>` filtra projetos por nome
- `--since <ref>` filtra projetos alterados
- `--include-dependencies` inclui dependências transitivas
- **Nosso equivalente:** Batch mode pode operar em múltiplos projetos

### Padrões Recusados

**ReportPortal — Sem cross-project view**
- Cada projeto é independente, sem dashboard consolidado
- Limitação documentada: "no single dashboard for several projects"
- **Por que recusar:** Queremos capacidade de agregar métricas cross-project

**Nx complex project graph**
- Projetos têm dependências entre si (monorepo)
- Task pipelines coordenam builds
- **Por que recusar:** Nossos projetos são independentes, não um monorepo

### Diferença Crítica: QA Tools vs Monorepo

| Aspecto | Monorepo (Nx, Turborepo) | QA Tools |
|---|---|---|
| Projetos | No mesmo repo | Em pastas diferentes do disco |
| Dependências | Projetos dependem uns dos outros | Projetos são independentes |
| Build | Coordenação entre projetos | Cada projeto é autônomo |
| Config | `project.json` + `nx.json` | `ProjectEntry` + env vars |
| Filtering | `--scope`, `--since` | Seleção no menu |

**Conclusão:** Nosso caso é mais próximo de **Docker Compose** (múltiplos serviços independentes, cada um com sua config, isolados por project name) combinado com **VS Code multi-root workspaces** (múltiplos projetos, cada um com suas settings, gerenciados de um workspace).

## Arquitetura Alvo

```
~/.config/qa-tools/                              # XDG config home
├── projects.json                                # Registry: projeto → metadata
│   { "ibabs": { "name", "dir", "provider", "projectId", "jiraKey", "framework", "features" } }
└── (futuro: config.json global)

shared/
├── project-registry.ts                          # NOVO — CRUD do registry + validação de diretório
├── project-context.ts                           # NOVO — contexto do projeto atual
├── types/
│   └── project.ts                               # NOVO — tipos ProjectEntry, ProjectRegistry
├── config-schema.ts                             # EXISTENTE — +2 env vars
├── types/common.ts                              # EXISTENTE — +ConfigOverrides
├── temp-dir.ts                                  # EXISTENTE — reportsDir() usa project context
├── state.ts                                     # EXISTENTE — state por projeto
├── entry-menu.ts                                # EXISTENTE — seleção de projeto
├── report-html.ts                               # EXISTENTE — +meta qa-project
├── __tests__/
│   ├── project-registry.test.ts                 # NOVO
│   ├── project-registry.property.test.ts        # NOVO
│   └── project-context.test.ts                  # NOVO

git_triggers/
├── main.ts                                      # EXISTENTE — +--project flag
├── session-state.ts                             # EXISTENTE — lê de registry
├── interactive-mode.ts                          # EXISTENTE — usa project context
├── batch-mode.ts                                # EXISTENTE — usa project context
└── schedule-handler.ts                          # EXISTENTE — usa project context

jira_management/
└── main.ts                                      # EXISTENTE — +--project flag, usa project context

setup/
├── main.ts                                      # EXISTENTE — aceita --dir, registra projeto
└── config-writer.ts                             # EXISTENTE — escreve no registry
```

## Regras ESLint Críticas (Bloqueiam Commit)

| Regra                                      | Severidade | Solução                                |
| ------------------------------------------ | ---------- | -------------------------------------- |
| `@typescript-eslint/no-non-null-assertion` | error      | Extrair variável + `?.`                |
| `@typescript-eslint/unbound-method`        | error      | Factory mock com referência separada   |
| `sonarjs/cognitive-complexity`             | error      | Extrair métodos (limite: 15)           |
| `vitest/padding-around-all`                | error      | Linha em branco antes de cada `expect` |
| `vitest/prefer-strict-equal`               | error      | Usar `toStrictEqual`                   |
| `sonarjs/publicly-writable-directories`    | error      | Evitar `/tmp` em testes                |

## Padrões Rejeitados pelo Pre-commit

| Padrão           | Motivo       |
| ---------------- | ------------ |
| `eslint-disable` | Hook rejeita |
| type-cast-unknown | Hook rejeita |
| `@ts-ignore`     | Hook rejeita |

---

## Convenções de Teste (Obrigatórias)

### Cada tarefa de lógica inclui:

| Tipo         | Arquivo                                                     | Padrão                                               |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Unitário** | `shared/__tests__/<modulo>.test.ts`                         | `describe/it` com fixtures, `expect.hasAssertions()` |
| **PBT**      | `shared/__tests__/<modulo>.property.test.ts`                | `fc.assert(fc.property(...))` com `{ numRuns: 100 }` |

### Coverage thresholds (vitest.config.ts):

| Métrica    | Threshold |
| ---------- | --------- |
| Lines      | 90%       |
| Functions  | 91%       |
| Branches   | 80%       |
| Statements | 90%       |

### Padrão de Extração (Obrigatório)

```typescript
// ❌ ERRADO — viola no-non-null-assertion
expect(result.coverage!.percentage).toBe(80);

// ✅ CORRETO — extrair variável
const coverage = result.coverage;
expect(coverage?.percentage).toBe(80);
```

### Padrão de Mock (Obrigatório)

```typescript
// ❌ ERRADO — viola unbound-method
vi.mocked(obj.method).mockResolvedValue(...);

// ✅ CORRETO — factory com referência separada
const methodMock = vi.fn();
const mock = { method: methodMock };
```

### Padrão de Assert (Obrigatório)

```typescript
// ❌ ERRADO — viola vitest/prefer-strict-equal
expect(result.labels).toEqual(['critical']);

// ✅ CORRETO
expect(result.labels).toStrictEqual(['critical']);
```

### Padrão de Padding (Obrigatório)

```typescript
// ❌ ERRADO — viola vitest/padding-around-all
expect(result.a).toBeDefined();
expect(result.b).toBe(1);

// ✅ CORRETO — linha em branco antes de cada expect
expect(result.a).toBeDefined();

expect(result.b).toBe(1);
```

---

## Pré-Voo — Fase 0

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 0 — Fundação (Tarefas 001-006)

Sem testes — tipos puros, excluídos de coverage (`**/types/**`).

| ID  | Tarefa                                                                  | Arquivo(s)                                  | Critério             |
| --- | ----------------------------------------------------------------------- | ------------------------------------------- | -------------------- |
| 001 | Criar `shared/types/project.ts` com `ProjectEntry`, `ProjectRegistry`   | NOVO                                        | `tsc --noEmit` passa |
| 002 | Adicionar `qaCurrentProject`, `qaProjectDir` ao `CONFIG_SCHEMA`         | `shared/config-schema.ts` (EXISTENTE)       | `tsc --noEmit` passa |
| 003 | Adicionar props nomeadas em `ConfigOverrides`                           | `shared/types/common.ts` (EXISTENTE)        | `tsc --noEmit` passa |
| 004 | Barrel em `shared/types.ts`                                             | `shared/types.ts` (EXISTENTE)               | Import funciona      |
| 005 | Criar estrutura de diretórios `shared/__tests__/` (se não existir)      | `shared/__tests__/`                         | Diretórios existem   |
| 006 | Adicionar `<meta name="qa-project"> em relatórios HTML                  | `shared/report-html.ts` (EXISTENTE)         | Meta tag presente    |

### 006 — Metadata `qa-project` em Relatórios HTML

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/report-html.ts` (EXISTENTE)                                                               |
| **Ação**           | Adicionar `<meta name="qa-project" content="${projectName}">` no `<head>` de todos os relatórios HTML gerados |
| **Propósito**      | Facilitar aggregate reports no futuro — metadado permite filtrar/agregar por projeto sem parsing complexo |
| **Custo**          | Marginal — 1 linha de template                                                                     |
| **Teste unitário** | Verificar que meta tag está presente no HTML gerado                                                |
| **Critério**       | `tsc --noEmit` passa. Meta tag presente em todos os HTML generators.                               |

**Checkpoint:** `npx tsc --noEmit` = 0 erros. Meta tag `qa-project` presente em todos os HTML.
**Commit:** `feat(multi-project): add foundation types, config schema, and project metadata in HTML reports`

---

## Pré-Voo — Fase 1

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### TypeScript Strict

| Flag                         | Impacto                                        |
| ---------------------------- | ---------------------------------------------- | ---------- |
| `exactOptionalPropertyTypes` | Não usar `prop: undefined`, omitir propriedade |
| `noUncheckedIndexedAccess`   | Array access retorna `T                        | undefined` |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 1 — Project Registry (Tarefas 010-014)

### 010 — Project Registry CRUD

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/project-registry.ts` (NOVO)                                                               |
| **Funções**        | `loadRegistry()`, `saveRegistry()`, `addProject(entry)`, `removeProject(name)`, `updateProject(name, patch)`, `listProjects()`, `getProject(name)` |
| **Responsabilidade** | CRUD completo do `~/.config/qa-tools/projects.json` — leitura, escrita, merge, backup            |
| **Path resolution**| `~/.config/qa-tools/projects.json` via `process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config', 'qa-tools', 'projects.json')` |
| **Backup**         | `projects.json.bak` escrito a cada `saveRegistry()`                                                |
| **Validação**      | Valida contra `ProjectRegistrySchema` (Zod) antes de salvar                                        |
| **Idempotência**   | `addProject()` com nome existente → atualiza em vez de duplicar                                    |
| **Teste unitário** | `shared/__tests__/project-registry.test.ts` — 8 cenários: load vazio, add, remove, update, list, duplicate, invalid, backup recovery |
| **PBT**            | `shared/__tests__/project-registry.property.test.ts` — round-trip add→get preserva dados, list sempre retorna array |
| **Critério**       | `npx vitest run shared/__tests__/project-registry` = 100% pass                                    |

### 011 — Migration de config/projects.json

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/project-registry.ts` (adicional ao 010)                                                    |
| **Função**         | `migrateFromLegacyConfig()` — lê `config/projects.json` + `config/providers.json`, converte para formato `ProjectRegistry`, registra no XDG |
| **Idempotência**   | Se `~/.config/qa-tools/projects.json` já existe e tem projetos → não migra                         |
| **Backup**         | Cria backup dos arquivos legados antes de migrar                                                   |
| **Teste unitário** | 4 cenários: migração limpa, skip se já existe, merge com existente, arquivo legado corrompido     |
| **Critério**       | `npx vitest run shared/__tests__/project-registry` = 100% pass                                    |

### 012 — Barrel

| Item         | Conteúdo                                           |
| ------------ | -------------------------------------------------- |
| **Arquivo**  | `shared/project-registry.ts`                       |
| **Ação**     | Exporta todas as funções públicas                   |
| **Critério** | `tsc --noEmit` passa                               |

### 013 — Suite de Integração Registry

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/project-registry.integration.test.ts`   |
| **Testes**  | Fluxo completo: criar registry → adicionar 3 projetos → persistir → recarregar → verificar integridade |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 1:** `npx vitest run shared/__tests__/project-registry*` = 100%. Coverage ≥ 90%.
**Commit:** `feat(multi-project): add project registry with CRUD, migration, and backup`

---

## Pré-Voo — Fase 2

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 2 — Project Context (Tarefas 020-023)

### 020 — Project Context

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/project-context.ts` (NOVO)                                                                |
| **Funções**        | `getCurrentProject()`, `getCurrentProjectDir()`, `setCurrentProject(name)`, `clearCurrentProject()`, `isProjectSelected()` |
| **Responsabilidade** | Gerencia o projeto ativo na sessão atual via env vars (`QA_CURRENT_PROJECT`, `QA_PROJECT_DIR`)  |
| **Fallback**       | Se nenhuma env var → retorna `undefined` (modo legado)                                             |
| **Lazy resolution**| `getCurrentProjectDir()` busca do registry se `QA_PROJECT_DIR` não está definido                    |
| **Teste unitário** | `shared/__tests__/project-context.test.ts` — 6 cenários: no project, set/get, clear, dir resolution, env var priority |
| **Critério**       | `npx vitest run shared/__tests__/project-context` = 100% pass                                     |

### 021 — Project Context Integration with Config

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/project-context.ts` (adicional ao 020)                                                     |
| **Função**         | `loadProjectConfig(name)` — retorna `ProjectEntry` do registry, com override de env vars           |
| **Lógica**         | Env vars `QA_JIRA_KEY`, `QA_GIT_PROVIDER`, etc. sobrescrevem valores do registry                   |
| **Teste unitário** | 4 cenários: config do registry, override por env var, fallback para defaults, projeto não encontrado |
| **Critério**       | 100% pass                                                                                         |

### 022 — Barrel

| Item         | Conteúdo                                           |
| ------------ | -------------------------------------------------- |
| **Arquivo**  | `shared/project-context.ts`                        |
| **Ação**     | Exporta todas as funções públicas                   |
| **Critério** | `tsc --noEmit` passa                               |

### 023 — Suite de Integração Context

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/project-context.integration.test.ts`    |
| **Testes**  | Fluxo: registry carrega projetos → setCurrentProject → getCurrentProject retorna dados corretos → reportsDir aponta para diretório do projeto |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 2:** `npx vitest run shared/__tests__/project-context*` = 100%. Coverage ≥ 90%.
**Commit:** `feat(multi-project): add project context with env var resolution and lazy loading`

---

## Pré-Voo — Fase 3

### Pré-requisito

Fases 0, 1 e 2 devem estar completas.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 3 — State Per Project (Tarefas 030-033)

### 030 — State Per Project

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/state.ts` (EXISTENTE)                                                                     |
| **Ação**           | `statePath()` aceita `projectName` opcional. Se fornecido → `state-<projectName>.json`. Se não → `state.json` (backward compat) |
| **Funções modificadas** | `statePath()`, `tmpPath()`, `bakPath()`, `load()`, `save()`, `update()`, `updateTyped()`    |
| **Migração**       | Se `state.json` existe e `state-<project>.json` não → copia para o novo arquivo (primeira vez)    |
| **Teste unitário** | Atualizar `shared/temp-dir.test.ts` existente + novos cenários em `shared/__tests__/state-project.test.ts` — 5 cenários |
| **Critério**       | `npx vitest run shared/__tests__/state-project` = 100% pass + todos os testes existentes continuam passando |

### 031 — Global State Keys

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/state.ts` (adicional ao 030)                                                               |
| **Ação**           | Chaves `_llm*` continuam em `state.json` (global). Chaves de operação (`lastChoice`, `history`, `lastProject`) ficam em `state-<project>.json` |
| **Lógica**         | `load()` para projeto lê `state-<project>.json`. `loadGlobal()` lê `state.json`. `save()` salva no projeto. `saveGlobal()` salva no global. |
| **Critério**       | `tsc --noEmit` passa. Todos os testes existentes passam.                                          |

### 032 — Suite de Integração State

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/state-project.integration.test.ts`      |
| **Testes**  | Criar state para projeto A → criar state para projeto B → verificar isolamento → migrar state legado |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 3:** `npx vitest run shared/__tests__/state-project*` = 100%. Testes existentes de state passam.
**Commit:** `feat(multi-project): add per-project state isolation with backward-compatible fallback`

---

## Pré-Voo — Fase 4

### Pré-requisito

Fases 0-3 devem estar completas.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 4 — Report Isolation (Tarefas 040-046)

### 040 — reportsDir() com Project Context

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/temp-dir.ts` (EXISTENTE)                                                                  |
| **Ação**           | Modificar `reportsDir()`: se `getCurrentProjectDir()` retorna valor → `join(projectDir, 'reports')`. Senão → fallback para `join(PROJECT_ROOT, 'reports')` (backward compat) |
| **Funções modificadas** | `reportsDir()`, `ensureDirs()`                                                                 |
| **Segurança**      | `isPathWithinBase()` continua funcionando — base muda para o reports do projeto                     |
| **Teste unitário** | `shared/__tests__/reports-dir-project.test.ts` — 4 cenários: sem projeto (fallback), com projeto, env var override, path traversal block |
| **Critério**       | `npx vitest run shared/__tests__/reports-dir-project` = 100% pass                                 |

### 041 — writeReport() com Project Context

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/temp-dir.ts` (EXISTENTE)                                                                  |
| **Ação**           | `writeReport()` não precisa de mudança de assinatura — `reportsDir()` já resolve corretamente. Verificar que path traversal check funciona com nova base. |
| **Teste unitário** | Atualizar `shared/temp-dir.test.ts` existente — adicionar cenário com projeto ativo               |
| **Critério**       | Todos os testes existentes passam + novo cenário passa                                            |

### 042 — logsDir() com Project Context

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/temp-dir.ts` (EXISTENTE)                                                                  |
| **Ação**           | Mesmo padrão de `reportsDir()`: se projeto ativo → `join(projectDir, 'logs')`. Senão → fallback  |
| **Teste unitário** | 2 cenários: com e sem projeto                                                                     |
| **Critério**       | 100% pass                                                                                         |

### 043 — tempDir() — SEM MUDANÇA

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/temp-dir.ts` (EXISTENTE)                                                                  |
| **Ação**           | `tempDir()` NÃO muda — diretório temporário é global (limpo em exit). Não faz sentido isolar.    |
| **Critério**       | `tsc --noEmit` passa                                                                              |

### 044 — Barrel

| Item         | Conteúdo                                           |
| ------------ | -------------------------------------------------- |
| **Arquivo**  | `shared/temp-dir.ts`                               |
| **Ação**     | Re-export `reportsDir`, `logsDir`, `writeReport`   |
| **Critério** | `tsc --noEmit` passa                               |

### 045 — Suite de Integração Reports

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/reports-dir.integration.test.ts`        |
| **Testes**  | Criar projeto → setCurrentProject → writeReport → verificar arquivo em `<projectDir>/reports/YYYY-MM-DD/` → limpar projeto → writeReport → verificar em fallback |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 4:** `npx vitest run shared/__tests__/reports-dir*` = 100%. Todos os testes existentes de temp-dir passam. Validação de diretório funciona.
**Commit:** `feat(multi-project): route reports and logs to project directory with directory validation`

### 046 — Validação de Diretório do Projeto no Registry

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/project-registry.ts` (EXISTENTE — Fase 1)                                                 |
| **Ação**           | `listProjects()` valida se cada `entry.dir` existe no disco. Entradas com diretório inválido recebem `valid: false` no retorno. `getProject()` retorna `valid` flag. |
| **Entry menu**     | Ao listar projetos, diretórios inválidos mostram `[INVÁLIDO]` em vermelho. Opção "R — Remover entradas inválidas" aparece quando há entradas inválidas |
| **Cenários**       | 1. Diretório existe → `valid: true`. 2. Diretório removido → `valid: false`. 3. Diretório é symlink quebrado → `valid: false`. 4. Diretório é symlink válido → `valid: true` |
| **Teste unitário** | `shared/__tests__/project-registry.test.ts` — 4 cenários: exists, removed, broken symlink, valid symlink |
| **Critério**       | `npx vitest run shared/__tests__/project-registry` = 100% pass                                    |

---

## Pré-Voo — Fase 5

### Pré-requisito

Fases 0-4 devem estar completas.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 5 — Entry Menu (Tarefas 050-055)

### 050 — Project Selection no Entry Menu

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/entry-menu.ts` (EXISTENTE)                                                                |
| **Ação**           | Antes de `showSelect` do módulo, adicionar `showSelect` de projeto. Se registry vazio → prompt "Deseja adicionar um projeto?" → spawn setup wizard |
| **Fluxo**          | 1. Carregar registry via `listProjects()`. 2. Se vazio → offer setup. 3. Se 1 projeto → auto-select. 4. Se N projetos → showSelect com lista + opção "Adicionar" + "Gerenciar" |
| **Passagem de contexto** | `runModule()` passa `QA_CURRENT_PROJECT` e `QA_PROJECT_DIR` via env vars no child process |
| **Persistência**   | Último projeto selecionado é salvo no state global (`lastProject`)                                  |
| **UX**             | Projeto selecionado aparece no header: `QA Tools · ibabs`                                          |
| **Teste unitário** | `shared/__tests__/entry-menu-project.test.ts` — 5 cenários: vazio, 1 projeto, N projetos, add, manage |
| **Critério**       | `npx vitest run shared/__tests__/entry-menu-project` = 100% pass                                  |

### 051 — Opção "Adicionar Projeto"

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/entry-menu.ts` (EXISTENTE)                                                                |
| **Ação**           | Na lista de projetos, opção "A — Adicionar novo projeto" → spawn `setup/main.ts --dir <path>` (prompts para diretório) |
| **Fluxo**          | 1. Prompt "Diretório do projeto: " 2. Valida que diretório existe e tem package.json 3. Spawn setup wizard com `--dir` 4. Ao voltar, recarregar registry e mostrar projeto adicionado |
| **Critério**       | `tsc --noEmit` passa                                                                              |

### 052 — Opção "Gerenciar Projetos"

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/entry-menu.ts` (EXISTENTE)                                                                |
| **Ação**           | Na lista de projetos, opção "G — Gerenciar projetos" → submenu com listar, editar, remover         |
| **Submenu**        | 1. Listar projetos com detalhes (dir, provider, framework) 2. Editar projeto (prompts para cada campo) 3. Remover projeto (confirmação) 4. Voltar |
| **Critério**       | `tsc --noEmit` passa                                                                              |

### 053 — runModule() com Contexto

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/entry-menu.ts` (EXISTENTE)                                                                |
| **Ação**           | `runModule()` passa env vars para child process: `QA_CURRENT_PROJECT`, `QA_PROJECT_DIR`           |
| **Código**         | `spawn(process.execPath, [TSX_BIN, script], { env: { ...process.env, QA_CURRENT_PROJECT: name, QA_PROJECT_DIR: dir }, stdio: 'inherit', cwd: root })` |
| **Critério**       | `tsc --noEmit` passa. Child process recebe as env vars.                                           |

### 054 — Suite de Integração Entry Menu

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/entry-menu-project.integration.test.ts` |
| **Testes**  | Registry com 2 projetos → entry menu lista projetos → seleciona projeto → runModule passa contexto |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 5:** `npx vitest run shared/__tests__/entry-menu-project*` = 100%. Menu funcional com seleção de projeto. `--project` flag funciona em ambos os entry points.
**Commit:** `feat(multi-project): add project selection to entry menu with --project flag for headless mode`

### 055 — Flag --project para npm scripts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `jira_management/main.ts` e `git_triggers/main.ts` (EXISTENTES)                                   |
| **Ação**           | Aceitar `--project <nome>` no CLI args. Se fornecido → ler registry, setar `QA_CURRENT_PROJECT` e `QA_PROJECT_DIR` no `process.env` antes de iniciar sessão |
| **Backward compat**| Se `--project` não fornecido → comportamento atual (prompt interativo)                              |
| **Exemplo**        | `npx tsx git_triggers/main.ts --project ibabs --batch --branch main`                               |
| **Prioridade**     | `--project` > env var `QA_CURRENT_PROJECT` > prompt interativo                                     |
| **Teste unitário** | Verificar que `--project` seta env vars corretamente e pula seleção interativa                      |
| **Critério**       | `tsc --noEmit` passa. `--project` funciona em ambos os entry points.                               |

---

## Pré-Voo — Fase 6

### Pré-requisito

Fases 0-5 devem estar completas.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

### Análise de Impacto

| Consumer                 | Arquivos afetados                                                              |
| ------------------------ | ------------------------------------------------------------------------------ |
| `session-state.ts`       | `git_triggers/session-state.ts`, `git_triggers/session-state.test.ts`          |
| `interactive-mode.ts`    | `git_triggers/interactive-mode.ts`, testes existentes                          |
| `batch-mode.ts`          | `git_triggers/batch-mode.ts`, testes existentes                                |
| `schedule-handler.ts`    | `git_triggers/schedule-handler.ts`, testes existentes                           |
| `jira_management/main.ts`| `jira_management/main.ts`, testes existentes                                   |

---

## Fase 6 — Module Integration (Tarefas 060-065)

### 060 — git_triggers/session-state.ts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/session-state.ts` (EXISTENTE)                                                       |
| **Ação**           | `loadProjects()` lê de `~/.config/qa-tools/projects.json` via `listProjects()`. Se registry vazio → fallback para `config/projects.json` (backward compat) |
| **Mudança**        | `getProjects()` retorna `Record<string, string>` a partir do registry. `getProviderForProject()` lê `provider` do `ProjectEntry`. `createManagerForProject()` usa `projectId` do entry. |
| **Remoção**        | `PROJECTS_PATH` e `PROVIDERS_PATH` hardcoded são removidos. `loadProvidersConfig()` é removida.  |
| **Teste unitário** | Atualizar `git_triggers/session-state.test.ts` — cenário com registry novo + cenário com fallback legado |
| **Critério**       | 100% pass + backward compat                                                                        |

### 061 — git_triggers/interactive-mode.ts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/interactive-mode.ts` (EXISTENTE)                                                    |
| **Ação**           | Se `QA_CURRENT_PROJECT` está definido (via env var do entry menu) → pular `_selectProject()`. Usar `getCurrentProject()` do project-context. Se não definido → manter fluxo atual (backward compat). |
| **Mudança**        | `_selectProjectAndCreateManager()` verifica env var primeiro. `currentProjectName` vem de `getCurrentProject()?.name`. |
| **Teste unitário** | Atualizar testes existentes — cenário com env var setada + cenário sem env var                     |
| **Critério**       | 100% pass                                                                                         |

### 062 — git_triggers/batch-mode.ts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/batch-mode.ts` (EXISTENTE)                                                          |
| **Ação**           | `setupBatchProject()` lê `QA_CURRENT_PROJECT` e `QA_PROJECT_DIR` de env vars. Se não definido → fallback para `--project` CLI arg. |
| **Teste unitário** | Atualizar testes existentes                                                                        |
| **Critério**       | 100% pass                                                                                         |

### 063 — git_triggers/schedule-handler.ts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/schedule-handler.ts` (EXISTENTE)                                                    |
| **Ação**           | `currentProjectName` lê de `getCurrentProject()?.name` se disponível.                              |
| **Teste unitário** | Atualizar testes existentes                                                                        |
| **Critério**       | 100% pass                                                                                         |

### 064 — jira_management/main.ts

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `jira_management/main.ts` (EXISTENTE)                                                             |
| **Ação**           | `initializeSession()` lê `QA_CURRENT_PROJECT` e `QA_PROJECT_DIR`. Se `jiraKey` está no registry → usa como default para Jira project. Se `QA_PROJECT_DIR` definido → resolve paths de testes relativos ao projeto. |
| **Mudança**        | `ctx.project_name` usa `jiraKey` do registry se disponível. Prompt de projeto usa default do registry. |
| **Teste unitário** | Atualizar testes existentes                                                                        |
| **Critério**       | 100% pass                                                                                         |

### 065 — Suite de Integração Module Integration

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/module-integration.integration.test.ts`  |
| **Testes**  | Registry → entry menu → select project → spawn git module → verify QA_CURRENT_PROJECT is set → verify reportsDir points to project dir |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 6:** `npx vitest run` = 100%. Entry menu propaga contexto. Módulos consomem contexto. Backward compat preservada.
**Commit:** `feat(multi-project): integrate project context into git and jira modules`

---

## Pré-Voo — Fase 7

### Pré-requisito

Fases 0-6 devem estar completas.

### ESLint Rules (erros, não warnings)

| Regra                        | Ação                              |
| ---------------------------- | --------------------------------- |
| `no-non-null-assertion`      | Extrair variável, usar `?.`       |
| `vitest/padding-around-all`  | Linha em branco antes de `expect` |
| `vitest/prefer-strict-equal` | Usar `toStrictEqual`              |

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 7 — Setup Wizard (Tarefas 070-073)

### 070 — Setup Wizard aceita --dir

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `setup/main.ts` (EXISTENTE)                                                                       |
| **Ação**           | Parse `--dir <path>` do CLI args. Se fornecido → CWD muda para `<path>` antes de detectar framework. Se não fornecido → mantém CWD atual (backward compat). |
| **Mudança**        | `gatherSetupContext()` usa `resolvedDir` em vez de `process.cwd()` para detecção. `generateConfigFiles()` escreve CI files em `resolvedDir`. |
| **Critério**       | `tsc --noEmit` passa. `npx tsx setup/main.ts --dir /tmp/test-project` funciona.                   |

### 071 — Setup Wizard registra no Registry

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `setup/config-writer.ts` (EXISTENTE)                                                              |
| **Ação**           | Após escrever CI files, chamar `addProject()` do `project-registry.ts` para registrar no `~/.config/qa-tools/projects.json` |
| **Dados registrados** | `name`, `dir` (resolvedDir), `provider`, `projectId`, `jiraKey` (se fornecido), `framework`, `features` |
| **Idempotência**   | Se projeto com mesmo nome já existe → atualiza em vez de duplicar                                   |
| **Critério**       | `tsc --noEmit` passa. Após wizard, projeto aparece no registry.                                    |

### 072 — Setup Wizard não escreve mais config/projects.json legado

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `setup/config-writer.ts` (EXISTENTE)                                                              |
| **Ação**           | `writeProjectsConfig()` e `writeProvidersConfig()` são mantidas para backward compat (projetos que rodam o wizard de dentro do projeto). MAS o registry XDG é a fonte de verdade. |
| **Dual-write**     | Escrita em ambos: `config/projects.json` (legado) + `~/.config/qa-tools/projects.json` (novo). migFromLegacyConfig resolve na leitura. |
| **Critério**       | `tsc --noEmit` passa. Ambos os arquivos são escritos.                                              |

### 073 — Suite de Integração Setup

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Arquivo** | `shared/__tests__/integration/setup-wizard.integration.test.ts`       |
| **Testes**  | Criar diretório temporário → rodar setup com --dir → verificar CI files no diretório → verificar projeto no registry |
| **Critério** | Suite inteira passa                                                   |

**Checkpoint Fase 7:** `npx vitest run` = 100%. Setup wizard registra projetos no XDG. CI files continuam sendo gerados no diretório do projeto.
**Commit:** `feat(multi-project): register projects in XDG registry from setup wizard`

---

## Pré-Voo — Fase 8

### Pré-requisito

Fases 0-7 devem estar completas.

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 8 — Migração (Tarefas 080-082)

### 080 — Script de Migração

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/migration/migrate-projects.ts` (NOVO)                                                     |
| **Função**         | `migrateLegacyProjects()` — executada no startup do entry menu. Se `~/.config/qa-tools/projects.json` não existe ou está vazio E `config/projects.json` tem projetos → migra automaticamente. |
| **Idempotência**   | Roda apenas uma vez (flag no state global).                                                        |
| **Backup**         | Cria backup dos arquivos legados antes de migrar.                                                  |
| **Critério**       | `tsc --noEmit` passa. Migração funciona sem intervenção manual.                                    |

### 081 — Remover config/projects.json dos consumers

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `git_triggers/session-state.ts` (EXISTENTE)                                                       |
| **Ação**           | Após migração confirmada, `loadProjects()` lê apenas do registry. Fallback legado removido.       |
| **Critério**       | Todos os testes passam. `config/projects.json` não é mais lido em produção.                       |

### 082 — Testes de Migração

| Item               | Conteúdo                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `shared/__tests__/migration/migrate-projects.test.ts` (NOVO)                                      |
| **Testes**         | 4 cenários: migração limpa, skip se já existe, merge, arquivo legado corrompido                   |
| **Critério**       | 100% pass                                                                                         |

**Checkpoint Fase 8:** Migração automática funciona. Projetos legados são migrados sem perda de dados.
**Commit:** `feat(multi-project): add automatic migration from legacy project config`

---

## Pré-Voo — Fase 9

### Pre-commit Hook

| Padrão           | Rejeitado |
| ---------------- | --------- |
| `eslint-disable` | ✅        |
| type-cast-unknown | ✅        |
| `@ts-ignore`     | ✅        |

---

## Fase 9 — Verificação de Integridade (Tarefas 090-099)

### 090-099 — Verificar integridade ponta-a-ponta

| ID  | Verificação                                                                    | Critério                                                      |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 090 | Registry lê e escreve corretamente                                             | Load/save/add/remove funcionam                                |
| 091 | Project context resolve corretamente                                            | getCurrentProject retorna dados completos                      |
| 092 | State é isolado por projeto                                                     | state-A.json e state-B.json são independentes                 |
| 093 | Reports são escritos no diretório do projeto                                    | writeReport cria arquivo em `<projectDir>/reports/`            |
| 094 | Entry menu lista projetos do registry                                           | Lista aparece com provider tags                                |
| 095 | Entry menu passa contexto para child process                                    | QA_CURRENT_PROJECT e QA_PROJECT_DIR chegam ao child            |
| 096 | Git module usa contexto do projeto                                               | interactive-mode pula seleção se env var definida              |
| 097 | Jira module usa contexto do projeto                                              | initializeSession usa jiraKey do registry                      |
| 098 | Setup wizard registra projeto no registry                                        | Após wizard, projeto aparece em ~/.config/qa-tools/projects.json |
| 099 | Backward compat: sem projeto selecionado, tudo funciona como antes              | Modo legado preservado                                        |

**Commit:** `verify: validate multi-project support across registry, context, state, reports, and modules`

---

## Pendências Futuras

> Itens inspirados pela pesquisa de mercado. Não bloqueiam Fases 0-9.

### 1. Relatórios Agregados Multi-Projeto (Allure-style)

> **PROPOSTA:** Dashboard que agrega métricas de múltiplos projetos.
>
> **Estado atual:** Cada projeto gera seus relatórios independentemente.
>
> **Proposta:** Dashboard全局 que lê reports de todos os projetos registrados e apresenta visão consolidada.
>
> **Referência:** Allure Report — `allureAggregateReport` combina resultados de múltiplos subprojetos.
>
> **Vantagens potenciais:**
>
> - Visão global da qualidade de todos os projetos
> - Comparação entre projetos
> - Alertas consolidados
>
> **Status:** DISCUTIR POSTERIORMENTE

### 2. Auto-Discovery de Projetos (Moon-style)

> **PROPOSTA:** Setup wizard detecta projetos automaticamente via globs.
>
> **Estado atual:** Usuário aponta manualmente para o diretório do projeto.
>
> **Proposta:** Opção "Detectar projetos" que escaneia diretório raiz em busca de `package.json`, `.git`, `vitest.config.ts`, etc.
>
> **Referência:** Moon — `projects: globs: ['apps/*', 'packages/*']` detecta projetos automaticamente.
>
> **Fluxo:**
> 1. Usuário seleciona "Detectar projetos"
> 2. Informa diretório raiz (ex: `~/projetos/`)
> 3. Sistema escaneia subdiretórios em busca de indicadores de projeto
> 4. Lista projetos encontrados para confirmação
> 5. Registra todos no registry
>
> **Status:** DISCUTIR POSTERIORMENTE

### 3. Filtering por Tags (Nx/Luna-style)

> **PROPOSTA:** Tags para agrupar e filtrar projetos.
>
> **Estado atual:** Lista plana de projetos sem agrupamento.
>
> **Proposta:** Campo `tags` no `ProjectEntry` para categorizar projetos (ex: `["frontend", "api", "critical"]`). Entry menu permite filtrar por tag.
>
> **Referência:** Nx — tags agrupam projetos por scope/type/stack. Moon — tags para filtering.
>
> **Exemplo:**
> ```json
> { "name": "ibabs", "tags": ["frontend", "cypress", "production"] }
> ```
>
> **Status:** DISCUTIR POSTERIORMENTE

### 4. Batch Multi-Projeto (Lerna-style)

> **PROPOSTA:** Batch mode opera em múltiplos projetos de uma vez.
>
> **Estado atual:** Batch mode opera em um projeto por vez.
>
> **Proposta:** `--scope <glob>` para rodar batch em múltiplos projetos (ex: `qatools --batch --scope "qa_*"`).
>
> **Referência:** Lerna — `--scope`, `--since`, `--include-dependencies`.
>
> **Status:** DISCUTIR POSTERIORMENTE

### 5. Workspace File Portátil (VS Code-style)

> **PROPOSTA:** Arquivo `.qa-workspace` que pode ser compartilhado entre membros da equipe.
>
> **Estado atual:** Registry em `~/.config/qa-tools/` (local, não versionável).
>
> **Proposta:** Comando `qatools export-workspace` gera `.qa-workspace` na raiz do projeto. Comando `qatools import-workspace` importa do arquivo.
>
> **Referência:** VS Code — `.code-workspace` é versionável e compartilhável.
>
> **Status:** DISCUTIR POSTERIORMENTE

---

## Dependências

```
Fase 0   (001-005)    ← sem dependências
Fase 1   (010-014)    ← depende de Fase 0
Fase 2   (020-023)    ← depende de Fase 0 (paralela com Fase 1)
Fase 3   (030-033)    ← depende de Fase 2
Fase 4   (040-045)    ← depende de Fase 2 + Fase 3
Fase 5   (050-054)    ← depende de Fase 1 + Fase 2
Fase 6   (060-065)    ← depende de Fase 4 + Fase 5
Fase 7   (070-073)    ← depende de Fase 1 + Fase 6
Fase 8   (080-082)    ← depende de Fase 7
Fase 9   (090-099)    ← depende de Fase 8
```

```
         Fase 0
        /      \
    Fase 1    Fase 2
        \      / |
       Fase 3   |
          |    Fase 4
       Fase 5   |
          \    /
         Fase 6
            |
         Fase 7
            |
         Fase 8
            |
         Fase 9
```

---

## Estimativa

| Fase   | Tarefas | Sprints         |
| ------ | ------- | --------------- |
| 0      | 6       | 0.5             |
| 1      | 5       | 1               |
| 2      | 4       | 1               |
| 3      | 4       | 1               |
| 4      | 7       | 1.5             |
| 5      | 6       | 2               |
| 6      | 6       | 2               |
| 7      | 4       | 1               |
| 8      | 3       | 1               |
| 9      | 10      | 1               |
| **Total** | **55** | **~12 sprints** |

---

## Decisões Registradas

| Decisão                | Escolha                          | Justificativa                                                                   | Referência de Mercado |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| Registry location      | `~/.config/qa-tools/` (XDG)      | Padrão Linux, sobrevive updates, consistente com state                          | VS Code workspace file |
| Reports location       | `<projectDir>/reports/`          | Self-contained, CI/CD fácil, versionável com o código                           | Allure per-project results |
| Config per project     | JSON unificado (`ProjectEntry`)  | Consistente com arquitetura existente (Zod, JSONs)                              | Nx project.json |
| State isolation        | `state-<project>.json`           | Isolamento total, sem conflitos entre projetos                                  | Docker Compose project name |
| Backward compat        | Fallback para modo legado        | Sem projeto → opera como hoje. Migração automática.                             | Docker Compose backward compat |
| tempDir                | Global (não muda)                | Temporário é limpo em exit — não faz sentido isolar                             | — |
| Dual-write             | Legado + XDG durante transição  | Evita breaking change, migração suave                                           | Docker Compose override files |
| Entry menu             | Seleção antes do módulo          | UX limpa: projeto → módulo → operação. Sem seleção duplicada.                   | VS Code project picker |
| State global keys      | `_llm*` em state global          | Configurações de IA são compartilhadas entre projetos                           | — |
| Auto-select            | 1 projeto → auto-select          | Reduz atrito quando há apenas um projeto                                        | Moon auto-discovery |
| Migration              | Automática no startup            | Zero intervenção manual                                                         | Docker Compose auto-migration |
| setup wizard --dir     | CWD muda para resolvedDir        | Reusa lógica existente sem duplicação                                           | Nx plugin detection |
| Validação de diretório | Valida no load + UI warning      | Entradas órfãs causam erros silenciosos                                         | Docker Compose health checks |
| Metadata nos relatórios| `<meta name="qa-project">`       | Facilita aggregate reports futuro, custo marginal                               | Allure result metadata |
| --project flag         | CLI arg bypassa entry menu       | npm scripts e CI/CD precisam de headless multi-projeto                          | Lerna --scope |

---

## Arquivos Afetados

### NOVOS (11+):

`shared/types/project.ts`, `shared/project-registry.ts`, `shared/project-context.ts`,
`shared/__tests__/project-registry.test.ts`, `shared/__tests__/project-registry.property.test.ts`,
`shared/__tests__/project-context.test.ts`, `shared/__tests__/reports-dir-project.test.ts`,
`shared/__tests__/state-project.test.ts`, `shared/__tests__/entry-menu-project.test.ts`,
`shared/__tests__/integration/project-registry.integration.test.ts`,
`shared/__tests__/integration/project-context.integration.test.ts`,
`shared/__tests__/integration/reports-dir.integration.test.ts`,
`shared/__tests__/integration/state-project.integration.test.ts`,
`shared/__tests__/integration/entry-menu-project.integration.test.ts`,
`shared/__tests__/integration/module-integration.integration.test.ts`,
`shared/__tests__/integration/setup-wizard.integration.test.ts`,
`shared/migration/migrate-projects.ts`,
`shared/__tests__/migration/migrate-projects.test.ts`,
`audit/functional/PROGRESS-MULTI-PROJECT.md`

### PRODUÇÃO REFRATORADOS (12):

`shared/config-schema.ts`, `shared/types/common.ts`, `shared/types.ts`,
`shared/temp-dir.ts`, `shared/state.ts`, `shared/entry-menu.ts`, `shared/report-html.ts`,
`git_triggers/main.ts`, `git_triggers/session-state.ts`, `git_triggers/interactive-mode.ts`,
`git_triggers/batch-mode.ts`, `git_triggers/schedule-handler.ts`,
`jira_management/main.ts`, `setup/main.ts`, `setup/config-writer.ts`

### TESTES ATUALIZADOS (8+):

`shared/temp-dir.test.ts`, `shared/__tests__/temp-dir.property.test.ts`,
`shared/__tests__/integration/temp-dir.integration.test.ts`,
`git_triggers/session-state.test.ts`,
`git_triggers/interactive-mode.test.ts` (se existir),
`setup/config-writer.test.ts`, `setup/main.test.ts` (se existir)
