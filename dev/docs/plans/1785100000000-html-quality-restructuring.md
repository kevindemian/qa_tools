# FASE 3: Restructuracao de Qualidade HTML + Coordenacao CSS

**Plano master:** `.mimocode/plans/1784726095802-gentle-squid.md`
**Continuacao natural:** `.mimocode/plans/1785100000001-css-quality-restructuring.md` (FASE 4)

## Contexto

9 renderers ja foram extraidos (FASE 1 + 2.1-2.2). Esta fase reestrutura cada renderer para atender 9 criterios de qualidade e prepara os hooks HTML que a fase CSS consumira.

**Autorizacao:** "Tempo e esforco NAO sao variaveis. Considere APENAS superioridade tecnica e seguranca."

**Criterios de Qualidade (9):**
1. Util - Conteudo relevante para QA
2. Correto - Calculos preservados
3. Adequado - Conteudo corresponde ao proposito
4. Completeness - Estatisticas resumo presentes
5. Legibilidade - HTML semantico (section, article, caption, th scope)
6. Sem poluicao - Sem dados redundantes
7. Arquitetura - Primitives reutilizadas (DataTable, MetricCard, Card)
8. Dados ausentes visiveis - Empty states com explicacao + acao
9. Acao recomendada - Achados criticos com proxima acao explicita

**Convencao de Hooks CSS (data-* attributes):**
```
data-dashboard="[report-type]"    -> Container raiz
data-section="[section-role]"     -> Secoes semanticas
data-part="[sub-part]"            -> Sub-elementos (ja existe nos primitives)
data-empty-state="[reason]"       -> Razao do estado vazio
data-action="[action-type]"       -> Acao recomendada
data-component="[primitive-name]" -> Ja existe nos primitives
data-severity="[level]"           -> Ja existe nos primitives
data-variant="[variant]"          -> Ja existe nos primitives
```

---

## FASE 3.0: Definir Contrato HTML-CSS

### Tarefa 3.0.1: Criar documentacao de convencao de hooks

**Arquivo a criar:** `dev/docs/internal/HTML-CSS-HOOKS.md`

**Conteudo:** Tabela de todos os data-* attributes que o HTML expoe para o CSS consumir.

**Commit:** `docs: define HTML-CSS hook convention for report quality restructuring`

---

## FASE 3.10: Novos Primitives (ANTES dos renderers)

### Tarefa 3.10.1: Criar EmptyState primitive

**Arquivo a criar:** `shared/primitives/empty-state.ts`

**Interface:**
```typescript
export interface EmptyStateProps {
    title: string;
    description: string;
    action?: string;
    icon?: string;
    role?: string;
    ariaLabel?: string;
}
export function EmptyState(props: EmptyStateProps): string;
```

**HTML gerado:**
```html
<div data-component="empty-state" role="region" aria-label="[title]"
     style="text-align:center;padding:48px 24px;background:var(--color-surface-card);border-radius:8px">
  <div data-part="icon" style="font-size:48px;margin-bottom:16px;opacity:0.6">[icon]</div>
  <div data-part="title">[title]</div>
  <div data-part="description">[description]</div>
  <div data-part="action" data-action="guidance">[action]</div>
</div>
```

**Verificacao:** `npx tsc --noEmit` - 0 erros

**Commit:** `feat(primitives): add EmptyState component`

---

### Tarefa 3.10.2: Criar RecommendedActions primitive

**Arquivo a criar:** `shared/primitives/recommended-actions.ts`

**Interface:**
```typescript
export interface RecommendedAction {
    severity: 'error' | 'warn' | 'info';
    text: string;
}
export interface RecommendedActionsProps {
    actions: RecommendedAction[];
    title?: string;
    role?: string;
    ariaLabel?: string;
}
export function RecommendedActions(props: RecommendedActionsProps): string;
```

**Commit:** `feat(primitives): add RecommendedActions component`

---

### Tarefa 3.10.3: Atualizar barrel de primitives

**Arquivo a modificar:** `shared/primitives/index.ts`

Adicionar exports de EmptyState e RecommendedActions.

**Commit:** `feat(primitives): export EmptyState and RecommendedActions`

---

## FASE 3.1: ai-effectiveness-renderer (Prioridade MAXIMA)

**Arquivo:** `shared/report/ai-effectiveness-renderer.ts`
**Problemas:** 5 ausentes, 1 parcial

### Tarefa 3.1.1: Substituir buildMetricLarge por MetricCard/MetricGrid

**Linha 49-55 (atual):** div manual com inline styles
**Novo:** MetricGrid com MetricCard

**Imports a adicionar:** `MetricCard, MetricGrid, Section, DataTable` de `../primitives/index.js`

---

### Tarefa 3.1.2: Substituir buildVersionTable manual por DataTable

