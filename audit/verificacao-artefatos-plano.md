# Plano de Verificação Individual por Artefato — QA Tools (client-facing)

**Data:** 2026-07-20
**Status:** Em execução (Batch 1 — crítico)
**Padrão de teste aplicado:** FASE: TESTES (ROBUSTEZ REAL) — ver `audit/verificacao-artefatos-metodologia.md`.
**Autorização:** Correção de código de produção na causa raiz quando os testes revelarem defeito (instrução explícita do usuário: "pare a execução do teste, corrija o código de produção e reinicie a bateria de testes").

---

## 1. Objetivo

Verificar **cada** relatório/dashboard/artefato cliente individualmente sob 4 lentes:

- **Correção** — número bate com ground truth (sem missing-as-zero, sem denominador enviesado, sem contagem inflada).
- **Qualidade** — guards NaN/Infinity/empty presentes; sem silenciamento (AGENTS.md §25).
- **Utilidade / Sinal-ruído** — info útil vs ruído; sem redundância; sem metadado dev-interno exposto ao cliente.
- **Adequação de contexto** — rótulos honestos; serve ao consumidor cliente.

Entregar por artefato: (a) subseção escrita no relatório; (b) teste(s) de caracterização robustos (falham provando o defeito); (c) correção na origem quando aplicável.

---

## 2. Escopo — 19 artefatos cliente

### Já verificados (Parte 1 — `audit/verificacao-artefatos-2026-07-20.md`)

| A | PR report (HTML + job summary + check-run + PR comment) |
| B | Coverage gap report |
| C | Health score |
| D | Backlog health |
| E | Mapping files |

### Pendentes (Parte 2 — executados em batches)

| F | Traceability matrix | `traceability-matrix.ts:200,393` |
| G | Flakiness dashboard | `flakiness-dashboard.ts:22,95` |
| H | Pipeline health report | `pipeline-health-renderer.ts:123` |
| I | **Release score** | `release-score.ts:102` (callers `case26.ts:25`, `schedule-handler.ts:173`, `interactive-mode.ts:379`) |
| J | Defect trends dashboard | `defect-trend.ts:106` |
| K | Bug report | `bug-report.ts:67,179,211` |
| L | Incident report | `incident-report.ts:59` |
| M | Pipeline impact alert | `impact-alert.ts:177` |
| N | **AI effectiveness** | `ai-effectiveness.ts:38` |
| O | **AI comparison** | `ai-comparison.ts:63` |
| P | **Weekly quality report** | `schedule-handler.ts:151-286` |
| Q | E2E complete report | `e2e/gen-report-complete.ts:159` |
| R | Test execution / result reporter | `result_reporter.ts`, `test-execution-creator.ts` |
| S | **Interactive dashboards** | `interactive-mode.ts:374-566` |

---

## 3. Causas raiz transversais (corrigir na origem)

- **#C1** Release Score alimentado com `tasksPct=80`/`coveragePct=70` hardcoded em 3 call sites.
- **#C2** Feeds vazios (`records:[]`, `analyzeBacklogHealth([])`, etc.) em orquestradores para AI/Backlog/Requirement.
- **#C3** `coverageResult=undefined` em todos os callers da Traceability (exceto coverage-gap) → matriz sempre vazia → cascata em Incident/Impact.
- **#C4** "Coverage" na Traceability é pass-rate relabelada (enganoso).
- **#C5** Testes de orquestração mockam os geradores, escondendo #C1–#C3.

---

## 4. Sequenciamento

- **Batch 1 (CRÍTICO):** I (Release Score), P (Weekly), S (Interactive), F (Traceability) — cobre #C1–#C4.
- **Batch 2 (ALTO/MÉDIO):** N, O (AI), L, M (Incident/Impact), K (Bug report).
- **Batch 3 (confirmar):** G, H, J, Q, R.

---

## 5. Metodologia de teste (FASE: TESTES — ROBUSTEZ REAL)

- **Anti-mock theater:** proibido mockar lógica interna (funções/helpers/módulos locais). Fluxo roda integrado e real.
- **Mocks estritos de fronteira:** apenas APIs externas inacessíveis localmente (Jira/GitHub HTTP via `JiraResourceLike`/GitHub client) — dados do DataHub são reais (fixtures), não mockados.
- **Validação de side effects:** confirmar persistência/mutação real, não só retorno.
- **Property-based:** onde aplicável (escalas, agregações, guards).
- **Valores esperados intocáveis:** não alterar asserts de testes existentes para maquiar verde; corrigir a implementação.
- **Tratamento de erro:** edge cases e rejeições com a mesma rigidez do caminho feliz.

