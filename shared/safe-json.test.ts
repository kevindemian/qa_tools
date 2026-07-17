/** Tests for safeParseJson — parses JSON safely with fallback. */
import fc from 'fast-check';
import { undefinedAs } from './test-utils.js';
import { safeParseJson } from './safe-json.js';

describe('SafeParseJson', () => {
    it('parses valid JSON and returns typed result', () => {
        const result = safeParseJson<{ name: string }>('{"name":"hello"}', { name: '' });

        expect(result).toStrictEqual({ name: 'hello' });
    });

    it('returns fallback on malformed JSON', () => {
        const fallback = { name: 'default' };
        const result = safeParseJson<{ name: string }>('not json', fallback);

        expect(result).toStrictEqual(fallback);
    });

    it('returns fallback on empty string', () => {
        const fallback = { count: 0 };
        const result = safeParseJson<{ count: number }>('', fallback);

        expect(result).toStrictEqual(fallback);
    });

    it('returns fallback on undefined input', () => {
        const fallback = 42;

        const result = safeParseJson<number>(undefinedAs<string>(), fallback);

        expect(result).toBe(42);
    });

    describe('Property-based invariants', () => {
        it('parses serialized JSON identically to native JSON.parse (wrapper contract)', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.jsonValue(), (value) => {
                    const serialized = JSON.stringify(value);
                    const result = safeParseJson<unknown>(serialized, { __fallback: true });

                    // safeParseJson is a thin wrapper over JSON.parse; it must agree with the
                    // native parser on every JSON-serializable value (including the -0 -> 0
                    // edge case, which is a JSON limitation, not a safeParseJson defect).
                    expect(result).toStrictEqual(JSON.parse(serialized));
                }),
            );
        });

        it('returns the exact fallback (never a partial parse) for non-JSON input', () => {
            expect.hasAssertions();

            const nonJson = fc.string().filter((s) => {
                try {
                    JSON.parse(s);
                    return false;
                } catch {
                    return true;
                }
            });
            const sentinel = Symbol('fallback');
            fc.assert(
                fc.property(nonJson, (input) => {
                    expect(safeParseJson<symbol>(input, sentinel)).toBe(sentinel);
                }),
            );
        });
    });
});
