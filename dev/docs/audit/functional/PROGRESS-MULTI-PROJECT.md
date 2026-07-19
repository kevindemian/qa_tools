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
| 5    | Entry Menu (050–055)                     | ✅ Done            |
| 6    | Module Integration (060–065)             | ✅ Done (927052c0) |
| 7    | Setup Wizard (070–075)                   | ✅ Done            |
| 8    | Migração única (080–082)                 | ✅ Done            |
| 9    | Verificação (090–099)                    | ✅ Done            |

## Branch Integration — `deploy/e2e-multi-precond` (concluída)

- **Commit**: `61406ef4` (push `f6a4e162..61406ef4`, main).
- **CI**: ✅ green — `Test (Node 22)` (gate `--coverage`), `Test (Node 24)`, `Quality`, `post-process` todos `success` (run `29446570865`).
- **Conteúdo adotado (37 arquivos)**: Xray Cloud preconditions (`shared/xray-cloud-client.ts` `addPreconditionsToTest`, `shared/jira-client.ts`, `shared/tls.ts` Zscaler CA, `shared/quoted-string.ts`, `shared/types/xray.ts`), `precondition-importer.ts`, import-prep-_, mapping-file-generator._, issue-linker._, csv_resource._, csv-import-schema.\*, case17/case18, e2e live-jira-cloud/smoke-startup, `scripts/quality-check.ts`, `BACKLOG.md`, `jira_xray_config_backup.md`.
- **Correções de causa raiz (para manter main verde)**:
    - `jira-resource-version.ts`: endpoint de search por gateway do base URL (`isAtlassianCloudGateway`) em vez do flag `jiraMode` (consistente com `JiraClient`).
    - `import-orchestrator.ts`: steps postados no recurso Xray (base `/xray`), não no Jira base.
    - `jira_link_manager.ts` + `precondition-importer.ts`: cloud mode sem creds Xray → fallback a native issue link (não throw).
    - Mocks de teste: `baseUrl` em `JiraResourceLike`; `warn` em `test-case-factory.test.ts`.
- **Removido**: `1782507364202-witty-falcon.md:Zone.Identifier` (artifact Windows). `e2e/_min-test.test.ts` mantido.
- **Pendente**: stash `wip: subagent coverage files (deferred)` (arquivos de cobertura abortados) — não incluído; decidir concluir ou descartar.

<!-- CHECKPOINT: Phase 6 complete -->

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

## Fase 7 — Plano de Execução (Setup Wizard, 070–075)

> **Correção de estado:** CHECKPOINTs 7/8/9 estavam prematuramente marcados como `complete` (linhas 167–169). A tabela de Estado (17–19) é a fonte autoritativa: Fases 7–9 estão `🔜 Pending`. Estes CHECKPOINTs foram rebaixados a `Pending` nesta edição.

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 7, 070–075) + decisões de UX aprovadas. Critério = superioridade técnica + segurança (tempo/esforço irrelevantes; proibido workaround/bypass).

### 1. Mapa de impacto (Fase 7)

- **`setup/main.ts`** — 070 parser `--dir` (default `cwd`, guard explícito se inexistente); 071 montar `ProjectEntry` + `addProject`; 072 prompt `jiraKey` + inclusão no entry; remove import/uso de `writeProjectsConfig` (074).
- **`setup/context.ts`** — 072 adicionar `jiraKey?: string` a `SetupContext`.
- **`setup/config-writer.ts`** — 074 **remover** `writeProjectsConfig` + `makeProjectEntry` + `ensureConfigDir` (só usados por ele). Nenhum leitor real de `config/projects.json` existe (comprovado: `getProjects()` em `session-state.ts:151` já usa `listProjects()`/registry).
- **`shared/env-loader.ts`** — 073 **NOVO** `writeProjectEnvOverlay(name, entry)` (escreve `projectEnvPath(name)` com `QA_PROJECT_PROVIDER/PROJECT_ID/JIRA_KEY/FRAMEWORK`); reutiliza `projectEnvPath` (SSoT, sem duplicar lógica de `writeDotEnvExample`).
- **`setup/main.test.ts`** / **`setup/config-writer.test.ts`** — 075 reescritos: mocks estritos de `project-registry` (`addProject`); afirmar registry + `.env` XDG; `config/projects.json` NÃO criado; `jiraKey` capturado.