**Linha 57-78 (atual):** Tabela manual com inline styles
**Novo:** DataTable com columns/rows + caption

---

### Tarefa 3.1.3: Substituir buildTrendTable manual por DataTable

**Linha 80-101 (atual):** Tabela manual com inline styles
**Novo:** DataTable com columns/rows + caption

---

### Tarefa 3.1.4: Melhorar empty state (criterio 8)

**Linha 24-25 (atual):** `<p>No AI generation data available</p>`
**Novo:** EmptyState com title, description, action

---

### Tarefa 3.1.5: Adicionar secao de acao recomendada (criterio 9)

Apos a tabela de tendencia, adicionar RecommendedActions.

---

### Tarefa 3.1.6: Envolver em Section semantico

Container com data-dashboard="ai-effectiveness", cada sub-secao com data-section.

**Commit:** `refactor(ai-effectiveness): restructure HTML with semantic primitives and quality criteria`

---

## FASE 3.2: flakiness-renderer

**Arquivo:** `shared/report/flakiness-renderer.ts`
**Problemas:** Tabela manual (36-77), inline JS handlers, sem empty state guidance, sem acao recomendada

### Tarefa 3.2.1: Substituir buildFlakinessTable por Tr/Td/Th

Tabela tem celulas complexas (Badge + Sparkline) -> usa Tr/Td/Th (baixo nivel).
Adicionar caption e scope.

### Tarefa 3.2.2: Remover inline JS handlers (onmouseover/onmouseout)

Os primitives Tr ja cuidam disso.

### Tarefa 3.2.3: Mover FLAKINESS_CSS para data-* attributes

Secao source-quality com data-section="source-quality".

### Tarefa 3.2.4: Melhorar empty state

Quando high.length === 0, mostrar EmptyState com descricao e acao.

### Tarefa 3.2.5: Adicionar acao recomendada

RecommendedActions para flaky tests.

**Commit:** `refactor(flakiness): restructure HTML with DataTable primitives and quality criteria`

---

## FASE 3.3: backlog-health-renderer

**Arquivo:** `shared/report/backlog-health-renderer.ts`
**Problemas:** Density table manual (114-133), sem buildHtmlPage wrapper, sem empty state, issue list manual

### Tarefa 3.3.1: Adicionar buildHtmlPage wrapper

Retornar pagina completa (consistente com outros renderers).

### Tarefa 3.3.2: Substituir buildDensityTable por DataTable

### Tarefa 3.3.3: Substituir buildIssueListCapped por lista semantica

Usar ul/li com data-component="issue-list".

### Tarefa 3.3.4: Adicionar empty state e error handling

### Tarefa 3.3.5: Envolver tudo em Section semantico

**Commit:** `refactor(backlog-health): add buildHtmlPage wrapper, DataTable, semantic HTML, quality criteria`

---

## FASE 3.4: incident-report-renderer

**Arquivo:** `shared/report/incident-report-renderer.ts`
**Problemas:** Severity badge manual (45-52), sem acao recomendada, sem empty state guidance

### Tarefa 3.4.1: Substituir severity badge manual por SeverityBadge

### Tarefa 3.4.2: Melhorar empty state

### Tarefa 3.4.3: Adicionar acao recomendada por evento

### Tarefa 3.4.4: Envolver em Section semantico

**Commit:** `refactor(incident-report): replace manual badge, add actions, semantic HTML`

---

## FASE 3.5: impact-alert-renderer

**Arquivo:** `shared/report/impact-alert-renderer.ts`
**Problemas:** Ja tem recommendation (criterio 9 OK), mas sem empty state guidance

### Tarefa 3.5.1: Melhorar empty state

### Tarefa 3.5.2: Adicionar data-* hooks e Section wrapper

**Commit:** `refactor(impact-alert): improve empty state, add semantic HTML hooks`

---

## FASE 3.6: traceability-renderer

**Arquivo:** `shared/report/traceability-renderer.ts`
**Problemas:** CSS blob inline (110-144), class-based HTML (nao data-*), sem acao recomendada

### Tarefa 3.6.1: Migrar classes CSS para data-* attributes

Mapeamento:
| Classe CSS antiga | Novo attribute |
|-------------------|---------------|
| `.awareness-panel` | `data-component="section" data-section="awareness"` |
| `.epic-node` | `data-component="tree-node" data-level="epic"` |
| `.story-node` | `data-component="tree-node" data-level="story"` |
| `.test-row` | `data-component="test-row" data-status="[status]"` |
| `.status-badge` | Remover - usar Badge primitive |
| `.health-bar` | Usar ProgressBar primitive |
| `.empty-note` | Remover - usar EmptyState primitive |

