# PROGRESS — Plano de Reestruturação (Grafo de Contexto + Insights)

**Plano:** `dev/docs/plans/context-graph-insights-plan.md`
**Status:** Fase 0 em aberto (baseline F0.1 verde; fronteiras F0.2 decididas 2026-08-05; **F0.3 completa — próxima tarefa: F0.4**)

---

## Checkpoints

<!-- CHECKPOINT: Fase 0 complete -->

<!-- CHECKPOINT: Fase 1 complete -->

<!-- CHECKPOINT: Fase 2 complete -->

<!-- CHECKPOINT: Fase 3 complete -->

<!-- CHECKPOINT: Fase 4 complete -->

---

## Registro de execução

| Data | Fase.Tarefa | Ação | Resultado | Desvio |
|------|-------------|------|-----------|--------|
| 2026-08-05 | F0 (pré-baseline) | Confirmadas decisões Q1–Q3 + princípio "cálculos/campos sobrevivem por padrão; só renderers deletados" | IMPACT-PLAN §0 + plano principal §0.3 sincronizados; pendências P-1/P-2/P-3 registradas no IMPACT-PLAN | Nenhum |
| 2026-08-05 | F0.2 | Decididas fronteiras F-1/F-2/F-3 (P-2) + P-1 + P-3 — solução tecnicamente superior (instrução explícita do usuário) | Tabela F0.2 preenchida (plano principal §0.2); IMPACT-PLAN §0 tabela de pendências resolvidas; S2.2/S3.3/S6.4/S7.1 atualizados | Nenhum |
| 2026-08-05 | F0.1 | Baseline executado (HEAD `0272eb8a`): tsc ✅, vitest ✅ (545 arquivos / 7500 testes), lint ✅, depcruise ✅ (969 módulos / 3985 deps), unused-exports ✅, type-coverage ✅ (99.95% = 306625/306759), no-swallow ✅ | 7/8 verdes à primeira; `audit-suppressions` 🔴 preexistente | Nenhum |
| 2026-08-05 | F0.1 | Gap pré-existente tratado na raiz: 68 isenções expiradas em `audit/suppressions.yaml` (sunset 2026-07-23) — varredura com YAML vazio provou 0 swallows em arquivos lintados (só `scripts/validation-hook.ts`, fora do lint); arquivos movidos em refatorações (31) + catches corrigidos (37) → entradas stale removidas, `suppressions: []` | `audit-suppressions` ✅ exit 0 ("OK — nenhum contorno de segurança detectado"). `audit/` é gitignored → mudança local, sem commit | Nenhum |
| 2026-08-05 | F0.3 | TDD RED → migrados 3 cálculos p/ compute (`compute/ai-comparison.ts`, `compute/cross-squad-benchmark.ts`, `compute/requirement-score.ts`) + tipos + provenance; wrapper `compute/cross-squad.ts` deletado (fabrica vazio — Q3/Rule 25); barrel atualizado; `hub.ts` sem fabricações (`aiComparison`/`crossSquad` = `undefined`, Rule 25.2/P-3); consumidores repontados (interactive-mode, schedule-handler, renderers, scripts, quality-check allowlist, types/data-hub) | Teste de arquitetura `hub-architecture.test.ts` (novo, RED→GREEN). Gates: tsc ✅, vitest ✅ (544 arquivos / 7498 testes), lint ✅, depcruise ✅ (970 módulos), unused-exports ✅, type-coverage ✅ (99.95%), no-swallow ✅, audit-suppressions ✅. 2 testes do wrapper deletado removidos (`cross-squad.test.ts`, `cross-squad.integration.test.ts`); `hub.test.ts:364` passa a esperar `undefined` (P-3) | Hash de auto-integridade de `scripts/quality-check.ts` regenerado após alteração intencional da allowlist (mecanismo preservado, valor esperado atualizado) |
