# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## ✅ Fase 6 — LLM + Reports A2 (CONCLUÍDO)

**Data:** 2026-05-26

**Status:** report-generator.ts, metrics.ts, prompts, case17/18/19 já implementados. BACKLOG desatualizado — agora reflete a realidade.

---

## 🔷 Comprehensive Cleanup — Fase 5: Débitos P3

**Prioridade:** P1

| Item     | Status | O que                                                                                                          | Esforço |
| -------- | ------ | -------------------------------------------------------------------------------------------------------------- | ------- |
| AUDIT-15 | ✅     | TTL cache em `llm-client.ts` com `setInterval` cleanup + `unref()`                                             | 1h      |
| AUDIT-16 | ✅     | `retryCounts` em `http-client.ts` com `RetryEntry{count,lastUsed}` + cleanup periódico                         | 0.5h    |
| AUDIT-14 | ✅     | `Record<string, unknown>` → `JsonObject`/`LogContext`/`StateContainer`/interfaces (84 ocorrências em produção) | 4h      |

### AUDIT-14 — `Record<string, unknown>` → interfaces

**Objetivo:** Substituir `Record<string, unknown>` por interfaces nomeadas nos 84 locais em produção, priorizando:

1. Interfaces de retorno de API (`GitProvider`, `JiraResource`)
2. Parâmetros de funções com shape conhecido
3. Objetos de configuração/payload

---

## 🔷 Comprehensive Cleanup — Fase 6: LLM + Reports A2

**Status:** ✅ CONCLUÍDO (implementado em sprints anteriores, BACKLOG atualizado)

| Artefato                             | Status |
| ------------------------------------ | ------ |
| `shared/report-generator.ts`         | ✅     |
| `shared/report-generator.test.ts`    | ✅     |
| `shared/metrics.ts`                  | ✅     |
| `shared/metrics.test.ts`             | ✅     |
| `shared/prompts/*.md` (3)            | ✅     |
| `jira_management/coverage.ts`        | ✅     |
| `jira_management/commands/case17.ts` | ✅     |
| `jira_management/commands/case18.ts` | ✅     |
| `jira_management/commands/case19.ts` | ✅     |

---

## 🔷 AUDIT-20 — Technical Debt Cleanup (7 Fases)

**Data:** 2026-05-26
**Prioridade:** P1
**Esforço total estimado:** ~15h

| Fase | Descrição                                                        | Status | Esforço |
| ---- | ---------------------------------------------------------------- | ------ | ------- |
| 0    | ESLint prevention rules (no-empty, no-floating-promises)         | ✅     | 15 min  |
| 1    | Safety fixes — `.catch()` chains, empty catch, `as any` comments | ✅     | 30 min  |
| 2    | Remove 19 dead exports                                           | 🟡     | 30 min  |
| 3    | Break 16 oversized functions (R4)                                | ✅     | 3h      |
| 4    | Add 30+ missing return types                                     | ✅     | 1.5h    |
| 5    | Extract 25+ magic numbers to named constants                     | ✅     | 1h      |
| 6    | Command handler tests (19 files)                                 | ⏳     | 8h      |
| 7    | Full verification                                                | ✅     | 10 min  |

### Fase 0 — Prevenção (ESLint)

| Regra                                              | Atual                   | Novo                     | Efeito                             |
| -------------------------------------------------- | ----------------------- | ------------------------ | ---------------------------------- |
| `no-empty`                                         | `allowEmptyCatch: true` | `allowEmptyCatch: false` | Catch vazio vira erro              |
| `@typescript-eslint/no-floating-promises`          | ausente                 | `"error"`                | `.then()` sem `.catch()` vira erro |
| `@typescript-eslint/no-unnecessary-type-assertion` | ausente                 | `"error"`                | `as any` desnecessário vira erro   |

### Fase 1 — Segurança (3 arquivos)

- `git_triggers/main.ts:149-157` — 9 handlers sem `.catch()` → wrapper `withErrorHandling`
- `git_triggers/session-state.ts:173` — catch vazio → log warn
- `shared/markdown.ts:338,390` — 2 eslint-disable sem justificativa → add comment

