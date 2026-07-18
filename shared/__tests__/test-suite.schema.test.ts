import {
    TestSuiteSchema,
    TestCaseSchema,
    PreConditionSchema,
    CoverageRefSchema,
    CoverageTableSchema,
} from '../validation/test-suite.schema.js';

describe('PreConditionSchema', () => {
    it('accepts valid preconditions', () => {
        expect(PreConditionSchema.parse({ type: 'setup', description: 'User must be logged in' })).toStrictEqual({
            type: 'setup',
            description: 'User must be logged in',
        });
    });

    it('rejects empty description', () => {
        expect(() => PreConditionSchema.parse({ type: 'setup', description: '' })).toThrow(/./i);
    });

    it('rejects invalid type', () => {
        expect(() => PreConditionSchema.parse({ type: 'invalid', description: 'desc' })).toThrow(/./i);
    });
});

describe('CoverageRefSchema', () => {
    it('accepts valid coverage ref', () => {
        expect(CoverageRefSchema.parse({ criterionId: 'C-1', criterionText: 'User can log in' })).toStrictEqual({
            criterionId: 'C-1',
            criterionText: 'User can log in',
        });
    });

    it('rejects empty criterionId', () => {
        expect(() => CoverageRefSchema.parse({ criterionId: '', criterionText: 'text' })).toThrow(/./i);
    });
});

describe('TestCaseSchema', () => {
    const validTestCase = {
        title: 'Valid login redirects to dashboard',
        preConditions: [{ type: 'setup' as const, description: 'User must be logged in' }],
        steps: ['Navigate to /login', 'Enter valid email', 'Enter correct password', 'Click Sign In'],
        expectedResult: 'User is redirected to dashboard and sees Welcome',
        coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }],
    };

    it('accepts valid test case', () => {
        const result = TestCaseSchema.parse(validTestCase);

        expect(result.title).toBe(validTestCase.title);
    });

    it('rejects title shorter than 5 chars', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, title: 'Test' })).toThrow(/./i);
    });

    it('rejects title over 200 chars', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, title: 'x'.repeat(201) })).toThrow(/./i);
    });

    it('rejects empty preConditions', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, preConditions: [] })).toThrow(/./i);
    });

    it('rejects fewer than 3 steps', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, steps: ['Step 1'] })).toThrow(/./i);
    });

    it('rejects step shorter than 5 chars', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, steps: ['Step 1', 'Step 2', 'x'] })).toThrow(/./i);
    });

    it('rejects expectedResult shorter than 10 chars', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, expectedResult: 'Short' })).toThrow(/./i);
    });

    it('rejects empty coverage', () => {
        expect(() => TestCaseSchema.parse({ ...validTestCase, coverage: [] })).toThrow(/./i);
    });

    it('accepts optional evidence', () => {
        const withEvidence = { ...validTestCase, evidence: ['Criterion C-1: User can log in'] };
        const result = TestCaseSchema.parse(withEvidence);

        expect(result.evidence).toStrictEqual(['Criterion C-1: User can log in']);
    });
});

describe('CoverageTableSchema', () => {
    it('accepts valid coverage table', () => {
        expect(CoverageTableSchema.parse({ coverage: 95 })).toStrictEqual({ coverage: 95 });
    });

    it('accepts coverage table with gaps', () => {
        const data = {
            coverage: 75,
            gaps: [{ criterion: 'Edge case X', reason: 'Not applicable to this feature' }],
        };

        expect(CoverageTableSchema.parse(data)).toStrictEqual(data);
    });

    it('rejects coverage < 0', () => {
        expect(() => CoverageTableSchema.parse({ coverage: -1 })).toThrow(/./i);
    });

    it('rejects coverage > 100', () => {
        expect(() => CoverageTableSchema.parse({ coverage: 101 })).toThrow(/./i);
    });
});

describe('TestSuiteSchema', () => {
    const validSuite = {
        summary: 'Test suite for login functionality covering happy path and errors',
        coverageTable: { coverage: 100 },
        tests: [
            {
                title: 'Valid login redirects to dashboard',
                preConditions: [{ type: 'setup' as const, description: 'User must be logged in' }],
                steps: ['Navigate to /login', 'Enter valid email', 'Enter correct password', 'Click Sign In'],
                expectedResult: 'User is redirected to dashboard and sees Welcome',
                coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }],
            },
        ],
    };

    it('accepts valid test suite', () => {
        const result = TestSuiteSchema.parse(validSuite);

        expect(result.tests).toHaveLength(1);
    });

    it('rejects summary shorter than 10 chars', () => {
        expect(() => TestSuiteSchema.parse({ ...validSuite, summary: 'Short' })).toThrow(/./i);
    });

    it('rejects empty tests array', () => {
        expect(() => TestSuiteSchema.parse({ ...validSuite, tests: [] })).toThrow(/./i);
    });
});
