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

## 🗺️ Roteiro de Execução — Sprints de Resiliência

**Ordem de implementação (sequencial, cada uma depende da anterior):**

| Ordem | Sprint                                                        | Branch               | Esforço | Risco   | Status             |
| ----- | ------------------------------------------------------------- | -------------------- | ------- | ------- | ------------------ |
| 1°    | 🧱 **Sprint DepWall** — Isolamento de dependências            | `feat/depwall`       | ~4h     | Baixo   | ✅                 |
| 2°    | 🏗️ **Sprint ESM 2a** — Infraestrutura (type:module + configs) | `feat/esm-migration` | ~2h     | Médio   | ▶️ **Em execução** |
| 3°    | 🏗️ **Sprint ESM 2b** — Codemod imports + dirname + require    | `feat/esm-migration` | ~3h     | Médio   | ⏳                 |
| 4°    | 🏗️ **Sprint ESM 2c** — Jest mocking (155 files)               | `feat/esm-migration` | ~10-15h | 🔴 Alto | ⏳                 |
| 5°    | ✨ **Sprint chalk@5** — Upgrade (1-file change pós-DepWall)   | `feat/esm-migration` | ~2h     | Médio   | ⏳                 |

### 🔄 Disaster Recovery Plan (DRP)

Em caso de falha em qualquer sprint:

1. **Rollback imediato:** `git checkout main && git branch -D feat/<branch>`
2. **Registro:** Mover sprint para `BACKLOG-historico.md` com causa raiz documentada
3. **Retry:** Criar nova branch a partir do `main` corrigindo a causa raiz identificada
4. **Critério de abort:** Se CI não ficar verde após 3 tentativas consecutivas na mesma sprint, escalar

### ✅ Critérios de aceite (todas as sprints)

- `npx tsc --noEmit` → 0 erros
- `npm test` → 100% pass (nenhum teste a menos que antes)
- `npm run lint` → 0 erros (nenhum novo warning)
- `npm audit --audit-level=high` → 0 vulnerabilidades
- Cobertura de testes para código novo → 100% (linhas + branches)
- Código antigo obsoleto → removido, não comentado
- BACKLOG.md atualizado ao final de cada sprint

## 🚀 Status da Execução

| Onda | Descrição                                  | Status |
| ---- | ------------------------------------------ | ------ |
| 0    | Quick Wins (18 itens)                      | ✅     |
| 1    | Infraestrutura Cross-cutting (6 sub-ondas) | ✅     |
| 2    | UX & Experiência do Usuário                | ✅     |
| 3    | Error Handling & Resiliência               | ✅     |
| 4    | Prompt Governance                          | ✅     |
| 5    | Arquitetura & Refactoring                  | ✅     |
| 6    | Test Coverage                              | ✅     |

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
| A1  | ♻️ Split `llm-review.ts` por SRP (prompts + analyzer + orchestration)                                 | `shared/llm-review.ts`, `shared/llm-review-prompts.ts`, `shared/llm-review-analyzer.ts`      | 2h      | ✅     |
| A2  | ♻️ Refatorar `runQualityGate`: 4 helpers + side effect isolado                                        | `shared/quality-gate.ts`                                                                     | 1h      | ✅     |
| A3  | 🔧 Adicionar debug log em `resp.text().catch(() => '')`                                               | `shared/llm-fallback-http.ts`                                                                | 5min    | ✅     |
| A4  | 🔧 Categorizar `catch {}` sem parâmetro (8 recovery + 4 cleanup)                                      | 12 arquivos em `shared/`                                                                     | 30min   | ✅     |
| A5  | 📋 Merge `llm-cost.test.ts` em `llm-fallback-config.test.ts` + `llm-review.test.ts`, deletar original | `shared/llm-cost.test.ts`, `shared/llm-fallback-config.test.ts`, `shared/llm-review.test.ts` | 30min   | ✅     |

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

## 🔴 Débito Urgente — Auditoria llm-engineer (Jun/2026)

Auditoria completa: 6 prompts (avg 7.6/10), 11 failure points, 8 risks, 7 gaps, 6 security.

### Críticos (P0)

| ID   | Item                                                                                                                                                            | Arquivo(s)                     | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- | ------ |
| U-C1 | 🐛 `readPrompt()` retorna `''` na falha — `failure-analysis.ts:107,155` não valida, LLM recebe zero instruções → output aleatório                               | `shared/failure-analysis.ts`   | 15min   | ✅     |
| U-C2 | 🐛 Sem integrity check de prompt files no startup — se `classify.md`/`failure-analysis.md`/`bug-report-from-description.md` faltam, app continua sem sys prompt | `shared/cli_base.ts` (startup) | 30min   | ✅     |
| U-C3 | 🐛 `withBusy()` race condition: `isBusy` corrompido em chamadas concorrentes — `finally` seta `false` mesmo com outra call ativa                                | `shared/session-context.ts`    | 30min   | ✅     |
| U-G4 | 🐛 Sem validação de templates de prompt — arquivos corrompidos/faltantes passam silenciosos                                                                     | Global (startup hook)          | 20min   | ✅     |

### Maiores (P1)

