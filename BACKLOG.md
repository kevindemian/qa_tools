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

| ID  | Componente            | Arquivo                        | Status |
| --- | --------------------- | ------------------------------ | ------ |
| C1  | `jiraMode` no schema  | `shared/config-schema.ts`      | ✅     |
| C2  | `jiraMode` em types   | `shared/types/common.ts`       | ✅     |
| C3  | Validação do mode     | `shared/config-accessor.ts`    | ✅     |
| C4  | Testes de schema/mode | `shared/config-schema.test.ts` | ✅     |

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

## ✅ Sprint 7 — Revisão Híbrida: Self-Critique (Mesma LLM) + iMAD Trigger + 2-LLM Escalation

### Fase A — Foundation (Cost Tracking + Config)

| ID  | Componente                    | Arquivo                         | Status |
| --- | ----------------------------- | ------------------------------- | ------ |
| A1  | `llmReviewBudget` no schema   | `shared/config-schema.ts`       | ✅     |
| A2  | `llmReviewStrategy` no schema | `shared/config-schema.ts`       | ✅     |
| A3  | MODEL_PRICING + \_trackCost   | `shared/llm-fallback-config.ts` | ✅     |
| A4  | totalCostUSD + costPerTier    | `shared/llm-metrics.ts`         | ✅     |

### Fase B — Core Logic

| ID  | Componente                            | Arquivo                | Status |
| --- | ------------------------------------- | ---------------------- | ------ |
| B1  | Self-critique tier: reviewer → report | `shared/llm-review.ts` | ✅     |
| B2  | Prompt diferenciado self-critique     | `shared/llm-review.ts` | ✅     |
| B3  | iMAD heuristics                       | `shared/llm-review.ts` | ✅     |
| B4  | shouldSkipAdversarialReview trigger   | `shared/llm-review.ts` | ✅     |
| B5  | reviewWithLlm adaptado ao trigger     | `shared/llm-review.ts` | ✅     |

### Fase C — Config + Docs

| ID  | Componente            | Arquivo               | Status |
| --- | --------------------- | --------------------- | ------ |
| C1  | `.env.example`        | `.env.example`        | ✅     |
| C2  | `docs/06-env-vars.md` | `docs/06-env-vars.md` | ✅     |

### Fase D — Testes

| ID  | Componente          | Arquivo                     | Status |
| --- | ------------------- | --------------------------- | ------ |
| D1  | Testes llm-review   | `shared/llm-review.test.ts` | ✅     |
| D2  | Cost tracking tests | `shared/llm-cost.test.ts`   | ✅     |
