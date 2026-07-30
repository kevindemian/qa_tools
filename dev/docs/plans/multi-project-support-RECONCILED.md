# Multi-Projeto — Plano Reconciliado (v2 · CLOSED)

> **Status:** PLANO FECHADO (design finalizado, pronto para execução).
> **Supersede:** `.mimocode/plans/multi-project-support.md` (v1, design exploratório). v1 permanece como histórico; este documento é a fonte de verdade para implementação.
> **Progresso de execução:** `audit/functional/PROGRESS-MULTI-PROJECT.md` (criado no início da Fase 0).
>
> Todas as tarefas iniciam em status `🔜 Pending`. Nenhuma implementação foi feita neste documento — é planejamento.

---

## 1. Decisões Fechadas

Consolidado das decisões de reconcilação (D1–D3), UX (D-U1–D-U4) e infraestrutura (D-E1–D-E3). Todas aprovadas pelo usuário.

| ID | Tópico | Escolha | Justificativa |
| -- | ------ | ------- | ------------- |
| D1 | `dir` ausente | Default = `PROJECT_ROOT` (onde o projeto é detectado), nunca omitido | Resolve auto-exclusão de órfãos; toda entrada tem `dir` válido |
| D2 | Cutover | **Único** cutover registry-first; sem dual-write perpétuo | Fim de estado misto; fonte única desde o dia 1 |
| D3 | `currentProjectName` | **Espelho derivado** de `project-context` (`getCurrentProject()?.name`); não tear-out | Reuso de call sites existentes; zero duplicação |
| D-U1 | Listagem | Lista numerada (`displayProjects`) **+** `showSelect` ambos permitidos | Acessibilidade (teclado) e descoberta (setas) coexitsem |
| D-U2 | Seleção | No **entry-menu** (primária), não como action 9 | UX limpa: projeto → módulo → operação |
| D-U3 | `jiraKey` | Capturado no setup wizard (opcional) e persistido no registry | Remove retrabalho de perguntar Jira key a cada sessão |
| D-U4 | Migrados | Entradas migradas recebem `migrated: true` e são **protegidas** contra overwrite/exclusão acidental | Evita perda de dados de projetos legados |
| D-E1 | Segredos por projeto | `~/.config/qa-tools/<projeto>/.env` (XDG config), **fora do repo** | Elimina risco de commit de credenciais; coerente com registry |
| D-E2 | Layout geral | **Híbrido XDG**: registry+segredos em XDG config; state+metrics em XDG state; reports/logs/artifacts em `<projectDir>/.qa-tools/` | Separa versionável (reports) de dados/segredos por-máquina |
| D-E3 | Escopo do `.env` por projeto | Apenas **overrides** do projeto; global `.env` retém o compartilhado | Evita duplicação de tokens globais; overlay em camadas |

---

## 2. Correções de Reconciliação (v1 → v2)

As 7 tensões internas de v1 e sua resolução neste plano:

| # | Tensão em v1 | Resolução em v2 | Fase |
| - | ------------ | --------------- | ---- |
| T1 | Dual-write (`config/projects.json` + XDG) **nunca fechado** — corria o risco de virar permanente | Cutover único (D2): Fase 8 migra e **remove** o fallback legado; dual-write existe só durante a Fase 8, nunca em produção estável | 7–8 |
| T2 | Migração duplicada: `migrateFromLegacyConfig` (Fase 1.011) **e** `migrateLegacyProjects` (Fase 8.080) | **Um só** módulo `shared/migration/migrate-projects.ts` com `migrateLegacyProjects()`; Fase 1 faz só CRUD | 1, 8 |
| T3 | Naming mismatch: contexto usa `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR` (env) vs Config usa `qaCurrentProject`/`qaProjectDir` | Fonte única = props do `Config` (`qaCurrentProject`/`qaProjectDir`/`xdgConfigHome`); env vars são **transporte** para child processes, derivadas do Config | 0, 2 |
| T4 | Gap de `dir` na migração (entradas sem `dir` → órfãs) | Migração popula `dir` (default `PROJECT_ROOT`, D1) + `migrated: true` (D-U4) para **toda** entrada legada | 8 |
| T5 | Realidade two-tier (projetos com e sem `dir`) não modelada | `dir` obrigatório com default; `valid` flag na listagem para dirs inválidos | 1, 4 |
| T6 | `currentProjectName` (let module-level em `session-state.ts`) tratado como estado independente | Espelho derivado (D3): getter → `getCurrentProject()?.name` | 2, 6 |
| T7 | Reimplementação em vez de reuso (ex.: `loadProjects` reescrito do zero) | **Reuso não reescrita**: `session-state`/`interactive-mode` delegam a `project-context`/`registry` | 6 |

