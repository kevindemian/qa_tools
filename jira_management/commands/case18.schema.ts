/** Zod schemas for AI-generated test case validation (case18 — Generate Stories from User Story). */
import { z } from '../../shared/validation/validation.js';

/**
 * Pre-condition input schema — accepts BOTH `summary` (canonical) and `description`
 * (LLM may produce either depending on prompt version). Normalizes to `summary`
 * via transform so all downstream code reads a single field.
 */
export const PreConditionInputSchema = z
    .object({
        type: z.enum(['reference', 'create']),
        key: z.string().optional(),
        summary: z.string().optional(),
        description: z.string().optional(),
    })
    .transform((val) => {
        const normalizedSummary = val.summary || val.description || undefined;
        const result: { type: 'reference' | 'create'; key?: string; summary?: string } = { type: val.type };
        if (val.key !== undefined) result.key = val.key;
        if (normalizedSummary !== undefined) result.summary = normalizedSummary;
        return result;
    });

export const CoverageItemSchema = z.object({
    criterionId: z.string().min(1, 'criterionId must be non-empty'),
    criterionText: z.string().min(1, 'criterionText must be non-empty'),
});

export const TestCaseDataSchema = z.object({
    title: z.string().min(5, 'title must be at least 5 characters'),
    steps: z.array(z.string()).min(1, 'steps array must not be empty'),
    expectedResult: z.string().min(10, 'expectedResult must be at least 10 characters'),
    preConditions: z.array(PreConditionInputSchema).optional(),
    coverage: z.array(CoverageItemSchema).optional(),
    evidence: z.array(z.string()).optional(),
    environment: z.string().optional(),
    components: z.array(z.string()).optional(),
    priority: z.string().optional(),
});

export const TestCaseArraySchema = z.array(TestCaseDataSchema).min(1, 'test cases array must not be empty');
