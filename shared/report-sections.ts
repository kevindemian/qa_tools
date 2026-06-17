/**
 * UI section builders for HTML reports — summary cards, filter bar, tabs,
 * sidebar, timeline, quality gate, LLM analysis, and failed-test summary.
 *
 * All visual output uses design tokens via component primitives.
 *
 * @module report-sections
 */

import { escapeHtml, fmtDuration, pctSub, pctClass } from './report-utils.js';
import { extractSuite } from './report-types.js';
import type { FlatTest } from './result_parser.js';
import type { HealthScoreResult, HealthScoreProvenance } from './types.js';
import type { TestRunTab, TestHistoryRun, ReportOptions, ReportStats } from './report-types.js';
import { buildTestTable } from './report-table.js';
import { MetricCard, MetricGrid, Card, Badge } from './primitives/index.js';
import { FilterBar, SearchInput, Button } from './primitives/index.js';
import { tokens } from './theme-tokens.js';

export function buildTabs(runs: TestRunTab[]): string {
    if (runs.length <= 1) return '';
    let html = '<div id="envTabs" class="tabs">';
    for (let i = 0; i < runs.length; i++) {
        html +=
            '<button class="tab-btn' +
            (i === 0 ? ' active' : '') +
            '" onclick="switchTab(' +
            i +
            ')">' +
            escapeHtml(runs[i]?.name ?? '') +
            '</button>';
    }
    html += '</div>';
    return html;
}

export function buildTabContents(
    runs: TestRunTab[],
    categories?: Record<string, string>,
    history?: Record<string, TestHistoryRun[]>,
    flakinessMap?: Record<string, number>,
): string {
    if (runs.length <= 1) return '';
    let html = '<div id="tabContents">';
    let tabIdx = 0;
    for (const run of runs) {
        html += '<div id="tabContent-' + tabIdx + '" class="tab-content' + (tabIdx === 0 ? ' active' : '') + '">';
        html += buildFilterBar();
        html += buildTestTable(run.tests, categories, history, flakinessMap);
        html += '</div>';
        tabIdx++;
    }
    html += '</div>';
    return html;
}

export function buildHierarchySidebar(tests: FlatTest[]): string {
    const suites = new Set<string>();
    for (const t of tests) {
        const suite = extractSuite(t);
        if (suite) suites.add(suite);
    }
    if (suites.size === 0) return '';
    const sorted = Array.from(suites).sort();
    let html = '<div class="sidebar">';
    html +=
        '<div style="font-weight:600;margin-bottom:6px;font-size:0.8rem;text-transform:uppercase;color:var(--color-text-muted)">Suites</div>';
    for (const suite of sorted) {
        html +=
            '<div class="tree-node" onclick="filterByHierarchy(\'' +
            escapeHtml(suite) +
            '\')">' +
            escapeHtml(suite) +
            '</div>';
    }
    html +=
        '<div class="tree-node" onclick="clearHierarchy()" style="margin-top:6px;font-style:italic;color:var(--color-text-muted)">Clear filter</div>';
    html += '</div>';
    return html;
}

interface SuiteAggregate {
    suite: string;
    passed: number;
    failed: number;
    skipped: number;
    totalDuration: number;
    tests: FlatTest[];
}

function aggregateBySuite(tests: FlatTest[]): SuiteAggregate[] {
    const map = new Map<string, SuiteAggregate>();
    for (const t of tests) {
        const suite = extractSuite(t) || '(root)';
        let agg = map.get(suite);
        if (!agg) {
            agg = { suite, passed: 0, failed: 0, skipped: 0, totalDuration: 0, tests: [] };
            map.set(suite, agg);
        }
        if (t.state === 'passed') agg.passed++;
        else if (t.state === 'failed') agg.failed++;
        else agg.skipped++;
        agg.totalDuration += t.duration;
        agg.tests.push(t);
    }
    return Array.from(map.values());
}

