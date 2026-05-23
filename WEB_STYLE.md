# QA Tools — Web UI Style Guide

## Design Philosophy

Terminal-native aesthetic meets modern web UI. Dark background, sober colors, monospace
where it matters (logs, data), clean sans-serif for navigation and forms. Every screen
solves one task — no excess, no clutter. Data first: show metrics in 1 second.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  🔧 QA Tools              ECSPOL ●  🟢 ativo           │
│  Jira Management · Git Triggers                          │
├───────────┬──────────────────────────────────────────────┤
│           │                                              │
│  📋 Dash  │  ┌──────────────────────────────────────┐   │
│  📁 Tests │  │     Content Area                     │   │
│  📦 Rel.  │  │                                      │   │
│  ⚙️ Config│  │     (component renders here)         │   │
│  🔗 Git   │  │                                      │   │
│  ─────────│  │                                      │   │
│  📊 Report│  └──────────────────────────────────────┘   │
│           │                                              │
│  🚪 Exit  │                                              │
├───────────┴──────────────────────────────────────────────┤
│  3 ok · 1 erro  │  Last: csv-import: 5/5               │
└──────────────────────────────────────────────────────────┘
```

- **Sidebar**: fixed, 240px. Navigation + status summary.
- **Content**: flexible, scrollable. Component-switched by route.
- **Footer**: fixed bottom bar. Session counters + last operation.
- **Header**: fixed top. Logo/project name + connection status + tabs.

---

## Design Tokens

### Colors

CSS custom properties scoped to `:root`:

```css
:root {
  /* Backgrounds */
  --bg-base:     #0d1117;
  --bg-surface:  #161b22;
  --bg-elevated: #1c2333;
  --bg-hover:    #1c2128;

  /* Borders */
  --border:      #30363d;
  --border-focus:#58a6ff;

  /* Text */
  --text-primary:   #c9d1d9;
  --text-secondary: #8b949e;
  --text-muted:     #484f58;

  /* Accent */
  --accent:     #58a6ff;
  --accent-dim: #1f6feb;

  /* Semantic */
  --success: #3fb950;
  --error:   #f85149;
  --warning: #d29922;
  --info:    #58a6ff;
}

[data-theme="light"] {
  --bg-base:     #ffffff;
  --bg-surface:  #f6f8fa;
  --bg-elevated: #eaeef2;
  --bg-hover:    #eaeef2;
  --border:      #d0d7de;
  --text-primary:   #1f2328;
  --text-secondary: #656d76;
  --text-muted:     #6e7681;
  --accent:     #0969da;
  --accent-dim: #0550ae;
  --success: #1a7f37;
  --error:   #cf222e;
  --warning: #9a6700;
}
```

### Typography

```css
--font-ui:    'Inter', -apple-system, sans-serif;
--font-mono:  'JetBrains Mono', 'Fira Code', monospace;

/* scale */
--text-xs:   0.75rem;   /* 12px — labels, meta */
--text-sm:   0.875rem;  /* 14px — body, descriptions */
--text-base: 1rem;      /* 16px — defaults */
--text-lg:   1.125rem;  /* 18px — section titles */
--text-xl:   1.25rem;   /* 20px — page titles */
--text-2xl:  1.5rem;    /* 24px — dashboard numbers */
```

### Spacing

4px base grid:

```css
--space-1: 0.25rem;  /*  4px */
--space-2: 0.5rem;   /*  8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-12:3rem;     /* 48px */
```

### Radius

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
```

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 12px rgba(0,0,0,0.4);
```

---

## Components

### Cards

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}
```

### Metric Card (Dashboard)

```
┌────────────────┐
│  📦  16        │
│  Commands      │
│  ▲ +2 today    │
└────────────────┘
```

```html
<div class="metric-card">
  <div class="metric-icon">📦</div>
  <div class="metric-value">16</div>
  <div class="metric-label">Commands</div>
  <div class="metric-trend up">▲ +2 today</div>
</div>
```

### Buttons

```css
/* Primary */
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  cursor: pointer;
}
.btn-primary:hover { filter: brightness(1.15); }

/* Secondary / Ghost */
.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}
.btn-ghost:hover { background: var(--bg-hover); }
```

### Forms

```css
.form-input {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  width: 100%;
}
.form-input:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.form-label {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  margin-bottom: var(--space-1);
  display: block;
}
```

