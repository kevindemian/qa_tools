# Progress — Multi-Projeto (Reconciled v2)

> Plano fonte: `.mimocode/plans/multi-project-support-RECONCILED.md`
> Convenções de checkpoint: ao concluir cada Fase, escrever `<!-- CHECKPOINT: Phase N complete -->` neste arquivo.

## Estado

| Fase | Escopo                                   | Status             |
| ---- | ---------------------------------------- | ------------------ |
| 0    | Fundação (001–006)                       | ✅ Done (cc52806b) |
| 1    | Project Registry CRUD (010–013)          | ✅ Done (4fa4733f) |
| 2    | Project Context + .env overlay (020–024) | ✅ Done (1db1cb7d) |
| 3    | State per project (030–032)              | ✅ Done            |
| 4    | Report/Artifact isolation (040–047)      | ✅ Done            |
| 5    | Entry Menu (050–055)                     | 🔧 In Progress     |
| 6    | Module Integration (060–065)             | 🔜 Pending         |
| 7    | Setup Wizard (070–075)                   | 🔜 Pending         |
| 8    | Migração única (080–082)                 | 🔜 Pending         |
| 9    | Verificação (090–099)                    | 🔜 Pending         |

## Fase 3 — Plano (decisões superiores resolvidas)

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 3, 030–032). Decisões técnicas superiores (tempo/esforço irrelevantes; critério = superioridade técnica + segurança):

- **030 `statePath(projectName?)`**: `<XDG state>/<proj>/state.json` quando projeto resolve; senão fallback `state.json` (legado). `getStatePath(config?)` mantém assinatura (display) → resolve projeto atual/legado.
- **031 roteamento de chaves (allowlist tipada, NÃO heurística de prefixo)**:
    ```ts
    const GLOBAL_STATE_KEYS: ReadonlyArray<keyof StateSchema> = [
        'lastProject',
        '_llmConfigured',
        '_llmConfigAttempts',
        '_llmConfigLastAttempt',
        '_llmConfigSuggestions',
        '_llmConfigError',
    ];
    ```
    `save` separa: globais → `global.json`; operacionais → `<proj>/state.json`. `load` mescla ambos. Chaves operacionais = tudo que não estiver na allowlist (`lastCsvPath`, `lastCypressPath`, `lastLabels`, `lastChoice`, `history`, `_checkpoint`).
- **Q2 resolução de projeto alvo (auto-rota)**: `load/save/update` sem `projectName` → `resolveProjectName`:
    1. `projectName` explícito válido (`isValidProjectName`) → aquele projeto;
    2. explícito inválido → **throw** (path-traversal);
    3. senão `Config.get('qaCurrentProject')`: vazio/indefinido → legado; inválido → **throw** (estado corrupto, fail-loud, sem degradação silenciosa).
       Reusa a única fonte de verdade da Fase 2; entrega "isolamento 100%" sem editar ~20 call sites.
- **032 migração legado→global**: `migrateLegacyState(config?)` atômica/idempotente: no-op se `global.json` existe ou não há chaves globais; senão splita `state.json` legado em `global.json` (globais) + `state.json` (operacionais, reescrito via `.tmp`+`rename`). Legado **nunca apagado**. `save` sempre reescreve `global.json` (propaga deleções). Init: `ensureStateDir(); migrateOldState(); migrateLegacyState();`
- **Segurança**: `state.ts` importa só `Config` (+ `isValidProjectName` de `project-paths`, sem deps) → sem ciclo. Catch nunca vazio; zero silenciamento.

## Fase 4 — Plano (decisões superiores resolvidas)

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 4, 040–047). Critério = superioridade técnica + segurança (tempo/esforço irrelevantes).