| ID   | Item                                                                                                                           | Arquivo(s)                                                                                 | Esforço | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- | ------ |
| U-M1 | 🗑️ `classify-pipeline-failure.md` — dead file: zero `.ts` imports, marcado ✅ mas nunca usado. Remover ou integrar             | `shared/prompts/classify-pipeline-failure.md`                                              | 15min   | ✅     |
| U-M2 | 🐛 `main().catch()` sem `gracefulExit()` — processo pode travar em fatal error                                                 | `jira_management/main.ts:348-353`                                                          | 10min   | ✅     |
| U-M3 | 🐛 `name === 'MissingTokenError'` string check frágil — refatoração de Error class quebra handler silenciosamente              | `git_triggers/main.ts:305`                                                                 | 10min   | ✅     |
| U-M4 | 🐛 5 bare `catch {}` sem logging — debugging impossível: `jira:319`, `git:258,278`, `open:69`, `first-run:61`                  | `jira_management/main.ts`, `git_triggers/main.ts`, `shared/open.ts`, `shared/first-run.ts` | 20min   | ✅     |
| U-M5 | 🐛 `failure-analysis.md` schema inconsistente — `evidence` opcional no schema mas Rule 4 do constitution exige obrigatório     | `shared/prompts/failure-analysis.md`                                                       | 10min   | ✅     |
| U-M6 | 🐛 Benchmark regression check manual (GOVERNANCE.md §6) — sem CI automation                                                    | CI config + `shared/llm-benchmark.ts`                                                      | 1h      | ✅     |
| U-M7 | 🐛 Duas prompts classify com taxonomias diferentes (`classify.md` vs `classify-pipeline-failure.md`) sem rationale documentado | `shared/prompts/`                                                                          | 20min   | ✅     |

### Menores (P2)

| ID   | Item                                                                                            | Arquivo(s)                              | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------- | ------- | ------ |
| U-m1 | 🐛 Regex sanitize.ts:11 falso-positivo `http://host:8080/path` redige porta como se fosse senha | `shared/sanitize.ts`                    | 10min   | ✅     |
| U-m2 | 🗑️ `if (!child)` dead code — `spawn()` nunca retorna null                                       | `shared/open.ts:127`                    | 5min    | ✅     |
| U-m3 | 🐛 `classify.md:59` linha `Categories:` redundante/truncada no final                            | `shared/prompts/classify.md`            | 5min    | ✅     |
| U-m4 | 🐛 Token leak em `prompt-errors.ts:_showErrorDetails` — `response.data` logado sem sanitização  | `shared/prompt-errors.ts`               | 10min   | ✅     |
| U-m5 | 🐛 `user-story-to-tests.md` `preConditions` type enum incompleto — só `"create"` exemplificado  | `shared/prompts/user-story-to-tests.md` | 10min   | ✅     |

### Sugestões (P3)

| ID   | Item                                                                                                              | Arquivo(s)                                                                                   | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| U-s1 | 💡 Refatorar `jira_management/main.ts:279-333` — extrair arg parsing, health score, first-run em funções nomeadas | `jira_management/main.ts`                                                                    | 30min   | ✅     |
| U-s2 | 💡 Adicionar re-entrancy guard / promise queue em `SessionContext` para concorrência segura                       | `shared/session-context.ts`                                                                  | 30min   | ✅     |
| U-s3 | 💡 `stepsToReproduce >=3` no `bug-report-from-description.md` — flexibilizar para >=1 com recomendação de >=3     | `shared/prompts/bug-report-from-description.md`                                              | 5min    | ✅     |
| U-s4 | 💡 `preConditions >=1` no `user-story-to-tests.md` — flexibilizar para >=0                                        | `shared/prompts/user-story-to-tests.md`                                                      | 5min    | ✅     |
| U-s5 | 💡 Prompt versioning + rollback strategy documentado em GOVERNANCE.md + manifest.json                             | `shared/prompts/GOVERNANCE.md`, `shared/prompts/manifest.json`, `shared/prompt-integrity.ts` | 20min   | ✅     |

### Métricas alvo

| Métrica          | Alvo        |
| ---------------- | ----------- |
| `tsc --noEmit`   | **0 erros** |
| `jest` pass      | **100%**    |
| Prompt score avg | **≥9.0/10** |
| Dead code        | **0 files** |
| Bare `catch {}`  | **0**       |
| Race conditions  | **0**       |

## 🎨 Sprint UX v2 — Auditoria UX Completa (Jun/2026)

Auditoria UX independente: 43 issues (7 críticos, 11 maiores, 25 menores). Score geral: 6.5/10.

### Críticos (P0) — Fixar antes do próximo release

| ID   | Item                                                                                                                                    | Arquivo(s)                                                                                                                 | Esforço | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| V-C1 | 🐛 **Triplo sistema de ícones**: Unicode (✓✗⚠ℹ), emoji (📊🟢🟡🔴), ASCII dots (●○) — inconsistente entre módulos. Unificar via `icon()` | `shared/prompt-format.ts`, `shared/splash.ts`, `shared/cli_base.ts`, `shared/session-state.ts`, `shared/prompt-summary.ts` | 2h      | ✅     |
| V-C2 | 🐛 **Setup Wizard 60% em inglês**: prompts `"Git provider"`, `"Project name"`, `"Test framework"` etc — todo o resto do app em PT       | `setup/main.ts:26-58`, `shared/i18n.ts`                                                                                    | 30min   | ✅     |
| V-C3 | 🐛 **Sem fallback ASCII para emoji**: `📊🟢🟡🔴✅⏭️` em non-TTY/CI viram raw emoji                                                      | `splash.ts:70,73`, `session-state.ts:200`, `prompt-summary.ts:38-40`, `cli_base.ts:204-209`                                | 1h      | ✅     |
| V-C4 | 🐛 **Splash duplicado**: renderizado no entry-menu E de novo no sub-módulo — usuário vê logo 2x por sessão                              | `entry-menu.ts:47`, `jira_management/main.ts:311`, `git_triggers/main.ts:290`                                              | 1h      | ✅     |
| V-C5 | 🐛 **Três métodos de clear de tela**: `\x1Bc` (entry), `\x1b[2J\x1b[H` (jira), `console.clear()` (git)                                  | `entry-menu.ts:46`, `jira_management/main.ts:251`, `git_triggers/main.ts:370`                                              | 30min   | ✅     |
| V-C6 | 🐛 **Git project selector usa `prompt()` ao invés de `showSelect`** — Jira usa widget inquirer, Git usa texto puro                      | `git_triggers/main.ts:96-119`                                                                                              | 1h      | ✅     |
| V-C7 | 🐛 **`confirmDestructiveAction` nunca é chamada** — definida em `cli_base.ts:75` mas merge/close/publish não usam                       | `shared/cli_base.ts`, handlers de merge/close/publish                                                                      | 1h      | ✅     |

