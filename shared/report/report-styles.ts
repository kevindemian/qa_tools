/**
 * CSS builder for HTML reports — generates styles from design tokens.
 *
 * Replaces hardcoded colors with CSS custom properties derived from
 * theme-tokens, enabling consistent dark/light theming across all report types.
 *
 * @module report-styles
 */

import { tokens } from '../ui/theme-tokens.js';

/** Generate :root CSS custom properties from design tokens. */
export function buildCssVars(): string {
    const vars: string[] = [];

    // Semantic colors
    vars.push(`--color-success:${tokens.color.semantic.success.light}`);
    vars.push(`--color-error:${tokens.color.semantic.error.light}`);
    vars.push(`--color-warn:${tokens.color.semantic.warn.light}`);
    vars.push(`--color-info:${tokens.color.semantic.info.light}`);

    // Surface colors
    vars.push(`--color-surface-page:${tokens.color.surface.page.light}`);
    vars.push(`--color-surface-card:${tokens.color.surface.card.light}`);
    vars.push(`--color-surface-elevated:${tokens.color.surface.elevated.light}`);
    vars.push(`--color-surface-input:${tokens.color.surface.input.light}`);

    // Text colors
    vars.push(`--color-text-primary:${tokens.color.text.primary.light}`);
    vars.push(`--color-text-secondary:${tokens.color.text.secondary.light}`);
    vars.push(`--color-text-muted:${tokens.color.text.muted.light}`);

    // Border colors
    vars.push(`--color-border-default:${tokens.color.border.default.light}`);
    vars.push(`--color-border-subtle:${tokens.color.border.subtle.light}`);

    // Badge colors
    vars.push(`--color-badge-pass-bg:${tokens.color.badge.pass.bg.light}`);
    vars.push(`--color-badge-pass-text:${tokens.color.badge.pass.text.light}`);
    vars.push(`--color-badge-fail-bg:${tokens.color.badge.fail.bg.light}`);
    vars.push(`--color-badge-fail-text:${tokens.color.badge.fail.text.light}`);
    vars.push(`--color-badge-skip-bg:${tokens.color.badge.skip.bg.light}`);
    vars.push(`--color-badge-skip-text:${tokens.color.badge.skip.text.light}`);

    // Health background colors
    vars.push(`--color-bg-healthy:${tokens.color.bg.healthy.light}`);
    vars.push(`--color-bg-warning:${tokens.color.bg.warning.light}`);
    vars.push(`--color-bg-critical:${tokens.color.bg.critical.light}`);

    return `:root{${vars.join(';')}}`;
}

/** Generate dark-mode overrides for CSS custom properties. */
export function buildDarkVars(): string {
    const vars: string[] = [];

    vars.push(`--color-success:${tokens.color.semantic.success.dark}`);
    vars.push(`--color-error:${tokens.color.semantic.error.dark}`);
    vars.push(`--color-warn:${tokens.color.semantic.warn.dark}`);
    vars.push(`--color-info:${tokens.color.semantic.info.dark}`);

    vars.push(`--color-surface-page:${tokens.color.surface.page.dark}`);
    vars.push(`--color-surface-card:${tokens.color.surface.card.dark}`);
    vars.push(`--color-surface-elevated:${tokens.color.surface.elevated.dark}`);
    vars.push(`--color-surface-input:${tokens.color.surface.input.dark}`);

    vars.push(`--color-text-primary:${tokens.color.text.primary.dark}`);
    vars.push(`--color-text-secondary:${tokens.color.text.secondary.dark}`);
    vars.push(`--color-text-muted:${tokens.color.text.muted.dark}`);

    vars.push(`--color-border-default:${tokens.color.border.default.dark}`);
    vars.push(`--color-border-subtle:${tokens.color.border.subtle.dark}`);

    vars.push(`--color-badge-pass-bg:${tokens.color.badge.pass.bg.dark}`);
    vars.push(`--color-badge-pass-text:${tokens.color.badge.pass.text.dark}`);
    vars.push(`--color-badge-fail-bg:${tokens.color.badge.fail.bg.dark}`);
    vars.push(`--color-badge-fail-text:${tokens.color.badge.fail.text.dark}`);
    vars.push(`--color-badge-skip-bg:${tokens.color.badge.skip.bg.dark}`);
    vars.push(`--color-badge-skip-text:${tokens.color.badge.skip.text.dark}`);

    // Health background colors (dark mode)
    vars.push(`--color-bg-healthy:${tokens.color.bg.healthy.dark}`);
    vars.push(`--color-bg-warning:${tokens.color.bg.warning.dark}`);
    vars.push(`--color-bg-critical:${tokens.color.bg.critical.dark}`);

    return `html.dark{${vars.join(';')}}`;
}

