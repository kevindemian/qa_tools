import { z } from 'zod';

export const ChangeImpactSchema = z.enum(['positive', 'negative', 'neutral']);

export const MeaningfulChangeSchema = z.object({
    metric: z.string().min(1, 'metric must be non-empty'),
    before: z.union([z.string(), z.number()]),
    after: z.union([z.string(), z.number()]),
    impact: ChangeImpactSchema,
});

export type MeaningfulChange = z.infer<typeof MeaningfulChangeSchema>;

export const RunComparisonSchema = z.object({
    summary: z.string().min(20, 'summary must be at least 20 characters').max(500, 'summary must be ≤ 500 characters'),
    meaningfulChanges: z.array(MeaningfulChangeSchema).min(1, 'at least one meaningful change required'),
    confidence: z.number().min(0, 'confidence must be ≥ 0').max(1, 'confidence must be ≤ 1'),
    evidence: z.array(z.string()).min(1, 'at least one evidence item required'),
});

export type RunComparison = z.infer<typeof RunComparisonSchema>;
