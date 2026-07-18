/** LLM-powered comparison between two test runs.
 * Generates a concise narrative of changes in pass rate, failures, and trends.
 * Returns empty string on error (never throws). */

import type { MetricsRun } from '../types/data-hub.js';
import { calcRunPassRate } from '../data-hub/compute/run-pass-rate.js';
import { llmPrompt } from '../llm/llm-client.js';
import { sanitizeForLlm } from '../sanitize.js';
import { rootLogger } from '../logger.js';

function runSummary(run: MetricsRun): string {
    const date = run.timestamp.slice(0, 10);
    const rate = Math.round(calcRunPassRate(run));
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
    '',
    'Adversarial audit steps (execute mentally, do not include in output):',
    '1. Identify every meaningful change in pass rate, failures, duration, and trend',
    '2. Challenge your initial interpretation — could you be missing a pattern?',
    '3. Verify every conclusion against the data from both runs',
    '4. Mentally iterate: refine the analysis, then re-audit the refinement',
    '5. Repeat until your analysis is complete in ≤5 sentences — adding more would not change the conclusion — only then output',
    '',
    'Highlight: changes in pass rate, new failures or improvements, overall trend direction.',
    'Provide a concise 3-5 sentence analysis.',
].join('\n');

function buildData(runA: MetricsRun, runB: MetricsRun): string {
    return ['=== RUN A (older) ===', runSummary(runA), '', '=== RUN B (newer) ===', runSummary(runB)].join('\n');
}

export async function compareRuns(runA: MetricsRun | null, runB: MetricsRun | null): Promise<string> {
    if (!runA || !runB) return 'No run data provided';
    try {
        const user = sanitizeForLlm(buildData(runA, runB));
        return await llmPrompt({ tier: 'fast', system: COMPARE_SYSTEM, user, callerId: 'compare-runs' });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            `Failed to compare runs: ${message}. Verify LLM API key (LLM_API_KEY or LLM_FAST_API_KEY) and network connectivity.`,
        );
        return '';
    }
}
