import { z } from 'zod';

export const TestClassificationSchema = z.enum([
    'ASSERTION',
    'TIMEOUT',
    'ENVIRONMENT',
    'FLAKY',
    'APPLICATION',
    'UNKNOWN',
]);

export const TestSeveritySchema = z.enum(['high', 'medium', 'low']);

export const FailureAnalysisTestSchema = z.object({
    title: z.string().min(1, 'title must be non-empty'),
    classification: TestClassificationSchema,
    severity: TestSeveritySchema,
    recommendation: z.string().min(10, 'recommendation must be at least 10 characters'),
});

export const FailureAnalysisSchema = z.object({
    tests: z.array(FailureAnalysisTestSchema).min(1, 'tests array must not be empty'),
});

export type FailureAnalysis = z.infer<typeof FailureAnalysisSchema>;
export type FailureAnalysisTest = z.infer<typeof FailureAnalysisTestSchema>;
