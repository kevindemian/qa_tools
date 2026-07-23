/** Issue snapshot — captures current state of modifiable fields and provides
 *  clear/rebuild/restore operations for atomic updates with rollback.
 *
 *  Fields covered: description, steps (Xray), preconditions (Xray/Jira), linked issues.
 *  Strategy: snapshot → clear → rebuild. On failure: restore from snapshot → fallback (leave as-is). */
import { rootLogger } from '../shared/logger.js';
import { formatErr } from '../shared/errors.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';

export interface StepSnapshot {
    id: string;
    action: string;
    data: string;
    result: string;
}

export interface LinkSnapshot {
    id: string;
    targetKey: string;
    linkType: string;
}

export interface IssueFieldSnapshot {
    description: string | null;
    steps: StepSnapshot[];
    preconditions: string[];
    linkedIssues: LinkSnapshot[];
}

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
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        return await ctx.xrayCloud.getTestSteps(numId, ctx.clientId, ctx.clientSecret);
    } catch (err) {
        rootLogger.warn('snapshotSteps: falha ao ler steps de ' + issueKey + ': ' + formatErr(err));
        return [];
    }
}

async function snapshotPreconditions(ctx: SnapshotContext, issueKey: string): Promise<string[]> {
    if (!ctx.xrayCloud) return [];
    try {
        const numId = await ctx.resolveNumericId(issueKey);
        return await ctx.xrayCloud.getTestPreconditions(numId, ctx.clientId, ctx.clientSecret);
    } catch (err) {
        rootLogger.warn('snapshotPreconditions: falha ao ler preconditions de ' + issueKey + ': ' + formatErr(err));
        return [];
    }
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
// CLEAR
// ─────────────────────────────────────────────────────────────────

async function clearDescription(jiraResource: JiraResourceLike, issueKey: string): Promise<void> {
    await jiraResource.putJiraResource('issue/' + issueKey, { fields: { description: null } });
}

async function clearSteps(ctx: SnapshotContext, issueKey: string): Promise<void> {
    if (!ctx.xrayCloud) return;
    const numId = await ctx.resolveNumericId(issueKey);
    await ctx.xrayCloud.removeAllTestSteps(numId, ctx.clientId, ctx.clientSecret);
}

async function clearPreconditions(ctx: SnapshotContext, issueKey: string): Promise<void> {
    if (!ctx.xrayCloud) return;
    const numId = await ctx.resolveNumericId(issueKey);
    const existing = await ctx.xrayCloud.getTestPreconditions(numId, ctx.clientId, ctx.clientSecret);
    if (existing.length > 0) {
        await ctx.xrayCloud.removePreconditionsFromTest(numId, existing, ctx.clientId, ctx.clientSecret);
    }
}

async function clearLinks(ctx: SnapshotContext, issueKey: string, linkTypeNames: string[]): Promise<void> {
    for (const typeName of linkTypeNames) {
        const links = await ctx.linkOps.getIssueLinksByType(issueKey, typeName);
        for (const link of links) {
            try {
                await ctx.linkOps.removeIssueLink(link.id);
            } catch (err) {
                rootLogger.warn('clearLinks: falha ao remover link ' + link.id + ': ' + formatErr(err));
            }
        }
    }
}

/** Clear all modifiable fields for the given issue. */
export async function clearIssueFields(ctx: SnapshotContext, issueKey: string, linkTypeNames: string[]): Promise<void> {
    rootLogger.info('clear: apagando campos de ' + issueKey);
    await clearDescription(ctx.jiraResource, issueKey);
    await clearSteps(ctx, issueKey);
    await clearPreconditions(ctx, issueKey);
    await clearLinks(ctx, issueKey, linkTypeNames);
}

// ─────────────────────────────────────────────────────────────────
// REBUILD
// ─────────────────────────────────────────────────────────────────

async function rebuildDescription(
    jiraResource: JiraResourceLike,
    issueKey: string,
    description: string | null,
): Promise<void> {
    if (description === null || description === undefined) return;
    await jiraResource.putJiraResource('issue/' + issueKey, { fields: { description } });
}

async function rebuildSteps(ctx: SnapshotContext, issueKey: string, steps: TestStep[]): Promise<void> {
    if (steps.length === 0) return;
    if (!ctx.xrayCloud) return;
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
}

async function rebuildPreconditions(ctx: SnapshotContext, issueKey: string, preconditionKeys: string[]): Promise<void> {
    if (preconditionKeys.length === 0) return;
    if (!ctx.xrayCloud) return;
    const numId = await ctx.resolveNumericId(issueKey);
    const precIds = await Promise.all(preconditionKeys.map((k) => ctx.resolveNumericId(k)));
    const validIds = precIds.filter(Boolean);
    if (validIds.length > 0) {
        await ctx.xrayCloud.addPreconditionsToTest(numId, validIds, ctx.clientId, ctx.clientSecret);
    }
}

async function rebuildLinks(ctx: SnapshotContext, issueKey: string, links: LinkSnapshot[]): Promise<void> {
    if (links.length === 0) return;
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
}

/** Rebuild all modifiable fields from the provided data. */
export async function rebuildIssueFields(
    ctx: SnapshotContext,
    issueKey: string,
    data: {
        description: string | null;
        steps: TestStep[];
        preconditions: string[];
        linkedIssues: LinkSnapshot[];
    },
): Promise<void> {
    rootLogger.info('rebuild: recriando campos de ' + issueKey);
    await rebuildDescription(ctx.jiraResource, issueKey, data.description);
    await rebuildSteps(ctx, issueKey, data.steps);
    await rebuildPreconditions(ctx, issueKey, data.preconditions);
    await rebuildLinks(ctx, issueKey, data.linkedIssues);
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
// HIGH-LEVEL: clean-slate update with rollback
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
}

/** Perform a clean-slate update with snapshot/rollback.
 *  1. Snapshot current state
 *  2. Clear all fields
 *  3. PUT basic fields (summary, labels, etc.)
 *  4. Rebuild complex fields (steps, preconditions, links)
 *  5. On failure: restore from snapshot, fallback to leave as-is */
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
): Promise<{ success: boolean; restored: boolean }> {
    const optsWithDefaults = {
        includeDescription: true,
        includeSteps: true,
        includePreconditions: true,
        includeLinks: true,
        ...opts,
    };

    // Determine which fields to snapshot/clear
    const activeLinkTypes = optsWithDefaults.includeLinks
        ? [...new Set(rebuildData.linkedIssues.map((l) => l.linkType).concat(opts.linkTypeNames))]
        : [];

    // 1. Snapshot
    const snapshot = await snapshotIssueState(ctx, issueKey, activeLinkTypes);

    try {
        // 2. Clear
        const clearTypes = optsWithDefaults.includeLinks ? activeLinkTypes : [];
        await clearIssueFields(ctx, issueKey, clearTypes);

        // 3. PUT basic fields
        await ctx.jiraResource.putJiraResource('issue/' + issueKey, { fields: basicFields });

        // 4. Rebuild complex fields
        const filteredRebuild = {
            description: optsWithDefaults.includeDescription ? rebuildData.description : snapshot.description,
            steps: optsWithDefaults.includeSteps ? rebuildData.steps : [],
            preconditions: optsWithDefaults.includePreconditions ? rebuildData.preconditions : [],
            linkedIssues: optsWithDefaults.includeLinks ? rebuildData.linkedIssues : [],
        };
        await rebuildIssueFields(ctx, issueKey, filteredRebuild);

        rootLogger.info('clean-slate: update concluido para ' + issueKey);
        return { success: true, restored: false };
    } catch (err) {
        rootLogger.warn('clean-slate: rebuild falhou para ' + issueKey + ', tentando rollback: ' + formatErr(err));

        // 5. Rollback
        try {
            await restoreIssueState(ctx, issueKey, snapshot);
            rootLogger.info('clean-slate: rollback concluido para ' + issueKey);
            return { success: false, restored: true };
        } catch (restoreErr) {
            rootLogger.error(
                'clean-slate: rollback FALHOU para ' + issueKey + ' — deixando como está: ' + formatErr(restoreErr),
            );
            return { success: false, restored: false };
        }
    }
}
