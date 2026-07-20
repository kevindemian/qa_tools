# Verificação de Artefatos Client-Facing (git/jira)

**Data:** 2026-07-20
**Escopo:** Artefatos entregáveis ao cliente que derivam de dados de teste de git/jira — PR report, coverage gap report, health score, backlog health, traceability matrix, mapping files, weekly quality report, flakiness, pipeline health, dashboards (release score, defect trends).
**Lentes:** Correção (número bate com ground truth), Qualidade (guardas, sem missing-as-zero, idempotência), Utilidade/Sinal-ruído (info útil vs ruído), Adequação de contexto (rótulos honestos, serve ao cliente).
**Método:** Verificação hermética — leitura do código de produção + testes de caracterização com fixtures realistas que REPRODUZEM cada defeito como teste falhante (AGENTS.md §19.11). Nenhuma alteração de código de produção (correção é tarefa separada, exige autorização de contrato).

---

## 0. Executivo

O projeto produz artefatos ricos e, em grande parte, bem estruturados (guards NaN/Infinity em `run-pass-rate`, `pass-rate`, `coverage-files-extractor`; falha ruidosa em `acquireReportDataHub`). **Porém**, identificaram-se defeitos de correção de médio/alta gravidade onde **dado ausente ou parcial é convertido em número concreto enganoso** (0%, 100%, contagens infladas), além de **poluição e omissão de informação útil no PR report** (preocupação explícita do solicitante).

Achado transversal crítico: **a suíte de testes existente codificou os defeitos como comportamento esperado** (`backlog-health.test.ts:174,267,290` afirmam vazio→100%; `result_parser.test.ts:81-88,113-119` afirmam `pending`/`error`→`skipped`). Isso viola AGENTS.md §19.5/§20 (teste com expectativa errada) e §25 (dado ausente apresentado como valor). Os testes de caracterização desta verificação NÃO alteram esses testes — adicionam novos que afirmam o comportamento correto e FALHAM, provando a causa raiz.

---

## 1. Correção — achados por arquivo

| #   | Arquivo:linha                                                               | Defeito                                                                                                                                    | Efeito no cliente                                                                                                                                                                                        | Gravidade  |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| C1  | `shared/report/coverage-gap.ts:34-59`                                       | `collectAllPages` calcula `startAt` (linha 49) mas **nunca o repassa** a `searchJiraIssues`; re-chama a API sem offset.                    | Para N>200 issues, issues coletadas em `ceil(N/200)×`; contagens absolutas (`totalIssues`, `covered`, `gap`, `byEpic`, hierarquia) infladas. Razões preservadas, mas **contagens erradas** + over-fetch. | Alta       |
| C2  | `shared/report/coverage-gap.ts:199-200`                                     | Para `totalCount>5000`, troca denominador para `recentJql` (não-Done OU atualizado ≥-30d). Contagem usa `baseJql`, coleta usa `recentJql`. | Cobertura %, gate e rollups sobre subconjunto **não representativo**, sem sinalizar a troca.                                                                                                             | Alta       |
| C3  | `shared/report/coverage-gap.ts:23-32` + `jira_management/coverage.ts:62-69` | Erro de busca Jira → `return 0`.                                                                                                           | Outage de API indistinguível de "0% cobertura / projeto sem testes". Alimenta health score.                                                                                                              | Alta       |
| C4  | `shared/report/coverage-gap.ts:89`                                          | `fetchLinkedTestsBatch` usa só `issueKeys.slice(0,50)`.                                                                                    | Se `issuelinks` ausente na busca, cobertura de issues 51+ colapsa para falso.                                                                                                                            | Média-Alta |
| C5  | `shared/quality/health-score.ts:139,143-145` + gate `:121`                  | Métrica não-finita → `0`; `coverage=0` → gate `fail`. E "coverage" = % de testes Jira com steps, **não** cobertura de código.              | Outage de dados lido como falha de qualidade; semântica de métrica confusa para o cliente.                                                                                                               | Alta       |
| C6  | `shared/report/backlog-health.ts:96`                                        | `effective = Math.max(totalIssues, totalFlagged, 1)` → entrada vazia → score 100%.                                                         | Backlog inexistente/não analisado = "saúde perfeita".                                                                                                                                                    | Alta       |
| C7  | `shared/report/backlog-health.ts:114,137`                                   | `issues.slice(0,100)` trunca silenciosamente; `totalIssues` = contagem truncada.                                                           | Backlog grande pontuado sobre primeiros 100 em ordem arbitrária.                                                                                                                                         | Média      |
| C8  | `shared/report/backlog-health.ts:122`                                       | `epic = issue.key.split('-')[0]`. Para `PROJ-123` → `PROJ` (prefixo do projeto).                                                           | "Density by Epic" agrupa por prefixo do projeto, não por epic. Semanticamente errado.                                                                                                                    | Média      |
| C9  | `shared/result_parser.ts:183-187,271-279`                                   | Qualquer estado ≠ `passed`/`failed` (incl. `error`, `pending`, `other`) → `skipped`.                                                       | Falhas duras (`error`) contadas como puladas → **undercount de falhas** no relatório entregue ao cliente.                                                                                                | Alta       |
| C10 | `jira_management/mapping-file-generator.ts:43,55-72,124`                    | Pareamento `tasksId[i]↔tests[i]` por índice; surplus de tests dropado; título ausente vira `(untitled)`.                                   | Entradas de mapeamento vazias/erradas se ordem/length divergir; ausência de validação de alinhamento.                                                                                                    | Média      |
| C11 | `git_triggers/schedule-handler.ts:184-197`                                  | Weekly report semeia sub-geradores com arrays vazios (`computeAiEffectiveness({records:[]})`, etc.).                                       | Seções do relatório semanal renderizam vazias em vez de dados reais do projeto.                                                                                                                          | Média      |

