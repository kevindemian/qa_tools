/**
 * Backlog health analysis — detect stale, unassigned, and untested issues.
 *
 * @module backlog-health
 */

import { sanitizeHtml } from '../escape.js';
import { Card, MetricCard, MetricGrid, Badge } from '../primitives/index.js';

/**
 * Dimension 5 Provenance — documents the source and justification for each weight and threshold.
 */
export const BACKLOG_HEALTH_PROVENANCE = {
    weights: {
        stale: { value: 35, source: 'Backlog hygiene best practice', standard: 'Internal' },
        unassigned: { value: 30, source: 'Resource allocation importance', standard: 'Internal' },
        bugNoTest: { value: 35, source: 'Test coverage gap importance', standard: 'Internal' },
    },
    thresholds: {
        healthy: { value: 80, source: 'Backlog health target', standard: 'Internal' },
        warning: { value: 50, source: 'Backlog health warning', standard: 'Internal' },
    },
} as const;

export interface BacklogHealthIssue {
    key: string;
    summary: string;
    assignee: string | null;
    updated: string;
    type: string;
    priority: string;
    linkedTestCount: number;
    /** Epic real (quando disponível na fonte). Fallback: prefixo do key. */
    epic?: string;
}

export interface BacklogHealthResult {
    unassignedIssues: BacklogHealthIssue[];
    staleIssues: BacklogHealthIssue[];
    bugsWithoutTests: BacklogHealthIssue[];
    densityByEpic: Array<{ epic: string; bugCount: number; testCount: number }>;
    totalIssues: number;
    score: number;
    /** true quando nenhum issue real foi analisado (sem fabricação de 100%). */
    noData?: boolean;
    /** Limite de EXIBIÇÃO das listas (não trunca a análise). Ausente = sem limite. */
    displayLimit?: number;
    timestamp: string;
}

export interface BacklogHealthOptions {
    staleDays: number;
    maxIssues: number;
}

const DEFAULTS: BacklogHealthOptions = {
    staleDays: 30,
    maxIssues: 100,
};

const STALE_WEIGHT = 35;
const UNASSIGNED_WEIGHT = 30;
const BUG_NO_TEST_WEIGHT = 35;

const SUMMARY_TRUNCATE_LENGTH = 80;
const SCORE_THRESHOLD_SUCCESS = 80;
const SCORE_THRESHOLD_WARN = 50;

