/**
 * LLM-judge core — DORMANT, not wired into production flows.
 *
 * Per plan T4.5, this module is imported only by tests and future explicit
 * activation. It MUST NOT be imported by `case18.ts` / `bug-report.ts` today.
 * Activation depends on real human labels (calibration).
 *
 * Design:
 * - `floor` is a REQUIRED anchor (anchored context). The judge never computes a
 *   score without a floor — it grounds the final score, preventing the judge
 *   from drifting off the deterministic baseline (Rule 24 / plan §7 anti-echo).
 * - Reliability gate: without a calibration set, or with Cohen's kappa ≤ 0.60,
 *   it returns an explicit `null` (Rule 25 — no silent unvalidated output).
 * - `combineScore` anchors on the floor and adjusts within a bounded band (±10).
 * - G-Eval: per-metric chain-of-thought + probabilistic grade distribution; the
 *   expected value of the distribution is the metric score.
 */

import { llmPrompt } from '../llm/llm-client.js';
import { rootLogger } from '../logger.js';
import { assertJudgeIndependence } from '../llm/llm-fallback-config.js';
import { cohenKappaFromLabels } from './llm-judge-calibration.js';
import { LlmJudgeResultSchema, type LlmJudgeResult, type JudgeFlaw } from './llm-judge.schema.js';
import type { JudgeCriterion, JudgeInput } from './llm-judge.criteria.js';

/** Deterministic floor anchor used to ground the judge. */
export interface FloorInput {
    /** Deterministic quality score 0-100 from the floor. */
    score: number;
    /** Optional grade label captured alongside the floor. */
    grade?: string;
}

/** Human-calibrated agreement to activate the judge reliability gate. */
export interface CalibrationSet {
    /** Judge labels over a labeled validation set. */
    judgeLabels: string[];
    /** Human/gold labels for the same items. */
    humanLabels: string[];
    /** Kappa threshold below which the judge is not yet reliable. */
    threshold?: number;
}

export interface LlmJudgeOptions {
    /** Required floor anchor; the judge refuses to run without it. */
    floor: FloorInput;
    /** Optional human calibration to pass the reliability gate. */
    calibrationSet?: CalibrationSet;
    /** Model family must differ from the generator's family. */
    judgeModel?: string;
}

export interface JudgeMetricReport {
    metricId: string;
    reasoning: string;
    score: number;
    /** Concrete flaws reported by the judge (empty when at maximum score). */
    flaws: JudgeFlaw[];
}

/** Max adjustment away from the floor in combineScore. */
export const COMBINE_MAX_DELTA = 10;

/** Guaranteed-grade integer rounding within a bound. */
function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        throw new Error('clamp: value must be finite');
    }
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * Combine deterministic floor score with judge semantics.
 * Anchors on the floor, adjusts within ±COMBINE_MAX_DELTA.
 */
export function combineScore(floorScore: number, judgeSemanticDelta: number): number {
    if (!Number.isFinite(floorScore) || !Number.isFinite(judgeSemanticDelta)) {
        throw new Error('combineScore: inputs must be finite');
    }
    if (floorScore < 0 || floorScore > 100) {
        throw new Error('combineScore: floorScore must be within [0,100]');
    }
    const boundedDelta = clamp(judgeSemanticDelta, -COMBINE_MAX_DELTA, COMBINE_MAX_DELTA);
    return clamp(floorScore + boundedDelta, 0, 100);
}

/** Expected value (0-1) of a probabilistic grade distribution. */
function expectedScore(distribution: Array<{ grade: string; weight: number }>): number {
    if (!Array.isArray(distribution) || distribution.length === 0) {
        throw new Error('expectedScore: distribution must be a non-empty array');
    }
    const weights = distribution.map((d) => d.weight);
    for (const w of weights) {
        if (!Number.isFinite(w)) {
            throw new Error('expectedScore: distribution weights must be finite');
        }
    }
    let expected = 0;
    for (let i = 0; i < distribution.length; i++) {
        const denom = distribution.length - 1;
        const weight = distribution[i]?.weight ?? 0;
        expected += (denom === 0 ? 0 : i / denom) * weight;
    }
    return expected;
}

/** Convert a G-Eval judge result into per-metric 0-1 scores (expected values). */
export function judgeResultToMetrics(result: LlmJudgeResult): JudgeMetricReport[] {
    if (!result || !Array.isArray(result.metrics) || result.metrics.length === 0) {
        throw new Error('judgeResultToMetrics: result.metrics must be a non-empty array');
    }
    return result.metrics.map((m) => ({
        metricId: m.metricId,
        reasoning: m.reasoning,
        score: expectedScore(m.distribution),
        flaws: m.flaws ?? [],
    }));
}

/** Evaluate kappa against the reliability gate; null means not yet reliable. */
function passReliabilityGate(calibrationSet?: CalibrationSet): string | null {
    if (!calibrationSet) return 'no calibration set';
    const labels = cohenKappaFromLabels(calibrationSet.judgeLabels, calibrationSet.humanLabels);
    if (labels === null) return 'no label variance in calibration set';
    const threshold = calibrationSet.threshold ?? 0.6;
    if (labels.kappa <= threshold) {
        return `kappa ${labels.kappa.toFixed(2)} ≤ ${threshold}`;
    }
    return null;
}

