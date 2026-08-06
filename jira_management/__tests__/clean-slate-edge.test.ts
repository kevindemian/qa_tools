/** Edge case tests for clean-slate pipeline — empty inputs, null values, single fields.
 *
 *  Tests boundary conditions that could cause silent failures or incorrect behavior. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanSlateUpdate, type SnapshotContext } from '../issue-snapshot.js';

function createMockContext(overrides?: Partial<SnapshotContext>): SnapshotContext {
    return {
        jiraResource: {
            getJiraResource: vi.fn().mockResolvedValue({ fields: { description: 'old desc' } }),
            putJiraResource: vi.fn().mockResolvedValue(undefined),
        },
        resolveNumericId: vi.fn().mockResolvedValue('12345'),
        xrayCloud: {
            getTestSteps: vi.fn().mockResolvedValue([]),
            getTestPreconditions: vi.fn().mockResolvedValue([]),
            removeAllTestSteps: vi.fn().mockResolvedValue(undefined),
            addTestStep: vi.fn().mockResolvedValue(undefined),
            removePreconditionsFromTest: vi.fn().mockResolvedValue(undefined),
            addPreconditionsToTest: vi.fn().mockResolvedValue(undefined),
        },
        clientId: 'cid',
        clientSecret: 'csec',
        linkOps: {
            getIssueLinksByType: vi.fn().mockResolvedValue([]),
            removeIssueLink: vi.fn().mockResolvedValue(undefined),
            createLink: vi.fn().mockResolvedValue('created'),
        },
        stepSnapshots: new Map(),
        ...overrides,
    } as SnapshotContext;
}

describe('clean-slate edge cases', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('empty steps, preconditions, and links: all return ok', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            { description: null, steps: [], preconditions: [], linkedIssues: [] },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(true);
        expect(result.stepResults.every((r) => r.ok)).toBe(true);
    });

    it('null description: rebuild-description skipped', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            { description: null, steps: [], preconditions: [], linkedIssues: [] },
            { linkTypeNames: [] },
        );

        const descResult = result.stepResults.find((r) => r.step === 'rebuild-description');
        expect(descResult).toBeDefined();
        expect((descResult ?? {}).ok).toBe(true);
        expect((descResult ?? {}).detail).toContain('skipped');
    });

    it('undefined description: rebuild-description skipped', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            { description: undefined as unknown as null, steps: [], preconditions: [], linkedIssues: [] },
            { linkTypeNames: [] },
        );

        const descResult = result.stepResults.find((r) => r.step === 'rebuild-description');
        expect(descResult).toBeDefined();
        expect((descResult ?? {}).ok).toBe(true);
    });

    it('xrayCloud is null: Xray steps return ok with skipped', async () => {
        const ctxNoXray = createMockContext({ xrayCloud: null });

        const result = await cleanSlateUpdate(
            ctxNoXray,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'desc',
                steps: [{ fields: { Action: 'a', Data: 'd', 'Expected Result': 'r' } }],
                preconditions: ['P1'],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        const stepsResult = result.stepResults.find((r) => r.step === 'clear-steps');
        expect(stepsResult).toBeDefined();
        expect((stepsResult ?? {}).ok).toBe(true);
        expect((stepsResult ?? {}).detail).toContain('skipped');
    });

    it('single linked issue: correctly linked', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: null,
                steps: [],
                preconditions: [],
                linkedIssues: [{ id: '', linkType: 'Blocks', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' }],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(true);
        expect(ctx.linkOps.createLink).toHaveBeenCalledWith({
            linkType: 'Blocks',
            inwardKey: 'STORY-1',
            outwardKey: 'PROJ-1',
        });
    });

    it('multiple links with same type: grouped correctly', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: null,
                steps: [],
                preconditions: [],
                linkedIssues: [
                    { id: '', linkType: 'Blocks', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' },
                    { id: '', linkType: 'Blocks', inwardKey: 'STORY-2', outwardKey: 'PROJ-1' },
                    { id: '', linkType: 'Relates', inwardKey: 'STORY-3', outwardKey: 'PROJ-1' },
                ],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(true);
        expect(ctx.linkOps.createLink).toHaveBeenCalledTimes(3);
        expect(ctx.linkOps.createLink).toHaveBeenCalledWith({
            linkType: 'Blocks',
            inwardKey: 'STORY-1',
            outwardKey: 'PROJ-1',
        });
        expect(ctx.linkOps.createLink).toHaveBeenCalledWith({
            linkType: 'Relates',
            inwardKey: 'STORY-3',
            outwardKey: 'PROJ-1',
        });
    });

    it('includeLinks=false: links not cleared or rebuilt', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'desc',
                steps: [],
                preconditions: [],
                linkedIssues: [{ id: '', linkType: 'Blocks', inwardKey: 'STORY-1', outwardKey: 'PROJ-1' }],
            },
            { linkTypeNames: [], includeLinks: false },
        );

        expect(result.success).toBe(true);
        // createLink should NOT be called (links excluded)
        expect(ctx.linkOps.createLink).not.toHaveBeenCalled();
    });

    it('StepResult always has duration >= 0', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            { description: 'd', steps: [], preconditions: [], linkedIssues: [] },
            { linkTypeNames: [] },
        );

        for (const r of result.stepResults) {
            expect(r.duration).toBeGreaterThanOrEqual(0);
            expect(typeof r.step).toBe('string');
            expect(r.step.length).toBeGreaterThan(0);
        }
    });
});
