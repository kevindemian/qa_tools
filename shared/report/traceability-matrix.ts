import type { MetricsRun, DataHub } from '../types/data-hub.js';
import type { QualityCategory } from '../data-hub/quality.js';
import type { CoverageGapResult, CoverageGapItem } from '../types/coverage.js';
import { rootLogger } from '../logger.js';

export { generateTraceabilityHtml } from './traceability-renderer.js';
export { buildTraceabilityMatrix };

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

function validateDataHub(dataHub: DataHub): void {
    const requiredMethods: Array<keyof DataHub> = [
        'getProvenance',
        'getPmIssues',
        'getPullRequests',
        'getFailureRecords',
        'getSecurityFindings',
        'getQuality',
    ];
    for (const method of requiredMethods) {
        // eslint-disable-next-line security/detect-object-injection -- requiredMethods is hardcoded to DataHub keys
        if (typeof dataHub[method] !== 'function') {
            const msg = `validateDataHub: dataHub.${method} is not a function. Required accessor method missing from DataHub.`;
            rootLogger.error(`validateDataHub: Missing required accessor method`, {
                operation: 'validateDataHub',
                cause: 'MISSING_ACCESSOR',
                missingMethod: method,
                remediation: `Implement DataHub.${method}() accessor method in DataHub implementation.`,
            });
            throw new Error(msg);
        }
    }
}

function buildAwareness(dataHub: DataHub): TraceabilityAwareness {
    validateDataHub(dataHub);
    try {
        const categories = _buildAwarenessCategories(dataHub);
        const minConfidence = _computeMinConfidence(categories);
        return { categories, minConfidence };
    } catch (err) {
        _logAwarenessError(err, 'buildAwareness');
        throw err;
    }
}

function _buildAwarenessCategories(dataHub: DataHub): TraceabilityAwarenessCategory[] {
    const provenance = dataHub.getProvenance();
    const categories: TraceabilityAwarenessCategory[] = [];
    for (const category of AWARENESS_CATEGORIES) {
        const ids = _awarenessEntityIds(dataHub, category);
        if (ids.length === 0) continue;
        const report = dataHub.getQuality(category);
        const valid = report ? report.valid : true;
        const confidence = provenance?.get(category)?.confidence ?? null;
        categories.push({ category, entities: ids.map((id) => ({ id, confidence, valid })) });
    }
    return categories;
}

function _computeMinConfidence(categories: TraceabilityAwarenessCategory[]): number | null {
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

function _logAwarenessError(err: unknown, operation: string): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    rootLogger.error(`${operation} FAILED`, {
        operation,
        cause: err instanceof Error ? err.name : 'UNKNOWN_ERROR',
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        remediation:
            'Verify DataHub accessor methods (getProvenance, getPmIssues, getPullRequests, getFailureRecords, getSecurityFindings, getQuality) are properly implemented and return valid data. Check that provenance data includes confidence values for each category.',
        recoverable: false,
    });
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

function buildTraceabilityMatrix(
    runs: MetricsRun[],
    coverageResult: CoverageGapResult | undefined,
    dataHub: DataHub,
): TraceabilityResult {
    validateDataHub(dataHub);
    const { nodes, totalTests, passedTests } = _buildTraceabilityNodes(runs, coverageResult, dataHub);
    const overallCoverage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
    const timestamp =
        dataHub.timestamp instanceof Date ? dataHub.timestamp.toISOString() : new Date(dataHub.timestamp).toISOString();
    const awareness = buildAwareness(dataHub);
    return { nodes, totalEpics: nodes.length, totalTests, overallCoverage, timestamp, awareness };
}

function _buildTraceabilityNodes(
    runs: MetricsRun[],
    coverageResult: CoverageGapResult | undefined,
    dataHub: DataHub,
): { nodes: TraceabilityNode[]; totalTests: number; passedTests: number } {
    const { statusByTitle, durationByTitle } = extractLatestRunSnapshots(runs);
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

    return { nodes, totalTests, passedTests };
}
