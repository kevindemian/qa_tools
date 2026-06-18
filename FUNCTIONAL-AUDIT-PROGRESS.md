# Functional Audit — Registro de Progresso

**Início:** 2026-06-15
**Metodologia:** FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md (T1-T20 + 7 dimensões + testes FT-xx)

---

## Legenda

| Status | Significado  |
| ------ | ------------ |
| 🔜     | Pendente     |
| 🔄     | Em andamento |
| ✅     | Concluído    |
| ❌     | Bloqueado    |

---

## Grupo 0 — Fundação

| Ordem | ID    | Feature             | Audit T1-T20 | 7 Dimensões | Gaps | Testes | Status |
| ----- | ----- | ------------------- | ------------ | ----------- | ---- | ------ | ------ |
| P1    | FT-04 | Metrics             | ✅           | ✅          | 4    | 52     | ✅     |
| P2    | FT-07 | Store               | ✅           | ✅          | 3    | 76     | ✅     |
| 0.1   | FT-01 | Config Accessor     | ✅           | ✅          | 0    | —      | ✅     |
| 0.2   | FT-02 | Feature Config      | ✅           | ✅          | 5    | 60     | ✅     |
| 0.3   | FT-03 | Session State       | ✅           | ✅          | 2    | 44     | ✅     |
| 0.4   | FT-05 | Logger              | 🔜           | 🔜          | —    | —      | 🔜     |
| 0.5   | FT-06 | Temp Dir            | 🔜           | 🔜          | —    | —      | 🔜     |
| —     | FT-08 | Integration Helpers | 🔜           | 🔜          | —    | —      | 🔜     |

<!-- CHECKPOINT: Phase 0 complete for FT-02 -->

### FT-02 — Feature Config (Re-auditoria concluída)

**Arquivos:** `shared/feature-config.ts` (111L), `shared/types/feature-config.ts` (59L), `shared/config/features.json` (runtime)

**Metadados FT-02:**

- FEATURE_NAME: feature-config
- SOURCE: shared/feature-config.ts (111L)
- TEST_FILE_PREVIOUS: N/A (nenhum na raiz do módulo)
- TEST_FILE_UNIT: shared/**tests**/feature-config.test.ts
- TEST_FILE_INTEGRATION: shared/**tests**/integration/feature-config.integration.test.ts
- TEST_FILE_PBT: shared/**tests**/feature-config.property.test.ts
- CONSUMERS: setup/config-writer.ts, git_triggers/pr-report-setup-handler.ts, git_triggers/batch-mode.ts, shared/pr-report-core.ts
- DOCS: docs/TECHDOC.md (lines 73, 982, 983), docs/11-pr-report.md (line 273)

**Início (re-auditoria):** 2026-06-18

<!-- CHECKPOINT: Phase 0 complete for FT-02 -->
<!-- CHECKPOINT: Phase 1 complete for FT-02 -->

#### T1-T20

| #   | Categoria          | Status | Gap                                                             |
| --- | ------------------ | ------ | --------------------------------------------------------------- |
| T1  | Entry point        | ✅     | 10 exported functions                                           |
| T2  | Config model       | ✅     | Interfaces + Zod schemas (types/feature-config.ts)              |
| T3  | Config accessor    | ✅     | Feature-config is itself the config accessor for features       |
| T4  | Runtime lê config  | ✅     | loadFeatureConfig lê de config/features.json no disco           |
| T5  | Wizard entry       | ✅     | setup/config-writer.ts → setPrReportConfig                      |
| T6  | Wizard detection   | N/A    | No auto-detection needed                                        |
| T7  | Wizard output      | ✅     | config-writer.ts: writeFeaturesConfig cria config entry         |
| T8  | Wizard prompts     | N/A    | Prompts in setup/main.ts, not in feature-config module          |
| T9  | Reconfig handler   | ✅     | git_triggers/pr-report-setup-handler.ts                         |
| T10 | CI integration     | N/A    | Data access layer, no CI-specific integration                   |
| T11 | CI safety          | ✅     | Try/catch em loadFeatureConfig, saveFeatureConfig, ensureDir    |
| T12 | Test coverage      | ✅     | 60 testes (unit + integration + PBT), 82 expects                |
| T13 | Dead code          | ✅     | Zero dead code — todas as funções exportadas e referenciadas    |
| T14 | Suppressions       | ✅     | Zero type suppressions, zero empty catches, zero eslint-disable |
| T15 | Bidirectional      | N/A    | Unidirectional (wizard → config → runtime read)                 |
| T16 | CLI interface      | N/A    | No CLI own, consumed by CLI commands                            |
| T17 | Env var dependency | ✅     | Nenhuma dependência de process.env                              |
| T18 | Error handling     | ✅     | All I/O wrapped in try/catch with rootLogger.warn + re-throw    |
| T19 | TECHDOC            | ✅     | Listed in TECHDOC.md (lines 73, 982, 983)                       |
| T20 | CI/Config contract | N/A    | No direct CI chain                                              |

