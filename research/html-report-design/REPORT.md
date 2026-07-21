# Gold Standard HTML Report Design — Pesquisa de Mercado (Jul/2026)

## Resumo Executivo

A pesquisa identificou **Allure Report 3** como o gold standard da indústria para relatórios HTML de teste, com padrões consolidados de design, acessibilidade e responsividade. Para este projeto (relatórios HTML estáticos, offline, sem framework JS), a abordagem recomendada é **CSS puro com design tokens**, não frameworks como Tailwind/Bootstrap.

---

## 1. Gold Standard do Mercado

### Allure Report 3 (Referência Principal)
- **13+ tipos de gráficos**: pie, bar, area, heatmap, treemap, histogram, pyramid
- **Layout responsivo**: grid CSS com cards, sidebar colapsável
- **Cores semânticas**: green=pass, red=fail, yellow=warn, gray=skip, blue=info
- **Single-file mode**: HTML autocontido com CSS+JS+dados embutidos
- **Fonte:** https://allurereport.org/docs/visual-analytics/

### Stryker Mutation Testing Elements
- **Web Components** com schema-driven rendering
- **Score gauge** circular com cor por grade
- **Inline code diffs** com highlighting
- **Fonte:** https://github.com/stryker-mutator/mutation-testing-elements

### Padrões Consolidados
| Padrão | Fonte | Confiança |
|--------|-------|-----------|
| Cards CSS Grid + Flexbox | CSS-Tricks, Tailwind docs | ALTA |
| Cores semânticas (pass/fail/warn) | Allure, Stryker, SonarQube | ALTA |
| 8px grid system | Material Design, Carbon | ALTA |
| Dark mode via `prefers-color-scheme` | MDN, CSS-Tricks | ALTA |
| Single-file HTML pattern | Allure singleFile mode | ALTA |

---

## 2. CSS Responsivo para HTML Estático

### Breakpoints Recomendados
| Breakpoint | Uso |
|------------|-----|
| `< 600px` | Mobile: coluna única, tabelas stacked |
| `600-900px` | Tablet: 2 colunas, grid auto-fit |
| `> 900px` | Desktop: sidebar + grid 3 colunas |

### Técnicas-Chave
- **`clamp()`** para tipografia fluida: `font-size: clamp(1rem, 0.5rem + 1vw, 1.5rem)`
- **CSS Grid `auto-fill` + `minmax()`** para cards responsivos
- **Container queries** para componentes: `container-type: inline-size`
- **Tabelas**: `overflow-x: auto` ou layout stacked com `data-label`
- **Fonte:** web.dev, MDN, CSS-Tricks

---

## 3. Sistema de Design CSS

### Arquitetura de Tokens (3 camadas)
```
Primitive tokens (cores base)
  └─ Semantic tokens (status: pass/fail/warn)
       └─ Component tokens (card-border, table-header)
```

### Tipografia Modular
- Escala Major Third (1.250): 12px → 15px → 19px → 24px → 30px → 38px
- CSS variables: `--text-sm` a `--text-4xl`
- **Fonte:** Josh W. Comeau (2025)

### Espaçamento
- Grid 4px base: `--space-1` (4px) a `--space-16` (64px)
- Logical properties: `padding-inline` > `padding-left`

### Dark Mode
- `@media (prefers-color-scheme: dark)` — redefine tokens semantic
- Backgrounds `#121212` (não `#000`), text `#e0e0e0` (não `#fff`)
- **Fonte:** MDN, CSS-Tricks, Material Design

### Cores de Status QA
| Status | Light | Dark |
|--------|-------|------|
| Pass | `#16a34a` | `#4ade80` |
| Fail | `#dc2626` | `#f87171` |
| Warn | `#d97706` | `#fbbf24` |
| Skip | `#6b7280` | `#9ca3af` |
| Info | `#2563eb` | `#60a5fa` |

---

## 4. Acessibilidade (WCAG AA)

### Requisitos Obligatorios
- **Contraste 4.5:1** para texto normal, 3:1 para texto grande
- **HTML semântico**: `<article>`, `<section>`, `<nav>`, `<table>` com `<th scope>`.
- **Skip link**: `<a href="#main" class="skip-link">Pular para conteúdo</a>`
- **Keyboard navigation**: `:focus-visible` com outline visível
- **`prefers-reduced-motion`**: desabilita animações
- **Print styles**: `@media print` para impressão profissional

### Padrão de Indicadores de Status
```css
.status-pass { color: var(--color-pass); background: color-mix(in srgb, var(--color-pass) 10%, transparent); }
.status-fail { color: var(--color-fail); background: color-mix(in srgb, var(--color-fail) 10%, transparent); }
```

---

## 5. Performance

| Técnica | Impacto | Recomendação |
|---------|---------|--------------|
| CSS inline no HTML | Elimina requests HTTP | **SIM** para relatórios estáticos |
| System fonts | Zero download | **SIM** (system-ui, -apple-system) |
| SVG inline | Zero requests para ícones pequenos | **SIM** para status icons |
| `content-visibility: auto` | 7x rendering boost em listas longas | **SIM** para relatórios grandes |
| Print styles | `@media print` | **SIM** para impressão |

---

## Recomendação Final

Para este projeto, **CSS puro com design tokens é superior a qualquer framework**:

1. **BEM naming** (`.qa-*`) — padrão, não framework
2. **CSS custom properties** — tokens de design sem dependência
3. **`clamp()` + `auto-fill`** — responsividade nativa
4. **`prefers-color-scheme`** — dark mode sem JS
5. **HTML semântico** — acessibilidade nativa

**Não usar:** Tailwind (over-engineering), Bootstrap (runtime JS), Chakra/Radix (React dependency).

**Referência principal:** Allure Report 3 como gold standard de layout e visualização de dados.