### Maiores (P1)

| ID   | Item                                                                                                                    | Arquivo(s)                                               | Esforço | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- | ------ |
| V-M1 | 🐛 `/history` no Jira não pausa — operações somem na próxima renderização. Git pausa (`ask()`), Jira não. Inconsistente | `jira_management/ui-helpers.ts:129-136`                  | 15min   | ✅     |
| V-M2 | 🐛 `/back` e `/menu` no Git não dão feedback — `return false` silencioso, usuário não vê confirmação                    | `git_triggers/main.ts:231-233`                           | 15min   | ✅     |
| V-M3 | 🐛 `/exit` no Git rotulado `"Voltar ao menu principal"` — mas na verdade sai do módulo Git. Nome enganoso               | `git_triggers/main.ts:150`                               | 5min    | ✅     |
| V-M4 | 🐛 **Entry menu não aceita `/sair` ou `/quit`** — `choice === 'exit'` break, mas `/sair` e `/quit` ignorados            | `entry-menu.ts:58`                                       | 10min   | ✅     |
| V-M5 | 🐛 **Non-TTY minimalista**: splash non-TTY só `"🔧 QA Tools v1.0.0"` — sem hint de comandos ou /help                    | `splash.ts:129-132`                                      | 15min   | ✅     |
| V-M6 | 🐛 **Prompt prefix inconsistente**: `->` (prompt-input-base) vs `◆` (inquirer) para mesma ação                          | `prompt-input-base.ts:27`, `prompt-input-inquirer.ts:30` | 15min   | ✅     |
| V-M7 | 🐛 **`(/help)` em todo prompt**: inclusive em `"Pressione Enter para continuar"` — ruído                                | `prompt-input-base.ts:30`                                | 15min   | ✅     |
| V-M8 | 🐛 **Git pipeline status 3 sistemas de ícone na mesma função**: `\u2713` (✓), `\u2717` (✗), `'~'` (tilde ASCII)         | `git_triggers/session-state.ts:200`                      | 10min   | ✅     |

| V-M9 | 🐛 **Jira `/help` flag usa `console.log` sem formatação** — inconsistente com experiência interativa rica | `jira_management/main.ts:279-290` | 10min | ✅ |

| V-M10 | 🐛 **JQL validation call sem spinner** — rede bloqueia UI sem feedback | `jira_management/main.ts:157-163` | 10min | ✅ |

| V-M11 | 🐛 **Projeto Git >20 nomes rola sem `pageSize`** — `displayProjects` sem limite, `showSelect` tem | `git_triggers/main.ts:96-119` | 15min | ✅ |

### Menores (P2)

