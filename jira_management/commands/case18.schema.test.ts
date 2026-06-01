import { nonNull } from '../../shared/test-utils';
import { TestCaseDataSchema, TestCaseArraySchema, PreConditionInputSchema } from './case18.schema';

describe('TestCaseDataSchema', () => {
    it('accepts valid test case', () => {
        const data = {
            title: 'Login with valid credentials',
            steps: ['Enter user', 'Enter password', 'Click login'],
            expectedResult: 'User is redirected to dashboard',
        };
        expect(TestCaseDataSchema.parse(data)).toEqual(data);
    });

    it('rejects short title (<5 chars)', () => {
        expect(() =>
            TestCaseDataSchema.parse({
                title: 'Log',
                steps: ['Enter user'],
                expectedResult: 'User is redirected to dashboard',
            }),
        ).toThrow();
    });

    it('rejects empty steps array', () => {
        expect(() =>
            TestCaseDataSchema.parse({
                title: 'Login with valid credentials',
                steps: [],
                expectedResult: 'User is redirected to dashboard',
            }),
        ).toThrow();
    });

    it('rejects short expectedResult (<10 chars)', () => {
        expect(() =>
            TestCaseDataSchema.parse({
                title: 'Login with valid credentials',
                steps: ['Enter user'],
                expectedResult: 'Short',
            }),
        ).toThrow();
    });

    it('rejects missing optional fields gracefully', () => {
        expect(() =>
            TestCaseDataSchema.parse({
                steps: ['Enter user'],
                expectedResult: 'User is redirected to dashboard',
            }),
        ).toThrow();
    });
});

describe('PreConditionInputSchema', () => {
    it('accepts reference type with key', () => {
        const data = { type: 'reference', key: 'PREC-123' };
        expect(PreConditionInputSchema.parse(data)).toEqual(data);
    });

    it('accepts create type with summary', () => {
        const data = { type: 'create', summary: 'User must be logged in' };
        expect(PreConditionInputSchema.parse(data)).toEqual(data);
    });

    it('rejects invalid type', () => {
        expect(() => PreConditionInputSchema.parse({ type: 'invalid', key: 'PREC-123' })).toThrow();
    });

    it('accepts test case with preConditions array', () => {
        const data = {
            title: 'Login with valid credentials',
            steps: ['Enter user', 'Enter password'],
            expectedResult: 'User is redirected to dashboard',
            preConditions: [
                { type: 'reference', key: 'PREC-123' },
                { type: 'create', summary: 'DB must be seeded' },
            ],
        };
        const parsed = TestCaseDataSchema.parse(data);
        expect(parsed.preConditions).toBeDefined();
        expect(nonNull(parsed.preConditions)).toHaveLength(2);
        expect(nonNull(parsed.preConditions)[0]).toEqual({ type: 'reference', key: 'PREC-123' });
    });

    it('accepts test case without preConditions', () => {
        const data = {
            title: 'Login with valid credentials',
            steps: ['Enter user', 'Enter password'],
            expectedResult: 'User is redirected to dashboard',
        };
        expect(TestCaseDataSchema.parse(data).preConditions).toBeUndefined();
    });
});

describe('TestCaseArraySchema', () => {
    it('accepts array of valid test cases', () => {
        const data = [
            {
                title: 'Login with valid credentials',
                steps: ['Enter user', 'Enter password'],
                expectedResult: 'User is redirected to dashboard',
            },
        ];
        expect(TestCaseArraySchema.parse(data)).toEqual(data);
    });

    it('rejects empty array', () => {
        expect(() => TestCaseArraySchema.parse([])).toThrow();
    });

    it('rejects non-array input', () => {
        expect(() => TestCaseArraySchema.parse({})).toThrow();
    });
});
