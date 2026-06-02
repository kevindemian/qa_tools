/**
 * Three-stage hybrid LLM review pipeline: validates, self-critiques,
 * and selectively escalates to adversarial review.
 *
 * ARCHITECTURE (3 estágios):
 *   Stage 1 — EXECUTOR (report tier, temp=0.3): generates the artifact
 *   Stage 2 — SELF-CRITIQUE (report tier, mesma LLM, 2 personas):
 *       Persona adversária separada: "Parta do pressuposto de NÃO CONFORMIDADE"
 *   Stage 3 — ADVERSARIAL (reviewer/fast tiers, LLMs diferentes):
 *       Acionado apenas quando iMAD heuristics detectam ambiguidade,
 *       hedging, contradições, ou confidence abaixo do threshold.
 *
 * Three-tier validation: schema (Layer 1) → domain invariants (Layer 2)
 * → semantic evidence (Layer 3), executed before Stage 2.
 */
import Config from './config';
import { llmPrompt } from './llm-client';
import type { LlmTier, ZodSchema } from './types';
import { rootLogger } from './logger';
import { sanitizeForLlm, sanitizeTerminal } from './sanitize';
import { _llmMetrics } from './llm-fallback';
import { FailureAnalysisSchema } from './failure-analysis.schema';
import { TestSuiteSchema } from './test-suite.schema';
import { PipelineClassificationSchema } from './pipeline-schema';
import { AiBugReportSchema } from './bug-report.schema';
import { RunComparisonSchema } from './comparison-schema';
import { createTestCaseValidator } from './test-case-validator';
import { createAnalysisValidator } from './analysis-validator';
import { createPipelineValidator } from './pipeline-validator';
import { createBugReportValidator } from './bug-report-validator';
import { createComparisonValidator } from './comparison-validator';
import { verifyEvidence } from './evidence-validator';
import { recalculateCoverage } from './coverage-verifier';
import {
    recordLlmRequest,
    recordLlmFailure,
    recordValidationRejection,
    recordRetry,
    recordConfidence,
    recordAdversarialRetry,
    recordArtifactReview,
} from './llm-metrics';
import {
    recordInvariantFire,
    recordLayerAttempt,
    recordLayerPass,
    recordArtifactType,
    snapshotQualityMetrics,
} from './quality-metrics';

export type ArtifactType = 'test-suite' | 'analysis' | 'bug-report' | 'comparison' | 'pipeline';

export interface ReviewResult {
    content: string;
    reviewed: boolean;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed?: boolean;
    reviewerNotes?: string;
    adversarialRetried?: boolean;
    reReviewTier?: string;
    metrics?: { totalRequests: number; rejectedByValidator: number; retryCount: number };
    artifactType?: ArtifactType;
    layerResults?: {
        layer1Passed: boolean;
        layer2Passed: boolean;
        layer3Passed: boolean;
    };
}

const MAX_RETRIES = 3;

const ADVERSARIAL_TIERS = ['report', 'fast', 'fallback'] as const;
const REV_TIERS = ['reviewer', 'fast', 'fallback'] as const;

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Map artifact type to its Zod schema for Layer 1 validation. */
function getSchemaForType(type: ArtifactType): ZodSchema {
    switch (type) {
        case 'test-suite':
            return TestSuiteSchema;
        case 'analysis':
            return FailureAnalysisSchema;
        case 'pipeline':
            return PipelineClassificationSchema;
        case 'bug-report':
            return AiBugReportSchema;
        case 'comparison':
            return RunComparisonSchema;
    }
}

/** Build the adversarial review prompt with NÃO CONFORMIDADE framing. */
function buildReviewPrompt(original: string, type: ArtifactType): string {
    const typeSpecificChecks = getTypeReviewChecks(type);
    return [
        'You are an adversarial QA auditor. Perform an adversarial audit of the ' + type + ' below.',
        '',
        'PREMISE OF NON-COMPLIANCE:',
        'Start from the assumption that EVERY claim is WRONG.',
        'Only conclude COMPLIANT if you find explicit evidence for each requirement.',
        'If evidence is missing or insufficient → mark as VIOLATION.',
        '',
        'Audit steps (execute mentally before responding):',
        '1. Identify every factual error, logical gap, or missing detail',
        '2. Challenge each recommendation — is it specific, actionable, and correct?',
        '3. Verify all evidence citations — do they reference real content from input?',
        '4. Check all required fields are present and non-empty',
        '5. Mentally iterate: revise with your fixes, then re-audit the revised version',
        '6. Repeat until no more issues are found',
        '',
        typeSpecificChecks,
        '',
        'After completing your adversarial audit, respond with exactly one verdict:',
        'AGREE — the output is accurate and complete after your mental revision',
        'PARTIAL — minor issues remain (list them briefly)',
        'DISAGREE — major errors or omissions remain (explain why)',
        '',
        'Then list each issue you found and how it was fixed (or why it persists if not AGREE).',
        '',
        '--- ' + type.toUpperCase() + ' TO AUDIT ---',
        original,
    ].join('\n');
}