const BASE_LAYOUT_CSS = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:var(--color-surface-page);color:var(--color-text-primary)}
h1{font-size:1.5rem;margin-bottom:0.5rem}
h2{font-size:1.2rem;margin:1rem 0 0.5rem}
.wrapper{max-width:100%;overflow-x:auto}
.footer{margin-top:16px;font-size:0.75rem;color:var(--color-text-muted);text-align:center}
`;

const CHART_CSS = `
.chart-box{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.lg}px ${tokens.spacing.xl}px;box-shadow:${tokens.shadow.card};margin-bottom:${tokens.spacing.xl}px}
.chart-box .label{font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:4px}
.legend{display:flex;gap:16px;margin-top:8px;font-size:0.8rem}
.legend span{display:flex;align-items:center;gap:4px}
.legend .dot{width:10px;height:10px;border-radius:2px;display:inline-block}
.mini-trend{margin-bottom:20px}
.mini-trend svg{max-width:100%;height:auto}
`;

const TABS_SIDEBAR_CSS = `
.tabs{display:flex;gap:4px;margin-bottom:12px}
.tab-btn{padding:6px 14px;border:1px solid var(--color-border-default);background:var(--color-surface-card);border-radius:6px 6px 0 0;cursor:pointer;font-size:0.8rem;color:var(--color-text-primary)}
.tab-btn:hover{background:var(--color-surface-elevated)}
.tab-btn.active{background:var(--color-surface-elevated);border-bottom:2px solid var(--color-info);font-weight:600}
.tab-content{display:none}
.tab-content.active{display:block}
.sidebar{float:left;width:220px;margin-right:16px;margin-bottom:16px;background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.md}px;box-shadow:${tokens.shadow.card};font-size:0.85rem}
.sidebar .tree-node{padding:4px 8px;cursor:pointer;border-radius:4px;margin:2px 0;color:var(--color-text-primary)}
.sidebar .tree-node:hover{background:var(--color-surface-elevated)}
.sidebar .tree-node.active{background:var(--color-info);color:#fff;font-weight:600}
.timeline-row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.85rem;cursor:pointer}
.timeline-row:hover{background:var(--color-surface-elevated)}
.timeline-bar{height:16px;border-radius:3px;min-width:4px;flex-shrink:0}
`;

const TABLE_CSS = `
table{width:100%;border-collapse:collapse;background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;overflow:hidden;box-shadow:${tokens.shadow.card}}
th{background:var(--color-surface-elevated);text-align:left;padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary)}
td{padding:8px 12px;border-top:1px solid var(--color-border-subtle);font-size:0.875rem;color:var(--color-text-primary)}
tr:hover{background:var(--color-surface-elevated)}
tr:nth-child(even){background:var(--color-surface-elevated)}
tr:nth-child(even):hover{background:var(--color-surface-input)}
.row-passed{display:table-row}
.control-bar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
`;

const ERROR_HISTORY_CSS = `
.error-cell{color:var(--color-error);font-size:0.8rem;cursor:pointer}
.error-truncated::after{content:' \\25BC';font-size:0.7rem}
.error-truncated.expanded::after{content:' \\25B2'}
.hist-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 1px}
.hist-pass{background:${tokens.color.chart.pass}}
.hist-fail{background:${tokens.color.chart.fail}}
.hist-skip{background:${tokens.color.chart.skip}}
.hist-other{background:var(--color-border-default)}
.hist-tooltip{display:none;position:absolute;background:#1f2937;color:#f9fafb;padding:8px 12px;border-radius:6px;font-size:0.75rem;white-space:nowrap;z-index:100;pointer-events:none}
.hist-cell{position:relative;cursor:default;white-space:nowrap}
.hist-cell:hover .hist-tooltip{display:block}

`;

const DETAIL_CSS = `
.detail-toggle{cursor:pointer;font-size:0.75rem;color:var(--color-info);margin-left:4px;user-select:none}
.detail-row{background:var(--color-surface-elevated)}
.detail-row td{padding:12px}
.detail-step-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--color-info);color:#fff;font-size:0.7rem;font-weight:700;margin-right:6px;flex-shrink:0}
.detail-screenshots{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.detail-screenshots figure{margin:0;text-align:center}
.detail-screenshots img{max-width:300px;border:1px solid var(--color-border-subtle);border-radius:4px}
.detail-screenshots figcaption{font-size:0.75rem;color:var(--color-text-muted);margin-top:4px}
.detail-logs{margin-top:8px}
.detail-logs pre{background:#1f2937;color:#e5e7eb;padding:8px 12px;border-radius:4px;font-size:0.75rem;overflow-x:auto;max-height:200px}
.detail-logs .log-count{font-size:0.7rem;color:var(--color-text-muted);margin-top:4px}
`;

const OVERFLOW_CSS = `
[data-overflow="true"]{display:none!important}
`;

const EMPTY_STATE_CSS = `
[data-component="empty-state"]{text-align:center;padding:48px 24px;background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px}
[data-component="empty-state"] [data-part="icon"]{font-size:48px;margin-bottom:16px;opacity:0.6}
[data-component="empty-state"] [data-part="title"]{font-size:1.25rem;font-weight:600;margin-bottom:8px;color:var(--color-text-primary)}
[data-component="empty-state"] [data-part="description"]{color:var(--color-text-secondary);margin-bottom:16px;max-width:480px;margin-left:auto;margin-right:auto}
[data-component="empty-state"] [data-part="action"]{display:inline-block;padding:8px 16px;background:var(--color-surface-elevated);border-radius:6px;font-size:0.875rem;color:var(--color-text-secondary)}
`;

const RECOMMENDED_ACTIONS_CSS = `
[data-component="recommended-actions"]{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.md}px}
[data-component="recommended-actions"] [data-part="title"]{font-weight:600;margin-bottom:8px;color:var(--color-text-primary)}
[data-component="recommended-actions"] [data-part="list"]{list-style:none;padding:0;margin:0}
[data-component="recommended-actions"] [data-component="action-item"]{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--color-border-subtle)}
[data-component="recommended-actions"] [data-component="action-item"]:last-child{border-bottom:none}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="error"]{border-left:3px solid var(--color-error);padding-left:12px}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="warn"]{border-left:3px solid var(--color-warn);padding-left:12px}
[data-component="recommended-actions"] [data-component="action-item"][data-severity="info"]{border-left:3px solid var(--color-info);padding-left:12px}
`;

const DASHBOARD_CSS = `
[data-dashboard]{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--color-text-primary);max-width:1200px;margin:0 auto;padding:20px}
[data-section]{margin-bottom:24px}
[data-section="summary"]{margin-bottom:32px}
[data-section="actions"]{margin-top:24px}