export function buildTimeline(tests: FlatTest[]): string {
    if (tests.length === 0) return '';
    const suites = aggregateBySuite(tests);
    let maxDur = 0;
    for (const s of suites) {
        if (s.totalDuration > maxDur) maxDur = s.totalDuration;
    }
    if (maxDur === 0) maxDur = 1;
    let html = Card({
        children: '',
        role: 'region',
        ariaLabel: 'Test timeline',
    });
    const label =
        '<div class="label" style="margin-bottom:8px">Timeline <button id="timelineToggle" onclick="toggleTimeline()" style="font-size:0.75rem;margin-left:8px">Hide</button></div>';
    html = html.replace('<div data-part="body">', `<div data-part="body">${label}`);
    html += '<div id="timelineBody">';
    for (const s of suites) {
        const barW = Math.max(4, (s.totalDuration / maxDur) * 300);
        const total = s.passed + s.failed + s.skipped;
        const summary =
            s.failed > 0
                ? Badge({ variant: 'fail', children: String(s.failed) + ' failed' })
                : Badge({ variant: 'pass', children: String(total) + ' tests' });
        const suiteLabel = s.suite === '(root)' ? '(root)' : s.suite;
        html += '<div class="timeline-row" onclick="scrollToTest(\'' + escapeHtml(s.suite) + '\')">';
        html += summary;
        html +=
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escapeHtml(suiteLabel) +
            '</span>';
        html +=
            '<div class="timeline-bar" style="width:' +
            barW.toFixed(0) +
            'px;background:' +
            tokens.color.chart.pass +
            '"></div>';
        html +=
            '<span style="font-size:0.75rem;color:var(--color-text-muted);flex-shrink:0">' +
            fmtDuration(s.totalDuration) +
            '</span>';
        html += '</div>';
    }
    html += '</div></div>';
    return html;
}

export function buildSummaryCards(stats: ReportStats, passRate: number): string {
    return MetricGrid({
        children:
            MetricCard({
                label: 'Passed',
                value: String(stats.passed) + pctSub(stats.passed, stats.total),
                severity: 'success',
            }) +
            MetricCard({
                label: 'Failed',
                value: String(stats.failed) + pctSub(stats.failed, stats.total),
                severity: 'error',
            }) +
            MetricCard({
                label: 'Skipped',
                value: String(stats.skipped) + pctSub(stats.skipped, stats.total),
                severity: 'warn',
            }) +
            MetricCard({ label: 'Total', value: String(stats.total) }) +
            MetricCard({ label: 'Duration', value: fmtDuration(stats.duration) }) +
            MetricCard({
                label: 'Pass Rate',
                value: passRate.toFixed(1) + '%',
                severity: pctClass(passRate) === 'pass' ? 'success' : pctClass(passRate) === 'warn' ? 'warn' : 'error',
            }),
    });
}

export function buildLlmSection(options: ReportOptions): string {
    if (!options.llmAnalysis) return '';
    let content = '';
    if (options.llmFallback) {
        content =
            '<p style="color:#ca8a04;font-size:0.8rem">⚠ AI Analysis unavailable — displaying template report.</p>';
    } else if (options.llmConfidence) {
        const CONFIDENCE_BADGES: Record<string, string> = {
            high: '\ud83d\udfe2',
            medium: '\ud83d\udfe1',
            low: '\ud83d\udd34',
        };
        const badge = CONFIDENCE_BADGES[options.llmConfidence] || '\ud83d\udd34';
        content +=
            '<p style="font-size:0.8rem;margin-bottom:8px">Confian\u00e7a: ' +
            badge +
            ' ' +
            options.llmConfidence +
            '</p>';
    }
    content +=
        '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + escapeHtml(options.llmAnalysis) + '</pre>';
    return Card({
        title: 'AI Analysis',
        children: content,
        variant: 'default',
    });
}

export function buildQualityGate(passRate: number, threshold: number): string {
    if (passRate >= threshold) return '';
    return Card({
        variant: 'bordered',
        severity: 'error',
        children: `<div class="label" style="color:var(--color-badge-fail-text);margin-bottom:4px">❌ Quality Gate Failed</div>
<p style="margin:0;font-size:0.85rem;color:var(--color-text-primary)">Pass rate ${passRate.toFixed(1)}% is below the configured threshold of ${threshold}%.</p>`,
    });
}

