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
| 4    | Report/Artifact isolation (040–047)      | 🔜 Pending         |
| 5    | Entry Menu (050–055)                     | 🔜 Pending         |
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
- CI: run pendente de push (a ser registrado pós-monitoramento)
- `tsc --noEmit` = 0; `vitest run` = 6659 passed / 18 skipped (suite completa); 0 falhas
- Tarefas: 030 `statePath(projectName?)` → `<XDG state>/<proj>/state.json` (fallback legado) · 031 `GLOBAL_STATE_KEYS` (allowlist tipada) roteia `lastProject`/`_llm*` → `global.json`, operacionais → `<proj>/state.json`; `load` mescla · 032 `migrateLegacyState` (atômica/idempotente: split legado→global+operacional; `save` always-rewrite `global.json` propaga deleções); `getStatePath` mantém assinatura (display)
- **Resolução Q2 (auto-rota):** `resolveProjectName` — explícito válido → aquele projeto; explícito inválido → throw (path-traversal); senão `Config.get('qaCurrentProject')`: vazio → legado, inválido → throw (estado corrupto, fail-loud, sem degradação silenciosa). Reusa fonte de verdade da Fase 2; entrega isolamento 100% sem editar ~20 call sites.
- **Segurança:** `state.ts` importa só `Config` + `isValidProjectName` (sem ciclo); catches nunca vazios (logam + recuperam); zero silenciamento.
- **Testes:** `shared/__tests__/integration/state-project.integration.test.ts` (15: routing, auto-rota, safeguards, migração, isolation property A×B, load∘save=identity). Existentes `state.test.ts`/`state.integration.test.ts`/`state.property.test.ts` (33) permanecem verdes — split é transparente na mescla.
      <!-- CHECKPOINT: Phase 4 complete -->
      <!-- CHECKPOINT: Phase 5 complete -->
      <!-- CHECKPOINT: Phase 6 complete -->
      <!-- CHECKPOINT: Phase 7 complete -->
      <!-- CHECKPOINT: Phase 8 complete -->
      <!-- CHECKPOINT: Phase 9 complete -->
