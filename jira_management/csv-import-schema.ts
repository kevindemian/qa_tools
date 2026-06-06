/** Zod schemas for CSV row validation and test case structure. */
import { z } from '../shared/validation.js';

export const CsvRowFieldsSchema = z.object({
    Action: z.string().min(1, 'Action é obrigatório'),
    Data: z.string().default(''),
    'Expected Result': z.string().default(''),
});

export const CsvRowSchema = z.object({
    fields: CsvRowFieldsSchema,
});

export type CsvRow = z.infer<typeof CsvRowSchema>;

export const TestStepSchema = z.object({
    fields: z.object({
        Action: z.string().optional(),
        Data: z.string().optional(),
        /** @production Field name com espaço exigido pela Xray Server API. */
        'Expected Result': z.string().optional(),
    }),
});

export const TestCaseSchema = z.object({
    title: z.string().trim().min(1, 'Título é obrigatório'),
    description: z.string().optional(),
    steps: z.array(TestStepSchema).min(1, 'Pelo menos um step é obrigatório'),
    precondition: z
        .object({
            type: z.enum(['inline', 'reference']),
            value: z.string(),
        })
        .optional(),
    group: z.string().optional(),
    linkedIssues: z
        .array(
            z.object({
                key: z.string(),
                linkType: z.string(),
            }),
        )
        .optional(),
});

export const ImportJsonStepSchema = z.object({
    Action: z.string().optional(),
    Data: z.string().optional(),
    /** @production Field name com espaço exigido pela Xray Server API. */
    'Expected Result': z.string().optional(),
    /** Alias for backward compat — users who copied from old JSON templates.
     * normalizeFieldName() will prefer the canonical 'Expected Result' at runtime. */
    ExpectedResult: z.string().optional(),
});

export const ImportJsonItemSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório'),
    description: z.string().optional().default(''),
    steps: z.array(ImportJsonStepSchema).min(1, 'Pelo menos um step é obrigatório'),
    precondition: z.string().optional(),
    group: z.string().optional(),
    linkedIssues: z
        .array(z.union([z.string(), z.object({ key: z.string(), linkType: z.string().optional() })]))
        .optional(),
});

export const ImportJsonSchema = z.array(ImportJsonItemSchema).min(1, 'JSON deve conter pelo menos um caso de teste');

export const JiraPayloadSchema = z.object({
    fields: z.object({
        project: z.object({ key: z.string().min(1) }),
        summary: z.string().min(1, 'Summary é obrigatório'),
        description: z.string(),
        issuetype: z.object({ name: z.literal('Test') }),
        labels: z.array(z.string()).optional(),
    }),
});
