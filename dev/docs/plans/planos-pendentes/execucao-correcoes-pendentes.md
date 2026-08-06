# PLANO DE EXECUÇÃO — Correções Pendentes

**Documento de planejamento dedicado para todas as correções pendentes identificadas.**
**Local:** `dev/docs/plans/planos-pendentes/`
**Data de criação:** 2026-08-06
**Autoridade:** instrução explícita do usuário (AGENTS.md §1).

---

## 0. Regras de execução (AGENTS.md — não negociáveis)

- **TDD RED→GREEN (Regra 19.9/19.11):** teste que reproduz o defeito primeiro; correção na implementação, nunca no teste.
- **Causa raiz (Regra 4):** nenhum workaround, bypass, correção parcial ou paliativa.
- **Zero erro silencioso (Regra 25):** nenhum `catch` vazio, nenhum default que mascare dado ausente, nenhum NaN passando de gate.
- **Se a causa raiz não puder ser corrigida imediatamente:** → STOP e reportar a impossibilidade.
- **Ordem de prioridade:** Safety > Correctness > Performance.
- **Contratos imutáveis (Regra 6):** alteração exige produtores/consumidores identificados, intenção provada e autorização.
- **Equivalência (Regra 10):** sem equivalência presumida; prova por comportamento especificado.
- **Solução tecnicamente superior** sempre; sem novos débitos.
- **SOP §22:** fases sequenciais; checkpoint registrado antes de avançar.

---

## 1. Inventário de pendências (verificado contra código real em 2026-08-06)

| # | Pendência | Origem | Prioridade | Status |
|---|-----------|--------|------------|--------|
| C-1 | `calcCoverageFromRaw` mapeia NaN/±Infinity → `0` silencioso (viola JSDoc próprio) | `shared/data-hub/compute/coverage.ts:31-33` | 🔴 Safety (§25) | ⏳ PENDENTE |
| C-2 | Oráculo "SSOT deliberately disagrees" codifica bug como feature | `shared/__tests__/pr-report-core.test.ts:604` | 🔴 Correctness | ⏳ PENDENTE |
| C-3 | Oráculo `'0.0%'` fixa valor incorreto quando há testes | `shared/__tests__/report-html.test.ts:257` | 🔴 Correctness | ⏳ PENDENTE |
| C-4 | Bug: run mais antiga como base | `shared/primitives/traceability.ts:75` | 🔴 Correctness | ⏳ PENDENTE |
| C-5 | Bug: denominador cumulativo de flakiness | `shared/report/flakiness-renderer.ts:40,86,247` | 🔴 Correctness | ⏳ PENDENTE |
| C-6 | Bug: `metrics-runs.ts` newest-first | `shared/data-hub/compute/metrics-runs.ts:48` | 🔴 Correctness | ⏳ PENDENTE |
| C-7 | 9 specs órfãs de artefatos deletados | `shared/types/artifact-specs.ts` (IDs 93/207/496/591/867/963/1152/1469/1752) | 🟡 Limpeza | ⏳ PENDENTE |
| C-8 | Fixtures sintéticas dos deletados | `scripts/__fixtures__/artefactos/*` | 🟡 Limpeza | ⏳ PENDENTE |
| C-9 | Orquestradores referenciam os 9 deletados | `git_triggers/interactive-mode.ts:702-723`, `schedule-handler.ts:216-296`, `batch-mode.ts` | 🟡 Limpeza | ⏳ PENDENTE |
| C-10 | `quality-check.ts:406-435` falha em dashboards deletados | `scripts/quality-check.ts`, `artifact-scorecard-runner.ts`, `artifact-validation-harness.ts` | 🟡 Limpeza | ⏳ PENDENTE |
| C-11 | `audit-mock-boundaries.ts` existe mas não está wireado | `package.json` / CI quality job | 🟡 Limpeza | ⏳ PENDENTE |

### Pendências registradas, NÃO correções (decisões de autoridade do usuário)

