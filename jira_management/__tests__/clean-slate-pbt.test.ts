/** Property-Based Tests for clean-slate pipeline — invariants that must hold for ALL inputs.
 *
 *  Uses simple property checks (no external PBT library) with randomized inputs.
 *  Focuses on StepResult invariants and snapshot consistency. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanSlateUpdate, clearIssueFields, rebuildIssueFields, type SnapshotContext } from '../issue-snapshot.js';
import type { IssueFieldSnapshot } from '../../shared/types/clean-slate.js';

function createMockContext(overrides?: Partial<SnapshotContext>): SnapshotContext {
    return {
        jiraResource: {
            getJiraResource: vi.fn().mockResolvedValue({ fields: { description: 'old' } }),
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

// ─────────────────────────────────────────────────────────────────
// PBT HELPERS
// ─────────────────────────────────────────────────────────────────

/** Generate random string of length n. */
function randomString(n: number): string {
    return Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
}

/** Generate random integer in [min, max]. */
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate random array of random-length strings. */
function randomStringArray(maxLen: number): string[] {
    const len = randomInt(0, maxLen);
    return Array.from({ length: len }, () => randomString(randomInt(1, 10)));
}

// ─────────────────────────────────────────────────────────────────
// PROPERTY: StepResult invariants
// ─────────────────────────────────────────────────────────────────

describe('PBT: StepResult invariants', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('every StepResult has required fields with correct types', async () => {
        // Run 10 iterations with random inputs
        for (let i = 0; i < 10; i++) {
            const desc = Math.random() > 0.5 ? randomString(5) : null;
            const steps = Array.from({ length: randomInt(0, 3) }, () => ({
                fields: { Action: randomString(3), Data: randomString(3), 'Expected Result': randomString(3) },
            }));
            const preconditions = randomStringArray(3);
            const links = Array.from({ length: randomInt(0, 3) }, (_, j) => ({
                id: '',
                inwardKey: `STORY-${j}`,
                outwardKey: 'PROJ-1',
                linkType: 'Blocks',
            }));

            const result = await cleanSlateUpdate(
                ctx,
                'PROJ-1',
                { summary: randomString(5) },
                { description: desc, steps, preconditions, linkedIssues: links },
                { linkTypeNames: [] },
            );

            // Invariant: stepResults is always an array
            expect(Array.isArray(result.stepResults)).toBe(true);

            // Invariant: every StepResult has required fields
            for (const r of result.stepResults) {
                expect(typeof r.ok).toBe('boolean');
                expect(typeof r.step).toBe('string');
                expect(typeof r.detail).toBe('string');
                expect(typeof r.duration).toBe('number');
                expect(r.duration).toBeGreaterThanOrEqual(0);
                expect(r.step.length).toBeGreaterThan(0);

                // Invariant: if ok=false, error must be set
                if (!r.ok) {
                    expect(r.error).toBeDefined();
                    expect(typeof r.error).toBe('string');
                    expect((r.error ?? '').length).toBeGreaterThan(0);
                }
            }

            // Invariant: success is boolean
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.restored).toBe('boolean');

            // Invariant: restored=true implies success=false (restored means rollback happened)
            if (result.restored) {
                expect(result.success).toBe(false);
            }
        }
    });

    it('clearIssueFields always returns StepResult[] with 4 entries', async () => {
        for (let i = 0; i < 10; i++) {
            const results = await clearIssueFields(ctx, 'PROJ-1', randomStringArray(3));

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(4);

            const stepNames = results.map((r) => r.step);
            expect(stepNames).toContain('clear-description');
            expect(stepNames).toContain('clear-steps');
            expect(stepNames).toContain('clear-preconditions');
            expect(stepNames).toContain('clear-links');
        }
    });

    it('rebuildIssueFields always returns StepResult[] with 4 entries', async () => {
        for (let i = 0; i < 10; i++) {
            const results = await rebuildIssueFields(ctx, 'PROJ-1', {
                description: Math.random() > 0.5 ? randomString(5) : null,
                steps: [],
                preconditions: [],
                linkedIssues: [],
            });

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(4);

            const stepNames = results.map((r) => r.step);
            expect(stepNames).toContain('rebuild-description');
            expect(stepNames).toContain('rebuild-steps');
            expect(stepNames).toContain('rebuild-preconditions');
            expect(stepNames).toContain('rebuild-links');
        }
    });
});

