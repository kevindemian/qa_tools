import { llmPrompt } from '../shared/llm-client';
import { rootLogger } from '../shared/logger';
import { sanitizeForLlm } from '../shared/sanitize';
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

        const system = [
            'You are a QA automation assistant that writes PR/MR descriptions.',
            'Before writing, adversarially audit your description mentally (do not include audit in output):',
            '1. Identify all meaningful changes from the diff — code, tests, configs, dependencies',
            '2. Challenge your risk assessment — is any regression risk being overlooked?',
            '3. Verify completeness — does every meaningful diff entry have coverage in the description?',
            '4. Mentally iterate: refine the description, respecting the 300-word limit, then re-audit',
            '5. Repeat until the description is complete AND ≤300 words — only then output',
        ].join('\n');
        const user = buildPrompt(sanitizeForLlm(diff), source, target);
        return await llmPrompt('fast', system, user, 'pr-description');
    } catch (err) {
        rootLogger.error('Failed to generate PR description: ' + (err as Error).message);
        return '';
    }
}
