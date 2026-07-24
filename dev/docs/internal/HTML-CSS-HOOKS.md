# HTML-CSS Hook Convention

**Purpose:** Define all `data-*` attributes exposed by the HTML layer for the CSS layer to consume.
**Created:** FASE 3.0 — HTML Quality Restructuring
**Consumed by:** FASE 4 — CSS Refactoring

---

## 1. Hierarchy

```
data-dashboard (Container root)
  └─ data-section (Section wrapper)
       └─ data-component (Primitive element)
            ├─ data-part (Sub-element within component)
            ├─ data-severity (Severity level)
            ├─ data-variant (Visual variant)
            └─ data-column / data-row (Table internals)
```

---

## 2. Attributes Reference

### data-dashboard

**Scope:** Container root (outermost wrapper)
**Purpose:** Identifies which dashboard the HTML belongs to. CSS uses this to scope dashboard-specific styles.

| Value | Renderer |
|-------|----------|
| `ai-effectiveness` | ai-effectiveness-renderer.ts |
| `ai-comparison` | ai-comparison-renderer.ts |
| `incident-report` | incident-report-renderer.ts |
| `impact-alert` | impact-alert-renderer.ts |
| `traceability` | traceability-renderer.ts |
| `flakiness` | flakiness-renderer.ts |
| `backlog-health` | backlog-health-renderer.ts |
| `release-score` | release-score-renderer.ts |
| `silent-regression` | silent-regression-renderer.ts |

### data-section

**Scope:** Section primitive (card wrapper)
**Purpose:** Identifies the role of each section within a dashboard.

| Value | Usage |
|-------|-------|
| `header` | Page title area |
| `summary` | MetricGrid / summary cards |
| `version-breakdown` | Version-specific data table |
| `trend` | Time-series data table |
| `flakiness-table` | Flakiness data table |
| `density` | Bug density data table |
| `events` | Incident/alert event cards |
| `actions` | RecommendedActions section |
| `advantage` | AI advantage analysis |
| `comparison` | Comparison overview |
| `severity` | Severity badge |
| `description` | Summary description |
| `source-quality` | Data quality banner |
| `score` | Release score section |
| `regressions` | Regression data table |
| `awareness` | Cross-references / data quality |

### data-component

**Scope:** Any primitive element
**Purpose:** Identifies which primitive generated the element. Existing in all primitives.

| Value | Primitive |
|-------|-----------|
| `container` | Container |
| `section` | Section |
| `grid` | Grid |
| `flex-row` | FlexRow |
| `separator` | Separator |
| `card` | Card |
| `metric-card` | MetricCard |
| `card-grid` | CardGrid |
| `metric-grid` | MetricGrid |
| `badge` | Badge |
| `data-table` | DataTable |
| `table-wrapper` | DataTable (wrapper div) |
| `bar-chart` | BarChart |
| `trend-chart` | TrendChart |
| `sparkline` | Sparkline |
| `progress-bar` | ProgressBar |
| `empty-state` | EmptyState (NEW — FASE 3.10.1) |
| `recommended-actions` | RecommendedActions (NEW — FASE 3.10.2) |
| `action-item` | Individual action within RecommendedActions |
| `tree-node` | Traceability tree node (epic/story) |
| `test-row` | Traceability test row |
| `issue-list` | Backlog health issue list |
| `issue-item` | Individual issue within issue list |

### data-part

**Scope:** Sub-element within a component
**Purpose:** Identifies specific parts of a component for fine-grained CSS targeting.

| Value | Parent Component |
|-------|-----------------|
| `section-title` | Section |
| `icon` | Card, MetricCard, EmptyState, RecommendedActions |
| `title` | Card, EmptyState, RecommendedActions |
| `body` | Card |
| `label` | MetricCard |
| `value` | MetricCard |
| `trend` | MetricCard |
| `description` | EmptyState |
| `action` | EmptyState, RecommendedActions |
| `text` | RecommendedActions (action-item) |
| `list` | RecommendedActions |
| `key` | Issue item (backlog-health) |
| `summary` | Issue item (backlog-health) |
| `overflow` | Issue list overflow indicator |

### data-severity

**Scope:** Card, MetricCard, RecommendedActions (action-item)
**Purpose:** Visual severity level for CSS color mapping.

| Value | Meaning |
|-------|---------|
| `success` | Green — all clear |
| `error` | Red — critical issue |
| `warn` | Yellow — needs attention |
| `info` | Blue — informational |
| `default` | Neutral — no severity |

### data-variant

**Scope:** Card, Badge
**Purpose:** Visual variant for CSS styling.

| Value | Component |
|-------|-----------|
| `default` | Card, Badge |
| `elevated` | Card |
| `bordered` | Card |
| `pass` | Badge |
| `fail` | Badge |
| `skip` | Badge |
| `info` | Badge |
| `warn` | Badge |

### data-column

**Scope:** Th (table header cell)
**Purpose:** Identifies which column the header belongs to.

### data-row

**Scope:** Tr (table row)
**Purpose:** Identifies each row for CSS targeting.

### data-empty-state

**Scope:** EmptyState primitive
**Purpose:** Identifies the reason for the empty state.

| Value | Usage |
|-------|-------|
| `no-data` | No records found |
| `no-comparison` | Missing comparison data |
| `no-results` | Filter/search returned nothing |

### data-action

**Scope:** RecommendedActions, EmptyState action part
**Purpose:** Identifies actionable guidance.

| Value | Usage |
|-------|-------|
| `guidance` | Action guidance text |

---

## 3. CSS Selector Patterns

```css
/* Dashboard-specific scope */
[data-dashboard="ai-effectiveness"] { /* ... */ }

/* Section targeting */
[data-dashboard="flakiness"] [data-section="flakiness-table"] { /* ... */ }

/* Component within dashboard */
[data-dashboard="traceability"] [data-component="tree-node"][data-level="epic"] { /* ... */ }

/* Severity-based styling */
[data-component="action-item"][data-severity="error"] { /* ... */ }

/* Empty state */
[data-component="empty-state"] { /* ... */ }

/* Recommended actions */
[data-component="recommended-actions"] [data-component="action-item"] { /* ... */ }
```

---

## 4. Renderer-to-Hook Mapping

| Renderer | data-dashboard | data-sections used |
|----------|---------------|-------------------|
| ai-effectiveness | `ai-effectiveness` | summary, version-breakdown, trend, actions |
| ai-comparison | `ai-comparison` | comparison, advantage, version-breakdown, actions |
| incident-report | `incident-report` | severity, summary, description, events |
| impact-alert | `impact-alert` | summary, alerts |
| traceability | `traceability` | summary, awareness |
| flakiness | `flakiness` | summary, flakiness-table, source-quality, actions |
| backlog-health | `backlog-health` | summary, density |
| release-score | `release-score` | score |
| silent-regression | `silent-regression` | summary, regressions, actions |
