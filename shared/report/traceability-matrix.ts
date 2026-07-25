import type { MetricsRun, DataHub } from '../types/data-hub.js';
import type { QualityCategory } from '../data-hub/quality.js';
import type { CoverageGapResult, CoverageGapItem } from '../types/coverage.js';
import { rootLogger } from '../logger.js';

export { generateTraceabilityHtml } from './traceability-renderer.js';

type TestStatus = 'passed' | 'failed' | 'skipped';

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
    /** Pass rate of linked tests across all epics (NOT requirements coverage — see HTML label). */
    overallCoverage: number;
    timestamp: string;
    /** EIXO C awareness: cross-referenced unified-model categories with provenance confidence + quality. */
    awareness: TraceabilityAwareness;
}

/** Per-entity data-quality signal consumed from the unified model via typed accessors. */
export interface TraceabilityAwarenessEntity {
    id: string;
    confidence: number | null;
    valid: boolean;
}

export interface TraceabilityAwarenessCategory {
    category: QualityCategory;
    entities: TraceabilityAwarenessEntity[];
}

export interface TraceabilityAwareness {
    categories: TraceabilityAwarenessCategory[];
    minConfidence: number | null;
}

function extractLatestRunSnapshots(runs: MetricsRun[]): {
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

function groupItemsByEpic(items?: CoverageGapItem[]): Map<string, CoverageGapItem[]> {
    const itemsByEpic = new Map<string, CoverageGapItem[]>();
    if (items) {
        for (const item of items) {
            const epicKey = item.epicKey ?? '';
            if (!itemsByEpic.has(epicKey)) {
                itemsByEpic.set(epicKey, []);
            }
            const group = itemsByEpic.get(epicKey);
            if (group) group.push(item);
        }
    }
    return itemsByEpic;
}

const AWARENESS_CATEGORIES: QualityCategory[] = ['pmIssues', 'pullRequests', 'failureRecords', 'securityFindings'];

function _awarenessEntityIds(dataHub: DataHub, category: QualityCategory): string[] {
    switch (category) {
        case 'pmIssues':
            return (dataHub.getPmIssues() ?? []).map((i) => String(i.key ?? i.id));
        case 'pullRequests':
            return (dataHub.getPullRequests() ?? []).map((p) => String(p.number));
        case 'failureRecords':
            return (dataHub.getFailureRecords() ?? []).map((f) => String(f.name));
        case 'securityFindings':
            return (dataHub.getSecurityFindings() ?? []).map((s) => String(s.title));
        default:
            return [];
    }
}

function buildAwareness(dataHub: DataHub): TraceabilityAwareness {
    const provenance = dataHub.getProvenance();
    const categories: TraceabilityAwarenessCategory[] = [];
    for (const category of AWARENESS_CATEGORIES) {
        const ids = _awarenessEntityIds(dataHub, category);
        if (ids.length === 0) continue;
        const report = dataHub.getQuality(category);
        const valid = report ? report.valid : true;
        const confidence = provenance?.get(category)?.confidence ?? null;
        categories.push({
            category,
            entities: ids.map((id) => ({ id, confidence, valid })),
        });
    }
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
    return { categories, minConfidence: has ? min : null };
}

function buildStoryNode(
    item: CoverageGapItem,
    epicKey: string,
    statusByTitle: Map<string, 'passed' | 'failed' | 'skipped'>,
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
    runs: MetricsRun[],
    coverageResult: CoverageGapResult | undefined,
    dataHub: DataHub,
): TraceabilityResult {
    try {
        const { statusByTitle, durationByTitle } = extractLatestRunSnapshots(runs);
        // FlakyRate é SSOT do DataHub (Camada 1–6); sem fallback silencioso ao MetricsStore.
        // FlakyResult.rate é 0–100; normalizado para 0–1 (contrato de exibição via *100).
        const flakinessByTitle = new Map(dataHub.computed.flakyRate.map((f) => [f.title, f.rate / 100]));
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
            timestamp: dataHub.timestamp.toISOString(),
            awareness: buildAwareness(dataHub),
        };
    } catch (err) {
        rootLogger.error('Failed to build traceability matrix: ' + (err instanceof Error ? err.message : String(err)));
        return {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 0,
            timestamp: dataHub.timestamp.toISOString(),
            awareness: { categories: [], minConfidence: null },
        };
    }
}
