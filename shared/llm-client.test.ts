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
        get llmMaxTotalTokens() {
            const v = mockConfig.llmMaxTotalTokens;
            return v ? parseInt(v, 10) : 0;
        },
        set(key: string, value: string) {
            mockConfig[key] = value;
        },
        get(key: string) {
            return mockConfig[key] ?? undefined;
        },
        resetInstance() {
            Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
        },
    };
    return { __esModule: true, default: ConfigMock };
});
import Config from './config';
import {
    llmPrompt,
    clearCache,
    resetRateLimiter,
    resetCircuitState,
    parseRetryAfter,
    getLlmClientMetrics,
    resetLlmClientMetrics,
} from './llm-client';
import { rootLogger } from './logger';

const mockResponseText = jest.fn();
const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOkResponse(body: string): Response {
    return {
        ok: true,
        status: 200,
        text: mockResponseText.mockResolvedValue(body),
        headers: { get: () => null },
    } as unknown as Response;
}
function mockErrorResponse(status: number): Response {
    return {
        ok: false,
        status,
        text: jest.fn().mockResolvedValue('error'),
        headers: { get: () => null },
    } as unknown as Response;
}
function mockResponseWithHeader(status: number, headerKey: string, headerValue: string | null): Response {
    return {
        ok: status === 200,
        status,
        text: jest.fn().mockResolvedValue('error'),
        headers: { get: (k: string) => (k === headerKey ? headerValue : null) },
    } as unknown as Response;
}

