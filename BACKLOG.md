# Backlog

> **ORIENTAÇÃO**: Este arquivo contém **APENAS** tarefas pendentes ou em andamento.
> Tarefas concluídas devem ser **imediatamente migradas** para [`BACKLOG-historico.md`](BACKLOG-historico.md).
> Após concluir um item, copie sua linha/raw para o histórico e remova-a daqui.
>
> Cada tarefa é classificada como:
>
> - 🐛 **débito** — código existente que precisa de correção/conexão
> - ✨ **feature** — nova funcionalidade a ser implementada
> - ♻️ **refactor** — reestruturação sem mudança de comportamento
> - 🔧 **chore** — manutenção (deps, config, tooling)
> - 📋 **test** — cobertura de testes

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

<!-- Sprint 2, Sprint 3, Sprint 4, Sprint 5 → migrados para BACKLOG-historico.md (100% concluídos) -->

## 🚀 Sprint 6 — Jira Mode: Coexistência Server + Cloud

Implementação do modo Jira Cloud com coexistência Jira Server.
Cada fase inclui: implementação + testes (100% coverage) + documentação.

Objetivo: `JIRA_MODE=server|cloud` com auth strategy diferenciada.

- Server: `Bearer <PAT>` (atual, unchanged)
- Cloud: `Basic <base64(email:apiToken)>`

### Fase 1 — Contrato: Config Schema + Types (P0, ~0.5h)

| ID  | Componente           | Arquivo                   | Status |
| --- | -------------------- | ------------------------- | ------ |
| C1  | `jiraMode` no schema | `shared/config-schema.ts` | ⏳     |

### Fase 4|

| C2 | `jiraMode` em types | `shared/types/common.ts` | ✅ |
| C3 | Validação do mode | `shared/config-accessor.ts` | ✅ |
| C4 | Testes de schema/mode | `shared/config-schema.test.ts` | ✅ |

### Fase 2 — Mecanismo de Autenticação (P0, ~1h)

| ID  | Componente               | Arquivo                    | Status |
| --- | ------------------------ | -------------------------- | ------ |
| A1  | Factory de auth header   | `shared/jira-auth.ts`      | ✅     |
| A2  | Mode param no JiraClient | `shared/jira-client.ts`    | ✅     |
| A3  | Testes de auth strategy  | `shared/jira-auth.test.ts` | ✅     |

### Fase 3 — Entry Points: Injeção do Mode (P0, ~1h)

| ID  | Componente                 | Arquivo                            | Status |
| --- | -------------------------- | ---------------------------------- | ------ |
| E1  | `main.ts` + jiraMode       | `jira_management/main.ts`          | ✅     |
| E2  | `batch-mode.ts` + jiraMode | `git_triggers/batch-mode.ts`       | ✅     |
| E3  | `schedule-handler.ts`      | `git_triggers/schedule-handler.ts` | ✅     |
| E4  | `pipeline-handler.ts`      | `git_triggers/pipeline-handler.ts` | ✅     |
| E5  | `splash.ts` mode-aware     | `shared/splash.ts`                 | ✅     |

### Fase 4 — Testes de Integração (P1, ~0.5h)

| ID  | Componente            | Arquivo                        | Status |
| --- | --------------------- | ------------------------------ | ------ |
| T1  | Smoke test Jira Cloud | `e2e/smoke-jira-cloud.test.ts` | ✅     |

### Fase 5 — Documentação (P2, ~0.5h)

| ID  | Componente            | Arquivo               | Status |
| --- | --------------------- | --------------------- | ------ |
| D1  | `.env.example`        | `.env.example`        | ✅     |
| D2  | `docs/06-env-vars.md` | `docs/06-env-vars.md` | ✅     |

---

## 📊 Métrica alvo (Sprint 6) — ✅ CONCLUÍDA

