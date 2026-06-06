/**
 * Tests for report-table — test table builder with primitives.
 */

import {
    matchKnownIssue,
    precomputeCategories,
    buildDetailRow,
    buildErrorCell,
    buildHistoryCell,
    buildCategoryBadge,
    buildFlakinessBadge,
    buildTestTable,
} from './report-table.js';
import type { FlatTest } from './result_parser.js';
import type { TestHistoryRun, KnownIssue } from './report-types.js';

describe('matchKnownIssue', () => {
    it('finds matching known issue by pattern', async () => {
        const issues: KnownIssue[] = [{ pattern: 'login', ticket: 'BUG-42', reason: 'known flaky' }];
        expect(matchKnownIssue('Login test failed', issues)).toEqual(issues[0]);
    });

    it('returns undefined for no match', async () => {
        expect(matchKnownIssue('Logout test', [{ pattern: 'login', ticket: 'BUG-42', reason: '' }])).toBeUndefined();
    });

    it('handles empty known issues list', async () => {
        expect(matchKnownIssue('Login test', [])).toBeUndefined();
    });
});

describe('precomputeCategories', () => {
    it('returns empty map when no failures', async () => {
        const tests: FlatTest[] = [{ title: 'pass', state: 'passed' } as FlatTest];
        expect(precomputeCategories(tests)).toEqual({});
    });

    it('categorizes failed tests', async () => {
        const tests: FlatTest[] = [{ title: 'fail', state: 'failed', error: 'TimeoutError' } as FlatTest];
        const cats = precomputeCategories(tests);
        expect(cats.fail).toBeTruthy();
    });

    it('skips failed tests without error', async () => {
        const tests: FlatTest[] = [{ title: 'fail', state: 'failed' } as FlatTest];
        expect(precomputeCategories(tests)).toEqual({});
    });
});

describe('buildDetailRow', () => {
    it('returns empty for test without steps/screenshots/logs', async () => {
        const t = { title: 'test', state: 'passed' } as FlatTest;
        expect(buildDetailRow(t, 0, 4)).toBe('');
    });

    it('renders steps when present', async () => {
        const t = { title: 'test', state: 'passed', steps: [{ action: 'click', expected: 'ok' }] } as FlatTest;
        const html = buildDetailRow(t, 0, 4);
        expect(html).toContain('click');
        expect(html).toContain('detail-row-0');
    });

    it('renders screenshots when present', async () => {
        const t = {
            title: 'test',
            state: 'passed',
            screenshots: [{ dataUri: 'data:image/png', title: 's1' }],
        } as FlatTest;
        const html = buildDetailRow(t, 0, 4);
        expect(html).toContain('data:image/png');
    });

    it('renders logs when present', async () => {
        const t = { title: 'test', state: 'passed', logs: ['log line 1'] } as FlatTest;
        const html = buildDetailRow(t, 0, 4);
        expect(html).toContain('log line 1');
    });
});

describe('buildErrorCell', () => {
    it('returns empty for non-failed test', async () => {
        const t = { title: 'pass', state: 'passed' } as FlatTest;
        expect(buildErrorCell(t)).toBe('');
    });

    it('truncates long error messages', async () => {
        const long = 'x'.repeat(200);
        const t = { title: 'fail', state: 'failed', error: long } as FlatTest;
        const html = buildErrorCell(t);
        expect(html).toContain('error-truncated');
        expect(html).toContain(long.slice(0, 120));
    });

    it('renders short error inline', async () => {
        const t = { title: 'fail', state: 'failed', error: 'AssertionError' } as FlatTest;
        const html = buildErrorCell(t);
        expect(html).toContain('AssertionError');
        expect(html).not.toContain('error-truncated');
    });
});

describe('buildHistoryCell', () => {
    it('returns placeholder for empty history', async () => {
        expect(buildHistoryCell([])).toContain('—');
    });

    it('renders history dots', async () => {
        const history: TestHistoryRun[] = [
            { status: 'PASSED', testExecKey: 'EXEC-1' },
            { status: 'FAILED', testExecKey: 'EXEC-2' },
        ];
        const html = buildHistoryCell(history);
        expect(html).toContain('hist-dot');
        expect(html).toContain('EXEC-1');
    });
});

describe('buildCategoryBadge', () => {
    it('renders badge with category text', async () => {
        const html = buildCategoryBadge('ASSERTION');
        expect(html).toContain('ASSERTION');
    });

    it('uses default color for unknown category', async () => {
        const html = buildCategoryBadge('UNKNOWN');
        expect(html).toContain('#6b7280');
    });
});

describe('buildFlakinessBadge', () => {
    it('renders alta for >=50%', async () => {
        const html = buildFlakinessBadge(0.5);
        expect(html).toContain('alta');
    });

    it('renders média for 20-49%', async () => {
        const html = buildFlakinessBadge(0.3);
        expect(html).toContain('média');
    });

    it('renders baixa for <20%', async () => {
        const html = buildFlakinessBadge(0.1);
        expect(html).toContain('baixa');
    });
});

describe('buildTestTable', () => {
    it('returns table with test rows', async () => {
        const tests: FlatTest[] = [
            { title: 'Test 1', state: 'passed', duration: 100 },
            { title: 'Test 2', state: 'failed', duration: 200, error: 'Error!' },
        ];
        const html = buildTestTable(tests);
        expect(html).toContain('Test 1');
        expect(html).toContain('Test 2');
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('data-component="table-wrapper"');
    });

    it('includes history column when history provided', async () => {
        const tests: FlatTest[] = [{ title: 'T1', state: 'passed', duration: 100 }];
        const history: Record<string, TestHistoryRun[]> = { T1: [{ status: 'PASSED', testExecKey: 'E-1' }] };
        const html = buildTestTable(tests, undefined, history);
        expect(html).toContain('History');
    });

    it('includes flakiness column when map provided', async () => {
        const tests: FlatTest[] = [{ title: 'T1', state: 'passed', duration: 100 }];
        const html = buildTestTable(tests, undefined, undefined, undefined, { T1: 0.3 });
        expect(html).toContain('Flaky');
    });

    it('handles empty tests list', async () => {
        const html = buildTestTable([]);
        expect(html).toContain('data-component="table-wrapper"');
    });
});
