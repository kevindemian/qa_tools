jest.mock('./llm-client', () => ({
    llmPrompt: jest.fn(),
}));

jest.mock('./llm-metrics', () => ({
    recordRetry: jest.fn(),
}));

import { llmPrompt } from './llm-client';
import { generateWithRetry } from './targeted-retry';

const mockLlmPrompt = jest.mocked(llmPrompt);

describe('generateWithRetry', () => {
    const mockSchema = {
        safeParse: jest.fn(),
    };

    const mockLayer2Validator = {
        validate: jest.fn(),
    };

    const mockLayer3Validator = {
        validate: jest.fn(),
    };

    const context = { inputRaw: '', artifactType: 'test-suite' };

    const baseOpts = { tier: 'fast' as const, system: 'system', user: 'user' };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns data when all layers pass on first try', async () => {
        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValue({ allPassed: true, results: [] });
        mockLayer3Validator.validate.mockReturnValue({ allPassed: true, results: [] });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 1, enabled: true },
                layer3: { maxRetries: 1, enabled: true },
            },
        );

        expect(result.data).toBeDefined();
        expect(result.finalErrors).toHaveLength(0);
    });

    it('returns null when layer 1 fails all retries', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('API error'));
        mockSchema.safeParse.mockReturnValue({ success: false, error: { issues: [] } });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 1, enabled: false },
                layer3: { maxRetries: 1, enabled: false },
            },
        );

        expect(result.data).toBeNull();
        expect(result.layerFailures.layer1).toBeGreaterThan(0);
    });

    it('retries layer 2 when invariants fail', async () => {
        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate
            .mockReturnValueOnce({
                allPassed: false,
                results: [
                    { passed: false, invariantId: 'T-01', message: 'Failed', severity: 'error', artifactPath: '' },
                ],
            })
            .mockReturnValueOnce({ allPassed: true, results: [] });
        mockLayer3Validator.validate.mockReturnValue({ allPassed: true, results: [] });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 2, enabled: true },
                layer3: { maxRetries: 1, enabled: true },
            },
        );

        expect(result.data).toBeDefined();
        expect(result.layerFailures.layer2).toBe(1);
    });
});
