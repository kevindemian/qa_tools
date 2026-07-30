import type { MetricsRun, TestStatus } from '../types/data-hub.js';
import type { CoverageGapResult, CoverageGapItem } from '../types/coverage.js';
import type {
    TraceabilityNode,
    TraceabilityResult,
    TraceabilityAwareness,
    TraceabilityAwarenessCategory,
} from '../types/data-hub.js';

export function buildTraceabilityMatrix(
    runs: MetricsRun[],
    coverageResult: CoverageGapResult | undefined,
    flakyRate: Array<{ title: string; rate: number }>,
    provenance?: Map<string, { confidence: number | null }>,
    quality?: Record<string, { valid: boolean }>,
    timestamp?: Date | string,
    pmIssues?: Array<{ key?: string; id?: number }>,
    pullRequests?: Array<{ number?: number }>,
    failureRecords?: Array<{ name?: string }>,
    securityFindings?: Array<{ title?: string }>,
): TraceabilityResult {
    const { nodes, totalTests, passedTests } = buildTraceabilityNodes(runs, coverageResult, flakyRate);
    const overallCoverage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp ?? Date.now());
    const awareness = buildAwareness(provenance, quality, pmIssues, pullRequests, failureRecords, securityFindings);
    return { nodes, totalEpics: nodes.length, totalTests, overallCoverage, timestamp: ts.toISOString(), awareness };
}

export function buildTraceabilityNodes(
    runs: MetricsRun[],
    coverageResult: CoverageGapResult | undefined,
    flakyRate: Array<{ title: string; rate: number }>,
): { nodes: TraceabilityNode[]; totalTests: number; passedTests: number } {
    const { statusByTitle, durationByTitle } = extractLatestRunSnapshots(runs);
    const flakinessByTitle = new Map(flakyRate.map((f) => [f.title, f.rate / 100]));
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

    return { nodes, totalTests, passedTests };
}

export function extractLatestRunSnapshots(runs: MetricsRun[]): {
    statusByTitle: Map<string, TestStatus>;
    durationByTitle: Map<string, number>;
} {
    const statusByTitle = new Map<string, TestStatus>();
    const durationByTitle = new Map<string, number>();
    const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
    if (latestRun) {
        for (const t of latestRun.tests) {
            statusByTitle.set(t.title, t.state);
            durationByTitle.set(t.title, t.duration);
        }
    }
    return { statusByTitle, durationByTitle };
}

export function groupItemsByEpic(items?: CoverageGapItem[]): Map<string, CoverageGapItem[]> {
    const itemsByEpic = new Map<string, CoverageGapItem[]>();
    if (!items) return itemsByEpic;
    for (const item of items) {
        const epicKey = item.epicKey ?? '';
        const group = itemsByEpic.get(epicKey) ?? [];
        group.push(item);
        itemsByEpic.set(epicKey, group);
    }
    return itemsByEpic;
}

export function buildStoryNode(
    item: CoverageGapItem,
    epicKey: string,
    statusByTitle: Map<string, TestStatus>,
    durationByTitle: Map<string, number>,
    flakinessByTitle: Map<string, number>,
): { node: TraceabilityNode['stories'][0]; storyPassed: number } | null {
    const testTitles = item.linkedTestKeys;
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
            key: item.issueKey ?? epicKey,
            coverage: item.hasTest ? 100 : 0,
            health: storyHealth,
            flakiness: storyFlakiness,
            tests: storyTests,
        },
        storyPassed,
    };
}

export function buildEpicNode(
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

export function buildAwareness(
    provenance?: Map<string, { confidence: number | null }>,
    quality?: Record<string, { valid: boolean }>,
    pmIssues?: Array<{ key?: string; id?: number }>,
    pullRequests?: Array<{ number?: number }>,
    failureRecords?: Array<{ name?: string }>,
    securityFindings?: Array<{ title?: string }>,
): TraceabilityAwareness {
    const categories = buildAwarenessCategories(
        provenance,
        quality,
        pmIssues,
        pullRequests,
        failureRecords,
        securityFindings,
    );
    const minConfidence = computeMinConfidence(categories);
    return { categories, minConfidence };
}

function buildAwarenessCategories(
    provenance?: Map<string, { confidence: number | null }>,
    quality?: Record<string, { valid: boolean }>,
    pmIssues?: Array<{ key?: string; id?: number }>,
    pullRequests?: Array<{ number?: number }>,
    failureRecords?: Array<{ name?: string }>,
    securityFindings?: Array<{ title?: string }>,
): TraceabilityAwarenessCategory[] {
    const categories: TraceabilityAwarenessCategory[] = [];
    const entityMap: Record<string, string[]> = {
        pmIssues: (pmIssues ?? []).map((i) => String(i.key ?? i.id)),
        pullRequests: (pullRequests ?? []).map((p) => String(p.number)),
        failureRecords: (failureRecords ?? []).map((f) => String(f.name)),
        securityFindings: (securityFindings ?? []).map((s) => String(s.title)),
    };
    const knownCategories = ['pmIssues', 'pullRequests', 'failureRecords', 'securityFindings'] as const;

    for (const category of knownCategories) {
        const ids = entityMap[category] ?? [];
        if (ids.length === 0) continue;
        const report = quality?.[category];
        const valid = report ? report.valid : true;
        const confidence = provenance?.get(category)?.confidence ?? null;
        categories.push({ category, entities: ids.map((id) => ({ id, confidence, valid })) });
    }
    return categories;
}

function computeMinConfidence(categories: TraceabilityAwarenessCategory[]): number | null {
    let min = 1;
    let has = false;
    for (const c of categories) {
        for (const e of c.entities) {
            if (e.confidence != null && Number.isFinite(e.confidence)) {
                min = Math.min(min, e.confidence);
                has = true;
            }
        }
    }
    return has ? min : null;
}
