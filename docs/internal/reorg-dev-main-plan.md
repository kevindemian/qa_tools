# Plano de Reestruturação — Separação dev/main + Sanitização

**Status:** Planejamento (não iniciado)
**Branch alvo:** `feat/codebase-reorg`
**Autoridade:** Decisões do usuário (ZERO SCRIPTS cumprido e vigente; hidden-meadow é apenas referência de estilo, não autoridade).
**Princípio:** Separação lógica (não criar pasta `src/`); build já separa dev/prod via `tsconfig.build.json`.

---

## 0. Fronteira dev/main (já existente, será reforçada)

| Camada | Conteúdo | Empacotado (`dist/`)? |
|--------|----------|----------------------|
| **MAIN (runtime)** | `jira_management/` (exceto testes), `git_triggers/` (exceto testes), `shared/` (exceto `__tests__/`, `test-utils/`, `plans/`, `prompts/*.md`) | ✅ |
| **DEV** | `scripts/`, `audit/`, `.github/`, `e2e/`, `setup/`, todos `*.test.ts`/`__tests__/`, `docs/`, `*.md` de plano | ❌ |

Build: `tsconfig.build.json` inclui `shared/**`, `jira_management/**`, `git_triggers/**`; exclui `**/*.test.ts`, `e2e/**`, `setup/**`, `archive/**`. Globs `shared/**` capturam novas subpastas automaticamente (sem edição de build).

---

## 1. Fases e Tarefas Atômicas

Cada tarefa é **atômica, commitável e testável**: termina com `tsc --noEmit` + `vitest run` + `eslint` + `depcruise` verdes, e um checkpoint explícito.

### FASE 0 — Preparação e Baseline

**T0.1** Criar branch `feat/codebase-reorg` a partir de `dev`; garantir working tree limpo.
- Critério: `git status --short` vazio (exceto intencionais); branch ativa = `feat/codebase-reorg`.
- Checkpoint: branch criada.

**T0.2** Capturar baseline de qualidade (referência para comparação de coverage/erros).
- Comandos: `npx tsc --noEmit` (0 erros), `npx vitest run` (contar testes pass), `npx eslint .` (0 erros), `npx depcruise --config .dependency-cruiser.js . --output-type err` (0 violações), `npx vitest run --coverage` (anotar %).
- Critério: números registrados no checkpoint.

**BASELINE CAPTURADO (F0, 2026-07-17):**
- `npx tsc --noEmit` → 0 erros
- `npx eslint .` → 0 erros / 687 warnings (pré-existentes, não bloqueiam)
- `npx depcruise` → 0 violações (956 módulos, 3785 deps)
- `npx vitest run` → 7063 pass / 18 skip (7081 total), 516 files passed / 4 skipped

### FASE 1 — Sanitização (wrappers / órfãos) — toca `main`

**T1.1** Eliminar `shared/config.ts` (barrel trivial `export { default } from './config-accessor.js'`).
- Arquivos: `shared/config.ts` (DELETE); 21 consumidores de produção + 15 mocks de teste que fazem `from '../shared/config.js'` → `from '../shared/config-accessor.js'` (inclui `jira_management/main.ts:1`).
- Consumidores prod: `jira_management/{xray-client,jira-resource-sprint,result_reporter,import-prep-parsers,precondition-importer,import-orchestrator,main,coverage,menu-data,ui-helpers,import-prep-preview,test-execution-creator,xray-history}.ts`, `jira_management/commands/{case17,case01,case15}.ts`, `git_triggers/{test-results,interactive-mode,batch-mode,session-state,pipeline-jira}.ts` (mais e2e/ e testes).
- Critério: `shared/config.ts` não existe; `grep -rn "shared/config.js" --include=*.ts .` retorna 0; `tsc --noEmit`=0; `vitest run` verde.
- Checkpoint S1a.

**T1.2** Eliminar `shared/env-utils.ts` (barrel trivial de `env-loader`).
- Arquivos: `shared/env-utils.ts` (DELETE); `shared/config-accessor.ts:1` → `from './env-loader.js'`; remover `shared/env-utils.ts` de `vitest.config.ts:29` (coverage.exclude).
- Critério: arquivo ausente; `tsc`=0; `vitest` verde; `grep "shared/env-utils"` = 0.
- Checkpoint S1b.

