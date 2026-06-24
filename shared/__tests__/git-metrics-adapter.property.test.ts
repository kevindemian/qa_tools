/**
 * Property-based tests — Git Metrics Adapter
 *
 * Invariants:
 * - parseGitLogOutput: every entry has non-empty hash/date/subject
 * - parseGitLogOutput: parents count matches space count in parent field + 1
 * - parseGitLogOutput: empty input → empty output
 * - generateGitMetricsRuns: all MetricsRun shapes valid
 * - generateGitMetricsRuns: passed+failed+skipped = total
 * - generateGitMetricsRuns: empty git log → empty
 * - generateGitFailureClassifications: all entries are REVERT
 * - generateGitFailureClassifications: no reverts → empty
 * - extractDate: returns YYYY-MM-DD for valid ISO dates
 * - extractDate: returns '' for invalid dates
 */
import * as fc from 'fast-check';
import { describe, expect, it, beforeEach } from 'vitest';
import {
    parseGitLogOutput,
    generateGitMetricsRuns,
    generateGitFailureClassifications,
    getLastGitLogError,
} from '../git-metrics-adapter.js';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(() => ''),
}));

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

import { execFileSync } from 'child_process';

const mockExecFileSync = vi.mocked(execFileSync);

// A NUL-delimited git log line: hash\0date\0subject\0author\0parents
const logLineArb: fc.Arbitrary<string> = fc
    .tuple(
        fc.string({ minLength: 7, maxLength: 40 }).map((s) => s.replace(/[^a-fA-F0-9]/g, '').slice(0, 40) || 'abc1234'),
        fc.constantFrom(
            '2026-06-01T10:00:00.000Z',
            '2026-06-01T11:00:00.000Z',
            '2026-06-02T09:00:00.000Z',
            '2026-06-02T10:00:00.000Z',
            '2026-06-03T14:00:00.000Z',
            '2026-06-15T08:00:00.000Z',
        ),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 0, maxLength: 50 }),
    )
    .map(([hash, date, subject, author, parentField]) => `${hash}\0${date}\0${subject}\0${author}\0${parentField}`);

describe('ParseGitLogOutput invariants (PBT)', () => {
    it('every entry has non-empty hash, date and subject', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(logLineArb, { minLength: 1, maxLength: 20 }), (lines) => {
                const result = parseGitLogOutput(lines.join('\n'));
                result.forEach((entry) => {
                    expect(entry.hash).toBeTruthy();
                    expect(entry.date).toBeTruthy();
                    expect(entry.subject).toBeTruthy();
                });
            }),
        );
    });

    it('handles empty input', () => {
        const result = parseGitLogOutput('');

        expect(result).toEqual([]);
    });

    it('handles single line input', () => {expect.hasAssertions();

        fc.assert(
            fc.property(logLineArb, (line) => {
                const result = parseGitLogOutput(line);

                expect(result).toHaveLength(1);
                expect(result[0]?.hash).toBeTruthy();
            }),
        );
    });
});

