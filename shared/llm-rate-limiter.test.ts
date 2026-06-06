vi.mock('./config', () => {
    const mockConfig: Record<string, string> = {};
    return {
        __esModule: true,
        default: {
            get llmApiKey() {
                return mockConfig['llmApiKey'] ?? '';
            },
            get(key: string) {
                return mockConfig[key] ?? undefined;
            },
            set(key: string, value: string) {
                mockConfig[key] = value;
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

import Config from './config.js';
import { checkRateLimit, resetRateLimiter, jitter, LLM_RATE_WINDOW_MS } from './llm-rate-limiter.js';
import { LlmRateLimitError } from './errors.js';

beforeEach(() => {
    Config.reset();
    resetRateLimiter();
});

describe('jitter', () => {
    it('returns 0 when waitMs is 0', async () => {
        expect(jitter(0)).toBe(0);
    });

    it('returns a value between 0 and waitMs', async () => {
        for (let i = 0; i < 50; i++) {
            const result = jitter(1000);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(1000);
        }
    });

    it('returns an integer value', async () => {
        const result = jitter(500);
        expect(Number.isInteger(result)).toBe(true);
    });
});

describe('checkRateLimit', () => {
    it('allows requests within limit', async () => {
        Config.set('LLM_RATE_LIMIT', '5');
        expect(() => checkRateLimit('main')).not.toThrow();
        expect(() => checkRateLimit('main')).not.toThrow();
    });

    it('throws when rate limit exceeded', async () => {
        Config.set('LLM_RATE_LIMIT', '2');
        resetRateLimiter();
        checkRateLimit('main');
        checkRateLimit('main');
        expect(() => checkRateLimit('main')).toThrow(LlmRateLimitError);
    });

    it('uses default limit of 30 when env not set', async () => {
        for (let i = 0; i < 30; i++) {
            expect(() => checkRateLimit('main')).not.toThrow();
        }
        expect(() => checkRateLimit('main')).toThrow(LlmRateLimitError);
    });

    it('recovers after rate limit window passes', async () => {
        vi.useFakeTimers();
        Config.set('LLM_RATE_LIMIT', '1');
        resetRateLimiter();
        checkRateLimit('main');
        expect(() => checkRateLimit('main')).toThrow(LlmRateLimitError);
        vi.advanceTimersByTime(LLM_RATE_WINDOW_MS + 1000);
        expect(() => checkRateLimit('main')).not.toThrow();
        vi.useRealTimers();
    });

    it('enforces tier-specific limits independently', async () => {
        Config.set('LLM_RATE_LIMIT', '1');
        resetRateLimiter();
        checkRateLimit('main');
        expect(() => checkRateLimit('main')).toThrow(LlmRateLimitError);
        expect(() => checkRateLimit('fast')).not.toThrow();
    });

    it('throws error message containing tier name and limit', async () => {
        Config.set('LLM_RATE_LIMIT', '1');
        resetRateLimiter();
        checkRateLimit('reviewer');
        expect(() => checkRateLimit('reviewer')).toThrow(/tier.*reviewer/);
    });
});

describe('resetRateLimiter', () => {
    it('resets the rate limiter state', async () => {
        Config.set('LLM_RATE_LIMIT', '1');
        resetRateLimiter();
        checkRateLimit('main');
        expect(() => checkRateLimit('main')).toThrow(LlmRateLimitError);
        resetRateLimiter();
        expect(() => checkRateLimit('main')).not.toThrow();
    });
});
