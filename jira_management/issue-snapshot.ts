/** Issue snapshot — captures current state of modifiable fields and provides
 *  clear/rebuild/restore operations for atomic updates with rollback.
 *
 *  Fields covered: description, steps (Xray), preconditions (Xray/Jira), linked issues.
 *  Strategy: snapshot → clear → rebuild. On failure: per-step rollback via onStepFailure handler.
 *
 *  Every sub-function returns StepResult for structured tracing.
 *  clearIssueFields/rebuildIssueFields collect StepResult[] without throwing.
 *  cleanSlateUpdate orchestrates with optional StepFailureHandler for interactive error handling. */
import { rootLogger } from '../shared/logger.js';
import { formatErr } from '../shared/errors.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';
import type {
    StepResult,
    StepInfo,
    StepFailureHandler,
    IssueFieldSnapshot,
    LinkSnapshot,
    StepSnapshot,
} from '../shared/types/clean-slate.js';

// Re-export snapshot types for backward compatibility
export type { StepSnapshot, LinkSnapshot, IssueFieldSnapshot } from '../shared/types/clean-slate.js';
export type { StepResult, StepInfo, SnapshotPartial, StepFailureHandler } from '../shared/types/clean-slate.js';

export interface SnapshotContext {
    jiraResource: JiraResourceLike;
    /** Resolve Jira issue key to numeric id (for Xray Cloud GraphQL). */
    resolveNumericId: (key: string) => Promise<string>;
    /** Xray Cloud client — may be null for Server mode. */
    xrayCloud: {
        getTestSteps(
            id: string,
            cid: string,
            csec: string,
        ): Promise<Array<{ id: string; action: string; data: string; result: string }>>;
        getTestPreconditions(id: string, cid: string, csec: string): Promise<string[]>;
        removeAllTestSteps(id: string, cid: string, csec: string): Promise<void>;
        addTestStep(
            id: string,
            step: { action: string; data: string; result: string },
            cid: string,
            csec: string,
        ): Promise<void>;
        removePreconditionsFromTest(id: string, ids: string[], cid: string, csec: string): Promise<void>;
        addPreconditionsToTest(id: string, ids: string[], cid: string, csec: string): Promise<void>;
    } | null;
    clientId: string;
    clientSecret: string;
    /** LinkOperations instance — provides getIssueLinksByType, removeIssueLink, linkIssues. */
    linkOps: {
        getIssueLinksByType(key: string, typeName: string): Promise<Array<{ id: string; targetKey: string }>>;
        removeIssueLink(linkId: string): Promise<void>;
        linkIssues(key: string, linkedIssues: Array<{ key: string; linkType: string }>): Promise<void>;
    };
    /** Per-step snapshots for granular rollback. Populated during clearIssueFields/rebuildIssueFields. */
    stepSnapshots?: Map<string, IssueFieldSnapshot>;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function makeStepResult(ok: boolean, step: string, detail: string, startMs: number, error?: string): StepResult {
    const result: StepResult = { ok, step, detail, duration: Date.now() - startMs };
    if (error !== undefined) result.error = error;
    return result;
}

// ─────────────────────────────────────────────────────────────────
// SNAPSHOT
// ─────────────────────────────────────────────────────────────────

async function snapshotDescription(jiraResource: JiraResourceLike, issueKey: string): Promise<string | null> {
    try {
        const issue = await jiraResource.getJiraResource<{ fields?: { description?: string } }>(
            'issue/' + issueKey + '?fields=description',
        );
        return issue.fields?.description ?? null;
    } catch (err) {
        rootLogger.warn('snapshotDescription: falha ao ler description de ' + issueKey + ': ' + formatErr(err));
        return null;
    }
}

async function snapshotSteps(ctx: SnapshotContext, issueKey: string): Promise<StepSnapshot[]> {
    if (!ctx.xrayCloud) return [];
    const SNAPSHOT_MAX_RETRIES = 3;
    const SNAPSHOT_BASE_DELAY_MS = 1000;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= SNAPSHOT_MAX_RETRIES; attempt++) {
        try {
            const numId = await ctx.resolveNumericId(issueKey);
            return await ctx.xrayCloud.getTestSteps(numId, ctx.clientId, ctx.clientSecret);
        } catch (err) {
            lastErr = err;
            const isTransient =
                ((err as { code?: string })?.code
                    ? ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN'].includes(
                          (err as { code: string }).code,
                      )
                    : false) ||
                (err instanceof Error && /read EINVAL|ECONNRESET/i.test(err.message));
            if (isTransient && attempt < SNAPSHOT_MAX_RETRIES) {
                const delay = SNAPSHOT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                rootLogger.warn(
                    `[snapshotSteps] Transient error (attempt ${attempt}/${SNAPSHOT_MAX_RETRIES}): ` +
                        (err instanceof Error ? err.message : String(err)) +
                        ` — retrying in ${delay}ms`,
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            rootLogger.warn('snapshotSteps: falha ao ler steps de ' + issueKey + ': ' + formatErr(err));
            return [];
        }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    rootLogger.warn(`[snapshotSteps] Failed after ${SNAPSHOT_MAX_RETRIES} retries: ${msg}`);
    return [];
}

async function snapshotPreconditions(ctx: SnapshotContext, issueKey: string): Promise<string[]> {
    if (!ctx.xrayCloud) return [];
    const SNAPSHOT_MAX_RETRIES = 3;
    const SNAPSHOT_BASE_DELAY_MS = 1000;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= SNAPSHOT_MAX_RETRIES; attempt++) {
        try {
            const numId = await ctx.resolveNumericId(issueKey);
            return await ctx.xrayCloud.getTestPreconditions(numId, ctx.clientId, ctx.clientSecret);
        } catch (err) {
            lastErr = err;
            const isTransient =
                ((err as { code?: string })?.code
                    ? ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN'].includes(
                          (err as { code: string }).code,
                      )
                    : false) ||
                (err instanceof Error && /read EINVAL|ECONNRESET/i.test(err.message));
            if (isTransient && attempt < SNAPSHOT_MAX_RETRIES) {
                const delay = SNAPSHOT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                rootLogger.warn(
                    `[snapshotPreconditions] Transient error (attempt ${attempt}/${SNAPSHOT_MAX_RETRIES}): ` +
                        (err instanceof Error ? err.message : String(err)) +
                        ` — retrying in ${delay}ms`,
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            rootLogger.warn('snapshotPreconditions: falha ao ler preconditions de ' + issueKey + ': ' + formatErr(err));
            return [];
        }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    rootLogger.warn(`[snapshotPreconditions] Failed after ${SNAPSHOT_MAX_RETRIES} retries: ${msg}`);
    return [];
}

async function snapshotLinks(ctx: SnapshotContext, issueKey: string, linkTypeNames: string[]): Promise<LinkSnapshot[]> {
    const allLinks: LinkSnapshot[] = [];
    for (const typeName of linkTypeNames) {
        try {
            const links = await ctx.linkOps.getIssueLinksByType(issueKey, typeName);
            allLinks.push(...links.map((l) => ({ ...l, linkType: typeName })));
        } catch (err) {
            rootLogger.warn(
                'snapshotLinks: falha ao ler links tipo "' + typeName + '" de ' + issueKey + ': ' + formatErr(err),
            );
        }
    }
    return allLinks;
}

/** Capture a full snapshot of all modifiable fields for the given issue. */
export async function snapshotIssueState(
    ctx: SnapshotContext,
    issueKey: string,
    linkTypeNames: string[],
): Promise<IssueFieldSnapshot> {
    const [description, steps, preconditions, linkedIssues] = await Promise.all([
        snapshotDescription(ctx.jiraResource, issueKey),
        snapshotSteps(ctx, issueKey),
        snapshotPreconditions(ctx, issueKey),
        snapshotLinks(ctx, issueKey, linkTypeNames),
    ]);
    rootLogger.info(
        'snapshot: capturado estado de ' +
            issueKey +
            ' — ' +
            [
                'desc=' + (description !== null ? 'yes' : 'no'),
                'steps=' + steps.length,
                'prec=' + preconditions.length,
                'links=' + linkedIssues.length,
            ].join(', '),
    );
    return { description, steps, preconditions, linkedIssues };
}

// ─────────────────────────────────────────────────────────────────
// CLEAR (each returns StepResult)
// ─────────────────────────────────────────────────────────────────

async function clearDescription(jiraResource: JiraResourceLike, issueKey: string): Promise<StepResult> {
    const start = Date.now();
    try {
        await jiraResource.putJiraResource('issue/' + issueKey, { fields: { description: null } });
        return makeStepResult(true, 'clear-description', 'description cleared', start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'clear-description', msg, start, msg);
    }
}

async function clearSteps(ctx: SnapshotContext, issueKey: string): Promise<StepResult> {
    const start = Date.now();
    if (!ctx.xrayCloud) {
        return makeStepResult(true, 'clear-steps', 'skipped (no xrayCloud)', start);
    }
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        await ctx.xrayCloud.removeAllTestSteps(numId, ctx.clientId, ctx.clientSecret);
        return makeStepResult(true, 'clear-steps', 'steps cleared', start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'clear-steps', msg, start, msg);
    }
}

async function clearPreconditions(ctx: SnapshotContext, issueKey: string): Promise<StepResult> {
    const start = Date.now();
    if (!ctx.xrayCloud) {
        return makeStepResult(true, 'clear-preconditions', 'skipped (no xrayCloud)', start);
    }
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        const existing = await ctx.xrayCloud.getTestPreconditions(numId, ctx.clientId, ctx.clientSecret);
        if (existing.length > 0) {
            await ctx.xrayCloud.removePreconditionsFromTest(numId, existing, ctx.clientId, ctx.clientSecret);
        }
        return makeStepResult(true, 'clear-preconditions', `${existing.length} preconditions removed`, start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'clear-preconditions', msg, start, msg);
    }
}

async function clearLinks(ctx: SnapshotContext, issueKey: string, linkTypeNames: string[]): Promise<StepResult> {
    const start = Date.now();
    const commonLinkTypes = [
        'Relates',
        'Blocks',
        'is blocked by',
        'Clones',
        'is cloned by',
        'Duplicates',
        'is duplicated by',
        'Test',
        'is tested by',
        'Pre-Condition',
        'is required by',
    ];
    const allTypesToCheck = [...new Set([...linkTypeNames, ...commonLinkTypes])];
    let totalRemoved = 0;
    const errors: string[] = [];

    for (const typeName of allTypesToCheck) {
        let links;
        try {
            links = await ctx.linkOps.getIssueLinksByType(issueKey, typeName);
        } catch (err) {
            rootLogger.warn('clearLinks: falha ao buscar links do tipo ' + typeName + ': ' + formatErr(err));
            errors.push(`fetch ${typeName}: ${formatErr(err)}`);
            continue;
        }
        for (const link of links) {
            try {
                await ctx.linkOps.removeIssueLink(link.id);
                totalRemoved++;
            } catch (err) {
                const msg = `remove ${typeName}/${link.id}: ${formatErr(err)}`;
                rootLogger.warn('clearLinks: ' + msg);
                errors.push(msg);
            }
        }
    }

    if (errors.length > 0) {
        const detail = `${totalRemoved} links removed, ${errors.length} errors: ${errors.join('; ')}`;
        return makeStepResult(false, 'clear-links', detail, start, errors.join('; '));
    }
    return makeStepResult(true, 'clear-links', `${totalRemoved} links removed`, start);
}

// ─────────────────────────────────────────────────────────────────
// CLEAR ISSUE FIELDS (collects StepResult[])
// ─────────────────────────────────────────────────────────────────

/** Clear all modifiable fields for the given issue. Returns StepResult[] for each sub-step. */
export async function clearIssueFields(
    ctx: SnapshotContext,
    issueKey: string,
    linkTypeNames: string[],
): Promise<StepResult[]> {
    rootLogger.info('clear: apagando campos de ' + issueKey);

    // Save partial snapshot for per-step rollback
    if (ctx.stepSnapshots) {
        const snap = await snapshotIssueState(ctx, issueKey, linkTypeNames);
        ctx.stepSnapshots.set('clear', snap);
    }

    const results: StepResult[] = [];
    results.push(await clearDescription(ctx.jiraResource, issueKey));
    results.push(await clearSteps(ctx, issueKey));
    results.push(await clearPreconditions(ctx, issueKey));
    results.push(await clearLinks(ctx, issueKey, linkTypeNames));

    return results;
}

// ─────────────────────────────────────────────────────────────────
// REBUILD (each returns StepResult)
// ─────────────────────────────────────────────────────────────────

async function rebuildDescription(
    jiraResource: JiraResourceLike,
    issueKey: string,
    description: string | null,
): Promise<StepResult> {
    const start = Date.now();
    if (description === null || description === undefined) {
        return makeStepResult(true, 'rebuild-description', 'skipped (null)', start);
    }
    try {
        await jiraResource.putJiraResource('issue/' + issueKey, { fields: { description } });
        return makeStepResult(true, 'rebuild-description', 'description set', start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'rebuild-description', msg, start, msg);
    }
}

async function rebuildSteps(ctx: SnapshotContext, issueKey: string, steps: TestStep[]): Promise<StepResult> {
    const start = Date.now();
    if (steps.length === 0) {
        return makeStepResult(true, 'rebuild-steps', 'skipped (0 steps)', start);
    }
    if (!ctx.xrayCloud) {
        return makeStepResult(true, 'rebuild-steps', 'skipped (no xrayCloud)', start);
    }
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        for (const step of steps) {
            await ctx.xrayCloud.addTestStep(
                numId,
                {
                    action: step.fields.Action ?? '',
                    data: step.fields.Data ?? '',
                    result: step.fields['Expected Result'] ?? '',
                },
                ctx.clientId,
                ctx.clientSecret,
            );
        }
        return makeStepResult(true, 'rebuild-steps', `${steps.length} steps added`, start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'rebuild-steps', msg, start, msg);
    }
}

