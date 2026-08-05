# PLANO DE REESTRUTURAÇÃO — Grafo de Contexto + Camada de Insights

**Status:** APROVADO (autoridade: usuário, 2026-08-05)
**Direção escolhida:** Path B — arquitetura de **grafo de contexto** + **camada de insights** (separação `gerarInsight → renderizarHTML`).
**Referência estratégica:** `dev/docs/archive/lixo/STRATEGIC-PLAN.md` (histórico — visão de produto; a premissa "tudo implementado, só não orquestrado" foi **invalidada** pela auditoria, ver §0.7).
**Fonte de verdade do plano:** este documento. Execução segue `AGENTS.md` Regra 27 (plano-driven), Regra 19 (TDD red-green-refactor), Regra 5 (safety mechanisms imutáveis).
**Retomabilidade:** este documento é **auto-contido** — um agente sem contexto prévio da conversa deve conseguir executá-lo seguindo §0.4 (leitura obrigatória), §0.5 (glossário) e §0.6 (mapa da codebase).

---

## 0. Contexto e Decisões

### 0.0 Como usar este documento

1. Ler **§0.4 (Leitura Obrigatória)** na ordem — sem isso os termos e invariantes não são compreensíveis.
2. Consultar **§0.5 (Glossário)** sempre que um termo de domínio aparecer.
3. Executar as fases na ordem F0 → F1 → F2 → F3 → F4 (§ Ordem de Execução). Cada fase tem checkpoint obrigatório em `dev/docs/plans/context-graph-insights-PROGRESS.md`.
4. Cada tarefa é **atômica e comitável**: termina em um commit com testes verdes. Nenhuma tarefa parcial é aceita (Regra 7).

### 0.1 O problema (evidência, não inferência)

24 artefatos existem e **produzem informação inválida**. As 5 classes de defeito são universais:

| Classe | Exemplo de evidência |
|--------|----------------------|
| Dados multi-run corrompidos | `shared/primitives/traceability.ts:75` usa a run **mais antiga** como base |
| Métricas contraditórias | `shared/report/flakiness-renderer.ts:40,86,247` denominador cumulativo; `pr-report-core` mostra `0.0%` |
| DOM inflado sem cap | `pr-report.html` real: 20 656 testes / 5.9MB |
| Placeholders passando por dados | `compareAiVsManual(null)` (`hub.ts:932`), `computeCrossSquad(undefined)` |
| Seções vazias | artefatos sem produtor de dados |

**Causa raiz das 5 execuções fracassadas:** (1) oráculo escrito depois do código — testes codificam bugs como corretos (`pr-report-core.test.ts:604-608`); (2) AQS valida só `includes(nomeDaMétrica)` — presença, nunca veracidade; (3) fixtures sintéticas, nunca dados reais; (4) remendo incremental sobre primitives compartilhados.

### 0.2 Decisões vinculantes

| # | Decisão | Autoridade |
|---|---------|------------|
| D1 | **Path B**: separar geração de insights de renderização. Insight JSON = contrato; HTML = consumidor (renderer), nunca produtor. | Usuário |
| D2 | **Grafo de contexto** como modelo de informação: Ticket↔PR↔Commit↔File↔Test↔Bug. | Usuário |
| D3 | **Deleção**: artefatos com defeito irreparável sem produtor são deletados (hub-first); `coverage-gap` e `pr-report` são **reconstruídos** como insights na Fase 1 (não deletados). | Usuário + análise ROI |
| D4 | **Dados reais** como fixtures SSOT (nunca sintéticas). `reports/*/legacy.json` e `reports/2026-07-09/last-results.ctrf.json` são fontes. | Causa raiz (3) |
| D5 | **Determinismo**: `resolveGeneratedAt(seed)` já canônico; estende-se a insights. | D5 (ARTIFACT-VALIDATION) |
| D6 | **Anti-goals**: sem DB relacional (JSON + índice in-memory); sem busca semântica antes da Fase 4; sem migrar 38 features de uma vez (3 pilotos); sem novo conector. | Usuário |
| D7 | **STRATEGIC-PLAN.md** permanece como visão de produto (plataforma de inteligência QA), **não** como especificação de orquestração de artefatos quebrados. | Usuário |

### 0.3 Escopo de deleção (Fase 0)

Artefatos a deletar (hub-first, ordem de execução em 0.3.1):

1. `ai-effectiveness`
2. `ai-comparison`
3. `cross-squad-benchmark`
4. `requirement-score`
5. `traceability`
6. `flakiness`
7. `suite-optimization`
8. `silent-regression`
9. `pipeline-health`

Reconstruir como insights na Fase 1 (preservar dados no DataHub):

10. `coverage-gap`
11. `report-html` (`pr-report-html`)
12. `pr-report-markdown` / `pr-report-job-summary` (decidir em F0.2 → auto-registro abaixo)

**Sobrevivem como estão:** `release-score`, `defect-trend`, `defect-seasonality`, `developer-profile`, `backlog-health`, `impact-alert`, `incident-report`, `pipeline-cost`.

### 0.3.1 Ordem de deleção (hub-first)

```
1. shared/data-hub (hub.ts, data-hub.ts, compute/*) → refatorar imports/fields
2. jira_management/commands (case25.ts deletar, case17/21/27 refatorar)
3. git_triggers (interactive-mode, schedule-handler, batch-mode)
4. scripts (quality-check, scorecard-runner, validation-harness)
5. shared/__tests__ contaminados (oráculos)
6. specs (artifact-specs.ts) + fixtures + setup/templates + CI
7. docs (referências)
```

**Por que hub-first:** corrigir o produtor (`hub.ts`) antes dos consumidores evita estados intermediários inconsistentes (Regra 7 — correção local sem correção sistêmica é inválida). Se os consumidores fossem corrigidos primeiro, eles ficariam lendo campos que ainda existem no hub, mascarando o defeito.

### 0.4 Leitura Obrigatória (retomada por agente desconhecido)

> **Leia nesta ordem.** Sem isso, os invariantes e termos do plano são incompreensíveis e a execução violaria regras.

| Ordem | Documento | Extrair |
|---|---|---|
| 1 | `AGENTS.md` (raiz do projeto) | Regras 3, 5, 8, 10, 18, 19, 24, 25, 26, 27 — TDD obrigatório (19), mocks estritos (19.2), oráculos de requisito (19.3), oráculo imutável (19.5), property-based (19.6), zero silenciamento (25), mock fidelity (26), plano-driven (27) |
| 2 | `dev/docs/internal/ARCHITECTURE-CONTRACT.md` | G1–G5: entry point único do pr-report; CI `*.yml` 100% gerado via injector; `shared/` NÃO importa `git_triggers/`; zero scripts em entry points; arquivos de mecanismo de segurança NÃO são documentação |
| 3 | `dev/docs/internal/GOLDEN-REFERENCE.md` | §1 Design Mandate (tokens, WCAG AA, a11y, emoji-free), §5 Icons, §7 Enforcement — governa qualquer output visual (Fase 3) |
| 4 | `dev/docs/plans/EXECUTION-PLAN.md` | Regra arquitetural: artefatos consomem dados EXCLUSIVAMENTE de DataHub; NENHUM calcula próprios dados. Se um dado não está no DataHub, implementar lá PRIMEIRO |
| 5 | `dev/docs/internal/ARTIFACT-VALIDATION.md` | Contexto do defeito (24 artefatos × 3 dimensões), D5 determinismo (`resolveGeneratedAt`), hashes sha256, matriz de evidência |

### 0.5 Glossário

