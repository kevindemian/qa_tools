import type { MetricsStore } from './metrics.js';
import type { CiDataHub } from './ci-data.js';
import { rootLogger } from './logger.js';
import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid } from './primitives/index.js';

type TestStatus = 'passed' | 'failed' | 'skipped';

interface CoverageGapItem {
    epic: string;
    hasTest: boolean;
    linkedTestKeys?: string[];
    issueKey?: string;
}

interface CoverageGapResult {
    items?: CoverageGapItem[];
    totals?: { total: number; covered: number };
    byEpic?: Record<string, { total: number; covered: number; rawPct: number }>;
}

export interface TraceabilityNode {
    epic: string;
    coverage: number;
    health: number;
    flakiness: number;
    stories: Array<{
        key: string;
        coverage: number;
        health: number;
        flakiness: number;
        tests: Array<{
            title: string;
            status: TestStatus;
            duration: number;
            flakiness: number;
        }>;
    }>;
}

export interface TraceabilityResult {
    nodes: TraceabilityNode[];
    totalEpics: number;
    totalTests: number;
    overallCoverage: number;
    timestamp: string;
}

function buildFlakinessMap(metrics: MetricsStore): Map<string, number> {
    const failCounts = new Map<string, number>();
    const totalRuns = metrics.runs.length;
    if (totalRuns === 0) return failCounts;
    for (const run of metrics.runs) {
        const seen = new Set<string>();
        for (const t of run.tests) {
            if (seen.has(t.title)) continue;
            seen.add(t.title);
            if (t.state === 'failed') {
                failCounts.set(t.title, (failCounts.get(t.title) ?? 0) + 1);
            }
            if (!failCounts.has(t.title)) {
                failCounts.set(t.title, 0);
            }
        }
    }
    for (const [title, fails] of failCounts) {
        failCounts.set(title, fails / totalRuns);
    }
    return failCounts;
}

function extractLatestRunSnapshots(metrics: MetricsStore): {
    statusByTitle: Map<string, TestStatus>;
    durationByTitle: Map<string, number>;
} {
    const statusByTitle = new Map<string, TestStatus>();
    const durationByTitle = new Map<string, number>();
    const latestRun = metrics.runs.length > 0 ? metrics.runs[metrics.runs.length - 1] : null;
    if (latestRun) {
        for (const t of latestRun.tests) {
            statusByTitle.set(t.title, t.state);
            durationByTitle.set(t.title, t.duration);
        }
    }
    return { statusByTitle, durationByTitle };
}

function groupItemsByEpic(items?: CoverageGapItem[]): Map<string, CoverageGapItem[]> {
    const itemsByEpic = new Map<string, CoverageGapItem[]>();
    if (items) {
        for (const item of items) {
            if (!itemsByEpic.has(item.epic)) {
                itemsByEpic.set(item.epic, []);
            }
            const group = itemsByEpic.get(item.epic);
            if (group) group.push(item);
        }
    }
    return itemsByEpic;
}

function buildStoryNode(
    item: CoverageGapItem,
    epicKey: string,
    statusByTitle: Map<string, 'passed' | 'failed' | 'skipped'>,
    durationByTitle: Map<string, number>,
    flakinessByTitle: Map<string, number>,
): { node: TraceabilityNode['stories'][0]; storyPassed: number } | null {
    const testTitles = item.linkedTestKeys || [];
    const storyTests: TraceabilityNode['stories'][0]['tests'] = [];
    let storyPassed = 0;

    for (const title of testTitles) {
        const status = statusByTitle.get(title);
        if (!status) continue;
        storyTests.push({
            title,
            status,
            duration: durationByTitle.get(title) ?? 0,
            flakiness: flakinessByTitle.get(title) ?? 0,
        });
        if (status === 'passed') storyPassed++;
    }

    if (storyTests.length === 0) return null;

    const storyHealth = Math.round((storyPassed / storyTests.length) * 100);
    const storyFlakiness =
        Math.round((storyTests.reduce((s, t) => s + t.flakiness, 0) / storyTests.length) * 100) / 100;

    return {
        node: {
            key: item.issueKey || epicKey,
            coverage: item.hasTest ? 100 : 0,
            health: storyHealth,
            flakiness: storyFlakiness,
            tests: storyTests,
        },
        storyPassed,
    };
}