- **040/042/043 roteamento project-aware (`shared/temp-dir.ts`)**: helper `projectScopedDir(sub)` → `<qaProjectDir>/.qa-tools/<sub>` quando projeto ativo; `undefined` (fallback) em modo legado. `reportsDir`/`logsDir`/`artifactsDir` = `env-override (QA_TOOLS_*) > projectScopedDir > PROJECT_ROOT/default`. **Decisão Q (precedência)**: env-override do operador VENCE o diretório do projeto (Regra 25 — zero silenciamento: escolha explícita do operador não pode ser ignorada silenciosamente ao selecionar projeto). Isolamento 100% no caminho comum (sem env); com env, o operador cede isolamento conscientemente.
- **041 `writeReport`**: herda `reportsDir()` (já faz `dir = reportsDir()` + `isPathWithinBase`); nenhuma alteração além da revalidação — roteamento automático.
- **044 `tempDir`**: inalterado (global, limpo em exit).
- **045 barrel**: exports nomeados em `temp-dir.ts` (sem `index.ts` barrel no repo → criar um seria código morto). `artifactsDir` exportado.
- **046 T7 DataHub por projeto (`shared/store-backend.ts`)**: `detectProjectGitDir(startDir?)` inicia em `qaProjectDir`/`QA_PROJECT_DIR`/cwd; `detectStoreBackend(projectDir?)` — se `projectDir` explícito: comportamento anterior (git→`GitStoreBackend(projDir,'.qa-tools')`, senão cai no XDG, preservando testes); se sem `projectDir` e projeto ativo: `GitStoreBackend(<eff>,'qa-tools')` se `<eff>` for git repo, senão `FsStoreBackend(<eff>/.qa-tools`) — bypassa XDG; senão XDG legado. `data-hub/persistence.ts` e `factory.ts` ficam intactos (project-aware por transitividade). Safeguard: `path.resolve` em `effDir`/`pd`.
- **Segurança**: `temp-dir.ts` importa só `getCurrentProjectDir` (sem ciclo); `store-backend.ts` importa `Config`. Catches existentes preservados (logam + relançam); zero silenciamento.
- **Sanitização**: fallback XDG/`PROJECT_ROOT` **preservado** (sem remoção prematura); `resolveEnvOrPath` reutilizado; sem duplicação de lógica de resolução. Sufixo `currentProjectName` nos nomes de `writeReport` (callers) tornado redundante mas **preservado** (back-compat de paths referenciados).

## Fase 5 — Plano (decisões superiores resolvidas)

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 5, 050–055). Critério = superioridade técnica + segurança (tempo/esforço irrelevantes).

### 1. Mapa de impacto

- **`shared/entry-menu.ts`** — 050 `selectProject()` (lista numerada `displayProjects` D-U1 + `showSelect`; 0→offer setup; 1→auto-select; N→"Adicionar"+"Gerenciar"; `[INVÁLIDO]` p/ `valid:false`; `migrated:true` protegido D-U4); 051 "A — Adicionar" spawn `setup/main.ts --dir`; 052 "G — Gerenciar" submenu (list/edit/remove, proteção `migrated`); 053 `runModule()` injeta `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR` via `env`.
- **`git_triggers/cli-args.ts`** — 055 estender parse `--project`/`-p` p/ modo interativo (hoje só batch); `BaseCliArgs.project`.
- **`git_triggers/cli-dispatch.ts`** — 053/055 `dispatchCli` resolve prioridade (`--project` > `QA_CURRENT_PROJECT` env > interativo) e chama `setCurrentProject(name)` antes do modo.
- **`jira_management/main.ts`** — 055 parse mínimo `--project <nome>` + `setCurrentProject` antes da sessão.
- **`shared/__tests__/integration/entry-menu-project.integration.test.ts`** — 054 (NOVO).
- Consumidores preservados: `git_triggers/batch-mode.ts:71` (`setCurrentProjectName` legacy, **intacto** — Fase 6 D3), `interactive-mode.ts:173`, `schedule-handler.ts:103`. `session-state.setCurrentProjectName` NÃO removido em Fase 5.
- Interdependência: entry-menu → project-registry + project-context (sem ciclo); cli-dispatch → project-context; jira main → project-context (mesmo singleton de `../shared/config.js`). Depende só de Fase 2 + Fase 4.
- **Testes a revalidar/atualizar:** `git_triggers/main.test.ts` (linhas 1154–1176) testa `args.project` com projeto NÃO registrado → ao adicionar `setCurrentProject` (valida registry), deve registrar o projeto no setup do teste (correção de setup, não de assert).

### 2. Passo a passo