| # | Item | Motivo |
|---|------|--------|
| P-1 | Fase 4 (search semântico) go/no-go | Decisão de autoridade do usuário (plano F4.0); sem embedding até decisão explícita |
| P-2 | F1–F3 (features: insights, grafo, SPA React) | Escopo de feature novo (plano-mãe), não correção; execução subsequente ao saneamento F0 |
| P-3 | PR #25 (`feat/f5-side-branch` → `main`) | Alvo definido pelo usuário foi `dev`; decidir fechar/retargetar |
| P-4 | `pr-report-duration-sourcing.md` (untracked) | Design doc pré-existente, implementação pendente |
| P-5 | `stryker.scope.config.mjs` / `vitest.stryker-scope.config.ts` (untracked) | Tooling de escopo; commit exige mudança em `tsconfig.eslint.json` (churn Tier 4) |
| P-6 | Docs com paths obsoletos (ex.: `1790000000000-completion-plan.md`) | Referenciam arquivos inexistentes; revisar status antes de qualquer execução |

---

## 2. Ordem de execução (Safety primeiro)

```
C-1 (Safety) → C-2..C-6 (Correctness) → C-7..C-10 (Limpeza) → C-11 (CI) → suite + push único + CI monitor
```

Sequência estrita; cada tarefa verificada antes da próxima (SOP §22.2). Checkpoint em `dev/docs/plans/context-graph-insights-PROGRESS.md` e/ou neste documento ao fim de cada bloco.

---

## 3. Tarefas

### 3.1 — C-1: Blindar `calcCoverageFromRaw` (zero erro silencioso §25)

**Arquivo(s):** `shared/data-hub/compute/coverage.ts`

**Mudança:** `calcCoverageFromRaw` lança `TypeError` nomeando o campo e o valor quando **qualquer campo numérico obrigatório** (`percentage`, `covered`, `total`) for não-finito (NaN/±Infinity). Mantém clamping para valores finitos fora de faixa (`150→100`, `-10→0`) — normalização documentada. Assinatura inalterada; a implementação passa a cumprir o contrato já documentado no JSDoc ("NaN must never pass silently").

**TDD (RED):**
- "throws when percentage is NaN"
- "throws when percentage is Infinity" / "… -Infinity"
- "throws when total (statements count) is NaN"
- "throws when covered is NaN"
- Property-based: `fc.constantFrom(NaN, Infinity, -Infinity)` em cada campo → sempre `toThrow`

**Critério de Aceitação:** nenhum caminho devolve `0` para entrada não-finita; teste verifica falha explícita (§25.4).

**Comando de Verificação:**
```bash
npx vitest run shared/data-hub/__tests__/compute/coverage.test.ts shared/data-hub/__tests__/compute/coverage.property.test.ts
npx tsc --noEmit
```

**Testes:** `shared/data-hub/__tests__/compute/coverage.test.ts`, `coverage.property.test.ts`

**Commit:** `fix(coverage): calcCoverageFromRaw lança em NaN/±Infinity — elimina 0 silencioso (§25)`

---

### 3.2 — C-2..C-6: Sanear oráculos contaminados + corrigir bugs de dados na origem

**Arquivo(s):** `shared/__tests__/pr-report-core.test.ts:604-608`, `shared/__tests__/report-html.test.ts:232,257`; implementações `shared/primitives/traceability.ts:75`, `shared/report/flakiness-renderer.ts:40,86,247`, `shared/data-hub/compute/metrics-runs.ts:48`

**Mudança:** **Não alterar expectativas para passar (Regra 19.3).** Reescrever testes com oráculo derivado de requisito: pass rate = `passed/(passed+failed)`; sem `0.0%` como valor correto quando há testes; sem "SSOT deliberately disagrees". Corrigir bugs na implementação.

**TDD (RED — cláusula Regra 19.11, ordem obrigatória):**
1. Escrever teste que reproduz o bug (falha com código atual)
2. Commit do teste falhando (RED)
3. Corrigir a implementação
4. Verificar verde (GREEN)
5. Teste permanece como regressão permanente

