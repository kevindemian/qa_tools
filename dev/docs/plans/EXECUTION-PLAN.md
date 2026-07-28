# Plano de Execução Consolidado

**Fontes consolidadas:**
1. Auditoria estrutural/estética (crisp-circuit-AUDIT-2026-07-24.md)
2. Especificação de conteúdo (CONTENT-SPECIFICATION.md)
3. Mapeamento DataHub gaps (CONTENT-SPECIFICATION.md §Mapeamento)

**Regra arquitetural:** TODOS os artefatos consomem dados EXCLUSIVAMENTE de DataHub. NENHUM calcula próprios dados. Se um dado não está no DataHub, implementar lá PRIMEIRO.

---

## FASE A — DataHub: Compute Modules e Enrichments

**Prerequisito:** Nenhum renderer pode ser implementado corretamente sem estes dados.

### A.1 Enrichments no Ingest Boundary

| # | Tarefa | Descrição | Afeta |
|---|--------|-----------|-------|
| A.1.1 | Enriquecer `FailureRecord` com `author` | Correlacionar `PipelineRun.head_commit.author.name` com test failures do run | developer-profile |
| A.1.2 | Enriquecer `raw.jiraIssues` com `linkedTestCount` | Contar testes linkados a cada issue Jira | backlog-health |

### A.2 Compute Modules

| # | Módulo | Descrição | Artefatos que consomem |
|---|--------|-----------|----------------------|
| A.2.1 | `compute/ai-metrics.ts` | acceptanceRate, byVersion, trend, scores | ai-effectiveness, ai-comparison, requirement-score |
| A.2.2 | `compute/defect-aggregation.ts` | Group by category, day, hour | defect-trend, defect-seasonality |
| A.2.3 | `compute/regression-detection.ts` | Z-score calculation | silent-regression |
| A.2.4 | `compute/optimization-actions.ts` | quarantine/split/parallelize decisions | suite-optimization |
| A.2.5 | `compute/traceability-tree.ts` | Epic→story→test join | traceability |
| A.2.6 | `compute/impact-alerts.ts` | Severity classification, alert generation | impact-alert |
| A.2.7 | `compute/incident-events.ts` | Failures, regressions, coverage gaps, seasonality | incident-report |
| A.2.8 | `compute/cross-squad.ts` | Multi-hub aggregation | cross-squad-benchmark |

### A.3 Correções de Consumo

| # | Tarefa | Descrição | Artefato |
|---|--------|-----------|----------|
| A.3.1 | Usar `computed.testCounts.total` | Renderer hardcodes totalTests=0 | flakiness |
| A.3.2 | Usar `computed.perRunCosts` | Barrel recalcula custo | pipeline-cost |
| A.3.3 | Usar `dataHub.timestamp` | Barrel gera timestamp local | todos |

---

## FASE B — Infraestrutura: Ícones

**Prerequisito:** Todos os HTML artifacts dependem disto.

### B.1 Instalar lucide + criar wrapper

| # | Tarefa | Descrição |
|---|--------|-----------|
| B.1.1 | `npm install lucide` | Adicionar dependência |
| B.1.2 | Criar `shared/icons.ts` | Wrapper: `icon(name, size?)` serializa para SVG inline. ~20 ícones: check-circle, x-circle, alert-triangle, refresh-cw, bar-chart-2, trending-up, clock, lock, lightbulb, settings, shield, book-open, file-text, search, cpu, info, help-circle, edit, calendar, package |
| B.1.3 | Criar `shared/__tests__/icons.test.ts` | Testar que todos os nomes de ícone retornam SVG válido |

### B.2 Substituir emojis em HTML renderers

| # | Arquivo | Qtd | Mapeamento |
|---|---------|-----|------------|
| B.2.1 | incident-report-renderer.ts | 8 | ❌→x-circle, 📈→trending-up, 📊→bar-chart-2, 📅→calendar, 🔴/🟡/🟢/⚪→circle (filled/outlined) |
| B.2.2 | release-score-renderer.ts | 2 | ✅→check-circle, ❌→x-circle |
| B.2.3 | ai-comparison-renderer.ts | 1 | ⚠️→alert-triangle |
| B.2.4 | traceability-renderer.ts | 1 | ⚠️→alert-triangle |
| B.2.5 | ai-effectiveness-renderer.ts | 0 | (raw badges → Badge primitive, sem emojis) |

### B.3 Substituir emojis em Markdown (pr-report-core.ts)