function getTypeReviewChecks(type: ArtifactType): string {
    switch (type) {
        case 'test-suite':
            return [
                'Type-specific checks for test-suites:',
                '- Every acceptance criterion must have ≥1 test case covering it',
                '- Coverage must be ≥ 90% or gap justified',
                '- State mutations must have before + after tests',
                '- All steps must be concrete actions (not "validate that...")',
                '- All expectedResults must be verifiable (not "should work")',
            ].join('\n');
        case 'analysis':
            return [
                'Type-specific checks for failure analysis:',
                '- Each test title must exist in the input failed tests list',
                '- Recommendations must reference specific error terms',
                '- Severity must be consistent with classification',
                '- UNKNOWN classifications must have justification',
            ].join('\n');
        case 'bug-report':
            return [
                'Type-specific checks for bug reports:',
                '- Steps to reproduce must have ≥ 3 ordered steps',
                '- Each step must start with an imperative verb',
                '- Severity must be consistent with description',
                '- No hallucinated fields — "Not specified" only when input lacks info',
            ].join('\n');
        case 'comparison':
            return [
                'Type-specific checks for run comparisons:',
                '- Meaningful changes must be identified (non-empty)',
                '- Before/after values must match the input data',
                '- Summary must be concise (≤ 5 sentences)',
            ].join('\n');
        case 'pipeline':
            return [
                'Type-specific checks for pipeline classification:',
                '- Confidence score must be ≥ 0.6',
                '- Evidence array must be non-empty',
                '- Code/infrastructure categories require a recommendation',
            ].join('\n');
    }
}

/**
 * Build the self-critique prompt for the SAME model (2-persona).
 * Stronger adversarial framing to mitigate self-bias —
 * explicitly separate the critic persona from the generator persona.
 */
function buildSelfCritiquePrompt(original: string, type: ArtifactType): string {
    const typeSpecificChecks = getTypeReviewChecks(type);
    return [
        'You are an independent adversarial auditor — a DIFFERENT agent from the report generator.',
        'The ' + type + ' below was produced by ANOTHER agent. Treat it as untrusted.',
        'Your role is to find flaws, omissions, and inaccuracies. Do NOT polish or rewrite.',
        '',
        'PREMISE OF NON-COMPLIANCE:',
        'Start from the assumption that EVERY claim is WRONG.',
        'Only conclude COMPLIANT if you find explicit evidence for each requirement.',
        'If evidence is missing or insufficient → mark as VIOLATION.',
        '',
        'Audit steps (execute mentally before responding):',
        '1. Identify every factual error, logical gap, or missing detail',
        '2. Challenge each recommendation — is it specific, actionable, and correct?',
        '3. Verify all evidence citations — do they reference real content from input?',
        '4. Check all required fields are present and non-empty',
        '5. If you find ANY issue, mark as DISAGREE or PARTIAL — do NOT rationalize',
        '',
        typeSpecificChecks,
        '',
        'After completing your adversarial audit, respond with exactly one verdict:',
        'AGREE — the output is accurate and complete (no issues found)',
        'PARTIAL — minor issues remain (list them briefly)',
        'DISAGREE — major errors or omissions remain (explain why)',
        '',
        'Then list each issue you found and how you would fix it.',
        '',
        '--- ' + type.toUpperCase() + ' TO AUDIT ---',
        original,
    ].join('\n');
}

/** Artifact risk classification for iMAD selective trigger. */
const ARTIFACT_RISK: Record<ArtifactType, 'critical' | 'normal' | 'low'> = {
    'test-suite': 'critical',
    'bug-report': 'critical',
    analysis: 'normal',
    pipeline: 'normal',
    comparison: 'low',
};

