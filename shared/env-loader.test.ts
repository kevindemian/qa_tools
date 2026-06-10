import { ensureDotenv, envVal, toBool, toInt, __resetDotenvLoaded } from './env-loader.js';

describe('env-loader — dotenv wrapper', () => {
    beforeEach(() => {
        __resetDotenvLoaded();
    });

    describe('ensureDotenv', () => {
        it('is idempotent', () => {
            ensureDotenv();
            ensureDotenv(); // should not throw
            expect(true).toBe(true);
        });
    });

    describe('envVal', () => {
        it('returns empty string for missing key', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__');
            expect(val).toBe('');
        });

        it('returns process.env value when set', () => {
            process.env.__TEST_VAR__ = 'hello';
            const val = envVal('__TEST_VAR__');
            expect(val).toBe('hello');
            delete process.env.__TEST_VAR__;
        });

        it('returns fallback when key is missing', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__', 'fallback');
            expect(val).toBe('fallback');
        });
    });

    describe('toBool', () => {
        it('returns false for undefined', () => {
            expect(toBool(undefined)).toBe(false);
        });

        it('returns boolean value as-is', () => {
            expect(toBool(true)).toBe(true);
            expect(toBool(false)).toBe(false);
        });

        it('parses string "true"', () => {
            expect(toBool('true')).toBe(true);
        });

        it('returns false for other strings', () => {
            expect(toBool('false')).toBe(false);
            expect(toBool('yes')).toBe(false);
            expect(toBool('')).toBe(false);
        });
    });

    describe('toInt', () => {
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
            // Should not throw after reset
            ensureDotenv();
            expect(true).toBe(true);
        });
    });
});
