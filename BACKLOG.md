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

## 🚀 Sprint UX — Débitos de Experiência do Usuário (P0-P3)

Correções estruturais identificadas na auditoria UX completa (jun/2026).
Agrupadas por gravidade: P0 (crítico) → P3 (nice-to-have).

### Críticos (P0)

| ID  | Item                                                                                                                                           | Arquivos                                          | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------- | ------ |
| UX1 | 🐛 `uncaughtException` não tratado — exceção síncrona causa crash bruto (stack trace + core dump) sem `printError`/`printSessionSummary`       | `jira_management/main.ts`, `git_triggers/main.ts` | 15min   | ✅     |
| UX2 | 🐛 SIGINT duplicado: `temp-dir.ts` limpa diretórios temporários ANTES do `cli_base.ts` confirmar saída — se usuário cancela, temp já destruído | `shared/temp-dir.ts`, `shared/cli_base.ts`        | 30min   | ✅     |
| UX3 | 🐛 `smartPrompt` retorna `""` sem feedback — usuário queima 3 retries sem saber, recebe string vazia que callers não guardam                   | `shared/prompt-input-inquirer.ts`                 | 20min   | ✅     |

### Maiores (P1)

| ID  | Item                                                                                                                               | Arquivos                                                | Esforço | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- | ------ |
| UX4 | 🐛 Inquirer `select()` lança exceção → fallback retorna `'0'` (EXIT) sem explicação — usuário é navegado para fora silenciosamente | `shared/prompt-input-inquirer.ts`                       | 15min   | ✅     |
| UX5 | 🐛 Seleção de projeto Git depende de `Object.keys()` — ordem imprevisível se `projects.json` é editado manualmente                 | `git_triggers/main.ts`, `git_triggers/session-state.ts` | 20min   | ✅     |
| UX6 | 🐛 Gap badge fetch sem spinner + falha silenciosa — splash congela 3-5s sem indicador de carregamento                              | `jira_management/main.ts`                               | 20min   | ✅     |
| UX7 | 🐛 Setup wizard: GitLab CI existente ignorado sem prompt de overwrite (GitHub Actions sobrescreve) — inconsistente                 | `setup/main.ts`                                         | 15min   | ✅     |
| UX8 | 🐛 Git triggers: `printSessionSummary` não passa `history` — sessão não mostra últimas operações, inconsistente com Jira           | `git_triggers/session-state.ts`                         | 10min   | ✅     |

### Menores (P2)

| ID   | Item                                                                                                                 | Arquivos                                          | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------- | ------ |
| UX9  | 🐛 Health score falha silenciosa — catch vazio sem `rootLogger.debug()`                                              | `jira_management/main.ts`, `git_triggers/main.ts` | 5min    | ✅     |
| UX10 | 🐛 First-run wizard nunca roda se `.env` está OK — `isFirstRun()` retorna `true` mas `offerEnvSetup()` bloqueia      | `jira_management/main.ts`, `git_triggers/main.ts` | 10min   | ✅     |
| UX11 | 🐛 `longOps` pause só com erro — operação longa bem-sucedida volta direto ao menu sem pausa                          | `jira_management/main.ts`                         | 10min   | ✅     |
| UX12 | 🐛 `/back` no menu principal ≡ `/exit` — usuário vê "Até logo!" em vez de retornar ao seletor de módulos             | `jira_management/ui-helpers.ts`                   | 10min   | ✅     |
| UX13 | 🐛 Setup wizard lê `.git/config` de `process.cwd()` e não do diretório do projeto — detecção errada em CWD incorreto | `setup/main.ts`                                   | 10min   | ✅     |
| UX14 | 🐛 Nenhum módulo aceita `--help` / `--version` — flags CLI ignoradas, entra no fluxo normal                          | `jira_management/main.ts`, `git_triggers/main.ts` | 15min   | ✅     |

### Menu mapping gaps (P2)

