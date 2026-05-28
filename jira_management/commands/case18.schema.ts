import { z } from 'zod';

export const TestCaseDataSchema = z.object({
    title: z.string().min(5, 'title must be at least 5 characters'),
    steps: z.array(z.string()).min(1, 'steps array must not be empty'),
    expectedResult: z.string().min(10, 'expectedResult must be at least 10 characters'),
});

export const TestCaseArraySchema = z.array(TestCaseDataSchema).min(1, 'test cases array must not be empty');

export type TestCaseData = z.infer<typeof TestCaseDataSchema>;
