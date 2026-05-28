import { llmPrompt, type LlmTier } from './llm-client';
import { rootLogger } from './logger';
import { sanitizeForLlm, sanitizeTerminal } from './sanitize';
import { ReportValidator, type ValidationRule } from './report-validator';
import {
    recordLlmRequest,
    recordLlmFailure,
    recordValidationRejection,
    recordRetry,
    recordConfidence,
    recordAdversarialRetry,
} from './llm-metrics';

export interface ReviewResult {
    content: string;
    reviewed: boolean;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed?: boolean;
    reviewerNotes?: string;
    adversarialRetried?: boolean;
    reReviewTier?: string;
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

const ADVERSARIAL_TIERS = ['report', 'fast', 'fallback'] as const;
const REV_TIERS = ['reviewer', 'fast', 'fallback'] as const;

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

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

function buildAdversarialRetryPrompt(gaps: string, user: string): string {
    return [
        'Your previous report had these quality gaps identified by peer review:',
        '',
        gaps,
        '',
        'Regenerate the JSON report, addressing each gap above.',
        '',
        'Adversarial audit steps (execute mentally, do not include in output):',
        '1. Identify every remaining gap, factual error, or logical flaw in the JSON',
        '2. Challenge each fix — does it truly address the detected peer-review gap?',
        '3. Verify all classifications, severities, and recommendations conform to the schema',
        '4. Mentally iterate: revise the JSON with your fixes, then re-audit the revision',
        '5. Repeat until you can find no new issues — only then output the final JSON',
        '',
        'Original failed tests:',
        user,
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

async function performSelfReview(
    parsed: unknown,
    startTime: number,
    retries: number,
    tier: LlmTier = 'reviewer',
): Promise<ReviewResult> {
    const reportContent = JSON.stringify(parsed, null, 2);
    const reviewPrompt = buildReviewPrompt(reportContent);
    const reviewResponse = await llmPrompt(tier, reviewPrompt, 'Review the analysis above.');
    recordLlmRequest(tier, Date.now() - startTime);

    const confidence = parseVerdict(reviewResponse);
    const reviewerNotes = stripVerdict(reviewResponse);
    recordConfidence(confidence);

    rootLogger.info('LLM review confidence=' + confidence + ' retries=' + retries + ' tier=' + tier);
    return {
        content: reportContent,
        reviewed: true,
        confidence,
        fallbackUsed: false,
        reviewerNotes: confidence !== 'high' && reviewerNotes ? reviewerNotes : undefined,
    };
}

// --- Parallel adversarial retry ---
async function adversarialRetryParallel(
    system: string,
    gaps: string,
    user: string,
    startTime: number,
): Promise<{ content: string; tier: string } | null> {
    const gapPrompt = buildAdversarialRetryPrompt(gaps, user);
    const candidates = await Promise.allSettled(
        ADVERSARIAL_TIERS.map(async (tier) => {
            const raw = await llmPrompt(tier, system, gapPrompt);
            recordLlmRequest(tier, Date.now() - startTime);
            try {
                const parsed = JSON.parse(raw);
                const validation = analysisValidator.validateAll(parsed);
                if (!validation.valid) return null;
                return { content: JSON.stringify(parsed, null, 2), tier };
            } catch {
                return null;
            }
        }),
    );
    const valid: Array<{ content: string; tier: string }> = [];
    for (const r of candidates) {
        if (r.status === 'fulfilled' && r.value !== null) valid.push(r.value);
    }
    if (valid.length === 0) return null;
    return valid[0]!;
}

// --- Parallel re-review with quorum ---
async function reReviewParallel(
    content: string,
    startTime: number,
): Promise<{ confidence: 'high' | 'medium' | 'low'; tier: string }> {
    const reviewPrompt = buildReviewPrompt(content);
    const reviews = await Promise.allSettled(
        REV_TIERS.map(async (tier) => {
            const raw = await llmPrompt(tier, reviewPrompt, 'Review the analysis above.');
            recordLlmRequest(tier, Date.now() - startTime);
            return { confidence: parseVerdict(raw), tier };
        }),
    );
    const valid: Array<{ confidence: 'high' | 'medium' | 'low'; tier: string }> = [];
    for (const r of reviews) {
        if (r.status === 'fulfilled') valid.push(r.value);
    }

    if (valid.length === 0) return { confidence: 'medium', tier: 'fallback' };

    const counts = { high: 0, medium: 0, low: 0 };
    for (const v of valid) counts[v.confidence]++;
    const sorted = (Object.keys(counts) as Array<'high' | 'medium' | 'low'>).sort((a, b) => counts[b] - counts[a]);
    const winner: 'high' | 'medium' | 'low' = sorted[0] || 'medium';
    const winnerTier = valid.find((v) => v.confidence === winner)?.tier ?? 'reviewer';
    return { confidence: winner, tier: winnerTier };
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

        // Adversarial retry: if confidence not high and meaningful gaps
        if (result.confidence !== 'high' && result.reviewerNotes && result.reviewerNotes.length >= 20) {
            recordAdversarialRetry();
            const improved = await adversarialRetryParallel(system, result.reviewerNotes, user, startTime);
            if (improved !== null) {
                const reReview = await reReviewParallel(improved.content, startTime);
                const bestConf =
                    (CONF_RANK[reReview.confidence] ?? 0) >= (CONF_RANK[result.confidence] ?? 0)
                        ? reReview.confidence
                        : result.confidence;
                const finalContent =
                    bestConf !== 'high'
                        ? improved.content + '\n\n[Reviewer notes: ' + result.reviewerNotes + ']'
                        : improved.content;
                return {
                    content: sanitizeTerminal(finalContent),
                    reviewed: true,
                    confidence: bestConf,
                    reviewerNotes: result.reviewerNotes,
                    adversarialRetried: true,
                    reReviewTier: reReview.tier,
                };
            }
        }

        const content = result.reviewerNotes
            ? result.content + '\n\n[Reviewer notes: ' + result.reviewerNotes + ']'
            : result.content;
        return { ...result, content: sanitizeTerminal(content) };
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