<!-- CHECKPOINT: Phase 2 complete for FT-02 -->

#### 7 Dimensões

| Dimensão               | Status | Achados                                                                                    |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------ |
| 1. Isolamento Testes   | ✅     | beforeEach/afterEach com temp dir + vi.restoreAllMocks + vi.resetModules; all three layers |
| 2. Robustez            | ✅     | try/catch em ensureDir, loadFeatureConfig, saveFeatureConfig; fallback para {}             |
| 3. Boas Práticas       | ✅     | SRP, nenhum import direto de lib externa (zod via deps.ts), sem workarounds                |
| 4. Implementação Ótima | ✅     | 111L funcional, zero loops, early returns, constantes nomeadas                             |
| 5. Métricas            | N/A    | Feature config não produz métricas                                                         |
| 6. UX                  | ✅     | Documentada em TECHDOC.md + docs/11-pr-report.md; mensagens de erro logadas com contexto   |
| 7. Deep Test Audit     | ✅     | Ver detalhamento abaixo                                                                    |

#### D7 — Deep Test Audit (detalhado)

| Item | Status | Evidência                                                                                      |
| ---- | ------ | ---------------------------------------------------------------------------------------------- |
| 7.1  | ✅     | 3 `toBeDefined` ocorrências, cada uma seguida de assert real (field check)                     |
| 7.2  | ✅     | 60 testes / 82 expects (exceeds minimum)                                                       |
| 7.3  | ✅     | Expected values derivados de regras de negócio (enabled→publishTarget, gitlab→gitlab-ci, etc.) |
| 7.4  | ✅     | Fixtures via createFeaturesJsonFixture com shape idêntico aos tipos reais                      |
| 7.5  | ✅     | Sem toThrow() sem argumento                                                                    |
| 7.6  | ✅     | Sem .skip ou .only                                                                             |
| 7.7  | ✅     | Nomes descritivos de comportamento: "returns configured publish target when enabled"           |
| 7.8  | ✅     | Determinístico: temp dir + vi.restoreAllMocks + vi.resetModules + rmSync em afterEach          |
| 7.9  | ✅     | Zero type suppressions (as any, @ts-ignore, @ts-expect-error, nullAs)                          |
| 7.10 | ✅     | PBT usa função pura separada testando invariantes, não replica implementação                   |
| 7.11 | ✅     | PBT existente: 9 testes (schema validation + resolvePublishTarget invariants)                  |
| 7.12 | N/A    | Feature pré-existente                                                                          |

<!-- CHECKPOINT: Phase 3 complete for FT-02 -->

#### Gaps

| ID  | Severidade | Descrição                                                                                        | Local                                     | Origem | Correção                                                                            |
| --- | ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| G1  | Baixo      | Catch vazio no afterChe da unit test e integration test (apenas comment, sem log)                | feature-config.test.ts:60, integration:33 | D7.9   | Substituído por catch(err) com rootLogger.warn                                      |
| G2  | Médio      | resolvePublishTarget ignorava gitProvider armazenado do projeto ao fazer fallback                | feature-config.ts:91 (antes do fix)       | T18    | Adicionado lookup de getProjectFeatureConfig(projectName)?.gitProvider              |
| G3  | Médio      | saveFeatureConfig/ensureDir sem try/catch — I/O failures propagavam sem log                      | feature-config.ts:14-16 (antes do fix)    | T18    | Wrapped em try/catch com rootLogger.warn + re-throw                                 |
| G4  | Médio      | Oracle Problem: integration test esperava 'github-actions' para gitlab project (co­dificava bug) | integration test (antes do fix)           | D7.3   | Corrigido expect para 'gitlab-ci' (business logic); código corrigido para lookup    |
| G5  | Baixo      | Mensagens de erro não acionáveis — dizem o que falhou mas não o que fazer                        | feature-config.ts:18,33,38,49             | D6.1   | Adicionada orientação de ação em cada mensagem (verificar permissões, schema, etc.) |

