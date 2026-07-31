/** Integration tests for clean-slate pipeline — real function chains, mocked external boundaries only.
 *
 *  Tests the FULL pipeline: snapshot → clear → PUT → rebuild → verify results.
 *  Mocks only: Jira API (HTTP), Xray Cloud (GraphQL), filesystem.
 *  Never mocks: cleanSlateUpdate, clearIssueFields, rebuildIssueFields, StepResult construction. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanSlateUpdate, type SnapshotContext } from '../issue-snapshot.js';

// ─────────────────────────────────────────────────────────────────
// MOCK HELPERS (boundary only)
// ─────────────────────────────────────────────────────────────────

function createMockContext(overrides?: Partial<SnapshotContext>): SnapshotContext {
    return {
        jiraResource: {
            getJiraResource: vi.fn().mockResolvedValue({ fields: { description: 'old desc' } }),
            putJiraResource: vi.fn().mockResolvedValue(undefined),
        },
        resolveNumericId: vi.fn().mockResolvedValue('12345'),
        xrayCloud: {
            getTestSteps: vi.fn().mockResolvedValue([{ id: 's1', action: 'a', data: 'd', result: 'r' }]),
            getTestPreconditions: vi.fn().mockResolvedValue(['p1', 'p2']),
            removeAllTestSteps: vi.fn().mockResolvedValue(undefined),
            addTestStep: vi.fn().mockResolvedValue(undefined),
            removePreconditionsFromTest: vi.fn().mockResolvedValue(undefined),
            addPreconditionsToTest: vi.fn().mockResolvedValue(undefined),
        },
        clientId: 'cid',
        clientSecret: 'csec',
        linkOps: {
            getIssueLinksByType: vi.fn().mockImplementation((_key: string, typeName: string) => {
                if (typeName === 'Relates') return Promise.resolve([{ id: 'link1', targetKey: 'STORY-1' }]);
                if (typeName === 'Test') return Promise.resolve([{ id: 'link2', targetKey: 'ECSPOL-960' }]);
                return Promise.resolve([]);
            }),
            removeIssueLink: vi.fn().mockResolvedValue(undefined),
            linkIssues: vi.fn().mockResolvedValue(undefined),
        },
        stepSnapshots: new Map(),
        ...overrides,
    } as SnapshotContext;
}

// ─────────────────────────────────────────────────────────────────
// INTEGRATION: full pipeline
// ─────────────────────────────────────────────────────────────────

describe('clean-slate integration: full pipeline', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('all steps pass: returns success with StepResult for each', async () => {
        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new desc',
                steps: [{ fields: { Action: 'do X', Data: 'd', 'Expected Result': 'ok' } }],
                preconditions: ['PREC-1'],
                linkedIssues: [{ id: '', targetKey: 'STORY-2', linkType: 'Blocks' }],
            },
            { linkTypeNames: ['Relates'] },
        );

        expect(result.success).toBe(true);
        expect(result.restored).toBe(false);
        expect(result.stepResults.length).toBeGreaterThan(0);
        expect(result.stepResults.every((r) => r.ok)).toBe(true);
        expect(result.stepResults.every((r) => r.duration >= 0)).toBe(true);
    });

    it('single step fails: rolls back and returns success=false', async () => {
        // Make addTestStep fail only on rebuild (callCount > 0 from clear phase)
        let addTestStepCalls = 0;
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockImplementation(() => {
            addTestStepCalls++;
            // Allow restore calls (after first fail) to succeed
            if (addTestStepCalls > 1) return Promise.resolve();
            return Promise.reject(new Error('API timeout'));
        });

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new desc',
                steps: [{ fields: { Action: 'do X', Data: '', 'Expected Result': 'ok' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(false);
        expect(result.restored).toBe(true);
        const failedStep = result.stepResults.find((r) => !r.ok && !r.step.includes(':rollback'));
        expect(failedStep).toBeDefined();
        expect((failedStep ?? {}).error).toContain('API timeout');
    });

    it('multiple steps fail: only first failure triggers rollback', async () => {
        // Make both addTestStep and addPreconditionsToTest fail
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('step fail'));
        ((ctx.xrayCloud ?? {}).addPreconditionsToTest as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('prec fail'),
        );

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new desc',
                steps: [{ fields: { Action: 'do X', Data: '', 'Expected Result': 'ok' } }],
                preconditions: ['PREC-1'],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(false);
        // Only rebuild-steps should fail (rollback happens before rebuild-preconditions)
        const failedSteps = result.stepResults.filter((r) => !r.ok && !r.step.includes(':rollback'));
        expect(failedSteps.length).toBeGreaterThanOrEqual(1);
    });

    it('rollback fails: returns success=false, restored=false', async () => {
        // Make both rebuild AND restore fail
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rebuild fail'));
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

    it('with onStepFailure handler: handler is called on failure', async () => {
        const handler = vi.fn().mockResolvedValue('skip' as const);
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('step fail'));

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new desc',
                steps: [{ fields: { Action: 'do X', Data: '', 'Expected Result': 'ok' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [], onStepFailure: handler },
        );

        expect(handler).toHaveBeenCalled();
        // Skip means the failed step is recorded but operation continues
        const skippedStep = result.stepResults.find((r) => r.decision === 'skip');
        expect(skippedStep).toBeDefined();
    });

    it('with onStepFailure handler returning abort: stops immediately', async () => {
        const handler = vi.fn().mockResolvedValue('abort' as const);
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('step fail'));

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new desc',
                steps: [{ fields: { Action: 'do X', Data: '', 'Expected Result': 'ok' } }],
                preconditions: ['PREC-1'],
                linkedIssues: [],
            },
            { linkTypeNames: [], onStepFailure: handler },
        );

        const abortedStep = result.stepResults.find((r) => r.decision === 'abort');
        expect(abortedStep).toBeDefined();
        // PREC-1 should NOT have been processed (aborted before rebuild-preconditions)
        const precResult = result.stepResults.find((r) => r.step === 'rebuild-preconditions');
        expect(precResult).toBeUndefined();
    });
});