| Termo | Definição |
|---|---|
| **DataHub** | `shared/data-hub/hub.ts` — store SSOT que unifica dados de providers (Jira/GitHub/GitLab/CTRF/legacy) e expõe `computed.*`. É a ÚNICA fonte de dados para renderers (EXECUTION-PLAN). |
| **computed.\*** | Objetos de derivação pura no DataHub (`computed.defectTrend`, `computed.coverageGaps`, etc.) — calculados uma vez, consumidos por muitos renderers. |
| **SSOT** | Single Source of Truth — regra: renderers leem dados de uma única origem (DataHub), nunca calculam próprios dados. Violação = defeito. |
| **AQS** | Artifact Quality Score — score de conformidade de conteúdo, `scripts/artifact-scorecard-runner.ts`. Atualmente valida só presença de nome de métrica, não veracidade (defeito). |
| **Oráculo** | Valor esperado em um teste. "Oráculo contaminado" = esperado copiado do output bugado (ex.: `0.0%` como valor correto, "SSOT deliberately disagrees"). |
| **hub-first** | Ordem de deleção: corrigir `hub.ts` (produtor) antes dos consumidores, para nunca haver estado intermediário inconsistente. |
| **Fixtures reais** | Dados de produção versionados (`reports/*/legacy.json`, `reports/2026-07-09/last-results.ctrf.json`) usados como input de teste. Nunca sintéticos. |
| **legacy.json** | Blob de métricas por projeto em `reports/<data>/legacy.json` — dados reais de runs de pipeline. |
| **CTRF** | Common Test Report Format — formato JSON de resultado de teste (ex.: `reports/2026-07-09/last-results.ctrf.json`). |
| **Determinismo** | Mesmo input → mesmo output (hash sha256 idêntico). `resolveGeneratedAt(seed)` é o mecanismo canônico de timestamp determinístico (ARTIFACT-VALIDATION D5). |
| **Insight** | Saída estruturada `generateXInsights(data): Insight[]` — contrato JSON validado por Zod. O HTML apenas renderiza insights; nunca os calcula. |
| **Grafo de contexto** | Modelo de informação: nós (Ticket/PR/Commit/File/Test/Bug) + arestas tipadas. Substitui relatórios isolados por navegação correlacional. |
| **G1–G5** | Invariantes do `ARCHITECTURE-CONTRACT.md` (entry points, CI gerado, layering `shared/`↛`git_triggers/`, scripts, segurança). |
| **Sobreviventes** | 8 dashboards que permanecem intactos: `release-score`, `defect-trend`, `defect-seasonality`, `developer-profile`, `backlog-health`, `impact-alert`, `incident-report`, `pipeline-cost`. |
| **Regra 19.11** | "RED do bug": escrever teste que reproduz o bug → commit do teste falhando → corrigir a IMPLEMENTAÇÃO → teste vira regressão. Nunca alterar o teste para passar. |

### 0.6 Mapa da Codebase

```
qa_tools/
├── git_triggers/              ENTRY POINTS de git (main.ts, cli-dispatch.ts, interactive-mode,
│                              schedule-handler.ts, batch-mode.ts)
│                              ← única camada autorizada a ter entry points (G1, G4)
├── jira_management/           Comandos CLI de Jira (main.ts, commands/case17/21/25/26/27.ts)
│                              ← entry points de Jira
├── shared/                    BIBLIOTECA PURA — NUNCA importa git_triggers/ (G3)
│   ├── data-hub/              SSOT: hub.ts (store), compute/* (derivações puras), providers,
│   │                          extractors, raw-merge, persistence
│   ├── report/                Renderers HTML (defect-trend-renderer.ts, flakiness-renderer.ts,
│   │                          report-html.ts, report-table.ts, report-sections.ts, ...)
│   ├── primitives/            Blocos compartilhados de baixo nível (traceability.ts, metrics, ...)
│   ├── insights/              NOVO (Fase 1): generateXInsights + schema Zod
│   ├── graph/                 NOVO (Fase 2): types/schema/builder/store/queries
│   ├── quality/               Gates (artifact-quality-gate.ts), health-score, coverage-gap
│   ├── types/                 Contratos (artifact-specs.ts, data-hub.ts)
│   └── pr-report-core.ts      Biblioteca pura do PR Report (G1 — entry point em git_triggers)
├── scripts/                   CI/harness: quality-check.ts:406-435, artifact-scorecard-runner.ts,
│                              artifact-validation-harness.ts, __fixtures__/artefactos/*
├── ui/                        NOVO (Fase 3): React + Vite SPA
├── reports/<data>/            DADOS REAIS: legacy.json, last-results.ctrf.json, *.html
├── setup/templates/           Templates de CI (G2 — CI é 100% gerado via ci-injector.ts)
└── .github/workflows/*.yml    CI — NUNCA editar manualmente (G2)
```

**Regras de layering aplicadas no plano:**
- `shared/` não importa `git_triggers/` (G3) — insights/grafo ficam em `shared/` e são consumidos por entry points em `git_triggers/` e `jira_management/`.
- Novo entry point `qa-tools ui` (F3.0) vive em `git_triggers/ui.ts` + `scripts/ui-server.ts`, nunca em `shared/` (G1, G4).
- Renderers NUNCA calculam dados (EXECUTION-PLAN + D1) — leem `computed.*` ou `Insight[]`.

### 0.7 Narrativa de racional (por que Path B vence Path A)

O `STRATEGIC-PLAN.md` (histórico) parte da premissa **"tudo implementado, testado, só não orquestrado"**. A auditoria **invalidou** essa premissa: os 24 artefatos existem e **produzem informação inválida** (5 classes de defeito, §0.1). Consequência lógica:

- **Path A (orquestração):** conectar/juntar artefatos quebrados = reproduzir o defeito em escala de plataforma. Corrige sintoma (isolamento) sem tocar a causa (validade dos dados).
- **Path B (grafo + insights):** corrige na origem. Cadeia: **dados reais → insight validado (contrato Zod) → render**. O grafo de contexto resolve a falha de descoberta/correlação estruturalmente (não "mais um dashboard"), e a camada de insights torna o dado testável por contrato.

Por isso D7: STRATEGIC-PLAN.md permanece como **visão de produto** (plataforma de inteligência QA), mas a **execução técnica** é o Path B, com as correções de causa raiz das 5 execuções fracassadas (oráculos, veracidade, dados reais, sem remendo incremental).

---

## 1. Visão de Consumo — Como o usuário acessa e consome (UX)

### 1.1 Personas e jobs-to-be-done

| Persona | Pergunta que quer responder | Modo de consumo |
|---------|----------------------------|-----------------|
| **Dev** | "O meu PR quebrou algo? Quais testes falharam e por quê?" | SPA: Ticket→PR→Commit→Test→Bug (≤1 clique por aresta) |
| **QA Lead** | "Estamos melhorando? Onde estão os gaps?" | SPA Insights + relatórios HTML empurrados |
| **PM** | "A release está pronta?" | Relatório HTML (release-score) + dashboard de tendência |

### 1.2 Modos de acesso

| Modo | Canal | Quando | Entrega |
|------|-------|--------|---------|
| **Push** | Relatórios HTML (já existente) | Schedule/CI | Leitura rápida, zero interação |
| **Pull** | **SPA novo** (`qa-tools ui`) | Sob demanda | Exploração correlacional pelo grafo |
| **API/JSON** | CLI + saídas JSON | Scripts/CI | Insights e grafo consumíveis programaticamente |

### 1.3 Arquitetura de informação do SPA

```
Home (visão geral: releases, tendência, top insights)
├── Releases   → score + breakdown → drill-down em tickets
├── Tickets    → lista → detalhe → PRs/Commits/Tests/Bugs relacionados
├── PRs        → commits, arquivos alterados, testes impactados, status CI
├── Tests      → flakiness histórico, resultados por run, bugs associados
├── Bugs       → tendência, seasonality, correlação com tickets
└── Insights   → lista com severidade + filtros + origem (artefato)
```

### 1.4 Contratos de UX (aceite em cada tarefa de UI)

| Contrato | Regra |
|----------|-------|
| UX-1 | **Dado real ou ausência explícita.** Nunca `0.0%`/placeholder para "sem dados" (AGENTS.md §25). Estado vazio ≠ estado de erro. |
| UX-2 | **Correlação ≤ 1 clique.** Toda entidade no grafo expõe suas arestas como navegação clicável. |
| UX-3 | **Determinismo.** Mesmo dado → mesmo render. `resolveGeneratedAt(seed)` em todo output. |
| UX-4 | **Deep-link por entidade.** URL estável: `/ticket/PAY-431`, `/pr/25`, `/test/TC-123`. |
| UX-5 | **Acessibilidade.** Contraste AA, navegação por teclado, `aria-label` em interações. |
| UX-6 | **Responsividade.** Desktop-first (densidade de dados); mobile lê sem quebrar. |
| UX-7 | **Estados.** loading (skeleton), erro (mensagem explícita + retry), vazio (sem dados + razão), dados. |
| UX-8 | **Sem emoji como semântica.** Ícones SVG (`shared/icons.ts` já existe). |

