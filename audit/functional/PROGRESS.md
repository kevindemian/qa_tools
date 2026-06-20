# QA Tools — Functional Audit PROGRESS

Start: 2026-06-15 | Method: INTEGRATED-PLAN.md (T1-T20 + 7 dim + FT-xx)

**Status atual da Correção Sistêmica:**
| Fase | Status |
|------|--------|
| F0 — Validar Detector | ✅ 100% |
| F2 — Zero-Impact Corrections | 🔜 ~35% |
| F1/F3/F4/F5/F6/F7/TC/D5d/D7s/QG | ❌ Pendente |
| **(detalhes em SYSTEMIC-CORRECTION-PLAN.md)** | |

## Feature Audit Summary

| ID        | Feature                   | Tests     | Gaps          | Next      |
| --------- | ------------------------- | --------- | ------------- | --------- |
| FT-01     | Config Accessor           | —         | 0             | —         |
| FT-02     | Feature Config            | 60        | 5             | —         |
| FT-03     | Session State             | 44        | 2             | —         |
| FT-04     | Metrics                   | 176       | 0             | —         |
| FT-05     | Logger                    | 56        | 6             | —         |
| FT-06     | Temp Dir                  | 31        | 11            | —         |
| FT-07     | Store                     | 84        | 5             | —         |
| FT-08     | Integration Helpers       | 20        | 8             | —         |
| FT-09     | Health Score              | 75        | 6             | —         |
| FT-10     | Quality Gate              | 26        | 7             | —         |
| FT-11     | Coverage Source           | 26        | 6             | —         |
| FT-12     | Quality Metrics           | 33        | 7             | —         |
| FT-13     | Quality Suggester         | 12        | 7             | —         |
| FT-14     | Release Score             | 18        | 5             | —         |
| FT-15     | Benchmark Metrics         | 18        | ?             | —         |
| **FT-16** | **PR Report Core**        | **57**    | **5+2R**      | **✅+re** |
| **FT-17** | **HTML Report**           | **34**    | **2+2R**      | **✅+re** |
| FT-18     | Coverage Gap              | 61        | ?             | ✅+re     |
| FT-19     | Flakiness Dashboard       | 24        | 5+6R          | ✅+re     |
| FT-20     | Defect Trend              | 28        | 5             | ✅+re     |
| FT-21     | Defect Seasonality        | 48        | 3             | ✅+re     |
| FT-22     | Silent Regression         | 45        | 7             | ✅+re     |
| FT-23     | AI Effectiveness          | 33        | 5             | ✅+re     |
| FT-24     | AI Comparison             | 43        | 5             | ✅+re     |
| **FT-25** | **Cross-Squad Benchmark** | **54**    | **5**         | **✅**    |
| **D7**    | **D7 Refinement**         | **14/14** | **14 checks** | **✅**    |
| FT-26     | Suite Optimization        | 38        | 0+6R          | ✅+re     |
| FT-27     | Developer Profile         | 38        | 0+6R          | ✅+re     |
| **FT-28** | **Backlog Health**        | **32**    | **6 (6R)**    | **✅**    |
| **FT-29** | **Pipeline Cost**         | **48**    | **5 (5R)**    | **✅**    |
| **FT-30** | **Impact Alert**          | **42**    | **6 (6R)**    | **✅**    |
| **FT-31** | **Incident Report**       | **30**    | **4 (4R)**    | **✅**    |
| **FT-32** | **Requirement Score**     | **43**    | **10 (10R)**  | **✅**    |

## Checkpoints

<!-- CHECKPOINT: Systemic Correction Appendix E created (2026-06-20) -->
<!-- CHECKPOINT: Systemic Correction Appendix E expanded + gap analysis complete (2026-06-20) -->
<!-- CHECKPOINT: D8-D12 Delta Audit complete (2026-06-20) -->
<!-- CHECKPOINT: D7 refinement complete -->
<!-- CHECKPOINT: FT-13 Phase 11 complete -->
<!-- CHECKPOINT: Phase 5 complete -->
<!-- CHECKPOINT: Phase 6 complete -->
<!-- CHECKPOINT: Phase 7 complete -->
<!-- CHECKPOINT: Phase 8.5 complete -->
<!-- CHECKPOINT: Phase 9 complete -->
<!-- CHECKPOINT: Phase 10 complete -->

## Referências

- **Plano executável:** `SYSTEMIC-CORRECTION-PLAN.md` (~700L) — o que fazer e em que ordem
- **SOP (regras):** `SOP.md` (~898L) — como executar cada fase
- **Histórico completo:** `HISTORY.md` (~2800L) — gaps individuais FT-01..FT-32, D7, D8-D12
- **Plano de integração:** `INTEGRATED-PLAN.md` (~630L) — features por grupo
- **Testes:** `npx vitest run --reporter=verbose | tail -3` — atualmente 5742 pass, 9 skip
- **Detector:** `bash ../../scripts/audit/sop-audit.sh` — 23 PASS / 45 FAIL / 1 SKIP
