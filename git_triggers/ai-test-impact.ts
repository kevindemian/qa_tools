/** AI-powered test-impact assessment — analyze which tests to run based on code changes. */
import fs from 'fs';
import { llmPrompt } from '../shared/llm-client';
import { rootLogger } from '../shared/logger';
import { sanitizeForLlm } from '../shared/sanitize';
import type { GitProvider } from '../shared/types';

interface MappingItem {
    title: string;
    key?: string;
}

function loadMappingTitles(mappingPath?: string): string[] {
    if (!mappingPath) return [];
    try {
        const raw = fs.readFileSync(mappingPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        const items: MappingItem[] = Array.isArray(parsed) ? (parsed as MappingItem[]) : [];
        if (items.length === 0) return [];
        return items.map((m) => m.title).filter(Boolean);
    } catch (err: unknown) {
        rootLogger.warn('Failed to load mapping titles from ' + mappingPath + ': ' + (err as Error).message);
        return [];
    }
}

function buildPrompt(diff: string, titles: string[], source: string, target: string): string {
    const lines: string[] = [
        'You are a QA automation assistant. Analyze the diff below and assess test impact.',
        '',
        'Source branch: ' + source,
        'Target branch: ' + target,
        '',
    ];

    if (titles.length > 0) {
        lines.push('Existing automated tests (' + titles.length + ' total):');
        lines.push(titles.map((t, i) => '  ' + (i + 1) + '. ' + t).join('\n'));
        lines.push('');
    }

    lines.push(
        ...[
            'Answer in Brazilian Portuguese:',
            '1. Which existing tests are LIKELY affected by these changes? (list by name)',
            '2. What is the risk level: BAIXO / MEDIO / ALTO?',
            '3. Are there any new tests that should be added?',
            '4. One-sentence summary of the impact.',
            '',
            'If no tests are affected, state "Nenhum teste existente afetado."',
            '',
            '--- DIFF ---',
            diff,
        ],
    );

    return lines.join('\n');
}

export async function assessTestImpact(
    m: GitProvider,
    source: string,
    target: string,
    mappingPath?: string,
): Promise<string> {
    try {
        const diff = await m.getDiff(source, target);
        if (!diff) {
            return 'Diff vazio — nenhuma alteração para analisar.';
        }

        const titles = loadMappingTitles(mappingPath);
        const system = [
            'You are a QA automation assistant specialized in test impact analysis.',
            'Before answering, adversarially audit your analysis mentally (do not include audit in output):',
            "1. Identify every test that could be affected — don't miss edge cases or indirect dependencies",
            '2. Challenge your risk assessment — is it accurate, too conservative, or missing context?',
            '3. Verify each recommendation — would a new test actually catch the code change?',
            '4. Mentally iterate: revise your assessment, then re-audit the revision',
            '5. Repeat until you can find no new impacts — only then output your numbered assessment',
        ].join('\n');
        const user = buildPrompt(sanitizeForLlm(diff), titles, source, target);
        return await llmPrompt({ tier: 'fast', system, user, callerId: 'test-impact' });
    } catch (err) {
        rootLogger.error('Failed to assess test impact: ' + (err as Error).message);
        return '';
    }
}