| Métrica                         | Atual            | Alvo        |
| ------------------------------- | ---------------- | ----------- |
| `tsc --noEmit`                  | 0 erros          | **0 erros** |
| ESLint errors                   | 0                | **0**       |
| ESLint warnings                 | 0                | **0**       |
| `enforce-quality` checks        | 11/11            | **11/11**   |
| `jest` pass                     | 3467 (unitários) | **100%**    |
| `jest` fail                     | 0                | **0**       |
| Test coverage auth strategy     | 100%             | **100%**    |
| Test coverage config validation | 100%             | **100%**    |

### 🔴 Fase 2 — Schemas Zod para Todos os Artefatos — Layer 1 (P1, ~4h)

| ID  | Schema                                   | Arquivo                       | Status |
| --- | ---------------------------------------- | ----------------------------- | ------ |
| S1  | TestSuiteSchema + TestCaseSchema         | `shared/test-suite.schema.ts` | ✅     |
| S2  | PipelineClassificationSchema             | `shared/pipeline-schema.ts`   | ✅     |
| S3  | RunComparisonSchema                      | `shared/comparison-schema.ts` | ✅     |
| S4  | AiBugReportSchema — adicionar `evidence` | `shared/bug-report.schema.ts` | ✅     |

### 🔴 Fase 3.0 — ArtifactValidator Framework — Layer 2 (P0, ~2h)

| ID  | Componente                      | Arquivo                        | Status |
| --- | ------------------------------- | ------------------------------ | ------ |
| V0  | ArtifactValidator base          | `shared/artifact-validator.ts` | ✅     |
| V1  | Shared invariants (I-01 a I-05) | `shared/shared-invariants.ts`  | ✅     |

### 🔴 Fase 3.1–3.6 — Validadores de Domínio (P0, ~8h)

| ID  | Validador           | Invariantes | Arquivo                          | Status |
| --- | ------------------- | ----------- | -------------------------------- | ------ |
| V2  | TestCaseValidator   | T-01 a T-10 | `shared/test-case-validator.ts`  | ✅     |
| V3  | AnalysisValidator   | A-01 a A-05 | `shared/analysis-validator.ts`   | ✅     |
| V4  | PipelineValidator   | P-01 a P-03 | `shared/pipeline-validator.ts`   | ✅     |
| V5  | BugReportValidator  | B-01 a B-04 | `shared/bug-report-validator.ts` | ✅     |
| V6  | ComparisonValidator | C-01 a C-03 | `shared/comparison-validator.ts` | ✅     |

### 🔴 Fase 1 — Infraestrutura Cross-cutting (P0, ~8h)

| ID  | Componente                                             | Arquivo                          | Status |
| --- | ------------------------------------------------------ | -------------------------------- | ------ |
| I1  | Self-consistency (n=3 majority vote)                   | `shared/llm-self-consistency.ts` | ✅     |
| I2  | Targeted retry pattern                                 | `shared/targeted-retry.ts`       | ✅     |
| I3  | Quality metrics (invariant fire rate, layer pass rate) | `shared/quality-metrics.ts`      | ✅     |

### 🔴 Fase 4 — Validação Semântica — Layer 3 (P1, ~5h)

| ID  | Componente                                                  | Arquivo                        | Status |
| --- | ----------------------------------------------------------- | ------------------------------ | ------ |
| E1  | Evidence Citation Verification                              | `shared/evidence-validator.ts` | ✅     |
| E2  | Coverage Recalculation                                      | `shared/coverage-verifier.ts`  | ✅     |
| E3  | Cross-field Logical Check (integrado no artifact-validator) | `shared/artifact-validator.ts` | ✅     |

### 🔴 Fase 5 — Prompt Improvements (P1, ~4h)

| ID  | Template                         | Melhorias                                     | Status |
| --- | -------------------------------- | --------------------------------------------- | ------ |
| P1  | `user-story-to-tests.md`         | Constitution + contra-exemplos + evidence     | ✅     |
| P2  | `failure-analysis.md`            | Constitution + evidence + adversarial framing | ✅     |
| P3  | `bug-report-from-description.md` | Constitution + evidence                       | ✅     |
| P4  | `classify-pipeline-failure.md`   | Constitution + evidence                       | ✅     |
| P5  | `classify.md`                    | Constitution + evidence                       | ✅     |