### 1.5 Anti-goals de UX

- Sem "dashboard por dashboard" adicionado ao menu (o menu atual será podado na Fase 0).
- Sem SPA substituindo os relatórios HTML push — são complementares.
- Sem busca semântica (embedding) antes da Fase 4 — busca por texto/ID basta.

---

## 2. Arquitetura-Alvo

```
┌─────────────────────────────────────────────────────┐
│  Fase 4 (postergável): Search semântico (Python)     │
├─────────────────────────────────────────────────────┤
│  Fase 3: SPA React (navegação por grafo + insights)  │
├─────────────────────────────────────────────────────┤
│  Fase 2: Graph Builder (JSON + índice in-memory)     │
├─────────────────────────────────────────────────────┤
│  Fase 1: Camada de Insights (TS) — generateXInsights │
│          Insight[] JSON + Zod schema (contrato)      │
├─────────────────────────────────────────────────────┤
│  DataHub (SSOT existente) — computed.* + providers   │
│  + dados reais (reports/*)                           │
└─────────────────────────────────────────────────────┘
```

### 2.1 Entidades e arestas (grafo)

| Entidade | Chave | Fonte |
|----------|-------|-------|
| Ticket | `key` (ex: PAY-431) | Jira |
| PR | `number` | GitHub |
| Commit | `sha` | git log |
| File | `path` | diff/blame |
| Test | `testId` | CTRF/legacy |
| Bug | `key` (Jira) | Defect Trend |

| Aresta | Direção | Origem |
|--------|---------|--------|
| `IMPLEMENTA` | Commit→PR, PR→Ticket | git/GitHub |
| `ALTERA` | Commit→File | diff |
| `COBRE` | Test→File | coverage |
| `FALHOU_EM` | Test→Run | CTRF/legacy |
| `GERA` | Run→Bug, Ticket→Bug | Defect Trend |
| `RELACIONADO_A` | Ticket→Ticket | Jira links |

---

## FORMATO DE TAREFA (obrigatório — AGENTS.md Regra 27)

Cada task contém:

- **Fase X.Y** — nome
- **Rationale**: por que esta tarefa existe; qual defeito corrige; evidência `file:line`
- **Arquivo(s)**: alteração exata
- **Mudança**: descrição concisa do que fazer
- **TDD (RED)**: teste que falha primeiro (obrigatório, Regra 19.9)
- **Critério de Aceitação**: verificação objetiva
- **Auditoria de Implementação**: verificação na codebase (não apenas testes) — comandos `rg`/`tsc`/`madge`/`depcruise`
- **Comando de Verificação**: comandos bash a executar
- **Testes**: arquivo(s) de teste a criar/atualizar
- **Commit**: mensagem conventional commit
- **Checkpoint**: fase só é completa quando o checkpoint é escrito em `dev/docs/plans/context-graph-insights-PROGRESS.md`

**Ordem de execução:** F0 → F1 → F2 → F3 → F4. Nenhuma fase adiantada. Cada tarefa verificada antes da próxima. Tarefa não concluída = fase não avançada.

---

## FASE 0 — Baseline e Saneamento

**Objetivo:** baseline verde documentado, fronteiras decididas, artefatos com defeito removidos na ordem hub-first, oráculos contaminados saneados. Pré-requisito absoluto para qualquer camada de insights.

### 0.1 — Baseline Verification

**Rationale:** sem um estado inicial verde documentado, qualquer defeito posterior é atribuível a esta reestruturação sem prova. O baseline é a evidência de "antes".

**Arquivo(s):** Nenhum (validação apenas)

**Mudança:** Executar e registrar os comandos de baseline. Falhas preexistentes são gaps a corrigir, não ignorar.

**Critério de Aceitação:** Todos os 8 comandos produzem saída documentada em `PROGRESS.md`. Nenhum erro inesperado.

**Auditoria de Implementação:** `git status` limpo; saída registrada com hash da HEAD.

**Comando de Verificação:**
```bash
npx tsc --noEmit 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
npm run lint 2>&1 | tail -5
npm run depcruise 2>&1 | tail -5
npm run unused-exports 2>&1 | tail -5
npm run type-coverage 2>&1 | tail -5
npm run no-swallow 2>&1 | tail -5
npm run audit-suppressions 2>&1 | tail -5
```

**Testes:** Nenhum (validação de build)

**Commit:** Nenhum (validação apenas)

---

### 0.2 — Decidir Fronteiras Pendentes (auto-registro no plano)

**Rationale:** três decisões foram identificadas como de autoridade do usuário (Regra 1 — nunca inferir). Como o plano precisa ser retomável, cada decisão é **escrita no próprio documento** (tabela abaixo), não só no PROGRESS.

**Arquivo(s):** `dev/docs/plans/context-graph-insights-plan.md` (tabela de fronteiras) + `PROGRESS.md`

**Mudança:** Resolver com o usuário (não inferir) e **registrar neste documento**:

| # | Pergunta | Opções | Decisão | Data | Autoridade |
|---|----------|--------|---------|------|------------|
| F-1 | `case17.ts` — o que sobrevive da remoção do `report-html`? | (a) manter auto-criação de bug + PR comment; (b) deletar inteiro | **(a)** — manter inteiro | 2026-08-05 | Usuário — "solução tecnicamente superior"; evidência: `report-html` é infra preservada (barrel `report-generator.ts` → `report-html.ts`), `case17.ts:12-38` importa só infra preservada + computeds sobreviventes; nenhum dos 9 deletados |
| F-2 | `pr-report` em CI — remoção total ou reconstrução? | (a) remover `qa-post-process.yml` + `PrReportFeatureConfig`; (b) reconstruir como insight F1.3 | **(b)** — reconstruir F1.3, manter CI + config | 2026-08-05 | Usuário — "solução tecnicamente superior"; evidência: D3 vinculante, specs 2025/2122/2164 permanecem, entry point único `main.ts pr-report` (G1) |
| F-3 | Lista final dos 12 — `pipeline-health` deletado e não reconstruído? | (a) sim, deletado; (b) reconstruir | **(a)** — deletado, não reconstruído | 2026-08-05 | Usuário — "solução tecnicamente superior"; evidência: todos os dados são computeds sobreviventes já consumidos por `impact-alerts.ts:23` e `interactive-mode.ts:637-655`; reconstrução = duplicação estrutural |

**Critério de Aceitação:** as 3 células "Decisão/Data/Autoridade" preenchidas na tabela acima. Sem isso, F0.2 não é completa.

**Auditoria de Implementação:** tabela refletida em §0.3 (marcador `✅` onde aplicável).

**Comando de Verificação:** Nenhum (decisão de autoridade)

**Testes:** Nenhum

**Commit:** `docs(plan): decidir fronteiras F0.2 (case17, pr-report CI, pipeline-health)`

---

### 0.3 — Refatorar `hub.ts` (remover fabricações; preservar cálculos)

**Rationale:** `hub.ts:932` chama `compareAiVsManual(null)` e `cross-squad.ts:22-26` chama `computeCrossSquadBenchmark(undefined)` — produzem placeholders em vez de dados (viola Rule 25). Remover na origem (hub) evita propagação a consumidores.

**Decisão confirmada (2026-08-05):** cálculos e campos `computed.*` **sobrevivem por padrão**; só renderers são deletados. Detalhes Q1–Q3 em `context-graph-insights-IMPACT-PLAN.md` §0.

**Arquivo(s):** `shared/data-hub/hub.ts`, `shared/data-hub/compute/index.ts`, `shared/data-hub/compute/cross-squad.ts`