### Fase 2 — Dead Exports (19 símbolos) 🟡

**17 removidos, 2 restaurados** (`getLlmMetricsHistory`, `clearLlmMetrics` — usados por testes via `require()` dinâmico).

Removidos: `stopCacheCleanup`, `reportsDirPath`, `logsDirPath`, `cleanEphemeralPublic`, `ApiConfig`, `JiraIssueLinkType`, `ProjectVersion`, `SearchResult`, `JiraResourceError`, `LoggerLike`, `JiraIssue`, `ValidationResult`, `ReportOptions`, `ParseResultWithError`, `TestResultSummary`, `HandleErrorOptions`, `CoverageResult`.

### Fase 3 — R4: 16 funções >50 linhas ✅

Extraídas 14+ funções auxiliares, todas as 16 agora ≤50 linhas. Detalhes:

- `lexMarkdown` 119→17, `lexInline` 82→34 (markdown.ts)
- `generateReportWithFallback` 87→23 (report-generator.ts)
- `reviewWithLlm` 81→27 (llm-review.ts)
- `generateFlakinessHtml` 80→18 (flakiness-dashboard.ts)
- `nivelarBranches` 70→30 (nivelar.ts) + `createNivelamentoMr` helper
- `box` 65→23 (box.ts) + `buildTopBorder`, `buildContentRows`, `boxContentWidth`
- `_postPipeline` 67→18 (pipeline-handler.ts) + `handleBugCreation`, `handleQuickMerge`, `tryAcceptMerge`
- `createTestsFromTestCases` 61→34 (import-orchestrator.ts) + `runCreationLoop`
- `showDocs` 57→38, `createTestExecutionFromResults` 57→40, `showSelect` 58→45
- `createHttpClient` 54→15, `tierToConfig` 54→17, `downloadTestArtifacts` 54→31, `onError` 52→40

### Fase 4 — Missing Return Types (30+ funções) ✅

17 return types adicionados em 5 arquivos: `schedule-handler.ts` (4), `mr-handler.ts` (4), `pipeline-handler.ts` (7), `prompt-ui.ts` (1), `http-client.ts` (1).
Os demais arquivos da lista original (`jira-resource-version.ts`, `bug-report.ts`, `cli_base.ts`, `state.ts`, `prompt-input.ts`, `llm-client.ts`) já tinham tipos explícitos.

### Fase 5 — Magic Numbers (25+ valores) ✅

51 constantes extraídas em 12 arquivos (máx: `llm-client.ts` com 11, `github_manager.ts` com 7). `jira_link_manager.ts` não tinha números mágicos.

### Fase 6 — Command Handler Tests (19 arquivos) ⏳ (adiado)

8h estimados. Prioridade baixa pois 14 handlers são thin delegates. Focar em: `case04`, `case12`, `case15`, `import-orchestrator`, `create_tests`.

---

## 🔷 FEAT-21 — File path tab-completion nos prompts CSV/JSON

**Data:** 2026-05-26
**Prioridade:** P2
**Esforço:** ~1h

| Etapa                                                            | Status |
| ---------------------------------------------------------------- | ------ |
| `filePathCompleter` + `askFilePath` em `prompt-input.ts`         | ⬜     |
| Re-export em `prompt.ts`                                         | ⬜     |
| Substituir `ask`→`askFilePath` em `import-prep.ts` (2 callsites) | ⬜     |
| Substituir `ask`→`askFilePath` em `case01.ts` (1 callsite)       | ⬜     |
| Testes para `filePathCompleter`                                  | ⬜     |
| Verificação (tsc + eslint + jest)                                | ⬜     |

---

## WEB_STYLE.md (ADIADA)

**Prioridade:** P3

**Problema:** `WEB_STYLE.md` descreve uma interface web, nunca implementada.

**Solução proposta:** Se houver demanda, implementar como SPA standalone.