| ID   | Item                                                                                                                                         | Arquivos                        | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------- | ------ |
| UX21 | 🐛 Git Triggers menu não lista `/docs` — handler existe (`_dispatchAction` `main.ts:225-228`) mas menu não expõe (inconsistente com Jira)    | `git_triggers/session-state.ts` | 5min    | ✅     |
| UX22 | 🐛 Entry menu (`entry-menu.ts:49-54`) não lista Setup Wizard — módulo `setup/main.ts` só acessível via comando direto ou dentro de submodulo | `shared/entry-menu.ts`          | 10min   | ✅     |

### Gaps em cenários de erro (P2)

| ID   | Item                                                                                                                | Arquivos                                           | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------- | ------ |
| UX15 | 🐛 Retry em falha de rede não é automático — usuário precisa escolher [R] manualmente a cada erro transiente        | `shared/http-client.ts`, `shared/prompt-errors.ts` | 30min   | ✅     |
| UX16 | 🐛 Aviso "Jira não configurado" aparece DEPOIS do prompt de nome do projeto — ordem invertida                       | `jira_management/main.ts`                          | 5min    | ✅     |
| UX17 | 🐛 Token expira em meio à sessão — sem atalho "reconfigurar token", usuário precisa sair, editar `.env` e reiniciar | `shared/prompt-errors.ts`                          | 20min   | ✅     |
| UX18 | 🐛 Nome de projeto inválido só descoberto na primeira operação — sem validação proativa no startup                  | `jira_management/main.ts`                          | 20min   | ✅     |
| UX19 | 🐛 Non-TTY com stdin pipeado pode travar em `/help` — `readline-sync.question` espera input interativo mesmo em CI  | `shared/prompt-input-base.ts`                      | 20min   | ✅     |
| UX20 | 🐛 Operações multi-step (ex: CSV import) sem progresso intermediário — spinner genérico sem "passo X de Y"          | `jira_management/commands/`                        | 1h      | ✅     |

### Sugestões de melhoria (P3)

| ID   | Item                                                                                                                 | Arquivos                                                | Esforço | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- | ------ |
| UX23 | 💡 Setup wizard: mostrar valor detectado na pergunta (ex: "Test framework [Jest]:")                                  | `setup/main.ts`                                         | 15min   | ✅     |
| UX24 | 💡 Splash: adicionar dica de navegação "Categorias: 1-6 · /help `<tópico>`" para novos usuários                      | `shared/splash.ts`                                      | 5min    | ✅     |
| UX25 | 💡 `console.clear()` no menu loop: suporte `--no-clear` ou `QA_TOOLS_NO_CLEAR=true` para preservar scrollback        | `jira_management/main.ts`, `git_triggers/main.ts`       | 15min   | ✅     |
| UX26 | 💡 Batch mode: flag `--dry-run` que mostra plano de execução sem executar                                            | `git_triggers/batch-mode.ts`                            | 20min   | ✅     |
| UX27 | 💡 Ações destrutivas (disparar pipeline, publicar versão): confirmação centralizada via `confirmDestructiveAction()` | Ambos `main.ts`                                         | 30min   | ✅     |
| UX28 | 💡 Cabeçalho do menu: mostrar última operação no contador ("3 op · 2 ✓ 1 ✗ · Última: Criar testes")                  | `jira_management/ui-helpers.ts`, `git_triggers/main.ts` | 15min   | ✅     |
| UX29 | 💡 Lista de projetos Git: marcar último usado com `*` na exibição                                                    | `git_triggers/session-state.ts`                         | 5min    | ✅     |

### Métricas alvo (Sprint UX)

| Métrica          | Alvo        |
| ---------------- | ----------- |
| `tsc --noEmit`   | 0 erros     |
| `eslint`         | 0 erros     |
| `jest`           | 100% pass   |
| Débitos UX novos | 0           |
| Catch vazios     | 0           |
| SIGINT handlers  | 1 unificado |

