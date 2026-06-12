vi.mock('./config', () => {
    const mockConfig: Record<string, string> = {};
    return {
        __esModule: true,
        default: {
            get llmProvider() {
                return mockConfig['llmProvider'] ?? '';
            },
            get llmApiKey() {
                return mockConfig['llmApiKey'] ?? '';
            },
            get llmModel() {
                return mockConfig['llmModel'] ?? 'gpt-4';
            },
            get llmBaseUrl() {
                return mockConfig['llmBaseUrl'] ?? 'https://api.test.com/v1';
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

import {
    tierToConfig,
    getLlmClientMetrics,
    resetLlmClientMetrics,
    _trackUsage,
    extractContent,
    _llmMetrics,
    getFetchRetries,
    LLM_TEMP_DEFAULT,
    LLM_RETRY_BASE_WAIT_MS,
    LLM_RETRY_MAX_WAIT_MS,
    LLM_FETCH_TIMEOUT_MS,
    LLM_ERROR_BODY_TRUNCATION,
    LlmErrorPayloadSchema,
    estimateCostUSD,
} from './llm-fallback-config.js';
import Config from './config.js';

beforeEach(() => {
    Config.reset();
    resetLlmClientMetrics();
});

describe('tierToConfig', () => {
    it('returns main config for main tier (explicit)', () => {
        Config.set('llmApiKey', 'sk-main');
        Config.set('llmModel', 'gpt-4');
        Config.set('llmBaseUrl', 'https://api.test.com/v1');
        const cfg = tierToConfig('main');
        expect(cfg.apiKey).toBe('sk-main');
        expect(cfg.model).toBe('gpt-4');
        expect(cfg.format).toBe('openai');
    });

    it('returns fast tier config (explicit)', () => {
        Config.set('llmFastApiKey', 'gsk-fast');
        Config.set('llmFastModel', 'llama3');
        const cfg = tierToConfig('fast');
        expect(cfg.apiKey).toBe('gsk-fast');
        expect(cfg.model).toBe('llama3');
        expect(cfg.format).toBe('openai');
    });

    it('returns reviewer tier config with gemini format (explicit)', () => {
        Config.set('llmReviewApiKey', 'AIza-review');
        Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
        const cfg = tierToConfig('reviewer');
        expect(cfg.apiKey).toBe('AIza-review');
        expect(cfg.model).toBe('gemini-2.0-flash-exp');
        expect(cfg.format).toBe('gemini');
    });

    it('returns report tier config with json responseFormat (explicit)', () => {
        Config.set('llmApiKey', 'sk-report');
        Config.set('llmModel', 'gpt-4');
        const cfg = tierToConfig('report');
        expect(cfg.responseFormat).toBe('json');
    });

    it('resolves from LLM_PROVIDER profile when no explicit tier key', () => {
        Config.set('llmProvider', 'openai');
        Config.set('llmApiKey', 'sk-test');
        const cfg = tierToConfig('main');
        expect(cfg.apiKey).toBe('sk-test');
        expect(cfg.model).toBe('gpt-4o');
        expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
        expect(cfg.format).toBe('openai');
    });

    it('auto-detects provider from key pattern', () => {
        Config.set('llmApiKey', 'sk-or-v1-test123');
        const cfg = tierToConfig('main');
        expect(cfg.apiKey).toBe('sk-or-v1-test123');
        expect(cfg.model).toBe('google/gemini-2.0-flash-exp');
        expect(cfg.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('uses OpenRouter tier defaults when detected', () => {
        Config.set('llmApiKey', 'sk-or-v1-test');
        const fastCfg = tierToConfig('fast');
        expect(fastCfg.model).toBe('meta-llama/llama-3.1-8b-instruct');
    });

    it('defaults to opencode-go when no config set', () => {
        const cfg = tierToConfig('main');
        expect(cfg.baseUrl).toContain('opencode.ai');
        expect(cfg.model).toBe('deepseek-v4-pro');
    });
});

describe('getLlmClientMetrics / resetLlmClientMetrics', () => {
    it('returns initial zero metrics', () => {
        const metrics = getLlmClientMetrics();
        expect(metrics.cacheHits).toBe(0);
        expect(metrics.cacheMisses).toBe(0);
        expect(metrics.totalPromptTokens).toBe(0);
        expect(metrics.totalCompletionTokens).toBe(0);
    });

    it('resets metrics to zero', () => {
        _llmMetrics.cacheHits = 10;
        _llmMetrics.cacheMisses = 5;
        resetLlmClientMetrics();
        const reset = getLlmClientMetrics();
        expect(reset.cacheHits).toBe(0);
        expect(reset.cacheMisses).toBe(0);
    });
});

describe('getFetchRetries', () => {
    it('returns default 3 when not configured', () => {
        const result = getFetchRetries();
        expect(result).toBe(3);
    });

    it('parses LLM_FETCH_RETRIES from Config', () => {
        Config.set('LLM_FETCH_RETRIES', '5');
        const result = getFetchRetries();
        expect(result).toBe(5);
    });
});

describe('_trackUsage', () => {
    beforeEach(() => {
        resetLlmClientMetrics();
    });

    it('tracks OpenAI-style usage and updates metrics', () => {
        const data = {
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
        _trackUsage(data, 'test-provider', 'main');
        const metrics = getLlmClientMetrics();
        expect(metrics.totalPromptTokens).toBe(10);
        expect(metrics.totalCompletionTokens).toBe(20);
        expect(metrics.totalCostUSD).toBeGreaterThan(0);
        expect(metrics.requestsByProviderKey['test-provider']).toBe(1);
    });

    it('tracks Gemini-style usage metadata', () => {
        const data = {
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 15, totalTokenCount: 20 },
        };
        _trackUsage(data, 'gemini-provider', 'reviewer');
        const metrics = getLlmClientMetrics();
        expect(metrics.totalPromptTokens).toBe(5);
        expect(metrics.totalCompletionTokens).toBe(15);
        expect(metrics.totalCostUSD).toBeGreaterThan(0);
    });

    it('counts multiple requests to same provider with cost accumulation', () => {
        _trackUsage({ usage: { prompt_tokens: 1, completion_tokens: 2 } }, 'same', 'main');
        _trackUsage({ usage: { prompt_tokens: 3, completion_tokens: 4 } }, 'same', 'main');
        expect(_llmMetrics.requestsByProviderKey['same']).toBe(2);
        expect(_llmMetrics.totalPromptTokens).toBe(4);
        expect(_llmMetrics.totalCompletionTokens).toBe(6);
        expect(_llmMetrics.totalCostUSD).toBeGreaterThan(0);
    });

    it('tracks cost per tier separately', () => {
        _trackUsage({ usage: { prompt_tokens: 1000, completion_tokens: 500 } }, 'p1', 'main');
        _trackUsage({ usage: { prompt_tokens: 2000, completion_tokens: 1000 } }, 'p2', 'reviewer');
        expect(_llmMetrics.costPerTier['main']).toBeGreaterThan(0);
        expect(_llmMetrics.costPerTier['reviewer']).toBeGreaterThan(0);
        expect(_llmMetrics.totalCostUSD).toBeGreaterThan(0);
    });
});

describe('extractContent', () => {
    it('extracts text from OpenAI-style response', () => {
        const data = {
            choices: [{ message: { content: 'hello world' } }],
        };
        const result = extractContent(data, 'openai');
        expect(result).toBe('hello world');
    });

    it('extracts text from Gemini-style response', () => {
        const data = {
            candidates: [{ content: { parts: [{ text: 'gemini response' }] } }],
        };
        const result = extractContent(data, 'gemini');
        expect(result).toBe('gemini response');
    });

    it('returns empty string for empty OpenAI response', () => {
        const data = { choices: [{ message: { content: '' } }] };
        const result = extractContent(data, 'openai');
        expect(result).toBe('');
    });

    it('returns empty string for missing content in Gemini', () => {
        const data = { candidates: [{}] };
        const result = extractContent(data, 'gemini');
        expect(result).toBe('');
    });

    it('extracts text from Anthropic-style response', () => {
        const data = {
            content: [{ type: 'text', text: 'hello from claude' }],
        };
        const result = extractContent(data, 'anthropic');
        expect(result).toBe('hello from claude');
    });

    it('concatenates multiple Anthropic content blocks', () => {
        const data = {
            content: [
                { type: 'text', text: 'part1' },
                { type: 'text', text: 'part2' },
            ],
        };
        const result = extractContent(data, 'anthropic');
        expect(result).toBe('part1part2');
    });

    it('returns empty string for empty Anthropic content array', () => {
        const data = { content: [] };
        const result = extractContent(data, 'anthropic');
        expect(result).toBe('');
    });
});

describe('constants', () => {
    it('exports LLM_TEMP_DEFAULT', () => {
        expect(LLM_TEMP_DEFAULT).toBe(0.3);
    });

    it('exports retry constants', () => {
        expect(LLM_RETRY_BASE_WAIT_MS).toBe(2000);
        expect(LLM_RETRY_MAX_WAIT_MS).toBe(10000);
        expect(LLM_FETCH_TIMEOUT_MS).toBe(30000);
        expect(LLM_ERROR_BODY_TRUNCATION).toBe(200);
    });
});

describe('LlmErrorPayloadSchema', () => {
    it('parses a valid error payload', () => {
        const result = LlmErrorPayloadSchema.safeParse({
            message: 'rate limit',
            type: 'rate_limit_error',
            code: '429',
        });
        expect(result.success).toBe(true);
    });

    it('accepts empty error payload', () => {
        const result = LlmErrorPayloadSchema.safeParse({});
        expect(result.success).toBe(true);
    });
});

describe('estimateCostUSD', () => {
    it('calculates cost for known model', () => {
        const cost = estimateCostUSD('google/gemini-2.0-flash-exp', 1000, 500);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeLessThan(0.01);
    });

    it('falls back to default pricing for unknown model', () => {
        const cost = estimateCostUSD('nonexistent-model', 1000, 500);
        expect(cost).toBeGreaterThan(0);
    });

    it('handles zero tokens', () => {
        const cost = estimateCostUSD('google/gemini-2.0-flash-exp', 0, 0);
        expect(cost).toBe(0);
    });

    it('pricing is proportional to token count', () => {
        const small = estimateCostUSD('google/gemini-2.0-flash-exp', 1000, 500);
        const large = estimateCostUSD('google/gemini-2.0-flash-exp', 2000, 1000);
        expect(large).toBeCloseTo(small * 2, 5);
    });
});
