import { AiBugReportSchema } from './bug-report.schema.js';

describe('AiBugReportSchema', () => {
    const validReport = {
        summary: 'Login fails on Firefox with valid credentials',
        description: 'When attempting to log in using Firefox browser, the request times out after 30s',
        stepsToReproduce: ['Open Firefox', 'Navigate to /login', 'Enter valid credentials', 'Click Sign In'],
        expectedResult: 'User is redirected to dashboard',
        actualResult: 'Request times out with 504 Gateway Timeout',
        environment: 'Firefox 120, staging',
        severity: 'major' as const,
        component: 'auth-service',
    };

    it('accepts a valid report with all fields', () => {
        const result = AiBugReportSchema.parse(validReport);

        expect(result.summary).toBe(validReport.summary);
        expect(result.severity).toBe('major');
        expect(result.component).toBe('auth-service');
    });

    it('accepts a valid report without optional fields', () => {
        const minimal = (({ environment: _env, component: _comp, ...rest }) => rest)(validReport);
        const result = AiBugReportSchema.parse(minimal);

        expect(result.environment).toBeUndefined();
        expect(result.component).toBeUndefined();
    });

    it('rejects empty summary', () => {
        const invalid = { ...validReport, summary: '' };

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('rejects summary exceeding 80 chars', () => {
        const invalid = { ...validReport, summary: 'x'.repeat(81) };

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('rejects invalid severity', () => {
        const invalid = { ...validReport, severity: 'invalid' };

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('rejects empty steps array', () => {
        const invalid = { ...validReport, stepsToReproduce: [] };

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('rejects missing expectedResult', () => {
        const invalid = (({ expectedResult: _er, ...rest }) => rest)(validReport);

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('rejects missing actualResult', () => {
        const invalid = (({ actualResult: _ar, ...rest }) => rest)(validReport);

        expect(() => AiBugReportSchema.parse(invalid)).toThrow();
    });

    it('accepts all severity values', () => {expect.hasAssertions();

        for (const severity of ['trivial', 'minor', 'major', 'critical'] as const) {
            const result = AiBugReportSchema.parse({ ...validReport, severity });

            expect(result.severity).toBe(severity);
        }
    });

    it('accepts report with evidence field', () => {
        const withEvidence = {
            ...validReport,
            evidence: ['Request times out with 504 Gateway Timeout', 'Firefox 120, staging'],
        };
        const result = AiBugReportSchema.parse(withEvidence);

        expect(result.evidence).toStrictEqual(['Request times out with 504 Gateway Timeout', 'Firefox 120, staging']);
    });

    it('accepts report without evidence (optional)', () => {
        const result = AiBugReportSchema.parse(validReport);

        expect(result.evidence).toBeUndefined();
    });
});
