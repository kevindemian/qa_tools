/**
 * Three-stage hybrid LLM review pipeline: validates, self-critiques,
 * and selectively escalates to adversarial review.
 *
 * ORCHESTRATION ONLY — prompt builders live in llm-review-prompts.ts,
 * heuristics/analyzers live in llm-review-analyzer.ts.
 */
import { llmPrompt } from './llm-client.js';
import type { LlmTier } from './types.js';
import { rootLogger } from './logger.js';
import { sanitizeTerminal } from './sanitize.js';
import { _llmMetrics } from './llm-fallback.js';
import {
    recordLlmRequest,
    recordLlmFailure,
    recordValidationRejection,
    recordRetry,
    recordConfidence,
    recordAdversarialRetry,
    recordArtifactReview,
} from './llm-metrics.js';
import {
    recordInvariantFire,
    recordLayerAttempt,
    recordLayerPass,
    recordArtifactType,
    snapshotQualityMetrics,
} from './quality-metrics.js';
import { createTestCaseValidator } from './test-case-validator.js';
import { createAnalysisValidator } from './analysis-validator.js';
import { createPipelineValidator } from './pipeline-validator.js';
import { createBugReportValidator } from './bug-report-validator.js';
import { createComparisonValidator } from './comparison-validator.js';
import { verifyEvidence } from './evidence-validator.js';
import { recalculateCoverage } from './coverage-verifier.js';
import {
    buildReviewPrompt,
    buildSelfCritiquePrompt,
    buildAdversarialRetryPrompt,
    buildRetryPrompt,
    getSchemaForType,
    ADVERSARIAL_TIERS,
    REV_TIERS,
} from './llm-review-prompts.js';
import { shouldSkipAdversarialReview, parseVerdict, stripVerdict, parseLayerErrors } from './llm-review-analyzer.js';

import type { ArtifactType, ReviewResult } from './llm-review-types.js';
// Re-exports for backward compatibility
export { detectHedging, detectContradictions, shouldSkipAdversarialReview } from './llm-review-analyzer.js';
export type { ArtifactType, ReviewResult };

const MAX_RETRIES = 3;
const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Call the main LLM tier as a no-validation fallback when the pipeline fails. */
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

/** Attempt the primary LLM call with schema-enforced output. */
async function attemptPrimary(system: string, user: string, startTime: number, type: ArtifactType): Promise<unknown> {
    const schema = getSchemaForType(type);
    const tier = 'report';
    try {
        const primary = await llmPrompt({ tier, system, user, schema });
        recordLlmRequest(tier, Date.now() - startTime);
        return primary;
    } catch {
        recordLlmFailure(tier);
        return null;
    }
}

/** Layer 1: Schema validation (Zod). */
function _validateLayer1(parsed: unknown, type: ArtifactType): { passed: boolean; errors: string[] } {
    const errors: string[] = [];
    recordLayerAttempt('layer1');
    const schema = getSchemaForType(type);
    const schemaResult = schema.safeParse(parsed);
    if (!schemaResult.success) {
        const issues = schemaResult.error.issues;
        for (const issue of issues) {
            const msg = `Layer1: ${issue.path.join('.')} — ${issue.message}`;
            errors.push(msg);
            recordValidationRejection(msg);
            recordInvariantFire('schema-' + issue.path.join('.'));
        }
        return { passed: false, errors };
    }
    recordLayerPass('layer1');
    return { passed: true, errors };
}

/** Layer 2: Domain invariants (type-specific validators). */
function _validateLayer2(
    parsed: unknown,
    type: ArtifactType,
    ctx: { inputRaw: string; outputRaw: unknown; artifactType: ArtifactType },
): { passed: boolean; errors: string[] } {
    const errors: string[] = [];
    recordLayerAttempt('layer2');
    let layer2Validator = createTestCaseValidator();
    if (type === 'analysis') layer2Validator = createAnalysisValidator();
    else if (type === 'pipeline') layer2Validator = createPipelineValidator();
    else if (type === 'bug-report') layer2Validator = createBugReportValidator();
    else if (type === 'comparison') layer2Validator = createComparisonValidator();

    const layer2Result = layer2Validator.validate(parsed, ctx);
    if (!layer2Result.allPassed) {
        for (const vr of layer2Result.results) {
            if (!vr.passed && vr.severity === 'error') {
                errors.push(`Layer2: ${vr.invariantId} — ${vr.message}`);
                recordInvariantFire(vr.invariantId);
            }
        }
        return { passed: false, errors };
    }
    recordLayerPass('layer2');
    return { passed: true, errors };
}

/** Layer 3: Semantic validation (evidence verification + coverage check). */
function _validateLayer3(
    parsed: unknown,
    type: ArtifactType,
    ctx: { inputRaw: string; outputRaw: unknown; artifactType: ArtifactType },
): { passed: boolean; errors: string[] } {
    const errors: string[] = [];
    recordLayerAttempt('layer3');
    if (type === 'pipeline') {
        recordLayerPass('layer3');
        return { passed: true, errors };
    }
    const evidenceResult = verifyEvidence(parsed, ctx);
    if (!evidenceResult.allVerified && evidenceResult.totalCitations > 0) {
        errors.push(`Layer3: ${evidenceResult.hallucinated} hallucinated citations`);
        recordInvariantFire('E-01');
    } else {
        recordLayerPass('layer3');
    }
    if (type === 'test-suite') {
        const coverageResult = recalculateCoverage(parsed, ctx);
        if (coverageResult.coverageDelta < -20) {
            errors.push(
                `Layer3: Declared coverage (${coverageResult.declaredCoverage}%) exceeds real coverage (${coverageResult.realCoverage}%) by ${Math.abs(coverageResult.coverageDelta)} points`,
            );
        }
    }
    return { passed: errors.length === 0, errors };
}

/** Run all 3 validation layers. */
function validateUsingLayers(
    parsed: unknown,
    type: ArtifactType,
    inputRaw: string,
): { layer1Passed: boolean; layer2Passed: boolean; layer3Passed: boolean; errors: string[] } {
    recordArtifactType(type);
    const ctx = { inputRaw, outputRaw: parsed, artifactType: type };
    const l1 = _validateLayer1(parsed, type);
    const l2 = _validateLayer2(parsed, type, ctx);
    const l3 = _validateLayer3(parsed, type, ctx);
    return {
        layer1Passed: l1.passed,
        layer2Passed: l2.passed,
        layer3Passed: l3.passed,
        errors: [...l1.errors, ...l2.errors, ...l3.errors],
    };
}

/** Retry loop that re-prompts the LLM until all 3 layers pass or MAX_RETRIES exhausted. */
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

/** Run self-critique: the LLM reviews its own output using 2-persona adversarial framing. */
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

/** Attempt parallel adversarial retry across all ADVERSARIAL_TIERS. */
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

/** Re-review a candidate via parallel REV_TIERS and majority-confidence winner. */
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

/** Decide whether to run adversarial review and execute it if warranted. */
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
        reviewerNotes: result.reviewerNotes,
        adversarialRetried: true,
        reReviewTier: reReview.tier,
        artifactType: type,
    };
}

/** Handle fallback when the entire review pipeline throws. */
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
