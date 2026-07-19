vi.mock('../llm/llm-metrics.js', () => ({
    recordRetry: vi.fn(),
}));

import { generateWithRetry } from '../quality/targeted-retry.js';

const mockLlmPrompt = vi.fn();

describe('GenerateWithRetry', () => {
    const mockSchema = {
        safeParse: vi.fn(),
    };

    const mockLayer2Validator = {
        validate: vi.fn(),
    };

    const mockLayer3Validator = {
        validate: vi.fn(),
    };

    const context = { inputRaw: '', artifactType: 'test-suite' };

    const baseOpts = { tier: 'fast' as const, system: 'system', user: 'user' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns data when all layers pass on first try', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValue({ allPassed: true, results: [] });
        mockLayer3Validator.validate.mockReturnValue({ allPassed: true, results: [] });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
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
        expect.hasAssertions();

        mockLlmPrompt.mockRejectedValue(new Error('API error'));
        mockSchema.safeParse.mockReturnValue({ success: false, error: { issues: [] } });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
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
        expect(result.layerFailures['layer1']).toBeGreaterThan(0);
    });

    it('retries layer 2 when invariants fail', async () => {
        expect.hasAssertions();

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
            mockLlmPrompt,
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
        expect(result.layerFailures['layer2']).toBe(1);
    });

    it('retries layer 3 when semantic validation fails', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValue({ allPassed: true, results: [] });
        mockLayer3Validator.validate
            .mockReturnValueOnce({
                allPassed: false,
                results: [
                    {
                        passed: false,
                        invariantId: 'S-01',
                        message: 'Semantic fail',
                        severity: 'error',
                        artifactPath: '',
                    },
                ],
            })
            .mockReturnValueOnce({ allPassed: true, results: [] });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 1, enabled: true },
                layer3: { maxRetries: 2, enabled: true },
            },
        );

        expect(result.data).toBeDefined();
        expect(result.layerFailures['layer3']).toBe(1);
    });

    it('accumulates final errors when validation persists after all retries', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValue({
            allPassed: false,
            results: [
                { passed: false, invariantId: 'T-01', message: 'Still failing', severity: 'error', artifactPath: '' },
            ],
        });
        mockLayer3Validator.validate.mockReturnValue({
            allPassed: false,
            results: [
                { passed: false, invariantId: 'S-01', message: 'Semantic fail', severity: 'error', artifactPath: '' },
            ],
        });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 1, enabled: true },
                layer3: { maxRetries: 1, enabled: true },
            },
        );

        expect(result.data).toBeNull();
        expect(result.layerFailures['layer2']).toBe(1);
        expect(result.layerFailures['layer3']).toBe(1);
    });

    it('builds schema error hints when schema validation fails', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockResolvedValue('{"tests":[]}');
        mockSchema.safeParse
            .mockReturnValueOnce({
                success: false,
                error: { issues: [{ path: ['tests'], message: 'Expected array' }] },
            })
            .mockReturnValueOnce({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValue({ allPassed: true, results: [] });
        mockLayer3Validator.validate.mockReturnValue({ allPassed: true, results: [] });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 2, enabled: true },
                layer2: { maxRetries: 1, enabled: true },
                layer3: { maxRetries: 1, enabled: true },
            },
        );

        expect(result.data).toBeDefined();
        expect(result.layerFailures['layer1']).toBe(1);
    });

    it('returns null when layer3 retry returns null and final validation fails', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockResolvedValueOnce('{"tests":[]}').mockResolvedValueOnce(null);
        mockSchema.safeParse.mockReturnValue({ success: true, data: { tests: [] } });
        mockLayer2Validator.validate.mockReturnValueOnce({ allPassed: true, results: [] }).mockReturnValueOnce({
            allPassed: false,
            results: [{ passed: false, invariantId: 'T-01', message: 'Fail', severity: 'error', artifactPath: '' }],
        });
        mockLayer3Validator.validate.mockReturnValueOnce({ allPassed: true, results: [] }).mockReturnValueOnce({
            allPassed: false,
            results: [{ passed: false, invariantId: 'S-01', message: 'Fail', severity: 'error', artifactPath: '' }],
        });

        const result = await generateWithRetry(
            baseOpts,
            mockSchema,
            mockLlmPrompt,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 2, enabled: true },
                layer3: { maxRetries: 2, enabled: true },
            },
        );

        expect(result.data).toBeNull();
    });

    it('counts every LLM attempt in result.attempts (telemetry must not be silent)', async () => {
        expect.hasAssertions();

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
            mockLlmPrompt,
            mockLayer2Validator,
            mockLayer3Validator,
            context,
            {
                layer1: { maxRetries: 1, enabled: true },
                layer2: { maxRetries: 2, enabled: true },
                layer3: { maxRetries: 1, enabled: true },
            },
        );

        expect(result.attempts).toBeGreaterThan(0);
        expect(result.attempts).toBe(mockLlmPrompt.mock.calls.length);
    });
});