async function rebuildPreconditions(
    ctx: SnapshotContext,
    issueKey: string,
    preconditionKeys: string[],
): Promise<StepResult> {
    const start = Date.now();
    if (preconditionKeys.length === 0) {
        return makeStepResult(true, 'rebuild-preconditions', 'skipped (0 keys)', start);
    }
    if (!ctx.xrayCloud) {
        return makeStepResult(true, 'rebuild-preconditions', 'skipped (no xrayCloud)', start);
    }
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        const precIds = await Promise.all(preconditionKeys.map((k) => ctx.resolveNumericId(k)));
        const validIds = precIds.filter(Boolean);
        if (validIds.length > 0) {
            await ctx.xrayCloud.addPreconditionsToTest(numId, validIds, ctx.clientId, ctx.clientSecret);
        }
        return makeStepResult(true, 'rebuild-preconditions', `${validIds.length} preconditions associated`, start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'rebuild-preconditions', msg, start, msg);
    }
}

async function rebuildLinks(ctx: SnapshotContext, issueKey: string, links: LinkSnapshot[]): Promise<StepResult> {
    const start = Date.now();
    if (links.length === 0) {
        return makeStepResult(true, 'rebuild-links', 'skipped (0 links)', start);
    }
    try {
        const grouped = new Map<string, string[]>();
        for (const link of links) {
            const existing = grouped.get(link.linkType) ?? [];
            existing.push(link.targetKey);
            grouped.set(link.linkType, existing);
        }
        const linkedIssues: Array<{ key: string; linkType: string }> = [];
        for (const [linkType, keys] of grouped) {
            for (const key of keys) {
                linkedIssues.push({ key, linkType });
            }
        }
        await ctx.linkOps.linkIssues(issueKey, linkedIssues);
        return makeStepResult(true, 'rebuild-links', `${links.length} links created`, start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, 'rebuild-links', msg, start, msg);
    }
}

