/**
 * UI section builders for HTML reports — summary cards, filter bar, tabs,
 * sidebar, timeline, quality gate, LLM analysis, and failed-test summary.
 *
 * All visual output uses design tokens via component primitives.
 *
 * @module report-sections
 */

import { icon } from '../icons.js';
import { escapeHtml, fmtDuration, pctSub, pctClass } from './report-utils.js';
import { extractSuite } from './report-types.js';
import type { FlatTest } from '../result_parser.js';
import type { HealthScoreResult, HealthScoreProvenance } from '../types.js';
import type { TestRunTab, TestHistoryRun, ReportOptions, ReportStats } from './report-types.js';
import type { ComputedMetrics } from '../types/data-hub.js';
import type { QualityGateResult, QualityGateStatus } from '../quality/quality-gate.js';
import { buildTestTable } from './report-table.js';
import { MetricCard, MetricGrid, Card, Badge, EmptyState } from '../primitives/index.js';
import { FilterBar, SearchInput, Button } from '../primitives/index.js';
import { tokens } from '../ui/theme-tokens.js';
import {
    MIN_PASS_RATE,
    HEALTH_SCORE_GOOD,
    HEALTH_SCORE_WARN,
    SCORE_QUALITY_GATE,
    SCORE_CRITICAL,
} from '../constants/thresholds.js';

export function buildTabs(runs: TestRunTab[]): string {
    // legitimate: with <=1 runs there is no tab structure to render — this is UI chrome, not a data-absence payload; EmptyState would falsely claim "no data" when a run exists (Rule 25.3).
    if (runs.length <= 1) return '';
    let html = '<div id="envTabs" class="tabs">';
    for (const [i, run] of runs.entries()) {
        html +=
            '<button class="tab-btn' +
            (i === 0 ? ' active' : '') +
            '" onclick="switchTab(' +
            i +
            ')">' +
            escapeHtml(run.name) +
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
    // legitimate: with <=1 runs there is no tab-panel structure to render — UI chrome, not a data-absence payload (Rule 25.3).
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
    // legitimate: no suites to hierarchically navigate — this is sidebar UI chrome derived from suite metadata, not a data-absence payload for a section; EmptyState block is inappropriate in the sidebar strip (Rule 25.3 intent).
    if (suites.size === 0) return '';
    const sorted = Array.from(suites).sort((a, b) => a.localeCompare(b));
    let html = '<div class="sidebar">';
    html += '<div class="section-label">Suites</div>';
    for (const suite of sorted) {
        html +=
            '<div class="tree-node" onclick="filterByHierarchy(\'' +
            escapeHtml(suite) +
            '\')">' +
            escapeHtml(suite) +
            '</div>';
    }
    html += '<div class="tree-node tree-node-hint" onclick="clearHierarchy()">Clear filter</div>';
    html += '</div>';
    return html;
}

export function buildTimeline(tests: FlatTest[], computed?: ComputedMetrics): string {
    if (tests.length === 0) {
        // Rule 25: explicit no-data (timing unavailable) instead of silent omission.
        return EmptyState({
            title: 'No timeline data available',
            description: 'The test timeline requires per-suite execution durations. No tests were found to plot.',
            action: 'Run a test suite so the timeline can display per-suite timing.',
            icon: icon('clock', 16),
        });
    }
    const suites = computed?.suiteBreakdown ?? [];
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
        '<div class="label timeline-label">Timeline <button id="timelineToggle" onclick="toggleTimeline()" class="timeline-toggle">Hide</button></div>';
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
        html += '<span class="suite-name">' + escapeHtml(suiteLabel) + '</span>';
        html += '<div class="timeline-bar timeline-bar-width" style="--bar-width:' + barW.toFixed(0) + 'px"></div>';
        html += '<span class="timeline-duration">' + fmtDuration(s.totalDuration) + '</span>';
        html += '</div>';
    }
    html += '</div></div>';
    return html;
}

export function buildSummaryCards(stats: ReportStats, passRate: number, passRateThreshold?: number): string {
    const threshold = passRateThreshold ?? MIN_PASS_RATE;
    const sampleWarning =
        stats.total < 30 ? `Only ${stats.total} tests — results may not be statistically significant` : undefined;
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
            MetricCard({ label: 'Total', value: String(stats.total), sampleWarning }) +
            MetricCard({ label: 'Duration', value: fmtDuration(stats.duration) }) +
            MetricCard({
                label: 'Pass Rate',
                value: passRate.toFixed(1) + '%',
                severity: (() => {
                    const cls = pctClass(passRate);
                    if (cls === 'pass') return 'success';
                    if (cls === 'warn') return 'warn';
                    return 'error';
                })(),
                target: 'target: ' + threshold + '%',
            }),
    });
}

