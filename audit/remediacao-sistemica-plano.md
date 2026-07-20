# Plano de Remediação Sistêmica — Artefatos Client-Facing (git/jira)

**Data:** 2026-07-20
**Escopo:** Artefatos entregáveis ao cliente que derivam de dados de teste de git/jira.
**Autorização:** usuário aprovou remediação sistêmica completa (Fases 0–9) e entrega faseada
(com checkpoint + commit por fase). C5 (contract change) autorizado; dimensão faltante no
quality gate → `unknown` (explícito). C2/C3: wire de fontes reais via SSOT adapters;
quando Jira indisponível em runtime → empty-state explícito (não zeros).

**Padrão de teste (FASE: ROBUSTEZ REAL):** sem mock de lógica interna; `JiraResourceLike`/
GitHub client mockados só em fronteira. Cada defeito: teste de caracterização que reproduz
como vermelho → corrige origem → verde. Testes existentes que codificam defeito são
corrigidos (AGENTS.md §19.5). Property-based onde aplicável.

**Portões por fase:** `tsc --noEmit` limpo → suíte robusta verde → commit isolado →
monitorar CI (AGENTS.md §13).

**Já corrigido (não reexecutar):** #C1 Release Score, #C4 Traceability label,
#C6 Backlog vazio→N/A, #C9 error→failed.

---

## Fundamento arquitetural (Fase 0)

Defeito raiz = ausência de modelo de "dado indisponível" de primeira classe. Toda métrica é
tratada como número; o ausente vira `0`/`100`/`[]`/`(untitled)`. A solução eleva disponibilidade
a tipo:

- `Available<T>` (union discriminada): `{ available: true; value: T } | { available: false; reason? }`.
- `QualityDimension { score: number | null; available: boolean; status: 'pass'|'fail'|'unknown' }`.
- `renderMetric` central: `N/A` / "sem dados" quando `!available`; jamais `0`/`100` fabricados.
- Quality gate: dimensão obrigatória ausente → `'unknown'` (autorizado).
- Contrato único `CoverageGapResult` = `shared/types/coverage.ts` (canônico); apagar duplicata local.
- Junção por chave estável, nunca índice posicional.

---

## Fases

| Fase  | Escopo (raiz)                                                                                                                                                                      | Checkpoint de saída                                                              | Commit                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **0** | `shared/types/availability.ts`: `Available<T>`, `QualityDimension`, construtores/guards.                                                                                           | Tipos compilam; helpers testados.                                                | `feat(core): disponibilidade tipada de primeira classe`        |
| **1** | C5 Health Score: `dimensions`→`QualityDimension`; não-finito→`available:false`; composite renormaliza; gate `unknown`; rótulo "Cobertura de testes Jira (steps)". 14 consumidores. | `HealthScoreResult` com `available`; gate `unknown` p/ dim ausente; suíte verde. | `fix(health): ausência de métrica = unknown, não 0/fail`       |
| **2** | #C3 Traceability: apagar tipo local; consumir `CoverageGapResult` canônico; árvore via `hierarchy`/`byEpic`+`epicKey`; callers buscam `analyzeCoverageGaps`.                       | Matriz não-vazia c/ fixture real; no-data explícito.                             | `fix(traceability): contrato único + dados reais de cobertura` |
| **3** | C7 `slice(0,100)`→processa tudo/limita exibição; C8 epic via campo real.                                                                                                           | Backlog grande não trunca; agrupamento por epic correto.                         | `fix(backlog): sem truncagem silenciosa; epic real`            |
| **4** | C9 ✓ (sem ação).                                                                                                                                                                   | —                                                                                | —                                                              |
| **5** | C10 Mapping: parear por chave estável; validar `tasksId.length`×`tests.length`; marcar não-emparelhado.                                                                            | Mapeamento não produz `(untitled)`/vazio c/ ordem divergente.                    | `fix(mapping): junção por chave estável`                       |
| **6** | C1 `startAt` em `collectAllPages`; C2 remover/rotular troca `recentJql`; C3 erro→`undefined` (não 0); C4 remover `slice(0,50)`.                                                    | Paginação exata; erro de API ≠ 0%; linkage completo.                             | `fix(coverage-gap): paginação, denominador, erro e linkage`    |
| **7** | C11/#C2 Weekly/Interactive: injetar dados reais do DataHub (AI/backlog/requisitos); empty-state explícito.                                                                         | Seções com dados reais; zeros só quando medidos.                                 | `fix(weekly): fontes reais do DataHub, não arrays vazios`      |
| **8** | O1–O3/P1–P3 PR report: cobertura de código; diff no comentário; rótulo honesto; ocultar provenance/trend vazio/AI fallback.                                                        | Comentário com diff + cobertura de código; sem ruído.                            | `fix(pr-report): sinal-ruído e rótulos honestos`               |
| **9** | G threshold mágico; H NaN guard; J ts inválido; Q chaves hardcoded; R fuzzy→chave; N/O feeds AI; L/M consomem `CoverageGapResult` real; K severidade.                              | Cada artefato com teste robusto verde.                                           | `fix(batch2-3): causas-raiz de cada artefato`                  |

