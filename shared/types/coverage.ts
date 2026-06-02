/** A single item in a coverage gap analysis. */
export interface CoverageGapItem {
    issueKey: string;
    summary: string;
    type: 'Story' | 'Task' | 'Bug' | 'Epic';
    status: string;
    epicKey?: string;
    epicSummary?: string;
    hasTest: boolean;
    linkedTestKeys: string[];
    priority: string;
    coverageWeight: number;
    lastRunPassed?: boolean;
    lastRunDate?: string;
}

/** Coverage data for a single epic. */
export interface EpicCoverage {
    epicSummary: string;
    total: number;
    covered: number;
    weightedPct: number;
    rawPct: number;
    gatePass: boolean;
    issues: CoverageGapItem[];
}

/** A node in the coverage hierarchy tree. */
export interface CoverageHierarchyNode {
    key: string;
    summary: string;
    type: 'Epic' | 'Story' | 'Task' | 'Bug';
    children: CoverageHierarchyNode[];
    totalIssues: number;
    coveredIssues: number;
    coveragePct: number;
}

/** A snapshot of coverage metrics at a point in time (inlined from metrics.ts to keep types.ts dependency-free). */
export interface CoverageSnapshot {
    timestamp: string;
    project: string;
    totalIssues: number;
    mappedIssues: number;
    coveragePct: number;
}

/** Result of a coverage gap analysis. */
export interface CoverageGapResult {
    items: CoverageGapItem[];
    totals: { totalIssues: number; covered: number; gap: number; weightedCoveragePct: number; rawCoveragePct: number };
    byEpic: Record<string, EpicCoverage>;
    gateConfig: { minCoveragePct: number; failingEpics: string[] };
    hierarchy: CoverageHierarchyNode[];
    trends: CoverageSnapshot[];
}

export interface CoverageGapOptions {
    minCoveragePct?: number;
    maxIssues?: number;
}

/** Test impact analysis result. */
export interface TestImpactResult {
    changedFiles: string[];
    impactedTests: ImpactedTest[];
    unaffected: { total: number; skippedDueTo: string[] };
    suggestedCommand?: string;
    confidence: 'high' | 'medium' | 'low';
}

/** A single impacted test. */
export interface ImpactedTest {
    testKey?: string;
    title: string;
    reason: string;
    matchMode: string;
    filePattern?: string;
}

/** Serialisable test selection output for pipeline integration. */
export interface TestSelectionJson {
    generatedAt: string;
    changedFiles: string[];
    impactedTests: Array<{
        title: string;
        testKey?: string;
        reason: string;
        matchMode: string;
        filePattern?: string;
    }>;
    suggestedCommand?: string;
    confidence: 'high' | 'medium' | 'low';
    conservative: boolean;
    smokeTests: string[];
}
