/** Self-contained HTML report for coverage gap analysis.
 *  Summary cards, per-epic progress bars, hierarchy tree, gaps table, quality gate section.
 *  Dark mode support via CSS class toggle. */
import type { CoverageGapResult, CoverageHierarchyNode } from './types';
import { rootLogger } from './logger';
import { sanitizeHtml } from './sanitize';

function cssThemeBlock(): string {
    return `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; max-width: 1200px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
h2 { font-size: 1.2rem; margin: 1rem 0 0.5rem; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; }
.card .label { font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
.card .value { font-size: 1.5rem; font-weight: 700; }
.gate-pass { border-left: 4px solid #22c55e; }
.gate-fail { border-left: 4px solid #ef4444; }
.progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin: 4px 0; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.epic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 20px; }
.epic-card { background: #fff; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.epic-card .epic-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
.epic-card .epic-meta { font-size: 0.75rem; color: #6b7280; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
.badge-pass { background: #dcfce7; color: #166534; }
.badge-fail { background: #fecaca; color: #991b1b; }
.tree { margin-bottom: 20px; }
.tree-node { margin: 4px 0; padding: 6px 10px; background: #fff; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.tree-children { margin-left: 20px; border-left: 2px solid #e5e7eb; padding-left: 12px; }
.tree-toggle { cursor: pointer; user-select: none; font-size: 0.8rem; color: #6366f1; margin-right: 6px; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
td { padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; }
tr:hover { background: #f9fafb; }
.status-yes { color: #22c55e; font-weight: 700; }
.status-no { color: #ef4444; font-weight: 700; }
.footer { margin-top: 16px; font-size: 0.75rem; color: #6b7280; text-align: center; }
html.dark body { background: #0d1117; color: #c9d1d9; }
html.dark .card { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark .epic-card { background: #161b22; }
html.dark .card .label { color: #8b949e; }
html.dark table { background: #161b22; }
html.dark th { background: #1c2128; color: #8b949e; }
html.dark td { border-top-color: #30363d; }
html.dark .tree-node { background: #161b22; }
html.dark .tree-children { border-left-color: #30363d; }
html.dark .progress-bar { background: #21262d; }
html.dark tr:hover { background: #1c2128; }
.control-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.control-bar button { padding: 4px 12px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.control-bar button:hover { background: #f3f4f6; }
html.dark .control-bar button { background: #21262d; color: #c9d1d9; border-color: #30363d; }
html.dark .control-bar button:hover { background: #30363d; }
#searchInput { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.8rem; flex: 1; }
html.dark #searchInput { background: #21262d; color: #c9d1d9; border-color: #30363d; }
@media print { .control-bar { display: none; } body { padding: 0; } }`;
}

function themeScript(theme?: string): string {
    return `<script>
(function(){var t='${theme || 'system'}';
function a(v){if(v==='dark')document.documentElement.classList.add('dark');
else if(v==='light')document.documentElement.classList.remove('dark');
else if(window.matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark');}
a(t);})();
function toggleTheme(){var h=document.documentElement;h.classList.toggle('dark');
try{localStorage.setItem('qa-theme',h.classList.contains('dark')?'dark':'light');}catch(e){if(typeof console!=='undefined')console.warn('Theme persistence failed:',e);}}</script>`;
}

function buildSummaryCards(result: CoverageGapResult): string {
    const t = result.totals;
    return `<div class="summary">
<div class="card"><div class="label">Total Issues</div><div class="value">${t.totalIssues}</div></div>
<div class="card"><div class="label">Covered</div><div class="value" style="color:#22c55e">${t.covered}</div></div>
<div class="card"><div class="label">Gaps</div><div class="value" style="color:#ef4444">${t.gap}</div></div>
<div class="card ${t.weightedCoveragePct >= 50 ? 'gate-pass' : 'gate-fail'}"><div class="label">Weighted Coverage</div><div class="value">${t.weightedCoveragePct}%</div></div>
<div class="card ${t.rawCoveragePct >= 50 ? 'gate-pass' : 'gate-fail'}"><div class="label">Raw Coverage</div><div class="value">${t.rawCoveragePct}%</div></div>
</div>`;
}

function buildQualityGateSection(result: CoverageGapResult): string {
    const gc = result.gateConfig;
    if (gc.failingEpics.length === 0) {
        return `<div class="card gate-pass" style="margin-bottom:16px;padding:12px 16px;background:#f0fdf4">
<div class="label" style="color:#166534">Quality Gate</div>
<div style="font-size:1rem;font-weight:600;color:#166534">All epics pass (min ${gc.minCoveragePct}%)</div></div>`;
    }
    return `<div class="card gate-fail" style="margin-bottom:16px;padding:12px 16px;background:#fef2f2">
<div class="label" style="color:#991b1b">Quality Gate</div>
<div style="font-size:1rem;font-weight:600;color:#991b1b">${gc.failingEpics.length} epic(s) below ${gc.minCoveragePct}% threshold</div>
<ul style="margin:8px 0 0;font-size:0.85rem">${gc.failingEpics.map((k) => '<li style="color:#991b1b">' + sanitizeHtml(k) + ' (' + sanitizeHtml(result.byEpic[k]?.rawPct + '%' || '') + ')</li>').join('')}</ul></div>`;
}