---

## 3. Princípios Arquiteturais

1. **Registry-first / fonte única** — `~/.config/qa-tools/projects.json` é a única fonte de projetos. `Config` (`qaCurrentProject`/`qaProjectDir`) é a única fonte do projeto ativo.
2. **Reuso não reescrita** — módulos existentes delegam a `project-context`/`registry`; não reimplementam.
3. **Cutover único** — migração legado→XDG ocorre uma vez; dual-write é transitório (só Fase 8).
4. **Híbrido XDG (D-E2)** — separa o versionável (reports em `<projectDir>/.qa-tools/`) do por-máquina (state/metrics em XDG state; segredos em XDG config).
5. **Segredos fora do repo (D-E1)** — `.env` por projeto vive em XDG config, nunca no diretório do projeto.
6. **Isolamento total por projeto** — state, metrics store, reports, logs e artifacts de um projeto não vazam para outro.
7. **Zero tolerância** — sem `eslint-disable`/`@ts-ignore`/`as any`; sem catches vazios; código obsoleto (dual-write, `PROJECT_ID_<NAME>`, `PROJECTS_PATH` hardcoded) é **removido**, não mantido.

---

## 4. Arquitetura Alvo (Revisada)

```
~/.config/qa-tools/                            # XDG config home
├── projects.json                             # Registry (fonte única): nome → ProjectEntry
└── <projeto>/.env                            # Segredos por projeto (D-E1) — overlay sobre .env global

~/.local/state/qa-tools/                      # XDG state home (dados por-máquina)
├── global.json                              # Chaves globais (_llm*, lastProject)
└── <projeto>/
    ├── state.json                           # State operacional do projeto
    └── metrics/                             # DataHub store (já por git-dir; respeta qaProjectDir)
        ├── global.json
        ├── quality-metrics.json
        ├── coverage-files.json
        └── ... (persistence.ts)

<projectDir>/.qa-tools/                       # Artefatos operacionais (versionáveis, D-E2)
├── reports/YYYY-MM-DD/*.html
├── logs/
└── artifacts/                                # CI/test artifacts baixados

shared/
├── types/project.ts                          # NOVO — ProjectEntry, ProjectRegistry
├── project-registry.ts                       # NOVO — CRUD + validação de dir (sem migração)
├── project-context.ts                        # NOVO — deriva de Config; setCurrentProject carrega .env overlay
├── migration/migrate-projects.ts             # NOVO — ÚNICO módulo de migração (T2)
├── env-loader.ts                             # EXISTENTE — + overlay .env por projeto (D-E1)
├── config-schema.ts                         # EXISTENTE — +qaCurrentProject/qaProjectDir/xdgConfigHome
├── types/common.ts                          # EXISTENTE — +ConfigOverrides
├── temp-dir.ts                              # EXISTENTE — reportsDir/logsDir/artifactsDir usam project context
├── state.ts                                 # EXISTENTE — state por projeto (XDG state/<proj>/)
├── store-backend.ts                         # EXISTENTE — git dir respeita qaProjectDir (T7/metrics)
├── entry-menu.ts                            # EXISTENTE — seleção de projeto (D-U2)
├── report-html.ts                           # EXISTENTE — +<meta name="qa-project">
└── __tests__/...                             # NOVOS + existentes atualizados

git_triggers/  (session-state, interactive-mode, batch-mode, schedule-handler, main)  # EXISTENTE — delegam a project-context
jira_management/main.ts                       # EXISTENTE — --project + usa qaProjectDir
setup/ (main, config-writer)                  # EXISTENTE — --dir, registra no registry, captura jiraKey (D-U3), escreve .env XDG (D-E1)
```

---

## 5. Fases (Tarefas Granulares)

Status inicial de toda tarefa: `🔜 Pending`.

