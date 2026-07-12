import { describe, it, expect } from 'vitest';
import {
    parseFailureRecordsFromLogs,
    parseTestSummaryFromLogs,
    stripAnsi,
    categorizeFailure,
    detectFrameworkVersion,
} from '../log-parser.js';
import type { FailureRecord } from '../types/data-hub.js';

// ANSI helpers — avoid literal control characters in the source file.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const csi = (s: string) => `${ESC}[${s}`;
const osc = (s: string) => `${ESC}]${s}`;

describe('L4.4 — parseFailureRecordsFromLogs: canonical FailureRecord extraction', () => {
    it('returns empty array for empty or garbage input', () => {
        expect(parseFailureRecordsFromLogs('')).toStrictEqual([]);

        expect(parseFailureRecordsFromLogs('just some build log with no tests')).toStrictEqual([]);

        expect(parseFailureRecordsFromLogs('   \n  \n ')).toStrictEqual([]);
    });

    it('extracts JS assertion error status and source', () => {
        const log = `✕ basic test
Error: Expected 2 + 2 to equal 5
    at Object.<anonymous> (test.js:10:5)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
`;
        const recs = parseFailureRecordsFromLogs(log);

        expect(recs).toHaveLength(1);

        const r = recs[0] as FailureRecord;

        expect(r.status).toBe('failed');

        expect(r.category).toBe('assertion');

        expect(r.source).toBe('log');
    });

    it('extracts JS assertion error message and trace', () => {
        const log = `✕ basic test
Error: Expected 2 + 2 to equal 5
    at Object.<anonymous> (test.js:10:5)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(Number.isFinite(r.confidence)).toBeTruthy();

        expect(r.confidence).toBeGreaterThan(0);

        expect(r.confidence).toBeLessThanOrEqual(1);

        expect(r.message).toContain('Expected 2 + 2 to equal 5');

        expect(r.trace).toContain('at Object.<anonymous> (test.js:10:5)');
    });

    it('classifies timeout as broken/timeout', () => {
        const log = `TimeoutError: Test timed out after 5000ms
    at Context.<anonymous> (slow.test.js:3:3)
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(r.status).toBe('broken');

        expect(r.category).toBe('timeout');
    });

    it('classifies network as broken/network', () => {
        const log = `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect (net.js:1146:16)
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(r.status).toBe('broken');

        expect(r.category).toBe('network');
    });

    it('classifies ENOENT as broken/environment', () => {
        const log = `Error: Cannot find module './missing'
    at require (internal/modules/cjs/loader.js:1009:19)
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(r.status).toBe('broken');

        expect(r.category).toBe('environment');
    });

    it('extracts Go panic as broken/panic with goroutine trace', () => {
        const log = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation]
goroutine 1 [running]:
main.main()
\t/home/user/main.go:23 +0x45
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(r.status).toBe('broken');

        expect(r.category).toBe('panic');

        expect(r.trace).toContain('main.main()');
    });

    it('extracts Python traceback file and line', () => {
        const log = `Traceback (most recent call last):
  File "tests/test_x.py", line 42, in test_add
    assert add(1, 2) == 4
AssertionError: assert 3 == 4
`;
        const r = parseFailureRecordsFromLogs(log)[0] as FailureRecord;

        expect(r.category).toBe('assertion');

        expect(r.status).toBe('failed');

        expect(r.file).toBe('tests/test_x.py');

        expect(r.line).toBe(42);
    });

    it('extracts multiple distinct failures without silent merge', () => {
        const log = `Error: first failure
    at a (a.js:1:1)
Error: second failure
    at b (b.js:2:2)
`;
        const recs = parseFailureRecordsFromLogs(log);

        expect(recs).toHaveLength(2);

        const msgs = recs.map((r) => r.message ?? '');

        expect(msgs.some((m) => m.includes('first failure'))).toBeTruthy();

        expect(msgs.some((m) => m.includes('second failure'))).toBeTruthy();
    });

    it('extracts non-English failure with file and line', () => {
        const log = `Erreur: se esperaba que 1 fuera igual a 2
    at test (test.es.js:5:1)
`;
        const recs = parseFailureRecordsFromLogs(log);

        expect(recs.length).toBeGreaterThanOrEqual(1);

        const r = recs[0] as FailureRecord;

        expect(r.source).toBe('log');

        expect(r.file).toBe('test.es.js');

        expect(r.line).toBe(5);

        expect(r.category).toBe('assertion');
    });
});

