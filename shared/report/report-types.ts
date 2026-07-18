import type { FlatTest } from '../result_parser.js';

export interface TestHistoryRun {
    status: string;
    testExecKey: string;
    startedOn?: string | undefined;
    finishedOn?: string | undefined;
}

export interface TestRunTab {
    name: string;
    tests: FlatTest[];
}

export interface CoverageEpic {
    key: string;
    summary: string;
    issues: {
        key: string;
        summary: string;
        status: string;
        type: string;
    }[];
}

export interface ReportOptions {
    title?: string;
    includeChart?: boolean;
    llmAnalysis?: string;
    llmConfidence?: 'high' | 'medium' | 'low';
    llmFallback?: boolean;
    generatedAt?: string;
    source?: string;
    ciUrl?: string;
    branch?: string;
    qualityGate?: number;
    testCategories?: Record<string, string>;
    testHistory?: Record<string, TestHistoryRun[]>;
    trends?: import('../types/data-hub.js').TrendPoint[];
    theme?: 'dark' | 'light';
    runs?: TestRunTab[];
    healthScore?: import('../types.js').HealthScoreResult;
    diffComparison?: {
        newFailures: import('../result_parser.js').FlatTest[];
        newPasses: import('../result_parser.js').FlatTest[];
        flaky: import('../result_parser.js').FlatTest[];
    };
    flakinessMap?: Record<string, number>;
    flakinessDashboardUrl?: string;
    previousRunTests?: import('../result_parser.js').FlatTest[];
    coverageSource?: string;
}

export interface ReportStats {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
}

export const DEFAULT_TITLE = 'QA Tools — Test Report';
export const PASS_RATE_GOOD_THRESHOLD = 90;
export const PASS_RATE_WARN_THRESHOLD = 70;

export const CATEGORY_COLORS: Record<string, string> = {
    ASSERTION: '#6366f1',
    TIMEOUT: '#f59e0b',
    ENVIRONMENT: '#10b981',
    APPLICATION: '#ef4444',
    FLAKY: '#8b5cf6',
    UNKNOWN: '#6b7280',
};

export function categorizeFailure(error: string): string {
    const upper = error.toUpperCase();
    if (/TIMEOUT|TIMED OUT|30S|60S/.test(upper)) return 'TIMEOUT';
    if (/ASSERT|EXPECTED|GOT |ACTUAL|TO BE /.test(upper)) return 'ASSERTION';
    if (/CONNECT|DATABASE|NETWORK|REFUSED|ECONNREFUSED/.test(upper)) return 'ENVIRONMENT';
    if (/NULL|UNDEFINED|CANNOT READ|TYPEERROR|REFERENCEERROR/.test(upper)) return 'APPLICATION';
    if (/FLAKY|INTERMITTENT|RETRY/.test(upper)) return 'FLAKY';
    return 'UNKNOWN';
}

export function extractSuite(t: FlatTest): string {
    if (t.fullTitle) {
        const parts = t.fullTitle.split(' > ');
        return parts.length > 1 ? parts.slice(0, -1).join(' > ') : '';
    }
    return '';
}