**T1.3** Colapsar `git_triggers/pr-report-entry.ts` em `shared/pr-report-core.ts`.
- Arquivos: `git_triggers/pr-report-entry.ts` (DELETE); fundir `mainWithProvider()` (injeta `createGitProvider`) inline em `shared/pr-report-core.ts` (que já tem self-exec guard); atualizar 4 refs por STRING: `.github/workflows/qa-post-process.yml:38`, `setup/templates/github-ci.ts:31`, `setup/templates/qa-post-process-workflow.ts:49`, `shared/ci-injector.ts:93` (+ comentários); atualizar 3 testes: `setup/templates/github-ci.test.ts:106`, `setup/templates/qa-post-process-workflow.test.ts:54,57`, `shared/ci-injector.test.ts:144,147`.
- Critério: `pr-report-entry.ts` ausente; `grep "pr-report-entry"` = 0; `npx tsx shared/pr-report-core.ts --ctrf <report>` funciona; `tsc`=0; `vitest` verde (incluindo `ci-injector.test.ts`, `github-ci.test.ts`).
- Checkpoint S1c.

**T1.4** Remover órfãos de produção (compilados para `dist/` mas nunca alcançáveis).
- Arquivos (com testes):
  - `shared/readline.ts` + `shared/readline.test.ts` (DELETE) — zero importadores.
  - `jira_management/cypress_test.ts` + `jira_management/cypress_test.test.ts` (DELETE).
  - `jira_management/cypress_resource.ts` + `jira_management/cypress_resource.test.ts` (DELETE).
- Pós: corrigir `eslint.config.mjs:305` (mensagem que cita `shared/readline` vira obsoleta ao remover o arquivo).
- Critério: arquivos ausentes; `grep -rn "shared/readline\|cypress_test\|cypress_resource" --include=*.ts` (exceto docs) = 0; `eslint`=0; `tsc`=0; `vitest` verde.
- Checkpoint S1d.

**T1.5** Remover `.bak` de código-fonte.
- Arquivos: `shared/xray-cloud-client.test.ts.bak`, `shared/config.test.ts.bak` (DELETE).
- Critério: ausentes; `find . -name '*.test.ts.bak'` (em código) = 0.
- Checkpoint S1e.

**T1.6** Decisão em `main`: remover exports de helpers de `jira_management/main.ts:484-485`.
- Arquivos: `jira_management/main.ts` remover `export { resolveAlias, buildMenuChoices, _configHint }` e `export { showHelp, showDocs, showHelpLoop, handleSpecialInput }`; mover para `jira_management/ui-helpers.ts` (se já não estiverem lá) ou módulo de domínio apropriado; atualizar importadores.
- Critério: `main.ts` não exporta helpers de UI; `tsc`=0; `vitest` verde.
- Checkpoint S1f.

### FASE 2 — Isolar Testes (dev vs prod)

**T2.1** Mover ~148 `*.test.ts` da raiz de `shared/` → `shared/__tests__/` (espelhado por subpasta onde aplicável).
- Critério: `ls shared/*.test.ts | wc -l` ≈ 0; `tsc`=0; `vitest` verde; coverage não cai >1%.
- Checkpoint S2a.

**T2.2** Mover ~40 `*.test.ts` da raiz de `jira_management/` → `jira_management/__tests__/` (+ `commands/__tests__/`).
- Critério: raiz de `jira_management/` sem `.test.ts`; `vitest` verde.
- Checkpoint S2b.

**T2.3** Mover ~32 `*.test.ts` da raiz de `git_triggers/` → `git_triggers/__tests__/`.
- Critério: raiz de `git_triggers/` sem `.test.ts`; `vitest` verde.
- Checkpoint S2c.

### FASE 3 — Subpastificação de `shared/` (162 arquivos → 7+ subpastas)

**T3.0** Criar barrels por subpasta (`shared/llm/index.ts`, `shared/ui/index.ts`, `shared/report/index.ts`, `shared/ci/index.ts`, `shared/infra/index.ts`, `shared/validation/index.ts`, `shared/quality/index.ts`) para minimizar edições de import path.
- Critério: barrels criados; `tsc`=0.

**T3.1** `shared/llm/` (19 arquivos: `llm-*`, `model-*`).
- Mover; atualizar imports internos + externos (e2e/llm-pipeline.test.ts, jira_management/commands/case18.ts, git_triggers/{ai-pr-desc,ai-test-impact}).
- Critério: `find shared/llm -name '*.ts' | wc -l` ≈ 19; `tsc`=0; `vitest` verde; `depcruise`=0.
- Checkpoint S3a.

**T3.2** `shared/ui/` (24 arquivos: `prompt*`, `splash`, `spinner`, `output`, `palette`, `theme*`, `box`, `breadcrumbs`, `readline`(se mantido), `first-run`, `dashboard-menu`, `entry-menu`, `entry-menu-logic`, `cli_base`).
- Mover; **atualizar `qatools.sh:46`** para `shared/ui/entry-menu.ts` (ver F4).
- Critério: `find shared/ui -name '*.ts' | wc -l` ≈ 24; `tsc`=0; `vitest` verde.
- Checkpoint S3b.

