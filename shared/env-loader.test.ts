import { ensureDotenv, envVal, toBool, toInt, __resetDotenvLoaded } from './env-loader.js';

describe('Env-loader — dotenv wrapper', () => {
    beforeEach(() => {
        __resetDotenvLoaded();
    });

    describe('EnsureDotenv', () => {
        it('is idempotent', () => {
            ensureDotenv();

            expect(() => ensureDotenv()).not.toThrow();
        });
    });

    describe('EnvVal', () => {
        it('returns empty string for missing key', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__');

            expect(val).toBe('');
        });

        it('returns process.env value when set', () => {
            process.env['__TEST_VAR__'] = 'hello';
            const val = envVal('__TEST_VAR__');

            expect(val).toBe('hello');

            delete process.env['__TEST_VAR__'];
        });

        it('returns fallback when key is missing', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__', 'fallback');

            expect(val).toBe('fallback');
        });
    });

    describe('ToBool', () => {
        it('returns false for undefined', () => {
            expect(toBool(undefined)).toBeFalsy();
        });

        it('returns boolean value as-is', () => {
            expect(toBool(true)).toBeTruthy();
            expect(toBool(false)).toBeFalsy();
        });

        it('parses string "true"', () => {
            expect(toBool('true')).toBeTruthy();
        });

        it('returns false for other strings', () => {
            expect(toBool('false')).toBeFalsy();
            expect(toBool('yes')).toBeFalsy();
            expect(toBool('')).toBeFalsy();
        });
    });

    describe('ToInt', () => {
        it('returns fallback for undefined', () => {
            expect(toInt(undefined, 10)).toBe(10);
        });

        it('returns number as-is', () => {
            expect(toInt(42, 0)).toBe(42);
        });

        it('parses number string', () => {
            expect(toInt('42', 0)).toBe(42);
        });

        it('returns fallback for NaN', () => {
            expect(toInt('abc', 10)).toBe(10);
        });
    });

    describe('__resetDotenvLoaded', () => {
        it('resets the loaded flag', () => {
            ensureDotenv();
            __resetDotenvLoaded();

            expect(() => ensureDotenv()).not.toThrow();
        });
    });
});