export function buildFilterBar(): string {
    return FilterBar({
        children:
            SearchInput({ placeholder: 'Filter tests...' }) +
            Button({ children: 'Export CSV', onClick: 'exportCsv()' }) +
            Button({ children: 'PDF', onClick: 'window.print()' }) +
            Button({ children: '\ud83c\udf13', onClick: '_toggleTheme()', variant: 'ghost' }),
    });
}

export function buildFailedSummary(tests: FlatTest[], stats: ReportStats): string {
    if (stats.failed === 0) return '';
    const failed = tests.filter((t) => t.state === 'failed');
    let items = '';
    for (const t of failed) {
        items +=
            '<p style="margin:4px 0">\u2022 ' +
            escapeHtml(t.title) +
            ' ' +
            Badge({ variant: 'fail', children: 'failed' }) +
            ' (' +
            (t.state === 'skipped' ? '\u2014' : fmtDuration(t.duration)) +
            ')</p>';
    }
    return Card({
        variant: 'bordered',
        severity: 'error',
        ariaLabel: 'Failed tests summary',
        children:
            `<div class="label" style="margin-bottom:8px;color:var(--color-error)"><b>❌ Failed Tests (${stats.failed})</b></div>` +
            items,
    });
}

export function buildReleaseSection(
    score: number,
    grade: string,
    breakdown: Array<{ label: string; score: number; status: 'pass' | 'fail' }>,
    recommendation: string,
): string {
    const scoreColor = score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warn)' : 'var(--color-error)';

    let breakdownHtml = '';
    for (const item of breakdown) {
        const statusColor = item.status === 'pass' ? 'var(--color-success)' : 'var(--color-error)';
        const statusIcon = item.status === 'pass' ? '\u2713' : '\u2717';
        breakdownHtml +=
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border-subtle)">' +
            '<span style="color:var(--color-text-primary)">' +
            escapeHtml(item.label) +
            '</span>' +
            '<span style="font-weight:600">' +
            '<span style="color:' +
            statusColor +
            '">' +
            statusIcon +
            '</span> ' +
            '<span style="color:var(--color-text-secondary);margin:0 4px">' +
            item.score +
            '</span>' +
            Badge({
                variant: item.status === 'pass' ? 'pass' : 'fail',
                children: item.status,
            }) +
            '</span></div>';
    }

    return Card({
        variant: 'elevated',
        children:
            '<div id="release-readiness">' +
            '<div style="text-align:center;padding:16px 0">' +
            '<div style="font-size:' +
            tokens.fontSize['2xl'] +
            ';font-weight:' +
            tokens.fontWeight.bold +
            ';color:' +
            scoreColor +
            '">' +
            score +
            '</div>' +
            '<div style="font-size:' +
            tokens.fontSize.lg +
            ';color:var(--color-text-secondary);margin-top:4px;text-transform:uppercase">' +
            escapeHtml(grade) +
            '</div>' +
            '</div>' +
            '<div style="margin-top:8px">' +
            breakdownHtml +
            '</div>' +
            '<div style="margin-top:12px;padding:10px;background:var(--color-surface-elevated);border-radius:' +
            tokens.borderRadius.md +
            'px;font-size:0.85rem;color:var(--color-text-secondary)">' +
            escapeHtml(recommendation) +
            '</div>' +
            '</div>',
    });
}

function healthColor(score: number): string {
    if (score >= 80) return tokens.color.chart.pass;
    if (score >= 50) return tokens.color.semantic.warn.light;
    return tokens.color.chart.fail;
}

function healthBg(score: number): string {
    if (score >= 80) return '#f0fdf4';
    if (score >= 50) return '#fefce8';
    return '#fef2f2';
}

