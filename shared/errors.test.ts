import { LlmError, LlmRateLimitError, LlmProviderError, LlmTimeoutError, LlmAuthError } from './errors.js';

describe('typed LLM errors', () => {
    it('LlmError has the correct name', async () => {
        const err = new LlmError('generic');
        expect(err.name).toBe('LlmError');
        expect(err.message).toBe('generic');
        expect(err).toBeInstanceOf(Error);
    });

    it('LlmRateLimitError is an instance of LlmError', async () => {
        const err = new LlmRateLimitError('rate limited');
        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmRateLimitError');
    });

    it('LlmProviderError is an instance of LlmError', async () => {
        const err = new LlmProviderError('provider failed');
        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmProviderError');
    });

    it('LlmTimeoutError is an instance of LlmError', async () => {
        const err = new LlmTimeoutError('timed out');
        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmTimeoutError');
    });

    it('LlmAuthError is an instance of LlmError', async () => {
        const err = new LlmAuthError('auth failure');
        expect(err).toBeInstanceOf(LlmError);
        expect(err.name).toBe('LlmAuthError');
    });

    it('can be caught with instanceof LlmError', async () => {
        const fn = (): never => {
            throw new LlmProviderError('fail');
        };
        expect(() => fn()).toThrow(LlmError);
    });

    it('can distinguish between error types', async () => {
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