/* Health bar */
[data-component="health-bar"]{width:100%;height:8px;background:var(--color-border-subtle);border-radius:${tokens.borderRadius.sm}px;overflow:hidden;margin:${tokens.spacing.xs}px 0}
[data-component="health-bar"] .health-fill{height:100%;border-radius:${tokens.borderRadius.sm}px;transition:width 0.3s}

/* Developer profile */
[data-dashboard="developer-profile"] .category-breakdown h4{margin:0 0 8px;font-size:0.85rem;color:var(--color-text-secondary)}

/* Cross-squad benchmark */
[data-dashboard="cross-squad-benchmark"] .footer-note{font-size:0.8rem;color:var(--color-text-muted);margin-top:8px}

/* Traceability Dashboard */
[data-dashboard="traceability"] [data-section="awareness"]{margin-top:20px;background:var(--color-surface-card);border-radius:8px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
[data-dashboard="traceability"] [data-component="awareness-category"]{margin:8px 0}
[data-dashboard="traceability"] [data-part="category-name"]{font-weight:600;text-transform:capitalize}
[data-dashboard="traceability"] [data-component="entity"]{font-size:0.8rem;color:var(--color-text-secondary);margin:2px 0}
[data-dashboard="traceability"] [data-part="confidence"]{color:var(--color-text-muted);font-size:0.72rem;margin-left:6px}
[data-dashboard="traceability"] [data-part="min-confidence"]{margin-top:8px;font-size:0.78rem;color:var(--color-text-muted)}
[data-dashboard="traceability"] [data-component="tree"]{margin-top:16px}
[data-dashboard="traceability"] [data-component="epic"]{margin-bottom:12px;background:var(--color-surface-card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden}
[data-dashboard="traceability"] [data-component="epic"] [data-part="header"],[data-dashboard="traceability"] [data-component="story"] [data-part="header"]{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;transition:background 0.15s;flex-wrap:wrap}
[data-dashboard="traceability"] [data-component="epic"] [data-part="header"]{background:var(--color-surface-elevated);font-weight:600;font-size:0.95rem}
[data-dashboard="traceability"] [data-component="epic"] [data-part="header"]:hover,[data-dashboard="traceability"] [data-component="story"] [data-part="header"]:hover{background:var(--color-surface-input)}
[data-dashboard="traceability"] [data-part="toggle-icon"]{font-size:0.6rem;transition:transform 0.2s;color:var(--color-text-muted)}
[data-dashboard="traceability"] .collapsed>[data-part="toggle-icon"]{transform:rotate(-90deg)}
[data-dashboard="traceability"] .collapsed>[data-part="stories"],[data-dashboard="traceability"] .collapsed>[data-part="tests"]{display:none}
[data-dashboard="traceability"] [data-component="story"]{border-top:1px solid var(--color-border-subtle)}
[data-dashboard="traceability"] [data-component="story"] [data-part="header"]{font-size:0.85rem;font-weight:500;padding-left:28px}
[data-dashboard="traceability"] [data-component="story"] [data-part="tests"]{padding:4px 0 8px 56px}
[data-dashboard="traceability"] [data-part="stat"]{font-size:0.75rem;color:var(--color-text-secondary);white-space:nowrap}
[data-dashboard="traceability"] [data-component="test-row"]{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;margin:2px 0;font-size:0.825rem;transition:background 0.15s}
[data-dashboard="traceability"] [data-component="test-row"]:hover{background:var(--color-surface-elevated)}
[data-dashboard="traceability"] [data-component="test-row"] [data-part="icon"]{font-size:0.85rem;width:18px;text-align:center}
[data-dashboard="traceability"] [data-component="test-row"] [data-part="title"]{flex:1;color:var(--color-text-primary);word-break:break-word}
[data-dashboard="traceability"] [data-component="test-row"] [data-part="meta"]{font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap}
[data-dashboard="traceability"] [data-component="test-row"] [data-part="flakiness"]{font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap}
`;

const LAYOUT_CSS = `
[data-component="container"]{background:var(--color-surface-page);padding:${tokens.spacing.xl}px;max-width:1200px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--color-text-primary);min-height:100vh}
[data-component="container"][data-variant="card"]{background:var(--color-surface-card)}
[data-component="section"]{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.lg}px;box-shadow:${tokens.shadow.card};margin-bottom:${tokens.spacing.lg}px}
[data-component="section"][data-variant="default"]{background:transparent;box-shadow:none;border-radius:0}
[data-component="section"] [data-part="section-title"]{font-size:${tokens.fontSize.lg};font-weight:${tokens.fontWeight.semibold};margin-bottom:${tokens.spacing.sm}px;color:var(--color-text-primary)}
[data-component="grid"]{display:grid;gap:${tokens.spacing.md}px}
[data-component="flex-row"]{display:flex;gap:${tokens.spacing.md}px;align-items:center;flex-wrap:wrap}
[data-component="separator"]{border:none;border-top:1px solid var(--color-border-subtle);margin:${tokens.spacing.lg}px 0}
`;

const CARD_CSS = `
[data-component="card"]{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.lg}px ${tokens.spacing.xl}px;box-shadow:${tokens.shadow.card};color:var(--color-text-primary)}
[data-component="card"][data-variant="elevated"]{box-shadow:${tokens.shadow.elevated}}
[data-component="card"][data-variant="bordered"]{border:1px solid var(--color-border-default)}
[data-component="card"][data-severity="success"]{border-left:4px solid var(--color-success)}
[data-component="card"][data-severity="error"]{border-left:4px solid var(--color-error)}
[data-component="card"][data-severity="warn"]{border-left:4px solid var(--color-warn)}
[data-component="card"][data-severity="info"]{border-left:4px solid var(--color-info)}
[data-component="card"] [data-part="icon"]{margin-right:${tokens.spacing.xs}px}
[data-component="card"] [data-part="title"]{font-size:${tokens.fontSize.lg};font-weight:${tokens.fontWeight.semibold};margin-bottom:${tokens.spacing.sm}px;color:var(--color-text-primary)}
[data-component='metric-card']{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${tokens.spacing.lg}px ${tokens.spacing.xl}px;box-shadow:${tokens.shadow.card};min-width:100px;text-align:center}
[data-component='metric-card'][data-align='left']{text-align:left}
[data-component='metric-card'] [data-part='icon']{font-size:${tokens.fontSize.xl};margin-bottom:${tokens.spacing.xs}px}
[data-component='metric-card'] [data-part='label']{font-size:${tokens.fontSize.xs};text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:${tokens.spacing.xs}px}
[data-component='metric-card'] [data-part='value']{font-size:${tokens.fontSize['2xl']};font-weight:${tokens.fontWeight.bold}}
[data-component='metric-card'] [data-part='trend']{font-size:${tokens.fontSize.xs};color:var(--color-text-muted);margin-top:${tokens.spacing.xs}px}
[data-component="card-grid"]{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:${tokens.spacing.md}px}
[data-component="metric-grid"]{display:flex;gap:${tokens.spacing.md}px;flex-wrap:wrap;margin-bottom:${tokens.spacing.xl}px}
`;

const BADGE_CSS = `
[data-component="badge"]{display:inline-block;padding:2px 8px;border-radius:${tokens.borderRadius.pill}px;font-size:${tokens.fontSize.sm};font-weight:${tokens.fontWeight.semibold};line-height:1.4;vertical-align:middle}
[data-component="badge"][data-variant="pass"]{background:var(--color-badge-pass-bg);color:var(--color-badge-pass-text)}
[data-component="badge"][data-variant="fail"]{background:var(--color-badge-fail-bg);color:var(--color-badge-fail-text)}
[data-component="badge"][data-variant="skip"]{background:var(--color-badge-skip-bg);color:var(--color-badge-skip-text)}
[data-component="badge"][data-variant="info"]{background:var(--color-info);color:#ffffff}
[data-component="badge"][data-variant="warn"]{background:var(--color-warn);color:#333333}
[data-component="badge"][data-variant="default"]{background:var(--color-border-subtle);color:var(--color-text-secondary)}
`;

const TABLE_COMPONENT_CSS = `
[data-component='table-wrapper']{overflow-x:auto;border-radius:${tokens.borderRadius.lg}px;box-shadow:${tokens.shadow.card}}
[data-component='data-table']{width:100%;border-collapse:collapse;background:var(--color-surface-card);font-size:${tokens.fontSize.lg};color:var(--color-text-primary)}
[data-component='data-table'] caption{caption-side:bottom;font-size:${tokens.fontSize.xs};color:var(--color-text-muted);padding:${tokens.spacing.sm}px;text-align:left}
[data-component='data-table'] thead{background:var(--color-surface-elevated)}
[data-component='data-table'] th{padding:${tokens.spacing.sm}px ${tokens.spacing.md}px;text-align:left;font-size:${tokens.fontSize.sm};text-transform:uppercase;color:var(--color-text-secondary);white-space:nowrap;border-bottom:2px solid var(--color-border-subtle)}
[data-component='data-table'] td{padding:${tokens.spacing.sm}px ${tokens.spacing.md}px;font-size:${tokens.fontSize.md};color:var(--color-text-primary);border-bottom:1px solid var(--color-border-subtle)}
[data-component='data-table'] tr:hover{background:var(--color-surface-elevated)}
[data-component='data-table'] tr[data-clickable="true"]{cursor:pointer}
`;

const CHART_COMPONENT_CSS = `
[data-component='bar-chart']{max-width:100%;height:auto}
[data-component='trend-chart']{max-width:100%;height:auto}
[data-component='sparkline']{display:inline-block;vertical-align:middle}
[data-component='sparkline'] span{display:inline-block;border-radius:${tokens.borderRadius.pill}px;overflow:hidden}
[data-component='progress-bar']{height:8px;background:var(--color-border-subtle);border-radius:${tokens.borderRadius.sm}px;overflow:hidden;margin:${tokens.spacing.xs}px 0}
[data-component='progress-bar'] div{height:100%;border-radius:${tokens.borderRadius.sm}px;transition:width 0.3s}
`;

const FORM_COMPONENT_CSS = `
[data-component='filter-bar']{display:flex;gap:${tokens.spacing.sm}px;align-items:center;margin-bottom:${tokens.spacing.md}px}
[data-component='search-input']{padding:${tokens.spacing.xs}px ${tokens.spacing.sm}px;border:1px solid var(--color-border-default);border-radius:${tokens.borderRadius.md}px;font-size:${tokens.fontSize.md};background:var(--color-surface-input);color:var(--color-text-primary);flex:1;min-width:150px;outline:none;transition:border-color 0.15s}
[data-component='search-input']:focus{border-color:var(--color-info)}
[data-component='button']{padding:${tokens.spacing.xs}px ${tokens.spacing.md}px;border-radius:${tokens.borderRadius.md}px;font-size:${tokens.fontSize.md};font-family:${tokens.fontFamily};transition:all 0.15s;cursor:pointer}
[data-component='button'][data-variant='default']{background:var(--color-surface-input);color:var(--color-text-primary);border:1px solid var(--color-border-default)}
[data-component='button'][data-variant='primary']{background:var(--color-info);color:#ffffff;border:none}
[data-component='button'][data-variant='ghost']{background:transparent;color:var(--color-text-primary);border:none}
[data-component='button']:disabled{opacity:0.5;cursor:default}
[data-component='button-group']{display:flex;gap:${tokens.spacing.xs}px}
[data-component='label']{font-size:${tokens.fontSize.xs};text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:${tokens.spacing.xs}px;display:block}
`;

const RESPONSIVE_TABLE_CSS = `
@media(max-width:600px){
  [data-component='data-table'] thead{display:none}
  [data-component='data-table'] tr{display:block;margin-bottom:1rem;border:1px solid var(--color-border-subtle);border-radius:${tokens.borderRadius.lg}px}
  [data-component='data-table'] td{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--color-border-subtle)}
  [data-component='data-table'] td::before{content:attr(data-label);font-weight:600;color:var(--color-text-secondary)}
  [data-component='data-table'] td:last-child{border-bottom:none}
}

/* Trend summary */
[data-section="trend"] p{font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:16px}

/* Stale issues description */
[data-dashboard="backlog-health"] [data-part="stale-description"]{font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:8px}

/* Health bar */
[data-component="health-bar"]{flex:1;min-width:80px;max-width:120px;height:6px;background:var(--color-surface-input);border-radius:3px;overflow:hidden}
[data-component="health-bar"] [data-part="fill"]{height:100%;border-radius:3px;transition:width 0.3s}

/* Dashboard-specific styles */
[data-dashboard='ai-effectiveness'] [data-section='version-breakdown'] table{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px}
[data-dashboard='ai-effectiveness'] [data-section='trend'] table{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px}
[data-dashboard='flakiness'] [data-section='source-quality']{background:var(--color-info);border-left:4px solid var(--color-info);padding:12px;border-radius:${tokens.borderRadius.lg}px}
[data-dashboard='flakiness'] [data-component='data-table'] [data-severity='high']{background:var(--color-error)}
[data-dashboard='backlog-health'] [data-component='issue-list']{list-style:none;padding:0;margin:0}
[data-dashboard='backlog-health'] [data-component='issue-item']{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border-subtle)}
[data-dashboard='incident-report'] [data-section='severity']{background:var(--color-error);color:white;padding:12px;border-radius:${tokens.borderRadius.lg}px;text-align:center;font-weight:600}
[data-dashboard='incident-report'] [data-component='card'][data-severity='error']{border-left:4px solid var(--color-error)}
[data-dashboard='incident-report'] [data-component='card'][data-severity='warn']{border-left:4px solid var(--color-warn)}
[data-dashboard='incident-report'] [data-component='card'][data-severity='info']{border-left:4px solid var(--color-info)}
[data-dashboard='impact-alert'] [data-component='card']{margin-bottom:12px}
[data-dashboard='traceability'] [data-component='tree']{margin-top:16px}
[data-dashboard='traceability'] [data-component='epic']{margin-bottom:12px;background:var(--color-surface-card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden}
[data-dashboard='traceability'] [data-component='story']{border-top:1px solid var(--color-border-subtle)}
[data-dashboard='traceability'] [data-component='test-row']{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;margin:2px 0;font-size:0.825rem;transition:background 0.15s}
[data-dashboard='traceability'] [data-component='test-row']:hover{background:var(--color-surface-elevated)}
[data-dashboard='ai-comparison'] [data-section='advantage']{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:16px;margin-bottom:16px}
[data-dashboard='release-score'] [data-section='score']{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:16px;margin-bottom:16px}
[data-dashboard='silent-regression'] [data-component='data-table']{background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px}
`;

const INLINE_STYLES_CSS = `
.section-label{font-weight:600;margin-bottom:6px;font-size:0.8rem;text-transform:uppercase;color:var(--color-text-muted)}
.tree-node-hint{margin-top:6px;font-style:italic;color:var(--color-text-muted)}
.timeline-label{margin-bottom:8px;font-size:0.8rem}
.timeline-toggle{font-size:0.75rem;margin-left:8px}
.suite-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.timeline-duration{font-size:0.75rem;color:var(--color-text-muted);flex-shrink:0}
.llm-warn{color:#ca8a04;font-size:0.8rem}
.llm-confidence{font-size:0.8rem;margin-bottom:8px}
.llm-content{white-space:pre-wrap;font-family:inherit;margin:0}
.qg-fail .label{color:var(--color-badge-fail-text);margin-bottom:4px}
.qg-fail p{margin:0;font-size:0.85rem;color:var(--color-text-primary)}
.failed-item{margin:4px 0}
.failed-header{margin-bottom:8px;color:var(--color-error)}
.breakdown-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border-subtle)}
.breakdown-row .label{font-size:0.75rem;white-space:nowrap;font-weight:600}
.breakdown-row .formula{font-size:0.75rem}
.breakdown-row .source{font-size:0.75rem;white-space:nowrap}
.breakdown-row .standard{font-size:0.75rem;white-space:nowrap}
.breakdown-row .threshold{font-size:0.7rem;color:var(--color-text-muted)}
.breakdown-row .score{font-weight:600}
.breakdown-row .score-text{color:var(--color-text-secondary);margin:0 4px;font-size:0.75rem}
.score-value{text-align:center;padding:16px 0;font-size:2.5rem;font-weight:800}
.score-grade{font-size:1rem;color:var(--color-text-secondary);margin-top:4px;text-transform:uppercase}
.score-details{margin-top:8px}
.score-recommendation{margin-top:12px;padding:10px;background:var(--color-surface-elevated);border-radius:${tokens.borderRadius.md}px;font-size:0.85rem;color:var(--color-text-secondary)}
.health-label{font-size:0.85rem;margin-bottom:12px}
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.health-badge{padding:4px 12px;border-radius:9999px;font-size:0.85rem;font-weight:600}
.health-meta{font-size:0.75rem;color:var(--color-text-muted)}
.dim-card{background:var(--color-bg-healthy);border-radius:6px;padding:10px 12px;margin-bottom:6px}
.dim-card.warn{background:var(--color-bg-warning)}
.dim-card.critical{background:var(--color-bg-critical)}
.dim-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.dim-label{font-size:0.75rem;color:var(--color-text-secondary)}
.dim-value{font-size:0.8rem;font-weight:700}
.dim-bar{height:6px;background:var(--color-border-subtle);border-radius:3px;overflow:hidden}
.dim-bar-fill{height:100%;border-radius:3px;transition:width 0.3s}
.qc-badge{padding:4px 12px;border-radius:9999px;font-size:0.85rem;font-weight:600}
.provenance{margin-top:12px;font-size:0.75rem}
.provenance summary{cursor:pointer;color:var(--color-text-muted);font-weight:600;padding:4px 0}
.provenance-table{width:100%;border-collapse:collapse;margin-top:8px;overflow-x:auto}
.provenance-table th{padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)}
.provenance-table td{padding:6px 8px;font-size:0.75rem;border-bottom:1px solid var(--color-border-subtle)}
.provenance-table td.override{text-align:center}
.provenance-override{border-top:1px solid var(--color-border-subtle)}
.provenance-toggle-icon{font-size:0.6rem;transition:transform 0.2s;color:var(--color-text-muted)}
.provenance-collapsed .provenance-toggle-icon{transform:rotate(-90deg)}
.provenance-hidden{display:none}
.metric-target{font-size:0.7rem;color:var(--color-text-muted);margin-top:4px}
.categories-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.category-breakdown{margin-top:16px}
.category-item{display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:0.8rem}
.category-name{font-weight:500;color:var(--color-text-secondary);text-transform:capitalize}
.category-count{font-weight:600}
.category-bar{width:60px;height:6px;background:var(--color-border-subtle);border-radius:3px;overflow:hidden;margin-left:8px;flex-shrink:0}
.category-fill{height:100%;background:var(--color-info);border-radius:3px;transition:width 0.3s}
.category-pct{font-size:0.7rem;color:var(--color-text-muted);min-width:32px;text-align:right}