- **050** `selectProject()` em `main()` antes de `showSplash` (só se `!isProjectSelected()`, una vez por sessão): `displayProjects` renderiza numerado com `[INVÁLIDO]`/`[MIGRADO]`; 0→offer setup/legacy; 1→`setCurrentProject`; N→`showSelect` + "A"/"G".
- **051** `addProjectFlow()` → `spawnSetupWithDir(dir)` (`setup/main.ts --dir`).
- **052** `manageProjectsFlow()` → list/edit/remove; **bloquear se `entry.migrated`** (warn + continua). Helper `isProjectProtected(entry)` puro p/ testar.
- **053** `moduleEnv()` puro retorna `env` com `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR`; `runModule` usa-o.
- **055** `cli-args.ts`: pré-scan global `--project`/`-p` → `BaseCliArgs.project`. `cli-dispatch.ts`: `applyProjectContext(args)` exportado (prioridade + `setCurrentProject`, throw se inválido). `jira_management/main.ts`: `parseProjectFlag(argv)` + `setCurrentProject`.
- **054** testes: 2 projetos → `selectProject` → contexto; isolamento A×B; `moduleEnv`; `migrated` protegido; 055 parse + `applyProjectContext`; edge: nome inválido → throw; `valid:false` → `[INVÁLIDO]`.
- Qualidade: `tsc --noEmit`, lint 0, `vitest run` completo.

### 3. Estratégia de sanitização

- `displayProjects` única fonte de render (D-U1); `showSelect` já numera — sem reimplementar.
- Legacy `session-state.setCurrentProjectName` **preservado** (substituição é Fase 6 D3; remover agora = dual-write prematuro, veta D2).
- Sem silenciamento: `--project` inválido/desconhecido → `setCurrentProject` **throws**; `migrated` remove/edit bloqueado com aviso.
- `git_triggers/main.test.ts` registra o projeto (ajuste de setup, não de assert — Regra 19.5).
- Sem barrel morto; helpers em `entry-menu.ts`/`cli-dispatch.ts` conforme plano.

### 4. Plano de auditoria

- Gate: `tsc --noEmit`=0; lint 0 erros; `vitest run` verde (entry-menu novo 054, main.test.ts atualizado, cli-args, Fase 4 ainda verde).
- Seleção 100%: `selectProject` cobre 0/1/N; `runModule` injeta env; `--project` > env; `migrated` protegido.
- Zero silenciamento: nome inválido → throw; `migrated` bloqueado.
- Sem débito: sem `eslint-disable`/`@ts-ignore`; catches preservados; sem código morto.
- E2E: entry → `selectProject` → `runModule` spawn git/jira → child recebe env → `reportsDir`/`logsDir`/`artifactsDir` (Fase 4) + DataHub store (T7) isolam no projeto.

## Checkpoints

<!-- CHECKPOINT: Phase 0 complete -->