// ─────────────────────────────────────────────────────────────────
// REBUILD ISSUE FIELDS (collects StepResult[])
// ─────────────────────────────────────────────────────────────────

/** Rebuild all modifiable fields from the provided data. Returns StepResult[] for each sub-step. */
export async function rebuildIssueFields(
    ctx: SnapshotContext,
    issueKey: string,
    data: {
        description: string | null;
        steps: TestStep[];
        preconditions: string[];
        linkedIssues: LinkSnapshot[];
    },
): Promise<StepResult[]> {
    rootLogger.info('rebuild: recriando campos de ' + issueKey);

    // Save partial snapshot for per-step rollback
    if (ctx.stepSnapshots) {
        const current: IssueFieldSnapshot = {
            description: null,
            steps: [],
            preconditions: [],
            linkedIssues: [],
        };
        ctx.stepSnapshots.set('rebuild', current);
    }

    const results: StepResult[] = [];
    results.push(await rebuildDescription(ctx.jiraResource, issueKey, data.description));
    results.push(await rebuildSteps(ctx, issueKey, data.steps));
    results.push(await rebuildPreconditions(ctx, issueKey, data.preconditions));
    results.push(await rebuildLinks(ctx, issueKey, data.linkedIssues));

    return results;
}

// ─────────────────────────────────────────────────────────────────
// RESTORE (rollback)
// ─────────────────────────────────────────────────────────────────

