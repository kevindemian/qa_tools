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
    } catch {
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
    } catch {
        return null;
    }
}
