import { LlmError, LlmRateLimitError, LlmProviderError, LlmTimeoutError, LlmAuthError } from './errors.js';

describe('typed LLM errors', () => {
    it('llmError has the correct name', () => {
        const err = new LlmError('generic');

        expect(err.name).toBe('LlmError');
        expect(err.message).toBe('generic');
        expect(err).toBeInstanceOf(Error);
    });

    it('llmRateLimitError is an instance of LlmError', () => {
        const err = new LlmRateLimitError('rate limited');

        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmRateLimitError');
    });

    it('llmProviderError is an instance of LlmError', () => {
        const err = new LlmProviderError('provider failed');

        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmProviderError');
    });

    it('llmTimeoutError is an instance of LlmError', () => {
        const err = new LlmTimeoutError('timed out');

        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmTimeoutError');
    });

    it('llmAuthError is an instance of LlmError', () => {
        const err = new LlmAuthError('auth failure');

        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmAuthError');
    });

    it('can be caught with instanceof LlmError', () => {
        const fn = (): never => {
            throw new LlmProviderError('fail');
        };

        expect(() => fn()).toThrow(LlmError);
    });

    it('can distinguish between error types', () => {
        const fn = (type: string): never => {
            if (type === 'rate') throw new LlmRateLimitError('rate');
            if (type === 'auth') throw new LlmAuthError('auth');
            throw new LlmProviderError('provider');
        };

        expect(() => fn('rate')).toThrow(LlmRateLimitError);
        expect(() => fn('auth')).toThrow(LlmAuthError);
        expect(() => fn('provider')).toThrow(LlmProviderError);
    });
});