---

## 🚀 Sprint A — Auditoria Adversarial: Correções (P0-P2)

Correções estruturais identificadas na auditoria adversarial completa (jun/2026).

| ID  | Item                                                                                                  | Arquivos                                                                                     | Esforço | Status |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| A1  | ♻️ Split `llm-review.ts` por SRP (prompts + analyzer + orchestration)                                 | `shared/llm-review.ts`, `shared/llm-review-prompts.ts`, `shared/llm-review-analyzer.ts`      | 2h      | ⏳     |
| A2  | ♻️ Refatorar `runQualityGate`: 4 helpers + side effect isolado                                        | `shared/quality-gate.ts`                                                                     | 1h      | ⏳     |
| A3  | 🔧 Adicionar debug log em `resp.text().catch(() => '')`                                               | `shared/llm-fallback-http.ts`                                                                | 5min    | ⏳     |
| A4  | 🔧 Categorizar `catch {}` sem parâmetro (8 recovery + 4 cleanup)                                      | 12 arquivos em `shared/`                                                                     | 30min   | ⏳     |
| A5  | 📋 Merge `llm-cost.test.ts` em `llm-fallback-config.test.ts` + `llm-review.test.ts`, deletar original | `shared/llm-cost.test.ts`, `shared/llm-fallback-config.test.ts`, `shared/llm-review.test.ts` | 30min   | ⏳     |

### Métricas alvo (Sprint A)

| Métrica               | Alvo         |
| --------------------- | ------------ |
| `tsc --noEmit`        | 0 erros      |
| `eslint`              | 0 erros      |
| `jest`                | 100% pass    |
| Débitos novos         | 0            |
| `llm-review.ts` size  | < 500 linhas |
| `runQualityGate` size | < 70 linhas  |
| Orphan tests          | 0            |

## 🚀 Sprint 6 — Jira Mode: Coexistência Server + Cloud

Implementação do modo Jira Cloud com coexistência Jira Server.
Cada fase inclui: implementação + testes (100% coverage) + documentação.

Objetivo: `JIRA_MODE=server|cloud` com auth strategy diferenciada.

- Server: `Bearer <PAT>` (atual, unchanged)
- Cloud: `Basic <base64(email:apiToken)>`

### Fase 1 — Contrato: Config Schema + Types (P0, ~0.5h)

| ID  | Componente           | Arquivo                   | Status |
| --- | -------------------- | ------------------------- | ------ |
| C1  | `jiraMode` no schema | `shared/config-schema.ts` | ✅     |

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

## 🚀 Sprint 10 — Fase 1: Orquestração (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 1 do STRATEGIC-PLAN.md: conectar, encapsular e expor capacidades existentes como serviços orquestrados.

**Objetivo:** Transformar 10 ferramentas isoladas em 1 plataforma que coleta, correlaciona, decide e age.

**Premissa verificada por auditoria adversarial de 6 explorações paralelas:** Todo código já existe e está testado (3800+ testes). O trabalho é **conectar** — não reimplementar.

### Fase 0 — Gaps Estruturais (P0, ~0h) — ✅

_Auditoria adversarial confirmou: TODOS os 8 gaps originais já estavam resolvidos no código._

### Fase 0.5 — Ativar Código Órfão (P0, ~2.5h) — ✅

| ID  | Módulo órfão                        | Arquivo(s)                         | Status |
| --- | ----------------------------------- | ---------------------------------- | ------ |
| O1  | `enforce-quality.ts`                | `.github/workflows/ci.yml`         | ✅     |
| O2  | `pipeline-health.ts`                | `git_triggers/batch-mode.ts`       | ✅     |
| O4  | `generatePipelineQuarantine()`      | `git_triggers/batch-mode.ts`       | ✅     |
| O5  | `.githooks/pre-push`                | `setup/templates/pre-push-hook.ts` | ✅     |
| O6  | `shared/report-export.ts`           | `git_triggers/batch-mode.ts`       | ✅     |
| O7  | `shared/run-comparison.ts`          | `git_triggers/schedule-handler.ts` | ✅     |
| O8  | `saveMetrics` privado em metrics.ts | `shared/metrics.ts`                | ✅     |

