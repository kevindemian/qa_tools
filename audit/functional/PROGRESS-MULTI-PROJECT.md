# Progress — Multi-Projeto (Reconciled v2)

> Plano fonte: `.mimocode/plans/multi-project-support-RECONCILED.md`
> Convenções de checkpoint: ao concluir cada Fase, escrever `<!-- CHECKPOINT: Phase N complete -->` neste arquivo.

## Estado

| Fase | Escopo                                   | Status             |
| ---- | ---------------------------------------- | ------------------ |
| 0    | Fundação (001–006)                       | ✅ Done (cc52806b) |
| 1    | Project Registry CRUD (010–013)          | ✅ Done (4fa4733f) |
| 2    | Project Context + .env overlay (020–024) | ✅ Done (1db1cb7d) |
| 2    | Project Context + .env overlay (020–024) | 🔜 Pending         |
| 3    | State per project (030–032)              | 🔜 Pending         |
| 4    | Report/Artifact isolation (040–047)      | 🔜 Pending         |
| 5    | Entry Menu (050–055)                     | 🔜 Pending         |
| 6    | Module Integration (060–065)             | 🔜 Pending         |
| 7    | Setup Wizard (070–075)                   | 🔜 Pending         |
| 8    | Migração única (080–082)                 | 🔜 Pending         |
| 9    | Verificação (090–099)                    | 🔜 Pending         |

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
    <!-- CHECKPOINT: Phase 3 complete -->
    <!-- CHECKPOINT: Phase 4 complete -->
    <!-- CHECKPOINT: Phase 5 complete -->
    <!-- CHECKPOINT: Phase 6 complete -->
    <!-- CHECKPOINT: Phase 7 complete -->
    <!-- CHECKPOINT: Phase 8 complete -->
    <!-- CHECKPOINT: Phase 9 complete -->