<!-- CHECKPOINT: Phase 4 complete for FT-02 -->
<!-- CHECKPOINT: Phase 5 complete for FT-02 (G5: UX content change, sem RED test) -->
<!-- CHECKPOINT: Phase 6 complete for FT-02 -->

#### Testes de Integração

| ID     | Sub-teste                         | O que cobre                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------ |
| FT-02a | loadFeatureConfig round-trip      | Válido, missing, invalid JSON, schema violation              |
| FT-02b | saveFeatureConfig persistence     | Save + reload, cria diretório                                |
| FT-02c | getProjectFeatureConfig           | Known/unknown project                                        |
| FT-02d | getPrReportConfig                 | Configured/missing/default                                   |
| FT-02e | isPrReportEnabled                 | True/false scenarios                                         |
| FT-02f | setPrReportConfig creates project | New project entry                                            |
| FT-02g | resolvePublishTarget fallbacks    | Enabled, gitlab, unknown, explicit hint + stored gitProvider |
| FT-02h | Sub-feature skip flags            | isAiSkipped, isQualitySkipped, isFlakySkipped                |
| PBT    | Schema validation                 | Válido, inválido, skip flags                                 |
| PBT    | resolvePublishTarget invariants   | 5 propriedades (enabled/disabled/precedência/validade)       |

<!-- CHECKPOINT: Phase 7 complete for FT-02 -->