export function buildLlmSection(options: ReportOptions): string {
    // legitimate: LLM analysis section is a FEATURE TOGGLE (options.llmAnalysis), not a data-absence payload; EmptyState would falsely claim "no data" when the feature is merely disabled (Rule 25.3).
    if (!options.llmAnalysis) return '';
    let content = '';
    if (options.llmFallback) {
        content =
            '<p class="llm-warn">' +
            icon('alert-triangle', 14) +
            ' AI Analysis unavailable — displaying template report.</p>';
    } else if (options.llmConfidence) {
        const CONFIDENCE_BADGES: Record<string, string> = {
            high: '<span data-tone="confidence-high">' + icon('circle', 14) + '</span>',
            medium: '<span data-tone="confidence-medium">' + icon('circle', 14) + '</span>',
            low: '<span data-tone="confidence-low">' + icon('circle', 14) + '</span>',
        };
        const badge = CONFIDENCE_BADGES[options.llmConfidence] || CONFIDENCE_BADGES['low'];
        content += '<p class="llm-confidence">Confian\u00e7a: ' + badge + ' ' + options.llmConfidence + '</p>';
    }
    content += '<pre class="llm-content">' + escapeHtml(options.llmAnalysis) + '</pre>';
    return Card({
        title: 'AI Analysis',
        children: content,
        variant: 'default',
    });
}

const QG_STATUS_VARIANT: Record<QualityGateStatus, 'pass' | 'fail' | 'info'> = {
    pass: 'pass',
    fail: 'fail',
    unknown: 'info',
};

function qualityGateIcon(status: QualityGateStatus): string {
    if (status === 'pass') return icon('check-circle', 14);
    if (status === 'unknown') return icon('help-circle', 14);
    return icon('x-circle', 14);
}

/**
 * Structured HTML section for a `QualityGateResult` (single source of truth).
 * Replaces the raw `<pre>`/`formatQualityGateText` blocks previously rendered in
 * the interactive and schedule dashboards (B13) — no free-text `<pre>` output.
 * All user-derived strings are HTML-escaped; non-finite scores surface as `N/A`
 * (explicit, never a silent `0`) per Rule 24/25.
 */
export function buildQualityGateSection(result: QualityGateResult): string {
    const score = Number.isFinite(result.score) ? String(result.score) : 'N/A';
    const checks = result.checks
        .map((c) => {
            const cScore = Number.isFinite(c.score) ? String(c.score) : 'N/A';
            const cThreshold = Number.isFinite(c.threshold) ? String(c.threshold) : 'N/A';
            return (
                '<li data-part="quality-gate-check" data-status="' +
                c.status +
                '">' +
                qualityGateIcon(c.status) +
                ' <strong>' +
                escapeHtml(c.name) +
                '</strong> <span data-part="quality-gate-score">' +
                cScore +
                '/' +
                cThreshold +
                '</span> <span data-part="quality-gate-details">' +
                escapeHtml(c.details) +
                '</span></li>'
            );
        })
        .join('');
    const incomplete =
        result.incompleteItems && result.incompleteItems.length > 0
            ? '<p data-part="quality-gate-incomplete" role="note">' +
              icon('help-circle', 14) +
              ' Dados ausentes (EIXO C): ' +
              escapeHtml(result.incompleteItems.join(', ')) +
              '</p>'
            : '';
    return (
        '<div data-section="quality-gate" data-component="quality-gate" role="region" aria-label="Quality Gate">' +
        '<div data-part="quality-gate-overall">' +
        Badge({
            variant: QG_STATUS_VARIANT[result.overall],
            children: qualityGateIcon(result.overall) + ' ' + result.overall,
        }) +
        ' <span data-part="quality-gate-total-score">Score: ' +
        score +
        '/100</span></div>' +
        '<ul data-part="quality-gate-checks" role="list">' +
        checks +
        '</ul>' +
        incomplete +
        '</div>'
    );
}

export function buildFilterBar(): string {
    return FilterBar({
        children:
            SearchInput({ placeholder: 'Filter tests...' }) +
            Button({ children: 'Export CSV', onClick: 'exportCsv()' }) +
            Button({ children: 'PDF', onClick: 'window.print()' }) +
            Button({ children: icon('moon', 16), onClick: '_toggleTheme()', variant: 'ghost' }),
    });
}