// ─────────────────────────────────────────────────────────────────
// PROPERTY: Snapshot consistency
// ─────────────────────────────────────────────────────────────────

describe('PBT: Snapshot consistency', () => {
    it('stepSnapshots map is populated during clearIssueFields', async () => {
        const snapshots = new Map<string, IssueFieldSnapshot>();
        const ctxWithSnapshots = createMockContext({ stepSnapshots: snapshots });

        await clearIssueFields(ctxWithSnapshots, 'PROJ-1', ['Relates']);

        // Invariant: 'clear' snapshot exists
        expect(snapshots.has('clear')).toBe(true);

        const snap = snapshots.get('clear') as IssueFieldSnapshot | undefined;
        expect(snap).toBeDefined();
        if (!snap) return;
        expect(typeof snap.description).toBe('string');
        expect(Array.isArray(snap.steps)).toBe(true);
        expect(Array.isArray(snap.preconditions)).toBe(true);
        expect(Array.isArray(snap.linkedIssues)).toBe(true);
    });

    it('stepSnapshots map is populated during rebuildIssueFields', async () => {
        const snapshots = new Map<string, IssueFieldSnapshot>();
        const ctxWithSnapshots = createMockContext({ stepSnapshots: snapshots });

        await rebuildIssueFields(ctxWithSnapshots, 'PROJ-1', {
            description: 'new',
            steps: [],
            preconditions: [],
            linkedIssues: [],
        });

        // Invariant: 'rebuild' snapshot exists
        expect(snapshots.has('rebuild')).toBe(true);
    });

    it('on failure, rollback restores to snapshot state', async () => {
        const snapshots = new Map<string, IssueFieldSnapshot>();
        const ctxWithSnapshots = createMockContext({ stepSnapshots: snapshots });

        // Make rebuild fail, but allow restore to succeed
        let addTestStepCalls = 0;
        ((ctxWithSnapshots.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockImplementation(() => {
            addTestStepCalls++;
            if (addTestStepCalls > 1) return Promise.resolve();
            return Promise.reject(new Error('fail'));
        });

        const result = await cleanSlateUpdate(
            ctxWithSnapshots,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'new',
                steps: [{ fields: { Action: 'a', Data: 'd', 'Expected Result': 'r' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        expect(result.success).toBe(false);
        expect(result.restored).toBe(true);

        // Invariant: restore was called (putJiraResource for description)
        expect(ctxWithSnapshots.jiraResource.putJiraResource).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────
// PROPERTY: Handler behavior invariants
// ─────────────────────────────────────────────────────────────────

describe('PBT: Handler behavior invariants', () => {
    let ctx: SnapshotContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('handler decision is recorded in StepResult', async () => {
        const handler = vi.fn().mockResolvedValue('skip' as const);
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'd',
                steps: [{ fields: { Action: 'a', Data: 'd', 'Expected Result': 'r' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [], onStepFailure: handler },
        );

        // Invariant: at least one step has a decision
        const stepsWithDecision = result.stepResults.filter((r) => r.decision !== undefined);
        expect(stepsWithDecision.length).toBeGreaterThan(0);

        // Invariant: decision values are valid
        for (const r of stepsWithDecision) {
            expect(['skip', 'abort', 'retry', 'rollback']).toContain(r.decision);
        }
    });

    it('no handler: default rollback behavior', async () => {
        ((ctx.xrayCloud ?? {}).addTestStep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

        const result = await cleanSlateUpdate(
            ctx,
            'PROJ-1',
            { summary: 'Test' },
            {
                description: 'd',
                steps: [{ fields: { Action: 'a', Data: 'd', 'Expected Result': 'r' } }],
                preconditions: [],
                linkedIssues: [],
            },
            { linkTypeNames: [] },
        );

        // Invariant: without handler, failure triggers rollback
        expect(result.success).toBe(false);
        expect(result.restored).toBe(true);
    });
});
