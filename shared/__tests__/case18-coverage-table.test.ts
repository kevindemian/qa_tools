import { describe, it, expect } from 'vitest';
import {
    buildCoverageTable,
    coverageTableToHtml,
    coverageTableToJson,
    extractCriteria,
    CASE18_COVERAGE_STANDARDS,
} from '../quality/case18-coverage-table.js';
import type { GeneratedTestCase } from '../quality/case18-types.js';

const TESTS: GeneratedTestCase[] = [
    {
        title: 'Login with valid credentials',
        steps: ['Navigate to /login', 'Enter valid email', 'Click Sign In'],
        expectedResult: 'User is redirected to dashboard',
        coverage: [{ criterionId: 'C-1', criterionText: 'User can log in with valid credentials' }],
    },
    {
        title: 'Login with invalid password',
        steps: ['Navigate to /login', 'Enter valid email', 'Enter wrong password'],
        expectedResult: 'Error message is shown',
        coverage: [{ criterionId: 'C-2', criterionText: 'Invalid credentials show error message' }],
    },
];

const CRITERIA =
    'User can log in with valid credentials\nInvalid credentials show error message\nUser can reset password';

describe('extractCriteria', () => {
    it('splits criteria lines and assigns sequential ids', () => {
        const criteria = extractCriteria('First line\n\nSecond line\n');
        expect(criteria).toStrictEqual([
            { id: 'C1', text: 'First line' },
            { id: 'C2', text: 'Second line' },
        ]);
    });

    it('returns empty array for empty input', () => {
        expect(extractCriteria('')).toStrictEqual([]);
    });

    it('returns empty array for non-string input', () => {
        expect(extractCriteria(null as unknown as string)).toStrictEqual([]);
    });
});

describe('buildCoverageTable', () => {
    it('marks criteria covered when cited in coverage array', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        const c1 = table.rows.find((r) => r.criterionId === 'C1');
        expect(c1?.status).toBe('COVERED');
        expect(c1?.coveredBy).toContain('Login with valid credentials');
    });

    it('marks uncovered criteria as NOT_COVERED', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        const c3 = table.rows.find((r) => r.criterionId === 'C3');
        expect(c3?.status).toBe('NOT_COVERED');
        expect(c3?.coveredBy).toStrictEqual([]);
    });

    it('computes coverage rate', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        expect(table.criteriaCount).toBe(3);
        expect(table.coveredCount).toBe(2);
        expect(table.coverageRate).toBe(67);
    });

    it('matches by content keywords when not cited', () => {
        const table = buildCoverageTable(TESTS, 'redirected to dashboard', 'vtest');
        // 'redirected' + 'dashboard' both appear in first test's expected result
        expect(table.rows[0]?.status).toBe('COVERED');
        expect(table.rows[0]?.coveredBy).toContain('Login with valid credentials');
    });

    it('returns zero coverage for empty criteria', () => {
        const table = buildCoverageTable(TESTS, '', 'vtest');
        expect(table.criteriaCount).toBe(0);
        expect(table.coverageRate).toBe(0);
    });

    it('throws on non-array testCases (safety guard)', () => {
        expect(() => buildCoverageTable(null as unknown as GeneratedTestCase[], CRITERIA, 'vtest')).toThrow(
            /testCases must be an array/,
        );
    });

    it('includes declared standards and model source', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        expect(table.standards.model.standard).toContain('Kaleidoscope');
        expect(table.standards.dimensions.length).toBeGreaterThanOrEqual(5);
    });
});

describe('coverageTableToJson', () => {
    it('round-trips through JSON.parse', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        const parsed = JSON.parse(coverageTableToJson(table)) as {
            criteriaCount: number;
            rows: Array<{ status: string }>;
        };
        expect(parsed.criteriaCount).toBe(3);
        expect(parsed.rows.some((r) => r.status === 'NOT_COVERED')).toBe(true);
    });
});

describe('coverageTableToHtml', () => {
    it('renders a full HTML document with standards footer', () => {
        const table = buildCoverageTable(TESTS, CRITERIA, 'vtest');
        const html = coverageTableToHtml(table);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Case18 Coverage Table');
        expect(html).toContain('2/3');
        expect(html).toContain('NOT_COVERED');
        expect(html).toContain('G-Eval');
        expect(html).toContain('ISO/IEC 29119-4');
    });

    it('escapes HTML-special characters in criterion text', () => {
        const table = buildCoverageTable([], 'Amount < 100 & > 0', 'vtest');
        const html = coverageTableToHtml(table);
        expect(html).toContain('&lt;');
        expect(html).not.toContain('< 100 &');
    });
});

describe('CASE18_COVERAGE_STANDARDS', () => {
    it('declares all required standards', () => {
        const all = CASE18_COVERAGE_STANDARDS.dimensions.map((d) => d.standard).join(' ');
        expect(all).toContain('ISTQB');
        expect(all).toContain('ISO/IEC 29119-4');
        expect(all).toContain('ISO/IEC 25010');
        expect(all).toContain('Kaleidoscope');
        expect(all).toContain('G-Eval');
        expect(all).toContain('Barraood');
    });
});
