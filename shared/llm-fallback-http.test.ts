vi.mock('./config-accessor.js', () => {
    const mockConfig: Record<string, string> = {};
    return {
        __esModule: true,
        default: {
            get llmApiKey() {
                return mockConfig['llmApiKey'] ?? '';
            },
            get llmModel() {
                return mockConfig['llmModel'] ?? 'gpt-4';
            },
            get llmBaseUrl() {
                return mockConfig['llmBaseUrl'] ?? 'https://api.test.com/v1';
            },
            get LLM_FETCH_RETRIES() {
                return mockConfig['LLM_FETCH_RETRIES'] ?? '3';
            },
            set(key: string, value: string) {
                Reflect.set(mockConfig, key, value);
            },
            get(key: string) {
                return Reflect.get(mockConfig, key);
            },
            resetInstance() {
                Object.keys(mockConfig).forEach((k) => Reflect.deleteProperty(mockConfig, k));
            },
            reset() {
                Object.keys(mockConfig).forEach((k) => Reflect.deleteProperty(mockConfig, k));
            },
        },
    };
});
vi.mock('./llm-rate-limiter', async () => {
    const original = await vi.importActual<typeof import('./llm-rate-limiter.js')>('./llm-rate-limiter');
    return {
        ...original,
        checkRateLimit: vi.fn(),
    };
});
vi.mock('./circuit-breaker', () => ({
    checkCircuitBreaker: vi.fn(),
    recordCircuitFailure: vi.fn(),
    recordCircuitSuccess: vi.fn(),
}));
vi.mock('./sanitize', () => ({
    sanitizeForLlm: vi.fn((s: string) => s),
}));
vi.mock('./llm-cache', () => ({
    configUniqueKey: vi.fn(
        (cfg: { apiKey: string; model: string; baseUrl: string }) => cfg.apiKey + '@' + cfg.model + '@' + cfg.baseUrl,
    ),
}));

import { checkCircuitBreaker } from './circuit-breaker.js';
import Config from './config-accessor.js';
import {
    parseRawOnce,
    parseRetryAfter,
    buildOpenAiPayload,
    buildGeminiPayload,
    buildAnthropicPayload,
    fetchWithRetry,
    sendToProvider,
} from './llm-fallback-http.js';
import { resetLlmClientMetrics, getLlmClientMetrics } from './llm-fallback-config.js';
import { LlmAuthError } from './errors.js';

const mockFetch = vi.fn();
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

