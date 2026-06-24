vi.mock('./llm-client', () => ({
    llmPrompt: vi.fn(),
}));

import { llmPrompt } from './llm-client.js';
import { ArtifactValidator } from './artifact-validator.js';
import { consensusGenerate, refineWithConsistency } from './llm-self-consistency.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

function makeValidator(): ArtifactValidator<unknown> {
    const v = new ArtifactValidator('test-suite');
    v.addInvariant('PASS', () => [
        { passed: true, invariantId: 'PASS', message: 'ok', severity: 'error', artifactPath: '' },
    ]);
    return v;
}

const context = { inputRaw: '', outputRaw: {}, artifactType: 'test-suite' as const };

describe('ConsensusGenerate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns consensus when all candidates pass and agree', async () => {expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(result.winner).toBeDefined();
        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('tries all candidates even if some fail validation', async () => {expect.hasAssertions();

        mockLlmPrompt.mockResolvedValueOnce(null).mockResolvedValueOnce({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('throws when all candidates fail', async () => {expect.hasAssertions();

        mockLlmPrompt.mockRejectedValue(new Error('API error'));

        await expect(
            consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2),
        ).rejects.toThrow();
    });

    it('reports divergence based on structural similarity', async () => {expect.hasAssertions();

        mockLlmPrompt
            .mockResolvedValueOnce({ tests: [{ title: 'Test A' }] })
            .mockResolvedValueOnce({ tests: [{ title: 'Test B' }] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(['none', 'low', 'high']).toContain(result.divergence);
    });

    it('reports low divergence for moderately similar candidates', async () => {expect.hasAssertions();

        mockLlmPrompt.mockResolvedValueOnce({ a: 1, b: 2, c: 3, d: 4 }).mockResolvedValueOnce({ a: 5, b: 6, c: 7 });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(result.divergence).toBe('low');
    });

    it('recovers with fallback when all candidates fail validation', async () => {expect.hasAssertions();

        const rejectInvariant = (a: unknown) =>
            a && typeof a === 'object'
                ? [
                      {
                          passed: false,
                          invariantId: 'REJECT_ALL',
                          message: 'no',
                          severity: 'error' as const,
                          artifactPath: '',
                      },
                  ]
                : [
                      {
                          passed: true,
                          invariantId: 'REJECT_ALL',
                          message: 'ok',
                          severity: 'error' as const,
                          artifactPath: '',
                      },
                  ];
        const validator = makeValidator();
        validator.addInvariant('REJECT_ALL', rejectInvariant);

        mockLlmPrompt.mockResolvedValueOnce({ some: 'data' }).mockResolvedValueOnce(null);

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.winner).toBeDefined();
        expect(result.refined).toBeFalsy();
    });

    it('auto-refines when divergence is high and refinement passes validation', async () => {expect.hasAssertions();

        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockResolvedValueOnce({ tests: [{ title: 'Test Converged' }] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(result.refined).toBeTruthy();
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('falls back to preliminary winner when refinement result fails validation', async () => {expect.hasAssertions();

        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockResolvedValueOnce({ passing: false, _marked: true });

        const validator = makeValidator();
        validator.addInvariant('REJECT_MARKER', (a) =>
            a && typeof a === 'object' && '_marked' in (a as Record<string, unknown>)
                ? [
                      {
                          passed: false,
                          invariantId: 'REJECT_MARKER',
                          message: 'marked',
                          severity: 'error',
                          artifactPath: '',
                      },
                  ]
                : [{ passed: true, invariantId: 'REJECT_MARKER', message: 'ok', severity: 'error', artifactPath: '' }],
        );

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.refined).toBeFalsy();
        expect(result.winner).toBeDefined();
    });

    it('falls back to preliminary winner when refinement throws', async () => {expect.hasAssertions();

        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockRejectedValueOnce(new Error('Refinement API error'));

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, makeValidator(), context, 2);

        expect(result.refined).toBeFalsy();
        expect(result.winner).toBeDefined();
    });

    it('falls back when refinement succeeds but re-validation rejects it', async () => {expect.hasAssertions();

        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockResolvedValueOnce({ valid: 'refined' });

        let callCount = 0;
        const validator = makeValidator();
        validator.addInvariant('CHECK', (a) => {
            callCount++;
            if (callCount === 4 && a && typeof a === 'object' && 'valid' in (a as Record<string, unknown>)) {
                return [
                    {
                        passed: false,
                        invariantId: 'CHECK',
                        message: 'reject-on-revalidate',
                        severity: 'error',
                        artifactPath: '',
                    },
                ];
            }
            return [{ passed: true, invariantId: 'CHECK', message: 'ok', severity: 'error', artifactPath: '' }];
        });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.refined).toBeFalsy();
        expect(result.winner).toBeDefined();
    });
});

describe('RefineWithConsistency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns refined result when LLM produces valid output', async () => {expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue({ tests: [{ title: 'Refined' }] });

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }, { tests: [{ title: 'B' }] }],
            votes: { 0: 1, 1: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            makeValidator(),
            context,
            previousResult,
        );

        expect(result.refined).toBeTruthy();
        expect(result.candidates).toHaveLength(1);
    });

    it('falls back to previous result when refined output fails validation', async () => {expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue({ _marked: true });

        const validator = makeValidator();
        validator.addInvariant('REJECT', (a) =>
            a && typeof a === 'object' && '_marked' in (a as Record<string, unknown>)
                ? [{ passed: false, invariantId: 'REJECT', message: 'no', severity: 'error', artifactPath: '' }]
                : [{ passed: true, invariantId: 'REJECT', message: 'ok', severity: 'error', artifactPath: '' }],
        );

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }],
            votes: { 0: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            validator,
            context,
            previousResult,
        );

        expect(result.refined).toBeFalsy();
        expect(result.winner).toEqual({ tests: [{ title: 'Original' }] });
    });

    it('falls back to previous result when LLM throws', async () => {expect.hasAssertions();

        mockLlmPrompt.mockRejectedValue(new Error('API error'));

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }],
            votes: { 0: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            makeValidator(),
            context,
            previousResult,
        );

        expect(result.refined).toBeFalsy();
        expect(result).toBe(previousResult);
    });
});