### Tarefa 3.6.2: Substituir buildStatusBadge por Badge primitive

### Tarefa 3.6.3: Substituir buildHealthBar por ProgressBar primitive

### Tarefa 3.6.4: Adicionar empty state e acao recomendada

**Commit:** `refactor(traceability): migrate to data-* attributes, use Badge/ProgressBar primitives`

---

## FASE 3.7: ai-comparison-renderer

**Arquivo:** `shared/report/ai-comparison-renderer.ts`
**Problemas:** Ja usa DataTable/MetricCard/Badge (bom), mas empty state generico, sem acao recomendada

### Tarefa 3.7.1: Melhorar empty state
### Tarefa 3.7.2: Adicionar acao recomendada
### Tarefa 3.7.3: Envolver em Section semantico

**Commit:** `refactor(ai-comparison): improve empty state, add actions, semantic HTML`

---

## FASE 3.8: release-score-renderer

**Arquivo:** `shared/quality/release-score-renderer.ts`
**Problemas:** Sem null guard, delega para buildReleaseSection

### Tarefa 3.8.1: Adicionar null guard com EmptyState
### Tarefa 3.8.2: Envolver em Container/Section

**Commit:** `refactor(release-score): add null guard, semantic HTML hooks`

---

## FASE 3.9: silent-regression-renderer

**Arquivo:** `shared/quality/silent-regression-renderer.ts`
**Problemas:** Ja usa DataTable/MetricCard/Badge (melhor arquitetura), mas empty state sem guidance, sem acao recomendada

### Tarefa 3.9.1: Melhorar empty state
### Tarefa 3.9.2: Adicionar acao recomendada
### Tarefa 3.9.3: Envolver em Section semantico

**Commit:** `refactor(silent-regression): improve empty state, add actions, semantic HTML`

---

## FASE 3.11: Validacao Cruzada

### Tarefa 3.11.1: Rodar typecheck completo
```bash
npx tsc --noEmit
```

### Tarefa 3.11.2: Rodar todos os testes
```bash
npx vitest run
```

### Tarefa 3.11.3: Gerar HTML de cada dashboard e verificar hooks

Para cada renderer, verificar:
- `data-dashboard="[report-type]"` no container raiz
- `data-section` em cada secao
- `data-component` em cada primitive
- `caption` em cada tabela
- `scope` em cada th
- Empty states com `data-empty-state`
- RecommendedActions com `data-action`

---

## FASE 3.12: Atualizar documentacao

### Tarefa 3.12.1: Atualizar TECHDOC.md

Adicionar secao sobre:
- Convencao de hooks HTML-CSS
- Primitives disponiveis (EmptyState, RecommendedActions)
- Padrao de empty states
- Padrao de recommended actions

**Commit:** `docs: document HTML quality restructuring and CSS hooks`

---

## Resumo de Commits

| Fase | Commits | Descricao |
|------|---------|-----------|
| 3.0 | 1 | Contrato HTML-CSS hooks |
| 3.10 | 3 | Novos primitives (EmptyState, RecommendedActions, barrel) |
| 3.1 | 1 | ai-effectiveness restructure |
| 3.2 | 1 | flakiness restructure |
| 3.3 | 1 | backlog-health restructure |
| 3.4 | 1 | incident-report restructure |
| 3.5 | 1 | impact-alert restructure |
| 3.6 | 1 | traceability restructure |
| 3.7 | 1 | ai-comparison restructure |
| 3.8 | 1 | release-score restructure |
| 3.9 | 1 | silent-regression restructure |
| 3.11 | 0 | Validacao (sem commits) |
| 3.12 | 1 | Documentacao |
| **Total** | **14** | |

---

## Coordenacao com Fase CSS

A fase CSS consumira os seguintes hooks HTML:

| Hook | Quem gera | Quem consome |
|------|-----------|-------------|
| `data-dashboard` | Container (3.10+) | CSS: escopo por dashboard |
| `data-section` | Section (existente) | CSS: layout por secao |
| `data-component` | Todos os primitives | CSS: estilizacao por componente |
| `data-part` | Primitives (existente) | CSS: sub-elementos |
| `data-severity` | Card/MetricCard | CSS: cores por severidade |
| `data-variant` | Card/Badge | CSS: variantes visuais |
| `data-empty-state` | EmptyState (3.10.1) | CSS: estilo de empty state |
| `data-action` | RecommendedActions (3.10.2) | CSS: estilo de acao recomendada |
| `data-column` | Th (existente) | CSS: colunas da tabela |
| `data-row` | Tr (existente) | CSS: linhas da tabela |

**Ordem de execucao:** Fase 3 (HTML) -> Fase 4 (CSS)
**Pre-requisito da Fase 4:** Todos os hooks da Fase 3 implementados e validados.