/** Portuguese hedging patterns — objective heuristic, not LLM. */
const HEDGING_PATTERNS = [
    /\bparece\b/i,
    /\bpossivelmente\b/i,
    /\btalvez\b/i,
    /\bpode\s+ser\b/i,
    /\bnao\s+tenho\s+certeza\b/i,
    /\bacho\s+que\b/i,
    /\bprovavelmente\b/i,
    /\bsupostamente\b/i,
    /\bnão\s+sei\b/i,
    /\.\.\.\.\.\./i,
    /\bhmm\b/i,
];

/** Count hedging/hesitation markers in text. Returns 0-* score. */
export function detectHedging(text: string): number {
    let count = 0;
    for (const pattern of HEDGING_PATTERNS) {
        count += (text.match(pattern) || []).length;
    }
    return count;
}

const CONTRADICTION_MARKERS: Array<{ pos: RegExp; neg: RegExp }> = [
    { pos: /\b(certo|correto|ok|passa|válido)\b/i, neg: /\b(erro|falha|incorreto|falso|inválido)\b/i },
];

/** Count contradictory pairs (pos+neg) within the same paragraph. */
export function detectContradictions(text: string): number {
    const paragraphs = text.split('\n\n');
    let contradictions = 0;
    for (const para of paragraphs) {
        let hasPos = false;
        let hasNeg = false;
        for (const m of CONTRADICTION_MARKERS) {
            if (m.pos.test(para)) hasPos = true;
            if (m.neg.test(para)) hasNeg = true;
        }
        if (hasPos && hasNeg) contradictions++;
    }
    return contradictions;
}

/** Decision returned by the iMAD selective trigger. */
export interface ReviewDecision {
    skip: boolean;
    reason: string;
    maxDepth: number;
}

/**
 * iMAD-style selective trigger for adversarial review.
 * Uses objective heuristics (not LLM self-judgment) to decide
 * whether escalation to a 2nd LLM is warranted.
 */
export function shouldSkipAdversarialReview(
    result: ReviewResult,
    type: ArtifactType,
    sessionCost: number,
): ReviewDecision {
    const strategy = Config.get<string>('llmReviewStrategy');
    if (strategy === 'always') {
        return { skip: false, reason: 'strategy_always', maxDepth: 3 };
    }

    const budget = Config.get<number>('llmReviewBudget');

    // 1. Budget gate
    if (sessionCost > budget && budget > 0) {
        rootLogger.debug(
            'Adversarial review skipped: budget exceeded ($' + sessionCost.toFixed(4) + ' > $' + budget + ')',
        );
        return { skip: true, reason: 'budget_exceeded', maxDepth: 0 };
    }

    // 2. Risk-based gate
    const risk = ARTIFACT_RISK[type] ?? 'normal';
    if (risk === 'low' && result.confidence !== 'low') {
        return { skip: true, reason: 'low_risk_artifact', maxDepth: 0 };
    }

    // 3. iMAD heuristics: hedging language
    const hedgingScore = detectHedging(result.content);
    if (hedgingScore > 3 && result.confidence !== 'high') {
        return { skip: false, reason: 'hedging_detected', maxDepth: 3 };
    }

    // 4. Contradiction detection
    const contradictScore = detectContradictions(result.content);
    if (contradictScore > 0) {
        return { skip: false, reason: 'contradiction_detected', maxDepth: 3 };
    }

    // 5. Confidence gate
    if (result.confidence === 'high') {
        if (risk === 'critical') {
            return { skip: false, reason: 'critical_risk', maxDepth: 1 };
        }
        if (!result.reviewerNotes || result.reviewerNotes.length < 20) {
            return { skip: true, reason: 'high_confidence', maxDepth: 0 };
        }
    }

    // 6. Budget-constrained mode
    if (budget > 0 && sessionCost > budget * 0.7) {
        return { skip: false, reason: 'budget_constrained', maxDepth: 1 };
    }

    return { skip: false, reason: 'standard', maxDepth: 3 };
}

