/**
 * RED tests for clean-slate rebuild: cleanSlateUpdate must rebuild steps,
 * preconditions, and linkedIssues when rebuildData contains non-empty arrays.
 *
 * Root cause: _doUpdate passes empty arrays for steps/preconditions/linkedIssues
 * because buildTestData() doesn't include them. cleanSlateUpdate receives [],
 * so rebuildSteps/rebuildPreconditions/rebuildLinks all early-return.
 *
 * Expected (green): cleanSlateUpdate rebuilds all fields when rebuildData has data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanSlateUpdate, type SnapshotContext } from '../issue-snapshot.js';

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

describe('cleanSlateUpdate: rebuild with non-empty data', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = createMockContext();
    });

    it('red: rebuilds steps when rebuildData.steps is non-empty', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: null,
                steps: [{ fields: { Action: 'Open page', Data: 'url', 'Expected Result': 'Page opens' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(true);

        // Step 1: removeAllTestSteps was called (clear)
        expect((ctx.xrayCloud ?? {}).removeAllTestSteps).toHaveBeenCalled();

        // Step 2: addTestStep was called with the new step data (rebuild)
        expect((ctx.xrayCloud ?? {}).addTestStep).toHaveBeenCalledWith(
            '12345',
            { action: 'Open page', data: 'url', result: 'Page opens' },
            'cid',
            'csec',
        );
    });

    it('red: rebuilds preconditions when rebuildData.preconditions is non-empty', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: null,
                steps: [],
                preconditions: ['PREC-1', 'PREC-2'],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(true);

        // Step 1: removePreconditionsFromTest was called (clear)
        expect((ctx.xrayCloud ?? {}).removePreconditionsFromTest).toHaveBeenCalled();

        // Step 2: addPreconditionsToTest was called with resolved IDs (rebuild)
        expect((ctx.xrayCloud ?? {}).addPreconditionsToTest).toHaveBeenCalled();
    });

    it('red: rebuilds linkedIssues when rebuildData.linkedIssues is non-empty', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: null,
                steps: [],
                preconditions: [],
                linkedIssues: [{ id: '', linkType: 'Relates', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' }],
            },
            { linkTypeNames: ['Relates'] },
        );

        expect(result.success).toBe(true);

        // Step 1: clearIssueLinksByType was called via linkOps (clear)
        expect(ctx.linkOps.getIssueLinksByType).toHaveBeenCalled();

        // Step 2: createLink was called with the new links (rebuild)
        expect(ctx.linkOps.createLink).toHaveBeenCalledWith({
            linkType: 'Relates',
            inwardKey: 'STORY-1',
            outwardKey: 'PROJ-1',
        });
    });

    it('red: full cycle — clears old data then rebuilds with new data', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Updated Test' },
            {
                description: 'New description',
                steps: [{ fields: { Action: 'New action', Data: '', 'Expected Result': 'New result' } }],
                preconditions: ['PREC-NEW'],
                linkedIssues: [{ id: '', linkType: 'Blocks', inwardKey: 'STORY-NEW', outwardKey: 'PROJ-1' }],
            },
            { linkTypeNames: ['Relates', 'Blocks'] },
        );

        expect(result.success).toBe(true);
        expect(result.restored).toBe(false);

        // Clear phase
        expect((ctx.xrayCloud ?? {}).removeAllTestSteps).toHaveBeenCalled();
        expect((ctx.xrayCloud ?? {}).removePreconditionsFromTest).toHaveBeenCalled();
        expect(ctx.linkOps.removeIssueLink).toHaveBeenCalled();

        // Rebuild phase
        expect((ctx.xrayCloud ?? {}).addTestStep).toHaveBeenCalledWith(
            '12345',
            { action: 'New action', data: '', result: 'New result' },
            'cid',
            'csec',
        );
        expect((ctx.xrayCloud ?? {}).addPreconditionsToTest).toHaveBeenCalled();
        expect(ctx.linkOps.createLink).toHaveBeenCalled();
    });
});
