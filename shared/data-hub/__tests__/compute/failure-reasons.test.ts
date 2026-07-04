import { describe, it, expect } from 'vitest';
import { extractFailureReasons, calcTopFailureReasons } from '../../compute/failure-reasons.js';

describe('Compute/failure-reasons', () => {
    describe('ExtractFailureReasons', () => {
        it('returns empty for empty log', () => {
            expect.hasAssertions();
            expect(extractFailureReasons('')).toStrictEqual([]);
        });

        it('extracts Error pattern', () => {
            expect.hasAssertions();

            const log = "Error: Cannot find module 'lodash'";
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
            expect(result[0]).toContain('Error');
        });

        it('extracts Failure pattern', () => {
            expect.hasAssertions();

            const log = 'Failure: assertion failed at line 42';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
        });

        it('extracts Timeout pattern', () => {
            expect.hasAssertions();

            const log = 'Timeout: operation exceeded 30s limit';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
        });

        it('extracts Exception pattern', () => {
            expect.hasAssertions();

            const log = 'Exception: NullPointerException in handler';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
        });

        it('extracts FATAL pattern', () => {
            expect.hasAssertions();

            const log = 'FATAL: database connection refused';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
        });

        it('extracts OOMKilled pattern', () => {
            expect.hasAssertions();

            const log = 'OOMKilled: container exceeded memory limit';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe('OOMKilled');
        });

        it('deduplicates identical patterns', () => {
            expect.hasAssertions();

            const log = 'Error: first issue here\nError: first issue here';
            const result = extractFailureReasons(log);

            expect(result).toHaveLength(1);
        });

        it('returns max 5 reasons', () => {
            expect.hasAssertions();

            const reasons = Array.from({ length: 10 }, (_, i) => `Error: reason number ${i} here`);
            const log = reasons.join('\n');
            const result = extractFailureReasons(log);

            expect(result.length).toBeLessThanOrEqual(5);
        });

        it('truncates reasons to 100 chars', () => {
            expect.hasAssertions();

            const longMsg = 'x'.repeat(200);
            const log = `Error: ${longMsg}`;
            const result = extractFailureReasons(log);

            expect(result[0]?.length).toBeLessThanOrEqual(100);
        });
    });

    describe('CalcTopFailureReasons', () => {
        it('returns empty for empty map', () => {
            expect.hasAssertions();
            expect(calcTopFailureReasons(new Map())).toStrictEqual([]);
        });

        it('aggregates reasons correctly', () => {
            expect.hasAssertions();

            const map = new Map([
                [1, ['Error: timeout', 'Failure: assertion']],
                [2, ['Error: timeout']],
            ]);
            const result = calcTopFailureReasons(map);

            expect(result[0]?.pattern).toBe('Error: timeout');
            expect(result[0]?.count).toBe(2);
        });

        it('sorts by count descending', () => {
            expect.hasAssertions();

            const map = new Map([
                [1, ['Error: a']],
                [2, ['Error: b', 'Error: b']],
                [3, ['Error: b']],
            ]);
            const result = calcTopFailureReasons(map);

            expect(result[0]?.pattern).toBe('Error: b');
            expect(result[0]?.count).toBe(3);
        });

        it('returns max 10 results', () => {
            expect.hasAssertions();

            const map = new Map<number, string[]>();
            for (let i = 0; i < 15; i++) {
                map.set(i, [`Error: reason-${i}`]);
            }
            const result = calcTopFailureReasons(map);

            expect(result.length).toBeLessThanOrEqual(10);
        });

        it('handles jobs with empty reason arrays', () => {
            expect.hasAssertions();

            const map = new Map([
                [1, []],
                [2, ['Error: real']],
            ]);
            const result = calcTopFailureReasons(map);

            expect(result).toHaveLength(1);
        });
    });
});
