import type { MetricsRun } from './metrics';
import { llmPrompt } from './llm-client';
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

function buildPrompt(runA: MetricsRun, runB: MetricsRun): string {
    return [
        'You are a QA analyst. Compare the following two test runs and provide a brief narrative summary.',
        'Highlight:',
        '- Changes in pass rate',
        '- New failures or improvements',
        '- Overall trend direction',
        '',
        '=== RUN A (older) ===',
        runSummary(runA),
        '',
        '=== RUN B (newer) ===',
        runSummary(runB),
        '',
        'Provide a concise 3-5 sentence analysis.',
    ].join('\n');
}

export async function compareRuns(runA: MetricsRun, runB: MetricsRun): Promise<string> {
    try {
        const prompt = buildPrompt(runA, runB);
        return await llmPrompt('fast', prompt, 'Compare these two test runs.', 'compare-runs');
    } catch (err) {
        rootLogger.error('Failed to compare runs: ' + (err as Error).message);
        return '';
    }
}