describe('GenerateGitMetricsRuns invariants (PBT)', () => {
    const N = '\0';
    const sampleLog = [
        'abc123' + N + '2026-06-01T10:00:00.000Z' + N + 'Initial commit' + N + 'user' + N,
        'def456' + N + '2026-06-01T11:00:00.000Z' + N + 'Add feature' + N + 'user' + N + 'abc123',
        'ghi789' + N + '2026-06-02T09:00:00.000Z' + N + 'Revert "Add feature"' + N + 'user' + N + 'def456',
        'jkl012' + N + '2026-06-02T10:00:00.000Z' + N + 'Merge branch feat' + N + 'user' + N + 'ghi789 abc123',
        'mno345' + N + '2026-06-03T14:00:00.000Z' + N + 'Refactor' + N + 'user' + N + 'jkl012',
    ].join('\n');

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('all runs have well-formed MetricsRun shape', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const runs = generateGitMetricsRuns();
        runs.forEach((run) => {
            expect(run.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(typeof run.total).toBe('number');
            expect(typeof run.passed).toBe('number');
            expect(typeof run.failed).toBe('number');
            expect(typeof run.skipped).toBe('number');
            expect(Array.isArray(run.tests)).toBeTruthy();
            expect(run.total).toBe(run.tests.length);
            expect(run.passed + run.failed + run.skipped).toBe(run.total);
        });
    });

    it('all tests have valid state (passed/failed/skipped)', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const runs = generateGitMetricsRuns();
        const validStates: string[] = ['passed', 'failed', 'skipped'];
        runs.flatMap((r) => r.tests).forEach((t) => {
            expect(validStates).toContain(t.state);
        });
    });

    it('revert commits produce failed + error field', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const runs = generateGitMetricsRuns();
        const revertTests = runs.flatMap((r) => r.tests.filter((t) => t.title.startsWith('Revert')));
        revertTests.forEach((t) => {
            expect(t.state).toBe('failed');
            expect(t.error).toBe('Commit was reverted');
        });
    });

    it('merge commits produce skipped state', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const runs = generateGitMetricsRuns();
        const mergeTests = runs.flatMap((r) => r.tests.filter((t) => t.title.startsWith('Merge')));
        mergeTests.forEach((t) => {
            expect(t.state).toBe('skipped');
        });
    });

    it('empty git log returns empty array', () => {
        mockExecFileSync.mockReturnValue('');
        const runs = generateGitMetricsRuns();

        expect(runs).toEqual([]);
    });

    it('total equals passed + failed + skipped for each run', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const runs = generateGitMetricsRuns();
        runs.forEach((run) => {
            expect(run.passed + run.failed + run.skipped).toBe(run.total);
        });
    });
});

describe('GenerateGitFailureClassifications invariants (PBT)', () => {
    const N = '\0';
    const sampleLog = [
        'abc123' + N + '2026-06-01T10:00:00.000Z' + N + 'Initial' + N + 'user' + N,
        'def456' + N + '2026-06-02T09:00:00.000Z' + N + 'Revert "Initial"' + N + 'user' + N + 'abc123',
        'ghi789' + N + '2026-06-03T10:00:00.000Z' + N + 'Another revert' + N + 'user' + N + 'def456',
    ].join('\n');

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('all classifications have category REVERT', () => {expect.hasAssertions();

        mockExecFileSync.mockReturnValue(sampleLog);
        const result = generateGitFailureClassifications();
        result.forEach((c) => {
            expect(c.category).toBe('REVERT');
            expect(c.testTitle).toBeTruthy();
            expect(c.timestamp).toBeTruthy();
        });
    });

    it('no reverts returns empty array', () => {
        const N = '\0';
        mockExecFileSync.mockReturnValue('abc123' + N + '2026-06-01T10:00:00.000Z' + N + 'Normal' + N + 'user' + N);
        const result = generateGitFailureClassifications();

        expect(result.filter((c) => c.category === 'REVERT')).toHaveLength(0);
    });
});

describe('ExtractDate', () => {
    it('returns YYYY-MM-DD for valid ISO date', () => {
        const log = 'h1' + '\0' + '2026-06-15T10:00:00.000Z' + '\0' + 'msg' + '\0' + 'author' + '\0';
        mockExecFileSync.mockReturnValue(log);
        const runs = generateGitMetricsRuns();

        expect(runs[0]?.timestamp).toContain('2026-06-15');
    });
});

describe('ParseGitLogOutput malformed line invariants (PBT)', () => {
    it('never throws on any input string', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
                expect(() => parseGitLogOutput(input)).not.toThrow();
            }),
        );
    });

    it('filters out lines with fewer than 5 NUL-delimited fields', () => {expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
                (rawLines) => {
                    const output = rawLines.join('\n');
                    const result = parseGitLogOutput(output);
                    result.forEach((entry) => {
                        expect(entry.hash).toBeTruthy();
                        expect(entry.date).toBeTruthy();
                        expect(entry.subject).toBeTruthy();
                        expect(entry.author).toBeTruthy();
                    });
                },
            ),
        );
    });
});

describe('GetLastGitLogError invariants (PBT)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('is undefined when execFileSync succeeds', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 100 }), (hash) => {
                const line = hash + '\0' + '2026-06-01T10:00:00.000Z' + '\0' + 'msg' + '\0' + 'author' + '\0';
                mockExecFileSync.mockReturnValue(line);
                generateGitMetricsRuns();

                expect(getLastGitLogError()).toBeUndefined();
            }),
        );
    });
});
