import { describe, it, expect } from 'vitest';
import { parseTestSummaryFromLogs } from '../log-parser.js';

describe('ParseTestSummaryFromLogs', () => {
    it('r1: vitest output → counts corretos', () => {
        const log = `stdout | some test
✓ basic test (10ms)
✓ another test (20ms)
× failing test (5ms)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Tests  3 passed (3)
  Tests with failures: 1
  1 file reported
  expect(received).toBe(expected) // Object.is equality
`;

        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeDefined();

        const tc = result.testCounts as NonNullable<typeof result.testCounts>;

        expect(tc.passed).toBe(3);
    });

    it('r2: jest output → counts corretos', () => {
        const log = `PASS src/test.js (5ms)
  ✓ test 1 (10ms)
  ✓ test 2 (20ms)
  ✕ test 3 (5ms)

Tests:       1 failed, 2 passed, 3 total
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeDefined();

        const tc = result.testCounts as NonNullable<typeof result.testCounts>;

        expect(tc.passed).toBe(2);
        expect(tc.failed).toBe(1);
        expect(tc.total).toBe(3);
        expect(result.framework).toBe('jest');
    });

    it('r3: pytest output → counts corretos', () => {
        const log = `collected 5 items

test_a.py ✓
test_b.py ✓
test_c.py ✓
test_d.py ✗
test_e.py ✓

============================= 4 passed, 1 failed in 2.5s =============================
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeDefined();

        const tc = result.testCounts as NonNullable<typeof result.testCounts>;

        expect(tc.passed).toBe(4);
        expect(tc.failed).toBe(1);
    });

    it('r4: mocha output → counts corretos', () => {
        const log = `  basic test
    ✓ passes (10ms)
    ✓ passes too (20ms)
    ✕ fails (5ms)

  2 passing (35ms)
  1 failing
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeDefined();

        const tc = result.testCounts as NonNullable<typeof result.testCounts>;

        expect(tc.passed).toBe(2);
        expect(tc.failed).toBe(1);
    });

    it('r5: extrai mensagens de falha', () => {
        const log = `✕ test fails
Error: Expected 2 + 2 to equal 5
    at Object.<anonymous> (test.js:10:5)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

AssertionError: expected 1 to equal 2
    at Object.<anonymous> (test.js:20:5)
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.failures.length).toBeGreaterThan(0);

        const hasExpectedError = result.failures.some(
            (f) => f.includes('Expected 2 + 2 to equal 5') || f.includes('expected 1 to equal 2'),
        );

        expect(hasExpectedError).toBeTruthy();
    });

    it('r6: log vazio → empty result', () => {
        const result = parseTestSummaryFromLogs('');

        expect(result.testCounts).toBeUndefined();
        expect(result.failures).toStrictEqual([]);
    });

    it('r7: log sem output de teste → empty result', () => {
        const log = `[2026-01-01] Build starting...
[2026-01-01] Installing dependencies...
[2026-01-01] Build complete.
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeUndefined();
        expect(result.failures).toStrictEqual([]);
    });

    it('go test output → counts corretos', () => {
        const log = `ok  	github.com/user/repo	0.245s
ok  	github.com/user/repo/pkg	0.123s
FAIL	github.com/user/repo/failing	1.234s
`;
        const result = parseTestSummaryFromLogs(log);

        expect(result.testCounts).toBeDefined();
        expect(result.framework).toBe('goTest');
    });
});