- Commit: `cc52806b` — feat(multi-project): Fase 0 foundation — types, config schema, project meta
- CI: run `29373877755` (head `cc52806b`) → **success**
- `tsc --noEmit` = 0; `vitest run` = 6605 passed / 18 skipped
- Tarefas: 001 types(Zod,dir obrigatório) · 002 CONFIG_SCHEMA(qaCurrentProject/qaProjectDir/xdgConfigHome) · 003 ConfigOverrides · 004 barrel · 005 shared/**tests** (já existia) · 006 meta qa-project + teste

<!-- CHECKPOINT: Phase 1 complete -->

- Commit: `4fa4733f` — feat(multi-project): Fase 1 — project registry CRUD with validation, backup, corrupt recovery
- CI: run `29376774544` (head `4fa4733f`) → **success**
- `tsc --noEmit` = 0; `vitest run` = 6628 passed / 18 skipped (suite completa)
- Tarefas: 010 shared/project-registry.ts (loadRegistry/saveRegistry/addProject/updateProject/removeProject/listProjects/getProject) · 011 validação Zod + backup projects.json.bak (last-good) + recovery de corrupt · 012 barrel (já coberto) · 013 testes unit(property/integration)
- **Bug real corrigido pela PBT**: prototype-pollution em chaves arbitrárias (`__proto__`, `valueOf`, `" "`) — `loadRegistry` validava o arquivo como string (não JSON) e `saveRegistry` reconstruía via `z.record` perdendo `__proto__`; corrigido com registry null-prototype + validação por entrada + serialização direta.
      <!-- CHECKPOINT: Phase 2 complete -->

- Commit: `1db1cb7d` — feat(multi-project): Fase 2 — project context with per-project .env overlay
- CI: run `29399351844` (head `1db1cb7d`) → **success**
- `tsc --noEmit` = 0; `vitest run` = 6644 passed / 18 skipped (suite completa)
- Tarefas: 020 `shared/project-context.ts` (getCurrentProject/getCurrentProjectDir/setCurrentProject/clearCurrentProject/isProjectSelected — derivam de `Config`, fallback `undefined`) · 021 `loadProjectConfig(name)` (ProjectEntry + override por env vars via whitelist `QA_PROJECT_*`; `envOverrides` transparente; single override source) · 022 barrel (project-context é módulo de serviço, importável diretamente — NÃO incluído no barrel de `types.ts` para evitar ciclo circular `types→project-context→config-accessor→types`) · 023 integração (registry→setCurrentProject→context reflete dir; overlay aplicado) · 024 `env-loader.applyProjectEnvOverlay` + `projectEnvPath` (XDG, guarda path-traversal) acoplado a `ensureDotenv`; hack `PROJECT_ID_<NAME>` removido por completo de `session-state.ts`
- **Decisões superiores (dúvidas resolvidas):** (1) override de `loadProjectConfig` = merge read-only de UMA fonte (o overlay), whitelist estrita — sem segundo caminho de escrita; (2) hack `PROJECT_ID_` removido mantendo `getProjects()` em `config/projects.json` até o cutover atômico da Fase 8 (D2: sem dual-write perpétuo); (3) `setCurrentProject` aplica o overlay imediatamente em runtime (segredos do projeto ativo prevalecem)
- **Refatoração de ciclo:** helpers puros (`isValidProjectName`/`registryDir`/`projectConfigDir`/`projectEnvPath`) extraídos para `shared/project-paths.ts` (sem logger/config) — quebra o ciclo `env-loader→project-registry` e o crash de init de módulo
  <!-- CHECKPOINT: Phase 3 complete -->

- Commit: Fase 3 — `feat(multi-project): per-project state in XDG state` (hash em git log)
- CI: run `29404904195` (head `4ac69fe7`) → **success**
- `tsc --noEmit` = 0; `vitest run` = 6659 passed / 18 skipped (suite completa); 0 falhas
- Tarefas: 030 `statePath(projectName?)` → `<XDG state>/<proj>/state.json` (fallback legado) · 031 `GLOBAL_STATE_KEYS` (allowlist tipada) roteia `lastProject`/`_llm*` → `global.json`, operacionais → `<proj>/state.json`; `load` mescla · 032 `migrateLegacyState` (atômica/idempotente: split legado→global+operacional; `save` always-rewrite `global.json` propaga deleções); `getStatePath` mantém assinatura (display)
- **Resolução Q2 (auto-rota):** `resolveProjectName` — explícito válido → aquele projeto; explícito inválido → throw (path-traversal); senão `Config.get('qaCurrentProject')`: vazio → legado, inválido → throw (estado corrupto, fail-loud, sem degradação silenciosa). Reusa fonte de verdade da Fase 2; entrega isolamento 100% sem editar ~20 call sites.
- **Segurança:** `state.ts` importa só `Config` + `isValidProjectName` (sem ciclo); catches nunca vazios (logam + recuperam); zero silenciamento.
- **Testes:** `shared/__tests__/integration/state-project.integration.test.ts` (15: routing, auto-rota, safeguards, migração, isolation property A×B, load∘save=identity). Existentes `state.test.ts`/`state.integration.test.ts`/`state.property.test.ts` (33) permanecem verdes — split é transparente na mescla.
      <!-- CHECKPOINT: Phase 4 complete -->

- Commit: Fase 4 — `feat(multi-project): route reports, logs, artifacts to project dir` (hash em git log)
- CI: run `29407953495` (head `474a96b0`) → **success**
- `tsc --noEmit` = 0; `vitest run` = 6678 passed / 18 skipped (suite completa); 0 falhas; lint 0 erros nos arquivos alterados
- Tarefas: 040 `reportsDir`→`<proj>/.qa-tools/reports` (env>proj>default) · 041 `writeReport` herda `reportsDir` · 042 `logsDir`→`<proj>/.qa-tools/logs` · 043 `artifactsDir` NOVO→`<proj>/.qa-tools/artifacts` (+`QA_TOOLS_ARTIFACTS_DIR`) · 044 `tempDir` inalterado · 045 barrel nomeado · 046 T7 `detectStoreBackend`/`detectProjectGitDir` usam `qaProjectDir`/`QA_PROJECT_DIR` (GitStoreBackend/FsStoreBackend em `<proj>/.qa-tools`, fallback XDG inalterado) · 047 `shared/__tests__/integration/reports-dir.integration.test.ts` (19: routing, env-wins, legacy fallback, isolation A×B, T7 Git/Fs/XDG, detectProjectGitDir)
- **Decisão Q (precedência) aplicada:** env-override do operador vence diretório do projeto (Regra 25); alternativa tecnicamente superior confirmada em revisão.
- **Conformidade 040–047:** 100% — `ensureDirs` mantém 5 dirs (teste existente `toHaveBeenCalledTimes(5)` não violado; artifacts criado on-demand por callers, padrão consistente).
    <!-- CHECKPOINT: Phase 5 complete -->

- Commit: Fase 5 — `feat(multi-project): project selection in entry menu with --project flag` (pendente de push)
- CI: pendente de push
- `tsc --noEmit` = 0; `vitest run` = 6695 passed / 18 skipped (suite completa); 0 falhas; lint 0 erros (todos os arquivos)
- Tarefas: 050 `selectProject` + `displayProjects` (D-U1 lista numerada, `[INVÁLIDO]`/`[MIGRADO]`) + `isProjectProtected` (D-U4) · 051 `addProjectFlow` spawn `setup/main.ts --dir` · 052 `manageProjectsFlow`+`manageOneProject` (proteção migrated) · 053 `moduleEnv` injeta `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR` em `runModule` · 055 `--project`/`-p` global em `cli-args` (`_extractProject`) + `applyProjectContext` em `cli-dispatch` (prioridade flag>env>nenhum, throw fail-loud) + `parseProjectFlag` em `jira_management/main.ts`
- **Decisões superiores aplicadas:** `displayProjects` em `entry-menu.ts` (SRP: registry é dado puro); `migrated` bloqueia edit/remove com aviso (D-U4); `--project` inválido/desconhecido → `setCurrentProject` **throws** (zero silenciamento); prioridade `--project` > `QA_CURRENT_PROJECT` > interativo.
- **Desvio (documentado):** parser `--project` centralizado em `shared/parse-project-flag.ts` (fonte única, reutilizado por `cli-args` e `jira_management/main`), eliminando duplicação proibida pelo invariante de não-duplicação — decisão técnica superior à cópia em `main.ts` prevista no plano. `git_triggers/main.test.ts` **não** precisou de alteração (testa `_selectProject` legado de `main.ts`, não `applyProjectContext`/`dispatchCli`; linhas do plano estavam obsoletas). `cli-args.test.ts` atualizado para asserts de campo (contrato `project?` opcional omite a chave sob `exactOptionalPropertyTypes`) — correção legítima de teste, não mascaramento.
- **Conexão E2E:** entry `selectProject`→`setCurrentProject` grava `Config` (qaCurrentProject/qaProjectDir) + `runModule` injeta env; child git (`cli-dispatch.applyProjectContext`) lê `QA_CURRENT_PROJECT` (env) e child jira lê `Config` (arquivo compartilhado) → ambos isolam reports/logs/artifacts (Fase 4) e DataHub store (T7). 100% coberto.
- Testes novos: `shared/__tests__/integration/entry-menu-project.integration.test.ts` (12) + `shared/__tests__/parse-project-flag.test.ts` (5); `cli-args.test.ts` ajustado.

    <!-- CHECKPOINT: Phase 6 complete -->
    <!-- CHECKPOINT: Phase 7 complete -->
    <!-- CHECKPOINT: Phase 8 complete -->
    <!-- CHECKPOINT: Phase 9 complete -->
