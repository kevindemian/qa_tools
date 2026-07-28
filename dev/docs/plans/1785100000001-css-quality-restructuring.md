# FASE 4: Refatoracao CSS — Consumir Hooks HTML da Fase 3

**Plano master:** `.mimocode/plans/1784726095802-gentle-squid.md`
**Plano anterior (pre-requisito):** `.mimocode/plans/1785100000000-html-quality-restructuring.md` (FASE 3)

## Contexto

A FASE 3 preparou todos os renderers com hooks HTML (data-* attributes) e novos primitives (EmptyState, RecommendedActions). Esta fase cria o CSS que consome esses hooks, substituindo inline styles e CSS blobs por classes CSS baseadas em data-* selectors.

**Autorizacao:** "Tempo e esforco NAO sao variaveis. Considere APENAS superioridade tecnica e seguranca."

**Pre-requisito:** Fase 3 completa e validada (todos os hooks implementados).

**Objetivo:** CSS puro, sem framework, usando design tokens existentes e data-* selectors.

---

## FASE 4.0: Mapeamento Completo de Hooks

### Tarefa 4.0.1: Auditar todos os data-* gerados pela Fase 3

**Arquivo a criar:** `dev/docs/internal/HTML-CSS-HOOKS-AUDIT.md`

**Conteudo:** Tabela completa de:
- Todos os `data-component` existentes (primitives + novos)
- Todos os `data-section` usados em cada renderer
- Todos os `data-dashboard` usados
- Todos os `data-part` usados
- Todos os `data-severity` e `data-variant` usados
- Todos os `data-empty-state` e `data-action` usados

**Commit:** `docs: audit all HTML hooks for CSS phase`

---

## FASE 4.1: Criar CSS Base para Novos Primitives

### Tarefa 4.1.1: CSS para EmptyState

**Arquivo a modificar:** `shared/report/report-styles.ts`

Adicionar secao de estilos para EmptyState:

```css
/* Empty State */
[data-component="empty-state"] {
    text-align: center;
    padding: 48px 24px;
    background: var(--color-surface-card);
    border-radius: 8px;
}
[data-component="empty-state"] [data-part="icon"] {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.6;
}
[data-component="empty-state"] [data-part="title"] {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--color-text-primary);
}
[data-component="empty-state"] [data-part="description"] {
    color: var(--color-text-secondary);
    margin-bottom: 16px;
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
}
[data-component="empty-state"] [data-part="action"] {
    display: inline-block;
    padding: 8px 16px;
    background: var(--color-surface-elevated);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
}
```

---

### Tarefa 4.1.2: CSS para RecommendedActions

```css
/* Recommended Actions */
[data-component="recommended-actions"] {
    background: var(--color-surface-card);
    border-radius: 8px;
    padding: 16px;
}
[data-component="recommended-actions"] [data-part="title"] {
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--color-text-primary);
}
[data-component="recommended-actions"] [data-part="list"] {
    list-style: none;
    padding: 0;
    margin: 0;
}
[data-component="recommended-actions"] [data-component="action-item"] {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border-subtle);
}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="error"] {
    border-left: 3px solid var(--color-error);
    padding-left: 12px;
}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="warn"] {
    border-left: 3px solid var(--color-warn);
    padding-left: 12px;
}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="info"] {
    border-left: 3px solid var(--color-info);
    padding-left: 12px;
}
```

---

### Tarefa 4.1.3: CSS para Dashboard wrapper

```css
/* Dashboard Container */
[data-dashboard] {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--color-text-primary);
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

/* Dashboard Sections */
[data-section] {
    margin-bottom: 24px;
}
[data-section="summary"] {
    margin-bottom: 32px;
}
[data-section="actions"] {
    margin-top: 24px;
}
```

**Commit:** `feat(css): add base styles for EmptyState, RecommendedActions, dashboard containers`

---

## FASE 4.2: Migrar Inline Styles dos Primitives para CSS

### Tarefa 4.2.1: Container primitive

**Arquivo:** `shared/primitives/layout.ts`

Remover inline styles de Container e usar classes CSS:

**Antes:**
```typescript
return `<div data-component="container" data-variant="${props.variant || 'page'}"
    role="${props.role || 'region'}"
    ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
    style="background:${bg};padding:${padding}px;max-width:${maxWidth}px;margin:0 auto;
           font-family:${tokens.fontFamily};color:var(--color-text-primary);
           min-height:100vh">
    ${props.children}
</div>`;
```