/** Extract semantic delta (0-100) from judge metric reports (averaged). */
export function judgeSemanticDelta(metrics: JudgeMetricReport[]): number {
    if (!Array.isArray(metrics) || metrics.length === 0) {
        throw new Error('judgeSemanticDelta: metrics must be a non-empty array');
    }
    const avg = metrics.reduce((acc, m) => acc + m.score, 0) / metrics.length;
    if (!Number.isFinite(avg)) {
        throw new Error('judgeSemanticDelta: metric scores must be finite');
    }
    // Convert 0-1 average to a ±10 band around the floor.
    return (avg - 0.5) * 2 * COMBINE_MAX_DELTA;
}

/**
 * Run the LLM judge over an artifact.
 * Returns null when the reliability gate fails (no calibration / low kappa) or
 * when the LLM call fails — explicitly, never a silent default (Rule 25).
 */
export async function evaluateWithLlmJudge(
    input: JudgeInput,
    criteria: JudgeCriterion[],
    options: LlmJudgeOptions,
): Promise<LlmJudgeResult | null> {
    if (!input || !options || typeof options.floor !== 'object' || options.floor === null) {
        throw new Error('evaluateWithLlmJudge: floor is required');
    }
    if (!Number.isFinite(options.floor.score)) {
        throw new Error('evaluateWithLlmJudge: floor.score must be finite');
    }
    if (!Array.isArray(criteria) || criteria.length === 0) {
        throw new Error('evaluateWithLlmJudge: criteria must be a non-empty array');
    }

    const gateIssue = passReliabilityGate(options.calibrationSet);
    if (gateIssue !== null) {
        rootLogger.warn('llm-judge: reliability gate blocked evaluation: ' + gateIssue);
        // Explicit null — the judge is not yet reliable (Rule 25).
        return null;
    }

    const independence = assertJudgeIndependence();
    if (!independence.ok) {
        // Explicit block — independence from the generator family is required
        // (Rule 25): never judge with a same-family or unverifiable model.
        rootLogger.warn('llm-judge: family-independence gate blocked evaluation: ' + (independence.reason ?? ''));
        return null;
    }

    const system = [
        'You are a strict, independent quality judge. The deterministic floor already scored',
        `structural quality at ${options.floor.score}/100. Evaluate ONLY the semantic axes below;`,
        'do not restate the floor, and do not inflate the floor as your basis.',
        '',
        '## CONSTITUTION',
        '- Never hallucinate a flaw: every reported flaw MUST be grounded in concrete text from the artifact.',
        '- Evaluate against recognized standards and good practice (e.g. ISO/IEC/IEEE 29119, ISTQB CTFL,',
        'IEEE 829) as evaluation criteria, not as a mechanical checklist. Apply any legislation,',
        'accreditation criteria, or domain literature provided in CONTEXT.',
        '- Your evaluation is presumed WRONG until proven otherwise: adversarially attempt to refute',
        'each flaw you intend to report; drop any flaw you cannot defend against the artifact text.',
        '',
        '## DELIVERABLE',
        'For each METRIC, return JSON matching the schema:',
        '- reasoning: short chain-of-thought justification.',
        '- distribution: probability weights per grade summing exactly to 1.',
        '- flaws: array of concrete, evidence-grounded defects. A metric at maximum score MUST have an',
        'empty flaws array; a non-empty flaws array MUST be reflected in the distribution (never report',
        'a flaw while putting full weight on the top grade).',
        'Each flaw requires: location (quote where in the artifact the defect appears), reason (why this',
        'is a defect per the rubric and the standards of reference), expected (what should be there',
        'instead, and why), fixToMax (the concrete change needed to reach maximum score).',
    ].join('\n');

    const metricBlocks = criteria
        .map((c) => {
            return `METRIC ${c.metricId}\nAXIS: ${c.axis}\nRUBRIC: ${c.rubric}\nGRADES: ${c.grades.join(', ')}`;
        })
        .join('\n\n');

    const user = [
        `ARTIFACT:\n${input.artifact}`,
        input.context ? `CONTEXT:\n${input.context}` : undefined,
        'TASK: For each METRIC, give a short chain-of-thought justification, then a probability',
        'distribution over the GRADES (weights summing exactly to 1), then the flaws array. Return',
        'only JSON matching the schema.',
        metricBlocks,
    ]
        .filter((line): line is string => line !== undefined)
        .join('\n\n');

    try {
        const result = await llmPrompt({
            tier: 'reviewer',
            system,
            user,
            callerId: 'llm-judge',
            schema: LlmJudgeResultSchema,
        });
        return result as LlmJudgeResult;
    } catch (err) {
        rootLogger.error('llm-judge: evaluation failed: ' + String(err instanceof Error ? err.message : err));
        return null;
    }
}
