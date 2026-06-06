import * as fs from 'fs';
import { toKnownIssues } from './report-types.js';
import type { KnownIssue } from './report-types.js';
import { rootLogger } from './logger.js';

export function loadKnownIssues(filePath: string): KnownIssue[] {
    try {
        if (!fs.existsSync(filePath)) return [];
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return toKnownIssues(parsed);
        if (parsed && typeof parsed === 'object' && 'issues' in parsed) {
            const obj = parsed;
            if (Array.isArray(obj.issues)) return toKnownIssues(obj.issues);
        }
        return [];
    } catch (err) {
        rootLogger.warn('Report generation fallback: ' + (err instanceof Error ? err.message : String(err)));
        return [];
    }
}

export { generateHtmlReport, generateReportWithFallback, generateCoverageHtml } from './report-html.js';
export { categorizeFailure } from './report-types.js';
export type {
    TestHistoryRun,
    KnownIssue,
    TestRunTab,
    CoverageEpic,
    ReportOptions,
    ReportStats,
} from './report-types.js';