/* Coverage gap report */
.qg-label-pass{color:var(--color-badge-pass-text);margin-bottom:4px}
.qg-label-fail{color:var(--color-badge-fail-text);margin-bottom:4px}
.qg-value-pass{font-size:1rem;font-weight:600;color:var(--color-badge-pass-text)}
.qg-value-fail{font-size:1rem;font-weight:600;color:var(--color-badge-fail-text)}
.qg-failing-list{margin:8px 0 0;font-size:0.85rem;padding-left:20px}
.qg-failing-item{color:var(--color-badge-fail-text)}
.epic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px}
.epic-title{font-weight:600;font-size:0.9rem;margin-bottom:4px}
.epic-summary{font-size:0.75rem;color:var(--color-text-muted);margin-bottom:8px}
.epic-stats{display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px}
.hierarchy-empty{font-size:0.85rem;color:var(--color-text-muted)}
.hierarchy-summary{color:var(--color-text-muted);font-size:0.8rem}
.hierarchy-pct{float:right;font-size:0.8rem;font-weight:600;color:var(--hierarchy-color,var(--color-text-primary))}
.tree-children-hidden{display:none}
.gaps-empty{color:var(--color-success);font-weight:600}
.gaps-table-wrapper{overflow-x:auto;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.gap-row-border{border-bottom:1px solid var(--color-border-subtle)}

/* Report table */
.steps-wrapper{margin-bottom:8px}
.step-row{display:flex;gap:6px;align-items:flex-start;margin:4px 0}
.step-icon{flex-shrink:0}
.step-icon-row{display:flex;gap:6px;align-items:center}
.category-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:4px}
.category-badge-dynamic{background:var(--badge-bg);color:var(--badge-color)}
.flakiness-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:4px;background:var(--badge-bg);color:var(--badge-color)}
.flakiness-dash{color:var(--color-text-muted)}
.thead-colored{background:var(--color-surface-elevated)}
.th-cell{padding:var(--th-padding);font-size:var(--th-font-size);text-transform:uppercase;color:var(--color-text-secondary);white-space:nowrap;border-bottom:2px solid var(--color-border-subtle)}
.control-bar-top{margin-top:8px}
.detail-row-hidden{display:none}

