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

## WEB_STYLE.md (ADIADA)

**Prioridade:** P3

**Problema:** `WEB_STYLE.md` descreve uma interface web, nunca implementada.

**Solução proposta:** Se houver demanda, implementar como SPA standalone.