### Fase 0 — Fundação (001–006)

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 001 | `shared/types/project.ts`: `ProjectEntry` (`name`, `dir` obrigatório, `provider`, `projectId?`, `jiraKey?`, `framework?`, `features?`, `migrated?`) + `ProjectRegistry` (Zod) | NOVO | `tsc --noEmit` |
| 002 | Adicionar `qaCurrentProject`, `qaProjectDir`, `xdgConfigHome` ao `CONFIG_SCHEMA` | `shared/config-schema.ts` | `tsc --noEmit` |
| 003 | Props nomeadas em `ConfigOverrides` | `shared/types/common.ts` | `tsc --noEmit` |
| 004 | Barrel `shared/types.ts` | EXISTENTE | import funciona |
| 005 | Criar `shared/__tests__/` | NOVO | dirs existem |
| 006 | `<meta name="qa-project" content>` em relatórios HTML | `shared/report-html.ts` | meta tag presente; teste unitário |

**Checkpoint:** `npx tsc --noEmit` = 0 erros. **Commit:** `feat(multi-project): foundation types, config schema, project meta in HTML`.

---

### Fase 1 — Project Registry (010–013) · **sem migração** (T2)

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 010 | `loadRegistry/saveRegistry/addProject/updateProject/removeProject/listProjects/getProject` + validação de `dir` (existe? symlink?) → flag `valid` | `shared/project-registry.ts` | `vitest` 100% |
| 011 | Backup `projects.json.bak` a cada `saveRegistry`; idempotência em `addProject` | `shared/project-registry.ts` | `vitest` 100% |
| 012 | Barrel de exports | `shared/project-registry.ts` | `tsc --noEmit` |
| 013 | Suite integração: criar → 3 projetos → persistir → recarregar → integridade | `shared/__tests__/integration/project-registry.integration.test.ts` | passa |

> **T2:** NÃO há migração aqui. Migração é exclusiva da Fase 8.

**Checkpoint:** registry CRUD 100%, coverage ≥ 90%. **Commit:** `feat(multi-project): project registry CRUD with dir validation`.

---

### Fase 2 — Project Context (020–024)

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 020 | `getCurrentProject/getCurrentProjectDir/setCurrentProject/clearCurrentProject/isProjectSelected` — derivam de `Config` (`qaCurrentProject`/`qaProjectDir`), fallback `undefined` (legado) | `shared/project-context.ts` | `vitest` 100% |
| 021 | `loadProjectConfig(name)` — `ProjectEntry` + override por env vars | `shared/project-context.ts` | `vitest` 100% |
| 022 | Barrel | `shared/project-context.ts` | `tsc --noEmit` |
| 023 | Suite integração: registry → setCurrentProject → reportsDir aponta p/ dir | `shared/__tests__/integration/project-context.integration.test.ts` | passa |
| 024 | **Overlay `.env` por projeto (D-E1/D-E3):** estender `shared/env-loader.ts` para, após `dotenv.config` global, carregar `~/.config/qa-tools/<projeto>/.env` quando `qaCurrentProject` está setado; valores do projeto sobrescrevem globais. Retirar o hack `PROJECT_ID_<NAME>` de `session-state.ts` (código obsoleto removido) | `shared/env-loader.ts`, `git_triggers/session-state.ts` | `vitest` 100% + lint limpo |

**Checkpoint:** context 100%, overlay testado. **Commit:** `feat(multi-project): project context with per-project .env overlay`.

---

### Fase 3 — State Per Project (030–033)

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 030 | `statePath()` aceita `projectName`; `<XDG state>/<proj>/state.json`; fallback `state.json` (legado) | `shared/state.ts` | `vitest` 100% + testes existentes |
| 031 | Chaves globais (`_llm*`, `lastProject`) em `<XDG state>/global.json`; operacionais em `<proj>/state.json` | `shared/state.ts` | `tsc --noEmit` + testes |
| 032 | Suite integração: state A vs B isolados + migração de `state.json` legado | `shared/__tests__/integration/state-project.integration.test.ts` | passa |

**Checkpoint:** isolamento 100%. **Commit:** `feat(multi-project): per-project state in XDG state`.

---

