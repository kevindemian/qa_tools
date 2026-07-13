/**
 * DataHub Quality Layer (ST-2) — `validateAndScore`.
 *
 * Single source of truth for quality-gating every ST-1 data category before it
 * is persisted/merged. Implements the EXPAND+STORE mandate:
 *
 *   - Schema validation (Zod; same SSOT used by `schemas.ts`).
 *   - NaN / empty guards (AGENTS §24.1): every numeric field is finite-checked
 *     and bounded; out-of-domain values are caught, never silently passed.
 *   - Confidence by provenance: structured extraction = high, regex/log = low,
 *     manual = medium (AGENTS: confidence por fonte).
 *   - Dedup by natural key: distinct data is never dropped, duplicates collapsed.
 *   - Provenance mandatory where a source field exists.
 *   - Low quality is TAGGED (`quality:{valid,issues}`), never dropped.
 *
 * Array categories are scored in bulk; object categories (DoraMetrics,
 * PerformanceMetrics) are scored individually.
 *
 * @module quality
 */
import { z } from '../deps.js';
import type {
    RawData,
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    DoraMetrics,
    RawIssue,
    CoverageFile,
    PerformanceMetrics,
    RawPullRequest,
} from '../types/data-hub.js';

/** Result of scoring a category: whether it is fully valid + human-readable issues. */
export interface QualityReport {
    /** true only when no schema/provenance/confidence problem was detected. */
    valid: boolean;
    /** Human-readable issues (empty when valid). Low quality is tagged, not dropped. */
    issues: string[];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Zod schemas — one per ST-1 category.
 * Every numeric field is finite-checked (+ bounded where a domain exists) so NaN
 * / Infinity / negative values are rejected at validation time (AGENTS §24.1).
 * `.loose()` keeps forward-compatibility with future extraction fields.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Enforce a real, finite number (rejects NaN/Infinity) — AGENTS §24.1. */
function finite(schema: z.ZodNumber): z.ZodNumber {
    return schema.refine((n) => Number.isFinite(n), { message: 'must be finite' });
}

export const FailureRecordSchema: z.ZodType<FailureRecord> = z
    .object({
        name: z.string().min(1),
        suite: z.string().optional(),
        status: z.enum(['failed', 'broken', 'skipped']),
        message: z.string().optional(),
        trace: z.string().optional(),
        file: z.string().optional(),
        line: finite(z.number().int().nonnegative()).optional(),
        duration: finite(z.number().nonnegative()).optional(),
        retries: finite(z.number().int().nonnegative()).optional(),
        flaky: z.boolean().optional(),
        category: z.string().optional(),
        confidence: finite(z.number().min(0).max(1)),
        source: z.string().min(1),
    })
    .loose();

export const SecurityFindingSchema: z.ZodType<SecurityFinding> = z
    .object({
        tool: z.string().min(1),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
        rule: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        file: z.string().optional(),
        line: finite(z.number().int().nonnegative()).optional(),
        url: z.string().optional(),
        state: z.enum(['open', 'dismissed', 'fixed']).optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const DeploymentSchema: z.ZodType<Deployment> = z
    .object({
        id: z.string().min(1),
        environment: z.string().min(1),
        status: z.string().min(1),
        sha: z.string().optional(),
        ref: z.string().optional(),
        createdAt: z.string().min(1),
        updatedAt: z.string().optional(),
        url: z.string().optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const ReleaseSchema: z.ZodType<Release> = z
    .object({
        id: z.string().min(1),
        tag: z.string().min(1),
        draft: z.boolean(),
        prerelease: z.boolean(),
        createdAt: z.string().min(1),
        name: z.string().optional(),
        publishedAt: z.string().optional(),
        author: z.string().optional(),
        url: z.string().optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const DoraMetricsSchema: z.ZodType<DoraMetrics> = z
    .object({
        deploymentFrequency: finite(z.number()).optional(),
        leadTimeForChanges: finite(z.number()).optional(),
        meanTimeToRecovery: finite(z.number()).optional(),
        changeFailureRate: finite(z.number().min(0).max(1)).optional(),
        source: z.string().optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const RawIssueSchema: z.ZodType<RawIssue> = z
    .object({
        source: z.enum(['github', 'gitlab']),
        id: z.union([z.string(), z.number()]),
        key: z.union([z.string(), z.number()]).optional(),
        title: z.string().min(1),
        state: z.string().min(1),
        author: z.string().optional(),
        labels: z.array(z.string()),
        createdAt: z.string().min(1),
        updatedAt: z.string().optional(),
        url: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const CoverageFileSchema: z.ZodType<CoverageFile> = z
    .object({
        file: z.string().min(1),
        lines: z.object({
            total: finite(z.number().int().nonnegative()),
            covered: finite(z.number().int().nonnegative()),
            percentage: finite(z.number().min(0).max(100)).optional(),
        }),
        branches: z
            .object({
                total: finite(z.number().int().nonnegative()),
                covered: finite(z.number().int().nonnegative()),
                percentage: finite(z.number().min(0).max(100)),
            })
            .optional(),
        functions: z
            .object({
                total: finite(z.number().int().nonnegative()),
                covered: finite(z.number().int().nonnegative()),
                percentage: finite(z.number().min(0).max(100)),
            })
            .optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const PerformanceMetricsSchema: z.ZodType<PerformanceMetrics> = z
    .object({
        pipelineDurationMs: finite(z.number().nonnegative()).optional(),
        queueWaitMs: finite(z.number().nonnegative()).optional(),
        runnerUtilization: finite(z.number().min(0).max(100)).optional(),
        billableMinutes: finite(z.number().nonnegative()).optional(),
        perTestP95Ms: finite(z.number().nonnegative()).optional(),
        suiteSpeedP95Ms: finite(z.number().nonnegative()).optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

export const RawPullRequestSchema: z.ZodType<RawPullRequest> = z
    .object({
        id: finite(z.number().int().nonnegative()),
        number: finite(z.number().int().nonnegative()),
        title: z.string().optional(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
        url: z.string().optional(),
        draft: z.boolean().optional(),
        merged: z.boolean().optional(),
        mergedAt: z.string().optional(),
        author: z.string().optional(),
        labels: z.array(z.string()).optional(),
        reviewStates: z.array(z.string()).optional(),
        confidence: finite(z.number().min(0).max(1)),
    })
    .loose();

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Map an extraction provenance/source to a confidence score.
 * - structured (ctrf, junit, check-run-annotation, xray, github, gitlab, …): high
 * - regex / log based extraction: low
 * - manual: medium
 * - unknown: medium (never silently assign high to unverified data)
 */
export function confidenceForSource(source: string | undefined): number {
    if (!source) return 0.5;
    const s = source.toLowerCase();
    if (s.includes('log') || s.includes('regex')) return 0.4;
    if (s.includes('manual')) return 0.6;
    return 0.9;
}

/** Short, stable one-line description of the first Zod issue. */
function firstZodError(err: z.ZodError): string {
    const first = err.issues[0];
    if (!first) return 'unknown schema error';
    const path = first.path.join('.') || '<root>';
    return `${path}: ${first.message}`;
}

/** True when `confidence` is a finite number within [0, 1]. */
function isConfidenceValid(confidence: unknown): confidence is number {
    return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Generic array scorer
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ValidateAndScoreOptions<T> {
    /** Natural key for dedup (distinct keys are never dropped). */
    key: (item: T) => string;
    /** Extract provenance/source from an item (optional). */
    sourceOf?: (item: T) => string | undefined;
    /** When true, a missing source is recorded as a quality issue. */
    requireProvenance?: boolean;
}

/**
 * Validate + score an array category.
 *
 * Behavior (never silently drops data — AGENTS §25):
 * - empty/absent input -> empty result, valid.
 * - dedup by natural key (distinct data preserved, duplicates collapsed).
 * - each item schema-checked; on failure the ORIGINAL item is kept and tagged.
 * - provenance required where `requireProvenance` is set.
 * - confidence normalized (NaN/negative/out-of-range -> derived from source).
 */
export function validateAndScore<T>(
    items: T[] | undefined,
    schema: z.ZodType<T>,
    opts: ValidateAndScoreOptions<T>,
): { items: T[]; quality: QualityReport } {
    const issues: string[] = [];

    if (items == null || items.length === 0) {
        return { items: [], quality: { valid: true, issues: [] } };
    }

    const seen = new Set<string>();
    const out: T[] = [];

    for (const raw of items) {
        const naturalKey = opts.key(raw);

        if (seen.has(naturalKey)) {
            continue; // dedup: collapse duplicate, keep first occurrence
        }
        seen.add(naturalKey);

        const parsed = schema.safeParse(raw);
        let item: T = raw;
        if (!parsed.success) {
            issues.push(`schema invalid [${naturalKey}]: ${firstZodError(parsed.error)}`);
        } else {
            item = parsed.data;
        }

        const src = opts.sourceOf?.(item);

        if (opts.requireProvenance && !src) {
            issues.push(`missing provenance [${naturalKey}]`);
        }

        if (!isConfidenceValid((item as Record<string, unknown>)['confidence'])) {
            const assigned = confidenceForSource(src);
            issues.push(`confidence normalized -> ${assigned} [${naturalKey}]`);
            item = { ...item, confidence: assigned };
        }

        out.push(item);
    }

    return { items: out, quality: { valid: issues.length === 0, issues } };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Per-category wrappers (array categories)
 * ─────────────────────────────────────────────────────────────────────────── */

export function validateAndScoreFailureRecords(items: FailureRecord[] | undefined): {
    items: FailureRecord[];
    quality: QualityReport;
} {
    return validateAndScore(items, FailureRecordSchema, {
        key: (r) => `${r.source}|${r.suite ?? ''}|${r.name}`,
        sourceOf: (r) => r.source,
        requireProvenance: true,
    });
}

export function validateAndScoreSecurityFindings(items: SecurityFinding[] | undefined): {
    items: SecurityFinding[];
    quality: QualityReport;
} {
    return validateAndScore(items, SecurityFindingSchema, {
        key: (f) => `${f.tool}|${f.title}|${f.file ?? ''}|${f.line ?? ''}`,
        sourceOf: (f) => f.tool,
        requireProvenance: true,
    });
}

export function validateAndScoreDeployments(items: Deployment[] | undefined): {
    items: Deployment[];
    quality: QualityReport;
} {
    return validateAndScore(items, DeploymentSchema, {
        key: (d) => String(d.id),
        sourceOf: (d) => d.environment,
    });
}

export function validateAndScoreReleases(items: Release[] | undefined): {
    items: Release[];
    quality: QualityReport;
} {
    return validateAndScore(items, ReleaseSchema, {
        key: (r) => String(r.id),
        sourceOf: (r) => r.tag,
    });
}

export function validateAndScorePmIssues(items: RawIssue[] | undefined): {
    items: RawIssue[];
    quality: QualityReport;
} {
    return validateAndScore(items, RawIssueSchema, {
        key: (i) => `${i.source}|${i.id}`,
        sourceOf: (i) => i.source,
        requireProvenance: true,
    });
}

export function validateAndScoreCoverageFiles(items: CoverageFile[] | undefined): {
    items: CoverageFile[];
    quality: QualityReport;
} {
    return validateAndScore(items, CoverageFileSchema, {
        key: (c) => c.file,
        sourceOf: (c) => c.file,
    });
}

export function validateAndScorePullRequests(items: RawPullRequest[] | undefined): {
    items: RawPullRequest[];
    quality: QualityReport;
} {
    return validateAndScore(items, RawPullRequestSchema, {
        key: (p) => String(p.id),
        sourceOf: (p) => p.author,
    });
}

/* ───────────────────────────────────────────────────────────────────────────
 * Object-category scorers (DORA / Performance)
 * ─────────────────────────────────────────────────────────────────────────── */

export function validateAndScoreDoraMetrics(metrics: DoraMetrics | null | undefined): {
    value: DoraMetrics | null;
    quality: QualityReport;
} {
    if (metrics == null) {
        return { value: null, quality: { valid: true, issues: [] } };
    }

    const issues: string[] = [];
    let value: DoraMetrics = metrics;

    const parsed = DoraMetricsSchema.safeParse(metrics);
    if (!parsed.success) {
        issues.push(`schema invalid: ${firstZodError(parsed.error)}`);
    } else {
        value = parsed.data;
    }

    if (!isConfidenceValid(value.confidence)) {
        const assigned = confidenceForSource(value.source);
        issues.push(`confidence normalized -> ${assigned}`);
        value = { ...value, confidence: assigned };
    }

    return { value, quality: { valid: issues.length === 0, issues } };
}

export function validateAndScorePerformanceMetrics(metrics: PerformanceMetrics | null | undefined): {
    value: PerformanceMetrics | null;
    quality: QualityReport;
} {
    if (metrics == null) {
        return { value: null, quality: { valid: true, issues: [] } };
    }

    const issues: string[] = [];
    let value: PerformanceMetrics = metrics;

    const parsed = PerformanceMetricsSchema.safeParse(metrics);
    if (!parsed.success) {
        issues.push(`schema invalid: ${firstZodError(parsed.error)}`);
    } else {
        value = parsed.data;
    }

    if (!isConfidenceValid(value.confidence)) {
        const assigned = confidenceForSource(undefined);
        issues.push(`confidence normalized -> ${assigned}`);
        value = { ...value, confidence: assigned };
    }

    return { value, quality: { valid: issues.length === 0, issues } };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Ingest gate — whole-payload quality enforcement (ST-3)
 * ─────────────────────────────────────────────────────────────────────────── */

/** The 8 quality-gated ST-1 categories. */
export type QualityCategory =
    | 'failureRecords'
    | 'securityFindings'
    | 'deployments'
    | 'releases'
    | 'pmIssues'
    | 'coverageFiles'
    | 'doraMetrics'
    | 'performanceMetrics'
    | 'pullRequests';

/** Per-category quality reports, keyed by QualityCategory. */
export type QualityCategoryMap = Record<QualityCategory, QualityReport>;

/**
 * Gate an entire `RawData` payload at the INGEST boundary (the funnel through
 * which every external/user payload becomes the trusted in-memory model).
 *
 * Every ST-1 category is validated, NaN/Infinity/negative confidence normalized,
 * deduped by natural key and provenance-checked. Invalid / low-quality data is
 * TAGGED via the returned `quality` report — it is NEVER dropped (AGENTS §25:
 * zero silenciamento, não drop). All other `RawData` fields are preserved
 * untouched so the shape consumed by compute/features is unchanged.
 *
 * This is the authoritative gate for `hub.raw` (the served model). The store
 * layer applies the same per-category wrappers as a defense-in-depth backstop.
 */
export function gateRawData(raw: RawData): { raw: RawData; quality: QualityCategoryMap } {
    const failureRecords = validateAndScoreFailureRecords(raw.failureRecords);
    const securityFindings = validateAndScoreSecurityFindings(raw.securityFindings);
    const deployments = validateAndScoreDeployments(raw.deployments);
    const releases = validateAndScoreReleases(raw.releases);
    const pmIssues = validateAndScorePmIssues(raw.pmIssues);
    const coverageFiles = validateAndScoreCoverageFiles(raw.coverageFiles);
    const doraMetrics = validateAndScoreDoraMetrics(raw.doraMetrics);
    const performanceMetrics = validateAndScorePerformanceMetrics(raw.performanceMetrics);
    const pullRequests = validateAndScorePullRequests(raw.pullRequests);

    const gated: RawData = {
        ...raw,
        failureRecords: failureRecords.items,
        securityFindings: securityFindings.items,
        deployments: deployments.items,
        releases: releases.items,
        pmIssues: pmIssues.items,
        coverageFiles: coverageFiles.items,
        ...(pullRequests.items.length > 0 ? { pullRequests: pullRequests.items } : {}),
    };
    if (doraMetrics.value != null) gated.doraMetrics = doraMetrics.value;
    if (performanceMetrics.value != null) gated.performanceMetrics = performanceMetrics.value;

    const quality: QualityCategoryMap = {
        failureRecords: failureRecords.quality,
        securityFindings: securityFindings.quality,
        deployments: deployments.quality,
        releases: releases.quality,
        pmIssues: pmIssues.quality,
        coverageFiles: coverageFiles.quality,
        doraMetrics: doraMetrics.quality,
        performanceMetrics: performanceMetrics.quality,
        pullRequests: pullRequests.quality,
    };

    return { raw: gated, quality };
}
