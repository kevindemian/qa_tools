import { envVal, toBool, toInt } from './env-utils.js';

describe('envVal', () => {
    const _origEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ..._origEnv };
    });

    afterAll(() => {
        process.env = _origEnv;
    });

    it('returns env var value when set', () => {
        process.env['TEST_VAL'] = 'hello';

        expect(envVal('TEST_VAL')).toBe('hello');
    });

    it('returns fallback when env var is not set', () => {
        delete process.env['TEST_MISSING'];

        expect(envVal('TEST_MISSING', 'default')).toBe('default');
    });

    it('returns empty string when no fallback', () => {
        delete process.env['TEST_EMPTY'];

        expect(envVal('TEST_EMPTY')).toBe('');
    });
});

describe('toBool', () => {
    it('returns true for "true" string', () => {
        expect(toBool('true')).toBeTruthy();
    });

    it('returns false for "false" string', () => {
        expect(toBool('false')).toBeFalsy();
    });

    it('returns false for undefined', () => {
        expect(toBool(undefined)).toBeFalsy();
    });

    it('returns boolean value as-is', () => {
        expect(toBool(true)).toBeTruthy();
        expect(toBool(false)).toBeFalsy();
    });

    it('returns false for any other string', () => {
        expect(toBool('maybe')).toBeFalsy();
        expect(toBool('')).toBeFalsy();
    });
});

describe('toInt', () => {
    it('parses a valid integer string', () => {
        expect(toInt('42', 0)).toBe(42);
    });

    it('returns fallback for NaN string', () => {
        expect(toInt('abc', 10)).toBe(10);
    });

    it('returns undefined as fallback', () => {
        expect(toInt(undefined, 5)).toBe(5);
    });

    it('returns number value as-is', () => {
        expect(toInt(100, 0)).toBe(100);
    });
});