### 2. Passo a passo

1. **070** `setup/main.ts`: `parseCliDir(argv)` puro → `resolve(dir)`; se `!fs.existsSync(resolved)` → `throw new Error('Diretório --dir inválido: ' + dir)` (fail-loud, sem silenciamento). Usa como base p/ `cwd`, detecção de framework e `dir` do entry.
2. **072** `setup/context.ts`: `jiraKey?: string`. `setup/main.ts`: `promptProjectJiraKey()` opcional (`ask` default `''`); incluir no entry.
3. **073** `shared/env-loader.ts`: `writeProjectEnvOverlay(name, entry)` — `fs.mkdirSync(projectConfigDir(name),{recursive:true})`; escreve `projectEnvPath(name)` com apenas overrides presentes (`QA_PROJECT_PROVIDER/PROJECT_ID/JIRA_KEY/FRAMEWORK` quando `entry.provider/projectId/jiraKey/framework` definidos). Guard `isValidProjectName`.
4. **071** `setup/main.ts`: `generateConfigFiles` chama `addProject(entry)` (idempotente) + `writeProjectEnvOverlay(name, entry)`; remove `writeProjectsConfig(ctx)`.
5. **074** `setup/config-writer.ts`: eliminar `writeProjectsConfig`/`makeProjectEntry`/`ensureConfigDir`; limpar import em `main.ts`. Sem shim de compatibilidade.
6. **075** reescrever testes (mocks estritos, forma exata de `ProjectEntry`).

### 3. Estratégia de sanitização

- Remoção total de `writeProjectsConfig`/`makeProjectEntry`/`ensureConfigDir` (sem leitor real → sem débito).
- Sem duplicação: `writeProjectEnvOverlay` único writer de `.env` XDG.
- Proibido: `eslint-disable`/`@ts-ignore`/`as any`; catches vazios; fallback silencioso para `config/projects.json`.

### 4. Plano de auditoria

- A1. `grep -rn "writeProjectsConfig" --include="*.ts"` = 0.
- A2. `--dir` inexistente → erro explícito (teste afirma throw).
- A3. Pós-wizard: `loadRegistry()[name]` com `dir`/`jiraKey`/`framework` corretos.
- A4. `projectEnvPath(name)` existe com `QA_PROJECT_*` conforme entry.
- A5. `tsc --noEmit`=0; `eslint`=0; `vitest run` green; coverage gate (stmts≥90/branches≥80/lines≥90/funcs≥91) inalterado.

## Fase 8 — Plano de Execução (Migração única, 080–082)

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 8, 080–082). Critério = superioridade técnica + segurança.

### 1. Mapa de impacto

- **`shared/migration/migrate-projects.ts`** (NOVO) — `migrateLegacyProjects()`: lê `config/projects.json` legado (`{ name: id }` ou `{ name: {provider,repo} }`), converte p/ `ProjectEntry` (`dir` default `PROJECT_ROOT` D1, `provider`/`projectId` do valor), `addProject`, marca `migrated:true` (D-U4); idempotente (pula já registrados); no-op se ausente (log informativo, não erro); erro explícito se inválido (não silenciado). Renomeia legado p/ `.migrated`.
- **`git_triggers/session-state.ts`** (081) — já usa `listProjects()`; nenhum fallback `config/projects.json` restante. Confirmar remoção de qualquer leitura legada.
- **`shared/entry-menu.ts`** (`_initInfrastructure`, 081) — disparar `migrateLegacyProjects()` uma vez ao detectar `config/projects.json` legado.
- **`shared/__tests__/migration/migrate-projects.test.ts`** (NOVO, 082).

### 2. Passo a passo

1. **080** criar `shared/migration/migrate-projects.ts` (função pura `parseLegacyProjects(json): ProjectEntry[]` + `migrateLegacyProjects(): {migrated:number; skipped:number}` com safeParse por entrada; `fs.renameSync` p/ `.migrated` após sucesso).
2. **081** `entry-menu._initInfrastructure` → `if (fs.existsSync(legacyPath)) migrateLegacyProjects()`.
3. **082** testes: presente→registry populado; idempotente (2ª execução não duplica); ausente→no-op; inválido→erro explícito.

