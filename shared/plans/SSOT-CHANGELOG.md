# SSOT — Registros Históricos (Changelog de Auditoria)

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED). Este arquivo consolida os registros históricos (inventários, matrizes, riscos, audit trail, status) para referência de auditoria.
> **STATUS: ✅ CONCLUÍDO** — Arquivo de auditoria/histórico (somente referência; não contém tarefas executáveis pendentes). Fechado em 2026-07-12.

## COMPLETE BYPASS INVENTORY

### Categoria A — DataHub.computed Available but Ignored (5 itens)

| ID  | Arquivo                    | Linha            | Campo DataHub Ignorado           | Fonte Atual                                    | Prioridade |
| --- | -------------------------- | ---------------- | -------------------------------- | ---------------------------------------------- | ---------- |
| A1  | `shared/health-score.ts`   | 200-208          | `dataHub.computed.coverage`      | `store.coverageHistory`                        | CRÍTICO    |
| A2  | `shared/health-score.ts`   | 179-181          | `dataHub.computed.executionRate` | `_computeExpWeighted()` local                  | CRÍTICO    |
| A3  | `shared/health-score.ts`   | 177              | `dataHub.computed.flakyTestRate` | `calculateFlakyTestRate(runs)` em MetricsStore | HIGH       |
| A4  | `shared/quality-gate.ts`   | via health-score | `coverage` (herdado)             | MetricsStore via health-score                  | CRÍTICO    |
| A5  | `shared/pr-report-core.ts` | 416              | `dataHub.computed.metricsTrends` | `calcMetricsTrends(store.runs)`                | HIGH       |

### Categoria B — Direct Filesystem Reads (5 itens)

| ID  | Arquivo                     | Linha    | Arquivo Lido                                            | DataHub Tem?                      | Prioridade |
| --- | --------------------------- | -------- | ------------------------------------------------------- | --------------------------------- | ---------- |
| B1  | `shared/coverage-source.ts` | 50, 53   | `coverage/coverage-summary.json`                        | SIM — `raw.coverage`              | MÉDIO      |
| B2  | `shared/pr-report-core.ts`  | 389      | Istanbul `readIstanbulCoverage()`                       | SIM — `raw.coverage`              | MÉDIO      |
| B3  | `shared/pr-report-core.ts`  | 728      | `reports/ctrf-report.json` via `parseTestResultsFile()` | SIM — parsed artifacts            | HIGH       |
| B4  | `shared/pr-report-core.ts`  | 190, 200 | `quarantine.json` via `isQuarantined()`                 | SIM — `computed.quarantineStatus` | MÉDIO      |
| B5  | `shared/session-context.ts` | 117-178  | `Store` class inteira (SHA cache, branch baseline)      | SIM — persistence layer           | CRÍTICO    |

### Categoria C — Direct CI API Calls Outside DataHub (3 itens)

| ID  | Arquivo                        | Linha  | API                                                          | DataHub Provider Faz Mesmo?                     | Prioridade |
| --- | ------------------------------ | ------ | ------------------------------------------------------------ | ----------------------------------------------- | ---------- |
| C1  | `shared/ci-test-downloader.ts` | 62-125 | GitHub/GitLab artifact download                              | SIM — `GitHubDataProvider`/`GitLabDataProvider` | CRÍTICO    |
| C2  | `git_triggers/test-results.ts` | 36-72  | `GitProvider.listPipelineArtifacts()` + `downloadArtifact()` | SIM — DataHub providers                         | HIGH       |
| C3  | `shared/commit-log.ts`         | 61-90  | GitHub/GitLab CI runs API                                    | SIM — `raw.runs[].head_commit`                  | MÉDIO      |

### Categoria D — MetricsStore Direct Access (18 sites em 12 arquivos)