### Fase 4 — Report / Artifact Isolation (040–047)

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 040 | `reportsDir()` → `<projectDir>/.qa-tools/reports` se projeto ativo, senão fallback `PROJECT_ROOT/reports` | `shared/temp-dir.ts` | `vitest` 100% + path-traversal block |
| 041 | `writeReport()` herda `reportsDir()`; validação de base mantida | `shared/temp-dir.ts` | testes existentes + novo |
| 042 | `logsDir()` → `<projectDir>/.qa-tools/logs` | `shared/temp-dir.ts` | 100% |
| 043 | `artifactsDir()` → `<projectDir>/.qa-tools/artifacts` (NOVO helper p/ CI/test artifacts) | `shared/temp-dir.ts` | 100% |
| 044 | `tempDir()` **sem mudança** (global, limpo em exit) | `shared/temp-dir.ts` | `tsc --noEmit` |
| 045 | Barrel re-export | `shared/temp-dir.ts` | `tsc --noEmit` |
| 046 | **DataHub store respeita projeto (T7):** `detectProjectGitDir`/`detectStoreBackend` usam `qaProjectDir`/`QA_PROJECT_DIR` quando setado, fallback cwd | `shared/store-backend.ts`, `shared/data-hub/persistence.ts` | `vitest` 100% |
| 047 | Suite integração: projeto → writeReport/logs/artifacts em `.qa-tools/`; limpar → fallback | `shared/__tests__/integration/reports-dir.integration.test.ts` | passa |

**Checkpoint:** reports/logs/artifacts isolados; metrics store por projeto. **Commit:** `feat(multi-project): route reports, logs, artifacts to project dir`.

---

### Fase 5 — Entry Menu (050–055) · D-U1/D-U2/D-U4

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 050 | Seleção de projeto **antes** do módulo (D-U2): lista numerada (`displayProjects`, D-U1) + `showSelect`; 0→offer setup; 1→auto-select; N→lista + "Adicionar" + "Gerenciar"; entradas inválidas mostram `[INVÁLIDO]`; entradas `migrated:true` protegidas (D-U4) | `shared/entry-menu.ts` | `vitest` 100% |
| 051 | "A — Adicionar": prompt dir → spawn `setup/main.ts --dir` | `shared/entry-menu.ts` | `tsc --noEmit` |
| 052 | "G — Gerenciar": submenu listar/editar/remover (com proteção p/ `migrated:true`) | `shared/entry-menu.ts` | `tsc --noEmit` |
| 053 | `runModule()` passa `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR` (derivados do Config) via `env` + `stdio:'inherit'` + `cwd: root` | `shared/entry-menu.ts` | child recebe env |
| 054 | Suite integração: registry 2 projetos → lista → seleciona → contexto propagado | `shared/__tests__/integration/entry-menu-project.integration.test.ts` | passa |
| 055 | `--project <nome>` em `git_triggers/main.ts` e `jira_management/main.ts`: seta Config antes da sessão; prioridade `--project` > env > interativo | ambos | `tsc --noEmit` + teste |

**Checkpoint:** menu funcional; `--project` headless ok. **Commit:** `feat(multi-project): project selection in entry menu with --project flag`.

---

### Fase 6 — Module Integration (060–065) · D3/T6/T7

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 060 | `loadProjects()` delega a `listProjects()`; remove `PROJECTS_PATH`/`PROVIDERS_PATH` hardcoded, `loadProvidersConfig`, `currentProjectName`, `setCurrentProjectName` e `clearProjectCache` (código obsoleto removido, Alt C) | `git_triggers/session-state.ts` | `vitest` 100% + legado |
| 061 | `interactive-mode` pula `_selectProject` se `QA_CURRENT_PROJECT` setado; lê projeto via `getCurrentProject()`; escreve via `setCurrentProject` (Alt C) | `git_triggers/interactive-mode.ts` | `vitest` 100% |
| 062 | `batch-mode` lê `getCurrentProject()`/`QA_CURRENT_PROJECT`/`QA_PROJECT_DIR`; fallback `--project`; escreve via `setCurrentProject` (Alt C) | `git_triggers/batch-mode.ts` | `vitest` 100% |
| 063 | `schedule-handler` lê projeto via `getCurrentProject()`; escreve via `setCurrentProject` (Alt C) | `git_triggers/schedule-handler.ts` | `vitest` 100% |
| 064 | `jira_management/main` usa `jiraKey` do registry como default; resolve paths relativos a `qaProjectDir` | `jira_management/main.ts` | `vitest` 100% |
| 065 | Suite integração: registry → entry → spawn → contexto → reportsDir projeto | `shared/__tests__/integration/module-integration.integration.test.ts` | passa |

**Checkpoint:** `npx vitest run` 100%; backward compat preservada. **Commit:** `feat(multi-project): integrate project context into git and jira modules`.

---