export function buildFailedSummary(tests: FlatTest[], stats: ReportStats): string {
    // legitimate: zero failures = condition-false (nothing to summarize) — absence IS the message, corroborated by the "Failed: 0" summary card; EmptyState would be redundant noise (Rule 25.3 intent).
    if (stats.failed === 0) return '';
    const failed = tests.filter((t) => t.state === 'failed');
    let items = '';
    for (const t of failed) {
        items +=
            '<p class="timeline-item">\u2022 ' +
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
            '<div class="label failed-header"><b>' +
            icon('x-circle', 16) +
            ' Failed Tests (' +
            stats.failed +
            ')</b></div>' +
            items,
    });
}

export function buildReleaseSection(
    score: number,
    grade: string,
    breakdown: Array<{ label: string; score: number; status: 'pass' | 'fail'; noData?: boolean }>,
    recommendation: string,
): string {
    let scoreColor: string;
    if (score >= SCORE_QUALITY_GATE) {
        scoreColor = 'var(--color-success)';
    } else if (score >= SCORE_CRITICAL) {
        scoreColor = 'var(--color-warn)';
    } else {
        scoreColor = 'var(--color-error)';
    }

    let breakdownHtml = '';
    for (const item of breakdown) {
        const statusColor = item.status === 'pass' ? 'var(--color-success)' : 'var(--color-error)';
        const statusIcon = item.status === 'pass' ? icon('check-circle', 14) : icon('x-circle', 14);
        const statusText = item.noData ? 'no data' : item.status;
        const scoreText = item.noData ? 'N/A' : String(item.score);
        breakdownHtml +=
            '<div class="breakdown-row">' +
            '<span class="label">' +
            escapeHtml(item.label) +
            '</span>' +
            '<span class="score"><span class="score-color" style="--score-color:' +
            statusColor +
            '">' +
            statusIcon +
            '</span> <span class="score-text">' +
            scoreText +
            '</span>' +
            Badge({
                variant: item.status === 'pass' ? 'pass' : 'fail',
                children: statusText,
            }) +
            '</span></div>';
    }

    return Card({
        variant: 'elevated',
        children:
            '<div id="release-readiness">' +
            '<div class="score-value">' +
            '<div class="score-value-number score-value-number-color" style="--score-color:' +
            scoreColor +
            '">' +
            score +
            '</div>' +
            '<div class="score-grade">' +
            escapeHtml(grade) +
            '</div>' +
            '</div>' +
            '<div class="score-details">' +
            breakdownHtml +
            '</div>' +
            '<div class="score-recommendation">' +
            escapeHtml(recommendation) +
            '</div>' +
            '</div>',
    });
}

function healthColor(score: number): string {
    if (score >= HEALTH_SCORE_GOOD) return tokens.color.chart.pass;
    if (score >= HEALTH_SCORE_WARN) return tokens.color.semantic.warn.light;
    return tokens.color.chart.fail;
}

function healthBg(score: number): string {
    if (score >= HEALTH_SCORE_GOOD) return 'var(--color-bg-healthy)';
    if (score >= HEALTH_SCORE_WARN) return 'var(--color-bg-warning)';
    return 'var(--color-bg-critical)';
}

function qualityGateBadge(gate: HealthScoreResult['qualityGate']): {
    icon: string;
    text: string;
    color: string;
    bg: string;
} {
    if (gate === 'unknown') {
        return {
            icon: icon('help-circle', 16),
            text: 'Unknown',
            color: 'var(--color-text-muted)',
            bg: 'var(--color-bg-warning)',
        };
    }
    if (gate === 'pass') {
        return {
            icon: icon('check-circle', 16),
            text: 'Pass',
            color: 'var(--color-badge-pass-text)',
            bg: 'var(--color-badge-pass-bg)',
        };
    }
    return {
        icon: icon('x-circle', 16),
        text: 'Fail',
        color: 'var(--color-badge-fail-text)',
        bg: 'var(--color-badge-fail-bg)',
    };
}

function healthDimCard(label: string, score: number, status: string, available: boolean): string {
    const displayScore = available ? String(score) : 'N/A';
    const barWidth = available ? score : 0;
    const barColor = available ? healthColor(score) : 'var(--color-border-subtle)';
    const bg = available ? healthBg(score) : 'var(--color-bg-warning)';
    let iconSvg = icon('help-circle', 16);
    if (available) {
        iconSvg = status === 'pass' ? icon('check-circle', 16) : icon('x-circle', 16);
    }
    return `<div class="dim-card dim-card-bg" style="--dim-bg:${bg}">
        <div class="dim-header">
            <span class="dim-label">${label}</span>
            <span class="dim-value dim-value-color" style="--dim-color:${barColor}">${displayScore} ${iconSvg}</span>
        </div>
        <div class="dim-bar"><div class="dim-bar-fill dim-bar-fill-width" style="--bar-width:${barWidth}%;--bar-color:${barColor}"></div></div>
    </div>`;
}