/** Restore issue to the previously captured snapshot state. */
export async function restoreIssueState(
    ctx: SnapshotContext,
    issueKey: string,
    snapshot: IssueFieldSnapshot,
): Promise<void> {
    rootLogger.info('restore: restaurando estado de ' + issueKey);

    // Restore description
    await ctx.jiraResource.putJiraResource('issue/' + issueKey, {
        fields: { description: snapshot.description },
    });

    // Restore steps (snapshot steps use raw GraphQL shape, need mapping to TestStep[])
    if (ctx.xrayCloud && snapshot.steps.length > 0) {
        const numId = await ctx.resolveNumericId(issueKey);
        for (const step of snapshot.steps) {
            await ctx.xrayCloud.addTestStep(
                numId,
                { action: step.action, data: step.data, result: step.result },
                ctx.clientId,
                ctx.clientSecret,
            );
        }
    }

    // Restore preconditions
    if (ctx.xrayCloud && snapshot.preconditions.length > 0) {
        const numId = await ctx.resolveNumericId(issueKey);
        const validIds = snapshot.preconditions.filter(Boolean);
        if (validIds.length > 0) {
            await ctx.xrayCloud.addPreconditionsToTest(numId, validIds, ctx.clientId, ctx.clientSecret);
        }
    }

    // Restore links
    if (snapshot.linkedIssues.length > 0) {
        // Group by linkType for batch restore
        const grouped = new Map<string, string[]>();
        for (const link of snapshot.linkedIssues) {
            const existing = grouped.get(link.linkType) ?? [];
            existing.push(link.targetKey);
            grouped.set(link.linkType, existing);
        }
        const linkedIssues: Array<{ key: string; linkType: string }> = [];
        for (const [linkType, keys] of grouped) {
            for (const key of keys) {
                linkedIssues.push({ key, linkType });
            }
        }
        await ctx.linkOps.linkIssues(issueKey, linkedIssues);
    }
}