function buildEpicNode(
    epicKey: string,
    epicData: { total: number; covered: number; rawPct: number },
    stories: TraceabilityNode['stories'],
    epicPassed: number,
    epicTotal: number,
): TraceabilityNode {
    const health = epicTotal > 0 ? Math.round((epicPassed / epicTotal) * 100) : 0;
    const epicFlakiness =
        stories.length > 0
            ? Math.round((stories.reduce((s, st) => s + st.flakiness, 0) / stories.length) * 100) / 100
            : 0;
    return { epic: epicKey, coverage: epicData.rawPct, health, flakiness: epicFlakiness, stories };
}

export function buildTraceabilityMatrix(
    metrics: MetricsStore,
    coverageResult?: CoverageGapResult,
    ciData?: CiDataHub,
): TraceabilityResult {
    try {
        const { statusByTitle, durationByTitle } = extractLatestRunSnapshots(metrics);
        // Se CiDataHub disponível, usar flakyTests do CI em vez de calcular do MetricsStore
        const flakinessByTitle =
            ciData && ciData.flakyTests.length > 0
                ? new Map(ciData.flakyTests.map((f) => [f.title, f.rate]))
                : buildFlakinessMap(metrics);
        const byEpic = coverageResult?.byEpic ?? {};
        const epicKeys = Object.keys(byEpic);
        const itemsByEpic = groupItemsByEpic(coverageResult?.items);

        const nodes: TraceabilityNode[] = [];
        let totalTests = 0;
        let passedTests = 0;

        for (const epicKey of epicKeys) {
            const epicData = Object.entries(byEpic).find(([k]) => k === epicKey)?.[1];
            if (!epicData) continue;

            const items = itemsByEpic.get(epicKey) || [];
            const stories: TraceabilityNode['stories'] = [];
            let epicPassed = 0;
            let epicTotal = 0;

            for (const item of items) {
                const result = buildStoryNode(item, epicKey, statusByTitle, durationByTitle, flakinessByTitle);
                if (result) {
                    stories.push(result.node);
                    epicPassed += result.storyPassed;
                    epicTotal += result.node.tests.length;
                }
            }

            nodes.push(buildEpicNode(epicKey, epicData, stories, epicPassed, epicTotal));
            totalTests += epicTotal;
            passedTests += epicPassed;
        }

        const overallCoverage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

        return {
            nodes,
            totalEpics: nodes.length,
            totalTests,
            overallCoverage,
            timestamp: new Date().toISOString(),
        };
    } catch (err) {
        rootLogger.error('Failed to build traceability matrix: ' + (err instanceof Error ? err.message : String(err)));
        return {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 0,
            timestamp: new Date().toISOString(),
        };
    }
}

function buildStatusBadge(status: 'passed' | 'failed' | 'skipped'): string {
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return `<span class="status-badge status-${status}" data-status="${status}">${label}</span>`;
}