**Mudança:**
- **PRESERVAR** todos os computes e campos `computed.*` (`aiMetrics`, `regressionDetection`, `optimizationActions`, `traceabilityTree`, `flakinessEntries` etc.) — nenhum field removido de `ComputedMetrics` sem evidência de duplicação.
- **REMOVER** fabricações no hub: import `:99` + `:932` `compareAiVsManual(null)` (campo `aiComparison` fica `undefined`); `:916` `computeCrossSquad(...)` (Q3 — wrapper deletado, campo `crossSquad` fica `undefined`).
- **MIGRAR** cálculos p/ compute layer (Q3 + princípio): `computeCrossSquadBenchmark`+`BENCHMARK_PROVENANCE` → `compute/cross-squad-benchmark.ts`; `compareAiVsManual` → `compute/ai-comparison.ts`; `calculateRequirementScores` → `compute/requirement-score.ts`.
- **DELETAR** wrapper `compute/cross-squad.ts` (fabrica vazio via `computeCrossSquadBenchmark(undefined)`).

**TDD (RED):** teste de arquitetura que falha se `hub.ts` importa `compareAiVsManual` ou `computeCrossSquad` (fabricações removidas).

**Critério de Aceitação:** `tsc` limpo; `rg "compareAiVsManual|computeCrossSquad\("` em `shared/` = 0 (exceto computeds migrados); todos os artefatos sobreviventes ainda consomem seus `computed.*`; campos `aiComparison`/`crossSquad` = `undefined`.

**Auditoria de Implementação:**
```bash
rg "compareAiVsManual\(|computeCrossSquad\(" shared/ | rg -v "__tests__" || echo "0 fabricações"
rg "computed\.(releaseScore|defectTrend|incidentEvents|backlogHealth|impactAlerts|pipelineCost|seasonality|developerProfile|aiMetrics|regressionDetection)" shared/report/ | wc -l
npx tsc --noEmit
```

**Comando de Verificação:**
```bash
npx vitest run shared/data-hub
npm run lint
```

**Testes:** `shared/data-hub/__tests__/hub-architecture.test.ts` (novo)

**Commit:** `refactor(datahub): remover fabricações e migrar cálculos p/ compute (F0.3)`

---

### 0.4 — Remover cases Jira (case25 deletar; case17/21/27 refatorar)

**Rationale:** `case25.ts` é wrapper puro do artefato `traceability` (deletado) — não tem função própria, deletar inteiro. `case17/21/27` têm função própria além do HTML (auto-criação de bug, CLI) — preservar a função, remover apenas o export HTML.

**Arquivo(s):** `jira_management/commands/case25.ts` (deletar), `case17.ts`, `case21.ts`, `case27.ts`

**Mudança:** `case25.ts` (traceability) deletado inteiro. `case17` mantém auto-criação de bug + PR comment (F-1: manter inteiro — nenhum import dos 9 deletados; `report-html` é infra preservada). `case21`/`case27` mantêm CLI própria, removem export HTML.

**TDD (RED):** para cada refactor, teste de CLI que falha antes.

**Critério de Aceitação:** casos não referenciam artefatos deletados; `case17/21/27` passam em seus testes; `case25` não existe mais.

**Auditoria de Implementação:**
```bash
rg "case25|traceability" jira_management/ | rg -v __tests__ || echo "0 refs"
rg "report-html|generatePrReportHtml" jira_management/commands/case17.ts
```

**Comando de Verificação:**
```bash
npx vitest run jira_management/commands/__tests__/case17-helpers.test.ts jira_management/commands/__tests__/case21.test.ts
```

**Testes:** testes existentes atualizados; novos casos de borda da CLI

**Commit:** `refactor(jira): case25 removido, case17/21/27 mantêm função própria (F0.4)`

---

### 0.5 — Podar orquestradores (interactive-mode, schedule-handler, batch-mode)

**Rationale:** os orquestradores são os consumidores que tornam os 9 artefatos deletados visíveis ao usuário (menu `interactive-mode.ts:702-723`, relatório semanal `schedule-handler.ts:216-296`). Sem poda, o usuário ainda navega para artefatos quebrados.

**Arquivo(s):** `git_triggers/interactive-mode.ts`, `git_triggers/schedule-handler.ts`, `git_triggers/batch-mode.ts`

**Mudança:** Remover handlers `_dashboard*` e entries de menu (interactive-mode:702-723) dos 9 deletados; remover 9 seções do relatório semanal (schedule-handler:216-296); remover `generateFlakinessDashboard`, `handlePipelineHealth`, `generatePrReportIfNeeded` (batch-mode).

**TDD (RED):** testes de menu/schedule que falham se entry de artefato deletado permanece.

**Critério de Aceitação:** menu expõe apenas os 8 sobreviventes; schedule não renderiza seções deletadas; batch-mode sem imports órfãos.

**Auditoria de Implementação:**
```bash
rg "ai-effectiveness|ai-comparison|cross-squad|traceability|flakiness|suite-optimization|silent-regression|requirement-score|pipeline-health" git_triggers/ | rg -v __tests__ || echo "0 refs"
```

**Comando de Verificação:**
```bash
npx vitest run git_triggers
npm run lint
```

**Testes:** testes existentes atualizados

**Commit:** `refactor(orchestrators): podar menu/schedule/batch dos artefatos deletados (F0.5)`

---

### 0.6 — Sanear scripts de CI e harness

**Rationale:** `scripts/quality-check.ts:406-435` falha o CI se um dashboard não está atualizado — mas referencia os 9 deletados. Sem saneamento, o CI bloqueia a própria reestruturação.

**Arquivo(s):** `scripts/quality-check.ts:406-435`, `scripts/artifact-scorecard-runner.ts`, `scripts/artifact-validation-harness.ts`

**Mudança:** Remover checks de dashboards deletados; scorecard passa a avaliar 8 sobreviventes + 3 reconstruídos (Fase 1); harness não renderiza artefatos deletados.

**TDD (RED):** teste do scorecard que falha se spec órfã permanece.

**Critério de Aceitação:** `npm run lint` (que executa quality-check) verde; scorecard sem specs órfãs.

**Auditoria de Implementação:**
```bash
rg "ai-effectiveness|ai-comparison|cross-squad|traceability|flakiness|suite-optimization|silent-regression|requirement-score|pipeline-health" scripts/ | rg -v __tests__ || echo "0 refs"
```

**Comando de Verificação:**
```bash
npm run lint
npx vitest run scripts/__tests__
```

**Testes:** testes do scorecard/harness atualizados

**Commit:** `refactor(ci): scorecard e harness avaliam apenas artefatos vigentes (F0.6)`

---

### 0.7 — Remover specs órfãs e fixtures sintéticas

**Rationale:** as specs em `shared/types/artifact-specs.ts` definem os artefatos; as 9 dos deletados são órfãs. Fixtures sintéticas em `scripts/__fixtures__/artefactos/*` foram a causa raiz (3) das execuções fracassadas — remover as dos deletados, preservar dados reais.

**Arquivo(s):** `shared/types/artifact-specs.ts`, `scripts/__fixtures__/artefactos/*`, `setup/templates/*`

**Mudança:** Remover as 9 specs dos deletados (IDs: ai-effectiveness 93, ai-comparison 207, traceability 496, flakiness 591, suite-optimization 867, cross-squad-benchmark 963, silent-regression 1152, requirement-score 1469, pipeline-health 1752). Remover fixtures sintéticas dos deletados. Specs de coverage-gap (1568) e pr-report (2025/2122/2164) **permanecem** para reconstrução.

**TDD (RED):** teste de schema que falha se spec órfã existe.

**Critério de Aceitação:** `artifact-specs.ts` contém apenas 8 sobreviventes + 3 reconstruídos + orquestradores; fixtures sintéticas de deletados não existem.

**Auditoria de Implementação:**
```bash
for id in ai-effectiveness ai-comparison traceability flakiness suite-optimization cross-squad-benchmark silent-regression requirement-score pipeline-health; do
  rg -l "'$id'" shared/types/artifact-specs.ts && echo "STILL EXISTS: $id"
done
ls scripts/__fixtures__/artefactos/ | rg "ai|traceability|flakiness|suite|cross-squad|silent|requirement|pipeline-health" || echo "0 synthetic fixtures"
```

**Comando de Verificação:**
```bash
npx vitest run shared/types
npx tsc --noEmit
```

**Testes:** testes de specs atualizados

**Commit:** `refactor(specs): remover specs/fixtures de artefatos deletados (F0.7)`

---

### 0.8 — Sanear oráculos contaminados e corrigir bugs de dados na origem