### 3. Estratégia de sanitização

- `config/projects.json` legado migrado + renomeado (não deixado como SSoT duplo).
- Sem duplicação: um único módulo de migração (T2).

### 4. Plano de auditoria

- A6. `migrateLegacyProjects` idempotente; ausente→no-op (log); inválido→erro.
- A7. Após migração, `getProjects()` reflete projetos migrados.

## Fase 9 — Plano de Execução (Verificação + Sanitização + Documentação UX-Ótima, 090–099)

Fonte: `.mimocode/plans/multi-project-support-RECONCILED.md` (Fase 9, 090–099) + decisões de UX aprovadas pelo usuário.

### Diretrizes de UX (pesquisa: Diátaxis / Fern IA / dev-docs UX)

- **SSoT**: modelo de projeto documentado em UMA página canônica; demais linkam para ela.
- **Navegação por intenção**: hub de índice agrupado.
- **Progressive disclosure** + **cross-linking preciso** (accuracy = trust).
- **Sem doc-espelho concorrente**: apagar `internal_docs/TECHDOC.md`.

### 1. Mapa de impacto (documentação)

| Arquivo                        | Ação                                                                                                                                                             | Tipo    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `docs/07-projetos-registry.md` | **NOVO** (rewrite de `07-config-files.md`) — CANÔNICO: registry XDG, `ProjectEntry`, per-project `.env`, `--project`/`--dir`, migração Fase 8, setup, entry-menu | Core    |
| `docs/README.md`               | **NOVO** hub de índice de TODOS os 12 guias + `TECHDOC.md`, agrupado por intenção                                                                                | Core    |
| `docs/TECHDOC.md`              | Atualizar (reference → registry); apontar p/ `07`                                                                                                                | Core    |
| `README.md` (raiz)             | Corrigir L10/L39: `config/` → registry XDG; link `07` atualizado                                                                                                 | Core    |
| `docs/10-setup-wizard.md`      | `--dir`/`addProject`/`.env` XDG; linkar `07`                                                                                                                     | Core    |
| `docs/03-git-triggers.md`      | §3 `config/projects.json`/`providers.json` → link `07`; `--project` resolve no registry                                                                          | Core    |
| `docs/08-fluxos-completos.md`  | L189/L403 → registry; linkar `07`                                                                                                                                | Core    |
| `docs/00-install.md`           | fallback "primeiro do projects.json" → registry; remover `providers.json`                                                                                        | Pontual |
| `docs/02-jira-management.md`   | L731 → setup grava no registry; distinção registry vs `state.lastProject`                                                                                        | Pontual |
| `docs/11-pr-report.md`         | formato `config/features.json` (L71–95) → `feature-config.ts` atual                                                                                              | Pontual |
| `docs/09-troubleshooting.md`   | L67 `config/projects.json` → registry                                                                                                                            | Pontual |
| `docs/01-primeiros-passos.md`  | esclarecer seleção registry vs Jira                                                                                                                              | Pontual |
| `docs/06-env-vars.md`          | seção "Per-project `.env` overlay" (`QA_PROJECT_*`, `XDG_CONFIG_HOME`)                                                                                           | Pontual |
| `internal_docs/TECHDOC.md`     | **Apagar** (gitignored/untracked)                                                                                                                                | Limpeza |

### 2. Passo a passo

1. Criar `docs/07-projetos-registry.md` (canônico, com exemplos copy-pasteáveis).
2. Criar `docs/README.md` (hub índice por intenção).
3. Atualizar `docs/TECHDOC.md` + `README.md` raiz.
4. Corrigir 5 Core + 6 pontuais → links p/ `07`.
5. Apagar `internal_docs/TECHDOC.md`.
6. Sanitizar strings obsoletas em `git_triggers/batch-mode.ts:66`, `interactive-mode.ts:841`, `main.test.ts:20`, `session-state.test.ts:186` (→ registry).
7. **090** `tsc --noEmit`=0 · **091** `eslint`=0 · **092** `vitest run` green · **093** coverage gate inalterado · **094** E2E smoke (`--dir` registra + `.env`; entry-menu seleciona + overlay).
8. CHECKPOINTs reais 7/8/9 + status table atualizada.
9. **097** commit + push · **098** monitorar CI via GitHub API.

