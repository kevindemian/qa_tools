import {
    createTestCaseValidator,
    invariantCoverageComplete,
    invariantCoverageThreshold,
    invariantConcreteSteps,
    invariantVerifiableResult,
    invariantUniqueTitles,
    invariantPreconditionsExist,
    invariantStateMutation,
    invariantNumericConsistency,
    invariantNoDuplicateTests,
} from './test-case-validator';
import type { ValidationContext } from './artifact-validator';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('TestCaseValidator — createTestCaseValidator', () => {
    it('creates validator with all invariants registered', () => {
        const v = createTestCaseValidator();
        const invariants = v.listInvariants();
        expect(invariants).toContain('T-01');
        expect(invariants).toContain('T-02');
        expect(invariants).toContain('T-03');
        expect(invariants).toContain('T-04');
        expect(invariants).toContain('T-05');
        expect(invariants).toContain('T-06');
        expect(invariants).toContain('T-07');
        expect(invariants).toContain('T-08');
        expect(invariants).toContain('T-09');
        expect(invariants).toContain('T-10');
        expect(invariants).toContain('I-01');
        expect(invariants).toContain('I-02');
        expect(invariants).toContain('I-03');
        expect(invariants).toContain('I-04');
        expect(invariants).toContain('I-05');
    });

    it('passes a well-formed test suite', () => {
        const v = createTestCaseValidator();
        const suite = {
            summary: 'Test suite for login functionality covering happy path and errors',
            coverageTable: { coverage: 100 },
            tests: [
                {
                    title: 'Valid login redirects to dashboard',
                    preConditions: [{ type: 'setup' as const, description: 'User must be logged in' }],
                    steps: ['Navigate to /login', 'Enter valid email', 'Enter correct password', 'Click Sign In'],
                    expectedResult: 'User is redirected to dashboard and sees Welcome message',
                    coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }],
                },
            ],
        };
        const ctx = makeCtx('Acceptance Criteria: User can log in');
        const result = v.validate(suite, ctx);
        // Should pass or only have warnings
        expect(result.failed).toBe(0);
    });
});

describe('invariantCoverageComplete (T-01)', () => {
    it('passes when all criteria covered', () => {
        const results = invariantCoverageComplete(
            { tests: [{ title: 'Test login', coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }] }] },
            makeCtx('Acceptance Criteria: User can log in'),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails when criteria uncovered', () => {
        const results = invariantCoverageComplete(
            { tests: [{ title: 'Test login', coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }] }] },
            makeCtx('Given user can log in\nWhen payment works'),
        );
        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'T-01'),
        ).toBe(true);
    });
});

describe('invariantCoverageThreshold (T-02)', () => {
    it('passes when coverage >= 90', () => {
        const results = invariantCoverageThreshold({ coverageTable: { coverage: 95 } }, makeCtx(''));
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails when coverage < 90 and no gaps', () => {
        const results = invariantCoverageThreshold({ coverageTable: { coverage: 75 } }, makeCtx(''));
        expect(results.some((r) => !r.passed && r.invariantId === 'T-02')).toBe(true);
    });
});

describe('invariantConcreteSteps (T-04)', () => {
    it('passes concrete steps', () => {
        const results = invariantConcreteSteps(
            { tests: [{ steps: ['Click button', 'Enter text', 'Submit form', 'Verify result'] }] },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails on passive steps', () => {
        const results = invariantConcreteSteps(
            { tests: [{ steps: ['validate that form works', 'check if button exists'] }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'T-04')).toBe(true);
    });
});

describe('invariantVerifiableResult (T-05)', () => {
    it('passes verifiable result', () => {
        const results = invariantVerifiableResult(
            { tests: [{ expectedResult: 'User is redirected to dashboard page with 200 status' }] },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails on vague result', () => {
        const results = invariantVerifiableResult(
            { tests: [{ expectedResult: 'should work correctly' }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'T-05')).toBe(true);
    });
});

describe('invariantUniqueTitles (T-06)', () => {
    it('passes unique titles', () => {
        const results = invariantUniqueTitles({ tests: [{ title: 'Test A' }, { title: 'Test B' }] }, makeCtx(''));
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails on duplicate titles', () => {
        const results = invariantUniqueTitles(
            { tests: [{ title: 'Same Title' }, { title: 'Same Title' }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'T-06')).toBe(true);
    });
});

describe('invariantPreconditionsExist (T-07)', () => {
    it('passes with preconditions', () => {
        const results = invariantPreconditionsExist(
            { tests: [{ preConditions: [{ type: 'setup', description: 'd' }] }] },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails without preconditions', () => {
        const results = invariantPreconditionsExist({ tests: [{ preConditions: [] }] }, makeCtx(''));
        expect(results.some((r) => !r.passed && r.invariantId === 'T-07')).toBe(true);
    });
});

describe('invariantNoDuplicateTests (T-10)', () => {
    it('passes unique test steps', () => {
        const results = invariantNoDuplicateTests(
            { tests: [{ steps: ['Step one', 'Step two'] }, { steps: ['Different steps', 'Other actions'] }] },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });
});

describe('invariantStateMutation (T-03)', () => {
    it('passes when no mutation keywords', () => {
        const results = invariantStateMutation(
            { tests: [{ steps: ['View page', 'Read data'] }] },
            makeCtx('Just viewing content'),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });
});

describe('invariantNumericConsistency (T-09)', () => {
    it('passes consistent numbers', () => {
        const results = invariantNumericConsistency({ item_count: 3, items: [1, 2, 3] }, makeCtx(''));
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails inconsistent numbers', () => {
        const results = invariantNumericConsistency({ item_count: 5, items: [1, 2, 3] }, makeCtx(''));
        expect(results.some((r) => !r.passed && r.invariantId === 'T-09')).toBe(true);
    });
});
