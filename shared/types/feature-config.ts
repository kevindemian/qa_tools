import { z } from '../deps.js';

/** Supported publish targets for feature reports. */
export const PublishTarget = z.enum(['github-actions', 'gitlab-ci', 's3', 'gh-pages', 'slack']);
export type PublishTarget = z.infer<typeof PublishTarget>;

/** PR Report feature configuration per project. */
export interface PrReportFeatureConfig {
    /** Whether PR Report is enabled for this project. */
    enabled: boolean;
    /** Where to publish the report. */
    publishTarget: PublishTarget;
    /** Jira project key (optional, for linking test results to Jira). */
    jiraKey?: string | undefined;
    /** Skip AI failure analysis (optional, default: false = enabled). */
    skipAi?: boolean | undefined;
    /** Skip quality gate (optional, default: false = enabled). */
    skipQuality?: boolean | undefined;
    /** Skip flakiness dashboard (optional, default: false = enabled). */
    skipFlaky?: boolean | undefined;
}

/** Aggregate feature configuration for a single project. */
export interface ProjectFeatureConfig {
    gitProvider: 'github' | 'gitlab';
    repo?: string | undefined;
    jiraKey?: string | undefined;
    features: {
        prReport?: PrReportFeatureConfig | undefined;
    };
}

/** Top-level feature config file schema (projects keyed by name). */
export type FeatureConfigStore = Record<string, z.infer<typeof ProjectFeatureConfigSchema>>;

export const PrReportFeatureConfigSchema = z.object({
    enabled: z.boolean(),
    publishTarget: PublishTarget,
    jiraKey: z.string().optional(),
    skipAi: z.boolean().optional(),
    skipQuality: z.boolean().optional(),
    skipFlaky: z.boolean().optional(),
});

export const ProjectFeatureConfigSchema = z.object({
    gitProvider: z.enum(['github', 'gitlab']),
    repo: z.string().optional(),
    jiraKey: z.string().optional(),
    features: z.object({
        prReport: PrReportFeatureConfigSchema.optional(),
    }),
});

export const FeatureConfigStoreSchema = z.record(z.string(), ProjectFeatureConfigSchema);

export const DEFAULT_PR_REPORT_CONFIG: PrReportFeatureConfig = {
    enabled: false,
    publishTarget: 'github-actions',
};
