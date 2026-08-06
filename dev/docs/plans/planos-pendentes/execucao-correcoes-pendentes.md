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
| C-1 | `calcCoverageFromRaw` mapeia NaN/±Infinity → `0` silencioso (viola JSDoc próprio) | `shared/data-hub/compute/coverage.ts:31-33` | 🔴 Safety (§25) | ✅ DONE (`1544ba61`) |
| C-2 | Oráculo "SSOT deliberately disagrees" codifica bug como feature | `shared/__tests__/pr-report-core.test.ts:604` | 🔴 Correctness | ⏳ PENDENTE |
| C-3 | Oráculo `'0.0%'` fixa valor incorreto quando há testes | `shared/__tests__/report-html.test.ts:257` | 🔴 Correctness | ⏳ PENDENTE |
| C-4 | Bug: run mais antiga como base | `shared/primitives/traceability.ts:75` | 🔴 Correctness | ⏳ PENDENTE |
| C-5 | Bug: denominador cumulativo de flakiness | `shared/report/flakiness-renderer.ts:40,86,247` | 🔴 Correctness | ⏳ PENDENTE |
| C-6 | Bug: `metrics-runs.ts` newest-first | `shared/data-hub/compute/metrics-runs.ts:48` | 🔴 Correctness | ⏳ PENDENTE |
| C-7 | ~~9 specs órfãs de artefatos deletados~~ | ~~`shared/types/artifact-specs.ts` (IDs 93/207/496/591/867/963/1152/1469/1752)~~ | 🟡 Limpeza | ❌ N/A — premissa falsa (ver §3.3) |
| C-8 | ~~Fixtures sintéticas dos deletados~~ | ~~`scripts/__fixtures__/artefactos/*`~~ | 🟡 Limpeza | ❌ N/A — premissa falsa (ver §3.3) |
| C-9 | ~~Orquestradores referenciam os 9 deletados~~ | ~~`git_triggers/interactive-mode.ts:702-723`, `schedule-handler.ts:216-296`, `batch-mode.ts`~~ | 🟡 Limpeza | ❌ N/A — premissa falsa (ver §3.3) |
| C-10 | ~~`quality-check.ts:406-435` falha em dashboards deletados~~ | ~~`scripts/quality-check.ts`, `artifact-scorecard-runner.ts`, `artifact-validation-harness.ts`~~ | 🟡 Limpeza | ❌ N/A — premissa falsa (ver §3.3) |
| C-11 | `audit-mock-boundaries.ts` existe mas não está wireado | `package.json` / CI quality job | 🟡 Limpeza | ⏳ PENDENTE |
| C-12 | Runs acumulam sem limite nem saneamento (3 índices + cache SHA) | `shared/data-hub/persistence.ts` (`put`/`saveReport`) | 🟡 Higiene de storage | ⏳ PENDENTE (design acordado 2026-08-06) |

### Pendências registradas, NÃO correções (decisões de autoridade do usuário)

| # | Item | Motivo |
|---|------|--------|
| P-1 | Fase 4 (search semântico) go/no-go | Decisão de autoridade do usuário (plano F4.0); sem embedding até decisão explícita |
| P-2 | F1–F3 (features: insights, grafo, SPA React) | Escopo de feature novo (plano-mãe), não correção; execução subsequente ao saneamento F0 |
| P-3 | PR #25 (`feat/f5-side-branch` → `main`) | Alvo definido pelo usuário foi `dev`; decidir fechar/retargetar |
| P-4 | `pr-report-duration-sourcing.md` (untracked) | Design doc pré-existente, implementação pendente |
| P-5 | `stryker.scope.config.mjs` / `vitest.stryker-scope.config.ts` (untracked) | Tooling de escopo; commit exige mudança em `tsconfig.eslint.json` (churn Tier 4) |
| P-6 | Docs com paths obsoletos (ex.: `1790000000000-completion-plan.md`) | Referenciam arquivos inexistentes; revisar status antes de qualquer execução |
| P-7 | Granularidade per-projeto de retenção (política nomeada) | YAGNI até evidência; v1 da retenção é global-only para evitar confusão (UX acordada) |

---

## 2. Ordem de execução (Safety primeiro)