function daysSince(dateStr: string): number {
    if (dateStr === '') return Infinity;
    const updated = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - updated.getTime();
    if (!Number.isFinite(diff) || !Number.isFinite(updated.getTime())) return Infinity;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function analyzeUnassignedIssues(issues: BacklogHealthIssue[]): BacklogHealthIssue[] {
    return issues.filter((i) => i.assignee === null || i.assignee === '');
}

export function analyzeStaleIssues(
    issues: BacklogHealthIssue[],
    options?: Partial<BacklogHealthOptions>,
): BacklogHealthIssue[] {
    const opts = { ...DEFAULTS, ...options };
    return issues.filter((i) => daysSince(i.updated) > opts.staleDays);
}

export function analyzeBugsWithoutTests(issues: BacklogHealthIssue[]): BacklogHealthIssue[] {
    return issues.filter((i) => i.type === 'Bug' && i.linkedTestCount === 0);
}

export function calculateBacklogScore(result: BacklogHealthResult): number {
    const totalFlagged = new Set([
        ...result.unassignedIssues.map((i) => i.key),
        ...result.staleIssues.map((i) => i.key),
        ...result.bugsWithoutTests.map((i) => i.key),
    ]).size;

    const totalIssues = Number.isFinite(result.totalIssues) ? result.totalIssues : 0;
    if (totalIssues === 0) return 0;

    const effective = Math.max(totalIssues, totalFlagged);

    const unassignScore = Math.max(0, 100 - (result.unassignedIssues.length / effective) * 100);
    const staleScore = Math.max(0, 100 - (result.staleIssues.length / effective) * 100);
    const bugNoTestScore = Math.max(0, 100 - (result.bugsWithoutTests.length / effective) * 100);

    const raw =
        unassignScore * (UNASSIGNED_WEIGHT / 100) +
        staleScore * (STALE_WEIGHT / 100) +
        bugNoTestScore * (BUG_NO_TEST_WEIGHT / 100);
    return Number.isFinite(raw) ? Math.round(raw) : 0;
}

export function analyzeBacklogHealth(
    issues: BacklogHealthIssue[],
    options?: Partial<BacklogHealthOptions>,
): BacklogHealthResult {
    const opts = { ...DEFAULTS, ...options };

    // Analisa TODOS os issues (sem truncagem silenciosa). maxIssues limita apenas a exibição.
    const unassigned = analyzeUnassignedIssues(issues);
    const stale = analyzeStaleIssues(issues, opts);
    const bugs = analyzeBugsWithoutTests(issues);

    const epicMap = new Map<string, { bugCount: number; testCount: number }>();
    for (const issue of issues) {
        const epic = (issue.epic ?? issue.key.split('-')[0]) || 'UNKNOWN';
        const entry = epicMap.get(epic) || { bugCount: 0, testCount: 0 };
        if (issue.type === 'Bug') entry.bugCount++;
        entry.testCount += issue.linkedTestCount;
        epicMap.set(epic, entry);
    }
    const densityByEpic = Array.from(epicMap.entries())
        .map(([epic, counts]) => ({ epic, ...counts }))
        .sort((a, b) => b.bugCount - a.bugCount);

    const result: BacklogHealthResult = {
        unassignedIssues: unassigned,
        staleIssues: stale,
        bugsWithoutTests: bugs,
        densityByEpic,
        totalIssues: issues.length,
        score: 0,
        noData: issues.length === 0,
        displayLimit: opts.maxIssues,
        timestamp: new Date().toISOString(),
    };

    result.score = calculateBacklogScore(result);
    return result;
}

export function generateBacklogHealthHtml(result: BacklogHealthResult): string {
    const summaryCards = MetricGrid({
        children:
            MetricCard({
                label: 'Backlog Score',
                value: result.noData ? 'N/A' : String(result.score) + '%',
                severity: (() => {
                    if (result.noData) return 'warn';
                    if (result.score >= SCORE_THRESHOLD_SUCCESS) return 'success';
                    if (result.score >= SCORE_THRESHOLD_WARN) return 'warn';
                    return 'error';
                })(),
            }) +
            MetricCard({
                label: 'Unassigned',
                value: String(result.unassignedIssues.length),
                severity: result.unassignedIssues.length > 0 ? 'warn' : 'success',
            }) +
            MetricCard({
                label: 'Stale Issues',
                value: String(result.staleIssues.length),
                severity: result.staleIssues.length > 0 ? 'warn' : 'success',
            }) +
            MetricCard({
                label: 'Bugs Without Tests',
                value: String(result.bugsWithoutTests.length),
                severity: result.bugsWithoutTests.length > 0 ? 'error' : 'success',
            }),
    });

    let sectionsHtml = '';

    if (result.unassignedIssues.length > 0) {
        sectionsHtml += Card({
            title: 'Unassigned Issues (' + result.unassignedIssues.length + ')',
            variant: 'bordered',
            severity: 'warn',
            children: buildIssueListCapped(result.unassignedIssues, result.displayLimit),
        });
    }

    if (result.staleIssues.length > 0) {
        sectionsHtml += Card({
            title: 'Stale Issues (' + result.staleIssues.length + ')',
            variant: 'bordered',
            severity: 'warn',
            children: buildIssueListCapped(result.staleIssues, result.displayLimit),
        });
    }

    if (result.bugsWithoutTests.length > 0) {
        sectionsHtml += Card({
            title: 'Bugs Without Tests (' + result.bugsWithoutTests.length + ')',
            variant: 'bordered',
            severity: 'error',
            children: buildIssueListCapped(result.bugsWithoutTests, result.displayLimit),
        });
    }

    if (result.densityByEpic.length > 0) {
        sectionsHtml += Card({
            title: 'Density by Epic',
            children: buildDensityTable(result.densityByEpic),
        });
    }

    return '<div id="backlog-health">' + summaryCards + sectionsHtml + '</div>';
}

function buildIssueListCapped(issues: BacklogHealthIssue[], limit?: number): string {
    const hasLimit = typeof limit === 'number' && limit >= 0;
    const visible = hasLimit ? issues.slice(0, limit) : issues;
    let html = '<div style="max-height:300px;overflow-y:auto">';
    for (const issue of visible) {
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--color-border-subtle);font-size:0.85rem">';
        html += '<span style="font-weight:600">' + sanitizeHtml(issue.key) + '</span>';
        html +=
            ' <span style="color:var(--color-text-secondary)">' +
            sanitizeHtml(issue.summary.slice(0, SUMMARY_TRUNCATE_LENGTH)) +
            '</span>';
        html += ' ' + Badge({ variant: issue.type === 'Bug' ? 'fail' : 'warn', children: issue.type });
        html += '</div>';
    }
    if (hasLimit && issues.length > limit) {
        html +=
            '<div style="padding:6px 0;color:var(--color-text-secondary);font-size:0.8rem">' +
            'Showing first ' +
            String(limit) +
            ' of ' +
            String(issues.length) +
            ' issues.</div>';
    }
    html += '</div>';
    return html;
}

function buildDensityTable(density: Array<{ epic: string; bugCount: number; testCount: number }>): string {
    let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
    html +=
        '<thead><tr>' +
        '<th style="padding:6px 8px;text-align:left;color:var(--color-text-secondary)">Epic</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Bugs</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Tests</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Ratio</th>' +
        '</tr></thead><tbody>';
    for (const d of density) {
        const ratio = d.bugCount > 0 ? (d.testCount / d.bugCount).toFixed(1) : '\u2014';
        html += '<tr style="border-bottom:1px solid var(--color-border-subtle)">';
        html += '<td style="padding:6px 8px">' + sanitizeHtml(d.epic) + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + d.bugCount + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + d.testCount + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + ratio + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
}
