jest.mock('./config', () => {
    const mockConfig: Record<string, string> = {};
    const ConfigMock = {
        get llmApiKey() {
            return mockConfig.llmApiKey ?? '';
        },
        get llmModel() {
            return mockConfig.llmModel ?? 'google/gemini-2.0-flash-exp';
        },
        get llmBaseUrl() {
            return mockConfig.llmBaseUrl ?? 'https://openrouter.ai/api/v1';
        },
        get llmSmallApiKey() {
            return mockConfig.llmSmallApiKey ?? '';
        },
        get llmSmallModel() {
            return mockConfig.llmSmallModel ?? 'gemini-2.0-flash-lite';
        },
        get llmFastApiKey() {
            return mockConfig.llmFastApiKey ?? '';
        },
        get llmFastModel() {
            return mockConfig.llmFastModel ?? 'llama3-8b-8192';
        },
        get llmFastBaseUrl() {
            return mockConfig.llmFastBaseUrl ?? 'https://api.groq.com/openai/v1';
        },
        get llmReviewApiKey() {
            return mockConfig.llmReviewApiKey ?? '';
        },
        get llmReviewModel() {
            return mockConfig.llmReviewModel ?? 'gemini-2.0-flash-exp';
        },
        get llmReviewBaseUrl() {
            return mockConfig.llmReviewBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
        },
        get llmFallbackApiKey() {
            return mockConfig.llmFallbackApiKey ?? '';
        },
        get llmFallbackModel() {
            return mockConfig.llmFallbackModel ?? 'meta/llama3-70b-instruct';
        },
        get llmFallbackBaseUrl() {
            return mockConfig.llmFallbackBaseUrl ?? 'https://integrate.api.nvidia.com/v1';
        },
        get llmBatchApiKey() {
            return mockConfig.llmBatchApiKey ?? '';
        },
        get llmBatchModel() {
            return mockConfig.llmBatchModel ?? 'gpt-4o-mini';
        },
        get llmBatchBaseUrl() {
            return mockConfig.llmBatchBaseUrl ?? 'https://models.inference.ai.azure.com';
        },
        set(key: string, value: string) {
            mockConfig[key] = value;
        },
        resetInstance() {
            Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
        },
    };
    return { __esModule: true, default: ConfigMock };
});
import Config from './config';
import { llmPrompt, clearCache } from './llm-client';

const mockResponseText = jest.fn();
const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOkResponse(body: string): Response {
    return {
        ok: true,
        status: 200,
        text: mockResponseText.mockResolvedValue(body),
    } as unknown as Response;
}
function mockErrorResponse(status: number): Response {
    return {
        ok: false,
        status,
        text: jest.fn().mockResolvedValue('error'),
    } as unknown as Response;
}

beforeEach(() => {
    jest.restoreAllMocks();
    mockFetch.mockReset();
    mockResponseText.mockReset();
    clearCache();
    (Config as unknown as { resetInstance: () => void }).resetInstance();
});

describe('llmPrompt', () => {
    it('sends prompt to main tier (OpenRouter) and returns parsed response', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'google/gemini-2.0-flash-exp');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmBaseUrl',
            'https://openrouter.ai/api/v1',
        );
        const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Generated test case' } }] });
        mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

        const result = await llmPrompt('main', 'You are a QA assistant', 'Generate a test for login');

        expect(result).toBe('Generated test case');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callUrl = mockFetch.mock.calls[0][0];
        const callOpts = mockFetch.mock.calls[0][1];
        expect(callUrl).toContain('/chat/completions');
        expect(callOpts.headers.Authorization).toBe('Bearer sk-test');
    });

    it('sends prompt to fast tier (Groq, OpenAI format)', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFastApiKey', 'gsk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFastModel', 'llama3-8b-8192');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmFastBaseUrl',
            'https://api.groq.com/openai/v1',
        );
        const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Fast response' } }] });
        mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

        const result = await llmPrompt('fast', 'system', 'quick test');
        expect(result).toBe('Fast response');
        const callUrl = mockFetch.mock.calls[0][0];
        expect(callUrl).toContain('groq.com');
    });

    it('sends prompt to small tier (aliased to fast/Groq)', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFastApiKey', 'gsk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFastModel', 'llama3-8b-8192');
        const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Aliased' } }] });
        mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

        const result = await llmPrompt('small', 'system', 'aliased test');
        expect(result).toBe('Aliased');
        const callUrl = mockFetch.mock.calls[0][0];
        expect(callUrl).toContain('/chat/completions');
    });

    it('sends prompt to reviewer tier (Gemini format)', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewApiKey', 'AIza-review');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewModel', 'gemini-2.0-flash-exp');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmReviewBaseUrl',
            'https://generativelanguage.googleapis.com/v1beta',
        );
        const apiResponse = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Review ok' }] } }] });
        mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

        const result = await llmPrompt('reviewer', 'system', 'review this');
        expect(result).toBe('Review ok');
        const callUrl = mockFetch.mock.calls[0][0];
        expect(callUrl).toContain('key=AIza-review');
    });

    it('falls back to fallback tier when main fails', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmBaseUrl',
            'https://openrouter.ai/api/v1',
        );
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackApiKey', 'nv-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackModel', 'llama3');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmFallbackBaseUrl',
            'https://nv.api.com/v1',
        );
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmBatchApiKey', 'gh-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmBatchModel', 'gpt4o-mini');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmBatchBaseUrl',
            'https://models.inference.ai.azure.com',
        );

        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);

        // main fails 3x, fallback fails 3x, batch succeeds
        mockFetch
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'Batch ok' } }] })));

        const result = await llmPrompt('main', 'system', 'fallback chain');
        expect(result).toBe('Batch ok');
        // main:3 retries + fallback:3 retries + batch:1 success = 7 calls
        expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('returns cached response on repeated call with same inputs', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'google/gemini-2.0-flash-exp');
        const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Cached result' } }] });
        mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

        const first = await llmPrompt('main', 'system', 'same input');
        expect(first).toBe('Cached result');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const second = await llmPrompt('main', 'system', 'same input');
        expect(second).toBe('Cached result');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on HTTP 429 and succeeds', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'google/gemini-2.0-flash-exp');
        mockFetch
            .mockResolvedValueOnce(mockErrorResponse(429))
            .mockResolvedValueOnce(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));

        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);

        const result = await llmPrompt('main', 'system', 'retry test');
        expect(result).toBe('OK');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all providers', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', '');
        await expect(llmPrompt('main', 'system', 'test')).rejects.toThrow();
    });

    it('handles network error with retry', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'google/gemini-2.0-flash-exp');
        mockFetch
            .mockRejectedValueOnce(new Error('Network failure'))
            .mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'Recovered' } }] })),
            );

        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);

        const result = await llmPrompt('main', 'system', 'network recovery');
        expect(result).toBe('Recovered');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty string for unparseable response', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'google/gemini-2.0-flash-exp');
        mockFetch.mockResolvedValueOnce(mockOkResponse('not json'));

        const result = await llmPrompt('main', 'system', 'bad response');
        expect(result).toBe('');
    });
});