/* Report sections */
.timeline-bar-width{width:var(--bar-width)}
.timeline-item{margin:4px 0}
.score-color{color:var(--score-color)}
.score-value-number-color{color:var(--score-color)}
.dim-card-bg{background:var(--dim-bg)}
.dim-value-color{color:var(--dim-color)}
.dim-bar-fill-width{width:var(--bar-width);background:var(--bar-color)}
.health-label-large{margin-bottom:12px;font-size:1rem}
.health-overall-value{font-size:2.5rem;font-weight:800;color:var(--overall-color)}
.health-grade-text{font-size:0.8rem;color:var(--color-text-muted);text-transform:capitalize}
.qc-badge-dynamic{background:var(--qc-bg);color:var(--qc-color)}

/* Report HTML */
.timestamp-wrapper{text-align:center;margin-top:12px}
.timestamp-link{display:inline-block;padding:8px 16px;background:var(--color-surface-elevated);border-radius:6px;color:var(--color-text-primary);text-decoration:none;font-size:0.85rem}
.timestamp-link:hover{background:var(--color-surface-hover)}
.timestamp-icon{color:inherit}
.page-grid{display:flex;gap:0}
.page-grid-sidebar{flex:1;min-width:0}
.summary-row{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem}
.timestamp-small{font-size:0.7rem;color:var(--color-text-muted)}
.section-header-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.section-title-bold{font-weight:700}
.summary-cards-grid{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}