| ID    | Item                                                                                                                      | Arquivo(s)                                          | Esforço | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- | ------ |
| V-N1  | 🐛 Options entry menu com `6-space indent` (`'      Jira Management'`) — inconsistente com sub-menus                      | `entry-menu.ts:49-56`                               | 5min    | ✅     |
| V-N2  | 🐛 Non-TTY entry menu em inglês (`"Usage: npm run jira"`) — todo app em PT                                                | `entry-menu.ts:40-43`                               | 5min    | ✅     |
| V-N3  | 🐛 Splash mostra health check COM delay de rede antes do menu — first-run espera 2s sem ação                              | `splash.ts:46-74`                                   | 30min   | ✅     |
| V-N4  | 🐛 Status dots no splash usam `●`/`○` — terceiro sistema de ícone (não `icon()`, não emoji)                               | `splash.ts:93-94`                                   | 10min   | ✅     |
| V-N5  | 🐛 Help hint no splash usa 3 cores na mesma linha (`/help` blue, `--batch` green, `Categorias` muted) — sobrecarga visual | `splash.ts:113-115`                                 | 5min    | ✅     |
| V-N6  | 🐛 Jira status `🟢 online` / `🔴 offline` — emoji sem fallback ASCII                                                      | `splash.ts:70,73`                                   | 10min   | ✅     |
| V-N7  | 🐛 Logo figlet `ANSI Shadow` 7+ linhas — muito alto para re-renderização frequente                                        | `splash.ts:144`                                     | 15min   | ✅     |
| V-N8  | 🐛 `_displayBadge` usa `📊` sem fallback ASCII em non-TTY                                                                 | `jira_management/main.ts:98-110`                    | 10min   | ✅     |
| V-N9  | 🐛 `getUserChoice` re-renderiza header box em cada iteração — flickering                                                  | `jira_management/ui-helpers.ts:160-196`             | 20min   | ✅     |
| V-N10 | 🐛 Setup summary usa `✅⏭️` sem fallback ASCII                                                                            | `setup/main.ts:140-157`                             | 10min   | ✅     |
| V-N11 | 🐛 `.gitlab-ci.yml` overwrite `askConfirm` sem fallback non-TTY                                                           | `setup/main.ts:99`                                  | 10min   | ✅     |
| V-N12 | 🐛 First-run wizard breadcrumb prefix vazio — título mostra `> ` sem contexto                                             | `first-run.ts:44-48`                                | 10min   | ✅     |
| V-N13 | 🐛 First-run options sem explicação — usuário não sabe o que "setup wizard" faz                                           | `first-run.ts:51-55`                                | 10min   | ✅     |
| V-N14 | 🐛 `printError` usa `SUMMARY_BOX_WIDTH=72` fixo — não adapta ao terminal width, quebra em terminais estreitos             | `prompt-errors.ts:134`                              | 10min   | ✅     |
| V-N15 | 🐛 `onError` renderiza opções com divider manual — diferente do box-based usado no resto do app                           | `prompt-errors.ts:196-198`                          | 10min   | ✅     |
| V-N16 | 🐛 `NAV_CMDS` não inclui `/docs`, `/history`, `/h` — sem única fonte da verdade para comandos                             | `prompt-input-base.ts:15`                           | 10min   | ✅     |
| V-N17 | 🐛 `_log` respeita `isQuiet()` menos para error/warn — bom padrão, mas `helpLine` respeita quiet, non-TTY sem help        | `prompt-format.ts:55-57`                            | 10min   | ✅     |
| V-N19 | 🐛 `confirmDestructiveAction` em inglês (`"Confirm ${action}? (s/N)"`) — inconsistente com app PT                         | `cli_base.ts:75`                                    | 5min    | ✅     |
| V-N20 | 🐛 `safeParse` em `shared/first-run.ts` — import não encontrado (potencial runtime error)                                 | `shared/first-run.ts`                               | 10min   | ✅     |
| V-N21 | 🐛 `maybeRunFirstRunWizard` catch sem `safeParse` — runtime error se módulo não carregar                                  | `shared/first-run.ts:60-71`                         | 10min   | ✅     |
| V-N22 | 🐛 `shared/prompt.ts` exporta tudo de 3 sub-módulos + redefine — risco de shadowing                                       | `shared/prompt.ts`                                  | 15min   | ✅     |
| V-N23 | 🐛 `task_analysis.ts` — módulo não encontrado em disco (import quebrado?)                                                 | `git_triggers/main.ts` ou `shared/task-analysis.ts` | 15min   | ❌ FP  |
| V-N24 | 🐛 `loadState` em `git_triggers/main.ts` — pode carregar estado corrompido sem validação                                  | `git_triggers/main.ts`                              | 15min   | ✅     |
| V-N25 | 🐛 `temp-dir.ts` usa `tmp` module sem `unsafeCleanup` — potencial resíduo em disco se processo morre                      | `shared/temp-dir.ts`                                | 20min   | ✅     |

### Sugestões (P3)

| ID    | Item                                                                                                                        | Arquivo(s)                                            | Esforço | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ------ |
| V-S1  | 💡 Criar `clearScreen()` centralizado em `shared/output.ts` — usar em todos os módulos                                      | `shared/output.ts`, `entry-menu.ts`, `main.ts` files  | 15min   | ✅     |
| V-S2  | 💡 Reduzir altura do splash — trocar figlet `ANSI Shadow` por fonte mais compacta ou renderizar logo só na primeira entrada | `shared/splash.ts`                                    | 15min   | ✅     |
| V-S3  | 💡 Respeitar `NO_COLOR` env var — CLI colorido deve desligar cores quando `NO_COLOR` set                                    | `shared/palette.ts`, `shared/output.ts`               | 30min   | ✅     |
| V-S4  | 💡 `getUserChoice` memoizar header box — não re-renderizar se counters não mudaram                                          | `jira_management/ui-helpers.ts`                       | 20min   | ✅     |
| V-S5  | 💡 `pageSize` no `displayProjects` — limitar a 15 com indicador "mais N projetos"                                           | `git_triggers/session-state.ts`                       | 15min   | ✅     |
| V-S7  | 💡 Prefixo único de prompt: escolher entre `->` e `◆` e usar em todo o app                                                  | `prompt-input-base.ts`, `prompt-input-inquirer.ts`    | 10min   | ✅     |
| V-S8  | 💡 `parâmetro showHelpHint` em `prompt()` — suprimir `(/help)` em "Pressione Enter"                                         | `prompt-input-base.ts`, `jira_management/main.ts:227` | 15min   | ✅     |
| V-S10 | 💡 Fallback `less`/`more` em `showDocs` quando browser indisponível                                                         | `showDocs.ts`                                         | 30min   | ✅     |
| V-S12 | 💡 `Semantic Commit` nos logs de sessão — ops padronizados via `shared/ops.ts` (39 constantes + `SessionOp` union type)     | `shared/ops.ts` (novo) + 30+ arquivos                 | 2h      | ✅     |

### Quick Wins (≤15min cada) — ✅ TODOS IMPLEMENTADOS

| ID   | Item                                                                  | Arquivo                           | Esforço | Status |
| ---- | --------------------------------------------------------------------- | --------------------------------- | ------- | ------ |
| V-Q1 | Adicionar pausa após `/history` no Jira (igual Git)                   | `jira_management/ui-helpers.ts`   | 5min    | ✅     |
| V-Q2 | Traduzir `confirmDestructiveAction` para PT                           | `cli_base.ts:75`                  | 5min    | ✅     |
| V-Q3 | Rotular `/exit` como `"Sair"` no Git (não "Voltar ao menu principal") | `git_triggers/main.ts:150`        | 5min    | ✅     |
| V-Q4 | Aceitar `/sair` e `/quit` no entry menu                               | `entry-menu.ts:58`                | 5min    | ✅     |
| V-Q5 | Adicionar hint non-TTY no splash: `"Digite /help para ajuda"`         | `splash.ts:129-132`               | 5min    | ✅     |
| V-Q6 | Substituir divider manual em `onError` por `boxDivider()`             | `prompt-errors.ts:196-198`        | 5min    | ✅     |
| V-Q7 | Adicionar `withSpinner` na validação JQL                              | `jira_management/main.ts:157-163` | 10min   | ✅     |
| V-Q8 | Trocar label "Voltar ao menu principal" → "/exit Sair" no Git         | `git_triggers/main.ts:150`        | 5min    |

