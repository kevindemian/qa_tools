import * as fs from 'fs';
import { toKnownIssues } from './report-types';
import type { KnownIssue } from './report-types';
import { rootLogger } from './logger';

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

export { generateHtmlReport, generateReportWithFallback, generateCoverageHtml } from './report-html';
export { categorizeFailure } from './report-types';
export type { TestHistoryRun, KnownIssue, TestRunTab, CoverageEpic, ReportOptions, ReportStats } from './report-types';