### Fase 7 — Setup Wizard (070–074) · D-U3/D-E1/T1

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 070 | `--dir <path>`: CWD muda p/ resolvedDir antes de detectar framework | `setup/main.ts` | `tsc --noEmit` + smoke |
| 071 | Registra no registry via `addProject()` (idempotente) | `setup/config-writer.ts` | `tsc --noEmit` |
| 072 | **Captura `jiraKey` (D-U3):** prompt opcional no wizard; persiste em `ProjectEntry.jiraKey` | `setup/main.ts`, `setup/config-writer.ts` | `vitest` 100% |
| 073 | **Escreve `.env` por projeto (D-E1/D-E3):** secrets fornecidos → `~/.config/qa-tools/<proj>/.env` (XDG, fora do repo); apenas overrides | `setup/config-writer.ts` | `vitest` 100% |
| 074 | **Remove dual-write (T1):** `writeProjectsConfig`/`writeProvidersConfig` legados são **removidos**; registry XDG é a única escrita. Tests legados de config-writer atualizados/removidos | `setup/config-writer.ts` | `vitest` 100% + lint |
| 075 | Suite integração: tmp dir → setup --dir → CI files + registry + .env XDG | `shared/__tests__/integration/setup-wizard.integration.test.ts` | passa |

**Checkpoint:** setup registra em XDG; **sem dual-write**. **Commit:** `feat(multi-project): setup registers project in XDG registry, captures jiraKey, writes per-project .env`.

---

### Fase 8 — Migração Única (080–082) · T1/T2/T4/D1/D-U4

| ID | Tarefa | Arquivo | Critério |
| -- | ------ | ------- | -------- |
| 080 | **ÚNICO módulo** `shared/migration/migrate-projects.ts`: `migrateLegacyProjects()` lê `config/projects.json`+`providers.json`, converte p/ `ProjectRegistry`, **popula `dir` (default `PROJECT_ROOT`, D1)**, marca **`migrated: true` (D-U4)**, escreve XDG; backup dos legados; idempotente (roda 1x, flag em `global.json`) | `shared/migration/migrate-projects.ts` | `vitest` 100% |
| 081 | Remove fallback legado em `session-state` (T1): após cutover, lê só registry | `git_triggers/session-state.ts` | testes passam; legado não lido |
| 082 | `migrate-projects.test.ts`: limpa / skip se existe / merge / corrompido | `shared/__tests__/migration/migrate-projects.test.ts` | 100% |

> Cutover disparado no startup do entry-menu (uma vez). Dual-write só existiu transitivamente na Fase 7; aqui é eliminado de vez.

**Checkpoint:** migração automática 1x; legado desativado. **Commit:** `feat(multi-project): single cutover migration to XDG registry`.

---

### Fase 9 — Verificação de Integridade (090–099)

| ID | Verificação | Critério |
| -- | ----------- | -------- |
| 090 | Registry lê/escreve | CRUD ok |
| 091 | Project context resolve | `getCurrentProject` completo |
| 092 | State isolado por projeto | `state-A` ≠ `state-B` |
| 093 | Reports/logs/artifacts em `<projectDir>/.qa-tools/` | paths corretos |
| 094 | Entry menu lista registry | tags de provider |
| 095 | Contexto propagado p/ child | env vars chegam |
| 096 | Git module usa contexto | pula seleção se env setado |
| 097 | Jira module usa contexto | `jiraKey` do registry |
| 098 | Setup registra + escreve `.env` XDG | aparece em `~/.config/qa-tools` |
| 099 | Backward compat: sem projeto → opera como antes | modo legado preservado |

**Commit:** `verify: multi-project support end-to-end`.

---

## 6. Dependências

```
Fase 0   (001-006)   ← sem dependências
Fase 1   (010-013)   ← Fase 0
Fase 2   (020-024)   ← Fase 0  (paralela Fase 1)
Fase 3   (030-032)   ← Fase 2
Fase 4   (040-047)   ← Fase 2 + Fase 3
Fase 5   (050-055)   ← Fase 1 + Fase 2
Fase 6   (060-065)   ← Fase 4 + Fase 5
Fase 7   (070-075)   ← Fase 1 + Fase 6
Fase 8   (080-082)   ← Fase 7
Fase 9   (090-099)   ← Fase 8
```

---

## 7. Arquivos Afetados