### Fase 1.1 — CI Quality Gate + Pre-push Hook (P0, ~2h) — ✅

| ID  | Componente               | Arquivo(s)                                                            | Status |
| --- | ------------------------ | --------------------------------------------------------------------- | ------ |
| Q1  | CLI `qa-quality-gate`    | `shared/quality-gate.ts` + `scripts/quality-gate.ts` + `package.json` | ✅     |
| Q2  | Gate wireado em CI       | `.github/workflows/ci.yml`                                            | ✅     |
| Q3  | Pre-push com test-impact | `.githooks/pre-push`                                                  | ✅     |

### Fase 1.2 — Failure Auto-Triage + Persistence (P0, ~3h) — ✅

| ID  | Componente                    | Arquivo(s)                                  | Status |
| --- | ----------------------------- | ------------------------------------------- | ------ |
| T1  | `QA_AUTO_BUG=true` flag       | `git_triggers/pipeline-handler.ts`          | ✅     |
| T2  | Persistir classifications/run | `shared/metrics.ts` + `failure-analysis.ts` | ✅     |
| T3  | Git blame integration         | `shared/failure-analysis.ts`                | ✅     |

### Fase 1.3 — Flaky Thresholds Docs (P1, ~0.5h) — ✅

| ID  | Componente                  | Arquivo(s)     | Status |
| --- | --------------------------- | -------------- | ------ |
| F1  | Documentar thresholds flaky | `.env.example` | ✅     |

### Fase 1.4 — Quality Weekly Report (P1, ~3h) — ✅

| ID  | Componente                        | Arquivo(s)                         | Status |
| --- | --------------------------------- | ---------------------------------- | ------ |
| W1  | Weekly report em schedule-handler | `git_triggers/schedule-handler.ts` | ✅     |

### Fase 1.5 — Dashboards (P2, ~5h) — ✅

| ID  | Componente                     | Arquivo(s)                      | Status |
| --- | ------------------------------ | ------------------------------- | ------ |
| D1  | Release Readiness Score        | `shared/release-score.ts`       | ✅     |
| D2  | Defect Trend Dashboard         | `shared/defect-trend.ts`        | ✅     |
| D3  | Traceability Matrix            | `shared/traceability-matrix.ts` | ✅     |
| D4  | Backlog Health Dashboard       | `shared/backlog-health.ts`      | ✅     |
| D5  | AI Gen Effectiveness Dashboard | `shared/ai-effectiveness.ts`    | ✅     |

### Fase 1.6 — Testes + CI Integration (P0, ~1.5h) — ✅

| ID  | Componente                    | Arquivo(s)                   | Status |
| --- | ----------------------------- | ---------------------------- | ------ |
| X1  | Tests para novos módulos      | `shared/*.test.ts`           | ✅     |
| X2  | Update enforce-quality checks | `scripts/enforce-quality.ts` | ✅     |

### Métricas finais (Sprint 10)

| Métrica                   | Alvo           | Resultado      |
| ------------------------- | -------------- | -------------- |
| `tsc --noEmit`            | **0 erros**    | **0 erros**    |
| ESLint errors             | **0**          | **0**          |
| ESLint warnings           | **0**          | **0**          |
| `jest` pass               | **100%**       | **3816/3829**  |
| `jest` fail               | **0**          | **0**          |
| enforce-quality checks    | **13/13**      | **13/13**      |
| Módulos órfãos eliminados | **0**          | **0**          |
| Dashboards implementados  | **5**          | **5**          |
| Auto-triage funcional     | **automático** | **automático** |

---