function buildAdversarialRetryPrompt(gaps: string, user: string, type: ArtifactType): string {
    return [
        'Your previous ' + type + ' had these quality gaps identified by peer review:',
        '',
        gaps,
        '',
        'Regenerate the ' + type + ', addressing each gap above.',
        '',
        'Adversarial audit steps (execute mentally, do not include in output):',
        '1. Identify every remaining gap, factual error, or logical flaw',
        '2. Challenge each fix — does it truly address the detected peer-review gap?',
        '3. Verify all classifications, severities, and recommendations conform to the schema',
        '4. Start from the premise your fix is STILL WRONG — verify before finalizing',
        '5. Repeat until you can find no new issues — only then output the final ' + type,
        '',
        'Original context:',
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
    return lines
        .map((l) => {
            const match = l.match(VERDICT_PREFIX_RE);
            if (match) return l.slice(match[0].length).trim();
            return l;
        })
        .join('\n')
        .trim();
}

function buildRetryPrompt(original: string, errors: string[], invalidResponse?: string): string {
    const lines = [
        'Your previous response had validation issues. Before retrying, adversarially audit your fix:',
        '',
        '1. Understand each error below — why it occurred and how to prevent it',
        '2. Revise the output fixing all issues',
        '3. Mentally re-validate the revised version against the schema',
        '4. Repeat until no validation errors remain, then output the final result',
        '',
        'Validation errors to fix:',
        ...errors.map((e) => '- ' + e),
        '',
    ];
    if (invalidResponse) {
        lines.push('', '--- YOUR INVALID RESPONSE (fix this) ---', sanitizeForLlm(invalidResponse).slice(0, 500));
    }
    lines.push('', 'Original instructions:', original);
    return lines.join('\n');
}

async function callLlmFallback(
    system: string,
    user: string,
    startTime: number,
    type: ArtifactType,
): Promise<ReviewResult> {
    const content = await llmPrompt({ tier: 'main', system, user });
    recordLlmRequest('main', Date.now() - startTime);
    return { content, reviewed: false, confidence: 'medium', fallbackUsed: true, artifactType: type };
}

async function attemptPrimary(system: string, user: string, startTime: number, type: ArtifactType): Promise<unknown> {
    const schema = getSchemaForType(type);
    const tier = type === 'analysis' ? 'report' : 'report';
    try {
        const primary = await llmPrompt({ tier, system, user, schema });
        recordLlmRequest(tier, Date.now() - startTime);
        return primary;
    } catch {
        recordLlmFailure(tier);
        return null;
    }
}

function validateUsingLayers(
    parsed: unknown,
    type: ArtifactType,
    inputRaw: string,
): { layer1Passed: boolean; layer2Passed: boolean; layer3Passed: boolean; errors: string[] } {
    const errors: string[] = [];
    let layer1Passed = true;
    let layer2Passed = true;
    let layer3Passed = true;

    recordArtifactType(type);

    // Layer 1: Schema validation (Zod)
    recordLayerAttempt('layer1');
    const schema = getSchemaForType(type);
    const schemaResult = schema.safeParse(parsed);
    if (!schemaResult.success) {
        layer1Passed = false;
        const issues = schemaResult.error?.issues || [];
        for (const issue of issues) {
            const msg = `Layer1: ${issue.path.join('.')} — ${issue.message}`;
            errors.push(msg);
            recordValidationRejection(msg);
            recordInvariantFire('schema-' + issue.path.join('.'));
        }
    } else {
        recordLayerPass('layer1');
    }

    // Layer 2: Domain invariants
    recordLayerAttempt('layer2');
    const ctx = { inputRaw, outputRaw: parsed, artifactType: type };
    let layer2Validator = createTestCaseValidator();
    if (type === 'analysis') layer2Validator = createAnalysisValidator();
    else if (type === 'pipeline') layer2Validator = createPipelineValidator();
    else if (type === 'bug-report') layer2Validator = createBugReportValidator();
    else if (type === 'comparison') layer2Validator = createComparisonValidator();

    const layer2Result = layer2Validator.validate(parsed, ctx);
    if (!layer2Result.allPassed) {
        layer2Passed = false;
        for (const vr of layer2Result.results) {
            if (!vr.passed && vr.severity === 'error') {
                errors.push(`Layer2: ${vr.invariantId} — ${vr.message}`);
                recordInvariantFire(vr.invariantId);
            }
        }
    } else {
        recordLayerPass('layer2');
    }

    // Layer 3: Semantic validation (evidence)
    recordLayerAttempt('layer3');
    if (type !== 'pipeline') {
        // Evidence verification
        const evidenceResult = verifyEvidence(parsed, ctx);
        if (!evidenceResult.allVerified && evidenceResult.totalCitations > 0) {
            layer3Passed = false;
            errors.push(`Layer3: ${evidenceResult.hallucinated} hallucinated citations`);
            recordInvariantFire('E-01');
        } else {
            recordLayerPass('layer3');
        }

        // Coverage verification (test-suite only)
        if (type === 'test-suite') {
            const coverageResult = recalculateCoverage(parsed, ctx);
            if (coverageResult.coverageDelta < -20) {
                errors.push(
                    `Layer3: Declared coverage (${coverageResult.declaredCoverage}%) exceeds real coverage (${coverageResult.realCoverage}%) by ${Math.abs(coverageResult.coverageDelta)} points`,
                );
            }
        }
    } else {
        recordLayerPass('layer3');
    }

    return { layer1Passed, layer2Passed, layer3Passed, errors };
}

async function runRetryLoop(
    initial: unknown,
    system: string,
    user: string,
    startTime: number,
    type: ArtifactType,
): Promise<{ parsed: unknown; retries: number; valid: boolean; layerErrors: string[] }> {
    let parsed = initial;
    let { layer1Passed, layer2Passed, layer3Passed, errors } = validateUsingLayers(parsed, type, user);
    let retries = 0;

    while ((!layer1Passed || !layer2Passed || !layer3Passed) && retries < MAX_RETRIES) {
        retries++;
        recordRetry();
        const invalidJson = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        const retryPrompt = buildRetryPrompt(system + '\n\n' + user, errors, invalidJson);
        try {
            const schema = getSchemaForType(type);
            parsed = await llmPrompt({
                tier: 'report',
                system: retryPrompt,
                user: 'Fix the validation errors above.',
                schema,
            });
            recordLlmRequest('report', Date.now() - startTime);
        } catch {
            recordLlmFailure('report');
            return { parsed: null, retries, valid: false, layerErrors: errors };
        }
        const validationResult = validateUsingLayers(parsed, type, user);
        layer1Passed = validationResult.layer1Passed;
        layer2Passed = validationResult.layer2Passed;
        layer3Passed = validationResult.layer3Passed;
        errors = validationResult.errors;
    }

    return { parsed, retries, valid: layer1Passed && layer2Passed && layer3Passed, layerErrors: errors };
}

async function performSelfReview(
    parsed: unknown,
    startTime: number,
    retries: number,
    type: ArtifactType,
    tier: LlmTier = 'report',
): Promise<ReviewResult> {
    const reportContent = JSON.stringify(parsed, null, 2);
    const reviewPrompt = buildSelfCritiquePrompt(reportContent, type);
    const reviewResponse = await llmPrompt({
        tier,
        system: reviewPrompt,
        user: 'Review the ' + type + ' above.',
    });
    recordLlmRequest(tier, Date.now() - startTime);

    const confidence = parseVerdict(reviewResponse);
    const reviewerNotes = stripVerdict(reviewResponse);
    recordConfidence(confidence);

    rootLogger.info('LLM review confidence=' + confidence + ' retries=' + retries + ' tier=' + tier + ' type=' + type);
    return {
        content: reportContent,
        reviewed: true,
        confidence,
        fallbackUsed: false,
        artifactType: type,
        ...(confidence !== 'high' && reviewerNotes ? { reviewerNotes } : {}),
    };
}

async function adversarialRetryParallel(
    system: string,
    gaps: string,
    user: string,
    startTime: number,
    type: ArtifactType,
): Promise<{ content: string; tier: string } | null> {
    const gapPrompt = buildAdversarialRetryPrompt(gaps, user, type);
    const schema = getSchemaForType(type);
    const candidates = await Promise.allSettled(
        ADVERSARIAL_TIERS.map(async (tier) => {
            try {
                const parsed = await llmPrompt({ tier, system, user: gapPrompt, schema });
                recordLlmRequest(tier, Date.now() - startTime);
                const { layer1Passed } = validateUsingLayers(parsed, type, user);
                if (!layer1Passed) return null;
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
    return valid[0] as NonNullable<(typeof valid)[number]>;
}

async function reReviewParallel(
    content: string,
    startTime: number,
    type: ArtifactType,
): Promise<{ confidence: 'high' | 'medium' | 'low'; tier: string }> {
    const reviewPrompt = buildReviewPrompt(content, type);
    const reviews = await Promise.allSettled(
        REV_TIERS.map(async (tier) => {
            const raw = await llmPrompt({ tier, system: reviewPrompt, user: 'Review the ' + type + ' above.' });
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

async function _handleAdversarialRetry(
    system: string,
    result: ReviewResult,
    user: string,
    startTime: number,
    type: ArtifactType,
): Promise<ReviewResult | null> {
    const decision = shouldSkipAdversarialReview(result, type, _llmMetrics.totalCostUSD);
    if (decision.skip || !result.reviewerNotes) return null;
    rootLogger.debug('Adversarial review triggered: reason=' + decision.reason + ' maxDepth=' + decision.maxDepth);
    recordAdversarialRetry();
    const improve = result.reviewerNotes || '';
    const improved = await adversarialRetryParallel(system, improve, user, startTime, type);
    if (improved === null) return null;
    const reReview = await reReviewParallel(improved.content, startTime, type);
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
        ...(result.reviewerNotes !== undefined && { reviewerNotes: result.reviewerNotes }),
        adversarialRetried: true,
        reReviewTier: reReview.tier,
        artifactType: type,
    };
}

async function _handleReviewFallback(
    err: unknown,
    system: string,
    user: string,
    startTime: number,
    type: ArtifactType,
): Promise<ReviewResult> {
    rootLogger.warn('LLM review failed, falling back to primary: ' + (err as Error).message);
    recordLlmFailure('main');
    try {
        return await callLlmFallback(system, user, startTime, type);
    } catch (fallbackErr) {
        throw new Error('LLM review and fallback both failed: ' + (fallbackErr as Error).message, {
            cause: fallbackErr,
        });
    }
}

/** Run an LLM review: prompt → 3-layer validate → adversarial audit → re-review → final score.
 *  Supports all artifact types with type-appropriate validation and review prompts. */
export async function reviewWithLlm(
    system: string,
    user: string,
    type: ArtifactType = 'analysis',
): Promise<ReviewResult> {
    const startTime = Date.now();

    try {
        const parsed = await attemptPrimary(system, user, startTime, type);
        if (parsed === null) {
            const fallback = await callLlmFallback(system, user, startTime, type);
            return { ...fallback, content: sanitizeTerminal(fallback.content) };
        }

        const {
            parsed: validated,
            retries,
            valid,
            layerErrors,
        } = await runRetryLoop(parsed, system, user, startTime, type);
        if (!valid) {
            const fallback = await callLlmFallback(system, user, startTime, type);
            recordArtifactReview(false);
            return { ...fallback, content: sanitizeTerminal(fallback.content) };
        }

        const result = await performSelfReview(validated, startTime, retries, type);
        const layerResults = parseLayerErrors(layerErrors);
        rootLogger.info(
            'Self-critique: confidence=' +
                result.confidence +
                ' type=' +
                type +
                ' cost=$' +
                _llmMetrics.totalCostUSD.toFixed(4),
        );

        const adversarialResult = await _handleAdversarialRetry(system, result, user, startTime, type);
        if (adversarialResult) {
            rootLogger.info(
                'Adversarial escalation: confidence=' +
                    adversarialResult.confidence +
                    ' retried=' +
                    adversarialResult.adversarialRetried +
                    ' cost=$' +
                    _llmMetrics.totalCostUSD.toFixed(4),
            );
            recordArtifactReview(adversarialResult.confidence === 'high');
            snapshotQualityMetrics();
            return adversarialResult;
        }

        const content = result.reviewerNotes
            ? result.content + '\n\n[Self-review: ' + result.reviewerNotes + ']'
            : result.content;

        rootLogger.info(
            'Artifact approved after self-critique: confidence=' +
                result.confidence +
                ' cost=$' +
                _llmMetrics.totalCostUSD.toFixed(4),
        );
        recordArtifactReview(result.confidence !== 'low');
        snapshotQualityMetrics();
        return { ...result, content: sanitizeTerminal(content), layerResults };
    } catch (err) {
        return _handleReviewFallback(err, system, user, startTime, type);
    }
}

function parseLayerErrors(errors: string[]): { layer1Passed: boolean; layer2Passed: boolean; layer3Passed: boolean } {
    return {
        layer1Passed: !errors.some((e) => e.startsWith('Layer1:')),
        layer2Passed: !errors.some((e) => e.startsWith('Layer2:')),
        layer3Passed: !errors.some((e) => e.startsWith('Layer3:')),
    };
}