**Critério de Aceitação:** nenhum teste no repo codifica valor incorreto como correto; bugs reproduzidos e corrigidos na implementação.

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/pr-report-core.test.ts shared/__tests__/report-html.test.ts shared/data-hub/__tests__
npx tsc --noEmit
```

**Testes:** reescritos com oráculo de requisito

**Commit:** `fix(metrics): corrigir run base e denominador de flakiness + sanear oráculos (F0.8)`

---

### 3.3 — C-7/C-8: Remover specs órfãs e fixtures sintéticas

**Arquivo(s):** `shared/types/artifact-specs.ts`, `scripts/__fixtures__/artefactos/*`, `setup/templates/*`

**Mudança:** Remover as 9 specs dos deletados (IDs 93, 207, 496, 591, 867, 963, 1152, 1469, 1752). Specs de coverage-gap (1568) e pr-report (2025/2122/2164) permanecem para reconstrução. Remover fixtures sintéticas dos deletados.

**TDD (RED):** teste de schema que falha se spec órfã existe.

**Critério de Aceitação:** `artifact-specs.ts` contém apenas 8 sobreviventes + 3 reconstruídos + orquestradores.

**Auditoria:**
```bash
for id in ai-effectiveness ai-comparison traceability flakiness suite-optimization cross-squad-benchmark silent-regression requirement-score pipeline-health; do
  rg -l "'$id'" shared/types/artifact-specs.ts && echo "STILL EXISTS: $id"
done
```

**Commit:** `refactor(specs): remover specs/fixtures de artefatos deletados (F0.7)`

---

### 3.4 — C-9: Podar orquestradores

**Arquivo(s):** `git_triggers/interactive-mode.ts`, `git_triggers/schedule-handler.ts`, `git_triggers/batch-mode.ts`

**Mudança:** Remover handlers `_dashboard*`/entries de menu dos 9 deletados; remover 9 seções do relatório semanal; remover `generateFlakinessDashboard`, `handlePipelineHealth`, `generatePrReportIfNeeded` (batch-mode).

**Critério de Aceitação:** menu expõe apenas os 8 sobreviventes; schedule sem seções deletadas; batch-mode sem imports órfãos.

**Commit:** `refactor(orchestrators): podar menu/schedule/batch dos artefatos deletados (F0.5)`

---

### 3.5 — C-10: Sanear scripts de CI e harness

**Arquivo(s):** `scripts/quality-check.ts:406-435`, `scripts/artifact-scorecard-runner.ts`, `scripts/artifact-validation-harness.ts`

**Mudança:** Remover checks de dashboards deletados; scorecard avalia 8 sobreviventes + 3 reconstruídos; harness não renderiza artefatos deletados.

**Critério de Aceitação:** `npm run lint` (executa quality-check) verde; scorecard sem specs órfãs.

**Commit:** `refactor(ci): scorecard e harness avaliam apenas artefatos vigentes (F0.6)`

---

### 3.6 — C-11: Wire `audit-mock-boundaries` no CI

**Arquivo(s):** `package.json`, `.github/workflows/*` (gerados via `shared/ci/ci-injector.ts` + `setup/templates/*`)

**Mudança:** Adicionar `npm run audit:mock-boundaries` (ou equivalente) como check no job quality; CI 100% gerado (G2) — alterar via ci-injector/templates, nunca edição manual.

**Critério de Aceitação:** script roda no CI; violações de mock interno falham o check.

**Commit:** `ci(quality): wire audit-mock-boundaries no job quality`

---

## 4. Protocolo de commit/push/CI (instrução explícita do usuário)

1. **Commit atômico por tarefa** (uma correção = um commit).
2. **Suite completa a cada commit:** `npx vitest run` (7554 testes) + `npx tsc --noEmit` + `npm run lint`.
3. **Push único** ao fim do bloco de trabalho (não a cada commit).
4. **Monitorar apenas o push final** via GitHub API (Rule 13): `gh run list`/`gh run view`.
5. CI vermelho → isolar passo com `conclusion: failure` → logs → corrigir causa raiz → novo commit → push → monitorar.

---

## 5. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| C-2..C-6 tocam renderers/oráculos com muitos consumidores | Identificar produtores/consumidores antes; TDD RED prova o bug antes da correção (Regra 19.11) |
| Deleção de specs órfãs quebra consumidor residual | Auditoria `rg` por ID antes de deletar; suite completa por commit |
| CI gerado (G2) impede edição manual | Alterar `ci-injector.ts`/templates, regenerar, validar diffs |
| Retomada por agente sem contexto | Este documento é auto-contido (§1 inventário, §3 tarefas, §4 protocolo) |
