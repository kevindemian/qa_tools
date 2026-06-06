import { nonNull } from './test-utils.js';
import { categorizeFailure, extractSuite, toKnownIssues } from './report-types.js';
import { DEFAULT_TITLE, PASS_RATE_GOOD_THRESHOLD, PASS_RATE_WARN_THRESHOLD, CATEGORY_COLORS } from './report-types.js';
import type { KnownIssue } from './report-types.js';
import type { FlatTest } from './result_parser.js';

describe('report-types constants', () => {
    it('DEFAULT_TITLE is defined', async () => {
        expect(DEFAULT_TITLE).toBe('QA Tools — Test Report');
    });

    it('PASS_RATE_GOOD_THRESHOLD is 90', async () => {
        expect(PASS_RATE_GOOD_THRESHOLD).toBe(90);
    });

    it('PASS_RATE_WARN_THRESHOLD is 70', async () => {
        expect(PASS_RATE_WARN_THRESHOLD).toBe(70);
    });

    it('CATEGORY_COLORS has all expected keys', async () => {
        expect(CATEGORY_COLORS.ASSERTION).toBe('#6366f1');
        expect(CATEGORY_COLORS.TIMEOUT).toBe('#f59e0b');
        expect(CATEGORY_COLORS.ENVIRONMENT).toBe('#10b981');
        expect(CATEGORY_COLORS.APPLICATION).toBe('#ef4444');
        expect(CATEGORY_COLORS.FLAKY).toBe('#8b5cf6');
        expect(CATEGORY_COLORS.UNKNOWN).toBe('#6b7280');
    });
});

describe('categorizeFailure', () => {
    it('returns TIMEOUT for timeout errors', async () => {
        expect(categorizeFailure('Request timed out after 30s')).toBe('TIMEOUT');
        expect(categorizeFailure('TIMED OUT')).toBe('TIMEOUT');
        expect(categorizeFailure('timeout of 60000ms exceeded')).toBe('TIMEOUT');
    });

    it('returns ASSERTION for assertion errors', async () => {
        expect(categorizeFailure('Expected true, got false')).toBe('ASSERTION');
        expect(categorizeFailure('AssertionError: values differ')).toBe('ASSERTION');
    });

    it('returns ENVIRONMENT for connection errors', async () => {
        expect(categorizeFailure('ECONNREFUSED')).toBe('ENVIRONMENT');
        expect(categorizeFailure('Connection refused')).toBe('ENVIRONMENT');
        expect(categorizeFailure('Database connection failed')).toBe('ENVIRONMENT');
    });

    it('returns APPLICATION for null/undefined errors', async () => {
        expect(categorizeFailure('Cannot read property of null')).toBe('APPLICATION');
        expect(categorizeFailure('TypeError: undefined is not a function')).toBe('APPLICATION');
        expect(categorizeFailure('ReferenceError: x is not defined')).toBe('APPLICATION');
    });

    it('returns FLAKY for flaky/intermittent errors', async () => {
        expect(categorizeFailure('Flaky test detected')).toBe('FLAKY');
        expect(categorizeFailure('Intermittent failure')).toBe('FLAKY');
        expect(categorizeFailure('Retry attempt 2')).toBe('FLAKY');
    });

    it('returns UNKNOWN for unrecognized errors', async () => {
        expect(categorizeFailure('Some random error')).toBe('UNKNOWN');
        expect(categorizeFailure('')).toBe('UNKNOWN');
    });
});

describe('extractSuite', () => {
    it('extracts suite from fullTitle with > separator', async () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100, fullTitle: 'Auth > Login' };
        expect(extractSuite(t)).toBe('Auth');
    });

    it('returns empty string for tests without fullTitle', async () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100 };
        expect(extractSuite(t)).toBe('');
    });

    it('returns multiple parent suites joined by >', async () => {
        const t: FlatTest = {
            title: 'Subtest',
            state: 'passed',
            duration: 100,
            fullTitle: 'Root > Auth > Login > Subtest',
        };
        expect(extractSuite(t)).toBe('Root > Auth > Login');
    });

    it('returns empty string when fullTitle has no separator', async () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100, fullTitle: 'Login' };
        expect(extractSuite(t)).toBe('');
    });
});

describe('toKnownIssues', () => {
    it('returns empty array for null input', async () => {
        expect(toKnownIssues(null)).toEqual([]);
    });

    it('returns empty array for non-array input', async () => {
        expect(toKnownIssues({})).toEqual([]);
    });

    it('parses valid known issue objects', async () => {
        const input = [
            { pattern: 'timeout', reason: 'Infra flaky', ticket: 'BUG-1' },
            { pattern: 'login', reason: 'Known SSL issue' },
        ];
        const result = toKnownIssues(input);
        expect(result).toHaveLength(2);
        expect(nonNull(result[0]).pattern).toBe('timeout');
        expect(nonNull(result[0]).reason).toBe('Infra flaky');
        expect(nonNull(result[0]).ticket).toBe('BUG-1');
        expect(nonNull(result[1]).pattern).toBe('login');
        expect(nonNull(result[1]).ticket).toBeUndefined();
    });

    it('skips invalid items', async () => {
        const input = [
            { pattern: 'valid', reason: 'ok' },
            { pattern: 123, reason: 'invalid pattern type' },
            { notPattern: 'missing', notReason: 'fields' },
            null,
        ];
        const result = toKnownIssues(input);
        expect(result).toHaveLength(1);
        expect(nonNull(result[0]).pattern).toBe('valid');
    });

    it('KnownIssue interface is usable as a type', async () => {
        const issue: KnownIssue = { pattern: 'test', reason: 'reason', ticket: 'TICKET-1' };
        expect(issue.pattern).toBe('test');
        expect(issue.reason).toBe('reason');
        expect(issue.ticket).toBe('TICKET-1');
    });
});