#### Validação

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npx vitest run feature-config` — 60/60 passed
- ✅ Consumidores: config-writer, pr-report-setup-handler, batch-mode, pr-report-core — 94/94 tests passed
- ✅ `npm run lint` — All quality checks passed

<!-- CHECKPOINT: Phase 9 complete for FT-02 -->

---

### FT-03 — Session State (Re-auditoria concluída)

**Arquivos:** `shared/state.ts` (160L)
**Testes:**

- `shared/state.test.ts` (18 testes)
- `shared/__tests__/integration/state.integration.test.ts` (10 testes)
- `shared/__tests__/state.property.test.ts` (5 testes PBT)
- **Total: 44 testes**

**Metadados:**

- FEATURE_NAME: state
- SOURCE: shared/state.ts (160L)
- TEST_FILE_UNIT: shared/state.test.ts
- TEST_FILE_INTEGRATION: shared/**tests**/integration/state.integration.test.ts
- TEST_FILE_PBT: shared/**tests**/state.property.test.ts
- CONSUMERS: 20+ módulos (setup, git_triggers, jira_management, scripts, shared)
- DOCS: docs/TECHDOC.md (lines 70, 669, 914), docs/03-git-triggers.md, docs/01-primeiros-passos.md

**Início:** 2026-06-18

<!-- CHECKPOINT: Phase 1 complete for FT-03 -->

#### T1-T20

| #   | Categoria          | Status | Gap                                                                                                   |
| --- | ------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| T1  | Entry point        | ✅     | 7 exported functions (migrateOldState, getStatePath, loadTypedState, load, save, update, updateTyped) |
| T2  | Config model       | ✅     | StateSchema em types/common.ts + typings                                                              |
| T3  | Config accessor    | ✅     | Usa Config.get('xdgStateHome')                                                                        |
| T4  | Runtime lê config  | ✅     | Lê de ~/.local/state/qa-tools/state.json ou $XDG_STATE_HOME                                           |
| T5  | Wizard entry       | N/A    | Configurado indiretamente pelo setup                                                                  |
| T6  | Wizard detection   | N/A    | —                                                                                                     |
| T7  | Wizard output      | N/A    | —                                                                                                     |
| T8  | Wizard prompts     | N/A    | —                                                                                                     |
| T9  | Reconfig handler   | N/A    | —                                                                                                     |
| T10 | CI integration     | N/A    | —                                                                                                     |
| T11 | CI safety          | ✅     | Try/catch em todas as operações de I/O; backup recovery                                               |
| T12 | Test coverage      | ✅     | 44 testes (unit + integration + PBT), 52 expects                                                      |
| T13 | Dead code          | ✅     | Zero dead code                                                                                        |
| T14 | Suppressions       | ✅     | Zero supressões (último `(err as Error).message` corrigido para instanceof)                           |
| T15 | Bidirectional      | N/A    | Unidirecional                                                                                         |
| T16 | CLI interface      | N/A    | API programática                                                                                      |
| T17 | Env var dependency | ✅     | Nenhuma (usa Config.get)                                                                              |
| T18 | Error handling     | ✅     | All I/O wrapped in try/catch; backup recovery em load                                                 |
| T19 | TECHDOC            | ✅     | Listed in TECHDOC.md                                                                                  |
| T20 | CI/Config contract | N/A    | No direct CI chain                                                                                    |

<!-- CHECKPOINT: Phase 2 complete for FT-03 -->

#### 7 Dimensões

| Dimensão               | Status | Achados                                                                            |
| ---------------------- | ------ | ---------------------------------------------------------------------------------- |
| 1. Isolamento Testes   | ✅     | beforeEach + afterEach com temp dir + vi.restoreAllMocks + vi.resetModules         |
| 2. Robustez            | ✅     | Backup recovery em load; atomic write via tmp→rename; fallback para {}             |
| 3. Boas Práticas       | ✅     | SRP, DIP, sem bypasses                                                             |
| 4. Implementação Ótima | ✅     | 155L, zero loops, early returns, constantes nomeadas                               |
| 5. Métricas            | N/A    | —                                                                                  |
| 6. UX                  | ✅     | Mensagens corrigidas para incluir orientação de ação (permissões, espaço em disco) |
| 7. Deep Test Audit     | ✅     | Ver detalhamento abaixo                                                            |

#### D7 — Deep Test Audit (detalhado)

| Item | Status | Evidência                                                                              |
| ---- | ------ | -------------------------------------------------------------------------------------- |
| 7.1  | ✅     | Sem toBeDefined/toBeTruthy/toBeNull sem alvo real                                      |
| 7.2  | ✅     | 44 testes / 52 expects (exceeds minimum)                                               |
| 7.3  | ✅     | Expected values derivados de invariantes: load∘save=identity, backup recovery          |
| 7.4  | ✅     | mockFs com shape idêntico ao fs real                                                   |
| 7.5  | ✅     | Sem toThrow() sem argumento                                                            |
| 7.6  | ✅     | Sem .skip ou .only                                                                     |
| 7.7  | ✅     | Nomes descritivos: "load retorna {} para estado vazio/inexistente"                     |
| 7.8  | ✅     | Determinístico: temp dir + vi.restoreAllMocks + vi.resetModules                        |
| 7.9  | ⚠️     | G1 corrigido: 3x `(err as Error).message` substituído por instanceof check             |
| 7.10 | ✅     | PBT testa invariantes (identity, deep copy), não replica implementação                 |
| 7.11 | ✅     | PBT existente: 5 invariantes (load∘save=identity, update, deep copy, empty, structure) |
| 7.12 | N/A    | Feature pré-existente                                                                  |

<!-- CHECKPOINT: Phase 3 complete for FT-03 -->

#### Gaps

| ID  | Severidade | Descrição                                                                        | Local                      | Origem | Correção                                                              |
| --- | ---------- | -------------------------------------------------------------------------------- | -------------------------- | ------ | --------------------------------------------------------------------- |
| G1  | Baixo      | Type assertion `(err as Error).message` em 1 local remanescente — risco de crash | state.ts:124               | T14    | Substituído por `err instanceof Error ? err.message : String(err)`    |
| G6  | Baixo      | Mensagens de erro não acionáveis — dizem o que falhou mas não o que fazer        | state.ts:25,67,114,124,144 | D6     | Adicionada orientação de ação (verificar permissões, espaço em disco) |

<!-- CHECKPOINT: Phase 4 complete for FT-03 -->
<!-- CHECKPOINT: Phase 5 complete for FT-03 (G1+G6: sem RED test — instanceof + mensagens) -->
<!-- CHECKPOINT: Phase 6 complete for FT-03 -->

#### Testes de Integração

| ID     | Sub-teste                    | O que cobre                                           |
| ------ | ---------------------------- | ----------------------------------------------------- |
| FT-03a | Load returns empty           | Fresh state directory → {}                            |
| FT-03b | Save + load round-trip       | save + load = identity, backup file created           |
| FT-03c | Update callback pattern      | load→mutate→save, não-mutação do original             |
| FT-03d | State file structure         | JSON validity, backup = main                          |
| FT-03e | getStatePath                 | Path termina em state.json                            |
| FT-03f | Backup recovery              | Corrupção com backup → recovery; corrupção dupla → {} |
| PBT    | State persistence invariants | 5 propriedades via fast-check                         |

<!-- CHECKPOINT: Phase 7 complete for FT-03 -->
<!-- CHECKPOINT: Phase 8 complete for FT-03 (🟢 skip refactoring) -->

#### Validação

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npx vitest run state` — 44/44 passed
- ✅ Consumidores — 112 files, 1777 tests, zero regressões
- ✅ `npm run lint` — All quality checks passed