| ID  | Arquivo                              | Linha                  | Dados Acessados                              | DataHub Tem? |
| --- | ------------------------------------ | ---------------------- | -------------------------------------------- | ------------ |
| D1  | `shared/cli_base.ts`                 | 218-219                | `store.runs`                                 | SIM          |
| D2  | `shared/coverage-gap.ts`             | 104-106                | `store.coverageHistory`                      | SIM          |
| D3  | `git_triggers/interactive-mode.ts`   | 258, 347-349, 442, 854 | `store.runs`, `store.failureClassifications` | SIM          |
| D4  | `git_triggers/schedule-handler.ts`   | 158-160, 210, 308-309  | `store.runs`, `store.failureClassifications` | SIM          |
| D5  | `git_triggers/batch-mode.ts`         | 212-213, 355-356       | `store.runs`                                 | SIM          |
| D6  | `git_triggers/pipeline-jira.ts`      | 22-30                  | `store.failureClassifications`               | SIM          |
| D7  | `jira_management/main.ts`            | 99-100, 343            | `store.coverageHistory`                      | SIM          |
| D8  | `jira_management/commands/case12.ts` | 86-88                  | `store.runs`, `store.coverageHistory`        | SIM          |
| D9  | `jira_management/commands/case17.ts` | 158-159, 218-219       | `store.runs`                                 | SIM          |
| D10 | `jira_management/commands/case19.ts` | 14-68, 100-101         | `store.runs` (todas as funções)              | SIM          |
| D11 | `jira_management/commands/case21.ts` | 43-44                  | `store.coverageHistory`                      | SIM          |
| D12 | `jira_management/commands/case22.ts` | 62-63                  | `store.runs`                                 | SIM          |
| D13 | `jira_management/commands/case26.ts` | 20-21                  | `store.runs`                                 | SIM          |
| D14 | `e2e/smoke-pipeline.ts`              | 111-113                | `metrics.runs`                               | SIM          |

### Categoria E — Arquivados Nunca Tocados pelo Phase 22 (3 itens)

| ID  | Arquivo                        | Commits Phase 22 | Status                             |
| --- | ------------------------------ | ---------------- | ---------------------------------- |
| E1  | `shared/ci-test-downloader.ts` | 0                | CI API direta — nunca migrado      |
| E2  | `shared/coverage-source.ts`    | 0                | Istanbul file read — nunca migrado |
| E3  | `shared/store.ts`              | 0                | Legacy persistence — nunca migrado |

### Categoria F — Dead Code / Compilation Errors (2 itens)

| ID  | Arquivo                                              | Linha | Problema                                                     | Prioridade |
| --- | ---------------------------------------------------- | ----- | ------------------------------------------------------------ | ---------- |
| F1  | `jira_management/commands/case17-test-utils.ts`      | 10    | TS2307: re-export de `git-artifact-downloader.ts` (deletado) | BLOCKER    |
| F2  | `shared/data-hub/extractors/test-count-extractor.ts` | todo  | Dead code — lógica duplicada em `hub.ts:338`                 | LOW        |

### Categoria G — Local Metric Computations Outside DataHub (1 item real)

| ID  | Arquivo                              | Linha | Calcula                                    | Bypass?                           |
| --- | ------------------------------------ | ----- | ------------------------------------------ | --------------------------------- |
| G1  | `jira_management/commands/case19.ts` | 21    | `(r.passed / (r.passed + r.failed)) * 100` | SIM — deve usar `calcRunPassRate` |

### Falsos Positivos (domínios diferentes — não são bypass)

| ID  | Arquivo                        | Linha | Calcula                         | Por que NÃO é bypass                      |
| --- | ------------------------------ | ----- | ------------------------------- | ----------------------------------------- |
| FP1 | `shared/coverage-gap-utils.ts` | 95    | `(covered / totalIssues) * 100` | Cobertura de issues Jira, não CI pipeline |
| FP2 | `shared/llm-benchmark.ts`      | 274   | `passCount / total`             | Avaliação de LLM, não pipeline de teste   |

---

## EXHAUSTIVE CONSUMER MATRIX

### health-score.ts — Consumer Map

| Caller                              | Arquivo               | Linha                   | Passa DataHub?    | Precisa Atualizar?     |
| ----------------------------------- | --------------------- | ----------------------- | ----------------- | ---------------------- |
| `calculateHealthScore(store, opts)` | `quality-gate.ts`     | 196                     | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store, opts)` | `pr-report-core.ts`   | 487                     | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store)`       | `cli_base.ts`         | 220                     | **NÃO**           | SIM                    |
| `calculateHealthScore(store, opts)` | `schedule-handler.ts` | 174, 213                | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store, opts)` | `interactive-mode.ts` | 378, 446, 496, 538, 856 | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store)`       | `main.ts`             | 344                     | **NÃO**           | SIM                    |
| `calculateHealthScore(store)`       | `case26.ts`           | 23                      | **NÃO**           | SIM                    |
| `calculateHealthScore(store)`       | `case19.ts`           | 70                      | **NÃO**           | SIM                    |