**T3.3** `shared/report/` (30 arquivos: `report-*`, `html-factory`, `markdown*`, `bug-report`, `incident-report`, `ai-*`, `backlog-health`, `flakiness-dashboard`, `traceability-matrix`, `coverage-gap*`, `impact-alert`, `show-docs`).
- Critério: ~30 arquivos; `tsc`=0; `vitest` verde.
- Checkpoint S3c.

**T3.4** `shared/ci/` + `shared/jira/` (12 + 3: `ci-*`, `git-*`, `github-*`, `xray-cloud-client`; `jira-client`, `jira-auth`, `jira-helper` → `shared/jira/`).
- Critério: ~15 arquivos; `tsc`=0; `vitest` verde.
- Checkpoint S3d.

**T3.5** `shared/infra/` (8: `http-client`, `circuit-breaker`, `disk-cache`, `proxy-config`, `tls`, `temp-dir`, `store-backend`, `host-semaphore`).
- Critério: 8 arquivos; `tsc`=0; `vitest` verde.
- Checkpoint S3e.

**T3.6** `shared/validation/` (18: `*-validator`, `*-schema`, `quarantine`, `shared-invariants`, `validation`). `bug-report.schema.ts` ÚNICO aqui; `report/bug-report.ts` importa de `validation/`.
- Critério: 18 arquivos; `tsc`=0; `vitest` verde.
- Checkpoint S3f.

**T3.7** `shared/quality/` (20: `health-score`, `quality-*`, `release-score`, `requirement-score`, `defect-*`, `developer-profile`, `suite-optimization`, `silent-regression`, `data-quality`, `cross-squad-benchmark`, `targeted-retry`, `test-impact`, `run-comparison`, `benchmark-*`, `ai-feedback`, `pipeline-cost`).
- Critério: ~20 arquivos; `tsc`=0; `vitest` verde.
- Checkpoint S3g.

**T3.8** Verificação final subpastas: raiz de `shared/` deve reter só ~31 arquivos root (logger, errors, escape, sanitize, safe-json, quoted-string, date-utils, path-utils, types, state, session-context, pr-report-core, result_parser, log-parser, junit-xml-parser, framework-detection, project-*, feature-config, deps, env-loader, open, parse-project-flag, publish, field-names, config-accessor, config-schema, vitest-ctrf-reporter).
- Critério: `ls shared/*.ts | wc -l` ≈ 31; `depcruise .` = 0; `tsc`=0; `vitest` verde; coverage estável.
- Checkpoint S3h.

### FASE 4 — Corrigir Scripts de Inicialização (quebrados)

**T4.1** `qatools.sh:46` → apontar para `shared/ui/entry-menu.ts` (pós-T3.2).
- Critério: `grep -n "shared/ui/entry-menu.ts" qatools.sh` = 1 match; `bash -n qatools.sh` ok; `npx tsx shared/ui/entry-menu.ts --help` (ou equiv) executa.
- Checkpoint S4a.

**T4.2** Reconciliar hooks (`setup.sh` vs `.husky`/`.githooks`).
- Decisão: fonte única de hooks. Se `.husky/`: `setup.sh:48` → `git config core.hooksPath .husky` (ou remover, husky já gerencia); garantir `.husky/pre-commit` e `.husky/pre-push` contenham a lógica de segurança (--no-verify detection, validation hook, security scan) atualmente só em `.githooks/`.
- Critério: `git config core.hooksPath` aponta para fonte única; `.husky/pre-push` contém a detecção de `--no-verify` + validation hook + scan; `.githooks/` removido ou tornado espelho; `bash -n` dos hooks ok.
- Checkpoint S4b.

**T4.3** `qatools.ps1` / `qatools.bat` — alinhar descoberta de `entry-menu` com `.sh` (paridade) OU documentar assimetria explicitamente.
- Critério: decidido e aplicado; `node -c`/lint de sintaxe ok; documentado em `docs/`.
- Checkpoint S4c.

**T4.4** Revisar `scripts/sync-hooks.sh` (paths `/project/...` e `$HOME/.config/opencode/*` desatualizados) — corrigir paths ou marcar obsoleto com aviso.
- Critério: script funcional ou explicitamente marcado OBSOLETO com explicação; não quebra setup.
- Checkpoint S4d.

### FASE 5 — Limpeza de Lixo (não-fonte)

**T5.1** `archive/`, `cloud/*.log`, `shared/.local/state/*.json[.bak]` — confirmar `.gitignore` cobre runtime artifacts; deletar lixo versionado.
- Critério: lixo removido; `.gitignore` atualizado se necessário.
- Checkpoint S5a.