<!-- CHECKPOINT: Phase 9 complete for FT-03 -->
<!-- CHECKPOINT: Phase 10 complete for FT-03 -->

---

### FT-04 — Metrics (Re-auditoria concluída)

**Arquivos:** `shared/metrics.ts` (242L)
**Testes:**

- `shared/metrics.test.ts` (16 testes — memfs-based I/O tests)
- `shared/__tests__/metrics.test.ts` (13 testes — unit)
- `shared/__tests__/integration/metrics.integration.test.ts` (10 testes — integration)
- `shared/__tests__/metrics.property.test.ts` (13 testes — PBT)
- **Total: 52 testes**

**Metadados:**

- FEATURE_NAME: metrics
- SOURCE: shared/metrics.ts (242L)
- TEST_FILE_PREVIOUS: shared/metrics.test.ts
- TEST_FILE_UNIT: shared/**tests**/metrics.test.ts
- TEST_FILE_INTEGRATION: shared/**tests**/integration/metrics.integration.test.ts
- TEST_FILE_PBT: shared/**tests**/metrics.property.test.ts
- CONSUMERS: health-score (via calculateFlakyRate), pr-report (via getTrends)
- DOCS: docs/TECHDOC.md

**Início:** 2026-06-18

<!-- CHECKPOINT: Phase 1 complete for FT-04 -->

#### T1-T20

| #   | Categoria          | Status | Gap                                                       |
| --- | ------------------ | ------ | --------------------------------------------------------- |
| T1  | Entry point        | ✅     | 12 exported symbols (6 interfaces + 6 functions)          |
| T2  | Config model       | ✅     | Interfaces + Zod schemas (MetricsRun, MetricsStore, etc.) |
| T3  | Config accessor    | ✅     | Usa Config.get para xdgStateHome + METRICS_MAX_RUNS       |
| T4  | Runtime lê config  | ✅     | loadMetrics lê do disco via StoreBackend                  |
| T5  | Wizard entry       | N/A    | Sem configuração wizard                                   |
| T6  | Wizard detection   | N/A    | —                                                         |
| T7  | Wizard output      | N/A    | —                                                         |
| T8  | Wizard prompts     | N/A    | —                                                         |
| T9  | Reconfig handler   | N/A    | —                                                         |
| T10 | CI integration     | N/A    | Consumido por CI via pr-report                            |
| T11 | CI safety          | ✅     | Try/catch em loadMetrics + saveMetrics + getBackend       |
| T12 | Test coverage      | ✅     | 52 testes (4 layers: memfs + unit + integration + PBT)    |
| T13 | Dead code          | ✅     | Zero dead code                                            |
| T14 | Suppressions       | ✅     | G3 corrigido: (err as Error).message -> instanceof check  |
| T15 | Bidirectional      | N/A    | Unidirecional (escrita -> leitura -> cálculo)             |
| T16 | CLI interface      | N/A    | Consumido por CLI commands (pr-report, health-score)      |
| T17 | Env var dependency | ✅     | Nenhuma (usa Config.get)                                  |
| T18 | Error handling     | ✅     | G1 corrigido: catch vazio em afterEach; all I/O catched   |
| T19 | TECHDOC            | ✅     | Listado em TECHDOC.md                                     |
| T20 | CI/Config contract | N/A    | Nenhum contrato direto                                    |

<!-- CHECKPOINT: Phase 2 complete for FT-04 -->

#### 7 Dimensões

