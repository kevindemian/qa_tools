/**
 * LLM-judge schema — Zod schema for the G-Eval style judge response.
 *
 * G-Eval (Liu et al., EMNLP 2023): for each metric the LLM produces a
 * chain-of-thought justification, then a score expressed as a probability
 * distribution over the rubric scale (weights per grade), not a single
 * hard-coded integer. The expected value of that distribution is the metric
 * score (0-1).
 *
 * Deliverable contract: every metric MUST also carry a `flaws` array — each
 * flaw is a concrete, evidence-grounded defect with its location, the reason
 * it is a defect, what was expected, and the concrete change required to reach
 * maximum score. A metric at maximum score has an empty `flaws` array.
 */

import { z } from 'zod';

export const GradeDistributionSchema = z
    .array(
        z.object({
            grade: z.string().min(1),
            weight: z.number().min(0).max(1),
        }),
    )
    .min(1)
    .refine(
        (d) => {
            const sum = d.reduce((acc, item) => acc + item.weight, 0);
            return Number.isFinite(sum) && Math.abs(sum - 1) <= 1e-6;
        },
        { message: 'weights must sum to 1' },
    );

export const JudgeFlawSchema = z.object({
    /** Where in the artifact the flaw appears (quoted evidence from the artifact). */
    location: z.string().min(1),
    /** Why this is a defect, per the rubric and the standards of reference. */
    reason: z.string().min(1),
    /** What the artifact should contain instead, and why. */
    expected: z.string().min(1),
    /** The concrete change that would bring this metric to maximum score. */
    fixToMax: z.string().min(1),
});

export const JudgeMetricScoreSchema = z.object({
    metricId: z.string().min(1),
    reasoning: z.string().min(1),
    distribution: GradeDistributionSchema,
    /** Concrete evidence-grounded flaws; empty when the metric is at maximum. */
    flaws: z.array(JudgeFlawSchema),
});

export const LlmJudgeResultSchema = z.object({
    metrics: z.array(JudgeMetricScoreSchema).min(1),
});

export type JudgeFlaw = z.infer<typeof JudgeFlawSchema>;
export type LlmJudgeResult = z.infer<typeof LlmJudgeResultSchema>;