### Detalhe de causa raiz (amostra)

**C1 — `collectAllPages` (`coverage-gap.ts:34-59`):**

```ts
let startAt = 0;
for (;;) {
    const response = await jiraResource.searchJiraIssues(jql, pageSize); // startAt NUNCA passado
    if (response.issues.length === 0) break;
    for (const issue of response.issues) allIssues.push({ key: issue.key, fields: issue.fields });
    startAt += pageSize; // calculado mas ignorado
    if (startAt >= response.total) break;
}
```

`searchJiraIssues` (auto-pagina internamente e devolve o conjunto completo) é re-chamado sem offset → duplica o conjunto `ceil(N/200)` vezes. **Correção na origem:** passar `startAt` ou chamar `searchJiraIssues` uma vez e confiar na auto-paginação.

**C6 — `calculateBacklogScore` (`backlog-health.ts:96`):**
`Math.max(totalIssues, totalFlagged, 1)` força `effective≥1`; com `totalIssues=0`, `unassignScore=staleScore=bugNoTestScore=100` → score 100. **Correção na origem:** entrada vazia deve produzir valor sentinela explícito ("sem dados") ou erro, nunca 100%.

**C9 — `mapTestState` (`result_parser.ts:183-187`):**

```ts
function mapTestState(state) {
    if (state === 'passed') return 'passed';
    if (state === 'failed') return 'failed';
    return 'skipped'; // engole 'error' e outros
}
```

**Correção na origem:** estados de erro de execução devem ir para `failed` (ou categoria distinta não-skip) para não mascarar falhas (§25).

---

## 2. Qualidade — guardas e silenciamento

**Bem feito (não alterar):**

- `run-pass-rate.ts`, `pass-rate.ts`, `execution-rate.ts`, `flaky-percentage.ts`, `coverage-files-extractor.ts` — guardam `NaN`/`Infinity`/vazio e evitam fallback silencioso.
- `pr-report-core.ts:405,884` — `resolveCoverageForReport` retorna `undefined` (não 0) quando não há dado; `acquireReportDataHub` falha ruidosamente em modo não-interativo em vez de fabricar números.
- `validatePrReportStats` (`pr-report-core.ts:471-494`) cruza stats×tests (embora só alerte, não corrija — ver C12 abaixo).

**Defeitos de qualidade (silencing — §25):**

