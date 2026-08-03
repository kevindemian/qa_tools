/** Shared utility functions for HTML report generation — formatting and stats.
 * @module report-utils */
import type { MetricsRun } from '../types/data-hub.js';
import { PASS_RATE_GOOD_THRESHOLD, PASS_RATE_WARN_THRESHOLD } from './report-types.js';
import type { ReportStats } from './report-types.js';

/** Build ReportStats from pre-computed MetricsRun (SSOT — preferred). */
export function statsFromMetricsRun(run: MetricsRun): ReportStats {
    return {
        passed: run.passed,
        failed: run.failed,
        skipped: run.skipped,
        total: run.total,
        duration: run.duration,
    };
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
    return ' <span class="metric-subtitle">(' + pct(value, total) + '%)</span>';
}

export { sanitizeHtml as escapeHtml } from '../escape.js';
