/**
 * RED tests for clearLinks: must clear ALL link types found on the issue,
 * not just the default list. Must propagate errors when removal fails.
 *
 * Root cause: clearLinks() only iterates over linkTypeNames passed to it.
 * Default is ['Relates', 'Blocks', 'is blocked by']. Types like 'Tests',
 * 'Pre-Condition' are not cleared → rebuild creates duplicates on top.
 *
 * Expected (green): clearLinks fetches ALL link types from the issue and
 * clears every one of them, regardless of the default list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearIssueFields, type SnapshotContext } from '../issue-snapshot.js';

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
            getIssueLinksByType: vi
                .fn()
                .mockResolvedValue([{ id: 'link1', linkType: 'Relates', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' }]),
            removeIssueLink: vi.fn().mockResolvedValue(undefined),
            createLink: vi.fn().mockResolvedValue('created'),
        },
        ...overrides,
    };
}

describe('clearLinks: must clear ALL link types, not just default list', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = createMockContext();
    });

    it('red: clears links of ALL types found on the issue, not just the ones in linkTypeNames', async () => {
        // Mock: issue has links of types 'Test', 'Relates', 'Pre-Condition'
        let callCount = 0;
        (ctx.linkOps.getIssueLinksByType as ReturnType<typeof vi.fn>).mockImplementation(
            (_key: string, typeName: string) => {
                callCount++;
                if (typeName === 'Test') {
                    return Promise.resolve([
                        { id: 'link-tests-1', linkType: 'Test', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' },
                    ]);
                }
                if (typeName === 'Relates') {
                    return Promise.resolve([
                        { id: 'link-relates-1', linkType: 'Relates', inwardKey: 'STORY-2', outwardKey: 'PROJ-1' },
                    ]);
                }
                if (typeName === 'Pre-Condition') {
                    return Promise.resolve([
                        { id: 'link-prec-1', linkType: 'Pre-Condition', inwardKey: 'PREC-1', outwardKey: 'PROJ-1' },
                    ]);
                }
                return Promise.resolve([]);
            },
        );

        // Only pass 'Relates' as the linkTypeNames (the default)
        await clearIssueFields(ctx, 'PROJ-1', ['Relates']);

        // The bug: only 'Relates' links are cleared
        // Expected: ALL types ('Test', 'Relates', 'Pre-Condition') should be cleared
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledTimes(3);
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledWith('link-tests-1');
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledWith('link-relates-1');
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledWith('link-prec-1');
    });

    it('red: getIssueLinksByType is called for each link type found on the issue', async () => {
        // Mock: issue has links of types 'Test' and 'is tested by'
        (ctx.linkOps.getIssueLinksByType as ReturnType<typeof vi.fn>).mockImplementation(
            (_key: string, typeName: string) => {
                if (typeName === 'Test') {
                    return Promise.resolve([
                        { id: 'link-1', linkType: 'Test', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' },
                    ]);
                }
                if (typeName === 'is tested by') {
                    return Promise.resolve([
                        { id: 'link-2', linkType: 'is tested by', inwardKey: 'STORY-2', outwardKey: 'PROJ-1' },
                    ]);
                }
                return Promise.resolve([]);
            },
        );

        await clearIssueFields(ctx, 'PROJ-1', ['Test', 'is tested by']);

        // Both types should be queried and cleared
        expect(ctx.linkOps.getIssueLinksByType).toHaveBeenCalledWith('PROJ-1', 'Test');
        expect(ctx.linkOps.getIssueLinksByType).toHaveBeenCalledWith('PROJ-1', 'is tested by');
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalledTimes(2);
    });

    it('red: returns failed StepResult when removeIssueLink fails', async () => {
        // Mock: removeIssueLink throws
        (ctx.linkOps.removeIssueLink as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permission denied'));

        // clearIssueFields now returns StepResult[] — error is in the result, not thrown
        const results = await clearIssueFields(ctx, 'PROJ-1', ['Relates']);
        const linksResult = results.find((r) => r.step === 'clear-links');
        expect(linksResult).toBeDefined();
        expect((linksResult ?? {}).ok).toBe(false);
        expect((linksResult ?? {}).error).toContain('Permission denied');
    });
});