describe('L4.1 — NaN guards and count invariant (no silent masking)', () => {
    it('leaves testCounts undefined for corrupted counts', () => {
        const log = `Tests   abc passed (xyz)`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeUndefined();

        expect(Number.isNaN(result.testCounts?.passed ?? 0)).toBeFalsy();
    });

    it('parses valid vitest counts as finite', () => {
        const log = `Tests  3 passed (3)`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts?.passed).toBe(3);

        expect(Number.isFinite(result.testCounts?.passed)).toBeTruthy();
    });

    it('detects dotnet framework', () => {
        const log = `Passed!  - Failed:   1, Passed:   4, Skipped:   0, Total:   5`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.framework).toBe('dotnet');

        expect(result.testCounts?.total).toBe(5);

        expect(result.testCounts?.failed).toBe(1);
    });

    it('preserves go detection', () => {
        const log = `ok  \tgithub.com/user/repo\t0.245s
FAIL\tgithub.com/user/repo/failing\t1.234s
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.framework).toBe('goTest');

        expect(result.testCounts?.failed).toBe(1);
    });
});

describe('L4.3 — stripAnsi hardened (CSI + OSC)', () => {
    it('strips CSI sequences', () => {
        expect(stripAnsi(csi('31mred text') + csi('0m'))).toBe('red text');
    });

    it('strips OSC with BEL terminator', () => {
        expect(stripAnsi(osc('0;build log title') + BEL + 'done')).toBe('done');
    });

    it('strips OSC with ST terminator', () => {
        expect(stripAnsi(osc('8;;http://x') + BEL + 'link' + osc('8;;') + ESC + '\\')).toBe('link');
    });

    it('handles truncated ANSI without throwing', () => {
        const input = 'before ' + csi('31mnever terminated');

        expect(() => stripAnsi(input)).not.toThrow();

        expect(stripAnsi(input)).toBe('before never terminated');
    });
});

describe('L4.2 — detectFrameworkVersion (provenance metadata)', () => {
    it('detects vitest version', () => {
        expect(detectFrameworkVersion('vitest v2.1.8')).toMatchObject({ id: 'vitest', version: '2.1.8' });
    });

    it('detects jest version', () => {
        expect(detectFrameworkVersion('jest v29.7.0')).toMatchObject({ id: 'jest', version: '29.7.0' });
    });

    it('returns null for unknown framework', () => {
        expect(detectFrameworkVersion('no version here')).toBeNull();
    });
});

describe('L4.4 — categorizeFailure (root-cause buckets)', () => {
    it('categorizes assertion', () => {
        expect(categorizeFailure('expect(1).toBe(2)')).toBe('assertion');
    });

    it('categorizes timeout', () => {
        expect(categorizeFailure('Timeout of 5000ms exceeded')).toBe('timeout');
    });

    it('categorizes network', () => {
        expect(categorizeFailure('getaddrinfo ENOTFOUND host')).toBe('network');
    });

    it('categorizes panic', () => {
        expect(categorizeFailure('panic: runtime error')).toBe('panic');
    });

    it('categorizes environment', () => {
        expect(categorizeFailure('Cannot find module x')).toBe('environment');
    });

    it('defaults unknown to assertion (most common product defect)', () => {
        expect(categorizeFailure('something weird happened')).toBe('assertion');
    });
});

describe('L4 — integration: full vitest log with failures', () => {
    const log = `stdout | some test
✓ basic test (10ms)
× failing test (5ms)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Tests  1 failed, 1 passed (2)
Error: Expected true to be false
    at Object.<anonymous> (failing.test.ts:12:3)
`;

    it('produces both counts and canonical failure records', () => {
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts?.total).toBe(2);

        expect(result.failureRecords.length).toBeGreaterThanOrEqual(1);

        const r = result.failureRecords[0] as FailureRecord;

        expect(r.source).toBe('log');

        expect(r.category).toBe('assertion');

        expect(r.trace).toContain('failing.test.ts:12:3');
    });
});
