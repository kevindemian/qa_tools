/** Zod schemas for AI-generated test case validation (case18 — Generate Stories from User Story). */
import { z } from '../../shared/validation.js';

export const PreConditionInputSchema = z.object({
    type: z.enum(['reference', 'create']),
    key: z.string().optional(),
    summary: z.string().optional(),
});

export const TestCaseDataSchema = z.object({
    title: z.string().min(5, 'title must be at least 5 characters'),
    steps: z.array(z.string()).min(1, 'steps array must not be empty'),
    expectedResult: z.string().min(10, 'expectedResult must be at least 10 characters'),
    preConditions: z.array(PreConditionInputSchema).optional(),
});

export const TestCaseArraySchema = z.array(TestCaseDataSchema).min(1, 'test cases array must not be empty');