- C3, C6, C9 acima: dado ausente/erro vira valor concreto enganoso (0%, 100%, skipped).
- `validatePrReportStats` (`pr-report-core.ts:471-494`) detecta inconsistência mas **apenas loga warning**; os números potencialmente inconsistentes são os que vão para a tabela/resumo. Deveria, no mínimo, sinalizar no artefato.
- `collectAllPages`/`fetchTotalCount` capturam erro e retornam `[]`/`0` silenciosamente (C1, C3) — o chamador não distingue "vazio" de "falhou".

---

## 3. Utilidade / Sinal-Ruído — PR report (preocupação do solicitante)

O PR report renderiza via `report-html.ts:100-119` (HTML) e `pr-report-core.ts:522-548` (comentário do PR). Matriz seção × utilidade para o **cliente**:

| Seção                                                                  | Onde                                              | Utilidade           | Veredito                 | Recomendação                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------- | ------------------- | ------------------------ | ---------------------------------------------------------- |
| Título + Summary cards (Passed/Failed/Skipped/Total/Duration/PassRate) | `report-html.ts:108`, `report-sections.ts:156`    | Alta                | Útil                     | Manter                                                     |
| Failed summary                                                         | `report-sections.ts:238`                          | Alta (crítica)      | Útil                     | Manter no topo                                             |
| AI Analysis (LLM)                                                      | `report-sections.ts:189`                          | Variável            | Ruído se fallback        | Ocultar quando `llmFallback`                               |
| Chart (pass/fail)                                                      | `report-html.ts:111`                              | Alta                | Útil                     | Manter                                                     |
| Trend section                                                          | `report-html.ts:112`                              | Baixa se 1º run     | **Ruído** (render vazio) | Ocultar sem histórico                                      |
| Quality Gate banner                                                    | `report-html.ts:113`                              | Alta                | Útil                     | Manter                                                     |
| Health section (overall + 5 dims)                                      | `report-sections.ts:346`                          | Alta                | Útil                     | Manter, porém ver rótulo "Coverage"                        |
| **Provenance/Methodology** (fórmulas, fontes, padrões)                 | `report-sections.ts:399`, `pr-report-core.ts:616` | Baixa p/ cliente    | **Ruído**                | Mover para apêndice dev-only / remover do comentário do PR |
| Test table                                                             | `report-html.ts:116`                              | Alta (core)         | Útil                     | Manter                                                     |
| Diff comparison (vs run anterior)                                      | `report-html.ts:117`                              | **Altíssima p/ PR** | Útil mas **só no HTML**  | Ver O2                                                     |
| Flakiness link                                                         | `report-html.ts:118`                              | Média               | Útil                     | Manter                                                     |
| Timeline                                                               | `report-html.ts:119`                              | Média               | Útil p/ grande suite     | Ocultar p/ poucos testes                                   |

### Omissões (info útil NÃO apresentada)

- **O1 — Cobertura de código calculada mas NÃO exibida.** `resolveCoverageForReport` (`pr-report-core.ts:394-406`) obtém cobertura de código do DataHub, mas `generateHtmlReport` (`report-html.ts:100-119`) **não renderiza** esse valor no corpo (apenas passa `coverageSource` como option não usado). O cliente não vê a cobertura de código no HTML.
- **O2 — Diff vs run anterior ausente no comentário do PR.** `diffComparison` só entra no HTML (`report-html.ts:117`); o comentário do PR (`pr-report-core.ts:522-548`) não o inclui. O revisor que lê o PR não vê "o que mudou" — a informação mais útil de um PR.
- **O3 — "Coverage" no Health está com rótulo enganoso.** A dimensão `Coverage` do health (`health-score.ts:252-258`) é % de testes Jira com steps, **não** cobertura de código. Sem rótulo explícito, o cliente confunde as duas.
- **O4 — Executados vs totais.** Quando há `skipped`, o card de "Total" não distingue executados de não executados (pass rate exclui skipped do denominador, `run-pass-rate.ts:22-24` — correto, mas o card não deixa isso claro).

### Poluição confirmada

