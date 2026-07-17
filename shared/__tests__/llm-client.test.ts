vi.useFakeTimers();
vi.mock('../config-accessor.js', () => {
    const mockConfig: Record<string, string> = {};
    const ConfigMock = {
        get llmApiKey() {
            return mockConfig['llmApiKey'] ?? '';
        },
        get llmModel() {
            return mockConfig['llmModel'] ?? 'google/gemini-2.0-flash-exp';
        },
        get llmBaseUrl() {
            return mockConfig['llmBaseUrl'] ?? 'https://openrouter.ai/api/v1';
        },
        get llmFastApiKey() {
            return mockConfig['llmFastApiKey'] ?? '';
        },
        get llmFastModel() {
            return mockConfig['llmFastModel'] ?? 'llama3-8b-8192';
        },
        get llmFastBaseUrl() {
            return mockConfig['llmFastBaseUrl'] ?? 'https://api.groq.com/openai/v1';
        },
        get llmReviewApiKey() {
            return mockConfig['llmReviewApiKey'] ?? '';
        },
        get llmReviewModel() {
            return mockConfig['llmReviewModel'] ?? 'gemini-2.0-flash-exp';
        },
        get llmReviewBaseUrl() {
            return mockConfig['llmReviewBaseUrl'] ?? 'https://generativelanguage.googleapis.com/v1beta';
        },
        get llmFallbackApiKey() {
            return mockConfig['llmFallbackApiKey'] ?? '';
        },
        get llmFallbackModel() {
            return mockConfig['llmFallbackModel'] ?? 'meta/llama3-70b-instruct';
        },
        get llmFallbackBaseUrl() {
            return mockConfig['llmFallbackBaseUrl'] ?? 'https://integrate.api.nvidia.com/v1';
        },
        get llmBatchApiKey() {
            return mockConfig['llmBatchApiKey'] ?? '';
        },
        get llmBatchModel() {
            return mockConfig['llmBatchModel'] ?? 'gpt-4o-mini';
        },
        get llmBatchBaseUrl() {
            return mockConfig['llmBatchBaseUrl'] ?? 'https://models.inference.ai.azure.com';
        },
        get llmMaxTotalTokens() {
            const v = mockConfig['llmMaxTotalTokens'];
            return v ? parseInt(v, 10) : 0;
        },
        get llmMaxTokens() {
            const v = mockConfig['llmMaxTokens'];
            return v ? parseInt(v, 10) : 128000;
        },
        set(key: string, value: string) {
            Reflect.set(mockConfig, key, value);
        },
        get(key: string) {
            const defaults: Record<string, string | number> = {
                llmModel: 'google/gemini-2.0-flash-exp',
                llmBaseUrl: 'https://openrouter.ai/api/v1',
                llmFastModel: 'llama3-8b-8192',
                llmFastBaseUrl: 'https://api.groq.com/openai/v1',
                llmReviewModel: 'gemini-2.0-flash-exp',
                llmReviewBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                llmFallbackModel: 'meta/llama3-70b-instruct',
                llmFallbackBaseUrl: 'https://integrate.api.nvidia.com/v1',
                llmBatchModel: 'gpt-4o-mini',
                llmBatchBaseUrl: 'https://models.inference.ai.azure.com',
                llmMaxTokens: 128000,
            };
            return (Reflect.get(mockConfig, key) as string | undefined) ?? Reflect.get(defaults, key);
        },
        resetInstance() {
            Object.keys(mockConfig).forEach((k) => Reflect.deleteProperty(mockConfig, k));
        },
        reset() {
            Object.keys(mockConfig).forEach((k) => Reflect.deleteProperty(mockConfig, k));
        },
    };
    return { __esModule: true, default: ConfigMock };
});
vi.mock('../model-resolver', () => ({
    initModelResolver: vi.fn(),
    getRegistry: vi.fn(() => ({ providers: {} })),
    resolveModel: vi.fn(() => ({ id: 'test-model' })),
}));
vi.mock('../disk-cache', () => ({
    diskCacheGet: vi.fn(() => null),
    diskCacheSet: vi.fn(),
    clearDiskCache: vi.fn(),
}));
import { diskCacheGet } from '../disk-cache.js';
import { LlmError } from '../errors.js';
import Config from '../config-accessor.js';
import {
    llmPrompt,
    clearCache,
    resetRateLimiter,
    resetCircuitState,
    parseRetryAfter,
    getLlmClientMetrics,
    resetLlmClientMetrics,
} from '../llm-client.js';
import { rootLogger } from '../logger.js';
import { safeParseJson } from '../safe-json.js';

const mockFetch = vi.fn<(...args: [input: string | URL | Request, init?: RequestInit]) => Promise<Response>>();
global.fetch = mockFetch;