export function buildHealthSection(health: HealthScoreResult): string {
    const qcIcon = health.qualityGate === 'pass' ? '✅' : '❌';
    const qcText = health.qualityGate === 'pass' ? 'Pass' : 'Fail';
    const qcColor = health.qualityGate === 'pass' ? 'var(--color-badge-pass-text)' : 'var(--color-badge-fail-text)';
    const qcBg = health.qualityGate === 'pass' ? 'var(--color-badge-pass-bg)' : 'var(--color-badge-fail-bg)';
    const overallColor = healthColor(health.overall);
    const dims = health.dimensions;
    const dimEntries: Array<{ label: string; score: number; status: string }> = [
        { label: 'Pass Rate', score: dims.passRate.score, status: dims.passRate.status },
        { label: 'Flaky Rate', score: dims.flakyRate.score, status: dims.flakyRate.status },
        { label: 'Coverage', score: dims.coverage.score, status: dims.coverage.status },
        { label: 'Suite Speed', score: dims.suiteSpeed.score, status: dims.suiteSpeed.status },
        { label: 'Execution Rate', score: dims.executionRate.score, status: dims.executionRate.status },
    ];

    let dimCards = '';
    for (const d of dimEntries) {
        const barColor = healthColor(d.score);
        const bg = healthBg(d.score);
        const icon = d.status === 'pass' ? '✅' : '❌';
        dimCards += `<div style="background:${bg};border-radius:6px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:0.75rem;color:var(--color-text-secondary)">${d.label}</span>
                <span style="font-size:0.8rem;font-weight:700;color:${barColor}">${d.score} ${icon}</span>
            </div>
            <div style="height:6px;background:var(--color-border-subtle);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${d.score}%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
            </div>
        </div>`;
    }

    let provenanceHtml = '';
    if (health.provenance && health.provenance.length > 0) {
        provenanceHtml = buildProvenanceSection(health.provenance);
    }

    const html = Card({
        variant: 'default',
        children:
            `<div class="label" style="margin-bottom:12px;font-size:1rem">📊 Test Suite Health</div>` +
            `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:16px">` +
            `<div style="text-align:center;min-width:100px"><div style="font-size:2.5rem;font-weight:800;color:${overallColor}">${health.overall}</div>` +
            `<div style="font-size:0.8rem;color:var(--color-text-muted);text-transform:capitalize">${health.grade.replace(/_/g, ' ')}</div></div>` +
            `<span style="padding:4px 12px;border-radius:9999px;font-size:0.85rem;font-weight:600;background:${qcBg};color:${qcColor}">${qcIcon} Quality Gate: ${qcText}</span>` +
            `<span style="font-size:0.75rem;color:var(--color-text-muted)">${health.runCount} run(s) · ${health.timestamp.slice(0, 10)}</span>` +
            `</div>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">${dimCards}</div>` +
            provenanceHtml,
    });
    return html;
}

/** Renders provenance metadata as a compact collapsible section below the health score. */
export function buildProvenanceSection(provenance: HealthScoreProvenance): string {
    if (provenance.length === 0) return '';

    let rows = '';
    for (const entry of provenance) {
        const overrideBadge = entry.overridden ? Badge({ variant: 'warn', children: 'overridden' }) : '';
        rows += `<tr>
            <td style="padding:6px 8px;font-size:0.75rem;white-space:nowrap;font-weight:600">${escapeHtml(entry.dimension)}</td>
            <td style="padding:6px 8px;font-size:0.75rem">${escapeHtml(entry.formula)}</td>
            <td style="padding:6px 8px;font-size:0.75rem;white-space:nowrap">${escapeHtml(entry.source)}</td>
            <td style="padding:6px 8px;font-size:0.75rem;white-space:nowrap">${escapeHtml(entry.standard)}</td>
            <td style="padding:6px 8px;font-size:0.7rem;color:var(--color-text-muted)">${escapeHtml(entry.thresholdBasis)}</td>
            <td style="padding:6px 8px;text-align:center">${overrideBadge}</td>
        </tr>`;
    }

    return `<details style="margin-top:12px;font-size:0.75rem">
        <summary style="cursor:pointer;color:var(--color-text-muted);font-weight:600;padding:4px 0">
            📖 Methodology & References
        </summary>
        <div style="overflow-x:auto;margin-top:8px">
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="border-bottom:1px solid var(--color-border-subtle)">
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)">Dimension</th>
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)">Formula</th>
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)">Source</th>
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)">Standard</th>
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:left;color:var(--color-text-muted)">Threshold Basis</th>
                        <th style="padding:6px 8px;font-size:0.7rem;text-align:center;color:var(--color-text-muted)">Config</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </details>`;
}