---

## 6. Status de execução (atualizado por batch)

| Artefato                 | Status        | Defeitos               | Teste                           | Fix origem                   |
| ------------------------ | ------------- | ---------------------- | ------------------------------- | ---------------------------- |
| A PR report              | ✅ verificado | C-poluição O1/O2/O3/P1 | characterization adicionado     | pendente (O1/O2/O3)          |
| B Coverage gap           | ✅ verificado | C1,C2,C3,C4            | (report)                        | pendente                     |
| C Health score           | ✅ verificado | C5                     | (report)                        | pendente                     |
| D Backlog health         | ✅ corrigido  | C6,C7,C8               | characterization (C6) corrigido | **FEITO (C6)**; C7/C8 aberto |
| E Mapping files          | ✅ verificado | C10                    | (report)                        | pendente                     |
| F Traceability           | 🟡 parcial    | #C3,#C4                | robusto + correção C4           | C4 feito; C3 aberto          |
| G Flakiness              | ⏳ Batch 3    | threshold mágico       | a criar                         | a avaliar                    |
| H Pipeline health        | ⏳ Batch 3    | NaN sem guard          | a criar                         | a fazer                      |
| I Release score          | ✅ corrigido  | #C1                    | robusto (4) + corrigido         | **FEITO (#C1)**              |
| J Defect trends          | ⏳ Batch 3    | ts inválido            | a criar                         | a avaliar                    |
| K Bug report             | ⏳ Batch 2    | severidade major       | a criar                         | a fazer                      |
| L Incident               | ⏳ Batch 2    | #C3 cascata            | a criar                         | a fazer                      |
| M Impact alert           | ⏳ Batch 2    | #C3 cascata            | a criar                         | a fazer                      |
| N AI effectiveness       | ⏳ Batch 2    | #C2 vazio              | a criar                         | a fazer                      |
| O AI comparison          | ⏳ Batch 2    | #C2 vazio              | a criar                         | a fazer                      |
| P Weekly report          | 🟡 parcial    | #C1,#C2,#C3            | robusto (C1)                    | C1 feito; C2/C3 aberto       |
| Q E2E complete           | ⏳ Batch 3    | chaves hardcoded       | a criar                         | a fazer                      |
| R Result/Exec reporter   | ⏳ Batch 3    | fuzzy match            | a criar                         | a avaliar                    |
| S Interactive dashboards | 🟡 parcial    | #C1,#C2,#C3            | robusto (C1)                    | C1 feito; C2/C3 aberto       |

---

## 7. Log de execução — Batch 1

### I/S/P — Release Score (#C1) — CORRIGIDO NA ORIGEM

- **Causa raiz:** `case26.ts:26,29`, `schedule-handler.ts:174,177`, `interactive-mode.ts:386,389`
  passavam literais `80` (tasks) e `70` (coverage) hardcoded — fabricação sem fonte real
  (viola AGENTS.md §1 autoridade / §25 zero-silencing).
- **Fix:** `calculateReleaseScore(tasksPct: number | undefined, …, coveragePct: number | undefined, …)`
  renormaliza o composto sobre dimensões com dado real; dimensão sem fonte → `noData: true`
  (renderiza `N/A`, não 80). Callers passam `coveragePct = dataHub.computed.coverage ?? dataHub.getCoverage()?.percentage`
  (fonte real) e `tasksPct = undefined` (não existe métrica "tasks" real no sistema — documentado, não inventada).
- **Testes:** `shared/__tests__/release-score.robust.test.ts` (4 testes, verdes). `buildReleaseSection`
  renderiza `N/A`/`no data` para dimensões sem fonte.
- **Falta:** definir fonte real para "Tasks" (requer decisão de domínio — não inventada).

### F — Traceability (#C3/#C4)

