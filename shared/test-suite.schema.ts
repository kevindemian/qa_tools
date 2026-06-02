import { z } from 'zod';

export const PreConditionSchema = z.object({
    type: z.enum(['setup', 'state', 'data', 'auth']),
    description: z.string().min(1, 'preCondition description must be non-empty'),
});

export type PreCondition = z.infer<typeof PreConditionSchema>;

export const CoverageRefSchema = z.object({
    criterionId: z.string().min(1, 'criterionId must be non-empty'),
    criterionText: z.string().min(1, 'criterionText must be non-empty'),
});

export type CoverageRef = z.infer<typeof CoverageRefSchema>;

export const TestCaseSchema = z.object({
    title: z.string().min(5, 'title must be at least 5 characters').max(200, 'title must be ≤ 200 characters'),
    preConditions: z.array(PreConditionSchema).min(1, 'at least one preCondition required'),
    steps: z.array(z.string().min(5, 'each step must be at least 5 characters')).min(3, 'at least 3 steps required'),
    expectedResult: z.string().min(10, 'expectedResult must be at least 10 characters'),
    coverage: z.array(CoverageRefSchema).min(1, 'at least one coverage reference required'),
    evidence: z.array(z.string()).optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const CoverageTableSchema = z.object({
    coverage: z.number().min(0, 'coverage must be ≥ 0').max(100, 'coverage must be ≤ 100'),
    gaps: z
        .array(
            z.object({
                criterion: z.string().min(1),
                reason: z.string().optional(),
            }),
        )
        .optional(),
});

export type CoverageTable = z.infer<typeof CoverageTableSchema>;

export const TestSuiteSchema = z.object({
    summary: z.string().min(10, 'summary must be at least 10 characters'),
    coverageTable: CoverageTableSchema,
    tests: z.array(TestCaseSchema).min(1, 'at least one test case required'),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;