### quality-gate.ts — Consumer Map

| Caller                 | Arquivo               | Linha | Passa DataHub?    | Precisa Atualizar?     |
| ---------------------- | --------------------- | ----- | ----------------- | ---------------------- |
| `runQualityGate(opts)` | `pr-report-core.ts`   | 349   | Sim               | Se DataHub obrigatório |
| `runQualityGate(opts)` | `interactive-mode.ts` | 586   | Sim (conditional) | Se DataHub obrigatório |
| `runQualityGate(opts)` | `schedule-handler.ts` | 260   | Sim (conditional) | Se DataHub obrigatório |

### pr-report-core.ts — Consumer Map

| Caller                   | Arquivo                  | Linha | Passa DataHub?               | Precisa Atualizar?     |
| ------------------------ | ------------------------ | ----- | ---------------------------- | ---------------------- |
| `generatePrReport(opts)` | `pr-report-core.ts` main | 766   | Sim (via `tryCreateDataHub`) | Se DataHub obrigatório |
| `generatePrReport(opts)` | `batch-mode.ts`          | 113   | Sim (via param)              | Se DataHub obrigatório |

### session-context.ts — Consumer Map

| Caller                    | Arquivo                        | Linha | Precisa Atualizar?    |
| ------------------------- | ------------------------------ | ----- | --------------------- |
| `resolveTestDataSource()` | `case17.ts`                    | 339   | SIM (assinatura muda) |
| `resolveTestDataSource()` | `case15.ts`                    | 34    | SIM (assinatura muda) |
| `SessionContext` type     | `command-context.ts`           | 1     | SIM (assinatura muda) |
| `SessionContext` type     | `ui-helpers.ts`                | 10    | Tipo-only             |
| `SessionContext` type     | `session-state.ts`             | 7     | Tipo-only             |
| `SessionContext` type     | `handlers.test.ts`             | 37    | Teste                 |
| `SessionContext` type     | `_min-test.test.ts`            | 24    | Teste                 |
| `SessionContext` type     | `handlers-happy-paths.test.ts` | 47    | Teste                 |

### Jira Command Handlers — Consumer Map

| Case | Arquivo             | Bypass                                | DataHub no Context?              | Precisa Atualizar? |
| ---- | ------------------- | ------------------------------------- | -------------------------------- | ------------------ |
| 12   | `case12.ts:86`      | `store.runs`, `store.coverageHistory` | Não (CommandContext sem dataHub) | SIM                |
| 17   | `case17.ts:158,218` | `store.runs`                          | Não                              | SIM                |
| 19   | `case19.ts:100`     | `store.runs` + cálculo local          | Não                              | SIM                |
| 21   | `case21.ts:43`      | `store.coverageHistory`               | Não                              | SIM                |
| 22   | `case22.ts:62`      | `store.runs`                          | Não                              | SIM                |
| 26   | `case26.ts:20`      | `store.runs`                          | Não                              | SIM                |

---

## RISK REGISTER

