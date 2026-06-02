import type { FlatTest } from './result_parser';

export interface TestHistoryRun {
    status: string;
    testExecKey: string;
    startedOn?: string;
    finishedOn?: string;
}

export interface KnownIssue {
    pattern: string;
    reason: string;
    ticket?: string;
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
    trends?: import('./metrics').TrendPoint[];
    theme?: 'dark' | 'light';
    knownIssues?: KnownIssue[];
    runs?: TestRunTab[];
    healthScore?: import('./types').HealthScoreResult;
    diffComparison?: {
        newFailures: import('./result_parser').FlatTest[];
        newPasses: import('./result_parser').FlatTest[];
        flaky: import('./result_parser').FlatTest[];
    };
    flakinessMap?: Record<string, number>;
    flakinessDashboardUrl?: string;
    previousRunTests?: import('./result_parser').FlatTest[];
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

export function toKnownIssues(raw: unknown): KnownIssue[] {
    if (!Array.isArray(raw)) return [];
    const result: KnownIssue[] = [];
    for (const item of raw) {
        if (item && typeof item === 'object' && 'pattern' in item && 'reason' in item) {
            const obj = item as { pattern: unknown; reason: unknown; ticket?: unknown };
            if (typeof obj.pattern === 'string' && typeof obj.reason === 'string') {
                result.push({
                    pattern: obj.pattern,
                    reason: obj.reason,
                    ...(typeof obj.ticket === 'string' ? { ticket: obj.ticket } : {}),
                });
            }
        }
    }
    return result;
}

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