## 🚀 Sprint 11 — Fase 2: Acúmulo + Sinergia (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 2 do STRATEGIC-PLAN.md: análise cross-run, detecção de regressão silenciosa, perfil de desenvolvedor, benchmarks e otimização.

**Objetivo:** 6 dashboards analíticos que correlacionam dados acumulados para gerar inteligência acionável.

### #11 — Defect Seasonality Dashboard (P1, ~3h) — ✅

| ID  | Componente                     | Arquivo(s)                          | Status |
| --- | ------------------------------ | ----------------------------------- | ------ |
| S1  | `aggregateDefectSeasonality()` | `shared/defect-seasonality.ts`      | ✅     |
| S2  | `generateSeasonalityHtml()`    | `shared/defect-seasonality.ts`      | ✅     |
| S3  | Tests                          | `shared/defect-seasonality.test.ts` | ✅     |
| S4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts`  | ✅     |

### #12 — Silent Regression Detector (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| R1  | `detectSilentRegression()`       | `shared/silent-regression.ts`      | ✅     |
| R2  | `generateSilentRegressionHtml()` | `shared/silent-regression.ts`      | ✅     |
| R3  | Tests                            | `shared/silent-regression.test.ts` | ✅     |
| R4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### #13 — AI Test Effectiveness (P1, ~3h) — ✅

| ID  | Componente                   | Arquivo(s)                         | Status |
| --- | ---------------------------- | ---------------------------------- | ------ |
| A1  | `compareAiVsManual()`        | `shared/ai-comparison.ts`          | ✅     |
| A2  | `generateAiComparisonHtml()` | `shared/ai-comparison.ts`          | ✅     |
| A3  | Tests                        | `shared/ai-comparison.test.ts`     | ✅     |
| A4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts` | ✅     |

### #14 — Cross-Squad Benchmark (P1, ~3h) — ✅

| ID  | Componente                     | Arquivo(s)                             | Status |
| --- | ------------------------------ | -------------------------------------- | ------ |
| B1  | `computeCrossSquadBenchmark()` | `shared/cross-squad-benchmark.ts`      | ✅     |
| B2  | `generateBenchmarkHtml()`      | `shared/cross-squad-benchmark.ts`      | ✅     |
| B3  | Tests                          | `shared/cross-squad-benchmark.test.ts` | ✅     |
| B4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts`     | ✅     |

### #15 — Developer Profile (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| D1  | `buildDeveloperProfile()`        | `shared/developer-profile.ts`      | ✅     |
| D2  | `generateDeveloperProfileHtml()` | `shared/developer-profile.ts`      | ✅     |
| D3  | Tests                            | `shared/developer-profile.test.ts` | ✅     |
| D4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### #16 — Suite Optimization Advisor (P2, ~4h) — ✅

| ID  | Componente                   | Arquivo(s)                          | Status |
| --- | ---------------------------- | ----------------------------------- | ------ |
| O1  | `analyzeSuiteOptimization()` | `shared/suite-optimization.ts`      | ✅     |
| O2  | `generateOptimizationHtml()` | `shared/suite-optimization.ts`      | ✅     |
| O3  | Tests                        | `shared/suite-optimization.test.ts` | ✅     |
| O4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts`  | ✅     |

### Gap estrutural: pipeline-health.ts (P0)

| ID  | Componente                               | Arquivo(s)                             | Status |
| --- | ---------------------------------------- | -------------------------------------- | ------ |
| G1  | Wirear `pipeline-health.ts` em entry pts | `git_triggers/batch-mode.ts`           | ✅     |
| G2  | Tests pipeline-health wiring             | `git_triggers/pipeline-health.test.ts` | ✅     |

### Métricas finais (Sprint 11)

