import {
    FailureAnalysisSchema,
    FailureAnalysisTestSchema,
    TestClassificationSchema,
    TestSeveritySchema,
} from './failure-analysis.schema.js';

describe('TestClassificationSchema', () => {
    it('accepts valid classifications', async () => {
        expect(TestClassificationSchema.parse('ASSERTION')).toBe('ASSERTION');
        expect(TestClassificationSchema.parse('TIMEOUT')).toBe('TIMEOUT');
        expect(TestClassificationSchema.parse('ENVIRONMENT')).toBe('ENVIRONMENT');
        expect(TestClassificationSchema.parse('FLAKY')).toBe('FLAKY');
        expect(TestClassificationSchema.parse('APPLICATION')).toBe('APPLICATION');
        expect(TestClassificationSchema.parse('UNKNOWN')).toBe('UNKNOWN');
    });

    it('rejects invalid classification', async () => {
        expect(() => TestClassificationSchema.parse('INVALID')).toThrow();
        expect(() => TestClassificationSchema.parse('')).toThrow();
    });
});

describe('TestSeveritySchema', () => {
    it('accepts valid severities', async () => {
        expect(TestSeveritySchema.parse('high')).toBe('high');
        expect(TestSeveritySchema.parse('medium')).toBe('medium');
        expect(TestSeveritySchema.parse('low')).toBe('low');
    });

    it('rejects invalid severity', async () => {
        expect(() => TestSeveritySchema.parse('critical')).toThrow();
        expect(() => TestSeveritySchema.parse('')).toThrow();
    });
});

describe('FailureAnalysisTestSchema', () => {
    it('accepts valid test entry', async () => {
        const data = {
            title: 'Login fails',
            classification: 'ASSERTION',
            severity: 'high',
            recommendation: 'Fix the assertion logic in the login component.',
        };
        expect(FailureAnalysisTestSchema.parse(data)).toEqual(data);
    });

    it('rejects test with short recommendation', async () => {
        expect(() =>
            FailureAnalysisTestSchema.parse({
                title: 'Test',
                classification: 'ASSERTION',
                severity: 'high',
                recommendation: 'short',
            }),
        ).toThrow();
    });

    it('rejects test with missing title', async () => {
        expect(() =>
            FailureAnalysisTestSchema.parse({
                classification: 'ASSERTION',
                severity: 'high',
                recommendation: 'Adequately long recommendation text',
            }),
        ).toThrow();
    });
});

describe('FailureAnalysisSchema', () => {
    it('accepts valid full report', async () => {
        const data = {
            tests: [
                {
                    title: 'Login fails',
                    classification: 'ASSERTION',
                    severity: 'high',
                    recommendation: 'Fix the assertion logic in the login component.',
                },
            ],
        };
        expect(FailureAnalysisSchema.parse(data)).toEqual(data);
    });

    it('accepts multi-test report', async () => {
        const data = {
            tests: [
                {
                    title: 'Login fails',
                    classification: 'ASSERTION',
                    severity: 'high',
                    recommendation: 'Fix assertion logic.',
                },
                {
                    title: 'Timeout on checkout',
                    classification: 'TIMEOUT',
                    severity: 'medium',
                    recommendation: 'Increase timeout to 30s.',
                },
            ],
        };
        const result = FailureAnalysisSchema.parse(data);
        expect(result.tests).toHaveLength(2);
    });

    it('rejects empty tests array', async () => {
        expect(() => FailureAnalysisSchema.parse({ tests: [] })).toThrow();
    });

    it('rejects non-array tests', async () => {
        expect(() => FailureAnalysisSchema.parse({ tests: 'not array' })).toThrow();
    });

    it('rejects missing tests field', async () => {
        expect(() => FailureAnalysisSchema.parse({})).toThrow();
    });
});