### NOVOS
`shared/types/project.ts`, `shared/project-registry.ts`, `shared/project-context.ts`,
`shared/migration/migrate-projects.ts`, `shared/env-loader.ts` (extensão),
`shared/__tests__/project-registry.test.ts`, `shared/__tests__/project-registry.property.test.ts`,
`shared/__tests__/project-context.test.ts`, `shared/__tests__/state-project.test.ts`,
`shared/__tests__/reports-dir-project.test.ts`, `shared/__tests__/entry-menu-project.test.ts`,
`shared/__tests__/migration/migrate-projects.test.ts`,
`shared/__tests__/integration/{project-registry,project-context,state-project,reports-dir,entry-menu-project,module-integration,setup-wizard}.integration.test.ts`,
`audit/functional/PROGRESS-MULTI-PROJECT.md`

### REFATORADOS (produção)
`shared/config-schema.ts`, `shared/types/common.ts`, `shared/types.ts`, `shared/temp-dir.ts`,
`shared/state.ts`, `shared/store-backend.ts`, `shared/data-hub/persistence.ts`, `shared/entry-menu.ts`,
`shared/report-html.ts`, `git_triggers/main.ts`, `git_triggers/session-state.ts`,
`git_triggers/interactive-mode.ts`, `git_triggers/batch-mode.ts`, `git_triggers/schedule-handler.ts`,
`jira_management/main.ts`, `setup/main.ts`, `setup/config-writer.ts`

### OBSOLETO REMOVIDO (não mantido)
`config/projects.json` + `config/providers.json` (leitura em produção), `writeProjectsConfig`/`writeProvidersConfig`,
`PROJECTS_PATH`/`PROVIDERS_PATH` hardcoded, hack `PROJECT_ID_<NAME>` em `session-state.ts`, dual-write.

---

## 8. Convenções de Teste (Obrigatórias)

- Unitário em `shared/__tests__/<mod>.test.ts`; PBT em `<mod>.property.test.ts` (`fc.assert`, `numRuns:100`).
- Thresholds vitest: Lines 90% / Functions 91% / Branches 80% / Statements 90%.
- Mock factory com referência separada (evita `unbound-method`); `toStrictEqual`; padding antes de cada `expect`.
- **Sem `eslint-disable` / `@ts-ignore` / `as any` / catches vazios** — pre-commit rejeita.

---

## 9. Pendências Futuras (fora de v2)

1. Relatórios agregados multi-projeto (Allure-style)
2. Auto-discovery de projetos (Moon-style globs)
3. Filtering por tags (Nx/Lerna-style)
4. Batch multi-projeto (`--scope`)
5. Workspace file portátil (`.qa-workspace`, VS Code-style)

---

## 10. Nota de Progresso

Execução rastreada em `audit/functional/PROGRESS-MULTI-PROJECT.md` (criado na Fase 0). Cada tarefa concluída atualiza status + checkpoint por Fase.

---

## 11. Fase 6 — Addendum de Implementação (Alternativa C adotada)

**Decisão (registrada na execução da Fase 6):** entre A (`export let currentProjectName` + `setCurrentProjectName` delega), B (getter `getCurrentProjectName()` facade) e C (eliminar o estado de nome de projeto de `session-state`, consumindo `project-context` diretamente), adotou-se **C** por superioridade técnica + segurança (fonte única de verdade, zero estado redundante, zero cópia obsoleta, e validação + env-overlay aplicados onde antes não eram). Esforço é irrelevante por diretriz de implementação.

**Divergência da tabela da Fase 6 (§5) — aplicar C:**
- **060:** `session-state` **remove** `export let currentProjectName`, `setCurrentProjectName`, `PROJECTS_PATH`/`PROVIDERS_PATH`/`loadProvidersConfig`/`loadProjects`/`_providersConfig`/`_projects`; `getProjects()` delega a `listProjects()` (mapeia `name → projectId ?? ''`); `getProviderForProject(name)` lê `getProject(name)?.provider`. `clearProjectCache` **removido** (registry é relido a cada chamada, sem cache).
- **061/062/063:** leitura do projeto ativo via `getCurrentProject()?.name ?? ''`; escrita via `setCurrentProject(name)` / `clearCurrentProject()` (valida contra registry e aplica env-overlay D-E1/D-E3). `currentProjectName` **deixa de existir**.
- **064:** `jiraKey` default do registry (`loadProjectConfig(getCurrentProject() ?? '').jiraKey`); paths relativos a `getCurrentProjectDir()`.
- **065:** nova suite de integração `shared/__tests__/integration/module-integration.integration.test.ts`.
- **Testes:** mocks migram de `setCurrentProjectName`/`currentProjectName` para `project-context` (`getCurrentProject`/`setCurrentProject`/`clearCurrentProject`); `getProjects`/`getProviderForProject`/`createManagerForProject` reais ou mockados conforme o caso. Nenhum assert existente alterado para forçar aprovação — código corrigido onde necessário.

