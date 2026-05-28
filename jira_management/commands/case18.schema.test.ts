import { TestCaseDataSchema, TestCaseArraySchema } from './case18.schema';

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
