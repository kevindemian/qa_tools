/** Shared utility functions for HTML report generation — formatting and stats.
 * @module report-utils */
import type { FlatTest } from './result_parser';
import { PASS_RATE_GOOD_THRESHOLD, PASS_RATE_WARN_THRESHOLD } from './report-types';
import type { ReportStats } from './report-types';

export function statsFromTests(tests: FlatTest[]): ReportStats {
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    const skipped = tests.filter((t) => t.state === 'skipped').length;
    const duration = tests.reduce((sum, t) => sum + t.duration, 0);
    return { passed, failed, skipped, total: tests.length, duration };
}

export function fmtDuration(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
}

export function pctClass(rate: number): string {
    if (rate >= PASS_RATE_GOOD_THRESHOLD) return 'rate-good';
    if (rate >= PASS_RATE_WARN_THRESHOLD) return 'rate-warn';
    return 'rate-bad';
}

export function pct(value: number, total: number): string {
    if (total === 0) return '0.0';
    return ((value / total) * 100).toFixed(1);
}

export function pctSub(value: number, total: number): string {
    if (total === 0) return '';
    return ' <span style="font-size:0.75rem;color:#6b7280;font-weight:400">(' + pct(value, total) + '%)</span>';
}

export { sanitizeHtml as escapeHtml } from './escape';
