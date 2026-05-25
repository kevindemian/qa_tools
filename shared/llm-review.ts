import { llmPrompt } from './llm-client';
import { rootLogger } from './logger';
import { ReportValidator, type ValidationRule } from './report-validator';
import {
    recordLlmRequest,
    recordLlmFailure,
    recordValidationRejection,
    recordRetry,
    recordConfidence,
} from './llm-metrics';

export interface ReviewResult {
    content: string;
    reviewed: boolean;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed?: boolean;
    metrics?: { totalRequests: number; rejectedByValidator: number; retryCount: number };
}

const MAX_RETRIES = 3;

const analysisSchema: ValidationRule[] = [
    { field: 'tests', required: true, type: 'array', minLength: 1 },
    { field: 'tests[0].title', required: true, type: 'string' },
    {
        field: 'tests[0].classification',
        required: true,
        type: 'string',
        pattern: /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN)$/,
    },
    { field: 'tests[0].severity', required: true, type: 'string', pattern: /^(high|medium|low)$/ },
    { field: 'tests[0].recommendation', required: true, type: 'string', minLength: 10 },
];

const analysisValidator = new ReportValidator(analysisSchema);

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

function buildRetryPrompt(original: string, errors: string[]): string {
    return [
        'Your previous response had validation issues. Please fix the following and respond again with a complete JSON object:',
        '',
        ...errors.map((e) => '- ' + e),
        '',
        'Make sure all required fields are present with correct types.',
        'The JSON must have a "tests" array where each test has: title, classification, severity, recommendation.',
        '',
        '--- ORIGINAL REQUEST ---',
        original,
    ].join('\n');
}

export async function reviewWithLlm(system: string, user: string): Promise<ReviewResult> {
    const startTime = Date.now();
    let retries = 0;

    try {
        const primary = await llmPrompt('report', system, user);
        recordLlmRequest('report', Date.now() - startTime);

        let parsed: unknown;
        try {
            parsed = JSON.parse(primary);
        } catch {
            recordLlmFailure('report');
            try {
                const fallbackContent = await llmPrompt('main', system, user);
                recordLlmRequest('main', Date.now() - startTime);
                return { content: fallbackContent, reviewed: false, confidence: 'medium', fallbackUsed: true };
            } catch (fallbackErr) {
                // eslint-disable-next-line preserve-caught-error
                throw new Error('LLM report + fallback failed: ' + (fallbackErr as Error).message);
            }
        }

        let validation = analysisValidator.validate(parsed);

        while (!validation.valid && retries < MAX_RETRIES) {
            retries++;
            recordRetry();
            const retryPrompt = buildRetryPrompt(system + '\n\n' + user, validation.errors);
            const retryResult = await llmPrompt('report', retryPrompt, 'Fix the validation errors above.');
            recordLlmRequest('report', Date.now() - startTime);

            try {
                parsed = JSON.parse(retryResult);
            } catch {
                recordLlmFailure('report');
                break;
            }
            validation = analysisValidator.validate(parsed);
        }

        if (!validation.valid) {
            for (const err of validation.errors) recordValidationRejection(err);
            try {
                const fallbackContent = await llmPrompt('main', system, user);
                recordLlmRequest('main', Date.now() - startTime);
                return { content: fallbackContent, reviewed: false, confidence: 'low', fallbackUsed: true };
            } catch (fallbackErr) {
                // eslint-disable-next-line preserve-caught-error
                throw new Error('All LLM attempts failed: ' + (fallbackErr as Error).message);
            }
        }

        const reportContent = JSON.stringify(parsed, null, 2);
        const reviewPrompt = buildReviewPrompt(reportContent);
        const reviewResponse = await llmPrompt('reviewer', reviewPrompt, 'Review the analysis above.');
        recordLlmRequest('reviewer', Date.now() - startTime);

        const confidence = parseVerdict(reviewResponse);
        const reviewerNotes = stripVerdict(reviewResponse);
        recordConfidence(confidence);

        let finalContent = reportContent;
        if (confidence !== 'high' && reviewerNotes) {
            finalContent += '\n\n[Reviewer notes: ' + reviewerNotes + ']';
        }

        rootLogger.info('LLM review confidence=' + confidence + ' retries=' + retries);
        return { content: finalContent, reviewed: true, confidence, fallbackUsed: false };
    } catch (err) {
        rootLogger.warn('LLM review failed, falling back to primary: ' + (err as Error).message);
        recordLlmFailure('main');
        try {
            const content = await llmPrompt('main', system, user);
            recordLlmRequest('main', Date.now() - startTime);
            return { content, reviewed: false, confidence: 'medium', fallbackUsed: true };
        } catch (fallbackErr) {
            // eslint-disable-next-line preserve-caught-error
            throw new Error('LLM review and fallback both failed: ' + (fallbackErr as Error).message);
        }
    }
}