// ─────────────────────────────────────────────────────────────────
// PER-STEP ROLLBACK
// ─────────────────────────────────────────────────────────────────

/** Restore a single step's state from the partial snapshot. */
async function restoreStepSnapshot(
    ctx: SnapshotContext,
    issueKey: string,
    stepName: string,
    snapshot: IssueFieldSnapshot,
): Promise<StepResult> {
    const start = Date.now();
    try {
        await restoreIssueState(ctx, issueKey, snapshot);
        return makeStepResult(true, `${stepName}:rollback`, 'restored', start);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeStepResult(false, `${stepName}:rollback`, msg, start, msg);
    }
}

// ─────────────────────────────────────────────────────────────────
// HIGH-LEVEL: clean-slate update with interactive error handling
// ─────────────────────────────────────────────────────────────────

export interface CleanSlateUpdateOptions {
    linkTypeNames: string[];
    /** Whether to include description in clean-slate. Default: true. */
    includeDescription?: boolean;
    /** Whether to include steps in clean-slate. Default: true. */
    includeSteps?: boolean;
    /** Whether to include preconditions in clean-slate. Default: true. */
    includePreconditions?: boolean;
    /** Whether to include linked issues in clean-slate. Default: true. */
    includeLinks?: boolean;
    /** Interactive error handler. If not provided, failures propagate as before. */
    onStepFailure?: StepFailureHandler;
}