function mockOkResponse(body: string): Response {
    const r = new Response(body, { status: 200 });
    vi.spyOn(r, 'text').mockResolvedValue(body);
    vi.spyOn(r.headers, 'get').mockReturnValue(null);
    return r;
}
function mockErrorResponse(status: number): Response {
    const r = new Response('error', { status });
    vi.spyOn(r, 'text').mockResolvedValue('error');
    vi.spyOn(r.headers, 'get').mockReturnValue(null);
    return r;
}
function mockResponseWithHeader(status: number, headerKey: string, headerValue: string | null): Response {
    const r = new Response('error', { status });
    vi.spyOn(r, 'text').mockResolvedValue('error');
    vi.spyOn(r.headers, 'get').mockImplementation((k: string) => (k === headerKey ? headerValue : null));
    return r;
}

describe('Llm Client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch.mockReset();
        clearCache();
        resetRateLimiter();
        resetCircuitState();
        Config.reset();
        vi.mocked(diskCacheGet).mockReturnValue(null);
    });

    describe('LlmPrompt', () => {
        it('sends prompt to main tier (OpenRouter) and returns parsed response', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'google/gemini-2.0-flash-exp');
            Config.set('llmBaseUrl', 'https://openrouter.ai/api/v1');
            const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Generated test case' } }] });
            mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

            const result = await llmPrompt({
                tier: 'main',
                system: 'You are a QA assistant',
                user: 'Generate a test for login',
            });

            expect(result).toBe('Generated test case');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const callUrl = mockFetch.mock.calls[0]?.[0] ?? '';
            const callOpts = mockFetch.mock.calls[0]?.[1];

            expect(callUrl).toContain('/chat/completions');
            expect(((callOpts?.headers ?? {}) as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
        });

        it('sends prompt to fast tier (Groq, OpenAI format)', async () => {
            expect.hasAssertions();

            Config.set('llmFastApiKey', 'gsk-test');
            Config.set('llmFastModel', 'llama3-8b-8192');
            Config.set('llmFastBaseUrl', 'https://api.groq.com/openai/v1');
            const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Fast response' } }] });
            mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

            const result = await llmPrompt({ tier: 'fast', system: 'system', user: 'quick test' });

            expect(result).toBe('Fast response');

            const callUrl = mockFetch.mock.calls[0]?.[0] ?? '';

            expect(callUrl).toContain('groq.com');
        });

        it('sends prompt to reviewer tier (Gemini format)', async () => {
            expect.hasAssertions();

            Config.set('llmReviewApiKey', 'AIza-review');
            Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
            Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
            const apiResponse = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Review ok' }] } }] });
            mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

            const result = await llmPrompt({ tier: 'reviewer', system: 'system', user: 'review this' });

            expect(result).toBe('Review ok');

            const callUrl = mockFetch.mock.calls[0]?.[0] ?? '';

            expect(((mockFetch.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>)['X-Goog-Api-Key']).toBe(
                'AIza-review',
            );
            expect(callUrl).not.toContain('AIza-review');
        });

        it('falls back to fallback tier when main fails', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'gpt-4');
            Config.set('llmBaseUrl', 'https://openrouter.ai/api/v1');
            Config.set('llmFallbackApiKey', 'nv-test');
            Config.set('llmFallbackModel', 'llama3');
            Config.set('llmFallbackBaseUrl', 'https://nv.api.com/v1');
            Config.set('llmBatchApiKey', 'gh-test');
            Config.set('llmBatchModel', 'gpt4o-mini');
            Config.set('llmBatchBaseUrl', 'https://models.inference.ai.azure.com');

            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
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
                .mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'Batch ok' } }] })),
                );

            const result = await llmPrompt({ tier: 'main', system: 'system', user: 'fallback chain' });

            expect(result).toBe('Batch ok');
            // main:3 retries + fallback:3 retries + batch:1 success = 7 calls
            expect(mockFetch).toHaveBeenCalledTimes(7);
        });

        it('returns cached response on repeated call with same inputs', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'google/gemini-2.0-flash-exp');
            const apiResponse = JSON.stringify({ choices: [{ message: { content: 'Cached result' } }] });
            mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

            const first = await llmPrompt({ tier: 'main', system: 'system', user: 'same input' });

            expect(first).toBe('Cached result');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const second = await llmPrompt({ tier: 'main', system: 'system', user: 'same input' });

            expect(second).toBe('Cached result');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('retries on HTTP 429 and succeeds', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'google/gemini-2.0-flash-exp');
            mockFetch
                .mockResolvedValueOnce(mockErrorResponse(429))
                .mockResolvedValueOnce(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));

            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);

            const result = await llmPrompt({ tier: 'main', system: 'system', user: 'retry test' });

            expect(result).toBe('OK');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('throws after exhausting all providers', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', '');

            await expect(llmPrompt({ tier: 'main', system: 'system', user: 'test' })).rejects.toThrow(/./i);
        });

        it('sends responseFormat=json payload when param is passed', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test2');
            Config.set('llmModel', 'gpt-4');
            Config.set('llmBaseUrl', 'https://api.test.com/v1');
            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'json result' } }] })),
            );

            await llmPrompt({ tier: 'main', system: 'system', user: 'json test', responseFormat: 'json' });
            const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

            expect(body['response_format']).toStrictEqual({ type: 'json_object' });
        });

        it('different responseFormat produces different cache keys', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test3');
            Config.set('llmModel', 'gpt-4');
            Config.set('llmBaseUrl', 'https://api.test.com/v1');
            const body = JSON.stringify({ choices: [{ message: { content: 'r1' } }] });
            mockFetch.mockResolvedValue(mockOkResponse(body));

            const r1 = await llmPrompt({ tier: 'main', system: 'system', user: 'same input', responseFormat: 'json' });

            expect(r1).toBe('r1');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockResolvedValue(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'r2' } }] })));
            const r2 = await llmPrompt({ tier: 'main', system: 'system', user: 'same input', responseFormat: 'text' });

            expect(r2).toBe('r2');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('sends Gemini system_instruction payload for reviewer tier', async () => {
            expect.hasAssertions();

            Config.set('llmReviewApiKey', 'AIza-gemini-test');
            Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
            Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })),
            );

            await llmPrompt({ tier: 'reviewer', system: 'system instruction', user: 'user message' });
            const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

            expect(body).toHaveProperty('system_instruction');
            expect(body).toHaveProperty('system_instruction.parts[0].text', 'system instruction');
            expect(body).toHaveProperty('contents[0].parts[0].text', 'user message');
            expect(((mockFetch.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>)['X-Goog-Api-Key']).toBe(
                'AIza-gemini-test',
            );
        });

        it('deduplicates same provider in fallback chain', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'gpt-4');
            Config.set('llmBaseUrl', 'https://api.test.com/v1');
            Config.set('llmFallbackApiKey', 'sk-test');
            Config.set('llmFallbackModel', 'gpt-4');
            Config.set('llmFallbackBaseUrl', 'https://api.test.com/v1');
            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);
            mockFetch
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500))
                .mockResolvedValueOnce(mockErrorResponse(500));

            await expect(llmPrompt({ tier: 'main', system: 'system', user: 'dedup test' })).rejects.toThrow(
                'All LLM providers failed',
            );
            // main:3 retries (fallback dedup'd), + batch:3 retries (resolved from provider profile)
            expect(mockFetch).toHaveBeenCalledTimes(6);
        });

        it('handles network error with retry', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'google/gemini-2.0-flash-exp');
            mockFetch
                .mockRejectedValueOnce(new Error('Network failure'))
                .mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'Recovered' } }] })),
                );

            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);

            const result = await llmPrompt({ tier: 'main', system: 'system', user: 'network recovery' });

            expect(result).toBe('Recovered');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('rejects unparseable response via validation hook', async () => {
            expect.hasAssertions();

            Config.set('llmApiKey', 'sk-test');
            Config.set('llmModel', 'google/gemini-2.0-flash-exp');
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            mockFetch.mockResolvedValueOnce(mockOkResponse('not json'));

            await expect(llmPrompt({ tier: 'main', system: 'system', user: 'bad response' })).rejects.toThrow(LlmError);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON'));

            warnSpy.mockRestore();
        });

        describe('Rate limiter', () => {
            it('allows requests within limit', async () => {
                expect.hasAssertions();

                Config.set('LLM_RATE_LIMIT', '2');
                Config.set('llmApiKey', 'sk-test');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
                );

                const r1 = await llmPrompt({ tier: 'main', system: 'system', user: 'test1' });
                const r2 = await llmPrompt({ tier: 'main', system: 'system', user: 'test2' });

                expect(r1).toBe('ok');
                expect(r2).toBe('ok');
                expect(mockFetch).toHaveBeenCalledTimes(2);
            });

            it('rejects when rate limit exceeded', async () => {
                expect.hasAssertions();

                Config.set('LLM_RATE_LIMIT', '2');
                Config.set('llmApiKey', 'sk-test');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
                );

                await llmPrompt({ tier: 'main', system: 'system', user: 'test1' });
                await llmPrompt({ tier: 'main', system: 'system', user: 'test2' });

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'test3' })).rejects.toThrow(
                    'Client-side rate limit exceeded',
                );
            });

            it('recovers after rate limit window passes', async () => {
                expect.hasAssertions();

                vi.useFakeTimers();
                Config.set('LLM_RATE_LIMIT', '2');
                Config.set('llmApiKey', 'sk-test');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
                );
                vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                    cb();
                    return {} as NodeJS.Timeout;
                }) as typeof global.setTimeout);

                await llmPrompt({ tier: 'main', system: 'system', user: 'test1' });
                await llmPrompt({ tier: 'main', system: 'system', user: 'test2' });
                resetRateLimiter();
                const r3 = await llmPrompt({ tier: 'main', system: 'system', user: 'test3' });

                expect(r3).toBe('ok');
            });
        });

        describe('Circuit breaker', () => {
            beforeEach(() => {
                Config.set('llmApiKey', 'sk-test');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                    cb();
                    return {} as NodeJS.Timeout;
                }) as typeof global.setTimeout);
            });

            it('opens after 5 consecutive call failures', async () => {
                expect.hasAssertions();

                mockFetch.mockResolvedValue(mockErrorResponse(429));
                for (let i = 0; i < 5; i++) {
                    await expect(llmPrompt({ tier: 'main', system: 'system', user: 'test' + i })).rejects.toThrow(/./i);
                }
            });

            it('blocks requests while circuit is open', async () => {
                expect.hasAssertions();

                mockFetch.mockResolvedValue(mockErrorResponse(429));
                // Prime: 5 failures to open circuit
                for (let i = 0; i < 5; i++) {
                    await expect(llmPrompt({ tier: 'main', system: 'system', user: 'prime' + i })).rejects.toThrow(
                        /./i,
                    );
                }
                const fetchCount = mockFetch.mock.calls.length;

                // Blocked call throws Circuit breaker open without fetching
                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'blocked' })).rejects.toThrow(
                    'Circuit breaker open',
                );
                expect(mockFetch.mock.calls).toHaveLength(fetchCount);
            });

            it('recovers after circuit state is cleared', async () => {
                expect.hasAssertions();

                mockFetch.mockResolvedValue(mockErrorResponse(429));
                for (let i = 0; i < 5; i++) {
                    await expect(llmPrompt({ tier: 'main', system: 'system', user: 'prime' + i })).rejects.toThrow(
                        /./i,
                    );
                }
                resetCircuitState();
                mockFetch.mockReset();
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'recovered' } }] })),
                );
                const result = await llmPrompt({ tier: 'main', system: 'system', user: 'recovered' });

                expect(result).toBe('recovered');
            });

            it('resets counter on primary success', async () => {
                expect.hasAssertions();

                mockFetch.mockResolvedValue(mockErrorResponse(429));
                // 4 failures → counter at 4
                for (let i = 0; i < 4; i++) {
                    await expect(llmPrompt({ tier: 'main', system: 'system', user: 'fail' + i })).rejects.toThrow(/./i);
                }
                // Next call: mock switches to success
                mockFetch.mockReset();
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'success' } }] })),
                );
                const result = await llmPrompt({ tier: 'main', system: 'system', user: 'recover' });

                expect(result).toBe('success');
            });
        });

        describe('ParseRetryAfter', () => {
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

        describe('ResponseFormat parameter', () => {
            it('passes responseFormat=json to provider config', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-rftest');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{"key":"val"}' } }] })),
                );

                await llmPrompt({ tier: 'main', system: 'system', user: 'json test', responseFormat: 'json' });
                const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

                expect(body['response_format']).toStrictEqual({ type: 'json_object' });
            });

            it('different responseFormat produces different cache keys (via metrics)', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-metrics');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                resetLlmClientMetrics();
                const resp = JSON.stringify({ choices: [{ message: { content: 'result' } }] });
                mockFetch.mockResolvedValue(mockOkResponse(resp));

                await llmPrompt({ tier: 'main', system: 'system', user: 'same input', responseFormat: 'json' });

                expect(mockFetch).toHaveBeenCalledTimes(1);

                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'result2' } }] })),
                );
                await llmPrompt({ tier: 'main', system: 'system', user: 'same input', responseFormat: 'text' });

                expect(mockFetch).toHaveBeenCalledTimes(2);

                const metrics = getLlmClientMetrics();

                expect(metrics.cacheMisses).toBe(2);
                expect(metrics.cacheHits).toBe(0);
            });
        });

        describe('Gemini system_instruction payload', () => {
            it('includes system_instruction for gemini format provider', async () => {
                expect.hasAssertions();

                Config.set('llmReviewApiKey', 'AIza-gemini-sys');
                Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
                Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
                mockFetch.mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })),
                );

                await llmPrompt({ tier: 'reviewer', system: 'custom system instruction', user: 'user text' });
                const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

                expect(body).toHaveProperty('system_instruction');
                expect(body).toHaveProperty('system_instruction.parts[0].text', 'custom system instruction');
                expect(body).toHaveProperty('contents[0].parts[0].text', 'user text');
            });
        });

        describe('Non-JSON 200 response', () => {
            it('calls logger.warn when provider returns 200 with non-JSON body', async () => {
                expect.hasAssertions();

                const warnSpy = vi.spyOn(rootLogger, 'warn');
                Config.set('llmApiKey', 'sk-warn');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValueOnce(mockOkResponse('plain text body'));

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'non-json body' })).rejects.toThrow(
                    LlmError,
                );
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON'));
            });
        });

        describe('Tier fallback deduplication', () => {
            it('deduplicates fallback when same config, batch still resolved from profile', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-dd');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                Config.set('llmFallbackApiKey', 'sk-dd');
                Config.set('llmFallbackModel', 'gpt-4');
                Config.set('llmFallbackBaseUrl', 'https://api.test.com/v1');
                Config.set('llmBatchApiKey', 'sk-dd');
                Config.set('llmBatchModel', 'gpt-4');
                Config.set('llmBatchBaseUrl', 'https://api.test.com/v1');

                vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                    cb();
                    return {} as NodeJS.Timeout;
                }) as typeof global.setTimeout);

                mockFetch
                    .mockResolvedValueOnce(mockErrorResponse(500))
                    .mockResolvedValueOnce(mockErrorResponse(500))
                    .mockResolvedValueOnce(mockErrorResponse(500))
                    .mockResolvedValueOnce(mockErrorResponse(500))
                    .mockResolvedValueOnce(mockErrorResponse(500))
                    .mockResolvedValueOnce(mockErrorResponse(500));

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'full dedup' })).rejects.toThrow(
                    'All LLM providers failed',
                );
                // main:3 + batch:3 (batch has temp 0.5 ≠ 0.3, not dedup'd)
                expect(mockFetch).toHaveBeenCalledTimes(6);
            });
        });

        describe('L23: Pending Tests', () => {
            it('23.2: passes responseFormat to provider config', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-23-2');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{}' } }] })),
                );

                await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'user',
                    callerId: 'caller',
                    responseFormat: 'json',
                });

                const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

                expect(body['response_format']).toStrictEqual({ type: 'json_object' });
            });

            it('23.3: uses different cache keys for different responseFormat', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-23-3');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{}' } }] })),
                );

                await llmPrompt({ tier: 'main', system: 'sys', user: 'user', callerId: 'c', responseFormat: 'text' });
                await llmPrompt({ tier: 'main', system: 'sys', user: 'user', callerId: 'c', responseFormat: 'json' });

                expect(mockFetch).toHaveBeenCalledTimes(2);
            });

            it('23.4: Gemini system_instruction payload test', async () => {
                expect.hasAssertions();

                Config.set('llmReviewApiKey', 'sk-gemini');
                Config.set('llmReviewModel', 'gemini-1.5-flash');
                Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');

                const geminiResponse = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
                mockFetch.mockResolvedValueOnce(mockOkResponse(JSON.stringify(geminiResponse)));

                await llmPrompt({ tier: 'reviewer', system: 'sys', user: 'user' });

                const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

                expect(body).toHaveProperty('system_instruction');
                expect(body).toHaveProperty('system_instruction.parts[0].text', 'sys');
            });
        });

        describe('WarnIfNotJson (29.3)', () => {
            beforeEach(() => {
                Config.set('llmApiKey', 'sk-test29');
                Config.set('llmModel', 'google/gemini-2.0-flash-exp');
                Config.set('llmBaseUrl', 'https://openrouter.ai/api/v1');
            });

            function openAiResponse(content: string): Response {
                const body = JSON.stringify({ choices: [{ message: { content } }] });
                const r = new Response(body, { status: 200 });
                vi.spyOn(r, 'text').mockResolvedValue(body);
                vi.spyOn(r.headers, 'get').mockReturnValue(null);
                return r;
            }

            it('does not warn when response is valid JSON (responseFormat=json)', async () => {
                expect.hasAssertions();

                const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
                mockFetch.mockResolvedValueOnce(openAiResponse(JSON.stringify({ ok: true })));
                await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'user',
                    callerId: 'test29.3-valid',
                    responseFormat: 'json',
                });

                expect(warnSpy).not.toHaveBeenCalled();

                warnSpy.mockRestore();
            });

            it('warns when responseFormat=json but extracted content is not valid JSON', async () => {
                expect.hasAssertions();

                const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
                mockFetch.mockResolvedValueOnce(openAiResponse('not json'));
                await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'user',
                    callerId: 'test29.3-invalid',
                    responseFormat: 'json',
                });

                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('LLM response expected JSON but was not parseable'),
                );

                warnSpy.mockRestore();
            });

            it('does not call _warnIfNotJson when responseFormat is not json', async () => {
                expect.hasAssertions();

                const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
                mockFetch.mockResolvedValueOnce(openAiResponse('не json, а plain text'));
                await llmPrompt({ tier: 'main', system: 'sys', user: 'user', callerId: 'test29.3-nojson' });

                expect(warnSpy).not.toHaveBeenCalledWith(
                    expect.stringContaining('LLM response expected JSON but was not parseable'),
                );

                warnSpy.mockRestore();
            });
        });

        describe('Total token limit', () => {
            beforeEach(() => {
                resetLlmClientMetrics();
                Config.set('llmApiKey', 'sk-test');
            });

            it('throws when total tokens exceed limit after first call', async () => {
                expect.hasAssertions();

                Config.set('llmMaxTotalTokens', '10');
                const body = JSON.stringify({
                    choices: [{ message: { content: 'ok' } }],
                    usage: { prompt_tokens: 8, completion_tokens: 3 },
                });
                mockFetch.mockResolvedValue(mockOkResponse(body));
                await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'user',
                    callerId: 'test-llm19-1',
                    responseFormat: 'text',
                });

                await expect(
                    llmPrompt({
                        tier: 'main',
                        system: 'sys',
                        user: 'user',
                        callerId: 'test-llm19-2',
                        responseFormat: 'text',
                    }),
                ).rejects.toThrow('Total token limit reached');
            });

            it('does not throw when limit is 0 (unlimited)', async () => {
                expect.hasAssertions();

                Config.set('llmMaxTotalTokens', '0');
                const body = JSON.stringify({
                    choices: [{ message: { content: 'ok' } }],
                    usage: { prompt_tokens: 5, completion_tokens: 3 },
                });
                mockFetch.mockResolvedValue(mockOkResponse(body));
                await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'user',
                    callerId: 'test-llm19-unlimited',
                    responseFormat: 'text',
                });

                await expect(
                    llmPrompt({
                        tier: 'main',
                        system: 'sys',
                        user: 'user',
                        callerId: 'test-llm19-unlimited-2',
                        responseFormat: 'text',
                    }),
                ).resolves.toBe('ok');
            });

            it('does not throw when total tokens are under limit', async () => {
                expect.hasAssertions();

                Config.set('llmMaxTotalTokens', '100');
                const body = JSON.stringify({
                    choices: [{ message: { content: 'ok' } }],
                    usage: { prompt_tokens: 3, completion_tokens: 2 },
                });
                mockFetch.mockResolvedValue(mockOkResponse(body));

                await expect(
                    llmPrompt({
                        tier: 'main',
                        system: 'sys',
                        user: 'user',
                        callerId: 'test-llm19-under',
                        responseFormat: 'text',
                    }),
                ).resolves.toBe('ok');
            });
        });

        const okBooleanSchema = {
            safeParse: (data: unknown) => {
                if (
                    typeof data === 'object' &&
                    data !== null &&
                    'ok' in data &&
                    typeof (data as Record<string, unknown>)['ok'] === 'boolean'
                ) {
                    return { success: true as const, data };
                }
                return { success: false as const, error: { issues: [{ path: ['ok'], message: 'Expected boolean' }] } };
            },
        };
        const alwaysFailsSchema = {
            safeParse: () => ({
                success: false as const,
                error: { issues: [{ path: ['x'], message: 'always fails' }] },
            }),
        };

        describe('Schema validation', () => {
            beforeEach(() => {
                vi.useRealTimers();
                Config.set('llmApiKey', 'sk-schema');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                Config.set('llmFallbackApiKey', 'nv-schema');
                Config.set('llmFallbackModel', 'llama3');
                Config.set('llmFallbackBaseUrl', 'https://nv.api.com/v1');
            });

            it('returns validated data on first response', async () => {
                expect.hasAssertions();

                const validResponse = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(validResponse));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-1',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
            });

            it('retries with schema hints when first response is invalid', async () => {
                expect.hasAssertions();

                const invalidBody = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                const validBody = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch
                    .mockResolvedValueOnce(mockOkResponse(invalidBody))
                    .mockResolvedValueOnce(mockOkResponse(validBody));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-2',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(2);
            });

            it('throws when schema validation fails even after retry', async () => {
                expect.hasAssertions();

                const body = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(body)).mockResolvedValueOnce(mockOkResponse(body));

                await expect(
                    llmPrompt({
                        tier: 'main',
                        system: 'system',
                        user: 'user',
                        callerId: 'schema-3',
                        responseFormat: 'json',
                        schema: alwaysFailsSchema,
                    }),
                ).rejects.toThrow('LLM response failed schema validation after progressive retry');
            });

            it('returns validated data on cache hit with valid schema', async () => {
                expect.hasAssertions();

                const body = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(body));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-4',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-4',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(1);
            });

            it('re-requests on cache hit when cached value fails schema validation', async () => {
                expect.hasAssertions();

                const validBody = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(validBody));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });
                clearCache();
                const body = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(body));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                });
                mockFetch.mockResolvedValueOnce(mockOkResponse(validBody));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(3);
            });

            it('retries with schema hints when first response is invalid (llm-client)', async () => {
                expect.hasAssertions();

                const invalidBody = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                const validBody = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch
                    .mockResolvedValueOnce(mockOkResponse(invalidBody))
                    .mockResolvedValueOnce(mockOkResponse(validBody));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-2',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(2);
            });

            it('throws when schema validation fails even after retry (llm-client)', async () => {
                expect.hasAssertions();

                const body = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(body)).mockResolvedValueOnce(mockOkResponse(body));

                await expect(
                    llmPrompt({
                        tier: 'main',
                        system: 'system',
                        user: 'user',
                        callerId: 'schema-3',
                        responseFormat: 'json',
                        schema: alwaysFailsSchema,
                    }),
                ).rejects.toThrow('LLM response failed schema validation after progressive retry');
            });

            it('returns validated data on cache hit with valid schema (llm-client)', async () => {
                expect.hasAssertions();

                const body = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(body));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-4',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-4',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(1);
            });

            it('re-requests on cache hit when cached value fails schema validation (llm-client)', async () => {
                expect.hasAssertions();

                const validBody = JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(validBody));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });
                clearCache();
                const invalidBody = JSON.stringify({ choices: [{ message: { content: '{}' } }] });
                mockFetch.mockResolvedValueOnce(mockOkResponse(invalidBody));
                await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                });
                mockFetch.mockResolvedValueOnce(mockOkResponse(validBody));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'schema-5',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).toHaveBeenCalledTimes(3);
            });
        });

        describe('SendToProvider error payload', () => {
            beforeEach(() => {
                Config.set('llmApiKey', 'sk-err');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                Config.set('llmFallbackApiKey', 'nv-err');
                Config.set('llmFallbackModel', 'llama3');
                Config.set('llmFallbackBaseUrl', 'https://nv.api.com/v1');
            });

            it('falls back to next provider when API returns error payload in 200 response', async () => {
                expect.hasAssertions();

                const errorBody = JSON.stringify({ error: { message: 'Rate limited by provider' } });
                const successBody = JSON.stringify({ choices: [{ message: { content: 'fallback worked' } }] });
                mockFetch
                    .mockResolvedValueOnce(mockOkResponse(errorBody))
                    .mockResolvedValueOnce(mockOkResponse(successBody));
                const result = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'user',
                    callerId: 'err-payload',
                });

                expect(result).toBe('fallback worked');
            });
        });

        describe('Gemini usageMetadata tracking', () => {
            it('tracks prompt/completion tokens via usageMetadata (Gemini format)', async () => {
                expect.hasAssertions();

                Config.set('llmReviewApiKey', 'AIza-um-test');
                Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
                Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
                resetLlmClientMetrics();
                const apiResponse = JSON.stringify({
                    candidates: [{ content: { parts: [{ text: 'gemini result' }] } }],
                    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
                });
                mockFetch.mockResolvedValueOnce(mockOkResponse(apiResponse));

                await llmPrompt({ tier: 'reviewer', system: 'system', user: 'user', callerId: 'um-1' });
                const metrics = getLlmClientMetrics();

                expect(metrics.totalPromptTokens).toBe(10);
                expect(metrics.totalCompletionTokens).toBe(5);
            });
        });

        describe('Cache expiry', () => {
            it('re-requests when cached entry expires', async () => {
                expect.hasAssertions();

                vi.useFakeTimers();

                Config.set('llmApiKey', 'sk-cache-expire');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');

                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'first' } }] })),
                );

                const r1 = await llmPrompt({ tier: 'main', system: 'system', user: 'ttl test', callerId: 'cache-ttl' });

                expect(r1).toBe('first');
                expect(mockFetch).toHaveBeenCalledTimes(1);

                await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'second' } }] })),
                );
                const r2 = await llmPrompt({ tier: 'main', system: 'system', user: 'ttl test', callerId: 'cache-ttl' });

                expect(r2).toBe('second');
                expect(mockFetch).toHaveBeenCalledTimes(2);
            });

            it('cache cleanup timed interval removes expired entries', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-cache-cleanup');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');

                mockFetch
                    .mockResolvedValueOnce(
                        mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'to-clean' } }] })),
                    )
                    .mockResolvedValueOnce(
                        mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'after-cleanup' } }] })),
                    );

                const r1 = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'cleanup test',
                    callerId: 'cache-cleanup',
                });

                expect(r1).toBe('to-clean');
                expect(mockFetch).toHaveBeenCalledTimes(1);

                await vi.advanceTimersByTimeAsync(600 * 1000);
                const r2 = await llmPrompt({
                    tier: 'main',
                    system: 'system',
                    user: 'cleanup test',
                    callerId: 'cache-cleanup',
                });

                expect(r2).toBe('after-cleanup');
                expect(mockFetch).toHaveBeenCalledTimes(2);
            });
        });

        describe('Report tier', () => {
            it('uses report tier config and sends responseFormat=json', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-report');
                Config.set('llmModel', 'gpt-4-report');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockResolvedValueOnce(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{"result":42}' } }] })),
                );

                await llmPrompt({ tier: 'report', system: 'system', user: 'report test', responseFormat: 'json' });
                const body = safeParseJson<Record<string, unknown>>(mockFetch.mock.calls[0]?.[1]?.body as string, {});

                expect(body['response_format']).toStrictEqual({ type: 'json_object' });
            });
        });

        describe('Fetch retries exhausted', () => {
            it('throws on network error after exhausting all retries', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-netfail');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                mockFetch.mockRejectedValue(new Error('Network down'));

                vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                    cb();
                    return {} as NodeJS.Timeout;
                }) as typeof global.setTimeout);

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'net fail' })).rejects.toThrow(
                    'Network down',
                );
            });

            it('throws LlmError after exhausting HTTP retries on 429', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-httpex');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                // 3 retries + 1 extra fallback config = 4 calls total, all 429
                mockFetch.mockResolvedValue(mockErrorResponse(429));

                vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                    cb();
                    return {} as NodeJS.Timeout;
                }) as typeof global.setTimeout);

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'http fail' })).rejects.toThrow(
                    'All LLM providers failed',
                );
            });

            it('throws LlmError when fetch retries set to 0', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-zero');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                Config.set('LLM_FETCH_RETRIES', '0');

                await expect(llmPrompt({ tier: 'main', system: 'system', user: 'zero retry' })).rejects.toThrow(
                    'All LLM providers failed',
                );
            });
        });

        describe('Input token limit', () => {
            it('throws when estimated tokens exceed LLM_MAX_TOKENS_PER_OP', async () => {
                expect.hasAssertions();

                Config.set('llmApiKey', 'sk-tokenlim');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
                Config.set('llmMaxTokens', '1');

                await expect(
                    llmPrompt({ tier: 'main', system: 'a'.repeat(100), user: 'b'.repeat(100), callerId: 'token-lim' }),
                ).rejects.toThrow('Input too large');
            });
        });

        describe('Disk cache', () => {
            beforeEach(() => {
                Config.set('llmApiKey', 'sk-disk');
                Config.set('llmModel', 'gpt-4');
                Config.set('llmBaseUrl', 'https://api.test.com/v1');
            });

            it('returns disk cached response without schema', async () => {
                expect.hasAssertions();

                vi.mocked(diskCacheGet).mockReturnValue('cached from disk');

                const result = await llmPrompt({ tier: 'main', system: 'sys', user: 'usr', callerId: 'disk-noschema' });

                expect(result).toBe('cached from disk');
                expect(mockFetch).not.toHaveBeenCalled();
            });

            it('returns disk cached response with valid schema', async () => {
                expect.hasAssertions();

                vi.mocked(diskCacheGet).mockReturnValue('{"ok": true}');

                const result = await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'usr',
                    callerId: 'disk-schema',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(mockFetch).not.toHaveBeenCalled();
            });

            it('falls through to fetch when disk cache has schema-invalid content', async () => {
                expect.hasAssertions();

                const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
                vi.mocked(diskCacheGet).mockReturnValue('{"not_ok": "string_value"}');

                mockFetch.mockResolvedValue(
                    mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] })),
                );

                const result = await llmPrompt({
                    tier: 'main',
                    system: 'sys',
                    user: 'usr',
                    callerId: 'disk-schema-fail',
                    responseFormat: 'json',
                    schema: okBooleanSchema,
                });

                expect(result).toStrictEqual({ ok: true });
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LLM disk cache hit but schema invalid'));
                expect(mockFetch).toHaveBeenCalledTimes(1);

                warnSpy.mockRestore();
            });
        });
    });
});