| Métrica                 | Alvo              | Atual          |
| ----------------------- | ----------------- | -------------- |
| `tsc --noEmit`          | **0 erros**       | **0 erros**    |
| ESLint errors           | **0**             | **0**          |
| ESLint warnings         | **0**             | **0**          |
| enforce-quality checks  | **15/15**         | **15/15**      |
| Anti-patterns no código | **0**             | **0**          |
| `jest` pass             | **100%**          | **~3994/4007** |
| `jest` fail             | **0**             | **0 (unit)**   |
| Dashboards Fase 2       | **6**             | **6**          |
| Weekly report completo  | **11 dashboards** | **11/11**      |
| Auto-integridade        | **✅**            | **✅**         |

---

## 🚀 Sprint 12.5 — Git Metrics Adapter (P0, ~2h) — ✅ CONCLUÍDA

Implementação do adaptador git → MetricsRun[] para autovalidação das funcionalidades de saúde/qualidade usando o próprio histórico do projeto.

**Objetivo:** Substituir o estado "sem dados" do quality gate e dashboards por métricas reais derivadas do git log, eliminando a dependência de dados externos de pipeline.

### Fase única — Git Metrics Adapter (P0, ~2h)

| ID  | Componente                            | Arquivo(s)                           | Status |
| --- | ------------------------------------- | ------------------------------------ | ------ |
| G1  | `generateGitMetricsRuns()`            | `shared/git-metrics-adapter.ts`      | ✅     |
| G2  | `generateGitFailureClassifications()` | `shared/git-metrics-adapter.ts`      | ✅     |
| G3  | Tests                                 | `shared/git-metrics-adapter.test.ts` | ✅     |
| G4  | Wirear fallback no quality-gate       | `shared/quality-gate.ts`             | ✅     |
| G5  | Wirear fallback no schedule-handler   | `git_triggers/schedule-handler.ts`   | ✅     |

### Métricas finais

| Métrica                    | Alvo        | Resultado        |
| -------------------------- | ----------- | ---------------- |
| `tsc --noEmit`             | **0 erros** | **0 erros**      |
| ESLint errors/warnings     | **0**       | **0**            |
| enforce-quality checks     | **15/15**   | **15/15**        |
| `jest` pass                | **100%**    | **4122/4124**    |
| `jest` fail                | **0**       | **0**            |
| Cobertura testes adaptador | **100%**    | **23/23 testes** |
| Débitos técnicos novos     | **0**       | **0**            |
| CI build                   | **✅ pass** | **✅ pass**      |

## 🚀 Sprint 12 — Fase 3: Inteligência Avançada (STRATEGIC-PLAN.md) — ✅ CONCLUÍDA

Implementação da Fase 3 do STRATEGIC-PLAN.md: inteligência avançada que correlaciona múltiplas fontes para gerar investigação, alertas, scores e analytics.

**Pré-condições verificadas:** Fase 1 completa com dados acumulados. Fase 2 completa com 6 dashboards operacionais. pipeline-health.ts wireado em batch-mode.ts. per-test duration persistido.

### #20 — Pipeline Cost Analytics (P1, ~3h) — ✅

| ID  | Componente                   | Arquivo(s)                         | Status |
| --- | ---------------------------- | ---------------------------------- | ------ |
| C1  | `calculatePipelineCost()`    | `shared/pipeline-cost.ts`          | ✅     |
| C2  | `generatePipelineCostHtml()` | `shared/pipeline-cost.ts`          | ✅     |
| C3  | Tests                        | `shared/pipeline-cost.test.ts`     | ✅     |
| C4  | Wirear em weekly report      | `git_triggers/schedule-handler.ts` | ✅     |

### #18 — Impact-Aware Pipeline Alert (P1, ~4h) — ✅

| ID  | Componente                  | Arquivo(s)                         | Status |
| --- | --------------------------- | ---------------------------------- | ------ |
| I1  | `analyzePipelineImpact()`   | `shared/impact-alert.ts`           | ✅     |
| I2  | `generateImpactAlertHtml()` | `shared/impact-alert.ts`           | ✅     |
| I3  | Tests                       | `shared/impact-alert.test.ts`      | ✅     |
| I4  | Wirear em weekly report     | `git_triggers/schedule-handler.ts` | ✅     |

