import {
    categorizeFailure,
    extractSuite,
    DEFAULT_TITLE,
    PASS_RATE_GOOD_THRESHOLD,
    PASS_RATE_WARN_THRESHOLD,
    CATEGORY_COLORS,
} from '../report-types.js';
import type { FlatTest } from '../result_parser.js';

describe('Report-types constants', () => {
    it('dEFAULT_TITLE is defined', () => {
        expect(DEFAULT_TITLE).toBe('QA Tools — Test Report');
    });

    it('pASS_RATE_GOOD_THRESHOLD is 90', () => {
        expect(PASS_RATE_GOOD_THRESHOLD).toBe(90);
    });

    it('pASS_RATE_WARN_THRESHOLD is 70', () => {
        expect(PASS_RATE_WARN_THRESHOLD).toBe(70);
    });

    it('cATEGORY_COLORS has all expected keys', () => {
        expect(CATEGORY_COLORS['ASSERTION']).toBe('#6366f1');
        expect(CATEGORY_COLORS['TIMEOUT']).toBe('#f59e0b');
        expect(CATEGORY_COLORS['ENVIRONMENT']).toBe('#10b981');
        expect(CATEGORY_COLORS['APPLICATION']).toBe('#ef4444');
        expect(CATEGORY_COLORS['FLAKY']).toBe('#8b5cf6');
        expect(CATEGORY_COLORS['UNKNOWN']).toBe('#6b7280');
    });
});

describe('CategorizeFailure', () => {
    it('returns TIMEOUT for timeout errors', () => {
        expect(categorizeFailure('Request timed out after 30s')).toBe('TIMEOUT');
        expect(categorizeFailure('TIMED OUT')).toBe('TIMEOUT');
        expect(categorizeFailure('timeout of 60000ms exceeded')).toBe('TIMEOUT');
    });

    it('returns ASSERTION for assertion errors', () => {
        expect(categorizeFailure('Expected true, got false')).toBe('ASSERTION');
        expect(categorizeFailure('AssertionError: values differ')).toBe('ASSERTION');
    });

    it('returns ENVIRONMENT for connection errors', () => {
        expect(categorizeFailure('ECONNREFUSED')).toBe('ENVIRONMENT');
        expect(categorizeFailure('Connection refused')).toBe('ENVIRONMENT');
        expect(categorizeFailure('Database connection failed')).toBe('ENVIRONMENT');
    });

    it('returns APPLICATION for null/undefined errors', () => {
        expect(categorizeFailure('Cannot read property of null')).toBe('APPLICATION');
        expect(categorizeFailure('TypeError: undefined is not a function')).toBe('APPLICATION');
        expect(categorizeFailure('ReferenceError: x is not defined')).toBe('APPLICATION');
    });

    it('returns FLAKY for flaky/intermittent errors', () => {
        expect(categorizeFailure('Flaky test detected')).toBe('FLAKY');
        expect(categorizeFailure('Intermittent failure')).toBe('FLAKY');
        expect(categorizeFailure('Retry attempt 2')).toBe('FLAKY');
    });

    it('returns UNKNOWN for unrecognized errors', () => {
        expect(categorizeFailure('Some random error')).toBe('UNKNOWN');
        expect(categorizeFailure('')).toBe('UNKNOWN');
    });
});

describe('ExtractSuite', () => {
    it('extracts suite from fullTitle with > separator', () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100, fullTitle: 'Auth > Login' };

        expect(extractSuite(t)).toBe('Auth');
    });

    it('returns empty string for tests without fullTitle', () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100 };

        expect(extractSuite(t)).toBe('');
    });

    it('returns multiple parent suites joined by >', () => {
        const t: FlatTest = {
            title: 'Subtest',
            state: 'passed',
            duration: 100,
            fullTitle: 'Root > Auth > Login > Subtest',
        };

        expect(extractSuite(t)).toBe('Root > Auth > Login');
    });

    it('returns empty string when fullTitle has no separator', () => {
        const t: FlatTest = { title: 'Login', state: 'passed', duration: 100, fullTitle: 'Login' };

        expect(extractSuite(t)).toBe('');
    });
});