---

## Riscos / dependências

- **Fase 1 (C5):** 14 consumidores — fase crítica, typecheck contínuo.
- **Fase 6 (coverage-gap):** efeito em cascata (traceability, health, weekly, incident, impact).
- **Fase 2 (#C3):** reconciliação de contrato, não patch — exigir fixture real de `CoverageGapResult`.

## Execução

Ordem 0→9. Cada fase encerra com `tsc --noEmit` + suíte verde + commit isolado + CI monitorado
(AGENTS.md §13) antes de avançar.

---

## Progresso (checkpoints)

### Fase 0 — CONCLUÍDA

- Commit `6c4099e8` (push GitLab main `24621a45` via Batch 1/docs).
- `shared/types/availability.ts` + `shared/types/__tests__/availability.test.ts` (5 testes).

### Fase 1 (C5) — CONCLUÍDA (2026-07-20)

- Commit `678d2642` (push GitLab `24621a45..678d2642`).
- types/bugs.ts: `HealthScoreDimensionResult.available`+`status:'unknown'`; `HealthScoreResult.qualityGate:'unknown'`.
- health-score.ts: `evaluateQualityGate` 3-estados + renormalização sobre dims disponíveis; rótulo "Cobertura de testes Jira (steps)".
- quality-gate.ts: 3-estados; `unknown` NÃO forçado a fail; conclusion `unknown`→`neutral`.
- report-sections.ts / cli_base.ts / case19.ts / pr-report-core.ts: render `unknown`(❓)/N/A.
- NOVO `shared/__tests__/health-score.robust.test.ts` (5): prova dim ausente→`unknown` (não fail), renormalização, presente-abaixo-limiar falha.
- `tsc --noEmit` limpo; eslint 0 erros (quality-check: 13/13 checks ✅); 215 testes das suítes dependentes verdes.

### Fase 2 (#C3) — CONCLUÍDA (2026-07-20)

- **Objeto:** contratar o modelo único `CoverageGapResult` (canônico `shared/types/coverage.ts`)
  em `shared/report/traceability-matrix.ts`; eliminar duplicata local (`CoverageGapItem`/`CoverageGapResult`
  estreitos com `item.epic` + `byEpic:{total,covered,rawPct}`).
- **Mudanças (raiz, não patch):**
    - `traceability-matrix.ts`: importa `CoverageGapResult`/`CoverageGapItem` canônicos; `groupItemsByEpic`
      agrupa por `item.epicKey ?? ''`; `buildStoryNode` usa `item.issueKey ?? epicKey` (fallback explícito p/
      item sem `issueKey`); `byEpic` consumido por chave canônica.
    - `shared/types/coverage.ts`: `CoverageGapItem.issueKey` tornou-se **opcional** (`issueKey?: string`) —
      correção de contrato: um item de gap pode legitimamente não ter issueKey (atestado pelo teste
      "handles item without issueKey" que exige fallback ao epic). Leitores (`coverage-gap.ts` `createEpicNode`/
      `createChildNode`, `generate-coverage-gap-html.ts`) ganharam fallback `?? epicKey ?? ''`/`'—'`.
    - **Fixtures de teste reconciliadas ao contrato canônico** (Fase TESTES — fixture não codifica mais o
      contrato estreito): `traceability-matrix.test.ts` e `.integration.test.ts` via adapter de fixture
      (`toCanonicalCoverage` mapeia `epic`→`epicKey`); `e2e/ci-data-e2e`, `system/ci-data-system`,
      `robust` via `makeCoverageGapResult` (NOVO `shared/__tests__/coverage-fixture.ts`); `property.test.ts`
      arb constrói `CoverageGapResult` canônico (incl. `gateConfig`/`hierarchy`/`trends`).
    - `case21.test.ts` já usava o contrato canônico (sem ação).
- **Gate:** `tsc --noEmit` limpo; eslint 0 erros (3 warnings não-bloqueantes `detect-object-injection`
  em adapters de fixture, mesma classe dos pré-existentes); 96 testes das suítes de traceability/coverage
  verdes + 149 testes de suítes de cenário/relatório verdes (interactive-mode 55, schedule-handler 19,
  report-html 18, coverage-gap 8, generate-coverage-gap-html 14, etc.).
- **Nota:** callers (`case25`, `schedule-handler`, `interactive-mode`) continuam passando `undefined`
  (gap não populado em runtime) → empty-state explícito (Fase 7 fará o wire de `analyzeCoverageGaps`).

### Fase 3 (#C7 truncagem, #C8 epic) — CONCLUÍDA (2026-07-20)

- **#C7 (truncagem silenciosa):** `analyzeBacklogHealth` analisava só `issues.slice(0, maxIssues)`
  (linha 118) → bugs além de `maxIssues` NUNCA eram contabilizados (score/densidade subcontados,
  silencioso). **Raiz:** `maxIssues` é limite de EXIBIÇÃO, não de análise.
    - Fix: análise sobre **todos** os issues; `totalIssues = issues.length`; `displayLimit: opts.maxIssues`
      no resultado. `generateBacklogHealthHtml` renderiza no máx. `displayLimit` itens por lista e exibe
      nota explícita `Showing first N of M issues.` quando há truncagem (nunca silenciosa — AGENTS §25).
    - Testes que codificavam o defeito corrigidos (§19.5): `backlog-health.test.ts` "respects maxIssues"
      → "analyzes ALL issues"; `integration/backlog-health.integration.test.ts` FT-28c → "maxIssues limits
      display, not analysis". NOVO invariante property: `maxIssues` nunca trunca análise.
- **#C8 (epic via prefixo do key):** `issue.key.split('-')[0]` inferia o epic do prefixo do KEY
  (que é o PROJETO, não o epic). **Raiz:** `BacklogHealthIssue` não tinha campo de epic.
    - Fix: `BacklogHealthIssue.epic?: string` (campo real, opcional); agrupamento por
      `issue.epic ?? issue.key.split('-')[0] || 'UNKNOWN'` (campo real preferencial, fallback preservado
      p/ fixtures/ausência). **Wire completo do epic real da fonte Jira** ficará na Fase 7 (#C2 data wiring),
      pois os callers produtivos (`interactive-mode`, `schedule-handler`) hoje passam `[]` (sem issues reais).
- **Gate:** `tsc --noEmit` limpo; eslint 0 erros; 38 testes backlog-health verdes + 74 testes de
  schedule-handler/interactive-mode verdes (callers não afetados).

### CI (GitLab) — FALHA INFRAESTRUTURA PRÉ-EXISTENTE (não é regressão de código)

- Pipeline `2691911580` (sha `678d2642`) → `failed`, **jobs vazios**, `created_at==updated_at` (nenhum job executou), `yaml_errors:null`.
- Pipelines anteriores `2691851959` (`24621a45`, Fase 0/Batch1) e `2690579847` (`d92c6a65`, base antes do trabalho de Fase) **também `failed`** com o mesmo padrão.
- Conclusão: CI do GitLab sem runner executando jobs (falha infra independe do código). Gate local autoritativo (`scripts/quality-check.ts`: eslint 0 violações + 13 checks) passou integralmente. **Ação:** verificar disponibilidade de runner / config do pipeline no GitLab; não há defeito de código em Fase 1 a corrigir.