### Status Badges

```css
.badge-ok    { color: var(--success); border-color: var(--success); }
.badge-err   { color: var(--error);   border-color: var(--error);   }
.badge-warn  { color: var(--warning); border-color: var(--warning); }
```

Rendered as inline dot + label:

```
🟢  Ok      🔴  Error    🟡  Warning
```

### Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.table th {
  color: var(--text-secondary);
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}
.table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}
.table tr:hover { background: var(--bg-hover); }
```

### Progress Bar

```css
.progress-bar {
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  height: 8px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}
.progress-fill.ok    { background: var(--success); }
.progress-fill.err   { background: var(--error);   }
```

### Log / Terminal Feed

Monospace lines with level prefix coloring. Auto-scrolls to bottom.

```css
.log-feed {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  max-height: 300px;
  overflow-y: auto;
}
.log-line.info    { color: var(--info);    }
.log-line.success { color: var(--success); }
.log-line.error   { color: var(--error);   }
.log-line.warn    { color: var(--warning); }
```

---

## Screens

### Dashboard

```
┌─────────────────────────────────────────────────────┐
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │   16   │ │   4    │ │   3    │ │  95%   │       │
│ │Commands│ │Releases│ │Pipeline│ │Pass %  │       │
│ │ ▲ +2   │ │   -    │ │ ▬ 0    │ │ ▲ +5%  │       │
│ └────────┘ └────────┘ └────────┘ └────────┘       │
│                                                     │
│ Quick Actions                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ CSV      │ │ JSON     │ │ Diagnose │            │
│ │ Import   │ │ Import   │ │ Connect  │            │
│ └──────────┘ └──────────┘ └──────────┘            │
│                                                     │
│ Recent Activity                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ ✓ csv-import   ECSPOL · 5/5 tests     10:32   ││
│ │ ✓ create-rel   v2.7.0                  09:45   ││
│ │ ✗ list-vers   connection error         09:30   ││
│ │ ✓ pipeline     main → staging           08:15   ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Menu View (Command Selection)

Collapsible sections. Each command is a card with icon, label, and optional description.
Clicking opens the respective form.

```
📁 TESTS
┌──────────────────────┐  ┌──────────────────────┐
│ 📄  1. Criar testes  │  │ 📄  15. Importar JSON │
│      a partir de CSV │  │      tests            │
│      last: v2.7.0    │  │                       │
└──────────────────────┘  └──────────────────────┘

📦 RELEASES
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│2 Listar  │ │3 Criar   │ │4 FixVer  │ │5 Package │
│ versões  │ │ versão   │ │ tasks    │ │ + notes  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
│6 Verificar│ │7 Fechar  │ │8 Publicar│
└──────────┘ └──────────┘ └──────────┘
...
```

### Command Form

```
┌─────────────────────────────────────────────────────┐
│ 📄 Criar testes a partir de CSV                      │
├─────────────────────────────────────────────────────┤
│                                                       │
│ CSV File                                              │
│ ┌──────────────────────────────────────────┐         │
│ │ /home/user/tests/test_steps.csv    [📁] │         │
│ └──────────────────────────────────────────┘         │
│                                                       │
│ Jira Labels (comma separated)                         │
│ ┌──────────────────────────────────────────┐         │
│ │ regression, smoke, sprint-30             │         │
│ └──────────────────────────────────────────┘         │
│                                                       │
│ ┌───────────┐  ┌───────────┐  ┌──────────────────┐  │
│ │ Preview   │  │ Execute   │  │ Cancel           │  │
│ └───────────┘  └───────────┘  └──────────────────┘  │
│                                                       │
│ ── Preview ───────────────────────────────────────── │
│  TC01 · Login válido          [2 steps]  [PRE-001]  │
│  TC02 · Login inválido        [2 steps]             │
│  Total: 2 tests, 4 steps, 1 group                    │
│                                                       │
│ ── Progress ──────────────────────────────────────── │
│ [████████████░░░░░░░░░░]  12/20  15s                 │
│                                                       │
│ i  Criando issue TEST-123...                        ✓│
│ i  Criando issue TEST-124...                        ✓│
│ ERR Issue TEST-125: rate limit                     ✗│
│ !  Retrying in 5s...                                 │
└─────────────────────────────────────────────────────┘
```

### Result / Summary View