### 🔴 Fase 6 — Adversarial Review Generalizado (P1, ~6h)

| ID  | Componente                                         | Arquivo                | Status |
| --- | -------------------------------------------------- | ---------------------- | ------ |
| R1  | `reviewWithLlm` generalizado p/ artifact type      | `shared/llm-review.ts` | ✅     |
| R2  | Review prompts por tipo de artefato                | `shared/llm-review.ts` | ✅     |
| R3  | Duas personas: executor + validador adversarial    | `shared/llm-review.ts` | ✅     |
| R4  | Adversarial framing "premissa de não conformidade" | `shared/llm-review.ts` | ✅     |

### 🔴 Fase 7 — Quality Gates + CI + Telemetry (P2, ~3h)

| ID  | Componente                                           | Arquivo                      | Status |
| --- | ---------------------------------------------------- | ---------------------------- | ------ |
| G1  | Check 10: 3 camadas devem passar                     | `scripts/enforce-quality.ts` | ✅     |
| G2  | Check 11: invariant fire rate alerta                 | `scripts/enforce-quality.ts` | ✅     |
| G3  | Telemetry estendida (invariantFires, layerPassRates) | `shared/llm-metrics.ts`      | ✅     |

---

## 📊 Métrica alvo (Sprint 5)

| Métrica                              | Atual      | Alvo        |
| ------------------------------------ | ---------- | ----------- |
| `tsc --noEmit`                       | 0 erros    | **0 erros** |
| ESLint errors                        | 0          | **0**       |
| ESLint warnings                      | 0          | **0**       |
| `enforce-quality` checks             | 9/9        | **11/11**   |
| `jest` pass                          | 3351       | **TBD**     |
| `jest` fail                          | 0          | **0**       |
| Test suite validation coverage       | 0%         | **100%**    |
| Failure analysis validation coverage | 🔶 Parcial | **100%**    |
| Invariant fire rate tracking         | ❌         | **✅**      |
| Evidence citation verification       | ❌         | **✅**      |

---

## 🚀 Sprint 8 — Design Token System + Component Primitives (P0, ~29h)

Implementação do Design Token System + Component Primitives para unificar os 3 sistemas CSS independentes de relatórios HTML.

**Objetivo**: Substituir CSS hardcoded duplicado por tokens centralizados + primitives reutilizáveis com data-attributes.

### Fase 0 — Theme Tokens (P0, ~2h)

| ID  | Componente            | Arquivo                  | Status |
| --- | --------------------- | ------------------------ | ------ |
| T0  | Fonte única de tokens | `shared/theme-tokens.ts` | ✅     |

### Fase 1 — Primitives (P0, ~6h)

| ID  | Componente        | Arquivo                       | Status |
| --- | ----------------- | ----------------------------- | ------ |
| P1  | Layout primitives | `shared/primitives/layout.ts` | ✅     |
| P2  | Card primitives   | `shared/primitives/card.ts`   | ✅     |
| P3  | Badge primitives  | `shared/primitives/badge.ts`  | ✅     |
| P4  | Table primitives  | `shared/primitives/table.ts`  | ✅     |
| P5  | Chart primitives  | `shared/primitives/chart.ts`  | ✅     |
| P6  | Form primitives   | `shared/primitives/form.ts`   | ✅     |
| P7  | Barrel export     | `shared/primitives/index.ts`  | ✅     |

### Fase 2 — CSS via Tokens + Dark Mode Unificado (P0, ~3h)

| ID  | Componente         | Arquivo                   | Status |
| --- | ------------------ | ------------------------- | ------ |
| C1  | CSS vars + tokens  | `shared/report-styles.ts` | ✅     |
| C2  | CSS vars injection | `shared/html-factory.ts`  | ✅     |
| C3  | UITheme via tokens | `shared/theme.ts`         | ✅     |

