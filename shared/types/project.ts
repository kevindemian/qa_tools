import { z } from 'zod';

/** A single registered project. `name` and `dir` are mandatory (D1: dir never omitted). */
export const projectEntrySchema = z.object({
    name: z.string().min(1),
    dir: z.string().min(1),
    provider: z.string().optional(),
    projectId: z.string().optional(),
    jiraKey: z.string().optional(),
    framework: z.string().optional(),
    features: z.array(z.string()).optional(),
    migrated: z.boolean().optional(),
});

export type ProjectEntry = z.infer<typeof projectEntrySchema>;

/** The registry: project name -> ProjectEntry. Single source of truth (D2). */
export const projectRegistrySchema = z.record(z.string(), projectEntrySchema);

export type ProjectRegistry = z.infer<typeof projectRegistrySchema>;
