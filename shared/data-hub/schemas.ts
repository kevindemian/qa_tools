/**
 * DataHub Zod Schemas — Single Source of Truth.
 *
 * Consolidates all Zod validation schemas for DataHub types.
 * Both metrics.ts and persistence.ts import from this file.
 *
 * @module schemas
 */
import { z } from '../deps.js';
import type { MetricsRun, MetricsStore, CoverageSnapshot } from '../types/data-hub.js';
import type { PipelineRun } from '../types/ci-cd.js';
import { rootLogger } from '../logger.js';
import { getErrorMessage } from '../errors.js';

/**
 * FlatTest schema with explicit fields + .loose() for forward compatibility.
 *
 * The .loose() modifier allows additional fields that may be added in the future
 * without breaking validation. This is critical for backward compatibility when
 * parsing test results from various frameworks (CTRF, JUnit, Mochawesome).
 */
export const FlatTestSchema = z
    .object({
        title: z.string(),
        state: z.union([z.literal('passed'), z.literal('failed'), z.literal('skipped')]),
        duration: z.number().nonnegative(),
        error: z.string().optional(),
        fullTitle: z.string().optional(),
        steps: z.array(z.object({ action: z.string().optional(), expected: z.string().optional() }).loose()).optional(),
        screenshots: z.array(z.object({ title: z.string(), dataUri: z.string() }).loose()).optional(),
        logs: z.array(z.string()).optional(),
    })
    .loose();

/**
 * MetricsRun schema for validating test run data.
 */
export const MetricsRunSchema = z.object({
    timestamp: z.string(),
    project: z.string(),
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    duration: z.number().nonnegative(),
    tests: z.array(FlatTestSchema),
});

/**
 * CoverageSnapshot schema for validating coverage data.
 */
export const CoverageSnapshotSchema: z.ZodType<CoverageSnapshot> = z.object({
    timestamp: z.string(),
    project: z.string(),
    totalIssues: z.number().int().nonnegative(),
    mappedIssues: z.number().int().nonnegative(),
    coveragePct: z.number().min(0).max(100),
});

/**
 * FailureClassification schema for validating failure data.
 */
export const FailureClassificationSchema = z.object({
    timestamp: z.string(),
    testTitle: z.string(),
    category: z.string(),
    project: z.string(),
});

/**
 * MetricsStore schema for validating the full metrics store.
 */
export const MetricsStoreSchema = z.object({
    runs: z.array(MetricsRunSchema),
    coverageHistory: z.array(CoverageSnapshotSchema).optional(),
    failureClassifications: z.array(FailureClassificationSchema).optional(),
});

/**
 * Parse and validate MetricsRun data.
 * Returns null if validation fails.
 */
export function parseMetricsRun(data: unknown): MetricsRun | null {
    try {
        return MetricsRunSchema.parse(data) as MetricsRun;
    } catch (err: unknown) {
        const rawError = getErrorMessage(err);
        rootLogger.warn(`schemas: MetricsRun validation failed — ${rawError}`);
        return null;
    }
}

/**
 * Parse and validate MetricsStore data.
 * Returns null if validation fails.
 */
export function parseMetricsStore(data: unknown): MetricsStore | null {
    try {
        return MetricsStoreSchema.parse(data) as MetricsStore;
    } catch (err: unknown) {
        const rawError = getErrorMessage(err);
        rootLogger.warn(`schemas: MetricsStore validation failed — ${rawError}`);
        return null;
    }
}

/**
 * PipelineRun schema — validates CI/CD pipeline run data from providers.
 * All fields are optional since providers may omit them.
 */
export const PipelineRunSchema = z
    .object({
        id: z.union([z.string(), z.number()]).optional(),
        run_number: z.union([z.string(), z.number()]).optional(),
        ref: z.string().optional(),
        head_branch: z.string().optional(),
        status: z.string().optional(),
        conclusion: z.string().optional(),
        web_url: z.string().optional(),
        event: z.string().optional(),
        created_at: z.string().optional(),
        updated_at: z.string().optional(),
        run_started_at: z.string().optional(),
        head_commit: z
            .object({
                message: z.string().optional(),
                author: z.object({ name: z.string().optional() }).optional(),
            })
            .optional(),
        title: z.string().optional(),
    })
    .loose();

/**
 * Parse and validate PipelineRun data.
 * Returns null if validation fails.
 */
export function parsePipelineRun(data: unknown): PipelineRun | null {
    try {
        return PipelineRunSchema.parse(data) as PipelineRun;
    } catch (err: unknown) {
        const rawError = getErrorMessage(err);
        rootLogger.warn(`schemas: PipelineRun validation failed — ${rawError}`);
        return null;
    }
}
