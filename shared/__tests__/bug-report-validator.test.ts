import {
    createBugReportValidator,
    invariantMinSteps,
    invariantImperativeSteps,
    invariantSeverityConsistentWithDescription,
    invariantNotSpecifiedJustified,
} from '../validation/bug-report-validator.js';
import type { ValidationContext } from '../validation/artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'bug-report' };
}

describe('BugReportValidator — createBugReportValidator', () => {
    it('creates validator with all invariants', () => {
        const v = createBugReportValidator();
        const invariants = v.listInvariants();

        expect(invariants).toContain('B-01');
        expect(invariants).toContain('B-02');
        expect(invariants).toContain('B-03');
        expect(invariants).toContain('B-04');
    });

    it('passes valid bug report', () => {
        const v = createBugReportValidator();
        const report = {
            summary: 'Login fails on Firefox with valid credentials',
            description: 'When attempting to log in using Firefox browser, the request times out after 30s',
            stepsToReproduce: [
                'Open Firefox',
                'Navigate to /login',
                'Enter valid credentials',
                'Click Sign In',
                'Wait for response',
            ],
            expectedResult: 'User is redirected to dashboard',
            actualResult: 'Request times out with 504 Gateway Timeout',
            environment: 'Firefox 120',
            severity: 'major' as const,
            evidence: ['Request times out after 30s'],
        };
        const result = v.validate(report, makeCtx('Firefox browser times out'));

        expect(result.failed).toBe(0);
    });
});

describe('InvariantMinSteps (B-01)', () => {
    it('passes with >= 3 steps', () => {
        const results = invariantMinSteps({ stepsToReproduce: ['Step 1', 'Step 2', 'Step 3'] }, makeCtx(''));

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('fails with < 3 steps', () => {
        const results = invariantMinSteps({ stepsToReproduce: ['Step 1'] }, makeCtx(''));

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'B-01'),
        ).toBeTruthy();
    });
});

describe('InvariantImperativeSteps (B-02)', () => {
    it('passes with imperative verbs', () => {
        const results = invariantImperativeSteps(
            { stepsToReproduce: ['Click button', 'Type text', 'Navigate to page'] },
            makeCtx(''),
        );

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('warns on non-imperative steps', () => {
        const results = invariantImperativeSteps(
            { stepsToReproduce: ['The user clicks', 'The system responds'] },
            makeCtx(''),
        );

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'B-02'),
        ).toBeTruthy();
    });
});

describe('InvariantSeverityConsistentWithDescription (B-03)', () => {
    it('passes critical with long description', () => {
        const results = invariantSeverityConsistentWithDescription(
            { severity: 'critical', description: 'Long description '.repeat(10) },
            makeCtx(''),
        );

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('warns critical with short description', () => {
        const results = invariantSeverityConsistentWithDescription(
            { severity: 'critical', description: 'Short' },
            makeCtx(''),
        );

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'B-03'),
        ).toBeTruthy();
    });
});

describe('InvariantNotSpecifiedJustified (B-04)', () => {
    it('passes without "Not specified" fields', () => {
        const results = invariantNotSpecifiedJustified(
            { severity: 'major', summary: 'Test report' },
            makeCtx('Some input with details'),
        );

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('warns on "Not specified" fields when input may have info', () => {
        const results = invariantNotSpecifiedJustified(
            { severity: 'major', component: 'Not specified' },
            makeCtx('component is the auth service'),
        );

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'B-04'),
        ).toBeTruthy();
    });
});