**Correção de bug encontrado durante a Fase 6:** `batch-mode.generateFlakinessDashboard(projectName, ...)` ignorava o parâmetro `projectName` e lia o módulo-level `currentProjectName`; passou a usar o argumento (correção de causa raiz).

---

## 12. Fases 7–9 — Plano de Execução Consolidado (aprovado)

> Registrado antes da execução. Critério de toda decisão: **superioridade técnica + segurança**. Tempo/esforço são irrelevantes. Proibido: `eslint-disable`/`@ts-ignore`/`as any`, catches vazios, fallback silencioso, dual-write perpétuo, débito técnico.

### 12.1 Fase 7 — Setup Wizard (070–075) · D-U3/D-E1/T1

- **070** `setup/main.ts`: `parseCliDir(argv)` puro → `resolve(dir)`; se `!fs.existsSync(resolved)` → `throw` explícito (fail-loud). Base p/ `cwd`, detecção de framework e `dir` do entry.
- **071** `setup/main.ts`: montar `ProjectEntry {name,dir,provider,projectId,jiraKey?,framework,features}` e `addProject(entry)` (idempotente) — substitui `writeProjectsConfig`.
- **072** `setup/context.ts`: `jiraKey?: string`; `setup/main.ts`: `promptProjectJiraKey()` opcional; incluir no entry.
- **073** `shared/env-loader.ts` (NOVO `writeProjectEnvOverlay(name, entry)`): escreve `projectEnvPath(name)` (XDG, fora do repo) com `QA_PROJECT_PROVIDER/PROJECT_ID/JIRA_KEY/FRAMEWORK` quando definidos; guard `isValidProjectName`; reutiliza `projectEnvPath` (SSoT). Chamado após `addProject`.
- **074** `setup/config-writer.ts`: **remover** `writeProjectsConfig`+`makeProjectEntry`+`ensureConfigDir`; limpar imports em `main.ts`. Comprovado: nenhum leitor real de `config/projects.json` (getProjects()→registry). Sem shim.
- **075** Reescrever `setup/main.test.ts` + `setup/config-writer.test.ts`: mocks estritos de `project-registry.addProject`; afirmar registry + `.env` XDG; `config/projects.json` NÃO criado; `jiraKey` capturado.

**Checkpoint:** setup registra em XDG; sem dual-write. **Commit:** `feat(multi-project): setup registers project in XDG registry, captures jiraKey, writes per-project .env`.

### 12.2 Fase 8 — Migração única (080–082) · T1/T2/T4/D1/D-U4

- **080** `shared/migration/migrate-projects.ts` (NOVO): `migrateLegacyProjects()` lê `config/projects.json` legado, converte p/ `ProjectEntry` (`dir` default `PROJECT_ROOT` D1, `provider`/`projectId` do valor), `addProject`, marca `migrated:true` (D-U4); idempotente (pula já registrados); no-op se ausente (log informativo); erro explícito se inválido. Renomeia legado p/ `.migrated`.
- **081** `git_triggers/session-state.ts` já usa registry; `shared/entry-menu.ts` `_initInfrastructure` dispara `migrateLegacyProjects()` uma vez ao detectar legado.
- **082** `shared/__tests__/migration/migrate-projects.test.ts`: presente / idempotente / ausente / inválido.

**Checkpoint:** migração automática 1x; legado desativado. **Commit:** `feat(multi-project): single cutover migration to XDG registry`.

### 12.3 Fase 9 — Verificação + Sanitização + Documentação UX-Ótima (090–099)

**Diretriz UX (aprovada):** SSoT (modelo de projeto em UMA página canônica); navegação por intenção (hub de índice); progressive disclosure; cross-linking preciso; sem doc-espelho concorrente.