| ID  | Risco                                                                                                    | Impacto | Probabilidade | Mitigação                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| R1  | `session-context.ts` tem 9 consumidores — mudança de assinatura quebra muitos                            | Alto    | Média         | Manter wrapper de compatibilidade temporário                                                                      |
| R2  | `commit-log.ts` usado por providers DataHub internamente                                                 | Alto    | Baixa         | Migrar providers para `raw.commitLog` ANTES de deletar                                                            |
| R3  | `store.ts` usado internamente por `persistence.ts` — não pode deletar só bloquear                        | Alto    | Baixa         | Manter como implementação interna, só mudar visibilidade                                                          |
| R4  | Testes de integração quebram — mocks desatualizados                                                      | Médio   | Alta          | Atualizar mocks em paralelo com produção                                                                          |
| R5  | `tsconfig.json` tem `exactOptionalPropertyTypes` — mudanças de tipo quebram                              | Médio   | Média         | Testar cada mudança com `npx tsc --noEmit`                                                                        |
| R6  | Casos Jira têm lógica condicional complexa — migração pode introduzir bugs                               | Alto    | Média         | Migrar um case por vez, testar individualmente                                                                    |
| R7  | ESLint rules novas podem quebrar CI                                                                      | Baixo   | Alta          | Testar ESLint localmente antes do push                                                                            |
| R8  | Consumidores silenciosos na Fase 8 podem ser muitos                                                      | Médio   | Baixa         | Fase 1-6 migra 35 bypasses conhecidos — silenciosos serão poucos                                                  |
| R9  | `handleError()` em `git-provider-error.ts` não usa `humanizeError` — afeta ~15 catch blocks              | Alto    | Média         | Atualizar `handleError()` para usar `extractErrorMessage` + `humanizeError` antes de deletar `ci-test-downloader` |
| R10 | `bare catch { return null; }` em `github-workflow.ts:330` e `gitlab-workflow.ts:210` — erros silenciados | Alto    | Média         | Adicionar `rootLogger.warn` + `extractErrorMessage` em Fase 0                                                     |
| R11 | `humanizeError` não cobre padrões de erro do GitHub/GitLab — erros de conexão CI passam sem contexto     | Médio   | Média         | Adicionar padrões 10-17 antes de implementar Fase 3-5                                                             |
| R12 | BadTesting em `create_tests.test.ts` — 5 testes com `toBeDefined()` como única asserção                  | Médio   | Alta          | Corrigir após Fase 4 com asserções de comportamento                                                               |

## AUDIT TRAIL

| Data       | Decisão                                                                                   | Motivo                                                                   | Autor    |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| 2026-07-09 | Inverter ordem: migrar primeiro, deletar depois                                           | Menos traumático, eficiente, consumidores silenciosos aparecem em testes | Usuário  |
| 2026-07-09 | Adicionar `dataHub?: DataHub` ao `CommandContext`                                         | Desbloqueia 6 case handlers de uma vez                                   | Plano    |
| 2026-07-09 | Manter `store.ts` como implementação interna do DataHub                                   | `persistence.ts` depende dele; não é bypass se for interno               | Plano    |
| 2026-07-09 | Tornar DataHub obrigatório (nunca opcional) em health-score, quality-gate, pr-report-core | Elimina caminhos de fallback que escondem bypasses                       | Plano    |
| 2026-07-09 | Checkpoint testável obrigatório para cada fase                                            | Evitar repetir o falso "✅" do Phase 22                                  | Usuário  |
| 2026-07-09 | Zero erros silenciosos — catch blocks DEVE usar `extractErrorMessage` + `humanizeError`   | Erros silenciosos = defeito de segurança. Tratamento eufêmico é proibido | Usuário  |
| 2026-07-09 | humanizeError DEVE cobrir padrões de erro de CI/GitHub/GitLab antes da migração           | Padrões insuficientes para o domínio DataHub                             | Plano    |
| 2026-07-09 | Test factories são ÚNICA fonte de dados de teste — copies de saída proibidas              | Copiar output = codificar bugs como features                             | Usuário  |
| 2026-07-09 | Integration tests + PBT têm prioridade sobre unit tests para DataHub                      | DataHub é cross-camada — unit tests não cobrem o fluxo real              | Usuário  |
| 2026-07-09 | BadTesting (`toBeDefined()` sozinho) = teatro → corrigir ou deletar                       | Testes que passam sem verificar comportamento são pior que sem teste     | Usuário  |
| 2026-07-10 | CTRF em pr-report é self-reference bug — remover, DataHub lê artifacts via API            | pr-report gerava relatório sobre si próprio, não sobre projeto externo   | Usuário  |
| 2026-07-10 | ci-injector gera YAML genérico — sem auto-referenciamento a qa_tools                      | Projeto gerenciado ≠ qa_tools; workflow deve ser genérico                | Usuário  |
| 2026-07-10 | Wizard pergunta testReportPath + artifactName — info explicitamente pedida ao usuário     | ci-injector precisa desses dados; wizard deve coletá-los                 | Usuário  |
| 2026-07-10 | ci-injector injeta upload de artifact no test job (Opção A) — fluxo completo e automático | External project não precisa configurar upload manualmente               | Usuário  |
| 2026-07-10 | loadMetricsStore() é bypass legítimo para dados raw — ELIMINAR, migrar 18 consumers       | loadMetricsStore expõe persistence diretamente, viola SSOT               | Usuário  |
| 2026-07-10 | CommandContext.dataHub DEVE ser obrigatório — eliminate 7 ocorrências de `?`              | `?` opcional herda optionality para todos os downstream                  | Usuário  |
| 2026-07-10 | Design Gaps 1-2 (Validação Zod + Provenance) planejados para esta sessão                  | Dados sem validação = metrics incorretas silenciosamente                 | Usuário  |
| 2026-07-10 | CtrfSource → TestReportSource — detector format-agnóstico, não CTRF-específico            | detector deve detectar "tem reporter?" sem assumir formato               | Usuário  |
| 2026-07-10 | Detecção de reporter: Fase 3 usa regex (renomeação); Fase 11 usa AST/híbrido              | regex é insuficiente para detecção confiável; AST é superior             | Usuário  |
| 2026-07-10 | Duas detecções separadas: capacidade (wizard) vs formato (parser) — não conflitar         | Wizard detecta de config; parser detecta de conteúdo                     | Pesquisa |