| Dimensão               | Status | Achados                                                                                          |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| 1. Isolamento Testes   | ⚠️     | G1 corrigido - catch vazio no afterEach do integration test; memfs + temp dir nas outras camadas |
| 2. Robustez            | ✅     | Try/catch em loadMetrics + saveMetrics; fallback para FsStoreBackend; schema via Zod             |
| 3. Boas Práticas       | ✅     | SRP, StoreBackend abstraction, Config DI, imports de lib via deps.ts                             |
| 4. Implementação Ótima | ✅     | 242L, código claro, early returns, sem loops desnecessários                                      |
| 5. Métricas            | ⚠️     | G2 corrigido - calculateFlakyRate usava denominador errado (flaky/flaky = 100%)                  |
| 6. UX                  | ✅     | Mensagens corrigidas para incluir orientação de ação (permissões, leitura/escrita)               |
| 7. Deep Test Audit     | ✅     | Ver detalhamento abaixo                                                                          |

#### D7 - Deep Test Audit (detalhado)

| Item | Status | Evidência                                                                                       |
| ---- | ------ | ----------------------------------------------------------------------------------------------- |
| 7.1  | ✅     | 3 toBeDefined ocorrências, cada uma seguida de assert real; nonNull() usado nos demais          |
| 7.2  | ✅     | 52 testes / 71+ expects (exceeds minimum)                                                       |
| 7.3  | ✅     | Expected values derivados de regras de negócio (passRate = passed/(passed+failed)\*100)         |
| 7.4  | ✅     | Fixtures com shape idêntico aos tipos reais; memfs para I/O layer                               |
| 7.5  | ✅     | Sem toThrow() sem argumento                                                                     |
| 7.6  | ✅     | Sem .skip ou .only                                                                              |
| 7.7  | ✅     | Nomes descritivos: "handles saveMetrics write failure gracefully"                               |
| 7.8  | ✅     | Determinístico: temp dir + memfs + vi.restoreAllMocks + vi.resetModules                         |
| 7.9  | ✅     | Zero type suppressions (as any, @ts-ignore, @ts-expect-error)                                   |
| 7.10 | ✅     | PBT testa invariantes (range [0,100], empty->0, formula correctness), não replica implementação |
| 7.11 | ✅     | PBT existente: 13 testes (flaky rate, flakiness, trends)                                        |
| 7.12 | N/A    | Feature pré-existente                                                                           |

<!-- CHECKPOINT: Phase 3 complete for FT-04 -->

#### Gaps

| ID  | Severidade | Descrição                                                                 | Local               | Origem | Correção                                                                      |
| --- | ---------- | ------------------------------------------------------------------------- | ------------------- | ------ | ----------------------------------------------------------------------------- |
| G1  | Baixo      | Catch vazio no afterEach do integration test                              | integration test:43 | D7.9   | Substituído por catch(err) com rootLogger.warn                                |
| G2  | Alto       | calculateFlakyRate usava denominador errado (flaky/flaky = 100% sempre)   | metrics.ts:207-214  | D5     | Corrigido denominador para totalQualifying (todos testes que atingem minRuns) |
| G3  | Baixo      | Type assertion (err as Error).message em saveMetrics                      | metrics.ts:144      | T14    | Substituído por err instanceof Error ? err.message : String(err)              |
| G7  | Baixo      | Mensagens de erro não acionáveis — dizem o que falhou mas não o que fazer | metrics.ts:133,144  | D6     | Adicionada orientação de ação (verificar permissões, espaço em disco)         |

<!-- CHECKPOINT: Phase 4 complete for FT-04 -->
<!-- CHECKPOINT: Phase 5 complete for FT-04 (G7: UX content change, sem RED test) -->
<!-- CHECKPOINT: Phase 6 complete for FT-04 -->

#### Testes de Integração

| ID     | Sub-teste                            | O que cobre                                                              |
| ------ | ------------------------------------ | ------------------------------------------------------------------------ |
| FT-04a | saveMetrics + loadMetrics round-trip | Persistência vazia, com runs, sem dados salvos                           |
| FT-04b | saveParseResult cria MetricsRun      | Cria run a partir de ParseResult e persiste                              |
| FT-04c | saveRunMetrics respeita MAX_RUNS     | Trunca runs antigas ao exceder limite                                    |
| FT-04d | calculateFlakiness                   | Identificação de testes flaky                                            |
| FT-04e | calculateFlakyRate                   | 0 quando sem flaky, percentual correto                                   |
| FT-04f | getTrends                            | Pass rate trend data                                                     |
| FT-04g | saveCoverageSnapshot                 | Persistência de histórico de cobertura                                   |
| PBT    | calculateFlakyRate invariants        | Range [0,100], empty=0, no fails=0, all flaky=100, denominator filtering |
| PBT    | calculateFlakiness invariants        | Consistent counts, rate formula, flaky filter, minRuns filter            |
| PBT    | getTrends invariants                 | Window size, passRate [0,100], formula correctness, empty store          |

