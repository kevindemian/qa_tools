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
