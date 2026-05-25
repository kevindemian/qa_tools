import { llmPrompt } from './llm-client';
import { rootLogger } from './logger';

export interface ReviewResult {
    content: string;
    reviewed: boolean;
    confidence: 'high' | 'medium' | 'low';
}

function buildReviewPrompt(original: string): string {
    return [
        'You are a QA validation assistant. Review the following analysis for:',
        '- Factual accuracy',
        '- Logical consistency',
        '- Completeness (does it address the failures?)',
        '',
        'Respond with exactly one of:',
        'AGREE — if the analysis is accurate and complete',
        'PARTIAL — if it has minor issues (list them briefly)',
        'DISAGREE — if it has major errors or omissions (explain why)',
        '',
        '--- ANALYSIS TO REVIEW ---',
        original,
    ].join('\n');
}

function parseVerdict(response: string): 'high' | 'medium' | 'low' {
    const upper = response.toUpperCase().trim();
    if (upper.startsWith('AGREE')) return 'high';
    if (upper.startsWith('PARTIAL')) return 'medium';
    return 'low';
}

function stripVerdict(response: string): string {
    const lines = response.split('\n');
    const nonVerdict = lines.map((l) => {
        const upper = l.toUpperCase().trim();
        for (const prefix of ['AGREE', 'PARTIAL', 'DISAGREE']) {
            if (upper.startsWith(prefix + ' - ') || upper.startsWith(prefix + ':')) {
                return l.slice(upper.indexOf(prefix) + prefix.length).replace(/^[-:\s]+/, '');
            }
        }
        return l;
    });
    return nonVerdict.join('\n').trim();
}

export async function reviewWithLlm(content: string, system: string, user: string): Promise<ReviewResult> {
    try {
        const primary = await llmPrompt('main', system, user);

        const reviewPrompt = buildReviewPrompt(primary);
        const reviewResponse = await llmPrompt('reviewer', reviewPrompt, 'Review the analysis above.');

        const confidence = parseVerdict(reviewResponse);
        const reviewerNotes = stripVerdict(reviewResponse);

        let finalContent = primary;
        if (confidence !== 'high' && reviewerNotes) {
            finalContent += '\n\n[Reviewer notes: ' + reviewerNotes + ']';
        }

        rootLogger.info('LLM review confidence=' + confidence);
        return { content: finalContent, reviewed: true, confidence };
    } catch (err) {
        rootLogger.warn('LLM review failed, falling back to primary: ' + (err as Error).message);
        try {
            const content = await llmPrompt('main', system, user);
            return { content, reviewed: false, confidence: 'medium' };
        } catch (fallbackErr) {
            // eslint-disable-next-line preserve-caught-error
            throw new Error('LLM review and fallback both failed: ' + (fallbackErr as Error).message);
        }
    }
}