```
┌─────────────────────────────────────────────────────┐
│ ✅  Operation Complete                                │
├─────────────────────────────────────────────────────┤
│                                                       │
│ ┌──────────────────────────────────────┐             │
│ │     ✓ 5 passed                       │             │
│ │     ✗ 1 failed                       │             │
│ │     - 0 skipped                      │             │
│ │     🟢 83.3% pass rate               │             │
│ └──────────────────────────────────────┘             │
│                                                       │
│ ┌─── Results ──────────────────────────────────────┐ │
│ │ # │ Test       │ Status │ Link                  │ │
│ │ 1 │ TC-001     │ ✓ pass │ TEST-123              │ │
│ │ 2 │ TC-002     │ ✓ pass │ TEST-124              │ │
│ │ 3 │ TC-003     │ ✗ fail │ TEST-125  (rate limit)│ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ ┌───────────┐  ┌───────────┐  ┌──────────────────┐  │
│ │ Back to   │  │ New       │  │ Export Report    │  │
│ │ Menu      │  │ Operation │  │ (HTML)           │  │
│ └───────────┘  └───────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Chart Components

- **Pie/Doughnut**: test result distribution (pass/fail/skip)
- **Bar**: releases per month, tests per suite
- **Line**: pass rate over time (sessions)

Chart.js config defaults:

```js
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "'Inter', sans-serif";
// Plugins: legend at bottom, datalabels off
```

---

## Navigation

### Routes

```
/                → Dashboard
/menu            → Command menu (sectioned cards)
/command/:id     → Command form
/results/:id     → Result summary for a command execution
/history         → Session history table
/config          → Settings (Jira project, paths, tokens)
/report          → Full report with charts
```

### Sidebar

Active route highlighted with accent border-left. Sections separated by thin rule.

```css
.nav-item {
  padding: var(--space-2) var(--space-4);
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  cursor: pointer;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-item.active { border-left-color: var(--accent); color: var(--text-primary); font-weight: 600; }
```

---

## States

### Empty
Centered message with muted icon and text: *"No operations yet. Start by running a command."*

### Loading
Skeleton shimmer cards (animated gradient) matching card dimensions.
```
┌──────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░ │  (shimmer animation)
│ ░░░░░░░░░░           │
└──────────────────────┘
```

### Error Inline
Red border card with icon:
```
┌──────────────────────────────────┐
│ ⚠️  Failed to load projects     │
│    Connection refused (ECONNREF) │
│    [Retry]          [Dismiss]    │
└──────────────────────────────────┘
```

---

## Responsive

- **≥1024px**: sidebar + content side by side
- **<1024px**: sidebar collapses to hamburger + overlay
- **<640px**: metric cards stack 2-column → 1-column, tables scroll horizontally
- Sidebar: `transform: translateX(-100%)` + `position: fixed` on mobile

---

## Dark / Light Mode

Toggled via `[data-theme]` on `<html>`. Persisted in `localStorage`.
Default: dark (terminal-native). Toggle button in header.

---

## Icons

Use **Lucide** icons via CDN (`https://unpkg.com/lucide-static`). SVG-based,
`1.5rem` default, semantic color inherited from text. Key icons:

| Icon | Usage |
|------|-------|
| `terminal` | Logo / brand |
| `layout-dashboard` | Dashboard nav |
| `beaker` | Tests section |
| `package` | Releases section |
| `settings` | Config section |
| `git-branch` | Git section |
| `bar-chart-3` | Reports |
| `upload` | CSV/JSON import |
| `play` | Execute command |
| `circle-check` | Success |
| `circle-x` | Error |
| `alert-triangle` | Warning |
| `loader` | Loading spinner |
| `moon` / `sun` | Theme toggle |

---

## Animations

```css
/* Page transitions */
.content-enter { opacity: 0; transform: translateY(8px); }
.content-enter-active { opacity: 1; transform: translateY(0); transition: 0.2s ease; }

/* Card hover */
.card { transition: border-color 0.15s, box-shadow 0.15s; }
.card:hover { border-color: var(--accent-dim); box-shadow: var(--shadow-sm); }

/* Skeleton shimmer */
@keyframes shimmer { 0% { opacity: 0.4; } 50% { opacity: 0.8; } 100% { opacity: 0.4; } }
.skeleton { animation: shimmer 1.5s infinite; background: var(--bg-elevated); border-radius: var(--radius-md); }
```
