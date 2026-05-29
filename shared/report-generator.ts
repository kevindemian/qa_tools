import * as fs from 'fs';
import { toKnownIssues } from './report-types';
import type { KnownIssue } from './report-types';

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
    } catch {
        return [];
    }
}

export { generateHtmlReport, generateReportWithFallback, generateCoverageHtml } from './report-html';
export { categorizeFailure, extractSuite } from './report-types';
export { exportTestsCsv, exportTestsJson } from './report-export';
export type { TestHistoryRun, KnownIssue, TestRunTab, CoverageEpic, ReportOptions, ReportStats } from './report-types';