beforeEach(() => {
    jest.restoreAllMocks();
    mockFetch.mockReset();
    mockResponseText.mockReset();
    clearCache();
    resetRateLimiter();
    resetCircuitState();
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
        expect(mockFetch.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('AIza-review');
        expect(callUrl).not.toContain('AIza-review');
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

    it('sends responseFormat=json payload when param is passed', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test2');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
        mockFetch.mockResolvedValueOnce(
            mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'json result' } }] })),
        );

        await llmPrompt('main', 'system', 'json test', undefined, 'json');
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('different responseFormat produces different cache keys', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test3');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
        const body = JSON.stringify({ choices: [{ message: { content: 'r1' } }] });
        mockFetch.mockResolvedValue(mockOkResponse(body));

        const r1 = await llmPrompt('main', 'system', 'same input', undefined, 'json');
        expect(r1).toBe('r1');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'r2' } }] })));
        const r2 = await llmPrompt('main', 'system', 'same input', undefined, 'text');
        expect(r2).toBe('r2');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('sends Gemini system_instruction payload for reviewer tier', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewApiKey', 'AIza-gemini-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewModel', 'gemini-2.0-flash-exp');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmReviewBaseUrl',
            'https://generativelanguage.googleapis.com/v1beta',
        );
        mockFetch.mockResolvedValueOnce(
            mockOkResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })),
        );

        await llmPrompt('reviewer', 'system instruction', 'user message');
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.system_instruction).toBeDefined();
        expect(body.system_instruction.parts[0].text).toBe('system instruction');
        expect(body.contents[0].parts[0].text).toBe('user message');
        expect(mockFetch.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('AIza-gemini-test');
    });

    it('deduplicates same provider in fallback chain', async () => {
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackApiKey', 'sk-test');
        (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackModel', 'gpt-4');
        (Config as unknown as { set: (k: string, v: string) => void }).set(
            'llmFallbackBaseUrl',
            'https://api.test.com/v1',
        );
        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
        mockFetch
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500));

        await expect(llmPrompt('main', 'system', 'dedup test')).rejects.toThrow('All LLM providers failed');
        // main:3 retries, no fallback call because same config key
        expect(mockFetch).toHaveBeenCalledTimes(3);
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
        const warnSpy = jest.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        mockFetch.mockResolvedValueOnce(mockOkResponse('not json'));

        const result = await llmPrompt('main', 'system', 'bad response');
        expect(result).toBe('');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON'));
        warnSpy.mockRestore();
    });

    describe('rate limiter', () => {
        it('allows requests within limit', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('LLM_RATE_LIMIT', '2');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));

            const r1 = await llmPrompt('main', 'system', 'test1');
            const r2 = await llmPrompt('main', 'system', 'test2');
            expect(r1).toBe('ok');
            expect(r2).toBe('ok');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('rejects when rate limit exceeded', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('LLM_RATE_LIMIT', '2');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));

            await llmPrompt('main', 'system', 'test1');
            await llmPrompt('main', 'system', 'test2');
            await expect(llmPrompt('main', 'system', 'test3')).rejects.toThrow('Client-side rate limit exceeded');
        });

        it('recovers after rate limit window passes', async () => {
            jest.useFakeTimers();
            (Config as unknown as { set: (k: string, v: string) => void }).set('LLM_RATE_LIMIT', '2');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
            jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);

            await llmPrompt('main', 'system', 'test1');
            await llmPrompt('main', 'system', 'test2');
            resetRateLimiter();
            const r3 = await llmPrompt('main', 'system', 'test3');
            expect(r3).toBe('ok');
        });
    });

    describe('circuit breaker', () => {
        beforeEach(() => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);
        });

        it('opens after 5 consecutive call failures', async () => {
            mockFetch.mockResolvedValue(mockErrorResponse(429));
            for (let i = 0; i < 5; i++) {
                await expect(llmPrompt('main', 'system', 'test' + i)).rejects.toThrow();
            }
        });

        it('blocks requests while circuit is open', async () => {
            mockFetch.mockResolvedValue(mockErrorResponse(429));
            // Prime: 5 failures to open circuit
            for (let i = 0; i < 5; i++) {
                await expect(llmPrompt('main', 'system', 'prime' + i)).rejects.toThrow();
            }
            const fetchCount = mockFetch.mock.calls.length;
            // Blocked call throws Circuit breaker open without fetching
            await expect(llmPrompt('main', 'system', 'blocked')).rejects.toThrow('Circuit breaker open');
            expect(mockFetch.mock.calls.length).toBe(fetchCount);
        });

        it('recovers after circuit state is cleared', async () => {
            mockFetch.mockResolvedValue(mockErrorResponse(429));
            for (let i = 0; i < 5; i++) {
                await expect(llmPrompt('main', 'system', 'prime' + i)).rejects.toThrow();
            }
            resetCircuitState();
            mockFetch.mockReset();
            mockFetch.mockResolvedValue(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'recovered' } }] })),
            );
            const result = await llmPrompt('main', 'system', 'recovered');
            expect(result).toBe('recovered');
        });

        it('resets counter on primary success', async () => {
            mockFetch.mockResolvedValue(mockErrorResponse(429));
            // 4 failures → counter at 4
            for (let i = 0; i < 4; i++) {
                await expect(llmPrompt('main', 'system', 'fail' + i)).rejects.toThrow();
            }
            // Next call: mock switches to success
            mockFetch.mockReset();
            mockFetch.mockResolvedValue(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'success' } }] })),
            );
            const result = await llmPrompt('main', 'system', 'recover');
            expect(result).toBe('success');
        });
    });

    describe('parseRetryAfter', () => {
        it('parses seconds from Retry-After header', () => {
            const resp = mockResponseWithHeader(429, 'Retry-After', '30');
            const result = parseRetryAfter(resp, 2000);
            expect(result).toBe(10000); // capped at LLM_RETRY_MAX_WAIT_MS
        });

        it('parses RFC 7231 date from Retry-After header', () => {
            const future = new Date(Date.now() + 5000);
            const resp = mockResponseWithHeader(429, 'Retry-After', future.toUTCString());
            const result = parseRetryAfter(resp, 2000);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThanOrEqual(10000);
        });

        it('returns default when no Retry-After header', () => {
            const resp = mockResponseWithHeader(429, 'Retry-After', null);
            const result = parseRetryAfter(resp, 2000);
            expect(result).toBe(2000);
        });

        it('returns default for invalid Retry-After value', () => {
            const resp = mockResponseWithHeader(429, 'Retry-After', 'invalid');
            const result = parseRetryAfter(resp, 2000);
            expect(result).toBe(2000);
        });
    });

    describe('responseFormat parameter', () => {
        it('passes responseFormat=json to provider config', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-rftest');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{"key":"val"}' } }] })),
            );

            await llmPrompt('main', 'system', 'json test', undefined, 'json');
            const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
            expect(body.response_format).toEqual({ type: 'json_object' });
        });

        it('different responseFormat produces different cache keys (via metrics)', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-metrics');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            resetLlmClientMetrics();
            const resp = JSON.stringify({ choices: [{ message: { content: 'result' } }] });
            mockFetch.mockResolvedValue(mockOkResponse(resp));

            await llmPrompt('main', 'system', 'same input', undefined, 'json');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockResolvedValue(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'result2' } }] })),
            );
            await llmPrompt('main', 'system', 'same input', undefined, 'text');
            expect(mockFetch).toHaveBeenCalledTimes(2);

            const metrics = getLlmClientMetrics();
            expect(metrics.cacheMisses).toBe(2);
            expect(metrics.cacheHits).toBe(0);
        });
    });

    describe('Gemini system_instruction payload', () => {
        it('includes system_instruction for gemini format provider', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewApiKey', 'AIza-gemini-sys');
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmReviewModel',
                'gemini-2.0-flash-exp',
            );
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmReviewBaseUrl',
                'https://generativelanguage.googleapis.com/v1beta',
            );
            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })),
            );

            await llmPrompt('reviewer', 'custom system instruction', 'user text');
            const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
            expect(body.system_instruction).toBeDefined();
            expect(body.system_instruction.parts[0].text).toBe('custom system instruction');
            expect(body.contents[0].parts[0].text).toBe('user text');
        });
    });

    describe('non-JSON 200 response', () => {
        it('calls logger.warn when provider returns 200 with non-JSON body', async () => {
            const warnSpy = jest.spyOn(rootLogger, 'warn');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-warn');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValueOnce(mockOkResponse('plain text body'));

            const result = await llmPrompt('main', 'system', 'non-json body');
            expect(result).toBe('');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON'));
        });
    });

    describe('tier fallback deduplication', () => {
        it('skips batch when all fallback candidates have same configUniqueKey', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-dd');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackApiKey', 'sk-dd');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmFallbackModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmFallbackBaseUrl',
                'https://api.test.com/v1',
            );
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBatchApiKey', 'sk-dd');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBatchModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmBatchBaseUrl',
                'https://api.test.com/v1',
            );

            jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);

            mockFetch
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500));

            await expect(llmPrompt('main', 'system', 'full dedup')).rejects.toThrow('All LLM providers failed');
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });
    });

    describe('L23: Pending Tests', () => {
        it('23.2: passes responseFormat to provider config', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-23-2');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{}' } }] })),
            );

            await llmPrompt('main', 'sys', 'user', 'caller', 'json');

            const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
            expect(body.response_format).toEqual({ type: 'json_object' });
        });

        it('23.3: uses different cache keys for different responseFormat', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-23-3');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmModel', 'gpt-4');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{}' } }] })));

            await llmPrompt('main', 'sys', 'user', 'c', 'text');
            await llmPrompt('main', 'sys', 'user', 'c', 'json');

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('23.4: Gemini system_instruction payload test', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewApiKey', 'sk-gemini');
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmReviewModel', 'gemini-1.5-flash');
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmReviewBaseUrl',
                'https://generativelanguage.googleapis.com/v1beta',
            );

            const geminiResponse = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
            mockFetch.mockResolvedValueOnce(mockOkResponse(JSON.stringify(geminiResponse)));

            await llmPrompt('reviewer', 'sys', 'user');

            const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
            expect(body.system_instruction).toBeDefined();
            expect(body.system_instruction.parts[0].text).toBe('sys');
        });
    });

    describe('_warnIfNotJson (29.3)', () => {
        beforeEach(() => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test29');
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmModel',
                'google/gemini-2.0-flash-exp',
            );
            (Config as unknown as { set: (k: string, v: string) => void }).set(
                'llmBaseUrl',
                'https://openrouter.ai/api/v1',
            );
        });

        function openAiResponse(content: string): Response {
            return {
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(JSON.stringify({ choices: [{ message: { content } }] })),
                headers: { get: () => null },
            } as unknown as Response;
        }

        it('does not warn when response is valid JSON (responseFormat=json)', async () => {
            const warnSpy = jest.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            mockFetch.mockResolvedValueOnce(openAiResponse(JSON.stringify({ ok: true })));
            await llmPrompt('main', 'sys', 'user', 'test29.3-valid', 'json');
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('warns when responseFormat=json but extracted content is not valid JSON', async () => {
            const warnSpy = jest.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            mockFetch.mockResolvedValueOnce(openAiResponse('not json'));
            await llmPrompt('main', 'sys', 'user', 'test29.3-invalid', 'json');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('LLM response expected JSON but was not parseable'),
            );
            warnSpy.mockRestore();
        });

        it('does not call _warnIfNotJson when responseFormat is not json', async () => {
            const warnSpy = jest.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            mockFetch.mockResolvedValueOnce(openAiResponse('не json, а plain text'));
            await llmPrompt('main', 'sys', 'user', 'test29.3-nojson');
            expect(warnSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('LLM response expected JSON but was not parseable'),
            );
            warnSpy.mockRestore();
        });
    });

    describe('total token limit', () => {
        beforeEach(() => {
            resetLlmClientMetrics();
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmApiKey', 'sk-test');
        });

        it('throws when total tokens exceed limit after first call', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmMaxTotalTokens', '10');
            const body = JSON.stringify({
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 8, completion_tokens: 3 },
            });
            mockFetch.mockResolvedValue(mockOkResponse(body));
            await llmPrompt('main', 'sys', 'user', 'test-llm19-1', 'text');
            await expect(llmPrompt('main', 'sys', 'user', 'test-llm19-2', 'text')).rejects.toThrow(
                'Total token limit reached',
            );
        });

        it('does not throw when limit is 0 (unlimited)', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmMaxTotalTokens', '0');
            const body = JSON.stringify({
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 5, completion_tokens: 3 },
            });
            mockFetch.mockResolvedValue(mockOkResponse(body));
            await llmPrompt('main', 'sys', 'user', 'test-llm19-unlimited', 'text');
            await expect(llmPrompt('main', 'sys', 'user', 'test-llm19-unlimited-2', 'text')).resolves.toBe('ok');
        });

        it('does not throw when total tokens are under limit', async () => {
            (Config as unknown as { set: (k: string, v: string) => void }).set('llmMaxTotalTokens', '100');
            const body = JSON.stringify({
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 3, completion_tokens: 2 },
            });
            mockFetch.mockResolvedValue(mockOkResponse(body));
            await expect(llmPrompt('main', 'sys', 'user', 'test-llm19-under', 'text')).resolves.toBe('ok');
        });
    });
});