function buildHealthBar(value: number): string {
    const pct = Math.min(100, Math.max(0, value));
    let color: string;
    if (pct >= 80) {
        color = 'var(--color-success)';
    } else if (pct >= 50) {
        color = 'var(--color-warn)';
    } else {
        color = 'var(--color-error)';
    }
    return `<div class="health-bar"><div class="health-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function buildTestHtml(test: TraceabilityNode['stories'][0]['tests'][0]): string {
    const flakinessPct = Math.round(test.flakiness * 100);

    let testIcon: string;
    if (test.status === 'passed') {
        testIcon = '\u2705';
    } else if (test.status === 'failed') {
        testIcon = '\u274C';
    } else {
        testIcon = '\u23F8';
    }

    return `<div class="test-row test-${test.status}" data-status="${test.status}">
        <span class="test-icon">${testIcon}</span>
        <span class="test-title">${sanitizeHtml(test.title)}</span>
        <span class="test-meta">${test.duration}ms</span>
        <span class="test-flakiness">flak: ${flakinessPct}%</span>
        ${buildStatusBadge(test.status)}
    </div>`;
}

function buildStoryHtml(story: TraceabilityNode['stories'][0]): string {
    const testsHtml = story.tests.map((t) => buildTestHtml(t)).join('');
    return `<div class="story-node">
        <div class="story-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="toggle-icon">&#9660;</span>
            <span class="story-key">${sanitizeHtml(story.key)}</span>
            <span class="stat">cov: ${story.coverage}%</span>
            <span class="stat">health: ${story.health}%</span>
            <span class="stat">flak: ${Math.round(story.flakiness * 100)}%</span>
            ${buildHealthBar(story.health)}
        </div>
        <div class="story-tests">${testsHtml}</div>
    </div>`;
}

function buildEpicNodeHtml(node: TraceabilityNode): string {
    const storiesHtml = node.stories.map((s) => buildStoryHtml(s)).join('');
    const emptyMsg = node.stories.length === 0 ? '<div class="empty-note">No tests linked to this epic</div>' : '';
    return `<div class="epic-node">
        <div class="epic-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="toggle-icon">&#9660;</span>
            <span class="epic-key">${sanitizeHtml(node.epic)}</span>
            <span class="stat">cov: ${node.coverage}%</span>
            <span class="stat">health: ${node.health}%</span>
            <span class="stat">flak: ${Math.round(node.flakiness * 100)}%</span>
            ${buildHealthBar(node.health)}
        </div>
        <div class="epic-stories">${storiesHtml}${emptyMsg}</div>
    </div>`;
}

const TRACEABILITY_CSS = `
.tree{margin-top:16px}
.epic-node{margin-bottom:12px;background:var(--color-surface-card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden}
.epic-header,.story-header{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;transition:background 0.15s;flex-wrap:wrap}
.epic-header{background:var(--color-surface-elevated);font-weight:600;font-size:0.95rem}
.epic-header:hover,.story-header:hover{background:var(--color-surface-input)}
.toggle-icon{font-size:0.6rem;transition:transform 0.2s;color:var(--color-text-muted)}
.collapsed>.epic-header>.toggle-icon,.collapsed>.story-header>.toggle-icon{transform:rotate(-90deg)}
.collapsed>.epic-stories,.collapsed>.story-tests{display:none}
.epic-key{color:var(--color-text-primary)}
.story-node{border-top:1px solid var(--color-border-subtle)}
.story-header{font-size:0.85rem;font-weight:500;padding-left:28px}
.story-key{color:var(--color-text-primary)}
.story-tests{padding:4px 0 8px 56px}
.stat{font-size:0.75rem;color:var(--color-text-secondary);white-space:nowrap}
.health-bar{flex:1;min-width:80px;max-width:120px;height:6px;background:var(--color-surface-input);border-radius:3px;overflow:hidden}
.health-fill{height:100%;border-radius:3px;transition:width 0.3s}
.test-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;margin:2px 0;font-size:0.825rem;transition:background 0.15s}
.test-row:hover{background:var(--color-surface-elevated)}
.test-icon{font-size:0.85rem;width:18px;text-align:center}
.test-title{flex:1;color:var(--color-text-primary);word-break:break-word}
.test-meta{font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap}
.test-flakiness{font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap}
.status-badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;white-space:nowrap}
.status-passed{background:var(--color-badge-pass-bg);color:var(--color-badge-pass-text)}
.status-failed{background:var(--color-badge-fail-bg);color:var(--color-badge-fail-text)}
.status-skipped{background:var(--color-badge-skip-bg);color:var(--color-badge-skip-text)}
.empty-note{padding:12px 14px;color:var(--color-text-muted);font-size:0.85rem;text-align:center;font-style:italic}
`;

export function generateTraceabilityHtml(result: TraceabilityResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            rootLogger.error('Traceability result is null or undefined');
            return buildErrorPage('Error generating traceability matrix', 'Error generating traceability matrix');
        }
        const pageTitle = title || 'Traceability Matrix';

        const summaryCards = MetricGrid({
            children:
                MetricCard({ label: 'Total Epics', value: String(result.totalEpics) }) +
                MetricCard({ label: 'Total Tests', value: String(result.totalTests) }) +
                MetricCard({
                    label: 'Overall Coverage',
                    value: result.overallCoverage + '%',
                    severity: (() => {
                        if (result.overallCoverage >= 80) return 'success';
                        if (result.overallCoverage >= 50) return 'warn';
                        return 'error';
                    })(),
                }),
        });

        const treeHtml =
            result.nodes.length > 0
                ? '<div class="tree">' + result.nodes.map((n) => buildEpicNodeHtml(n)).join('') + '</div>'
                : '<p style="color:var(--color-text-muted);text-align:center;margin-top:40px">No traceability data available.</p>';

        const bodyContent =
            '<h1>' +
            sanitizeHtml(pageTitle) +
            '</h1>' +
            '<div class="timestamp">' +
            sanitizeHtml(result.timestamp) +
            '</div>' +
            summaryCards +
            treeHtml;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss() + TRACEABILITY_CSS,
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Traceability Matrix',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate traceability HTML: ' + msg);
        return buildErrorPage('Error generating traceability matrix', 'Error generating traceability matrix');
    }
}
