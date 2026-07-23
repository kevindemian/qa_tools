vi.mock('../../shared/ui/prompt.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    isQuiet: vi.fn(() => true),
    onError: vi.fn(() => 'skip'),
    print: vi.fn(),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
    },
}));

vi.mock('../../shared/errors.js', () => ({
    formatErr: vi.fn((err: unknown) => String(err)),
}));

import { describe, it, expect, vi } from 'vitest';
import {
    snapshotIssueState,
    clearIssueFields,
    rebuildIssueFields,
    restoreIssueState,
    cleanSlateUpdate,
    type SnapshotContext,
    type IssueFieldSnapshot,
} from '../issue-snapshot.js';

function createMockContext(overrides?: Partial<SnapshotContext>): SnapshotContext {
    return {
        jiraResource: {
            getJiraResource: vi.fn().mockResolvedValue({ fields: { description: 'old desc' } }),
            postJiraResource: vi.fn().mockResolvedValue({}),
            putJiraResource: vi.fn().mockResolvedValue(null),
            deleteJiraResource: vi.fn().mockResolvedValue({}),
            searchJiraIssues: vi.fn().mockResolvedValue({ issues: [], total: 0 }),
            getTransitionsForIssue: vi.fn().mockResolvedValue({}),
            transitionIssue: vi.fn().mockResolvedValue(undefined),
        },
        resolveNumericId: vi.fn().mockResolvedValue('12345'),
        xrayCloud: {
            getTestSteps: vi.fn().mockResolvedValue([{ id: 's1', action: 'do X', data: '', result: 'ok' }]),
            getTestPreconditions: vi.fn().mockResolvedValue(['p1', 'p2']),
            removeAllTestSteps: vi.fn().mockResolvedValue(undefined),
            addTestStep: vi.fn().mockResolvedValue(undefined),
            removePreconditionsFromTest: vi.fn().mockResolvedValue(undefined),
            addPreconditionsToTest: vi.fn().mockResolvedValue(undefined),
        },
        clientId: 'cid',
        clientSecret: 'csec',
        linkOps: {
            getIssueLinksByType: vi.fn().mockResolvedValue([{ id: 'link1', targetKey: 'STORY-1' }]),
            removeIssueLink: vi.fn().mockResolvedValue(undefined),
            linkIssues: vi.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    };
}

describe('issue-snapshot', () => {
    describe('snapshotIssueState', () => {
        it('captures description, steps, preconditions, and links', async () => {
            const ctx = createMockContext();
            const snapshot = await snapshotIssueState(ctx, 'PROJ-1', ['Relates']);

            expect(snapshot.description).toBe('old desc');
            expect(snapshot.steps).toHaveLength(1);
            expect(snapshot.steps[0]?.id).toBe('s1');
            expect(snapshot.preconditions).toEqual(['p1', 'p2']);
            expect(snapshot.linkedIssues).toHaveLength(1);
            expect(snapshot.linkedIssues[0]?.linkType).toBe('Relates');
        });

        it('returns empty arrays when xrayCloud is null', async () => {
            const ctx = createMockContext({ xrayCloud: null });
            const snapshot = await snapshotIssueState(ctx, 'PROJ-1', ['Relates']);

            expect(snapshot.description).toBe('old desc');
            expect(snapshot.steps).toEqual([]);
            expect(snapshot.preconditions).toEqual([]);
            expect(snapshot.linkedIssues).toHaveLength(1);
        });

        it('returns empty snapshot on Jira API failure', async () => {
            const ctx = createMockContext();
            (ctx.jiraResource.getJiraResource as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('404'));
            const snapshot = await snapshotIssueState(ctx, 'PROJ-1', ['Relates']);

            expect(snapshot.description).toBeNull();
        });
    });

    describe('clearIssueFields', () => {
        it('clears description, steps, preconditions, and links', async () => {
            const ctx = createMockContext();
            await clearIssueFields(ctx, 'PROJ-1', ['Relates']);

            expect(ctx.jiraResource.putJiraResource).toHaveBeenCalledWith('issue/PROJ-1', {
                fields: { description: null },
            });
            expect(ctx.xrayCloud!.removeAllTestSteps).toHaveBeenCalledWith('12345', 'cid', 'csec');
            expect(ctx.xrayCloud!.removePreconditionsFromTest).toHaveBeenCalledWith(
                '12345',
                ['p1', 'p2'],
                'cid',
                'csec',
            );
            expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledWith('link1');
        });

        it('skips Xray operations when xrayCloud is null', async () => {
            const ctx = createMockContext({ xrayCloud: null });
            await clearIssueFields(ctx, 'PROJ-1', ['Relates']);

            expect(ctx.jiraResource.putJiraResource).toHaveBeenCalled();
        });

        it('continues when individual link removal fails', async () => {
            const ctx = createMockContext();
            (ctx.linkOps.removeIssueLink as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
            await clearIssueFields(ctx, 'PROJ-1', ['Relates']);

            expect(ctx.linkOps.removeIssueLink).toHaveBeenCalled();
        });
    });

    describe('rebuildIssueFields', () => {
        it('rebuilds description, steps, preconditions, and links', async () => {
            const ctx = createMockContext();
            await rebuildIssueFields(ctx, 'PROJ-1', {
                description: 'new desc',
                steps: [{ fields: { Action: 'do Y', Data: 'd', 'Expected Result': 'r' } }],
                preconditions: ['PREC-1'],
                linkedIssues: [{ id: '', targetKey: 'STORY-2', linkType: 'Blocks' }],
            });

            expect(ctx.jiraResource.putJiraResource).toHaveBeenCalledWith('issue/PROJ-1', {
                fields: { description: 'new desc' },
            });
            expect(ctx.xrayCloud!.addTestStep).toHaveBeenCalledWith(
                '12345',
                { action: 'do Y', data: 'd', result: 'r' },
                'cid',
                'csec',
            );
            expect(ctx.xrayCloud!.addPreconditionsToTest).toHaveBeenCalled();
            expect(ctx.linkOps.linkIssues).toHaveBeenCalled();
        });

        it('skips when all collections are empty', async () => {
            const ctx = createMockContext();
            await rebuildIssueFields(ctx, 'PROJ-1', {
                description: null,
                steps: [],
                preconditions: [],
                linkedIssues: [],
            });

            expect(ctx.jiraResource.putJiraResource).not.toHaveBeenCalled();
            expect(ctx.xrayCloud!.addTestStep).not.toHaveBeenCalled();
        });
    });

    describe('restoreIssueState', () => {
        it('restores from snapshot', async () => {
            const ctx = createMockContext();
            const snapshot: IssueFieldSnapshot = {
                description: 'restored desc',
                steps: [{ id: 's1', action: 'do X', data: '', result: 'ok' }],
                preconditions: ['p1'],
                linkedIssues: [{ id: 'link1', targetKey: 'STORY-1', linkType: 'Relates' }],
            };
            await restoreIssueState(ctx, 'PROJ-1', snapshot);

            expect(ctx.jiraResource.putJiraResource).toHaveBeenCalledWith('issue/PROJ-1', {
                fields: { description: 'restored desc' },
            });
            expect(ctx.xrayCloud!.addTestStep).toHaveBeenCalled();
            expect(ctx.xrayCloud!.addPreconditionsToTest).toHaveBeenCalled();
            expect(ctx.linkOps.linkIssues).toHaveBeenCalled();
        });
    });

    describe('cleanSlateUpdate', () => {
        it('snapshots, clears, PUTs, and rebuilds on success', async () => {
            const ctx = createMockContext();
            const result = await cleanSlateUpdate(
                ctx,
                'PROJ-1',
                { summary: 'Test', description: 'new' },
                {
                    description: 'new',
                    steps: [{ fields: { Action: 'do', Data: '', 'Expected Result': 'ok' } }],
                    preconditions: ['PREC-1'],
                    linkedIssues: [{ id: '', targetKey: 'STORY-1', linkType: 'Relates' }],
                },
                { linkTypeNames: ['Relates'] },
            );

            expect(result.success).toBe(true);
            expect(result.restored).toBe(false);
            // Snapshot was called
            expect(ctx.jiraResource.getJiraResource).toHaveBeenCalled();
            // Clear was called
            expect(ctx.xrayCloud!.removeAllTestSteps).toHaveBeenCalled();
            // PUT was called
            expect(ctx.jiraResource.putJiraResource).toHaveBeenCalled();
            // Rebuild was called
            expect(ctx.xrayCloud!.addTestStep).toHaveBeenCalled();
        });

        it('rolls back on rebuild failure', async () => {
            const ctx = createMockContext();
            // Make addTestStep fail during rebuild
            let callCount = 0;
            (ctx.xrayCloud!.addTestStep as ReturnType<typeof vi.fn>).mockImplementation(() => {
                callCount++;
                if (callCount === 1) throw new Error('rebuild fail');
                return Promise.resolve();
            });

            const result = await cleanSlateUpdate(
                ctx,
                'PROJ-1',
                { summary: 'Test' },
                {
                    description: 'new',
                    steps: [{ fields: { Action: 'do', Data: '', 'Expected Result': 'ok' } }],
                    preconditions: [],
                    linkedIssues: [],
                },
                { linkTypeNames: [] },
            );

            expect(result.success).toBe(false);
            expect(result.restored).toBe(true);
        });

        it('returns {success:false, restored:false} when rollback also fails', async () => {
            const ctx = createMockContext();
            // Make both rebuild AND restore fail
            (ctx.xrayCloud!.addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rebuild fail'));
            (ctx.jiraResource.putJiraResource as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('restore fail'));

            const result = await cleanSlateUpdate(
                ctx,
                'PROJ-1',
                { summary: 'Test' },
                {
                    description: 'new',
                    steps: [],
                    preconditions: [],
                    linkedIssues: [],
                },
                { linkTypeNames: [] },
            );

            expect(result.success).toBe(false);
            expect(result.restored).toBe(false);
        });
    });
});
