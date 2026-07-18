import { z } from 'zod';

export const PipelineCategorySchema = z.enum(['infrastructure', 'code', 'flaky', 'unknown']);

export type PipelineCategory = z.infer<typeof PipelineCategorySchema>;

export const PipelineClassificationSchema = z.object({
    category: PipelineCategorySchema,
    confidence: z.number().min(0, 'confidence must be ≥ 0').max(1, 'confidence must be ≤ 1'),
    evidence: z.array(z.string()).min(1, 'at least one evidence item required'),
    recommendation: z.string().min(10, 'recommendation must be at least 10 characters').optional(),
});

export type PipelineClassification = z.infer<typeof PipelineClassificationSchema>;