| # | Tarefa | Mapeamento |
|---|--------|------------|
| B.3.1 | Step summary | ✅→✓, ❌→✗, ⚠️→△, 📊→[stats], 📈→↑, ⏭→SKIP, ⏱→T, 📦→Σ, 📄→[link] |
| B.3.2 | PR comment | Mesmo mapeamento |
| B.3.3 | Quality gate markdown | 🛡→[QG], 🔒→LOCK, 💡→TIP, 🔧→CFG, 📖→REF, 🤖→AI |

---

## FASE C — Renderers Críticos (Broken/Incomplete)

### C.1 PR-Report HTML — buildQualityGateSection

**Problema:** 9,621 inline styles, zero data-* no body, sem primitives.

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.1.1 | Refatorar Quality Gate header | Substituir inline styles por Section + MetricGrid + MetricCard + Badge |
| C.1.2 | Refatorar dimension cards (5) | Substituir inline styles por Card primitive com data-severity + ProgressBar |
| C.1.3 | Refatorar methodology table | Substituir inline styles por DataTable primitive |
| C.1.4 | Adicionar data-dashboard="pr-report" | Wrapper com data-* attributes |

### C.2 PR-Report Markdown — Eliminar Duplicação

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.2.1 | Consolidar Summary + Quality Gate + Quality Gate Summary | 3 tabelas → 1 tabela resumo com todos os dados |
| C.2.2 | Adicionar "New Failures" section diferenciada | Seção separada para failures introduzidos pelo PR |
| C.2.3 | Usar RecommendedActions para ações | Substituir texto markdown libre por ações estruturadas |

### C.3 traceability-renderer — Migração Completa

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.3.1 | Substituir raw span por Badge primitive | `buildStatusBadge` → `Badge({ variant, children })` |
| C.3.2 | Substituir buildHealthBar por ProgressBar primitive | Remover função manual, usar `ProgressBar({ value, max, color })` |
| C.3.3 | Migrar classes CSS para data-* | `.epic-node` → `data-component="epic"`, `.story-node` → `data-component="story"`, remover classes antigas |
| C.3.4 | Migrar inline JS onclick para event delegation | Script no final do HTML com `addEventListener` em vez de `onclick` |

### C.4 incident-report-renderer — SeverityBadge

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.4.1 | Substituir SeverityBanner por SeverityBadge primitive | Usar `SeverityBadge({ severity })` do barrel de primitives |
| C.4.2 | Remover emojis de eventTypeToLabel | Usar `icon()` em vez de ❌📈📊📅 |

### C.5 release-score-renderer — Null Guard

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.5.1 | Tornar tipo param nullable | `ReleaseScoreResult | null | undefined` |
| C.5.2 | Adicionar null guard com EmptyState | `if (!result) return EmptyState({...})` |

### C.6 PR-Report Testes — Reescrever

| # | Tarefa | Descrição |
|---|--------|-----------|
| C.6.1 | Remover mocks de health-score, quality-gate, report-html | Manter mocks apenas para GitHub API e filesystem |
| C.6.2 | Criar teste end-to-end compute→render→HTML | Dados reais do DataHub → valida HTML output |
| C.6.3 | Corrigir mock shapes | `HealthScoreResult` mock deve match production type |

---

## FASE D — Conteúdo: Consumir Dados DataHub

Cada renderer atualiza para consumir os novos compute modules do DataHub (Fase A).

### D.1 Renderers com Gaps de Conteúdo

| # | Artefato | Mudanças | Ref. Content Spec |
|---|----------|----------|-------------------|
| D.1.1 | ai-effectiveness | Consumir `computed.aiMetrics`, exibir timestamp, thresholds nos cards | §1 |
| D.1.2 | ai-comparison | Consumir `computed.aiMetrics`, padronizar formato %, thresholds | §2 |
| D.1.3 | incident-report | Consumir `computed.incidentEvents`, timestamp, per-type count, thresholds | §3 |
| D.1.4 | impact-alert | Consumir `computed.impactAlerts`, timestamp, thresholds nos cards | §4 |
| D.1.5 | traceability | Consumir `computed.traceabilityTree`, thresholds nos cards | §5 |
| D.1.6 | flakiness | Consumir `computed.testCounts.total` (corrigir bug), timestamp, thresholds | §6 |
| D.1.7 | backlog-health | Consumir `raw.jiraIssues` com `linkedTestCount`, timestamp, thresholds | §7 |
| D.1.8 | pipeline-cost | Consumir `computed.perRunCosts` diretamente, timestamp, thresholds | §8 |
| D.1.9 | suite-optimization | Consumir `computed.optimizationActions`, timestamp, savings column | §9 |
| D.1.10 | cross-squad-benchmark | Consumir `computed.crossSquad`, timestamp, thresholds | §10 |
| D.1.11 | release-score | Já consome DataHub corretamente, adicionar threshold hints | §11 |
| D.1.12 | silent-regression | Consumir `computed.regressions`, timestamp, thresholds | §12 |
| D.1.13 | defect-trend | Consumir `computed.defectAggregation`, timestamp, trend badge | §13 |
| D.1.14 | defect-seasonality | Consumir `computed.defectAggregation`, timestamp, avg/day | §14 |
| D.1.15 | developer-profile | Consumir `raw.failureRecords` com `author`, timestamp, ranking | §15 |
| D.1.16 | requirement-score | Consumir `computed.aiMetrics.scores`, timestamp, thresholds | §16 |