- **P1 — Metadado de metodologia duplicado** no HTML (colapsável) e no comentário do PR — ruído para consumidor cliente.
- **P2 — Trend section vazio** no primeiro run (sem histórico) — peso morto.
- **P3 — AI Analysis em modo fallback** renderiza template "⚠ AI Analysis unavailable" — ruído se não houver LLM.

---

## 4. Adequação de contexto

- **Rótulos honestos:** C5/O3 — "Coverage" sem qualificação induz erro de interpretação. Requer rótulo "Cobertura de testes Jira (steps)" vs "Cobertura de código".
- **Audiência:** o PR report serve revisores (precisam de diff/falhas) e possivelmente clientes (precisam de resumo). Atualmente sobrecarrega o cliente com metadado de metodologia (P1) e deixa o revisor sem diff no comentário (O2).
- **Estados de falha:** C9 mascara falhas como puladas — inaceitável para relatório de QA entregue a cliente (§25).

---

## 5. Testes de caracterização (prova de defeitos — FALHAM no código atual)

Adicionados (sem alterar testes existentes):

1. `shared/__tests__/result_parser.test.ts` — `status: 'error'` NÃO deve ser mapeado para `'skipped'` (C9). Falha hoje (cai em `skipped`).
2. `shared/__tests__/backlog-health.test.ts` — backlog vazio NÃO deve reportar score 100 (C6). Falha hoje (retorna 100).

> Os testes existentes que afirmam o comportamento errado (`backlog-health.test.ts:174,267,290`; `result_parser.test.ts:81-88,113-119`) devem ser corrigidos para a expectativa correta quando a causa raiz for corrigida (AGENTS.md §19.5/§20) — fora do escopo desta verificação.

**Resultado da execução (2026-07-20):**

```
npx vitest run shared/__tests__/result_parser.test.ts shared/__tests__/backlog-health.test.ts
Test Files  2 failed (2)
     Tests  2 failed | 57 passed (59)
```

- `backlog-health.test.ts > Characterization C6`: `AssertionError: expected 100 not to be 100` ✅ prova C6.
- `result_parser.test.ts > Characterization C9`: `AssertionError: expected 'skipped' not to be 'skipped'` ✅ prova C9.
- 57 testes existentes continuam passando (sem regressão).

---

## 6. Recomendações (raiz, não workaround)

| Achado   | Correção na origem                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| C1       | `collectAllPages`: repassar `startAt` ou chamar `searchJiraIssues` uma vez.                                    |
| C2       | Remover troca de denominador, ou rotular explicitamente "cobertura de issues ativas (30d)".                    |
| C3       | `fetchTotalCount`/`analyzeCoverage`: propagar erro ou retornar sentinela `undefined` (não 0).                  |
| C4       | `fetchLinkedTestsBatch`: processar todos os `issueKeys` (ou exigir `issuelinks` na busca e falhar se ausente). |
| C5       | `computeActualMetrics`: tratar não-finito como "sem dado" (undefined), não 0; rotular coverage.                |
| C6       | `calculateBacklogScore`: entrada vazia → sentinela "sem dados", não 100.                                       |
| C7       | `analyzeBacklogHealth`: não truncar silenciosamente; reportar `totalIssues` real ou paginar.                   |
| C8       | `densityByEpic`: usar campo de epic real, não `key.split('-')[0]`.                                             |
| C9       | `mapTestState`/`parseCtrfResults`: `error` → `failed` (ou categoria distinta não-skip).                        |
| C10      | `mapping-file-generator`: validar `tasksId.length` vs `tests.length` e alinhamento por título.                 |
| C11      | `schedule-handler`: injetar dados reais do DataHub, não arrays vazios.                                         |
| O1/O2/O3 | PR report: renderizar cobertura de código; incluir diff no comentário; rotular "Coverage".                     |
| P1/P2/P3 | Ocultar provenance do comentário do PR; ocultar trend vazio; ocultar AI em fallback.                           |

---

## 7. Fora de escopo

Geradores internos (CI YAML, release notes, índice de docs) e artefatos do próprio processo de auditoria.