/** Perform a clean-slate update with snapshot/rollback and per-step error handling.
 *  1. Snapshot current state
 *  2. Clear all fields (each step returns StepResult)
 *  3. PUT basic fields (summary, labels, etc.)
 *  4. Rebuild complex fields (each step returns StepResult)
 *  5. On failure: call onStepFailure for user decision (skip/abort/retry/rollback) */
export async function cleanSlateUpdate(
    ctx: SnapshotContext,
    issueKey: string,
    basicFields: Record<string, unknown>,
    rebuildData: {
        description: string | null;
        steps: TestStep[];
        preconditions: string[];
        linkedIssues: LinkSnapshot[];
    },
    opts: CleanSlateUpdateOptions,
): Promise<{ success: boolean; restored: boolean; stepResults: StepResult[] }> {
    const optsWithDefaults = {
        includeDescription: true,
        includeSteps: true,
        includePreconditions: true,
        includeLinks: true,
        ...opts,
    };

    const onStepFailure = optsWithDefaults.onStepFailure;

    // Determine which fields to snapshot/clear
    const activeLinkTypes = optsWithDefaults.includeLinks
        ? [...new Set(rebuildData.linkedIssues.map((l) => l.linkType).concat(opts.linkTypeNames))]
        : [];

    // 1. Snapshot
    const snapshot = await snapshotIssueState(ctx, issueKey, activeLinkTypes);

    // Ensure stepSnapshots map exists for per-step rollback
    if (!ctx.stepSnapshots) {
        ctx.stepSnapshots = new Map();
    }

    const allResults: StepResult[] = [];
    let aborted = false;

    // Helper: handle step failure with retry/skip/rollback logic
    async function handleStepFailure(
        result: StepResult,
        stepInput: unknown,
        completedSteps: StepResult[],
    ): Promise<'skip' | 'abort' | 'retry' | 'rollback'> {
        if (!onStepFailure) {
            // No handler: default to rollback
            return 'rollback';
        }

        const stepInfo: StepInfo = {
            step: result.step,
            totalSteps: 8,
            completedSteps,
            currentInput: stepInput,
        };

        const error = new Error(result.error ?? result.detail);
        return onStepFailure(error, stepInfo);
    }

    // 2. Clear phase (4 steps)
    const clearStepFns = [
        () => clearDescription(ctx.jiraResource, issueKey),
        () => clearSteps(ctx, issueKey),
        () => clearPreconditions(ctx, issueKey),
        () => clearLinks(ctx, issueKey, activeLinkTypes),
    ];

    for (const stepFn of clearStepFns) {
        const tempResult = await stepFn();
        const completedSoFar = [...allResults];

        if (!tempResult.ok && onStepFailure) {
            // Failed — ask user what to do
            let maxRetries = 3;
            let decision: 'skip' | 'abort' | 'retry' | 'rollback' = 'rollback';

            while (maxRetries > 0) {
                decision = await handleStepFailure(tempResult, activeLinkTypes, completedSoFar);

                if (decision === 'retry') {
                    maxRetries--;
                    const retryResult = await stepFn();
                    if (retryResult.ok) {
                        allResults.push({ ...retryResult, decision: 'retry' });
                        break;
                    }
                    continue;
                }
                break;
            }

            if (decision === 'abort') {
                allResults.push({ ...tempResult, decision: 'abort' });
                aborted = true;
                break;
            }

            if (decision === 'rollback') {
                // Restore snapshot for this clear phase
                const rollbackResult = await restoreStepSnapshot(ctx, issueKey, 'clear', snapshot);
                allResults.push({ ...tempResult, decision: 'rollback' });
                allResults.push(rollbackResult);
                break; // Stop clear phase, proceed to rebuild with restored state
            }

            if (decision === 'skip') {
                allResults.push({ ...tempResult, decision: 'skip' });
                continue;
            }
        } else if (!tempResult.ok) {
            // Failed without handler — default to global rollback
            allResults.push(tempResult);
            const rollbackResult = await restoreStepSnapshot(ctx, issueKey, 'clear', snapshot);
            allResults.push(rollbackResult);
            break;
        } else {
            allResults.push(tempResult);
        }
    }

    // 3. PUT basic fields (if not aborted)
    if (!aborted) {
        const putStart = Date.now();
        try {
            await ctx.jiraResource.putJiraResource('issue/' + issueKey, { fields: basicFields });
            allResults.push(makeStepResult(true, 'put-basic-fields', 'basic fields updated', putStart));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            allResults.push(makeStepResult(false, 'put-basic-fields', msg, putStart, msg));
            aborted = true;
        }
    }

    // 4. Rebuild phase (4 steps)
    if (!aborted) {
        const filteredRebuild = {
            description: optsWithDefaults.includeDescription ? rebuildData.description : snapshot.description,
            steps: optsWithDefaults.includeSteps ? rebuildData.steps : [],
            preconditions: optsWithDefaults.includePreconditions ? rebuildData.preconditions : [],
            linkedIssues: optsWithDefaults.includeLinks ? rebuildData.linkedIssues : [],
        };

        const rebuildFns = [
            () => rebuildDescription(ctx.jiraResource, issueKey, filteredRebuild.description),
            () => rebuildSteps(ctx, issueKey, filteredRebuild.steps),
            () => rebuildPreconditions(ctx, issueKey, filteredRebuild.preconditions),
            () => rebuildLinks(ctx, issueKey, filteredRebuild.linkedIssues),
        ];

        for (const stepFn of rebuildFns) {
            const tempResult = await stepFn();
            const completedSoFar = [...allResults];

            if (!tempResult.ok && onStepFailure) {
                let maxRetries = 3;
                let decision: 'skip' | 'abort' | 'retry' | 'rollback' = 'rollback';

                while (maxRetries > 0) {
                    decision = await handleStepFailure(tempResult, filteredRebuild, completedSoFar);

                    if (decision === 'retry') {
                        maxRetries--;
                        const retryResult = await stepFn();
                        if (retryResult.ok) {
                            allResults.push({ ...retryResult, decision: 'retry' });
                            break;
                        }
                        continue;
                    }
                    break;
                }

                if (decision === 'abort') {
                    allResults.push({ ...tempResult, decision: 'abort' });
                    aborted = true;
                    break;
                }

                if (decision === 'rollback') {
                    const rollbackResult = await restoreStepSnapshot(ctx, issueKey, 'rebuild', snapshot);
                    allResults.push({ ...tempResult, decision: 'rollback' });
                    allResults.push(rollbackResult);
                    break;
                }

                if (decision === 'skip') {
                    allResults.push({ ...tempResult, decision: 'skip' });
                    continue;
                }
            } else if (!tempResult.ok) {
                // Failed without handler — default to global rollback
                allResults.push(tempResult);
                const rollbackResult = await restoreStepSnapshot(ctx, issueKey, 'rebuild', snapshot);
                allResults.push(rollbackResult);
                break;
            } else {
                allResults.push(tempResult);
            }
        }
    }

    // 5. Determine overall success
    const anyFailed = allResults.some((r) => !r.ok && r.decision !== 'skip');
    const anyRestored = allResults.some((r) => r.step.includes(':rollback') && r.ok);

    if (aborted) {
        rootLogger.warn('clean-slate: abortido para ' + issueKey);
        return { success: false, restored: anyRestored, stepResults: allResults };
    }

    if (anyFailed) {
        rootLogger.warn('clean-slate: update com falhas para ' + issueKey + (anyRestored ? ' (restaurado)' : ''));
        return { success: false, restored: anyRestored, stepResults: allResults };
    }

    rootLogger.info('clean-slate: update concluido para ' + issueKey);
    return { success: true, restored: false, stepResults: allResults };
}