export function buildHealthSection(health: HealthScoreResult): string {
    const qc = qualityGateBadge(health.qualityGate);
    const overallColor = healthColor(health.overall);
    const dims = health.dimensions;
    const dimCards = [
        healthDimCard('Pass Rate', dims.passRate.score, dims.passRate.status, dims.passRate.available),
        healthDimCard('Flaky Rate', dims.flakyRate.score, dims.flakyRate.status, dims.flakyRate.available),
        healthDimCard(
            'Cobertura de testes Jira (steps)',
            dims.coverage.score,
            dims.coverage.status,
            dims.coverage.available,
        ),
        healthDimCard('Suite Speed', dims.suiteSpeed.score, dims.suiteSpeed.status, dims.suiteSpeed.available),
        healthDimCard(
            'Execution Rate',
            dims.executionRate.score,
            dims.executionRate.status,
            dims.executionRate.available,
        ),
    ].join('');

    let provenanceHtml = '';
    if (health.provenance && health.provenance.length > 0) {
        provenanceHtml = buildProvenanceSection(health.provenance);
    }

    const partialBanner =
        health.partial === true
            ? Badge({
                  variant: 'warn',
                  children: 'PARTIAL — insufficient data, low confidence',
                  title: (health.partialReasons ?? []).join('; '),
                  ariaLabel: 'Partial assessment: ' + (health.partialReasons ?? []).join(', '),
              })
            : '';

    const html = Card({
        variant: 'default',
        children:
            '<div class="label health-label-large">' +
            icon('bar-chart', 16) +
            ' Test Suite Health</div>' +
            '<div class="health-grid">' +
            `<div class="score-value"><div class="health-overall-value" style="--overall-color:${overallColor}">${health.overall}</div>` +
            `<div class="health-grade-text">${health.grade.replace(/_/g, ' ')}</div></div>` +
            `<span class="qc-badge qc-badge-dynamic" style="--qc-bg:${qc.bg};--qc-color:${qc.color}">${qc.icon} Health Gate: ${qc.text}</span>` +
            `<span class="health-meta">${health.runCount} run(s) · ${health.timestamp.slice(0, 10)}</span>` +
            partialBanner +
            `</div>` +
            `<div class="categories-grid">${dimCards}</div>` +
            provenanceHtml,
    });
    return html;
}

/** Renders provenance metadata as a compact collapsible section below the health score. */
export function buildProvenanceSection(provenance: HealthScoreProvenance): string {
    if (provenance.length === 0) {
        // Rule 25: explicit no-data (methodology metadata unavailable) instead of silent omission.
        return EmptyState({
            title: 'No provenance data available',
            description:
                'Methodology and reference metadata (formulas, sources, thresholds) were not provided for the health score.',
            action: 'Ensure the health score pipeline emits provenance entries to document how each dimension was calculated.',
            icon: icon('book-open', 16),
        });
    }

    let rows = '';
    for (const entry of provenance) {
        const overrideBadge = entry.overridden ? Badge({ variant: 'warn', children: 'overridden' }) : '';
        rows += `<tr>
            <td class="provenance-td provenance-dim">${escapeHtml(entry.dimension)}</td>
            <td class="provenance-td">${escapeHtml(entry.formula)}</td>
            <td class="provenance-td">${escapeHtml(entry.source)}</td>
            <td class="provenance-td">${escapeHtml(entry.standard)}</td>
            <td class="provenance-td provenance-threshold">${escapeHtml(entry.thresholdBasis)}</td>
            <td class="provenance-td provenance-override">${overrideBadge}</td>
        </tr>`;
    }

    return `<details class="provenance">
        <summary>
            ${icon('book-open', 16)}Methodology & References
        </summary>
        <div class="provenance-table-wrapper">
            <table class="provenance-table">
                <thead>
                    <tr>
                        <th class="provenance-th">Dimension</th>
                        <th class="provenance-th">Formula</th>
                        <th class="provenance-th">Source</th>
                        <th class="provenance-th">Standard</th>
                        <th class="provenance-th">Threshold Basis</th>
                        <th class="provenance-th">Config</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </details>`;
}
