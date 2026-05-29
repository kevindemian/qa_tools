import { getTheme } from './theme';

export function buildCss(): string {
    const t = getTheme();
    return (
        `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }
.wrapper { max-width: 100%; overflow-x: auto; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; }
.card .label { font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
.card .value { font-size: 1.5rem; font-weight: 700; }
.card .value.pass { color: ` +
        t.colors.success +
        `; }
.card .value.fail { color: ` +
        t.colors.error +
        `; }
.card .value.skip { color: ` +
        t.colors.warn +
        `; }
.chart-box { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.failed-summary { box-shadow: inset 4px 0 0 0 ` +
        t.colors.error +
        `; }
.legend { display: flex; gap: 16px; margin-top: 8px; font-size: 0.8rem; }
.legend span { display: flex; align-items: center; gap: 4px; }
.legend .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
td { padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; }
.control-bar { margin-bottom: 12px; }
.control-bar button { padding: 4px 12px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.control-bar button:hover { background: #f3f4f6; }
input { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.8rem; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-passed { background: #dcfce7; color: #166534; }
.status-failed { background: #fecaca; color: #991b1b; }
.status-skipped { background: #fef9c3; color: #854d0e; }
tr:hover { background: #f9fafb; }
tr:nth-child(even) { background: #f8fafc; }
tr:nth-child(even):hover { background: #f1f5f9; }
.row-passed { display: table-row; }
.footer { margin-top: 16px; font-size: 0.75rem; color: #4b5563; text-align: center; }
.error-cell { color: #991b1b; font-size: 0.8rem; cursor: pointer; }
.error-truncated::after { content: ' \\25BC'; font-size: 0.7rem; }
.error-truncated.expanded::after { content: ' \\25B2'; }
.hist-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 1px; }
.hist-pass { background: #22c55e; }
.hist-fail { background: #ef4444; }
.hist-skip { background: #facc15; }
.hist-other { background: #d1d5db; }
.hist-tooltip { display: none; position: absolute; background: #1f2937; color: #f9fafb; padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; white-space: nowrap; z-index: 100; pointer-events: none; }
.hist-cell { position: relative; cursor: default; white-space: nowrap; }
.hist-cell:hover .hist-tooltip { display: block; }
.ki-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 0.7rem; font-weight: 600; margin-left: 4px; vertical-align: middle; }
.ki-suppressed { opacity: 0.6; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.tab-btn { padding: 6px 14px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 0.8rem; }
.tab-btn:hover { background: #f3f4f6; }
.tab-btn.active { background: #e5e7eb; border-bottom-color: #e5e7eb; font-weight: 600; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.mini-trend { margin-bottom: 20px; }
.mini-trend svg { max-width: 100%; height: auto; }
.sidebar { float: left; width: 220px; margin-right: 16px; margin-bottom: 16px; background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.85rem; }
.sidebar .tree-node { padding: 4px 8px; cursor: pointer; border-radius: 4px; margin: 2px 0; }
.sidebar .tree-node:hover { background: #f3f4f6; }
.sidebar .tree-node.active { background: #e0e7ff; color: #4338ca; font-weight: 600; }
.timeline-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 0.85rem; cursor: pointer; }
.timeline-row:hover { background: #f9fafb; }
.timeline-bar { height: 16px; border-radius: 3px; min-width: 4px; flex-shrink: 0; }
.detail-toggle { cursor: pointer; font-size: 0.75rem; color: #6366f1; margin-left: 4px; user-select: none; }
.detail-row { background: #f8fafc; }
.detail-row td { padding: 12px; }
.detail-step-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #6366f1; color: #fff; font-size: 0.7rem; font-weight: 700; margin-right: 6px; flex-shrink: 0; }
.detail-screenshots { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
.detail-screenshots figure { margin: 0; text-align: center; }
.detail-screenshots img { max-width: 300px; border: 1px solid #e5e7eb; border-radius: 4px; }
.detail-screenshots figcaption { font-size: 0.75rem; color: #6b7280; margin-top: 4px; }
.detail-logs { margin-top: 8px; }
.detail-logs pre { background: #1f2937; color: #e5e7eb; padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; overflow-x: auto; max-height: 200px; }
.detail-logs .log-count { font-size: 0.7rem; color: #6b7280; margin-top: 4px; }
.rate-good { color: ` +
        t.colors.success +
        `; }
.rate-warn { color: ` +
        t.colors.warn +
        `; }
.rate-bad { color: ` +
        t.colors.error +
        `; }
@media print { .control-bar, .detail-toggle, .sidebar, .tabs { display: none !important; } body { padding: 0; } }
html.dark body { background: #0d1117; color: #c9d1d9; }
html.dark .card { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark .chart-box { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark .card .label { color: #8b949e; }
html.dark table { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark th { background: #1c2128; color: #8b949e; }
html.dark td { border-top-color: #30363d; }
html.dark .footer { color: #8b949e; }
html.dark .control-bar button { background: #21262d; color: #c9d1d9; border-color: #30363d; }
html.dark .control-bar button:hover { background: #30363d; }
html.dark .status-passed { background: #052e16; color: #4ade80; }
html.dark .status-failed { background: #450a0a; color: #f87171; }
html.dark .status-skipped { background: #451a03; color: #fbbf24; }
html.dark tr:hover { background: #1c2128; }
html.dark tr:nth-child(even) { background: #1c2128; }
html.dark tr:nth-child(even):hover { background: #21262d; }
html.dark .error-cell { color: #f87171; }
html.dark .ki-badge { background: #451a03; color: #fbbf24; }
html.dark .sidebar { background: #161b22; }
html.dark .sidebar .tree-node:hover { background: #1c2128; }
html.dark .sidebar .tree-node.active { background: #1e1b4b; color: #a5b4fc; }
html.dark .timeline-row:hover { background: #1c2128; }
html.dark .detail-row { background: #1c2128; }
html.dark .detail-screenshots img { border-color: #30363d; }
html.dark .tab-btn { background: #21262d; color: #c9d1d9; border-color: #30363d; }
html.dark .tab-btn:hover { background: #30363d; }
html.dark .tab-btn.active { background: #161b22; border-bottom-color: #161b22; }
`
    );
}

export function buildThemeScript(theme?: string): string {
    return `<script id="qa-report-theme">
(function() {
    var theme = '${theme || 'system'}';
    function apply(t) {
        if (t === 'dark') { document.documentElement.classList.add('dark'); }
        else if (t === 'light') { document.documentElement.classList.remove('dark'); }
        else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.classList.add('dark'); }
    }
    apply(theme);
})();
function toggleTheme() {
    var html = document.documentElement;
    html.classList.toggle('dark');
    var isDark = html.classList.contains('dark');
    try { localStorage.setItem('qa-theme', isDark ? 'dark' : 'light'); } catch(e) {}
}
</script>`;
}
