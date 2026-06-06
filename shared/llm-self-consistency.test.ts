vi.mock('./llm-client', async () => ({
    llmPrompt: vi.fn(),
}));

import { llmPrompt } from './llm-client.js';
import { ArtifactValidator } from './artifact-validator.js';
import { consensusGenerate } from './llm-self-consistency.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

describe('consensusGenerate', () => {
    const validator = new ArtifactValidator('test-suite');
    validator.addInvariant('PASS', () => [
        { passed: true, invariantId: 'PASS', message: 'ok', severity: 'error', artifactPath: '' },
    ]);

    const context = { inputRaw: '', outputRaw: {}, artifactType: 'test-suite' as const };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns consensus when all candidates pass and agree', async () => {
        mockLlmPrompt.mockResolvedValue({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.winner).toBeDefined();
        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('tries all candidates even if some fail validation', async () => {
        mockLlmPrompt.mockResolvedValueOnce(null).mockResolvedValueOnce({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('throws when all candidates fail', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('API error'));

        await expect(
            consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2),
        ).rejects.toThrow();
    });

    it('reports divergence based on structural similarity', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce({ tests: [{ title: 'Test A' }] })
            .mockResolvedValueOnce({ tests: [{ title: 'Test B' }] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.divergence).toBeDefined();
    });
});