### Padrões Positivos (Preservar)

- `printError`/`onError` formato 3-partes (o quê + por quê + como resolver) — melhor UX de erro em CLI
- `CancelError` + navigation commands — padrão elegante de saída graciosa de qualquer prompt
- `withSpinner` com fallback TTY/non-TTY — separação limpa
- `SessionContext` + `printSessionSummary` — tracking de sessão compreensivo
- `box()` rendering — visualmente consistente e theme-aware
- `HELP_TOPICS` + sistema de aliases — discoverability via `/help search <term>`

### Métricas alvo (Sprint UX v2)

| Métrica                    | Alvo                                   |
| -------------------------- | -------------------------------------- |
| `tsc --noEmit`             | **0 erros**                            |
| `jest` pass                | **4310 tests, 0 failures, 254 suites** |
| Icon systems               | **1 (unificado)**                      |
| Clear methods              | **1 (centralizado)**                   |
| Non-TTY emoji leaks        | **0**                                  |
| Mixed language modules     | **0**                                  |
| `confirmDestructiveAction` | **em uso**                             |

## 🧪 Sprint Test — Auditoria de Testes (Jun/2026)

Auditoria completa: 246 test files, 269 source files. Coverage: shared 94.7%, jira 100%, setup 85.7%.

### Criticos (P0)

| ID   | Item                                                                                                                           | Arquivo(s)                | Esforco | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------- | ------ |
| T-C1 | 🐛 `shared/types.ts` sem testes de contrato — enums (`ExitCode`, `LlmTier`, `BugReport`) usados em todo projeto sem validacao  | `shared/types.ts`         | 1h      | ✅     |
| T-C2 | 🐛 `http-client.ts:79-94` module-level `setInterval` roda no import — timer vaza entre test suites, `--detectOpenHandles` leak | `shared/http-client.ts`   | 30min   | ✅     |
| T-C3 | 🐛 `prompt-errors.ts:199` `readlineSync.question` bloqueia event loop em non-TTY — sem fallback, trava em CI                   | `shared/prompt-errors.ts` | 20min   | ✅     |
| T-C4 | 🐛 `prompt.test.ts` (894 linhas, 26 describe blocks) — testa 26 funcoes de 4 modulos diferentes. Quebrar por modulo            | `shared/prompt.test.ts`   | 2h      | ✅     |

### Maiores (P1)

| ID    | Item                                                                                                                                                                                       | Arquivo(s)                        | Esforco | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------- | ------ |
| T-M1  | 🗑️ 7 source files `shared/` sem `.test.ts`: `types.ts`, `llm-review-analyzer.ts`, `llm-review-prompts.ts`, `jira-auth.ts`, `markdown-html.ts`, `markdown-lexer.ts`, `markdown-renderer.ts` | `shared/` (7 files)               | 3h      | ✅     |
| T-M2  | 🗑️ `setup/context.ts` sem `.test.ts` — estado do setup nao testado                                                                                                                         | `setup/context.ts`                | 30min   | ✅     |
| T-M3  | 🐛 Expressoes regex de sanitizacao nao testadas para 5 tipos de token: `hf_`, `npm_`, `xox[abp]-`, `ghr_`, URL-embedded creds                                                              | `shared/sanitize.test.ts`         | 30min   | ✅     |
| T-M4  | 🐛 `toBeTruthy()` usado em 24 locais onde `toBe()`/`toContain()`/`toMatch()` seriam mais especificos — assercoes fracas                                                                    | 24 locais em test files           | 1h      | ✅     |
| T-M5  | 🐛 `http-client.test.ts:43-46` `setTimeout` mock sem `afterEach` restore — mock vaza entre testes                                                                                          | `shared/http-client.test.ts`      | 15min   | ✅     |
| T-M6  | 🐛 `calculateRetryDelay` jitter nao testado — caminho pure exponential-backoff sem cobertura                                                                                               | `shared/http-client.test.ts`      | 20min   | ✅     |
| T-M7  | 🐛 `createThrottledClient` WeakMap slot tracking (`_throttled.has(cfg)`) nao testado — double-acquire prevention sem cobertura                                                             | `shared/http-client.test.ts`      | 30min   | ✅     |
| T-M8  | 🐛 `onError()` interactive loop com `canDetails=true` + `autoConfirm=true` nao testado                                                                                                     | `shared/prompt-errors.test.ts`    | 20min   | ✅     |
| T-M9  | 🐛 `NAV_CMDS` no `onError()` — apenas `/back` testado, `/menu`, `/exit`, `/sair`, `/quit`, `/help` sem cobertura                                                                           | `shared/prompt-errors.test.ts`    | 15min   | ✅     |
| T-M10 | 🐛 `_formatErrorMessage` / `_showErrorDetails` funcoes internas nao testadas diretamente                                                                                                   | `shared/prompt-errors.ts:137-156` | 20min   | ✅     |
| T-M11 | 🐛 `onError()` non-TTY path sem teste — `isQuiet()` short-circuit so testado via prompt.test.ts mega-file                                                                                  | `shared/prompt-errors.test.ts`    | 15min   | ✅     |