## STATUS DO TRACK (2026-07-12)

| Fase                       | Commit     | Estado                         |
| -------------------------- | ---------- | ------------------------------ |
| ST-1 (FUNDAÇÃO)            | `c196203f` | ✅ concluída                   |
| ST-2 (CAMADA DE QUALIDADE) | `30f8e6b7` | ✅ concluída                   |
| ST-3 (QUALITY ENFORCEMENT) | `3f2c1166` | ✅ concluída (CI green)        |
| L4 (LINTER ENFORCEMENT)    | —          | ✅ **SATISFEITO** — ver abaixo |

### L4 — encerrada como satisfeita

`tsc --noEmit` = **0 erros** e `npm run lint` = **0 violações** (config ativa). O objetivo de
lint/tsc clean está metrificamente atendido; não há débito de correção nessa dimensão.

- O bucket "613 erros tsc" do audit trail histórico refere-se a `noPropertyAccessFromIndexSignature`,
  que **já está ativa** em `tsconfig.json:17` e compila limpo (0 erros). O audit trail §15 de
  `AGENTS.md` (que dizia "DEFERIDO / não reativar") estava **obsoleto e contradizia o estado real**;
  foi reconciliado em 2026-07-12 para refletir a regra ativa e complacente.
- Nenhuma nova regra de lint/tsc será habilitada sem autoridade explícita (modelo de autoridade,
  AGENTS §1) — habilitar regras especulativas seria esforço sem ganho de correção (veto §21).

## FASE RE-ESCOPADA — CONCLUÍDA (2026-07-12)

| Item                       | Commit     | Estado                                            |
| -------------------------- | ---------- | ------------------------------------------------- |
| Quarentena SSOT (hub dono) | `d49c6ac0` | ✅ concluída (push + CI green, run `29191630087`) |

### Evidência de execução (commit `d49c6ac0`, 11 arquivos, +185/−33)

- `shared/types/data-hub.ts:689` — `DataHub.getQuarantine(): QuarantineStore` (+ import `QuarantineStore`).
- `shared/data-hub/hub.ts:117` — `this.quarantine = loadQuarantine()` em `DataHubImpl.create` (ponto único de construção); `:231` — `getQuarantine(): QuarantineStore`.
- `shared/pr-report-core.ts` — import de `isQuarantined` **removido**; `buildFlakySection` lê `dataHub.getQuarantine().entries.some(e => e.testTitle === t.title)`.
- `shared/test-utils/factories/data-hub-mock.ts:170` — `getQuarantine: vi.fn<() => QuarantineStore>(() => ({ entries: [] }))`.
- Mocks inline corrigidos: `session-state.test.ts`, `session-state-ensureDataHub.integration.test.ts`, `health-score.integration.test.ts` (acrescentado `getQuarantine`); `hub-ingest-gate.test.ts` (teste `owns the quarantine store (SSOT)`).
- `shared/__tests__/pr-report.test.ts` — 2 testes migrados de `isQuarantined` (caminho antigo) para popular `dataHub.getQuarantine().entries` via reatribuição de mock fn (padrão `vi.fn<() => QuarantineStore>`, sem `vi.mocked` em método → sem `unbound-method`). Assertions **idênticas** preservadas (`🔒 Quarantined` / `not.toContain('not yet quarantined')`). Corrigido também vazamento de estado entre testes (`mockDataHubComputed.flakinessEntries` explícito em cada teste).