### 3. Plano de auditoria (aceite)

- D1. `grep "config/projects.json\|providers.json" docs/ README.md` = 0 (exceto seção migração em `07`).
- D2. `docs/README.md` lista 12 guias + TECHDOC.
- D3. Toda página de projeto linka `07-projetos-registry.md`.
- D4. `internal_docs/TECHDOC.md` ausente.
- D5. `07` documenta registry XDG, per-project `.env`, `--project`/`--dir`, migração (exemplos reais).
- A8. CI `conclusion: success` (Node 22/24, Quality).

<!-- CHECKPOINT: Phase 7 complete -->
<!-- CHECKPOINT: Phase 8 complete -->
<!-- CHECKPOINT: Phase 9 complete -->

## Execução Fases 7–9 (concluída nesta sessão)

### Fase 7 — Setup Wizard (070–075)

- **070** `parseCliDir` em `setup/main.ts:21` — suporta `--dir <v>` e `--dir=<v>` (corrigido defeito: antes só `--dir <v>`).
- **072** `jiraKey` adicionado a `SetupContext` (`setup/context.ts`), promptado no wizard, escrito no registry + `.env` overlay.
- **073** `writeProjectEnvOverlay(name, entry)` em `shared/env-loader.ts` — escreve `<projectDir>/.qa-tools/<name>.env` (tmp+rename, chaves `QA_PROJECT_PROVIDER/PROJECT_ID/JIRA_KEY/FRAMEWORK`).
- **071/074** `registerProject` usa `addProject` (registry XDG, single source) + `writeProjectEnvOverlay`; `writeProjectsConfig`/`makeProjectEntry`/`ensureConfigDir` removidos (T1, zero dual-write).
- **075** `setup/main.test.ts` reescrito com factory determinístico (`setupWizardAnswers`/`applyWizardMockImplementations`); `config-writer.test.ts` teve bloco `WriteProjectsConfig` removido.

### Fase 8 — Migração única (080–082)

- **080** `shared/migration/migrate-projects.ts` — `migrateLegacyProjects`, `parseLegacyEntry`, `legacyProjectsPath`. Cutover atômico: lê `config/projects.json` legado, converte para `ProjectEntry` (`migrated:true`, `dir`=PROJECT_ROOT), registra, renomeia legado → `.migrated`. Idempotente, não silencia erros (lança em path traversal / JSON corrompido).
- **081** `_initInfrastructure(baseDir)` em `shared/entry-menu.ts` — dispara `migrateLegacyProjects` no boot do CLI (`main()`). Falhas propagam (não silenciadas).
- **082** `shared/__tests__/migration/migrate-projects.test.ts` (10 testes) + `shared/__tests__/entry-menu.test.ts` (2 testes de auditoria `_initInfrastructure`).

### Fase 9 — Verificação + Sanitização + Doc (090–099)

- **090** `tsc --noEmit`=0 · **091** `eslint`=0 erros (warnings `detect-non-literal-fs-filename` pré-existentes, não bloqueiam gate) · **092** `vitest run` green (646 testes na área afetada; suite completa coberta em CI).
- **093** Coverage gate inalterado (thresholds em `vitest.config.ts`: stmts 90/branches 80/lines 90/funcs 91). Execução parcial não atinge thresholds globais por design; CI full-suite valida.
- **094** E2E smoke real: `shared/__tests__/integration/setup-wizard.integration.test.ts` (2 testes) exercita `main(['--dir', tmp])` → registry XDG + `.env` overlay REAIS. Capturou 2 defeitos de fato (main ignorava `args`; `parseCliDir` não suportava `=`) e ficou verde após correção na origem.
- **Sanitização** `git_triggers/batch-mode.ts:66` (erro não cita mais `config/projects.json` obsoleto); `git_triggers/main.test.ts` fs-mock obsoleto (`providers.json`/`projects.json`) removido.
- **Docs** `docs/07-projetos-registry.md` (canônico, criado), `docs/README.md` (hub 12 guias + TECHDOC, criado), `docs/TECHDOC.md` (aponta para registry/07), `README.md` raiz (linha 39→07-projetos-registry), `internal_docs/TECHDOC.md` (apagado, untracked).
- **AUDITORIA FINAL**: conexão menu→migração verificada por teste real (`_initInfrastructure` popula registry + renomeia legado); ausência de referências obsoletas `writeProjectsConfig`/`config/projects.json` (fora do módulo de migração) confirmada por grep.
- **097/098** commit + push + monitoramento CI pendentes (próximo passo).