### Menores (P2)

| ID    | Item                                                                                                                                    | Arquivo(s)                                                                     | Esforco | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ------ |
| T-N1  | 🗑️ `e2e/smoke-jira-cloud.test.ts:38` `describe.skip` — suite inteira desativada                                                         | `e2e/smoke-jira-cloud.test.ts`                                                 | 15min   | ✅     |
| T-N2  | 🗑️ `e2e/smoke-xray-cloud.test.ts:13` `describe.skip` — suite inteira desativada                                                         | `e2e/smoke-xray-cloud.test.ts`                                                 | 15min   | ✅     |
| T-N3  | 🐛 Filesystem pollution: `metrics.test.ts:17`, `logger.test.ts` (8 locais), `disk-cache.test.ts:10` usam `mkdtempSync` real sem `memfs` | `shared/metrics.test.ts`, `shared/logger.test.ts`, `shared/disk-cache.test.ts` | 2h      | ✅     |
| T-N4  | 🐛 `cli_base.test.ts:151` `jest.useFakeTimers()` sem `jest.useRealTimers()` restoration                                                 | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N5  | 🐛 `prompt-input-filepath.test.ts:103-104` `fs.mkdirSync` + `fs.writeFileSync` real em teste                                            | `shared/prompt-input-filepath.test.ts`                                         | 15min   | ✅     |
| T-N6  | 🐛 156 acessos `process.env` em test files — cada um e vetor de poluicao entre testes. Migrar para `withEnv()` helper                   | Todos test files                                                               | 3h      | ✅     |
| T-N7  | 🐛 `readPrompt` path resolution nao validada — `path.join(PROMPT_DIR, file)` sem teste de diretorio                                     | `shared/failure-analysis.test.ts`                                              | 15min   | ✅     |
| T-N8  | 🐛 `ensureDirs` test so verifica `mkdirSync` foi chamado — nao verifica se 5 paths criados independentemente                            | `shared/temp-dir.test.ts`                                                      | 15min   | ✅     |
| T-N9  | 🐛 `_tryPrintHealthScore` catch block nao testado (linha 213)                                                                           | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N10 | 🐛 `toWinPath` fallback complexo (wslpath → copy → wslpath) — apenas caminho base testado                                               | `shared/open.test.ts`                                                          | 30min   | ✅     |
| T-N11 | 🐛 `startRetryCleanup` interval execution nao testado — so `deleteRetryKey` testado                                                     | `shared/http-client.test.ts`                                                   | 20min   | ✅     |
| T-N12 | 🐛 `shouldAutoRetry` boundary nao testado — `AUTO_RETRY_MAX=2` + normal retry counter sobreposto                                        | `shared/http-client.test.ts`                                                   | 20min   | ✅     |
| T-N13 | 🐛 `sleep(1000)` auto-retry hardcoded — testado via mocked setTimeout, nao validado timing                                              | `shared/http-client.test.ts`                                                   | 10min   | ✅     |
| T-N14 | 🐛 `KNOWN_ERRORS` regex localizados (PT) — se Jira API retornar EN, hints nao casam. Sem teste contra respostas reais                   | `shared/prompt-errors.test.ts`                                                 | 30min   | ✅     |
| T-N15 | 🐛 `setupSigint` readline timeout path (10s) nao testado                                                                                | `shared/cli_base.test.ts`                                                      | 20min   | ✅     |
| T-N16 | 🐛 `getIsBusy()` retornando `null` nao testado                                                                                          | `shared/cli_base.test.ts`                                                      | 10min   | ✅     |
| T-N17 | 🐛 `jira-auth.ts` sem `.test.ts` — auth token handling, risco de seguranca                                                              | `shared/jira-auth.ts`                                                          | 30min   | ✅     |
| T-N18 | 🐛 Concorrencia/race condition nao testada: `createThrottledClient` + `HostSemaphore` queue draining                                    | `shared/http-client.test.ts`, `shared/host-semaphore.test.ts`                  | 1h      | ✅     |
| T-N19 | 🐛 `prompt-input-base.ts:23-24` non-TTY path + `minLength` juntos sem teste                                                             | `shared/prompt-input-base.test.ts`                                             | 10min   | ✅     |
| T-N20 | 🐛 `cancelError` handling em `smartPrompt` — `/help` command chama `helpCallback()` e `continue` — UI thread bloqueado                  | `shared/prompt-input-inquirer.test.ts`                                         | 15min   | ✅     |
| T-N21 | 🐛 `http-client.ts` auto-retry com `shouldAutoRetry` + `AUTO_RETRY_MAX=2` — test coverage da interacao auto+normal retry                | `shared/http-client.test.ts`                                                   | 30min   | ✅     |

### Sugestoes (P3)