**Depois:**
```typescript
return `<div data-component="container" data-variant="${props.variant || 'page'}"
    role="${props.role || 'region'}"
    ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
    class="qa-container qa-container--${props.variant || 'page'}">
    ${props.children}
</div>`;
```

**CSS equivalente:**
```css
.qa-container { max-width: 1200px; margin: 0 auto; min-height: 100vh; }
.qa-container--page { background: var(--color-surface-page); padding: 20px; }
.qa-container--card { background: var(--color-surface-card); padding: 20px; border-radius: 8px; }
```

**NOTA:** Manter inline styles como fallback durante migracao. Remover apos validacao.

---

### Tarefa 4.2.2: Section primitive

Mesmo padrao: extrair inline styles para classes CSS.

---

### Tarefa 4.2.3: Card primitive

Mesmo padrao.

---

### Tarefa 4.2.4: MetricCard primitive

Mesmo padrao.

---

### Tarefa 4.2.5: Badge primitive

Mesmo padrao.

---

### Tarefa 4.2.6: DataTable primitive

Mesmo padrao.

---

### Tarefa 4.2.7: Th/Td/Tr primitives

Mesmo padrao.

**Commit (por primitive):** `refactor(primitives): migrate inline styles to CSS classes for [primitive]`

---

## FASE 4.3: CSS por Dashboard

### Tarefa 4.3.1: ai-effectiveness CSS

```css
/* AI Effectiveness Dashboard */
[data-dashboard="ai-effectiveness"] [data-section="version-breakdown"] table { /* ... */ }
[data-dashboard="ai-effectiveness"] [data-section="trend"] table { /* ... */ }
```

---

### Tarefa 4.3.2: flakiness CSS

```css
/* Flakiness Dashboard */
[data-dashboard="flakiness"] [data-section="source-quality"] { /* ... */ }
[data-dashboard="flakiness"] [data-component="data-table"] [data-severity="high"] { /* ... */ }
```

---

### Tarefa 4.3.3: backlog-health CSS

```css
/* Backlog Health Dashboard */
[data-dashboard="backlog-health"] [data-component="issue-list"] { /* ... */ }
[data-dashboard="backlog-health"] [data-component="issue-item"] { /* ... */ }
```

---

### Tarefa 4.3.4: incident-report CSS

```css
/* Incident Report */
[data-dashboard="incident-report"] [data-section="severity"] { /* ... */ }
[data-dashboard="incident-report"] [data-component="card"][data-severity="error"] { /* ... */ }
```

---

### Tarefa 4.3.5: impact-alert CSS

```css
/* Impact Alert */
[data-dashboard="impact-alert"] [data-component="card"] { /* ... */ }
```

---

### Tarefa 4.3.6: traceability CSS

```css
/* Traceability Matrix */
[data-dashboard="traceability"] [data-component="tree-node"] { /* ... */ }
[data-dashboard="traceability"] [data-component="tree-node"][data-level="epic"] { /* ... */ }
[data-dashboard="traceability"] [data-component="tree-node"][data-level="story"] { /* ... */ }
[data-dashboard="traceability"] [data-component="test-row"] { /* ... */ }
[data-dashboard="traceability"] [data-component="progress-bar"] { /* ... */ }
```

**NOTA:** Migrar o TRACEABILITY_CSS blob (linhas 110-144) para data-* selectors.

---

### Tarefa 4.3.7: ai-comparison CSS

```css
/* AI Comparison */
[data-dashboard="ai-comparison"] [data-section="advantage"] { /* ... */ }
```

---

### Tarefa 4.3.8: release-score CSS

```css
/* Release Score */
[data-dashboard="release-score"] [data-section="score"] { /* ... */ }
```

---

### Tarefa 4.3.9: silent-regression CSS

```css
/* Silent Regression */
[data-dashboard="silent-regression"] [data-component="data-table"] { /* ... */ }
```

**Commit (por dashboard):** `refactor(css): add dashboard-specific styles for [dashboard]`

---

## FASE 4.4: Remover Inline Styles dos Renderers

### Tarefa 4.4.1: Remover inline styles do ai-effectiveness-renderer

Todas as props de style nos Container/Section/Card sao removidas — o CSS cuida.

---

### Tarefa 4.4.2: Remover inline styles do flakiness-renderer

---

### Tarefa 4.4.3: Remover inline styles do backlog-health-renderer

---

### Tarefa 4.4.4: Remover inline styles do incident-report-renderer

---

### Tarefa 4.4.5: Remover inline styles do impact-alert-renderer

---

### Tarefa 4.4.6: Remover inline styles do traceability-renderer

Migrar TRACEABILITY_CSS completo para data-* selectors.

