import { llmPrompt } from './llm-client';
import { rootLogger } from './logger';
import { sanitizeForLlm, sanitizeTerminal } from './sanitize';
import { ReportValidator, type ValidationRule } from './report-validator';
import {
    recordLlmRequest,
    recordLlmFailure,
    recordValidationRejection,
    recordRetry,
    recordConfidence,
} from './llm-metrics';

// NOTE: diverse reviewer strategy — using Gemini (reviewer tier) to review
// output from OpenRouter (report/main tier) is intentional. Different models
// catch different error types, reducing auto-evaluation confirmation bias.

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
        'You are a QA audit assistant. Perform an adversarial audit of the analysis below.',
        '',
        'Audit steps (execute mentally before responding):',
        '1. Identify every factual error, logical gap, or missing detail',
        '2. Challenge each recommendation — is it specific, actionable, and correct?',
        '3. Check if all failures are addressed with correct classification/severity',
        '4. Mentally iterate: revise the analysis with your fixes, then re-audit the revised version',
        '5. Repeat until no more issues are found',
        '',
        'After completing your adversarial audit, respond with exactly one verdict:',
        'AGREE — the analysis is accurate and complete after your mental revision',
        'PARTIAL — minor issues remain (list them briefly)',
        'DISAGREE — major errors or omissions remain (explain why)',
        '',
        'Then list each issue you found and how it was fixed (or why it persists if not AGREE).',
        '',
        '--- ANALYSIS TO AUDIT ---',
        original,
    ].join('\n');
}

const VERDICT_PREFIX_RE = /^(AGREE|PARTIAL|DISAGREE)(?:[:\s-]|$)/i;

function parseVerdict(response: string): 'high' | 'medium' | 'low' {
    const upper = response.toUpperCase().trim();
    if (/^AGREE(?:[:\s-]|$)/i.test(upper)) return 'high';
    if (/^PARTIAL(?:[:\s-]|$)/i.test(upper)) return 'medium';
    return 'low';
}

function stripVerdict(response: string): string {
    const lines = response.split('\n');
    const nonVerdict = lines.map((l) => {
        const match = l.match(VERDICT_PREFIX_RE);
        if (match) {
            return l.slice(match[0].length).trim();
        }
        return l;
    });
    return nonVerdict.join('\n').trim();
}

function buildRetryPrompt(original: string, errors: string[], invalidResponse?: string): string {
    const lines = [
        'Your previous response had validation issues. Before retrying, adversarially audit your fix:',
        '',
        '1. Understand each error below — why it occurred and how to prevent it',
        '2. Revise the JSON fixing all issues',
        '3. Mentally re-validate the revised version against the schema',
        '4. Repeat until no validation errors remain, then output the final JSON',
        '',
        'Validation errors to fix:',
        ...errors.map((e) => '- ' + e),
        '',
        'Make sure all required fields are present with correct types.',
        'The JSON must have a "tests" array where each test has: title, classification, severity, recommendation.',
        '',
        '--- ORIGINAL REQUEST ---',
        original,
    ];
    if (invalidResponse) {
        lines.push('', '--- YOUR INVALID RESPONSE (fix this) ---', sanitizeForLlm(invalidResponse).slice(0, 500));
    }
    return lines.join('\n');
}

async function callLlmFallback(system: string, user: string, startTime: number): Promise<ReviewResult> {
    const content = await llmPrompt('main', system, user);
    recordLlmRequest('main', Date.now() - startTime);
    return { content, reviewed: false, confidence: 'medium', fallbackUsed: true };
}

async function attemptPrimary(system: string, user: string, startTime: number): Promise<unknown> {
    const primary = await llmPrompt('report', system, user);
    recordLlmRequest('report', Date.now() - startTime);
    try {
        return JSON.parse(primary);
    } catch {
        recordLlmFailure('report');
        return null;
    }
}

async function runRetryLoop(
    initial: unknown,
    system: string,
    user: string,
    startTime: number,
): Promise<{ parsed: unknown; retries: number; valid: boolean }> {
    let parsed = initial;
    let validation = analysisValidator.validateAll(parsed);
    let retries = 0;

    while (!validation.valid && retries < MAX_RETRIES) {
        retries++;
        recordRetry();
        const invalidJson = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        const retryPrompt = buildRetryPrompt(system + '\n\n' + user, validation.errors, invalidJson);
        const retryResult = await llmPrompt('report', retryPrompt, 'Fix the validation errors above.');
        recordLlmRequest('report', Date.now() - startTime);
        try {
            parsed = JSON.parse(retryResult);
        } catch {
            recordLlmFailure('report');
            return { parsed: null, retries, valid: false };
        }
        validation = analysisValidator.validateAll(parsed);
    }
    if (!validation.valid) {
        for (const err of validation.errors) recordValidationRejection(err);
    }
    return { parsed, retries, valid: validation.valid };
}

async function performSelfReview(parsed: unknown, startTime: number, retries: number): Promise<ReviewResult> {
    const reportContent = JSON.stringify(parsed, null, 2);
    const reviewPrompt = buildReviewPrompt(reportContent);
    const reviewResponse = await llmPrompt('reviewer', reviewPrompt, 'Review the analysis above.');
    recordLlmRequest('reviewer', Date.now() - startTime);

    const confidence = parseVerdict(reviewResponse);
    const reviewerNotes = stripVerdict(reviewResponse);
    recordConfidence(confidence);

    const finalContent =
        confidence !== 'high' && reviewerNotes
            ? reportContent + '\n\n[Reviewer notes: ' + reviewerNotes + ']'
            : reportContent;

    rootLogger.info('LLM review confidence=' + confidence + ' retries=' + retries);
    return { content: finalContent, reviewed: true, confidence, fallbackUsed: false };
}

export async function reviewWithLlm(system: string, user: string): Promise<ReviewResult> {
    const startTime = Date.now();

    try {
        const parsed = await attemptPrimary(system, user, startTime);
        if (parsed === null) {
            const fallback = await callLlmFallback(system, user, startTime);
            return { ...fallback, content: sanitizeTerminal(fallback.content) };
        }

        const { parsed: validated, retries, valid } = await runRetryLoop(parsed, system, user, startTime);
        if (!valid) {
            const fallback = await callLlmFallback(system, user, startTime);
            return { ...fallback, content: sanitizeTerminal(fallback.content) };
        }

        const result = await performSelfReview(validated, startTime, retries);
        return { ...result, content: sanitizeTerminal(result.content) };
    } catch (err) {
        rootLogger.warn('LLM review failed, falling back to primary: ' + (err as Error).message);
        recordLlmFailure('main');
        try {
            return await callLlmFallback(system, user, startTime);
        } catch (fallbackErr) {
            // eslint-disable-next-line preserve-caught-error
            throw new Error('LLM review and fallback both failed: ' + (fallbackErr as Error).message);
        }
    }
}