### Fase 3 — Migrar Section/Table/Chart/Diff para Primitives (P0, ~5h)

| ID  | Componente      | Arquivo                     | Status |
| --- | --------------- | --------------------------- | ------ |
| M1  | Migrar sections | `shared/report-sections.ts` | ✅     |
| M2  | Migrar table    | `shared/report-table.ts`    | ✅     |
| M3  | Migrar chart    | `shared/report-chart.ts`    | ✅     |
| M4  | Migrar html     | `shared/report-html.ts`     | ✅     |
| M5  | Migrar diff     | `shared/report-diff.ts`     | ✅     |

### Fase 4 — Migrar Coverage Gap + Flakiness (P0, ~4h)

| ID  | Componente          | Arquivo                                | Status |
| --- | ------------------- | -------------------------------------- | ------ |
| G1  | Migrar coverage gap | `shared/generate-coverage-gap-html.ts` | ✅     |
| G2  | Migrar flakiness    | `shared/flakiness-dashboard.ts`        | ✅     |

### Fase 5 — Responsividade + Acessibilidade (P0, ~3h)

| ID  | Componente        | Arquivo                   | Status |
| --- | ----------------- | ------------------------- | ------ |
| R1  | Responsive styles | `shared/report-styles.ts` | ✅     |
| R2  | ARIA attributes   | All primitives            | ✅     |

### Fase 6 — Testes (P0, ~6h)

| ID  | Componente                   | Arquivo                                     | Status |
| --- | ---------------------------- | ------------------------------------------- | ------ |
| X1  | Tests theme-tokens           | `shared/theme-tokens.test.ts`               | ✅     |
| X2  | Tests primitive layout       | `shared/primitives/layout.test.ts`          | ✅     |
| X3  | Tests primitive card         | `shared/primitives/card.test.ts`            | ✅     |
| X4  | Tests primitive badge        | `shared/primitives/badge.test.ts`           | ✅     |
| X5  | Tests primitive table        | `shared/primitives/table.test.ts`           | ✅     |
| X6  | Tests primitive chart        | `shared/primitives/chart.test.ts`           | ✅     |
| X7  | Tests primitive form         | `shared/primitives/form.test.ts`            | ✅     |
| X8  | Update report-styles tests   | `shared/report-styles.test.ts`              | ✅     |
| X9  | Update report-sections tests | `shared/report-sections.test.ts`            | ✅     |
| X10 | Update report-table tests    | `shared/report-table.test.ts`               | ✅     |
| X11 | Update report-chart tests    | `shared/report-chart.test.ts`               | ✅     |
| X12 | Update report-html tests     | `shared/report-html.test.ts`                | ✅     |
| X13 | Update coverage-gap tests    | `shared/generate-coverage-gap-html.test.ts` | ✅     |
| X14 | Update flakiness tests       | `shared/flakiness-dashboard.test.ts`        | ✅     |
| X15 | Update theme tests           | `shared/theme.test.ts`                      | ✅     |

---

## 🚀 Sprint 9 — Prompt Governance + Standards-Based Enhancement + Anti-Redundancy (P0, ~10h)

Implementação do sistema de governance para prompts do projeto + extensão do benchmark com métricas de cobertura estrutural + enhancement do prompt `user-story-to-tests.md` com técnicas ISTQB-aligned + novos invariantes T-11/T-12/T-13.

**Objetivos**:

1. Substituir diretivas vagas por regras verificáveis baseadas em standards formais (ISO 29119, ISTQB, IEEE 829)
2. Detectar e prevenir redundância, sobreposição e acoplamento entre casos de teste gerados por LLM (T-13)

### Fase 0 — Governance Document (P0, ~0.5h)