### #17 — Incident Investigation Report (P1, ~5h) — ✅

| ID  | Componente                     | Arquivo(s)                         | Status |
| --- | ------------------------------ | ---------------------------------- | ------ |
| N1  | `buildIncidentReport()`        | `shared/incident-report.ts`        | ✅     |
| N2  | `generateIncidentReportHtml()` | `shared/incident-report.ts`        | ✅     |
| N3  | Tests                          | `shared/incident-report.test.ts`   | ✅     |
| N4  | Wirear em weekly report        | `git_triggers/schedule-handler.ts` | ✅     |

### #19 — Requirement Quality Score (P1, ~3h) — ✅

| ID  | Componente                       | Arquivo(s)                         | Status |
| --- | -------------------------------- | ---------------------------------- | ------ |
| Q1  | `calculateRequirementScores()`   | `shared/requirement-score.ts`      | ✅     |
| Q2  | `generateRequirementScoreHtml()` | `shared/requirement-score.ts`      | ✅     |
| Q3  | Tests                            | `shared/requirement-score.test.ts` | ✅     |
| Q4  | Wirear em weekly report          | `git_triggers/schedule-handler.ts` | ✅     |

### Métricas finais (Sprint 12)

| Métérica                  | Alvo              | Resultado         |
| ------------------------- | ----------------- | ----------------- |
| `tsc --noEmit`            | **0 erros**       | **0 erros**       |
| ESLint errors             | **0**             | **0**             |
| ESLint warnings           | **0**             | **0**             |
| enforce-quality checks    | **15/15**         | **15/15**         |
| Anti-patterns no código   | **0**             | **0**             |
| `jest` pass               | **100%**          | **4099/4101**     |
| `jest` fail               | **0**             | **0 (unit)**      |
| Dashboards Fase 3         | **4**             | **4**             |
| Weekly report completo    | **15 dashboards** | **15 dashboards** |
| Cobertura testes Fase 3   | **100%**          | **100%**          |
| Módulos órfãos eliminados | **0**             | **0**             |
| Débitos técnicos novos    | **0**             | **0**             |

---

## 🚀 Sprint V1 — Value Extraction: Housekeeping — ✅ CONCLUÍDA

| ID  | Item                                                           | Status |
| --- | -------------------------------------------------------------- | ------ |
| 0a  | Adicionar `KNOWN_ISSUES_PATH` em `docs/06-env-vars.md`         | ✅     |
| 0b  | Adicionar shadow env vars ao `config-schema.ts` (13 entries)   | ✅     |
| 0c  | Remover env vars mortas do `.env.example`                      | ✅     |
| 0d  | Adicionar `QA_GATE_*` + `QA_GIT_BLAME_IGNORE` ao schema + docs | ✅     |
| 0e  | Exportar 4 funções privadas do batch-mode.ts                   | ✅     |
| 0f  | Atualizar `.unused-exports-baseline`                           | ✅     |
| M1  | Conectar `generateWithRetry` ao `llm-client.ts`                | ✅     |

## 🚀 Sprint V0.5 — Value Extraction: Documentação — ✅ CONCLUÍDA