**Rationale:** `shared/__tests__/pr-report-core.test.ts:604-608` codifica "SSOT deliberately disagrees" como correto e `report-html.test.ts:232` fixou `0.0%` como valor esperado — oráculos que codificam bugs como features. Os bugs de dados estão em `shared/primitives/traceability.ts:75` (run mais antiga como base), `shared/report/flakiness-renderer.ts:40,86,247` (denominador cumulativo) e `shared/data-hub/compute/metrics-runs.ts:48` (newest-first).

**Arquivo(s):** `shared/__tests__/pr-report-core.test.ts:604-608`, `shared/__tests__/report-html.test.ts:232` e similares; implementações `traceability.ts`, `flakiness-renderer.ts`, `metrics-runs.ts`

**Mudança:** **Não alterar expectativas para passar.** Reescrever testes com oráculo derivado de requisito (Regra 19.3): pass rate = `passed/(passed+failed)`; sem `0.0%` como valor correto quando há testes; sem "SSOT deliberately disagrees". Corrigir os bugs **na implementação**.

**TDD (RED):** testes novos falham com implementação atual (provando o bug).

**Cláusula Regra 19.11 (RED do bug — ordem obrigatória):**
1. Escrever teste que **reproduz o bug** (falha com código atual)
2. **Commit do teste falhando** (RED)
3. Corrigir a **implementação** (nunca o teste)
4. Verificar verde (GREEN)
5. O teste permanece como regressão permanente
6. Proibido alterar expectativas para passar. Se o teste estiver genuinamente errado, provar com requisito (Regra 20).

**Critério de Aceitação:** nenhum teste no repo codifica valor incorreto como correto; bug de `0.0%`/run-antiga reproduzido e corrigido **na implementação** (`traceability.ts:75`, `flakiness-renderer.ts:40,86,247`, `metrics-runs.ts:48`).

**Auditoria de Implementação:**
```bash
rg "deliberately disagrees|0\.0%|SSOT" shared/__tests__/ | head
rg -n "getRecentPipelines|\[0\]" shared/data-hub/compute/metrics-runs.ts
```

**Comando de Verificação:**
```bash
npx vitest run shared/__tests__/pr-report-core.test.ts shared/__tests__/report-html.test.ts
```

**Testes:** reescritos com oráculo de requisito

**Commit:** `fix(metrics): corrijir run base e denominador de flakiness + sanear oráculos (F0.8)`

---

### ✅ CHECKPOINT: Fase 0 completa

Em `dev/docs/plans/context-graph-insights-PROGRESS.md`:
```markdown
<!-- CHECKPOINT: Fase 0 complete -->
- [ ] Baseline verde (8 comandos) em commit de registro
- [ ] F0.1–F0.8 executadas e auditadas (rg=0 por artefato deletado)
- [ ] Fronteiras F-1/F-2/F-3 registradas na tabela §0.2 (data + autoridade) — **feito 2026-08-05**
- [ ] Menu expõe 8 sobreviventes; schedule sem seções deletadas
- [ ] Specs: 8 sobreviventes + 3 reconstruídos
- [ ] Oráculos saneados (Regra 19.11: RED do bug → correção na origem); bugs de dados corrigidos
```

---

## FASE 1 — Camada de Insights (TS)

**Objetivo:** extrair `generateXInsights(data): Insight[]` de cada piloto, com Zod schema, determinismo e fixtures reais. HTML passa a consumir insights. **3 pilotos**: Defect Trend (🟢, base segura) → Coverage Gap (reconstrução) → PR Report (reconstrução). A ordem respeita a correção F0.8: nenhum piloto sobre dados que ainda contêm bugs.

### 1.0 — Contrato base `Insight`

**Rationale:** a separação insight→render só é válida se o insight tiver um contrato validável. Sem Zod schema + determinismo + rejeição de NaN/Infinity/null, o insight herda os defeitos dos renderers (Regra 24/25).

**Arquivo(s):** `shared/insights/types.ts`, `shared/insights/schema.ts`

**Mudança:** Definir tipo base `Insight` (id, severity, category, summary, detail, source, entities[], generatedAt determinístico) + schema Zod de validação (Regra 25: ausência → falha explícita, nunca silêncio).

**TDD (RED):** teste que valida contrato — insight malformado rejeitado pelo schema.

**Critério de Aceitação:** `schema.parse()` valida e rejeita; `resolveGeneratedAt(seed)` determinístico; NaN/Infinity/null rejeitados com mensagem explícita (Regra 24/25).

**Auditoria de Implementação:**
```bash
rg "export (type|interface) Insight" shared/insights/
rg "resolveGeneratedAt" shared/insights/
```

**Comando de Verificação:**
```bash
npx vitest run shared/insights
npx tsc --noEmit
```

**Testes:** `shared/insights/__tests__/schema.test.ts` (inclui property-based para NaN/Infinity/bounds, Regra 19.6)

**Commit:** `feat(insights): contrato base Insight + schema Zod determinístico (F1.0)`

---

### 1.1 — Piloto 1: `generateDefectTrendInsights`

**Rationale:** Defect Trend é o sobrevivente 🟢 (ROI positivo, sem defeito de dados) — piloto mais seguro para provar o padrão insight→render antes das reconstruções. Usa fixtures reais (`reports/*/legacy.json`), nunca sintéticas (causa raiz 3).

**Arquivo(s):** `shared/insights/defect-trend.ts` (novo)

**Mudança:** Extrair a lógica de agregação do `defect-trend` renderer para `generateDefectTrendInsights(store): DefectTrendInsight[]`. O renderer passa a consumir o insight (F1.4). Usar fixtures **reais** (`reports/*/legacy.json`), nunca sintéticas.

**TDD (RED):** teste com fixture real produz insight com contagens corretas (categoria × run).

**Critério de Aceitação:** insight JSON com shape validado por Zod; agregação conferida contra dados reais; nenhum `0.0%`/placeholder.

**Auditoria de Implementação:**
```bash
rg "generateDefectTrendInsights" shared/ | rg -v __tests__
rg "getTrends|defectAggregation" shared/insights/defect-trend.ts
```

**Comando de Verificação:**
```bash
npx vitest run shared/insights/defect-trend
npx tsc --noEmit
```

**Testes:** `shared/insights/__tests__/defect-trend.test.ts` (fixtures reais, shape Zod, determinismo)

**Commit:** `feat(insights): generateDefectTrendInsights com dados reais (F1.1)`

---

### 1.2 — Piloto 2: `generateCoverageGapInsights`

**Rationale:** Coverage Gap (spec 1568) é uma reconstrução: o defeito `undefined%` e o produtor duplo são corrigidos NA camada de dados (`shared/data-hub/compute/coverage-gap.ts`) antes de extrair o insight — nunca remendo no render.

**Arquivo(s):** `shared/insights/coverage-gap.ts` (novo), `shared/data-hub/compute/coverage-gap.ts`

**Mudança:** Reconstruir o cálculo de coverage-gap na camada de dados (corrigir `undefined%` e produtor duplo), depois extrair `generateCoverageGapInsights`. HTML atual passa a consumir o insight.

**TDD (RED):** teste com fixture real (`reports/2026-07-09/last-results.ctrf.json` + Jira mapping) produz gaps corretos; `undefined%` é falha, não valor válido.

**Critério de Aceitação:** porcentagens válidas em todos os casos; gaps por Epic com linked tests; ausência de dados → estado explícito, nunca `undefined%`.

**Auditoria de Implementação:**
```bash
rg "generateCoverageGapInsights" shared/ | rg -v __tests__
rg "undefined%" shared/ || echo "0 undefined%"
rg "coverage-gap" shared/data-hub/compute/
```

**Comando de Verificação:**
```bash
npx vitest run shared/insights/coverage-gap shared/data-hub/compute
npm run lint
```

**Testes:** `shared/insights/__tests__/coverage-gap.test.ts` (fixtures reais, property-based para bounds)

**Commit:** `feat(insights): generateCoverageGapInsights — corrige undefined% na origem (F1.2)`

---

### 1.3 — Piloto 3: `generatePrReportInsights`

**Rationale:** PR Report (specs 2025/2122/2164) é reconstruído com o oráculo de requisito (pass rate = `passed/(passed+failed)`), eliminando os 3 defeitos: multi-run corrompido, DOM inflado e placeholders. Depende da F0.8 (oráculos saneados).