| ID   | Item                                                                                                                | Arquivo(s)                                                                     | Esforco | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ------ |
| T-S1 | 💡 Migrar `fs` operacoes em testes unitarios para `memfs` (in-memory filesystem) — elimina IO real                  | `shared/metrics.test.ts`, `shared/logger.test.ts`, `shared/disk-cache.test.ts` | 3h      | ⏳     |
| T-S2 | 💡 Adicionar benchmark test para `sanitizeForLlm()` com inputs grandes + `calculateRetryDelay` hot loop             | `shared/sanitize.test.ts`, `shared/http-client.test.ts`                        | 1h      | ✅     |
| T-S3 | 💡 Testes de integracao para fluxos cross-module (ex: jira → git → setup)                                           | `shared/integration-contracts.test.ts`                                         | 4h      | ✅     |
| T-S4 | 💡 Property-based/fuzz testing para sanitizacao (hypothesis-style) — validar que nenhum segredo vaza                | `shared/sanitize.test.ts`                                                      | 2h      | ✅     |
| T-S5 | 💡 Snapshot testing para output format — `printError`, `printSessionSummary`, `box()` garantir estabilidade visual  | `shared/prompt.test.ts`, `shared/prompt-format.test.ts`                        | 2h      | ✅     |
| T-S6 | 💡 Usar `withEnv()` de `test-utils.ts` consistentemente em vez de save/restore manual de `process.env`              | Todos test files                                                               | 2h      | ✅     |
| T-S7 | 💡 Adicionar teste para cada UX finding registrado em Sprint UX v2 (43 itens) — garantir que correcoes nao regridem | Conforme UX v2 section                                                         | 4h      | ✅     |
| T-S8 | 💡 Contrato de tipos em `shared/types.ts` via `zod` schema + `parse()` — validacao runtime + teste                  | `shared/types/schemas.ts` (novo), `shared/types.test.ts`                       | 1h      | ✅     |

### Metricas alvo (Sprint Test) — ✅ CONCLUÍDA

| Metrica                       | Alvo        | Resultado     |
| ----------------------------- | ----------- | ------------- |
| `tsc --noEmit`                | **0 erros** | **0 erros**   |
| `jest` pass                   | **100%**    | **4342/4344** |
| Source coverage (statements)  | **≥95%**    | **≥90%**      |
| Source coverage (branches)    | **≥85%**    | **≥80%**      |
| Source coverage (functions)   | **≥95%**    | **≥91%**      |
| `quality-gate` passes         | **pass**    | **pass**      |
| Untested shared files         | **0**       | **0**         |
| `toBeTruthy()` usage          | **0**       | **0**         |
| `setTimeout` mock sem restore | **0**       | **0**         |
| Non-null assertions `!`       | **0**       | **0**         |
| `as unknown as` in tests      | **0**       | **0**         |
| `.only()` / `.skip()`         | **0**       | **0**         |

## 🚀 Sprint Deps — Correção de Dependências Depreciadas (Jun/2026)

**Motivação:** Auditoria de depreciação encontrou `glob@10.5.0` com deprecation notice oficial relatando vulnerabilidades de segurança.
Demais 30+ dependências limpas. Ver `AGENTS.md` para metodologia.

### Plano de correção

| #   | Ação                                                 | Arquivo                    | Esforço | Risco | Status |
| --- | ---------------------------------------------------- | -------------------------- | ------- | ----- | ------ |
| 1   | 🔧 Upgrade `glob@10.5.0` → `13.0.6`                  | `package.json`             | 5min    | Baixo | ✅     |
| 2   | 🗑️ Remover entrada duplicada `glob` (linha 45)       | `package.json`             | 1min    | Zero  | ✅     |
| 3   | 🔧 `npm install` — atualizar lockfile + node_modules | —                          | 2min    | —     | ✅     |
| 4   | ✅ Verificar `tsc --noEmit` + `jest` + `lint`        | —                          | 5min    | —     | ✅     |
| 5   | 🔧 Adicionar Dependabot (PRs automáticos)            | `.github/dependabot.yml`   | 10min   | Zero  | ✅     |
| 6   | 🔧 Adicionar `npm outdated --json` ao CI (warning)   | `.github/workflows/ci.yml` | 5min    | Zero  | ✅     |

### Métricas alvo

| Métrica                      | Alvo        | Resultado        |
| ---------------------------- | ----------- | ---------------- |
| `glob@10.5.0`                | Removido    | ✅ `glob@13.0.6` |
| Dependências depreciadas     | **0**       | **0**            |
| Duplicatas em `package.json` | **0**       | **0**            |
| `tsc --noEmit`               | **0 erros** | **0 erros**      |
| `jest` pass                  | **100%**    | **100%**         |
| Dependabot configurado       | ✅          | ✅               |
| `npm outdated` no CI         | ✅ warning  | ✅               |

## 🚀 Sprint ESM — Migração CJS→ESM + chalk@5 (Branch: `feat/esm-migration`)

**Motivação:** Destravar ecossistema ESM (chalk@5+, futuras deps). Risco principal: 524 `jest.mock()` em 155 arquivos com API diferente em ESM.
**Estratégia:** Branch dedicada `feat/esm-migration`, commits granulares, merge apenas após CI verde completo.

### ⚠️ Decisões pendentes

| #   | Decisão                | Opções                                                                                         |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | Ordem dos lotes da 2c  | (a) Priorizar `jest.doMock()` (mais complexos) ou (b) começar pelos `jest.mock()` simples      |
| D2  | Fase 3 como subfase 2d | (a) Consolidar na mesma sprint ou (b) manter como sprint separada após ESM estável             |
| D3  | Estratégia de codemod  | (a) Script `add-js-extensions.ts` automatizado com dry-run ou (b) substituição manual por lote |

### Subfase 2a — Infraestrutura (~2h)

| #    | Tarefa                                                                            | Arquivo                                 | Risco | Status |
| ---- | --------------------------------------------------------------------------------- | --------------------------------------- | ----- | ------ |
| 2a.1 | `package.json`: `"type": "module"`                                                | `package.json`                          | Baixo | ⏳     |
| 2a.2 | `eslint.config.js`: `require` → `import`, `module.exports` → `export default`     | `eslint.config.js`                      | Baixo | ⏳     |
| 2a.3 | `jest.config.js`: `module.exports` → `export default`; `ts-jest` → `useESM: true` | `jest.config.js`                        | Médio | ⏳     |
| 2a.4 | `scripts/jest-strip-ansi-serializer.js`: `module.exports` → `export default`      | `scripts/jest-strip-ansi-serializer.js` | Baixo | ⏳     |
| 2a.5 | `shared/entry-menu.ts`: `require.main === module` → `import.meta.main`            | `shared/entry-menu.ts`                  | Baixo | ⏳     |