---

## FASE E — Estética: Limpeza Estrutural

### E.1 Remover Inline Styles Redundantes dos Primitives

20+ instâncias que já têm CSS equivalente em report-styles.ts.

| Primitive | Arquivo | Inline Style Redundante |
|-----------|---------|------------------------|
| Container | layout.ts | `style="background:var(--color-surface-card)"` (card variant) |
| Section | layout.ts | `style="box-shadow:..."` (card variant) |
| Card | card.ts | `style="border:..."`, `style="border-left:..."` |
| MetricCard | card.ts | `style="color:..."` |
| CardGrid | card.ts | `style="display:grid"` |
| MetricGrid | card.ts | `style="display:flex"` |
| Badge | badge.ts | `style="background:...;color:..."` (variant-specific) |
| Tr | table.ts | `style="cursor:pointer"` |
| DataTable | table.ts | `style="width:..."`, `style="text-align:..."` |

**Nota:** Estes inline styles só podem ser removidos AFTER os testes de primitives serem atualizados para validar por CSS classes em vez de inline styles.

### E.2 Atualizar Testes de Primitives

| # | Tarefa | Descrição |
|---|--------|-----------|
| E.2.1 | Atualizar testes para validar data-* attributes | Em vez de `toContain('display:grid')`, validar `toContain('data-component="grid"')` |
| E.2.2 | Atualizar testes de Badge | Validar `data-variant` em vez de `style="background:..."` |
| E.2.3 | Atualizar testes de Card | Validar `data-severity` em vez de `style="border-left:..."` |

### E.3 CSS por Dashboard

| # | Dashboard | CSS Necessário |
|---|-----------|---------------|
| E.3.1 | ai-effectiveness | Tabelas de versão e tendência |
| E.3.2 | flakiness | Seção source-quality |
| E.3.3 | backlog-health | Lista de issues |
| E.3.4 | incident-report | Seção de severidade |
| E.3.5 | impact-alert | Cards de alerta |
| E.3.6 | traceability | Árvore, nós, hover states |
| E.3.7 | ai-comparison | Seção de vantagem |
| E.3.8 | release-score | Seção de score |
| E.3.9 | silent-regression | Tabela de dados |

### E.4 Validação Visual

| # | Tarefa | Descrição |
|---|--------|-----------|
| E.4.1 | Abrir cada dashboard no browser | Verificar renderização visual |
| E.4.2 | Verificar dark mode | Toggle e verificar contraste |
| E.4.3 | Verificar responsive | Mobile/tablet/desktop |
| E.4.4 | Verificar print | Ctrl+P em cada dashboard |
| E.4.5 | Verificar acessibilidade | Contraste WCAG AA, navegação por teclado |

---

## FASE F — Documentação

| # | Tarefa | Descrição |
|---|--------|-----------|
| F.1 | Atualizar TECHDOC diagrama | Adicionar camada primitives e renderers |
| F.2 | Atualizar TECHDOC MODULE MAP | Adicionar shared/primitives/ |
| F.3 | Documentar 9 critérios de qualidade | Seção dedicada no TECHDOC |
| F.4 | Atualizar 11-pr-report.md | Nota sobre compute/render separation |
| F.5 | Atualizar 08-fluxos-completos.md | Referência nova arquitetura |
| F.6 | Criar HTML-CSS-HOOKS-AUDIT.md | Auditoria de todos os hooks |

---

## FASE G — Auditoria Final

