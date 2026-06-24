/** Tests for safeParseJson — parses JSON safely with fallback. */
import { undefinedAs } from './test-utils.js';
import { safeParseJson } from './safe-json.js';

describe('safeParseJson', () => {
    it('parses valid JSON and returns typed result', () => {
        const result = safeParseJson<{ name: string }>('{"name":"hello"}', { name: '' });

        expect(result).toEqual({ name: 'hello' });
    });

    it('returns fallback on malformed JSON', () => {
        const fallback = { name: 'default' };
        const result = safeParseJson<{ name: string }>('not json', fallback);

        expect(result).toEqual(fallback);
    });

    it('returns fallback on empty string', () => {
        const fallback = { count: 0 };
        const result = safeParseJson<{ count: number }>('', fallback);

        expect(result).toEqual(fallback);
    });

    it('returns fallback on undefined input', () => {
        const fallback = 42;

        const result = safeParseJson<number>(undefinedAs<string>(), fallback);

        expect(result).toBe(42);
    });
});