| ID  | Componente            | Arquivo                        | Status |
| --- | --------------------- | ------------------------------ | ------ |
| G0  | Prompt governance doc | `shared/prompts/GOVERNANCE.md` | ✅     |

### Fase 1 — Benchmark Extension (P0, ~3h)

| ID  | Componente                          | Arquivo                                    | Status |
| --- | ----------------------------------- | ------------------------------------------ | ------ |
| B1  | Fixture schema extendido            | `shared/prompts/__fixtures__/index.ts`     | ✅     |
| B2  | Fixture: numeric-age-validation     | `shared/prompts/__fixtures__/.../age.json` | ✅     |
| B3  | Fixture: password-length-validation | `shared/prompts/__fixtures__/.../pwd.json` | ✅     |
| B4  | Validation: criteria coverage       | `shared/llm-benchmark.ts`                  | ✅     |
| B5  | Validation: partition coverage      | `shared/llm-benchmark.ts`                  | ✅     |
| B6  | Validation: boundary coverage       | `shared/llm-benchmark.ts`                  | ✅     |
| B7  | Tests for new validators            | `shared/llm-benchmark.test.ts`             | ✅     |

### Fase 2 — Prompt Enhancement (P0, ~0.5h)

| ID  | Componente                 | Arquivo                                 | Status |
| --- | -------------------------- | --------------------------------------- | ------ |
| P1  | Test Design Techniques sec | `shared/prompts/user-story-to-tests.md` | ✅     |
| P2  | Updated BAD EXAMPLES       | `shared/prompts/user-story-to-tests.md` | ✅     |
| P3  | Updated adversarial audit  | `shared/prompts/user-story-to-tests.md` | ✅     |

### Fase 3 — Validator Enhancement (P0, ~2h)

| ID  | Componente               | Arquivo                                 | Status |
| --- | ------------------------ | --------------------------------------- | ------ |
| V1  | T-11 Partition cov       | `shared/test-case-validator.ts`         | ✅     |
| V2  | T-12 Boundary cov        | `shared/test-case-validator.ts`         | ✅     |
| V3  | Tests T-11/T-12          | `shared/test-case-validator.test.ts`    | ✅     |
| V4  | T-13 Redundancy/Coupling | `shared/test-case-validator.ts`         | ✅     |
| V5  | Tests T-13               | `shared/test-case-validator.test.ts`    | ✅     |
| V6  | Governance definitions   | `shared/prompts/GOVERNANCE.md`          | ✅     |
| V7  | Prompt audit items       | `shared/prompts/user-story-to-tests.md` | ✅     |

### Fase 4 — Baseline + Post-Measurement (P0, ~1h)

| ID  | Componente               | Arquivo                      | Status |
| --- | ------------------------ | ---------------------------- | ------ |
| M1  | Run benchmark (baseline) | `BENCHMARK=true npx tsx ...` | ✅     |
| M2  | Report delta & metrics   | `BACKLOG.md`                 | ✅     |

### Métricas alvo (Sprint 9)

| Métrica                   | Atual                                       | Alvo        |
| ------------------------- | ------------------------------------------- | ----------- |
| `tsc --noEmit`            | **0 erros** ✅                              | **0 erros** |
| ESLint errors             | **0** ✅                                    | **0**       |
| ESLint warnings           | **0** ✅                                    | **0**       |
| `jest` pass               | **3685/3685** ✅                            | **100%**    |
| `jest` fail               | **0** ✅                                    | **0**       |
| Benchmark pass rate       | **100%** ✅                                 | **≥85%**    |
| Criteria coverage metric  | **44%** ⚠️                                  | **≥80%**    |
| Partition coverage metric | **22%** ⚠️                                  | **≥70%**    |
| Boundary coverage metric  | **22%** ⚠️                                  | **≥60%**    |
| Token count increase      | ~6% (5473→5188) ✅                          | **≤15%**    |
| LLM cost per run          | **~$0.03** (gpt-4o-mini / groq / gh models) | N/A         |
