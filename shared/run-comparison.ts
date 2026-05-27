import type { MetricsRun } from './metrics';
import { llmPrompt } from './llm-client';
import { sanitizeForLlm } from './sanitize';
import { rootLogger } from './logger';

function runSummary(run: MetricsRun): string {
    const date = run.timestamp.slice(0, 10);
    const rate = run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0;
    return [
        `Date: ${date}`,
        `Project: ${run.project}`,
        `Total: ${run.total}`,
        `Passed: ${run.passed}`,
        `Failed: ${run.failed}`,
        `Skipped: ${run.skipped}`,
        `Duration: ${run.duration}ms`,
        `Pass rate: ${rate}%`,
    ].join('\n');
}

const COMPARE_SYSTEM = [
    'You are a QA analyst. Compare the following two test runs and provide a brief narrative summary.',
    'Highlight:',
    '- Changes in pass rate',
    '- New failures or improvements',
    '- Overall trend direction',
    '',
    'Provide a concise 3-5 sentence analysis.',
].join('\n');

function buildData(runA: MetricsRun, runB: MetricsRun): string {
    return ['=== RUN A (older) ===', runSummary(runA), '', '=== RUN B (newer) ===', runSummary(runB)].join('\n');
}

export async function compareRuns(runA: MetricsRun | null, runB: MetricsRun | null): Promise<string> {
    if (!runA || !runB) return 'No run data provided';
    try {
        const user = sanitizeForLlm(buildData(runA, runB));
        return await llmPrompt('fast', COMPARE_SYSTEM, user, 'compare-runs');
    } catch (err) {
        rootLogger.error('Failed to compare runs: ' + (err as Error).message);
        return '';
    }
}