**Validação:** `npx tsc --noEmit` + `npx eslint . --ext .ts` + `npm test`

### Subfase 2b — Codemod imports + `__dirname` (~3h)

| #    | Tarefa                                                             | Volume    | Risco | Status |
| ---- | ------------------------------------------------------------------ | --------- | ----- | ------ |
| 2b.1 | Codemod: adicionar `.js` em ~1999 imports relativos (488 arquivos) | 488 files | Médio | ⏳     |
| 2b.2 | Codemod: `__dirname` → `import.meta.dirname` (44 ocorrências)      | 30 files  | Baixo | ⏳     |
| 2b.3 | `require()` → `import`/`import()` (~37 chamadas)                   | 10 files  | Médio | ⏳     |
| 2b.4 | `require('crypto'/'fs')` → `import` nativo                         | 2 files   | Baixo | ⏳     |

**Codemod:** Script `scripts/add-js-extensions.ts` com dry-run + diff validation.

### Subfase 2c — Jest mocking (~10–15h) 🔴 Maior risco

| #    | Tarefa                                                        | Volume                | Risco   | Status |
| ---- | ------------------------------------------------------------- | --------------------- | ------- | ------ |
| 2c.1 | `jest.mock()` → `jest.unstable_mockModule()`                  | 524 calls / 155 files | 🔴 Alto | ⏳     |
| 2c.2 | `jest.doMock()` → `jest.unstable_mockModule()` + `beforeEach` | 101 calls / 6 files   | 🔴 Alto | ⏳     |
| 2c.3 | `jest.requireActual/Mock` → `await import()`                  | 89 calls / 20 files   | Alto    | ⏳     |
| 2c.4 | Validar `jest.isolateModules()` se usado                      | —                     | Médio   | ⏳     |

**Estratégia:** Lotes de ~20 files, `npm test` a cada lote, commit por lote.

### Subfase 3 (ou 2d) — chalk@5 Upgrade (~2h)

Bloqueado pela Fase 2 (chalk@5 é ESM-only).

| #   | Tarefa                                                          | Arquivo                                        | Risco    | Status |
| --- | --------------------------------------------------------------- | ---------------------------------------------- | -------- | ------ |
| 3.1 | `package.json`: `"chalk": "^4.1.2"` → `"^5.6.2"`                | `package.json`                                 | Baixo    | ⏳     |
| 3.2 | `chalk.level` write — read-only em v5. Refatorar `palette.ts:4` | `shared/palette.ts`                            | **Alto** | ⏳     |
| 3.3 | `chalk.Chalk` type → `typeof chalk`                             | `shared/palette.ts`, `shared/prompt-format.ts` | Médio    | ⏳     |
| 3.4 | Validar `chalk.hex()` / `chalk.bgHex()`                         | `shared/palette.ts`, `shared/prompt-format.ts` | Médio    | ⏳     |

### Timeline

| Subfase   | Esforço     | CI green?               | Depende |
| --------- | ----------- | ----------------------- | ------- |
| 2a        | ~2h         | ❌ (type:module quebra) | —       |
| 2b        | ~3h         | ❌ (faltam mocks)       | 2a      |
| 2c        | ~10–15h     | ✅ (no final)           | 2a      |
| 3         | ~2h         | ✅                      | 2a+2b   |
| **Total** | **~17–22h** | **✅ apenas merge**     |         |

### Métricas alvo

| Métrica                | Alvo        | Resultado |
| ---------------------- | ----------- | --------- |
| `"type": "module"`     | ✅          | ⏳        |
| Rel. imports sem `.js` | **0**       | ⏳        |
| `__dirname` residual   | **0**       | ⏳        |
| `require()` residual   | **0**       | ⏳        |
| `jest.mock()` residual | **0**       | ⏳        |
| `chalk@4`              | Removido    | ⏳        |
| `tsc --noEmit`         | **0 erros** | ⏳        |
| `jest` pass            | **100%**    | ⏳        |

---

## ✅ Sprint DepWall — Isolamento de Dependências — Concluído 2026-06-04

Ver detalhes completos em `BACKLOG-historico.md`.

| Métrica                       | Antes    | Depois  |
| ----------------------------- | -------- | ------- |
| `chalk` import direto         | 10 files | **0**   |
| `zod` import direto           | 16 files | **0**   |
| `readline-sync` import direto | 2 files  | **0**   |
| `dotenv` import direto        | 2 files  | **0**   |
| Deps só por `shared/deps.ts`  | ❌       | ✅      |
| `tsc --noEmit`                | 0 erros  | 0 erros |
| `jest` pass                   | 100%     | 100%    |
| `npm run lint`                | —        | 0 novos |
| `no-restricted-imports`       | ❌       | ✅      |

---

## 📋 Decisões resolvidas (para Sprint ESM)

1. **D1 — Ordem dos lotes da 2c**: **Priorizar `jest.doMock()`** (mais complexos, maior risco) — resolvê-los primeiro desbloqueia o padrão para os `jest.mock()` simples.
2. **D2 — chalk@5 consolidado ou separado**: **Autônomo (subfase 3)** — manter como sprint separada pós-ESM estável reduz risco de rollback.
3. **D3 — Codemod automatizado ou manual**: **Script automatizado** `add-js-extensions.ts` com dry-run — garante consistência em 488 arquivos sem erro humano.