**Objetivo:** Verificar que TUDO o que foi planejado foi efetivamente implementado, que TODAS as funções estão conectadas e funcionando, e que o código final está conforme o plano. Esta fase NÃO é apenas rodar testes — é uma auditoria completa de integridade.

### G.1 Cobertura do Plano (tudo que foi planejado foi implementado?)

| # | Tarefa | Verificação |
|---|--------|-------------|
| G.1.1 | Auditoria Fase A | Para cada compute module (A.2.1-A.2.8), verificar: arquivo existe, exporta função compute, testes existem e passam, barrel re-exporta |
| G.1.2 | Auditoria Fase B | Verificar: `shared/icons.ts` existe e exporta `icon()`, 0 emojis Unicode restantes em renderers, 0 emojis em Markdown |
| G.1.3 | Auditoria Fase C | Para cada renderer crítico (C.1-C.5): verificar inline styles = 0 (exceto dinâmicos), data-* attributes presentes, primitives usadas corretamente |
| G.1.4 | Auditoria Fase D | Para cada um dos 16 renderers: verificar que todos os campos obrigatórios do Content Specification estão presentes no HTML gerado |
| G.1.5 | Auditoria Fase E | Verificar: 0 inline styles redundantes em primitives, CSS por dashboard presente em report-styles.ts, validação visual documentada |
| G.1.6 | Auditoria Fase F | Verificar: TECHDOC atualizado, pr-report.md atualizado, fluxos.md atualizado, HOOKS-AUDIT.md existe |

### G.2 Conexões e Integração (funções conectadas de ponta a ponta)

| # | Tarefa | Verificação |
|---|--------|-------------|
| G.2.1 | Barrel exports | Cada barrel re-exporta compute + render. Nenhum barrel importa html-factory ou report-styles |
| G.2.2 | Menu connections | `schedule-handler.ts` e `interactive-mode.ts` importam de barrels (não de renderers diretamente) |
| G.2.3 | DataHub consumption | Cada renderer consome dados de `dataHub.computed.*` ou `dataHub.raw.*`. Nenhum renderer calcula dados próprios |
| G.2.4 | Type contracts | Interface de retorno de cada compute module é compatível com o que o renderer espera consumir |
| G.2.5 | Config access | Thresholds vêm de `config-accessor.ts`, não hardcoded em renderers |

### G.3 End-to-End: Funcionalidade Completa

| # | Tarefa | Verificação |
|---|--------|-------------|
| G.3.1 | CLI → Compute → Render → HTML | Rodar cada dashboard via CLI, gerar HTML, verificar que o arquivo é válido |
| G.3.2 | PR Report completo | Rodar post-process com dados reais, verificar: step summary markdown válido, HTML artifact gerado, PR comment postado |
| G.3.3 | Dark mode | Cada dashboard: toggle dark mode, verificar que todos os elementos são visíveis com contraste adequado |
| G.3.4 | Responsive | Cada dashboard: verificar mobile (< 600px), tablet (600-768px), desktop (> 768px) |
| G.3.5 | Print | Cada dashboard: Ctrl+P, verificar que elementos de controle são ocultos e conteúdo é legível |
| G.3.6 | Empty states | Cada dashboard: verificar comportamento quando dados estão vazios |
| G.3.7 | Acessibilidade | Verificar contraste WCAG AA, navegação por teclado, screen reader labels |

### G.4 Integridade do Código

| # | Tarefa | Verificação |
|---|--------|-------------|
| G.4.1 | Typecheck | `npx tsc --noEmit` — 0 erros |
| G.4.2 | Lint | `npm run lint` — todos os checks passam |
| G.4.3 | Testes unitários | `npx vitest run` — 100% pass |
| G.4.4 | Testes de integração | `npx vitest run shared/__tests__/integration/` — 100% pass |
| G.4.5 | Imports circulares | Nenhum renderer importa outro renderer. Nenhum barrel importa renderer |
| G.4.6 | Zero inline styles redundantes | Nenhum primitive tem inline style que já tem CSS equivalente |
| G.4.7 | Zero emojis | Nenhum Unicode emoji em nenhum renderer HTML ou Markdown |
| G.4.8 | Zero catches vazios | TODO catch block loga causa, correção e capacidade de retomada |
| G.4.9 | Zero mocks internos | Nenhum teste mocka lógica de negócio (apenas infraestrutura: API, filesystem) |
| G.4.10 | Coverage | Cobertura ≥ floor definido em quality-check.ts |

### G.5 Conformidade com o Plano Original

