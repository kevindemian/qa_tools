import { handleError } from '../ci/git-provider-error.js';
import { humanizeError } from '../ui/prompt-errors.js';

vi.mock('../logger', () => ({ rootLogger: { error: vi.fn() } }));

describe('HandleError', () => {
    it('throws the error by default', () => {
        const err = new Error('connection failed');

        expect(() => handleError(err)).toThrow('connection failed');
    });

    it('throws with context prefix', () => {
        const err = new Error('timeout');

        expect(() => handleError(err, { context: 'fetch branch' })).toThrow('timeout');
    });

    it('throws and humanizes a not-found error', () => {
        const err = new Error('project not found');

        expect(() => handleError(err)).toThrow('project not found');
        expect(humanizeError('project not found')?.msg).toBe('Projeto não encontrado');
    });

    it('throws and humanizes a rate-limited error with context', () => {
        const err = new Error('rate limit too many requests');

        expect(() => handleError(err, { context: 'API call' })).toThrow('rate limit too many requests');
        expect(humanizeError('rate limit too many requests')?.msg).toBe('Rate limit atingido');
    });

    it('handles string error', () => {
        const err = new Error('ECONNRESET connection lost');

        expect(() => handleError(err)).toThrow('ECONNRESET connection lost');
        expect(humanizeError('ECONNRESET connection lost')?.msg).toBe('Erro de conexão');
    });

    it('humanizes a connection error', () => {
        const err = new Error('ECONNRESET connection lost');

        expect(() => handleError(err, { context: 'fetch' })).toThrow('ECONNRESET connection lost');
        expect(humanizeError('ECONNRESET connection lost')?.msg).toBe('Erro de conexão');
    });
});