describe('Llm Fallback Http', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
        Config.reset();
        resetLlmClientMetrics();
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        vi.mocked(checkCircuitBreaker).mockImplementation(() => {});
    });

    describe('ParseRawOnce', () => {
        it('parses valid JSON string', () => {
            const result = parseRawOnce('{"key": "value"}');

            expect(result).toStrictEqual({ key: 'value' });
        });

        it('returns null for invalid JSON', () => {
            const result = parseRawOnce('not json');

            expect(result).toBeNull();
        });

        it('returns null for empty string', () => {
            const result = parseRawOnce('');

            expect(result).toBeNull();
        });
    });

    describe('ParseRetryAfter', () => {
        function mockResponseWithHeader(key: string, value: string | null): Response {
            const r = new Response('', { status: 429 });
            vi.spyOn(r, 'text').mockResolvedValue('');
            vi.spyOn(r.headers, 'get').mockImplementation((k: string) => (k === key ? value : null));
            return r;
        }

        it.each([
            { name: 'parses seconds from Retry-After header', header: '30', expected: 10000 },
            { name: 'returns default when no Retry-After header', header: null, expected: 2000 },
            { name: 'returns default for invalid Retry-After value', header: 'invalid', expected: 2000 },
            { name: 'caps at 10000ms', header: '999', expected: 10000 },
        ])('$name', ({ header, expected }) => {
            const resp = mockResponseWithHeader('Retry-After', header);
            const result = parseRetryAfter(resp, 2000);

            expect(result).toBe(expected);
        });
    });

    interface OpenAiPayload {
        model: string;
        temperature: number;
        messages: Array<{ role: string; content: string }>;
        response_format?: { type: string };
    }

    describe('BuildOpenAiPayload', () => {
        it('builds a valid JSON payload', () => {
            const result = buildOpenAiPayload('sys', 'usr', 'gpt-4', 0.5);
            const parsed = JSON.parse(result) as OpenAiPayload;

            expect(parsed.model).toBe('gpt-4');
            expect(parsed.temperature).toBe(0.5);
            expect(parsed.messages).toHaveLength(2);
            expect(parsed.messages[0]?.role).toBe('system');
            expect(parsed.messages[0]?.content).toBe('sys');
            expect(parsed.messages[1]?.role).toBe('user');
            expect(parsed.messages[1]?.content).toBe('usr');
        });

        it('uses default temperature when not provided', () => {
            const result = buildOpenAiPayload('sys', 'usr', 'gpt-4');
            const parsed = JSON.parse(result) as OpenAiPayload;

            expect(parsed.temperature).toBe(0.3);
        });

        it('includes response_format when format is json', () => {
            const result = buildOpenAiPayload('sys', 'usr', 'gpt-4', 0.3, 'json');
            const parsed = JSON.parse(result) as OpenAiPayload;

            expect(parsed.response_format).toStrictEqual({ type: 'json_object' });
        });

        it('omits response_format when format is not json', () => {
            const result = buildOpenAiPayload('sys', 'usr', 'gpt-4', 0.3, 'text');
            const parsed = JSON.parse(result) as OpenAiPayload;

            expect(parsed.response_format).toBeUndefined();
        });
    });

    interface GeminiPayload {
        system_instruction: { parts: Array<{ text: string }> };
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    }

    describe('BuildGeminiPayload', () => {
        it('builds a valid Gemini JSON payload', () => {
            const result = buildGeminiPayload('sys', 'usr');
            const parsed = JSON.parse(result) as GeminiPayload;

            expect(parsed.system_instruction.parts[0]?.text).toBe('sys');
            expect(parsed.contents[0]?.role).toBe('user');
            expect(parsed.contents[0]?.parts[0]?.text).toBe('usr');
        });
    });

    interface AnthropicPayload {
        model: string;
        max_tokens: number;
        temperature: number;
        system?: string;
        messages: Array<{ role: string; content: string }>;
        metadata?: Record<string, unknown>;
    }

    describe('BuildAnthropicPayload', () => {
        it('builds a valid Anthropic JSON payload', () => {
            const result = buildAnthropicPayload('sys', 'usr', 'claude-sonnet-4-20250514', 0.5);
            const parsed = JSON.parse(result) as AnthropicPayload;

            expect(parsed.model).toBe('claude-sonnet-4-20250514');
            expect(parsed.max_tokens).toBe(4096);
            expect(parsed.temperature).toBe(0.5);
            expect(parsed.system).toBe('sys');
            expect(parsed.messages).toHaveLength(1);
            expect(parsed.messages[0]?.role).toBe('user');
            expect(parsed.messages[0]?.content).toBe('usr');
        });

        it('omits system field when system is empty', () => {
            const result = buildAnthropicPayload('', 'usr', 'claude-haiku-3-5-20241022');
            const parsed = JSON.parse(result) as AnthropicPayload;

            expect(parsed.system).toBeUndefined();
        });

        it('uses default temperature when not provided', () => {
            const result = buildAnthropicPayload('sys', 'usr', 'claude-sonnet-4-20250514');
            const parsed = JSON.parse(result) as AnthropicPayload;

            expect(parsed.temperature).toBe(0.3);
        });

        it('includes metadata for json responseFormat', () => {
            const result = buildAnthropicPayload('sys', 'usr', 'claude-sonnet-4-20250514', 0.3, 'json');
            const parsed = JSON.parse(result) as AnthropicPayload;

            expect(parsed.metadata).toStrictEqual({ response_format: 'json' });
        });
    });

    describe('FetchWithRetry', () => {
        beforeEach(() => {
            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns response on successful fetch', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockOkResponse('ok'));
            const result = await fetchWithRetry('https://api.test.com', {});

            expect(result.ok).toBeTruthy();

            const text = await result.text();

            expect(text).toBe('ok');
        });

        it('retries on network error and succeeds', async () => {
            expect.hasAssertions();

            mockFetch.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(mockOkResponse('ok'));
            const result = await fetchWithRetry('https://api.test.com', {}, 2);

            expect(result.ok).toBeTruthy();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('retries on HTTP 429 and succeeds', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockErrorResponse(429)).mockResolvedValueOnce(mockOkResponse('ok'));
            const result = await fetchWithRetry('https://api.test.com', {}, 2);

            expect(result.ok).toBeTruthy();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('retries on HTTP 500 and succeeds', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockErrorResponse(500)).mockResolvedValueOnce(mockOkResponse('ok'));
            const result = await fetchWithRetry('https://api.test.com', {}, 2);

            expect(result.ok).toBeTruthy();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('throws after max retries exhausted', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValue(mockErrorResponse(500));

            await expect(fetchWithRetry('https://api.test.com', {}, 1)).rejects.toThrow('LLM API error: HTTP 500');
        });

        it('throws immediately on HTTP 400 (non-retryable)', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockErrorResponse(400));

            await expect(fetchWithRetry('https://api.test.com', {}, 3)).rejects.toThrow('LLM API error: HTTP 400');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('SendToProvider', () => {
        beforeEach(() => {
            vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
                cb();
                return {} as NodeJS.Timeout;
            }) as typeof global.setTimeout);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('sends to OpenAI provider and returns content', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'success' } }] })),
            );
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };
            const result = await sendToProvider(cfg, 'system', 'user');

            expect(result).toBe('success');
        });

        it('sends to Gemini provider and returns content', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(
                    JSON.stringify({
                        candidates: [{ content: { parts: [{ text: 'gemini success' }] } }],
                    }),
                ),
            );
            const cfg = {
                apiKey: 'AIza-test',
                model: 'gemini-pro',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                format: 'gemini' as const,
                temperature: 0.2,
            };
            const result = await sendToProvider(cfg, 'system', 'user');

            expect(result).toBe('gemini success');
        });

        it('sends to Anthropic provider and returns content', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(
                    JSON.stringify({
                        content: [{ type: 'text', text: 'anthropic response' }],
                    }),
                ),
            );
            const cfg = {
                apiKey: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514',
                baseUrl: 'https://api.anthropic.com/v1',
                format: 'anthropic' as const,
                temperature: 0.3,
            };
            const result = await sendToProvider(cfg, 'system', 'user');

            expect(result).toBe('anthropic response');
        });

        it('throws LlmAuthError when API key is empty', async () => {
            expect.hasAssertions();

            const cfg = {
                apiKey: '',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };

            await expect(sendToProvider(cfg, 'system', 'user')).rejects.toThrow(LlmAuthError);
        });

        it('returns empty string for non-JSON 200 response', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockOkResponse('not json'));
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };
            const result = await sendToProvider(cfg, 'system', 'user');

            expect(result).toBe('');
        });

        it('throws on error payload in response', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ error: { message: 'rate limited', type: 'rate_limit_error' } })),
            );
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };

            await expect(sendToProvider(cfg, 'system', 'user')).rejects.toThrow('LLM API error: rate limited');
        });

        it('throws on string error payload', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(mockOkResponse(JSON.stringify({ error: 'internal server error' })));
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };

            await expect(sendToProvider(cfg, 'system', 'user')).rejects.toThrow('LLM API error: internal server error');
        });

        it('calls checkCircuitBreaker', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
            );
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };
            await sendToProvider(cfg, 'system', 'user');

            expect(checkCircuitBreaker).toHaveBeenCalledWith('sk-test@gpt-4@https://api.test.com/v1');
        });

        it('tracks usage metrics', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(
                    JSON.stringify({
                        choices: [{ message: { content: 'ok' } }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                ),
            );
            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };
            await sendToProvider(cfg, 'system', 'user');
            const metrics = getLlmClientMetrics();

            expect(metrics.totalPromptTokens).toBe(10);
            expect(metrics.totalCompletionTokens).toBe(5);
        });

        it('records per-model latency via recordModelLatency', async () => {
            expect.hasAssertions();

            mockFetch.mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
            );

            const { getDefaultMetrics } = await import('./llm-metrics.js');
            const latencySpy = vi.spyOn(getDefaultMetrics(), 'recordModelLatency');

            const cfg = {
                apiKey: 'sk-test',
                model: 'gpt-4',
                baseUrl: 'https://api.test.com/v1',
                format: 'openai' as const,
                temperature: 0.3,
            };
            await sendToProvider(cfg, 'system', 'user');

            expect(latencySpy).toHaveBeenCalledTimes(1);
            expect(latencySpy).toHaveBeenCalledWith('gpt-4', expect.any(Number));

            latencySpy.mockRestore();
        });
    });
});
