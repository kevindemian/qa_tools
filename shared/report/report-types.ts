import type { FlatTest } from '../result_parser.js';
import { tokens } from '../ui/theme-tokens.js';
import { extractSuiteFromTitle } from '../primitives/extract-suite.js';

export { classifyError as categorizeFailure } from '../primitives/classify-error.js';

export function extractSuite(t: FlatTest): string {
    return t.fullTitle ? extractSuiteFromTitle(t.fullTitle) : '';
}

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
    testHistory?: Record<string, TestHistoryRun[]>;
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
    dashboardId?: string;
    passRateThreshold?: number;
    computed?: import('../types/data-hub.js').ComputedMetrics;
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
    ASSERTION: tokens.color.chart.pass,
    TIMEOUT: tokens.color.semantic.warn.light,
    ENVIRONMENT: tokens.color.semantic.success.light,
    APPLICATION: tokens.color.chart.fail,
    FLAKY: tokens.color.semantic.warn.dark,
    UNKNOWN: tokens.color.text.muted.light,
};