**Arquivo(s):** `shared/insights/pr-report.ts` (novo)

**Mudança:** Reconstruir o PR Report como insight: pass rate por `passed/(passed+failed)` (oráculo de requisito), sem multi-run corrompido, sem DOM inflado (cap de seções), sem placeholders. Renderer HTML consome o insight.

**TDD (RED):** teste com dados reais do `pr-report.html` extraído (20 656 testes) e `legacy.json` — pass rate correto; seções com limite.

**Critério de Aceitação:** pass rate correto; nenhuma seção com >500 linhas sem cap explícito; nenhum placeholder; validado por Zod.

**Auditoria de Implementação:**
```bash
rg "generatePrReportInsights" shared/ | rg -v __tests__
rg "passed.*failed|passRate" shared/insights/pr-report.ts
```

**Comando de Verificação:**
```bash
npx vitest run shared/insights/pr-report
npx tsc --noEmit
```

**Testes:** `shared/insights/__tests__/pr-report.test.ts` (dados reais, oráculo de requisito)

**Commit:** `feat(insights): generatePrReportInsights — pass rate por requisito (F1.3)`

---

### 1.4 — Renderers consomem insights (migração)

**Rationale:** a migração prova a equivalência de contrato (Regra 10): se os testes de render (saneados em F0.8) permanecem verdes após a troca da fonte de dados para `shared/insights/`, o contrato público foi preservado. Auditoria G1: nenhum renderer calcula dados próprios.

**Arquivo(s):** `shared/report/defect-trend-renderer.ts`, `shared/report/coverage-gap-renderer.ts`, `shared/report/report-html.ts` (pr-report), `shared/report/flakiness-renderer.ts`

**Mudança:** Cada renderer recebe `Insight[]` (ou o objeto de insights) e renderiza. **Zero quebra de compatibilidade** com os consumidores atuais (mesma assinatura pública, apenas fonte de dados interna trocada para `shared/insights/`).

**TDD (RED):** testes de render existentes (corrigidos em F0.8) permanecem verdes com a migração — prova de equivalência de contrato (Regra 10).

**Critério de Aceitação:** todos os testes de render verdes após migração; nenhum renderer calcula dados próprios (auditoria G1: `rg` confirma que lê de `insights/`).

**Auditoria de Implementação:**
```bash
rg "compute|aggregate|calculate" shared/report/*-renderer.ts | rg -v "Insight|insight" || echo "0 lógica própria"
rg "shared/insights" shared/report/ | wc -l
```

**Comando de Verificação:**
```bash
npx vitest run shared/report
npm run lint
npm run depcruise
```

**Testes:** testes existentes de render atualizados

**Commit:** `refactor(renderers): HTML consome insights — zero quebra de contrato (F1.4)`

---

### 1.5 — Fixtures reais SSOT

**Rationale:** a causa raiz (3) das execuções fracassadas foi fixtures sintéticas. Consolidar dados reais como fixtures canônicas elimina a possibilidade de testes "teatro de cobertura" (Regra 19.10).

**Arquivo(s):** `shared/test-utils/fixtures/` (novo), loader com validação

**Mudança:** Consolidar dados reais como fixtures canônicas: `reports/*/legacy.json`, `reports/2026-07-09/last-results.ctrf.json`, `reports/c4-jira-mapping.json`, payload do PR Report real. Loader valida schema no load (extensão de `56d75e5a`).

**TDD (RED):** teste de loader — fixture malformada falha no load.

**Critério de Aceitação:** nenhum teste de insights usa fixture sintética; loader valida no load-time; fixtures versionadas.

**Auditoria de Implementação:**
```bash
rg "legacy.json|last-results.ctrf.json|c4-jira-mapping" shared/test-utils/fixtures/
rg "makeFlatTest|createFlatTest|fixture sint|synthetic" shared/insights/ || echo "0 sintéticas"
```

**Comando de Verificação:**
```bash
npx vitest run shared/test-utils
```

**Testes:** `shared/test-utils/__tests__/fixtures-loader.test.ts`

**Commit:** `test(fixtures): dados reais SSOT com loader validado (F1.5)`

---

### ✅ CHECKPOINT: Fase 1 completa

```markdown
<!-- CHECKPOINT: Fase 1 complete -->
- [ ] Contrato Insight + schema Zod + determinismo
- [ ] 3 pilotos com generateXInsights consumindo dados reais
- [ ] Renderers consomem insights (auditoria rg: 0 lógica própria)
- [ ] Fixtures reais SSOT; 0 sintéticas
- [ ] tsc + vitest + lint + depcruise verdes
```

---

## FASE 2 — Graph Builder

**Objetivo:** modelar o grafo de contexto (nós + arestas tipadas), construir a partir de fontes existentes (DataHub + Jira + GitHub + git log), persistir em JSON + índice in-memory (sem DB relacional — D6). PoC com dado real PAY-431 antes da construção geral.

### 2.0 — PoC: extração real do PAY-431

**Rationale:** antes de construir o builder geral, provar com um ticket real que as fontes existentes (Jira API, GitHub API, git log, coverage/legacy) produzem um grafo válido. A ausência de dado real no PoC repetiria a causa raiz (3).

**Arquivo(s):** `scripts/graph-poc.ts` (~200 linhas, novo)

**Mudança:** Script que (a) busca PAY-431 via API Jira, (b) PRs vinculados via API GitHub, (c) commits via `git log`, (d) arquivos via `git diff`, (e) testes via coverage/legacy — e gera `{nodes, edges}` JSON.

**TDD (RED):** teste do schema do grafo com o JSON real do PoC.

**Critério de Aceitação:** grafo do PAY-431 tem ≥1 nó de cada tipo com dados reais; arestas com direção e tipo validados.

**Auditoria de Implementação:**
```bash
node --import tsx/esm scripts/graph-poc.ts --ticket PAY-431 --out /tmp/opencode/graph-poc.json
node -e "const g=require('/tmp/opencode/graph-poc.json'); console.log(g.nodes.length, g.edges.length)"
```

**Comando de Verificação:**
```bash
npx vitest run shared/graph
```

**Testes:** `shared/graph/__tests__/schema.test.ts` (validação do JSON real do PoC)

**Commit:** `feat(graph): PoC de extração real do PAY-431 (F2.0)`

---

### 2.1 — Schema do grafo

**Rationale:** o schema é o contrato do grafo (nós/arestas tipadas, ids estáveis). Sem ele, o builder e a UI produzem estruturas divergentes — o mesmo defeito de contrato que causou as 5 execuções.

**Arquivo(s):** `shared/graph/types.ts`, `shared/graph/schema.ts`

**Mudança:** Tipos `Node` (union por entidade), `Edge` (tipo de aresta), `Graph` + Zod schemas de validação. Ids únicos estáveis (deep-link, UX-4).

**TDD (RED):** property-based: grafo com aresta apontando para nó inexistente rejeitado.

**Critério de Aceitação:** schema valida grafo real do PoC; rejeita grafo malformado com mensagem explícita.

**Auditoria de Implementação:**
```bash
rg "export type (Node|Edge|Graph)" shared/graph/
```

**Comando de Verificação:**
```bash
npx vitest run shared/graph
```

**Testes:** `shared/graph/__tests__/schema.test.ts` (property-based)

**Commit:** `feat(graph): schema de nós/arestas com validação Zod (F2.1)`

---

### 2.2 — Build do grafo a partir do DataHub

**Rationale:** o builder projeta dados já existentes (não cria conectores novos — D7). Entidades sem dados não geram nó fantasma; ausência é explícita (Regra 25).

**Arquivo(s):** `shared/graph/builder.ts`

**Mudança:** `buildGraph(store): Graph` que projeta computeds existentes (defect trends, coverage, releases) + dados de providers em nós/arestas. Nenhum novo conector (D7).

**TDD (RED):** teste com dados reais — projeção produz nós/arestas esperados.

**Critério de Aceitação:** grafo completo com todos os 6 tipos de entidade a partir de dados reais; entidades sem dados → ausência explícita, não nó fantasma.

**Auditoria de Implementação:**
```bash
rg "buildGraph" shared/graph/ | rg -v __tests__
rg "computed\.|getRecentPipelines|searchJiraIssues" shared/graph/builder.ts
```

