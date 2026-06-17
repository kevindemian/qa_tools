/**
 * CSS builder for HTML reports — generates styles from design tokens.
 *
 * Replaces hardcoded colors with CSS custom properties derived from
 * theme-tokens, enabling consistent dark/light theming across all report types.
 *
 * @module report-styles
 */

import { tokens } from './theme-tokens.js';

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
.tab-btn.active{background:var(--color-surface-elevated);border-bottom-color:var(--color-surface-elevated);font-weight:600}
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

const PRINT_CSS = `
@media print{.control-bar,.detail-toggle,.sidebar,.tabs{display:none!important}body{padding:0}}
`;

/* Responsive breakpoints */
const RESPONSIVE_CSS = `
@media(max-width:${tokens.breakpoint.md}px){
  .sidebar{float:none;width:auto;margin-right:0}
  .summary{flex-direction:column}
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
        PRINT_CSS +
        RESPONSIVE_CSS +
        buildDarkVars()
    );
}