```
C-1 (Safety) ✅ → C-2..C-6 (Correctness) ✅ → C-7..C-10 ❌ N/A (premissa falsa, ver §3.3) → C-11 (CI) → C-12 (Storage) → suite + push único + CI monitor
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

### 3.3 — C-7/C-8: ~~Remover specs órfãs e fixtures sintéticas~~ → **N/A — premissa falsa**

**Decisão (2026-08-06, autorização explícita do usuário):** C-7/C-8 **NÃO são executados**. A auditoria verificou contra o código real que **nenhum dos 9 artefatos listados é órfão**:

**Evidência (data: 2026-08-06):**
- Os "IDs 93/207/496/591/867/963/1152/1469/1752" do plano são na verdade **números de linha** de `shared/types/artifact-specs.ts`, mapeando para: ai-effectiveness(93), ai-comparison(207), traceability(496), flakiness(591), suite-optimization(867), cross-squad-benchmark(963), silent-regression(1152), requirement-score(1469), pipeline-health(1752).
- **Todos os 9 têm renderer em disco:** `ai-effectiveness-renderer.ts`, `ai-comparison-renderer.ts`, `suite-optimization-renderer.ts`, `cross-squad-benchmark-renderer.ts`, `silent-regression-renderer.ts`, `requirement-score-renderer.ts`, `git_triggers/pipeline-health-renderer.ts`, `traceability-matrix.ts`, `flakiness-dashboard.ts`.
- **Consumers ativos (5 entry points):** `git_triggers/interactive-mode.ts:386,414,424,433-438,466,551`; `git_triggers/schedule-handler.ts:226,244,249,254,259,269,294`; `git_triggers/batch-mode.ts:269,339,420-453`; scorecard/harness (`artifact-scorecard-runner.ts:125`, `artifact-validation-harness.ts:220`).
- **Fixtures existem:** `scripts/__fixtures__/artefactos/` contém `ai-effectiveness.json`, `ai-comparison.json`, `cross-squad-benchmark.json`, `silent-regression.json`, `suite-optimization.json`, `requirement-score.json`, `traceability.json`, `flakiness.json`.
- **`artifact-specs.ts` é consumido em runtime:** `scripts/artifact-scorecard-runner.ts:22`, `shared/quality/artifact-quality-gate.ts:20` — deletar specs quebraria o quality gate.
- **Sem commit de deleção no git history:** último refactor de artefatos relevante foi `de901295` (F0.4, removeu case25 — não artefatos).
- **traceability/flakiness receberam correções recém-aplicadas** (C-4 `e8015c82`, C-5 `394f3b0c`) — impossível serem artefatos deletados.

Executar C-7..C-10 à letra destruiria ~20 consumers em 5 entry points ativos e violaria Regras 4/6/7 e Architecture Contract G5. A correção correta é corrigir o plano (origem do erro), não o código.

**Commit:** N/A (sem mudança de código).

---

### 3.4 — C-9: ~~Podar orquestradores~~ → **N/A — premissa falsa**

Ver §3.3. Os orquestradores `interactive-mode.ts`, `schedule-handler.ts`, `batch-mode.ts` referenciam artefatos **vivos**, não deletados. Nenhuma poda.

**Commit:** N/A (sem mudança de código).

---

### 3.5 — C-10: ~~Sanear scripts de CI e harness~~ → **N/A — premissa falsa**

Ver §3.3. `quality-check.ts`, `artifact-scorecard-runner.ts`, `artifact-validation-harness.ts` avaliam artefatos **vivos**. Nenhuma mudança.

**Commit:** N/A (sem mudança de código).

---

### 3.6 — C-11: Wire `audit-mock-boundaries` no CI

**Arquivo(s):** `package.json`, `.github/workflows/*` (gerados via `shared/ci/ci-injector.ts` + `setup/templates/*`)

**Mudança:** Adicionar `npm run audit:mock-boundaries` (ou equivalente) como check no job quality; CI 100% gerado (G2) — alterar via ci-injector/templates, nunca edição manual.

**Critério de Aceitação:** script roda no CI; violações de mock interno falham o check.

**Commit:** `ci(quality): wire audit-mock-boundaries no job quality`

---

### 3.7 — C-12: Política de retenção de runs (design acordado 2026-08-06)

**Arquivo(s):** `shared/data-hub/persistence.ts` (hook em `put`), `shared/validation/config-schema.ts`, `shared/validation/config-validator.ts`, `git_triggers/cli-args.ts`/`batch-mode.ts` (comando manual)

**Evidência (consumidores):** `session-context.ts:131-153` (`loadReport(sha)` — cache por SHA exata) e `:203-215` (`getBranch(branch)` — só `entries[0]`, o mais recente). Tendências/flakiness/cobertura **não** leem o cache persistido (usam `raw.runs`/`parsedArtifacts` do fetch atual). Conclusão: retenção não quebra agregações se preservar (1) entry do SHA atual e (2) entry mais recente de cada branch.

**Mudança (na origem):**
1. **Dois knobs globais, opt-in, default OFF (retrocompatível — §10):**
   - `REPORT_RETENTION_COUNT` (number, default `0`=off) — "manter os últimos N runs por projeto" (mental model natural).
   - `REPORT_RETENTION_MAX_AGE_DAYS` (number, default `0`=off) — rede de segurança por idade.
2. **Semântica union (menos destrutivo):** entry removido se **não** está nos últimos N **e** **não** é mais jovem que X dias. Protegidos: SHA atual do HEAD + entry mais recente de cada branch.
3. **Saneamento atômico (Regra 7):** hook pós-`put` (limitado: roda quando count excede a política). Ler índices → calcular keep-set → apagar `{sha}.json` → reescrever global+project index **e** branch-index consistentemente (sem dangling refs), via temp-file + rename; falha = nada commitado + log alto (Regra 25).
4. **Loga cada deleção** (`rootLogger.info` com sha/projeto/razão) — nunca silencioso.
5. **Validação (Regra 24):** `int >= 0` via `config-validator.ts`; valor inválido falha alto.
6. **UX de comando:** `--prune-reports` (dry-run) + `--prune-reports --force` (executa). SPA futura (F3) apenas exibe política efetiva e dispara prune — config sempre via env/schema (fonte única).

**TDD (RED):** teste de persistência com 7 runs + política count=5 → após `put`, 5 runs; protegidos preservados; índices consistentes; dry-run não apaga.

**Critério de Aceitação:** índices nunca ficam em estado parcial; nenhuma deleção silenciosa; default OFF = comportamento idêntico (§10).

**Comando de Verificação:**
```bash
npx vitest run shared/data-hub/__tests__/persistence.test.ts
npx tsc --noEmit
npm run lint
```

**Testes:** `shared/data-hub/__tests__/persistence.retention.test.ts` (novo)

**Commit:** `feat(storage): política de retenção de runs com saneamento atômico (C-12)`

**STATUS: IMPLEMENTADO (2026-08-06).** Verificação: `tsc --noEmit` ok; suite completa 7585/7585; `npm run lint` ok; `persistence.retention.test.ts` (12 testes) + `config-validator.test.ts` (4 testes novos de retenção) verdes.

**Desvio documentado (forma, §22.3):** o saneamento reescreve os índices (branch → project → global) ANTES de apagar os `{sha}.json` — ordem inversa à literal do plano — para que nenhum índice referencie arquivo removido em nenhum passo intermediário (invariante "sem dangling refs" estrita). Falha numa deleção deixa apenas arquivo órfão (inofensivo, não referenciado), nunca entry de índice pendente; cada reescrita é atômica (temp-file + rename) e falha = nada commitado + log alto.

**Correção extra na origem (root cause):** `scripts/generate-env-example.ts` silenciosamente omitia a categoria `project` (QA_CURRENT_PROJECT/QA_PROJECT_DIR) do `.env.example` gerado — categoria ausente em `CATEGORY_LABELS`/`categoryOrder`. Corrigido na origem e `.env.example` regenerado.

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
| Deleção de specs órfãs quebra consumidor residual | ~~Auditoria `rg` por ID antes de deletar; suite completa por commit~~ → **C-7..C-10 cancelados (premissa falsa, §3.3)** — nenhuma deleção executada |
| CI gerado (G2) impede edição manual | Alterar `ci-injector.ts`/templates, regenerar, validar diffs |
| Retomada por agente sem contexto | Este documento é auto-contido (§1 inventário, §3 tarefas, §4 protocolo) |
