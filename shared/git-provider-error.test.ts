import { handleError } from './git-provider-error.js';

vi.mock('./logger', async () => ({ rootLogger: { error: vi.fn() } }));

describe('handleError', () => {
    it('throws the error by default', async () => {
        const err = new Error('connection failed');
        expect(() => handleError(err)).toThrow('connection failed');
    });

    it('throws with context prefix', async () => {
        const err = new Error('timeout');
        expect(() => handleError(err, { context: 'fetch branch' })).toThrow('timeout');
    });

    it('returns null when returnNull is true', async () => {
        const err = new Error('not found');
        const result = handleError(err, { returnNull: true });
        expect(result).toBeNull();
    });

    it('returns null with context when returnNull is true', async () => {
        const err = new Error('rate limited');
        const result = handleError(err, { returnNull: true, context: 'API call' });
        expect(result).toBeNull();
    });

    it('handles string error', async () => {
        expect(() => handleError('fail')).toThrow('fail');
    });

    it('handles string error with returnNull', async () => {
        const result = handleError('fail', { returnNull: true });
        expect(result).toBeNull();
    });
});