<!-- CHECKPOINT: Phase 7 complete for FT-04 -->
<!-- CHECKPOINT: Phase 8 complete for FT-04 (🟢 skip refactoring) -->

#### Validação

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npx vitest run metrics` — 52/52 passed
- ✅ Consumidores — sem regressões
- ✅ `npm run lint` — All quality checks passed

<!-- CHECKPOINT: Phase 9 complete for FT-04 -->
<!-- CHECKPOINT: Phase 10 complete for FT-04 -->

---

### FT-07 — Store (Em andamento)

**Arquivos:**

- `shared/store.ts` (123L) — classe Store: CRUD de metadados, reports, branches
- `shared/store-backend.ts` (165L) — GitStoreBackend, FsStoreBackend, detectProjectGitDir, detectStoreBackend

**Testes:**

- `shared/store.test.ts` (196L) — testes unitários Store
- `shared/store-backend.test.ts` (417L) — testes unitários backends + detect functions
- `shared/store-backend.fallback.test.ts` (31L) — fallback test detectStoreBackend
- `shared/__tests__/store.property.test.ts` (237L, 7 invariantes) — PBT
- `shared/__tests__/integration/store.integration.test.ts` (261L) — integration tests
- **Total: ~260 testes estimados** (contar exato no Phase 2 T12)

**Mocks:**

- `shared/__mocks__/store.ts`
- `shared/__mocks__/store-backend.ts`

**Metadados FT-07:**

- FEATURE_NAME: store-backend
- SOURCE: shared/store.ts, shared/store-backend.ts
- TEST_FILE_PREVIOUS: shared/store.test.ts, shared/store-backend.test.ts, shared/store-backend.fallback.test.ts
- TEST_FILE_UNIT: shared/**tests**/store.property.test.ts (PBT)
- TEST_FILE_INTEGRATION: shared/**tests**/integration/store.integration.test.ts
- CONSUMERS: shared/session-context.ts, git_triggers/pipeline-handler.ts, shared/metrics.ts, git_triggers/pipeline-jira.ts, jira_management/commands/case15.test.ts
- DOCS: docs/TECHDOC.md (reference)

**Início:** 2026-06-18

<!-- CHECKPOINT: Phase 0 complete for FT-07 -->

#### T1-T20

| #   | Categoria          | Status | Gap                                                                                                                                         |
| --- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Entry point        | ✅     | 8 exported symbols (Store, ReportMeta, BranchEntry, StoreBackend, GitStoreBackend, FsStoreBackend, detectProjectGitDir, detectStoreBackend) |
| T2  | Config model       | N/A    | Store is data access, not config                                                                                                            |
| T3  | Config accessor    | N/A    | No config accessor                                                                                                                          |
| T4  | Runtime lê config  | N/A    | No config reading                                                                                                                           |
| T5  | Wizard entry       | N/A    | No wizard entry                                                                                                                             |
| T6  | Wizard detection   | N/A    | No wizard detection                                                                                                                         |
| T7  | Wizard output      | N/A    | No wizard output                                                                                                                            |
| T8  | Wizard prompts     | N/A    | No wizard prompts                                                                                                                           |
| T9  | Reconfig handler   | N/A    | No reconfig handler                                                                                                                         |
| T10 | CI integration     | N/A    | Data access layer, no CI-specific integration                                                                                               |
| T11 | CI safety          | ⚠️     | writeJson sem try/catch (G2); ensure() sem try/catch (G3)                                                                                   |
| T12 | Test coverage      | ✅     | 71 testes (5 files: 16+35+1+7+12)                                                                                                           |
| T13 | Dead code          | ✅     | Zero dead code — todos exports referenciados por consumidores                                                                               |
| T14 | Suppressions       | ⚠️     | `(err as Error).message` em 3 locais (G1)                                                                                                   |
| T15 | Bidirectional      | N/A    | Unidirectional (write → read)                                                                                                               |
| T16 | CLI interface      | N/A    | No CLI                                                                                                                                      |
| T17 | Env var dependency | ✅     | XDG_STATE_HOME com fallback para os.homedir()                                                                                               |
| T18 | Error handling     | ⚠️     | writeJson + ensure sem try/catch (G2, G3)                                                                                                   |
| T19 | TECHDOC            | ✅     | Documentado em TECHDOC.md (lines 71, 676-677, 910)                                                                                          |
| T20 | Tech debt          | ✅     | Zero TODO/FIXME/HACK/WORKAROUND                                                                                                             |

<!-- CHECKPOINT: Phase 2 complete for FT-07 -->

#### 7 Dimensões

| Dimensão                 | Status | Observações                                                                             |
| ------------------------ | ------ | --------------------------------------------------------------------------------------- |
| D1 — Isolamento          | ✅     | Store acoplada a StoreBackend via interface; backends isolados por implementação        |
| D2 — Robustez            | ✅     | Input validation, guard clauses, fallbacks presentes; timeout para git N/A (sync calls) |
| D3 — Boas Práticas       | ✅     | SRP mantido; DIP respeitado (Node built-ins, não libs externas); zero workarounds       |
| D4 — Implementação Ótima | ✅     | 1 loop em Object.keys + 1 loop de dir traversal; sem O(n²); sem constantes mágicas      |
| D5 — Métricas            | ❌ N/A | Store não produz métricas próprias                                                      |
| D6 — UX                  | ✅     | rootLogger.warn na falha de GitStoreBackend com fallback explicativo                    |
| D7 — Deep Test Audit     | ✅     | Weak assertions seguidas de asserts reais; zero no-assert; mocks com shape idêntico     |

<!-- CHECKPOINT: Phase 3 complete for FT-07 -->

#### Gaps Registrados

| ID  | Severidade | Descrição                                                              | Local                        | Origem (T/D) |
| --- | ---------- | ---------------------------------------------------------------------- | ---------------------------- | ------------ |
| G1  | Médio      | `(err as Error).message` type assertion — não valida tipo real do erro | store-backend.ts:60, 82, 111 | T14f         |
| G2  | Alto       | `writeJson` sem try/catch — I/O failures propagam sem log              | store.ts:38-40               | T11 / T18    |
| G3  | Médio      | `ensure()` sem try/catch — `backend.init()` propagando sem log         | store.ts:50-55               | T11 / T18    |

**Total: 3 gaps** (1 Alto, 2 Médio)

<!-- CHECKPOINT: Phase 4 complete for FT-07 -->

#### Phase 5-6 — Correções Aplicadas

| Gap | Severidade | Local                        | Correção                                                                      |
| --- | ---------- | ---------------------------- | ----------------------------------------------------------------------------- |
| G1  | Médio      | store-backend.ts:60, 82, 111 | `(err as Error).message` → `err instanceof Error ? err.message : String(err)` |
| G2  | Alto       | store.ts:38-40               | `writeJson` com try/catch + rootLogger.warn + re-throw                        |
| G3  | Médio      | store.ts:50-55               | `ensure()` com try/catch + rootLogger.warn + re-throw                         |

#### Phase 7 — Consumidores

| Consumidor                              | Status | Observações                      |
| --------------------------------------- | ------ | -------------------------------- |
| shared/session-context.ts               | ✅     | 252/252 tests pass               |
| git_triggers/pipeline-handler.ts        | ✅     | Sem testes unitários próprios    |
| shared/metrics.ts                       | ✅     | Coberto pela suite metrics       |
| git_triggers/pipeline-jira.ts           | ✅     | Coberto pela suite pipeline-jira |
| jira_management/commands/case15.test.ts | ✅     | 252/252 tests pass               |

#### Phase 8 — Refatoração

🟢 **Skip** — sem duplicação, nomes claros, complexidade baixa, I/O já separado por camada.

#### Validação

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npm run lint` — ✅ All quality checks passed
- ✅ `npx vitest run store` — 76/76 passed
- ✅ Consumidores — sem regressões (252 tests)
- ✅ Git diff audit — 4 arquivos, todos esperados

<!-- CHECKPOINT: Phase 9 complete for FT-07 -->
<!-- CHECKPOINT: Phase 10 complete for FT-07 -->

## Próximos FTs — Pendentes

Todos os demais FTs (FT-05 a FT-42+) estão pendentes, aguardando auditoria conforme a nova metodologia (T1-T20 + 7 dimensões).