---

### Tarefa 4.4.7: Remover inline styles do ai-comparison-renderer

---

### Tarefa 4.4.8: Remover inline styles do release-score-renderer

---

### Tarefa 4.4.9: Remover inline styles do silent-regression-renderer

**Commit (por renderer):** `refactor(renderer): remove inline styles, delegate to CSS for [renderer]`

---

## FASE 4.5: CSS Global — Consolidacao

### Tarefa 4.5.1: Reorganizar report-styles.ts

Estrutura final de `buildCss()`:

```typescript
export function buildCss(): string {
    return [
        buildCssVars(),           // :root CSS custom properties
        buildDarkVars(),          // html.dark overrides
        GLOBAL_RESET_CSS,         // Reset/base
        COMPONENT_CSS,            // Primitives (Card, Badge, Table, etc.)
        DASHBOARD_CSS,            // Por dashboard
        RESPONSIVE_CSS,           // Media queries
        PRINT_CSS,                // @media print
    ].join('\n');
}
```

---

### Tarefa 4.5.2: Adicionar CSS responsive para tables

```css
@media (max-width: 600px) {
    [data-component="data-table"] thead { display: none; }
    [data-component="data-table"] tr { display: block; margin-bottom: 1rem; border: 1px solid var(--color-border-subtle); }
    [data-component="data-table"] td { display: flex; justify-content: space-between; }
    [data-component="data-table"] td::before { content: attr(data-label); font-weight: bold; }
}
```

---

### Tarefa 4.5.3: Adicionar CSS para print

```css
@media print {
    [data-dashboard] { padding: 0; }
    [data-component="card"] { box-shadow: none; border: 1px solid #ccc; }
    [data-component="recommended-actions"] { page-break-inside: avoid; }
    [data-component="empty-state"] { page-break-inside: avoid; }
}
```

**Commit:** `refactor(css): consolidate global styles, add responsive table and print support`

---

## FASE 4.6: Validacao

### Tarefa 4.6.1: Rodar typecheck completo

```bash
npx tsc --noEmit
```

### Tarefa 4.6.2: Rodar todos os testes

```bash
npx vitest run
```

### Tarefa 4.6.3: Gerar HTML de cada dashboard e verificar

1. Abrir no browser e verificar visualmente
2. Verificar que nenhum inline style remaine nos renderers
3. Verificar dark mode
4. Verificar responsive (mobile/tablet/desktop)
5. Verificar print (Ctrl+P)

### Tarefa 4.6.4: Verificar acessibilidade

1. Verificar contraste de cores (WCAG AA 4.5:1)
2. Verificar navigacao por teclado
3. Verificar screen reader (NVDA/VoiceOver)

**Commit:** Nenhum (validacao apenas)

---

## Resumo de Commits

| Fase | Commits | Descricao |
|------|---------|-----------|
| 4.0 | 1 | Auditoria de hooks |
| 4.1 | 1 | CSS para novos primitives |
| 4.2 | 7 | Migrar inline styles dos primitives (1 por primitive) |
| 4.3 | 9 | CSS por dashboard (1 por dashboard) |
| 4.4 | 9 | Remover inline styles dos renderers (1 por renderer) |
| 4.5 | 1 | Consolidacao global |
| 4.6 | 0 | Validacao (sem commits) |
| **Total** | **28** | |

---

## Coordenacao com Fase 3

**Ordem de execucao:** Fase 3 (HTML) -> Fase 4 (CSS)

**Cada tarefa da Fase 4 depende da tarefa correspondente da Fase 3:**
- 4.1.1 (CSS EmptyState) depende de 3.10.1 (EmptyState primitive)
- 4.1.2 (CSS RecommendedActions) depende de 3.10.2 (RecommendedActions primitive)
- 4.3.1 (CSS ai-effectiveness) depende de 3.1 (ai-effectiveness restructure)
- etc.

**Recomendacao:** Executar Fase 3 completa, validar, depois iniciar Fase 4.

---

## Proximas Fases

Apos Fase 4 (CSS), a execucao continua no plano master (`.mimocode/plans/1784726095802-gentle-squid.md`):

| Fase | Descricao | Depende de |
|------|-----------|------------|
| 5 | Atualizar Orquestradores | Fase 2 completa |
| 6 | Validar Integracao | Fases 2-5 completas |
| 7 | Sanitizacao Final | Fase 6 |
| 8 | Atualizar Documentacao | Fase 7 |

A Fase 4 e a ultima fase de refatoracao de codigo. As fases 5-8 sao de validacao e documentacao.