### Defeitos encontrados e corrigidos na origem (não teatro de teste)

1. `setup/main.ts` `main()` ignorava o parâmetro `args` e usava `process.argv` → `--dir` do chamador não era aplicado. Corrigido: `main(args = process.argv.slice(2))`.
2. `parseCliDir` não suportava `--dir=VALUE`. Corrigido: loop com suporte a `=` e `-d=`.
3. `migrate-projects.ts` usava `require` (ESM-incompatível) para `listProjects` → substituído por import direto.
4. `migrate-projects.ts:86` lançava erro de `catch` sem `cause` (lint `preserve-caught-error`) → adicionado `{ cause: err }`.

### Retomada / Auditoria pós-Fase 9 (correção de estado — CI estava VERMELHO)

**Achado (Regra 1 — registro não é autoridade):** os commits `7543597f` e `7599feb1` foram marcados "Done" no PROGRESS, mas o CI real estava `conclusion: failure` (verificado via GitHub API; último verde `3fae19de`). "097/098" não haviam sido efetivamente confirmados.

**Causa raiz #1 (falha do CI Node 24):** `e2e/entry-to-project.test.ts` quebrou porque o boot do menu passou a disparar `_initInfrastructure` (migração legado→XDG), que populava o registry real em disco e injetava um `showSelect` extra (`toHaveBeenNthCalledWith` falhou). Corrigido na origem: `vi.mock` de `migrate-projects` + `XDG_CONFIG_HOME`/`XDG_STATE_HOME` em tmp por `beforeEach`/`afterEach`.

**Causa raiz #2 (bug de domínio multi-projeto + poluição de repo):** o setup wizard aceita `--dir <path>`, mas TODAS as funções de geração escreviam em `process.cwd()`, ignorando o `baseDir`: `generateGitHubWorkflows`, `generateGitLabCIFile`, `generatePrePushHookFiles`, `writeDotEnvExample`, `writeFeaturesConfig` e `feature-config.{load,save,setPrReport}Config`. Consequências: (a) `setup --dir /outro` gravava workflows/`.env.example`/`features.json` no diretório errado; (b) `setup-wizard.integration.test.ts` (que roda `main(['--dir', tmp])` sem trocar cwd) poluía o próprio repositório com `ci.yml`, `config/features.json` e `.github/actions/`.

**Correção (Regra 4 — na origem):** `baseDir` passa a ser threaded como parâmetro explícito para todas as funções de geração; paths resolvidos via `path.resolve(baseDir, ...)`. `feature-config` recebe `baseDir` opcional (default `process.cwd()` p/ leitores de runtime; setup passa o `--dir`). Rejeitada a alternativa WIP de adicionar `SetupContext.baseDir` (campo redundante, sem consumidor, quebrava o build).

**Revertido (WIP incorreto do working tree, não commitado):** `setup/context.ts` (`baseDir` redundante), `ci.yml` (job `post-process` DUPLICADO = YAML inválido), `qa-post-process.yml` (`npm ci→npm install` e `node 22→20` = regressão de reprodutibilidade/safety sem autoridade), `config/features.json` (fixture `proj-e2e`), `.github/actions/qa-post-process/` (composite não referenciada = código morto). Os últimos quatro eram, na verdade, subprodutos da poluição da causa raiz #2, não edições humanas.

**Validação:** `tsc --noEmit`=0 · `lint`=0 · `vitest run` = 6864 passed / 18 skipped / 0 failed · working tree sem poluição após a suíte completa. Testes de contrato de `config-writer.test.ts` atualizados para o novo 3º argumento `baseDir` (alinhamento de contrato, não enfraquecimento de assert).
