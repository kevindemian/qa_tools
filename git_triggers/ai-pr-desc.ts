import { llmPrompt } from '../shared/llm-client';
import { rootLogger } from '../shared/logger';
import type { GitProvider } from '../shared/types';

function buildPrompt(diff: string, source: string, target: string): string {
    return [
        'You are a QA automation assistant. Generate a concise PR/MR description in Brazilian Portuguese based on the diff below.',
        '',
        'Include:',
        '- Summary of changes (what and why)',
        '- Highlight test-related changes (new tests, fixes, refactors)',
        '- Any potential risks or areas needing manual QA attention',
        '',
        'Keep it under 300 words. Use clear, technical Portuguese.',
        '',
        '--- DIFF (source: ' + source + ' -> target: ' + target + ') ---',
        diff,
    ].join('\n');
}

export async function generatePrDescription(m: GitProvider, source: string, target: string): Promise<string> {
    try {
        const diff = await m.getDiff(source, target);
        if (!diff) {
            rootLogger.warn('Empty diff for ' + source + ' -> ' + target);
            return '';
        }

        const system = 'You are a QA automation assistant that writes PR/MR descriptions.';
        const user = buildPrompt(diff, source, target);
        return await llmPrompt('fast', system, user);
    } catch (err) {
        rootLogger.error('Failed to generate PR description: ' + (err as Error).message);
        return '';
    }
}