**T5.2** `shared/plans/` (md de planejamento) → `docs/internal/` (ou gitignored).
- Critério: `shared/plans/` vazio/ausente de código; docs em `docs/internal/`.
- Checkpoint S5b.

### FASE 6 — Auditoria Final e Merge

**T6.1** Auditoria completa (ver seção 4).
- Critério: todos os critérios de aceitação verdes.
- Checkpoint FINAL.

**T6.2** Sincronizar `main`←`feat/codebase-reorg` (main está 10 commits atrás de dev). Decidir merge direto ou via PR com CI.
- Critério: `main` contém reestruturação; CI verde em `main`.
- Checkpoint MERGE.

---

## 2. Decisões Pendentes (do usuário)

1. **`entry-menu.ts`**: manter em `shared/ui/entry-menu.ts` (autocontido, chamado por `qatools.sh`) ou promover a 4º bin (`qa-menu`)?
2. **Hooks**: fonte única = `.husky/` ou `.githooks/`?
3. **`qatools.ps1`/`.bat`**: descobrem `entry-menu` (paridade com `.sh`) ou só `.sh` o lança?
4. **`shared/vitest-ctrf-reporter.ts`** (dev-only): manter em `shared/` ou mover p/ `scripts/`/`e2e/`?
5. **Clientes Jira** (`jira-client`,`jira-auth`,`jira-helper`): `shared/jira/` (8ª subpasta) ou `shared/ci/`?
6. **Branch `main`**: sincronizar antes ou merge pós-Fase 3?

---

## 3. Ordem de Execução (cronológica)

F0 → F1 (T1.1→T1.6) → F2 (T2.1→T2.3) → F3 (T3.0→T3.8) → F4 (T4.1→T4.4) → F5 (T5.1→T5.2) → F6 (T6.1→T6.2)

Regra: **F1 antes de F3** (não mover lixo). **F3.2 antes de F4.1** (qatools.sh aponta para destino final).

### Política de Commit / Push (definida pelo usuário)
- **Commit ao fim de CADA tarefa** (T1.1, T1.2, ... T6.2) — commit atômico, mensagem descritiva.
- **Push ao fim de CADA fase** (F0, F1, F2, F3, F4, F5, F6) — `git push ssh://git@github.com/kevindemian/qa_tools.git feat/codebase-reorg`.
- Cada tarefa = 1 commit lógico; cada fase = 1 push.

---

## 4. Plano de Auditoria (Critérios Objetivos)

| Critério | Comando | Meta |
|----------|---------|-----|
| Compilação | `npx tsc --noEmit` | 0 erros |
| Testes | `npx vitest run` | 100% passam |
| Lint | `npx eslint .` | 0 erros |
| Dependency cruiser | `npx depcruise --config .dependency-cruiser.js . --output-type err` | 0 violações |
| Imports obsoletos | `grep -rn "shared/config.js\|shared/env-utils\|shared/llm-client\|shared/prompt.js" --include=*.ts .` | 0 |
| Subpastas | `find shared/llm shared/ui shared/report shared/ci shared/jira shared/infra shared/validation shared/quality -name '*.ts' \| wc -l` | ~162 |
| Raiz shared/ | `ls shared/*.ts \| wc -l` | ~31 |
| Testes isolados | `ls shared/*.test.ts jira_management/*.test.ts git_triggers/*.test.ts \| wc -l` | 0 |
| Scripts init | `bash -n qatools.sh setup.sh` + lint ps1/bat | sem erro de sintaxe |
| entry-menu alcançável | `grep -n "shared/ui/entry-menu.ts" qatools.sh` | 1 match |
| Hooks ativos | `git config core.hooksPath` == fonte única decidida | sem divergência |
| Wrappers eliminados | `test ! -f shared/config.ts && test ! -f shared/env-utils.ts && test ! -f git_triggers/pr-report-entry.ts` | OK |
| Cobertura | `npx vitest run --coverage` | não dim. >1% vs baseline |

---

## 5. Métricas de Sucesso

- `tsc`/`eslint`/`depcruise` = 0 erros/violações.
- 100% dos testes passam; cobertura estável (±1%).
- Raiz de `shared/` reduzida de ~164 → ~31 módulos.
- ~220 testes isolados em `__tests__/`.
- Zero wrappers/re-exports triviais; zero órfãos em `dist/`.
- Scripts de inicialização (`qatools.*`, `setup.sh`, hooks) íntegros e funcionais.
- `entry-menu` alcançável; hooks de segurança efetivamente executados.