### Resultados de verificação (pós-commit)

- `npx tsc --noEmit` → **0 erros**.
- `npx vitest run` → **6403 passed / 9 skipped / 0 failed** (suite completa, gate pre-push).
- `npm run lint` (lint-staged + hook) → **0 violações** introduzidas.
- CI GitHub (`actions/runs/29191630087`) → **conclusion: success**.
- Pre-commit + pre-push hooks → passaram (inclui `validation_hook` 51/51, Catraca, lockfile-lint).

### Auditoria final (manual, além de testes) — TODOS OS CRITÉRIOS OK

- **(a)** `getQuarantine()` existe em interface (`types/data-hub.ts:689`), impl (`hub.ts:231`), mock (`data-hub-mock.ts:170`). ✓
- **(b)** `pr-report-core.ts` **não** importa `isQuarantined` (grep vazio). ✓
- **(c)** Nenhum leitor direto executável de `loadAndExpire(`/`loadMetricsStore(` fora de `quarantine.ts`/`data-hub/` (matches restantes são só `.md` de plano + comentário em `types/data-hub.ts:65`). ✓
- **(d)** Sítios de `calcFlakinessEntries`: apenas `hub.ts:670` (sobre `this.computed.metricsRuns`) e helper interno `flakiness-entries.ts:79`. Scoping por projeto = dados SSOT (plano nota 3814). ✓
- **(e)** Preservados: `e2e/gen-report-complete.ts` (fixture scaffolding, `loadCtrfFixture`); `case17.ts --extra-run` (entrada CLI de usuário). ✓

### Débito conhecido (fora do escopo deste track, não introduzido)

- `loadMetricsStore()` permanece exposto na interface `DataHub` como ponte documentada (remoção planejada em Fase 1 do plano, Tarefa 1.3.1) — não afeta este gap.
- `security/detect-non-literal-fs-filename` em `shared/quarantine.ts` é débito pré-existente (rastreado N2-B), não introduzido por esta mudança.

### Conclusão do track "EXPAND+STORE"

ST-1, ST-2, ST-3, L4 e a migração de consumidores re-escopada (quarentena SSOT) estão **concluídas e verificadas**, com CI verde. Nenhum bypass de SSOT, nenhuma supressão de mecanismo de segurança, equivalência de comportamento preservada. Track encerrado.

---

## Track "Phase 0.8 — consumer migration fix (2026-07-12, não commitado)"

### Defeito corrigido (root cause)

- `shared/test-utils/factories/data-hub-mock.ts`: função `makeDataHubMock` definia `getBranch`/`loadReport`/`saveReport`/`put`/`loadMetrics`/`saveMetrics` **duas vezes** no objeto retornado. A segunda definição (sem `mockReturnValue`) sobrepunha-se à primeira, fazendo `getBranch()` retornar `undefined` em vez de `[]`.
- Impacto: `resolveFromBranch` (`shared/session-context.ts`) faz `store.getBranch(branch).length` e quebrava (`Cannot read properties of undefined`) quando o hub não estava previamente populado — regressão da migração Phase 0.8 que trocou `Store` por `DataHub` em `resolveSessionContext`.
- Correção: removido o bloco duplicado; definição única com defaults corretos (`getBranch → []`, `loadReport → null`). `makeDataHubPersistenceMock` também revisitado (mesmos 6 métodos com defaults preservados).

### Testes afetados (agora verdes)

- `jira_management/commands/handlers.test.ts` (Case15/Case16) e `e2e/handlers-happy-paths.test.ts`: adicionado `setDataHub(makeDataHubMock())` no `beforeEach` (precondição exigida pelo novo contrato `resolveSessionContext → getDataHub(): DataHub`).

### Verificação

- `npm run lint` → 0 violações. `npx tsc --noEmit` → 0 erros. Suite completa → 6407 pass / 9 skip / 0 fail.
