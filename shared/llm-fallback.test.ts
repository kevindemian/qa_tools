vi.mock('./config', async () => {
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
            get llmSmallApiKey() {
                return mockConfig['llmSmallApiKey'] ?? '';
            },
            get llmSmallModel() {
                return mockConfig['llmSmallModel'] ?? 'gemini-2.0-flash-lite';
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
                return mockConfig['llmFallbackModel'] ?? 'llama3';
            },
            get llmFallbackBaseUrl() {
                return mockConfig['llmFallbackBaseUrl'] ?? 'https://nv.api.com/v1';
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
vi.mock('./llm-rate-limiter', async () => {
    const original = await vi.importActual<typeof import('./llm-rate-limiter.js')>('./llm-rate-limiter');
    return {
        ...original,
        checkRateLimit: vi.fn(),
    };
});
vi.mock('./circuit-breaker', async () => ({
    checkCircuitBreaker: vi.fn(),
    recordCircuitFailure: vi.fn(),
    recordCircuitSuccess: vi.fn(),
}));
vi.mock('./sanitize', async () => ({
    sanitizeForLlm: vi.fn((s: string) => s),
}));

import { checkRateLimit } from './llm-rate-limiter.js';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker.js';
import Config from './config.js';
import {
    tierToConfig,
    parseRawOnce,
    parseRetryAfter,
    sendWithFallback,
    _estimateInputTokens,
    getLlmClientMetrics,
    resetLlmClientMetrics,
} from './llm-fallback.js';

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

beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    Config.reset();
    resetLlmClientMetrics();
    vi.mocked(checkRateLimit).mockImplementation(() => {});
    vi.mocked(checkCircuitBreaker).mockImplementation(() => {});
});

describe('tierToConfig', async () => {
    it('returns main config for main tier', async () => {
        Config.set('llmApiKey', 'sk-main');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        const cfg = tierToConfig('main');
        expect(cfg.apiKey).toBe('sk-main');
        expect(cfg.model).toBe('gpt-4');
        expect(cfg.format).toBe('openai');
    });

    it('returns fast tier config', async () => {
        Config.set('llmFastApiKey', 'gsk-fast');
        Config.set('llmFastModel', 'llama3');
        const cfg = tierToConfig('fast');
        expect(cfg.apiKey).toBe('gsk-fast');
        expect(cfg.model).toBe('llama3');
        expect(cfg.format).toBe('openai');
    });

    it('returns reviewer tier config with gemini format', async () => {
        Config.set('llmReviewApiKey', 'AIza-review');
        Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
        const cfg = tierToConfig('reviewer');
        expect(cfg.apiKey).toBe('AIza-review');
        expect(cfg.model).toBe('gemini-2.0-flash-exp');
        expect(cfg.format).toBe('gemini');
    });

    it('returns report tier config with json responseFormat', async () => {
        Config.set('llmApiKey', 'sk-report');
        Config.set('llmModel', 'gpt-4-report');
        const cfg = tierToConfig('report');
        expect(cfg.apiKey).toBe('sk-report');
        expect(cfg.responseFormat).toBe('json');
    });

    it('falls back to main when tier is unknown', async () => {
        Config.set('llmApiKey', 'sk-main');
        const cfg = (tierToConfig as (tier: string) => ReturnType<typeof tierToConfig>)('nonexistent');
        expect(cfg.apiKey).toBe('sk-main');
    });
});

describe('parseRawOnce', async () => {
    it('parses valid JSON string', async () => {
        const result = parseRawOnce('{"key": "value"}');
        expect(result).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', async () => {
        const result = parseRawOnce('not json');
        expect(result).toBeNull();
    });

    it('returns null for empty string', async () => {
        const result = parseRawOnce('');
        expect(result).toBeNull();
    });
});

describe('parseRetryAfter', async () => {
    function mockResponseWithHeader(key: string, value: string | null): Response {
        const r = new Response('', { status: 429 });
        vi.spyOn(r, 'text').mockResolvedValue('');
        vi.spyOn(r.headers, 'get').mockImplementation((k: string) => (k === key ? value : null));
        return r;
    }

    it('parses seconds from Retry-After header', async () => {
        const resp = mockResponseWithHeader('Retry-After', '30');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(10000);
    });

    it('returns default when no Retry-After header', async () => {
        const resp = mockResponseWithHeader('Retry-After', null);
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(2000);
    });

    it('returns default for invalid Retry-After value', async () => {
        const resp = mockResponseWithHeader('Retry-After', 'invalid');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(2000);
    });

    it('caps at LLM_RETRY_MAX_WAIT_MS (10000)', async () => {
        const resp = mockResponseWithHeader('Retry-After', '999');
        const result = parseRetryAfter(resp, 2000);
        expect(result).toBe(10000);
    });
});

describe('_estimateInputTokens', async () => {
    it('estimates token count as ceil((sys + user) / 4)', async () => {
        const result = _estimateInputTokens('abcd', 'efgh');
        expect(result).toBe(2);
    });

    it('returns 0 for empty strings', async () => {
        const result = _estimateInputTokens('', '');
        expect(result).toBe(0);
    });

    it('rounds up fractional estimates', async () => {
        const result = _estimateInputTokens('a', '');
        expect(result).toBe(1);
    });
});

describe('getLlmClientMetrics / resetLlmClientMetrics', async () => {
    it('returns initial zero metrics', async () => {
        const metrics = getLlmClientMetrics();
        expect(metrics.cacheHits).toBe(0);
        expect(metrics.cacheMisses).toBe(0);
        expect(metrics.totalPromptTokens).toBe(0);
        expect(metrics.totalCompletionTokens).toBe(0);
    });

    it('resets metrics to zero', async () => {
        const metrics = getLlmClientMetrics();
        metrics.cacheHits = 10;
        metrics.cacheMisses = 5;
        resetLlmClientMetrics();
        const reset = getLlmClientMetrics();
        expect(reset.cacheHits).toBe(0);
        expect(reset.cacheMisses).toBe(0);
    });
});

describe('sendWithFallback', async () => {
    beforeEach(async () => {
        vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            cb();
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
    });

    it('sends to primary provider and returns response', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        mockFetch.mockResolvedValueOnce(
            mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'success' } }] })),
        );

        const result = await sendWithFallback('main', 'system', 'user');
        expect(result).toBe('success');
        expect(recordCircuitSuccess).toHaveBeenCalled();
    });

    it('falls back to next provider when primary fails', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        Config.set('llmFallbackApiKey', 'nv-test');
        Config.set('llmFallbackModel', 'llama3');
        Config.set('llmFallbackBaseUrl', 'https://nv.api.com/v1');
        Config.set('llmBatchApiKey', 'gh-test');
        Config.set('llmBatchModel', 'gpt4o-mini');
        Config.set('llmBatchBaseUrl', 'https://models.inference.ai.azure.com');

        mockFetch
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(mockErrorResponse(500))
            .mockResolvedValueOnce(
                mockOkResponse(JSON.stringify({ choices: [{ message: { content: 'fallback ok' } }] })),
            );

        const result = await sendWithFallback('main', 'system', 'user');
        expect(result).toBe('fallback ok');
        expect(recordCircuitFailure).toHaveBeenCalled();
    });

    it('throws when all providers are exhausted', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        mockFetch.mockResolvedValue(mockErrorResponse(500));

        await expect(sendWithFallback('main', 'system', 'user')).rejects.toThrow('All LLM providers failed');
    });

    it('aggregates error when API key is missing for all providers', async () => {
        Config.set('llmApiKey', '');
        await expect(sendWithFallback('main', 'system', 'user')).rejects.toThrow('All LLM providers failed');
    });

    it('aggregates error messages from all providers', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        mockFetch.mockResolvedValue(mockErrorResponse(500));

        try {
            await sendWithFallback('main', 'system', 'user');
            expect.unreachable('Expected error');
        } catch (err) {
            const msg = (err as Error).message;
            expect(msg).toContain('All LLM providers failed');
        }
    });

    it('applies responseFormat to all candidates', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        mockFetch.mockResolvedValueOnce(
            mockOkResponse(JSON.stringify({ choices: [{ message: { content: '{"key":"val"}' } }] })),
        );

        const result = await sendWithFallback('main', 'system', 'user', 'json');
        expect(result).toBe('{"key":"val"}');
    });

    it('deduplicates fallback provider with same config key as primary', async () => {
        Config.set('llmApiKey', 'sk-test');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        Config.set('llmFallbackApiKey', 'sk-test');
        Config.set('llmFallbackModel', 'gpt-4');
        Config.set('llmFallbackBaseUrl', 'https://api.test.com/v1');
        Config.set('llmBatchApiKey', 'sk-test');
        Config.set('llmBatchModel', 'gpt-4');
        Config.set('llmBatchBaseUrl', 'https://api.test.com/v1');

        mockFetch.mockResolvedValue(mockErrorResponse(500));

        await expect(sendWithFallback('main', 'system', 'user')).rejects.toThrow('All LLM providers failed');
        expect(mockFetch).toHaveBeenCalledTimes(6);
    });
});