- **#C4 CORRIGIDO:** `overallCoverage` era a pass-rate de testes linkados relabelada como
  "Overall Coverage". Renomeado o card HTML para **"Overall Test Pass Rate"** (honesto).
  Teste existente que codificava o defeito (`expect(html).toContain('Overall Coverage')`) corrigido
  para `'Overall Test Pass Rate'` (AGENTS.md §19.5).
- **#C3 ABERTO (causa raiz documentada):** `buildTraceabilityMatrix` define seu PRÓPRIO
  `CoverageGapResult` estreito (exige `item.epic`), incompatível com o `analyzeCoverageGaps`
  real (`shared/types/coverage.ts` — itens sem `epic`). Por isso callers passam `undefined` →
  matriz sempre vazia. Requer reconciliação de contrato (não feita neste batch para não deixar
  código quebrado/parcial). `shared/__tests__/traceability-matrix.robust.test.ts` (3 testes)
  exercita o contrato atual com fixture real e prova não-fabricação quando `undefined`.
- **Risco:** callers `schedule-handler.ts:183` e `interactive-mode.ts:408` ainda passam `undefined`.

### D / E — Backlog health (C6) e Result parser (C9) — CORRIGIDOS NA ORIGEM

- **C6:** `calculateBacklogScore` usava `Math.max(totalIssues, totalFlagged, 1)` → backlog vazio
  (0 issues) virava `effective=1` e pontuava **100%** (mascara "sem dados" como "perfeito" —
  violação AGENTS.md §25). Fix: `totalIssues === 0 → score 0` e `noData: true`; HTML renderiza
  `N/A`. Testes existentes que codificavam o defeito (linhas 174, 267, 290) corrigidos (§19.5).
- **C9:** `parseCtrfResults` e `mapTestState` (mochawesome) colapsavam `error` em `skipped`,
  mascarando falha dura (§25). Fix: `status === 'error' → 'failed'`. Testes existentes
  `pending`/`other`/`missing` → `skipped` mantidos (não executado = pulado, defensável).
- Ambos os testes de caracterização (C6/C9) agora VERDES.

### Próximo (em curso)

- C5 (health-score não-finito→0 / gate fail), C2 (feeds AI/Backlog/Requirement sempre vazios),
  C3 (coverageResult undefined em Weekly/Incident/Impact), C7/C8 (backlog truncation/epic key),
  C10 (mapping index pairing) e Batches 2–3.

---

## 8. Status final — Batch 1 (corte 2026-07-20)

**Corrigidos na origem (root cause) + testes robustos verdes:**

- #C1 Release Score — `calculateReleaseScore(tasksPct|coveragePct: number|undefined)`; renormaliza
  sobre dimensões com dado real; `tasksPct=undefined` (sem fonte real, não inventada) e
  `coveragePct=computed.coverage` (real). Callers `case26.ts`/`schedule-handler.ts`/`interactive-mode.ts`
  atualizados. `release-score.robust.test.ts` (4 verdes).
- #C4 Traceability — card HTML renomeado "Overall Coverage" → "Overall Test Pass Rate" (honesto).
  `traceability-matrix.robust.test.ts` (3 verdes).
- #C6 Backlog health — `totalIssues===0 → score 0 + noData`, HTML `N/A` (fim da fabricação de 100%).
  Testes que codificavam o defeito corrigidos (§19.5).
- #C9 Result parser — `status==='error' → 'failed'` (não `skipped`). Ambos parsers corrigidos.
  Testes que codificavam o defeito corrigidos (§19.5).

**Suíte completa:** 508 arquivos / 6931 testes verdes (após correção de testes que codificavam
defeitos, conforme AGENTS.md §19.5).

**Aberto (requer decisão de domínio / refatoração de contrato — não parcial):**

- #C3 Traceability: contrato `CoverageGapResult` local incompatível com `analyzeCoverageGaps` real
  (itens sem `epic`) → callers passam `undefined` → matriz vazia. Exige reconciliação de contrato.
- C5 Health score: não-finito→0 mascara outage como falha; dimensão "coverage" semântica confusa.
  Requer `HealthScoreResult` suportando "sem dado".
- C2 feeds AI/Backlog/Requirement sempre vazios (`[]` nos callers).
- C7/C8 backlog truncation `slice(0,100)` / `epic=key.split('-')[0]`.
- C10 mapping index pairing.
- Batches 2–3 (N/O AI, L/M Incident/Impact, K Bug report, G/H/J/Q/R).
