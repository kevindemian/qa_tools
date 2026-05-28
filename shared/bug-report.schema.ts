import { z } from 'zod';

export const AiBugReportSchema = z.object({
    summary: z.string().min(1, 'summary must be non-empty').max(80, 'summary must be ≤ 80 chars'),
    description: z.string().min(1, 'description must be non-empty'),
    stepsToReproduce: z.array(z.string()).min(1, 'at least one step required'),
    expectedResult: z.string().min(1, 'expectedResult must be non-empty'),
    actualResult: z.string().min(1, 'actualResult must be non-empty'),
    environment: z.string().optional(),
    severity: z.enum(['trivial', 'minor', 'major', 'critical']),
    component: z.string().optional(),
});

export type AiBugReport = z.infer<typeof AiBugReportSchema>;