/* Diff report */
.diff-row{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem}
.diff-file-name{color:var(--color-text-muted);font-size:0.75rem;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.diff-title{margin-bottom:12px;font-size:1rem}
.diff-section{margin-bottom:8px}
.diff-section-spaced{margin-top:8px}

/* Chart legend */
.dot-pass{background:var(--color-chart-pass)}
.dot-fail{background:var(--color-chart-fail)}
.dot-skip{background:var(--color-chart-skip)}

/* Utils */
.metric-subtitle{font-size:0.75rem;color:var(--color-text-muted);font-weight:400}
`;

const PRINT_CSS = `
@media print{.control-bar,.detail-toggle,.sidebar,.tabs{display:none!important}body{padding:0}}
`;

/* Responsive breakpoints */
const RESPONSIVE_CSS = `
@media(max-width:${tokens.breakpoint.md}px){
  .sidebar{float:none;width:auto;margin-right:0}
  .card{min-width:auto}
  .detail-screenshots img{max-width:100%}
}
@media(max-width:${tokens.breakpoint.sm}px){
  h1{font-size:1.2rem}
  .tabs{flex-wrap:wrap}
  .tab-btn{flex:1;text-align:center}
}
`;

export function buildCss(): string {
    return (
        buildCssVars() +
        BASE_LAYOUT_CSS +
        CHART_CSS +
        TABS_SIDEBAR_CSS +
        TABLE_CSS +
        ERROR_HISTORY_CSS +
        DETAIL_CSS +
        OVERFLOW_CSS +
        EMPTY_STATE_CSS +
        RECOMMENDED_ACTIONS_CSS +
        DASHBOARD_CSS +
        LAYOUT_CSS +
        CARD_CSS +
        BADGE_CSS +
        TABLE_COMPONENT_CSS +
        CHART_COMPONENT_CSS +
        FORM_COMPONENT_CSS +
        RESPONSIVE_TABLE_CSS +
        INLINE_STYLES_CSS +
        PRINT_CSS +
        RESPONSIVE_CSS +
        buildDarkVars()
    );
}