function buildEpicCards(result: CoverageGapResult): string {
    let html = '<div class="epic-grid">';
    for (const [key, epic] of Object.entries(result.byEpic)) {
        if (key === '__no_epic__') continue;
        const color = epic.weightedPct >= 50 ? '#22c55e' : '#ef4444';
        const badge = epic.gatePass
            ? '<span class="badge badge-pass">PASS</span>'
            : '<span class="badge badge-fail">FAIL</span>';
        html += '<div class="epic-card">';
        html += '<div class="epic-title">' + sanitizeHtml(key) + ' ' + badge + '</div>';
        html += '<div class="epic-meta">' + sanitizeHtml(epic.epicSummary) + '</div>';
        html += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-top:8px">';
        html += '<span>' + epic.covered + '/' + epic.total + ' covered</span>';
        html += '<span>Weighted: ' + epic.weightedPct + '%</span>';
        html += '</div>';
        html +=
            '<div class="progress-bar"><div class="progress-fill" style="width:' +
            epic.weightedPct +
            '%;background:' +
            color +
            '"></div></div>';
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function buildHierarchyHtml(nodes: CoverageHierarchyNode[], depth = 0): string {
    if (nodes.length === 0) return '<p style="font-size:0.85rem;color:#6b7280">No hierarchy data</p>';
    let html = '<div class="tree">';
    for (const node of nodes) {
        const color = node.coveragePct >= 50 ? '#22c55e' : '#ef4444';
        const hasChildren = node.children && node.children.length > 0;
        html += '<div class="tree-node">';
        if (hasChildren) {
            html += '<span class="tree-toggle" onclick="toggleTree(this)">▶</span>';
        }
        html +=
            '<strong>' +
            sanitizeHtml(node.key) +
            '</strong> <span style="color:#6b7280;font-size:0.8rem">' +
            sanitizeHtml(node.summary.slice(0, 60)) +
            '</span>';
        html +=
            '<span style="float:right;font-size:0.8rem;color:' +
            color +
            ';font-weight:600">' +
            node.coveragePct +
            '% (' +
            node.coveredIssues +
            '/' +
            node.totalIssues +
            ')</span>';
        if (hasChildren) {
            html += '<div class="tree-children" style="display:none">';
            html += buildHierarchyHtml(node.children, depth + 1);
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function buildGapsTable(result: CoverageGapResult): string {
    const gaps = result.items.filter((i) => !i.hasTest);
    if (gaps.length === 0) {
        return '<p style="color:#22c55e;font-weight:600">No coverage gaps found</p>';
    }
    let html =
        '<div class="control-bar"><input id="searchInput" type="text" placeholder="Filter gaps..." oninput="filterGaps()">';
    html += '<button onclick="toggleTheme()">🌓</button></div>';
    html +=
        '<table><thead><tr><th>Key</th><th>Summary</th><th>Type</th><th>Priority</th><th>Weight</th><th>Epic</th><th>Action</th></tr></thead><tbody>';
    for (const item of gaps) {
        html += '<tr class="gap-row">';
        html += '<td><strong>' + sanitizeHtml(item.issueKey) + '</strong></td>';
        html += '<td>' + sanitizeHtml(item.summary.slice(0, 80)) + '</td>';
        html += '<td>' + item.type + '</td>';
        html += '<td>' + item.priority + '</td>';
        html += '<td>' + item.coverageWeight + '</td>';
        html += '<td>' + (item.epicKey ? sanitizeHtml(item.epicKey) : '—') + '</td>';
        html += '<td><span class="status-no">GAP</span></td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function buildToggleScript(): string {
    return `<script>
function toggleTree(el) {
    var parent = el.parentElement;
    if (!parent) return;
    var children = parent.querySelector('.tree-children');
    if (children) {
        var hidden = children.style.display === 'none';
        children.style.display = hidden ? '' : 'none';
        el.textContent = hidden ? '▼' : '▶';
    }
}
function filterGaps() {
    var q = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.gap-row').forEach(function(r) {
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
</script>`;
}

export function generateCoverageGapHtml(result: CoverageGapResult, title?: string, theme?: string): string {
    try {
        const reportTitle = title || 'Coverage Gap Analysis';
        let html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
        html += '<title>' + sanitizeHtml(reportTitle) + '</title><style>' + cssThemeBlock() + '</style>';
        html += themeScript(theme);
        html += '</head><body>';
        html += '<h1>' + sanitizeHtml(reportTitle) + '</h1>';
        html += buildSummaryCards(result);
        html += buildQualityGateSection(result);
        html += '<h2>Coverage by Epic</h2>';
        html += buildEpicCards(result);
        html += '<h2>Hierarchy</h2>';
        html += buildHierarchyHtml(result.hierarchy);
        html += '<h2>Coverage Gaps (' + result.totals.gap + ')</h2>';
        html += buildGapsTable(result);
        html += '<div class="footer">Generated by QA Tools · ' + new Date().toISOString().slice(0, 10) + '</div>';
        html += buildToggleScript();
        html += '</body></html>';
        return html;
    } catch (err) {
        rootLogger.error('Failed to generate coverage gap HTML: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating coverage gap report</h1></body></html>';
    }
}
