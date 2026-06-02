jest.mock('./config', () => {
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
                mockConfig[key] = value;
            },
            get(key: string) {
                return mockConfig[key] ?? undefined;
            },
            resetInstance() {
                Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
            },
            reset() {
                Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
            },
        },
    };
});
jest.mock('./llm-rate-limiter', () => {
    const original = jest.requireActual<typeof import('./llm-rate-limiter')>('./llm-rate-limiter');
    return {
        ...original,
        checkRateLimit: jest.fn(),
    };
});
jest.mock('./circuit-breaker', () => ({
    checkCircuitBreaker: jest.fn(),
    recordCircuitFailure: jest.fn(),
    recordCircuitSuccess: jest.fn(),
}));
jest.mock('./sanitize', () => ({
    sanitizeForLlm: jest.fn((s: string) => s),
}));
jest.mock('./llm-cache', () => ({
    configUniqueKey: jest.fn(
        (cfg: { apiKey: string; model: string; baseUrl: string }) => cfg.apiKey + '@' + cfg.model + '@' + cfg.baseUrl,
    ),
}));

import { checkCircuitBreaker } from './circuit-breaker';
import Config from './config';
import {
    parseRawOnce,
    parseRetryAfter,
    buildOpenAiPayload,
    buildGeminiPayload,
    fetchWithRetry,
    sendToProvider,
} from './llm-fallback-http';
import { resetLlmClientMetrics, getLlmClientMetrics } from './llm-fallback-config';
import { LlmAuthError } from './errors';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOkResponse(body: string): Response {
    const r = new Response(body, { status: 200 });
    jest.spyOn(r, 'text').mockResolvedValue(body);
    jest.spyOn(r.headers, 'get').mockReturnValue(null);
    return r;
}

function mockErrorResponse(status: number): Response {
    const r = new Response('error', { status });
    jest.spyOn(r, 'text').mockResolvedValue('error');
    jest.spyOn(r.headers, 'get').mockReturnValue(null);
    return r;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    Config.reset();
    resetLlmClientMetrics();
    Config.set('llmApiKey', 'sk-test');
    Config.set('llmModel', 'gpt-4');
    Config.set('llmBaseUrl', 'https://api.test.com/v1');
    jest.mocked(checkCircuitBreaker).mockImplementation(() => {});
});

describe('parseRawOnce', () => {
    it('parses valid JSON string', () => {
        const result = parseRawOnce('{"key": "value"}');
        expect(result).toEqual({ key: 'value' });
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

describe('parseRetryAfter', () => {
    function mockResponseWithHeader(key: string, value: string | null): Response {
        const r = new Response('', { status: 429 });
        jest.spyOn(r, 'text').mockResolvedValue('');
        jest.spyOn(r.headers, 'get').mockImplementation((k: string) => (k === key ? value : null));
        return r;
    }

    it('parses seconds from Retry-After header', () => {
        const resp = mockResponseWithHeader('Retry-After', '30');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(10000);
    });

    it('returns default when no Retry-After header', () => {
        const resp = mockResponseWithHeader('Retry-After', null);
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(2000);
    });

    it('returns default for invalid Retry-After value', () => {
        const resp = mockResponseWithHeader('Retry-After', 'invalid');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(2000);
    });

    it('caps at 10000ms', () => {
        const resp = mockResponseWithHeader('Retry-After', '999');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(10000);
    });
});

interface OpenAiPayload {
    model: string;
    temperature: number;
    messages: Array<{ role: string; content: string }>;
    response_format?: { type: string };
}

describe('buildOpenAiPayload', () => {
    it('builds a valid JSON payload', () => {
        const result = buildOpenAiPayload('sys', 'usr', 'gpt-4', 0.5);
        const parsed = JSON.parse(result) as OpenAiPayload;
        expect(parsed.model).toBe('gpt-4');
        expect(parsed.temperature).toBe(0.5);
        expect(parsed.messages).toHaveLength(2);
        expect(parsed.messages[0].role).toBe('system');
        expect(parsed.messages[0].content).toBe('sys');
        expect(parsed.messages[1].role).toBe('user');
        expect(parsed.messages[1].content).toBe('usr');
    });

    it('uses default temperature when not provided', () => {
        const result = buildOpenAiPayload('sys', 'usr', 'gpt-4');
        const parsed = JSON.parse(result) as OpenAiPayload;
        expect(parsed.temperature).toBe(0.3);
    });

    it('includes response_format when format is json', () => {
        const result = buildOpenAiPayload('sys', 'usr', 'gpt-4', 0.3, 'json');
        const parsed = JSON.parse(result) as OpenAiPayload;
        expect(parsed.response_format).toEqual({ type: 'json_object' });
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

describe('buildGeminiPayload', () => {
    it('builds a valid Gemini JSON payload', () => {
        const result = buildGeminiPayload('sys', 'usr');
        const parsed = JSON.parse(result) as GeminiPayload;
        expect(parsed.system_instruction.parts[0].text).toBe('sys');
        expect(parsed.contents[0].role).toBe('user');
        expect(parsed.contents[0].parts[0].text).toBe('usr');
    });
});

describe('fetchWithRetry', () => {
    beforeEach(() => {
        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns response on successful fetch', async () => {
        mockFetch.mockResolvedValueOnce(mockOkResponse('ok'));
        const result = await fetchWithRetry('https://api.test.com', {});
        expect(result.ok).toBe(true);
        const text = await result.text();
        expect(text).toBe('ok');
    });

    it('retries on network error and succeeds', async () => {
        mockFetch.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(mockOkResponse('ok'));
        const result = await fetchWithRetry('https://api.test.com', {}, 2);
        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on HTTP 429 and succeeds', async () => {
        mockFetch.mockResolvedValueOnce(mockErrorResponse(429)).mockResolvedValueOnce(mockOkResponse('ok'));
        const result = await fetchWithRetry('https://api.test.com', {}, 2);
        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on HTTP 500 and succeeds', async () => {
        mockFetch.mockResolvedValueOnce(mockErrorResponse(500)).mockResolvedValueOnce(mockOkResponse('ok'));
        const result = await fetchWithRetry('https://api.test.com', {}, 2);
        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries exhausted', async () => {
        mockFetch.mockResolvedValue(mockErrorResponse(500));
        await expect(fetchWithRetry('https://api.test.com', {}, 1)).rejects.toThrow('LLM API error: HTTP 500');
    });

    it('throws immediately on HTTP 400 (non-retryable)', async () => {
        mockFetch.mockResolvedValueOnce(mockErrorResponse(400));
        await expect(fetchWithRetry('https://api.test.com', {}, 3)).rejects.toThrow('LLM API error: HTTP 400');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

describe('sendToProvider', () => {
    beforeEach(() => {
        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sends to OpenAI provider and returns content', async () => {
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

    it('throws LlmAuthError when API key is empty', async () => {
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
        mockFetch.mockResolvedValueOnce(mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
        const cfg = {
            apiKey: 'sk-test',
            model: 'gpt-4',
            baseUrl: 'https://api.test.com/v1',
            format: 'openai' as const,
            temperature: 0.3,
        };
        await sendToProvider(cfg, 'system', 'user');
        expect(checkCircuitBreaker).toHaveBeenCalled();
    });

    it('tracks usage metrics', async () => {
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
});