**Comando de Verificação:**
```bash
npx vitest run shared/graph
```

**Testes:** `shared/graph/__tests__/builder.test.ts`

**Commit:** `feat(graph): builder projeta DataHub+providers no grafo (F2.2)`

---

### 2.3 — Persistência JSON + índice in-memory

**Rationale:** D6 proíbe DB relacional. JSON file + índice in-memory (`Map`) atende ao volume de dados atual (milhares de nós) com load-time validation — mesmo padrão das fixtures.

**Arquivo(s):** `shared/graph/store.ts`, `shared/graph/index.ts`

**Mudança:** Grafo serializado em JSON file(s); índice in-memory (`Map` por tipo/id) com lookup O(1); load-time validation (padrão já existente de fixtures). Sem DB relacional (D6).

**TDD (RED):** teste — grafo persiste e reload preserva identidade (nós/arestas idênticos).

**Critério de Aceitação:** round-trip JSON → índice → JSON idêntico; lookup de vizinhos por entidade correto.

**Auditoria de Implementação:**
```bash
rg "class GraphStore|adjacency|neighborsOf" shared/graph/
```

**Comando de Verificação:**
```bash
npx vitest run shared/graph
```

**Testes:** `shared/graph/__tests__/store.test.ts`

**Commit:** `feat(graph): store JSON + índice in-memory com load validado (F2.3)`

---

### 2.4 — Query API

**Rationale:** a UI (Fase 3) e o CLI consomem o grafo via queries. Sem `pathBetween`/`subgraph` com propriedades verificadas, a navegação correlacional (UX-2) não é implementável.

**Arquivo(s):** `shared/graph/queries.ts`

**Mudança:** `neighborsOf(id)`, `pathBetween(a,b)`, `subgraph(entity, depth)` — alimenta o SPA (Fase 3) e o CLI JSON.

**TDD (RED):** property-based — `pathBetween` retorna caminho válido (toda aresta consecutiva existe).

**Critério de Aceitação:** queries retornam dados reais do grafo; caminho sem conexão → estado explícito (não `[]` silencioso, Regra 25).

**Auditoria de Implementação:**
```bash
rg "neighborsOf|pathBetween|subgraph" shared/graph/
```

**Comando de Verificação:**
```bash
npx vitest run shared/graph
```

**Testes:** `shared/graph/__tests__/queries.test.ts` (property-based)

**Commit:** `feat(graph): query API (vizinhos, caminho, subgrafo) (F2.4)`

---

### ✅ CHECKPOINT: Fase 2 completa

```markdown
<!-- CHECKPOINT: Fase 2 complete -->
- [ ] PoC PAY-431 com dados reais validado
- [ ] Schema valida grafo real; rejeita malformado
- [ ] Builder projeta DataHub; store round-trip idêntico
- [ ] Query API com property-based
- [ ] tsc + vitest + lint verdes
```

---

## FASE 3 — SPA React (UI/UX)

**Objetivo:** SPA que consome o grafo + insights. **Esta fase é orientada pelos contratos UX §1.4.** Nenhum componente é escrito sem teste de comportamento (Regra 19.7 — testar lógica, não implementação).

### 3.0 — Server layer

**Rationale:** o SPA precisa de um servidor local que sirva dados reais (grafo/insights) e o estático. Entry point em `git_triggers/` (G1/G4), nunca em `shared/`.

**Arquivo(s):** `git_triggers/ui.ts`, `scripts/ui-server.ts` (novo)

**Mudança:** `qa-tools ui` inicia servidor local (http) que serve: SPA estático + endpoints `/api/graph`, `/api/insights`, `/api/entity/:type/:id`. Sem auth (local), sem rede externa.

**TDD (RED):** teste de integração — requisição GET `/api/graph` retorna grafo real.

**Critério de Aceitação:** endpoints servem dados reais do grafo/insights; erro de arquivo ausente → 500 explícito (nunca 200 vazio).

**Auditoria de Implementação:**
```bash
rg "createServer|/api/graph|/api/insights" git_triggers/ui.ts scripts/ui-server.ts
```

**Comando de Verificação:**
```bash
npx vitest run git_triggers/__tests__/ui-server.test.ts
npx tsc --noEmit
```

**Testes:** `git_triggers/__tests__/ui-server.test.ts`

**Commit:** `feat(ui): server layer com API do grafo e insights (F3.0)`

---

### 3.1 — Shell SPA + Home

**Rationale:** a Home é a primeira superfície de consumo (UX §1.3). Testa contra `/api/*` real (nunca mocks sintéticos — Regra 26) e implementa os 4 estados (UX-7).

**Arquivo(s):** `ui/` (React+Vite, novo), `ui/src/Home.tsx`

**Mudança:** Shell com navegação (Home/Releases/Tickets/PRs/Tests/Bugs/Insights, §1.3) + Home com visão geral: releases, tendência de defeitos, top insights. Estados UX-7 implementados (loading/erro/vazio/dados).

**TDD (RED):** teste de componente — Home renderiza dados reais; estado vazio ≠ erro (UX-1).

**Critério de Aceitação:** Home consuma `/api/*` real; skeleton no loading; mensagem explícita em erro; "sem dados" distinto de erro.

**Auditoria de Implementação:**
```bash
rg "Home" ui/src/
rg "fetch\('/api/" ui/src/
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/Home.test.tsx`

**Commit:** `feat(ui): shell SPA + Home com estados completos (F3.1)`

---

### 3.2 — Vista de Entidade (nó)

**Rationale:** é o consumo por entidade individual (UX-2/UX-4): deep-link estável e dados reais. A ausência de entidade deve ser estado explícito, nunca página em branco.

**Arquivo(s):** `ui/src/EntityView.tsx`

**Mudança:** `/ticket/:key`, `/pr/:number`, `/test/:id` — renderiza atributos da entidade (dados reais) + deep-link estável (UX-4).

**TDD (RED):** teste — entidade renderiza dados reais; entidade ausente → estado "não encontrado" explícito.

**Critério de Aceitação:** deep-link funciona por URL; dados reais renderizados; acessibilidade (UX-5: contraste, `aria-label`).

**Auditoria de Implementação:**
```bash
rg "useParams|/ticket/|/pr/" ui/src/EntityView.tsx
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/EntityView.test.tsx`

**Commit:** `feat(ui): vista de entidade com deep-link e acessibilidade (F3.2)`

---

### 3.3 — Vista de Correlação (arestas)

**Rationale:** é o coração do grafo: de um Ticket, navegar para PRs/Commits/Tests/Bugs relacionados em ≤1 clique (UX-2). Implementação inicial em lista (não canvas complexo) para manter testabilidade.

**Arquivo(s):** `ui/src/GraphView.tsx`, `ui/src/components/EdgeList.tsx`

**Mudança:** `neighborsOf(id)` → lista de entidades relacionadas clicável (UX-2, ≤1 clique entre entidades correlacionadas). Visual: lista (não canvas complexo na primeira iteração).

**TDD (RED):** teste — clique em aresta navega para entidade vizinha (lógica de navegação, não layout).

**Critério de Aceitação:** de um Ticket → PR → Commit → Test → Bug em ≤1 clique por aresta; todas as arestas clicáveis; teclado navega (UX-5).

**Auditoria de Implementação:**
```bash
rg "neighborsOf" ui/src/
rg "onClick|Link" ui/src/GraphView.tsx
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/GraphView.test.tsx`

**Commit:** `feat(ui): vista de correlação com navegação por arestas (F3.3)`

---

### 3.4 — Vista de Insights

**Rationale:** o consumo da camada de insights (Fase 1) na UI: lista com severidade, filtros e links para entidades (origem → entidades, UX-2).

**Arquivo(s):** `ui/src/InsightsView.tsx`

**Mudança:** Lista de `Insight[]` com severidade, filtros por categoria/artefato, link para entidades do insight (origem → entidades, UX-2).

**TDD (RED):** teste — filtro reduz lista corretamente; insight sem entidades ainda renderiza (ausência explícita).

**Critério de Aceitação:** filtros funcionam sobre dados reais; severidade destacada por cor (não emoji, UX-8); vazio ≠ erro (UX-1).

**Auditoria de Implementação:**
```bash
rg "Insight|severity|filter" ui/src/InsightsView.tsx
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/InsightsView.test.tsx`