| ID  | Item                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| D1  | Fix `config-writer.ts`: `JIRA_TOKEN` → `JIRA_PERSONAL_TOKEN` | ✅     |
| D2  | Fix `docs/05-json-format.md`: template path errado           | ✅     |
| D3  | Fix `docs/09-troubleshooting.md`: wrong file references      | ✅     |
| D4  | `docs/02-jira-management.md`: Add handler 24 (setup wizard)  | ✅     |
| D5  | `docs/02-jira-management.md`: Fix option category table      | ✅     |
| D6  | `docs/02-jira-management.md`: Fix aliases in category table  | ✅     |
| D7  | `docs/02-jira-management.md`: Fix state path references      | ✅     |
| D8  | `docs/02-jira-management.md`: Remove aliases inexistentes    | ✅     |
| D9  | `docs/00-install.md`: Add 20+ env vars faltantes             | ✅     |
| D10 | `docs/00-install.md`: Fix `ON_ERROR` values                  | ✅     |
| D11 | `docs/00-install.md`: Fix `JIRA_PROJECT` default             | ✅     |
| D12 | `docs/06-env-vars.md`: Add `KNOWN_ISSUES_PATH`               | ✅     |
| D13 | `docs/01-primeiros-passos.md`: Fix menu categories           | ✅     |
| D14 | `docs/03-git-triggers.md`: Add batch mode flags              | ✅     |
| D15 | `README.md`: Update test count, fix lint desc                | ✅     |
| D16 | `STRATEGIC-PLAN.md`: Mark Fases 1-3 as implemented           | ✅     |
| D17 | `WORKPLAN.md`: Mark Fase 1 done, TUI_STYLE.md note           | ✅     |
| D18 | `CAPABILITIES-ANALYSIS*.md`: Add obsolescence note           | ✅     |
| D19 | `docs/07-config-files.md`: Fix `known-issues.json` reference | ✅     |
| D20 | `docs/PRODUCTION-CONFIG.md`: Fix P1/P3 bug report status     | ✅     |
| D21 | Alinhar cross-doc: state path, defaults, menu labels         | ✅     |
| D22 | Verificar consistência schema ↔ docs                         | ✅     |

## 🚀 Sprint V3 — Value Extraction: Conexões — ✅ CONCLUÍDA

| ID  | Item                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 1a  | CI template: batch post-processing como default               | ✅     |
| 1b  | Conectar `evaluateQualityGate()` ao relatório semanal         | ✅     |
| 1c  | Quality gate fail por flaky → trigger `executeFlakyActions()` | ✅     |
| 1d  | Adicionar entrada de menu "Executar batch" no git triggers    | ✅     |
| 1e  | Documentar batch mode + novas entradas de menu                | ✅     |
| M2  | Flaky auto-actions consumirem `QA_GIT_BLAME_IGNORE`           | ✅     |
| M3  | Health score no header da sessão interativa                   | ✅     |
| M7  | Menu "Relatório completo de qualidade"                        | ✅     |

## 🚀 Sprint V4 — Value Extraction: Reuso de Infra — ✅ CONCLUÍDA

| ID  | Item                                      | Status |
| --- | ----------------------------------------- | ------ |
| 2a  | Circuit breaker nos HTTP clients externos | ✅     |
| 2b  | Self-consistency no `failure-analysis.ts` | ✅     |
| M5  | Git metrics fallback em dashboards        | ✅     |

## 🚀 Sprint V5 — Value Extraction: Consolidação — ✅ CONCLUÍDA

| ID  | Item                                               | Status |
| --- | -------------------------------------------------- | ------ |
| 3a  | Fluxo gap analysis → AI generation (case21→case18) | ✅     |
| M6  | Adicionar env vars ao config-schema                | ✅     |

### Métricas finais (Sprints V1–V5)

| Métrica                     | Alvo        | Resultado     |
| --------------------------- | ----------- | ------------- |
| `tsc --noEmit`              | **0 erros** | **0 erros**   |
| ESLint errors/warnings      | **0**       | **0**         |
| `jest` pass                 | **100%**    | **4122/4124** |
| `jest` fail                 | **0**       | **0**         |
| Débitos técnicos novos      | **0**       | **0**         |
| Módulos órfãos conectados   | **0**       | **0**         |
| Documentação corrigida      | **22 docs** | **22 docs**   |
| Conexões implementadas      | **8 itens** | **8 itens**   |
| Reuso de infra implementado | **3 itens** | **3 itens**   |
| Consolidação implementada   | **2 itens** | **2 itens**   |