| Arquivo | Ação | Tipo |
| --- | --- | --- |
| `docs/07-projetos-registry.md` | **NOVO** (rewrite de `07-config-files.md`) — CANÔNICO: registry XDG, `ProjectEntry`, per-project `.env`, `--project`/`--dir`, migração Fase 8, setup, entry-menu | Core |
| `docs/README.md` | **NOVO** hub de índice de TODOS os 12 guias + `TECHDOC.md`, agrupado por intenção | Core |
| `docs/TECHDOC.md` | Atualizar (reference → registry); apontar p/ `07` | Core |
| `README.md` (raiz) | Corrigir L10/L39: `config/` → registry XDG; link `07` atualizado | Core |
| `docs/10-setup-wizard.md`, `docs/03-git-triggers.md`, `docs/08-fluxos-completos.md` | Corrigir p/ registry; linkar `07` | Core |
| `docs/00-install.md`, `docs/02-jira-management.md`, `docs/11-pr-report.md`, `docs/09-troubleshooting.md`, `docs/01-primeiros-passos.md`, `docs/06-env-vars.md` | Correções pontuais + seção per-project `.env` em `06` | Pontual |
| `internal_docs/TECHDOC.md` | **Apagar** (gitignored/untracked) | Limpeza |

Sanitização de strings obsoletas em `git_triggers/batch-mode.ts:66`, `interactive-mode.ts:841`, `git_triggers/main.test.ts:20`, `session-state.test.ts:186` → registry.

**090** `tsc --noEmit`=0 · **091** `eslint`=0 · **092** `vitest run` green · **093** coverage gate (stmts≥90/branches≥80/lines≥90/funcs≥91) inalterado · **094** E2E smoke (`--dir` registra + `.env`; entry-menu seleciona + overlay). **097** commit + push (`gh`, timeout ≥300s) · **098** monitorar CI via GitHub API (`GITHUB_TOKEN` Bearer). **099** CHECKPOINTs reais + status table.

### 12.4 Mapa de impacto consolidado (Fases 7–9)

**Modificar:** `setup/main.ts`, `setup/context.ts`, `setup/config-writer.ts`, `setup/main.test.ts`, `setup/config-writer.test.ts`, `shared/env-loader.ts` (+`writeProjectEnvOverlay`), `shared/migration/migrate-projects.ts` (NOVO), `shared/__tests__/migration/migrate-projects.test.ts` (NOVO), `shared/entry-menu.ts`, `git_triggers/session-state.ts`, `git_triggers/batch-mode.ts`, `git_triggers/interactive-mode.ts`, `git_triggers/main.test.ts`, `git_triggers/session-state.test.ts`, `docs/TECHDOC.md`, `README.md`.
**Criar:** `shared/migration/migrate-projects.ts`, `shared/__tests__/migration/migrate-projects.test.ts`, `docs/07-projetos-registry.md`, `docs/README.md`, `shared/__tests__/integration/setup-wizard.integration.test.ts`.
**Apagar:** `internal_docs/TECHDOC.md` (untracked), `writeProjectsConfig`/`makeProjectEntry`/`ensureConfigDir` (código obsoleto), `config/projects.json` dual-write.
**Legado a sanitizar:** strings `config/projects.json`/`providers.json` em 10 arquivos de doc.

### 12.5 Auditoria final (aceite)

- A1. `grep -rn "writeProjectsConfig|config/projects.json|providers.json" --include="*.ts" docs/ README.md` = 0 (exceto seção migração em `07`).
- A2. `--dir` inexistente → erro explícito (teste afirma).
- A3. Pós-wizard: `loadRegistry()[name]` com `dir`/`jiraKey`/`framework` corretos.
- A4. `projectEnvPath(name)` existe com `QA_PROJECT_*` conforme entry.
- A5. `getProjects()` reflete registry; `migrateLegacyProjects` idempotente/ausente→no-op/inválido→erro.
- A6. `tsc`/`eslint`/`vitest` green; coverage gate atingido.
- A7. `docs/README.md` lista 12 guias + TECHDOC; toda página de projeto linka `07`.
- A8. `internal_docs/TECHDOC.md` ausente; CI `conclusion: success`.

### 12.6 Decisões confirmadas (usuário aprovou)

- Bootstrap da migração: `shared/entry-menu.ts` `_initInfrastructure`.
- Writer `.env`: `shared/env-loader.ts`.
- Doc: renomear para `docs/07-projetos-registry.md` (atualizar link no README raiz L39).
- `docs/README.md` indexa TODOS os 12 guias + TECHDOC.