**Commit:** `feat(ui): vista de insights com filtros e severidade (F3.4)`

---

### 3.5 — Busca por texto/ID

**Rationale:** busca textual sobre o índice in-memory (F2.3) resolve o caso de uso real de descoberta antes de qualquer embedding (D6). Sem resultados → estado vazio com sugestão, nunca silêncio (Regra 25).

**Arquivo(s):** `ui/src/SearchView.tsx`

**Mudança:** Busca por chave de ticket, número de PR, id de teste, caminho de arquivo — sobre o índice in-memory (F2.3). **Sem embeddings** (D6; Fase 4).

**TDD (RED):** teste — busca "PAY-43" retorna ticket real; sem resultados → estado vazio explícito com sugestão.

**Critério de Aceitação:** resultados reais; vazio ≠ erro; foco via teclado (UX-5).

**Auditoria de Implementação:**
```bash
rg "search|query" ui/src/SearchView.tsx shared/graph/index.ts
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/SearchView.test.tsx`

**Commit:** `feat(ui): busca por texto/ID sobre índice do grafo (F3.5)`

---

### 3.6 — Responsividade e acessibilidade (passada final)

**Rationale:** os contratos UX-5/UX-6 (a11y AA, responsividade) são obrigatórios (GOLDEN-REFERENCE §1). Auditoria automatizada (jest-axe) impede regressão silenciosa de acessibilidade.

**Arquivo(s):** `ui/src/**`, CSS tokens

**Mudança:** Auditar contratos UX-5/UX-6: contraste AA, foco visível, teclado completo, layout desktop-first + mobile legível.

**TDD (RED):** teste de acessibilidade (jest-axe ou similar) — violações de contraste/foco falham.

**Critério de Aceitação:** zero violações de a11y; layout não quebra em viewport móvel; todos os elementos interativos via teclado.

**Auditoria de Implementação:**
```bash
npx vitest run ui 2>&1 | rg "a11y|contrast|axe" | tail -5
```

**Comando de Verificação:**
```bash
npx vitest run ui
npm run lint
```

**Testes:** `ui/src/__tests__/a11y.test.tsx`

**Commit:** `feat(ui): passada de acessibilidade e responsividade (F3.6)`

---

### ✅ CHECKPOINT: Fase 3 completa

```markdown
<!-- CHECKPOINT: Fase 3 complete -->
- [ ] Server layer serve /api/graph e /api/insights
- [ ] Shell + Home + 5 vistas com dados reais
- [ ] Correlação ≤1 clique por aresta (UX-2)
- [ ] Deep-links estáveis (UX-4), a11y zero violações (UX-5), responsivo (UX-6)
- [ ] Estados loading/erro/vazio/dados (UX-7)
- [ ] vitest + lint verdes
```

---

## FASE 4 — Search Semântico (postergável, alto risco)

**Objetivo:** embeddings + busca por similaridade. **Decisão de go/no-go explícita** antes de iniciar (custo de dependência de LLM/embedding — risco alto, D6).

### 4.0 — Decisão de go/no-go

**Rationale:** Fase 4 introduz dependência de LLM/embedding (custo + risco). A decisão é de autoridade do usuário, baseada em evidência (grafo populado? busca textual insuficiente? caso de uso real?), nunca em inferência.

**Arquivo(s):** `dev/docs/plans/context-graph-insights-plan.md` (adição)

**Mudança:** Registrar decisão do usuário com base em: grafo populado? busca textual insuficiente? há caso de uso real? Autoridade do usuário, nunca inferência.

**Critério de Aceitação:** decisão registrada com data e justificativa não-especulativa.

**Testes:** Nenhum. **Commit:** `docs(plan): decisão go/no-go da Fase 4`

---

### 4.1 — Embeddings + índice vetorial (somente se go)

**Rationale:** busca por similaridade sobre descrições (tickets, commits). Threshold explícito impede resultado sem confiança de passar como relevante (Regra 24/25).

**Arquivo(s):** `shared/search/` (novo)

**Mudança:** Gerar embeddings dos nós (descrições de ticket, mensagens de commit), índice vetorial (hnsw ou similar), query por similaridade.

**TDD (RED):** teste — consulta em linguagem natural retorna entidade relevante com score threshold.

**Critério de Aceitação:** threshold explícito (Regra 24: NaN/Infinity rejeitados); resultados abaixo do threshold → ausência explícita (Regra 25).

**Auditoria de Implementação:**
```bash
rg "embedding|hnsw|vector" shared/search/
```

**Comando de Verificação:**
```bash
npx vitest run shared/search
```

**Testes:** `shared/search/__tests__/embedding.test.ts`

**Commit:** `feat(search): embeddings + índice vetorial (F4.1)`

---

### 4.2 — UI de busca semântica (somente se go)

**Rationale:** consumo da busca por similaridade na UI, com score visível (Regra 24: score sempre finito).

**Arquivo(s):** `ui/src/SemanticSearchView.tsx`

**Mudança:** Campo de busca em linguagem natural com resultados por similaridade + score visível.

**TDD (RED):** teste — query retorna resultado relevante; score exibido; vazio explícito.

**Critério de Aceitação:** UX-7 estados completos; score sempre finito (Regra 24).

**Auditoria de Implementação:**
```bash
rg "SemanticSearch|similarity|score" ui/src/
```

**Comando de Verificação:**
```bash
npx vitest run ui
```

**Testes:** `ui/src/__tests__/SemanticSearchView.test.tsx`

**Commit:** `feat(ui): busca semântica com score (F4.2)`

---

### ✅ CHECKPOINT: Fase 4 completa (condicional ao go)

```markdown
<!-- CHECKPOINT: Fase 4 complete -->
- [ ] Decisão go/no-go registrada
- [ ] (se go) embeddings + UI de busca semântica com threshold
```

---

## 3. Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Fase 1 reutiliza renderers quebrados | Média | F0.8 sana oráculos antes; F1 exige fixtures reais |
| Grafo sem dados reais suficientes | Média | F2.0 PoC real antes do builder geral; ausência explícita |
| UI consumindo dados errados | Alta | UI testada contra `/api/*` reais, nunca mocks sintéticos |
| SPA vira "mais um dashboard" | Média | Anti-goal UX: correlação, não acúmulo |
| Dependência de LLM na Fase 4 | Alta | go/no-go explícito; D6 adia até valor provado |
| Acoplamento F1–F2 | Média | F1 define contrato `Insight`; F2 consome, não redefine |
| Retomada por agente sem contexto | Média | §0.4–0.7 auto-contidos; Rationale em toda tarefa; F0.2 auto-registro |

---

## 4. Métricas de sucesso

| Métrica | Baseline | Fase 1 | Fase 3 |
|---------|----------|--------|--------|
| Pass rate correto (oráculo requisito) | 0% | 100% dos pilotos | 100% |
| Renderers sem lógica própria (auditoria rg) | — | 0 | 0 |
| Correlação ≤ 1 clique | manual | — | 100% das arestas |
| Dados reais como fixture | 0% | 100% dos testes de insights | 100% |
| Estados vazios explícitos | parcial | todos | todos |

---

## 5. Estimativa de esforço (referência, não autoridade)

> Regra 21: esforço nunca justifica decisão. Esta tabela é informativa para planejamento de alocação.

| Fase | Horas estimadas | Comentário |
|------|-----------------|------------|
| F0 — Baseline e Saneamento | ~14h | Deleção hub-first + saneamento de oráculos (maior parte: F0.8) |
| F1 — Camada de Insights | ~15h | 3 pilotos + contrato + migração renderers |
| F2 — Graph Builder | ~14h | PoC real + schema + builder + store + queries |
| F3 — SPA React/UX | ~25h | Maior bloco: 7 tarefas de UI + a11y (área nova no repo) |
| F4 — Search (condicional) | ~10h | Somente se go |
| **Total F0–F3** | **~68h** | ≈ 17–19 dias úteis a 4h/dia |
| **Total +F4** | **~78h** | ≈ 2 semanas a 8h/dia |

**Incertezas:** F3 (UI React) é a maior incerteza (área nova, auditoria a11y tende a estourar); decisões F0.2 podem abrir escopo; CI real (jobs) não incluído.