| # | Tarefa | Verificação |
|---|--------|-------------|
| G.5.1 | Fase 0 (gentle-squid) | `report-data.ts` existe com SectionResult e DashboardData |
| G.5.2 | Fase 1 (gentle-squid) | 7 report renderers extraídos, barrels corretos |
| G.5.3 | Fase 2 (gentle-squid) | 9 quality renderers extraídos, barrels corretos |
| G.5.4 | Fase 3 (html-quality) | 9 critérios de qualidade atendidos em todos os 16 renderers |
| G.5.5 | Fase 4 (css-quality) | CSS por dashboard, data-* selectors, responsive, print |
| G.5.6 | Fase 5 (gentle-squid) | Orquestradores usam barrel imports |
| G.5.7 | Fase 6 (gentle-squid) | Validação completa |
| G.5.8 | Fase 7 (gentle-squid) | Sanitização: 0 emojis, 0 deadcode, 0 circular imports |
| G.5.9 | Fase 8 (gentle-squid) | Documentação completa: TECHDOC, pr-report, fluxos |
| G.5.10 | Content Specification | 16 artefatos atendem todos os campos obrigatórios |
| G.5.11 | DataHub gaps | 10 gaps (G1-G10) implementados, 3 gaps de consumo (C1-C3) corrigidos |
| G.5.12 | Ícones | Lucide npm instalado, icons.ts criado, 0 emojis Unicode |

### G.6 Entrega

| # | Tarefa | Descrição |
|---|--------|-----------|
| G.6.1 | Gerar relatório de auditoria | Documento com resultado de cada item G.1-G.5 |
| G.6.2 | Commit final | Commit com mensagem descrevendo o escopo completo |
| G.6.3 | Push | Push com `gh` timeout >= 300s |
| G.6.4 | Monitorar CI | Verificar que todos os jobs passam |

---

## ORDEM DE EXECUÇÃO

```
FASE A (DataHub)          ← PREREQUISITO para C, D
  A.1 Enrichments         ← Ingest boundary (FailureRecord.author, jiraIssues.linkedTestCount)
  A.2 Compute modules     ← 8 novos módulos
  A.3 Correções consumo   ← 3 fixes

FASE B (Ícones)           ← PARALELA com A
  B.1 lucide + icons.ts   ← Setup
  B.2 Emojis HTML         ← 5 arquivos
  B.3 Emojis Markdown     ← pr-report-core.ts

FASE C (Renderers)        ← DEPOIS de A + B
  C.1 PR-Report HTML      ← buildQualityGateSection
  C.2 PR-Report Markdown  ← Eliminar duplicação
  C.3 traceability        ← Migração completa
  C.4 incident-report     ← SeverityBadge
  C.5 release-score       ← Null guard
  C.6 Testes PR-Report    ← Reescrever

FASE D (Conteúdo)         ← DEPOIS de A
  D.1-16 Renderers        ← Cada um consome novos computed metrics

FASE E (Estética)         ← DEPOIS de C + D
  E.1 Remover inline      ← primitives
  E.2 Atualizar testes    ← primitives
  E.3 CSS por dashboard   ← 9 dashboards
  E.4 Validação visual    ← browser, dark, responsive, print, a11y

FASE F (Documentação)     ← PARALELA com E
  F.1-F6 Docs             ← TECHDOC, pr-report, fluxos

FASE G (Auditoria)        ← DEPOIS de TUDO (A-F)
  G.1 Cobertura do plano  ← Verificar que tudo planejado foi implementado
  G.2 Conexões            ← Funções conectadas de ponta a ponta
  G.3 End-to-end          ← Funcionalidade completa funcionando
  G.4 Integridade código  ← Typecheck, lint, testes, coverage
  G.5 Conformidade plano  ← Alinhamento com gentle-squid + html-quality + css-quality
  G.6 Entrega             ← Relatório, commit, push, CI
```

**Paralelismo possível:**
- A + B (simultâneas)
- C.1 + C.2 + C.3 + C.4 + C.5 (simultâneas, independentes)
- D.1-D.16 (simultâneas, independentes)
- E.3 + F (simultâneas)

**Bloqueios:**
- C.6 (testes) bloqueado por C.1-C.5 (código primeiro)
- E.1-E.2 (remover inline) bloqueado por E.3 (testes primeiro)
- D bloqueado por A (DataHub primeiro)
- G bloqueado por A+B+C+D+E+F (auditoria é a ÚLTIMA fase)
