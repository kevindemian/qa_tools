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
    invariantPartitionCoverage,
    invariantBoundaryCoverage,
    invariantRedundancyCoupling,
    invariantResultMatchesAction,
} from '../validation/test-case-validator.js';
import type { ValidationContext } from '../validation/artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('TestCaseValidator — createTestCaseValidator', () => {
    const EXPECTED_INVARIANT_IDS = [
        'T-01',
        'T-02',
        'T-03',
        'T-04',
        'T-05',
        'T-06',
        'T-07',
        'T-08',
        'T-09',
        'T-10',
        'T-11',
        'T-12',
        'I-01',
        'I-02',
        'I-03',
        'I-04',
        'I-05',
    ];

    it('creates validator with all invariants registered', () => {
        const v = createTestCaseValidator();
        const invariants = v.listInvariants();

        expect(EXPECTED_INVARIANT_IDS.every((id) => invariants.includes(id))).toBeTruthy();
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

describe('InvariantCoverageComplete (T-01)', () => {
    it('passes when all criteria covered', () => {
        const results = invariantCoverageComplete(
            { tests: [{ title: 'Test login', coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }] }] },
            makeCtx('Acceptance Criteria: User can log in'),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails when criteria uncovered', () => {
        const results = invariantCoverageComplete(
            { tests: [{ title: 'Test login', coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }] }] },
            makeCtx('Given user can log in\nWhen payment works'),
        );

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'T-01'),
        ).toBeTruthy();
    });
});

describe('InvariantCoverageThreshold (T-02)', () => {
    it('passes when coverage >= 90', () => {
        const results = invariantCoverageThreshold({ coverageTable: { coverage: 95 } }, makeCtx(''));

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails when coverage < 90 and no gaps', () => {
        const results = invariantCoverageThreshold({ coverageTable: { coverage: 75 } }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-02')).toBeTruthy();
    });
});

describe('InvariantConcreteSteps (T-04)', () => {
    it('passes concrete steps', () => {
        const results = invariantConcreteSteps(
            { tests: [{ steps: ['Click button', 'Enter text', 'Submit form', 'Verify result'] }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails on passive steps', () => {
        const results = invariantConcreteSteps(
            { tests: [{ steps: ['validate that form works', 'check if button exists'] }] },
            makeCtx(''),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-04')).toBeTruthy();
    });
});

describe('InvariantVerifiableResult (T-05)', () => {
    it('passes verifiable result', () => {
        const results = invariantVerifiableResult(
            { tests: [{ expectedResult: 'User is redirected to dashboard page with 200 status' }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails on vague result', () => {
        const results = invariantVerifiableResult(
            { tests: [{ expectedResult: 'should work correctly' }] },
            makeCtx(''),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-05')).toBeTruthy();
    });
});

describe('InvariantUniqueTitles (T-06)', () => {
    it('passes unique titles', () => {
        const results = invariantUniqueTitles({ tests: [{ title: 'Test A' }, { title: 'Test B' }] }, makeCtx(''));

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails on duplicate titles', () => {
        const results = invariantUniqueTitles(
            { tests: [{ title: 'Same Title' }, { title: 'Same Title' }] },
            makeCtx(''),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-06')).toBeTruthy();
    });
});

describe('InvariantPreconditionsExist (T-07)', () => {
    it('passes with preconditions', () => {
        const results = invariantPreconditionsExist(
            { tests: [{ preConditions: [{ type: 'setup', description: 'd' }] }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails without preconditions', () => {
        const results = invariantPreconditionsExist({ tests: [{ preConditions: [] }] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-07')).toBeTruthy();
    });
});

describe('InvariantResultMatchesAction (T-08)', () => {
    it('passes when expectedResult matches create action', () => {
        const results = invariantResultMatchesAction(
            { tests: [{ steps: ['Create user', 'Submit form'], expectedResult: 'User created successfully' }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-08')).toBeTruthy();
    });

    it('warns when expectedResult does not match create action', () => {
        const results = invariantResultMatchesAction(
            { tests: [{ steps: ['Create user', 'Submit form'], expectedResult: 'Page loads' }] },
            makeCtx(''),
        );
        const warnings = results.filter((r) => !r.passed && r.invariantId === 'T-08');

        expect(warnings.length).toBeGreaterThan(0);
    });

    it('passes when expectedResult matches update action', () => {
        const results = invariantResultMatchesAction(
            { tests: [{ steps: ['Edit profile', 'Save changes'], expectedResult: 'Profile updated successfully' }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-08')).toBeTruthy();
    });

    it('warns when expectedResult does not match delete action', () => {
        const results = invariantResultMatchesAction(
            { tests: [{ steps: ['Delete account', 'Confirm'], expectedResult: 'Page loads' }] },
            makeCtx(''),
        );
        const warnings = results.filter((r) => !r.passed && r.invariantId === 'T-08');

        expect(warnings.length).toBeGreaterThan(0);
    });

    it('passes when no action keywords found', () => {
        const results = invariantResultMatchesAction(
            { tests: [{ steps: ['View page', 'Read info'], expectedResult: 'Info displayed' }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails when no tests exist', () => {
        const results = invariantResultMatchesAction({ tests: [] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-08')).toBeTruthy();
    });
});

describe('InvariantNoDuplicateTests (T-10)', () => {
    it('passes unique test steps', () => {
        const results = invariantNoDuplicateTests(
            { tests: [{ steps: ['Step one', 'Step two'] }, { steps: ['Different steps', 'Other actions'] }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });
});

describe('InvariantStateMutation (T-03)', () => {
    it('passes when no mutation keywords', () => {
        const results = invariantStateMutation(
            { tests: [{ steps: ['View page', 'Read data'] }] },
            makeCtx('Just viewing content'),
        );

        expect(results.some((r) => r.passed)).toBeTruthy();
    });
});

describe('InvariantNumericConsistency (T-09)', () => {
    it('passes consistent numbers', () => {
        const results = invariantNumericConsistency({ item_count: 3, items: [1, 2, 3] }, makeCtx(''));

        expect(results.some((r) => r.passed)).toBeTruthy();
    });

    it('fails inconsistent numbers', () => {
        const results = invariantNumericConsistency({ item_count: 5, items: [1, 2, 3] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-09')).toBeTruthy();
    });
});

describe('InvariantPartitionCoverage (T-11)', () => {
    it('passes when all partitions are covered', () => {
        const results = invariantPartitionCoverage(
            {
                tests: [
                    {
                        title: 'Age 18 is accepted',
                        steps: ['Enter age 18', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 17 is rejected',
                        steps: ['Enter age 17', 'Submit'],
                        expectedResult: 'Rejected',
                    },
                    {
                        title: 'Age 66 is rejected',
                        steps: ['Enter age 66', 'Submit'],
                        expectedResult: 'Rejected',
                    },
                ],
            },
            makeCtx('ages between 18 and 65'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-11')).toBeTruthy();
    });

    it('passes when no numeric range is present (skipped)', () => {
        const results = invariantPartitionCoverage(
            { tests: [{ title: 'Test', steps: ['Step'], expectedResult: 'OK' }] },
            makeCtx('No numbers here'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-11')).toBeTruthy();
    });

    it('warns when below-min partition is missing', () => {
        const results = invariantPartitionCoverage(
            {
                tests: [
                    {
                        title: 'Age 18 is accepted',
                        steps: ['Enter age 18', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 65 is accepted',
                        steps: ['Enter age 65', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                ],
            },
            makeCtx('ages between 18 and 65'),
        );
        const warnings = results.filter((r) => !r.passed && r.invariantId === 'T-11');

        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]?.message.toLowerCase()).toContain('below');
    });

    it('warns when above-max partition is missing', () => {
        const results = invariantPartitionCoverage(
            {
                tests: [
                    {
                        title: 'Age 18 is accepted',
                        steps: ['Enter age 18', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 17 is rejected',
                        steps: ['Enter age 17', 'Submit'],
                        expectedResult: 'Rejected',
                    },
                ],
            },
            makeCtx('ages between 18 and 65'),
        );
        const warnings = results.filter((r) => !r.passed && r.invariantId === 'T-11');

        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]?.message.toLowerCase()).toContain('above');
    });

    it('fails when no tests exist', () => {
        const results = invariantPartitionCoverage({ tests: [] }, makeCtx('ages between 18 and 65'));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-11')).toBeTruthy();
    });
});

describe('InvariantBoundaryCoverage (T-12)', () => {
    it('passes when all boundaries are covered (2-value BVA)', () => {
        const results = invariantBoundaryCoverage(
            {
                tests: [
                    {
                        title: 'Age 17 rejected',
                        steps: ['Enter age 17', 'Submit'],
                        expectedResult: 'Rejected',
                    },
                    {
                        title: 'Age 18 accepted',
                        steps: ['Enter age 18', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 65 accepted',
                        steps: ['Enter age 65', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 66 rejected',
                        steps: ['Enter age 66', 'Submit'],
                        expectedResult: 'Rejected',
                    },
                ],
            },
            makeCtx('ages between 18 and 65'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-12')).toBeTruthy();
    });

    it('passes when no numeric range is present (skipped)', () => {
        const results = invariantBoundaryCoverage(
            { tests: [{ title: 'Test', steps: ['Step'], expectedResult: 'OK' }] },
            makeCtx('No numbers here'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-12')).toBeTruthy();
    });

    it('warns when some boundaries are missing', () => {
        const results = invariantBoundaryCoverage(
            {
                tests: [
                    {
                        title: 'Age 18 accepted',
                        steps: ['Enter age 18', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                    {
                        title: 'Age 65 accepted',
                        steps: ['Enter age 65', 'Submit'],
                        expectedResult: 'Accepted',
                    },
                ],
            },
            makeCtx('ages between 18 and 65'),
        );
        const warnings = results.filter((r) => !r.passed && r.invariantId === 'T-12');

        expect(warnings.length).toBeGreaterThan(0);
        // 18 and 65 covered but 17 and 66 missing
        expect(warnings[0]?.message).toContain('Missing');
    });

    it('fails when no tests exist', () => {
        const results = invariantBoundaryCoverage({ tests: [] }, makeCtx('ages between 18 and 65'));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-12')).toBeTruthy();
    });
});

describe('InvariantRedundancyCoupling (T-13)', () => {
    it('passes with fewer than 2 tests', () => {
        const results = invariantRedundancyCoupling(
            { tests: [{ title: 'Only test', steps: ['Do something'] }] },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-13')).toBeTruthy();
    });

    it('passes with completely different tests', () => {
        const artifact = {
            tests: [
                {
                    title: 'Valid login works',
                    steps: ['Navigate to login', 'Enter valid email', 'Click Sign In'],
                    expectedResult: 'Redirected to dashboard',
                    coverage: [{ criterionId: 'C-1', criterionText: 'Login succeeds' }],
                },
                {
                    title: 'Wrong password fails',
                    steps: ['Navigate to login', 'Enter wrong password', 'Click Sign In'],
                    expectedResult: 'Error message shown',
                    coverage: [{ criterionId: 'C-2', criterionText: 'Login fails' }],
                },
            ],
        };
        const results = invariantRedundancyCoupling(artifact, makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-13')).toBeTruthy();
    });

    it('fails when steps are identical and title+result are similar (A + D → error)', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Valid age 18 accepts registration',
                        steps: ['Enter age 18', 'Click Submit', 'Check result'],
                        expectedResult: 'Registration accepted for age 18',
                    },
                    {
                        title: 'Valid age 19 accepts registration',
                        steps: ['Enter age 19', 'Click Submit', 'Check result'],
                        expectedResult: 'Registration accepted for age 19',
                    },
                ],
            },
            makeCtx(''),
        );
        const errors = results.filter((r) => !r.passed && r.severity === 'error' && r.invariantId === 'T-13');

        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]?.message).toContain('identical');
    });

    it('warns when only steps overlap without title+result duplicate (A only → warning)', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'First valid age scenario',
                        steps: ['Enter age 18', 'Click Submit', 'Check result'],
                        expectedResult: 'Registration accepted for valid age',
                    },
                    {
                        title: 'Second valid age different value',
                        steps: ['Enter age 25', 'Click Submit', 'Check result'],
                        expectedResult: 'Registration accepted for valid age',
                    },
                ],
            },
            makeCtx(''),
        );
        const warnings = results.filter((r) => !r.passed && r.severity === 'warning' && r.invariantId === 'T-13');

        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]?.message).toContain('similar');
    });

    it('warns when coverage overlaps (B → warning)', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Test A',
                        steps: ['Do step A1', 'Do step A2'],
                        expectedResult: 'Result A',
                        coverage: [
                            { criterionId: 'C-1', criterionText: 'First criterion' },
                            { criterionId: 'C-2', criterionText: 'Second criterion' },
                            { criterionId: 'C-3', criterionText: 'Third criterion' },
                        ],
                    },
                    {
                        title: 'Test B',
                        steps: ['Do step B1', 'Do step B2'],
                        expectedResult: 'Result B',
                        coverage: [
                            { criterionId: 'C-1', criterionText: 'First criterion' },
                            { criterionId: 'C-2', criterionText: 'Second criterion' },
                            { criterionId: 'C-3', criterionText: 'Third criterion' },
                            { criterionId: 'C-4', criterionText: 'Fourth criterion' },
                        ],
                    },
                ],
            },
            makeCtx(''),
        );
        const warnings = results.filter((r) => !r.passed && r.severity === 'warning' && r.invariantId === 'T-13');
        const coverageWarnings = warnings.filter((w) => w.message.includes('coverage'));

        expect(coverageWarnings.length).toBeGreaterThan(0);
    });

    it('warns when tests are coupled via shared resource (C → warning)', () => {
        const artifact = {
            tests: [
                {
                    title: 'Create user',
                    steps: ['Navigate to /users', 'Click Add', 'Fill form', 'Submit to create user_carlos'],
                    expectedResult: 'User created successfully',
                },
                {
                    title: 'Delete user',
                    steps: ['Search for user_carlos', 'Open profile', 'Click delete user_carlos'],
                    expectedResult: 'User removed from system',
                },
            ],
        };
        const results = invariantRedundancyCoupling(artifact, makeCtx(''));
        const warnings = results.filter((r) => !r.passed && r.severity === 'warning' && r.invariantId === 'T-13');
        const couplingWarnings = warnings.filter((w) => w.message.includes('coupled'));

        expect(couplingWarnings.length).toBeGreaterThan(0);
    });

    it('passes for EP/BVA variations that should not be flagged', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Age 18 boundary — minimum valid',
                        steps: ['Enter age 18', 'Submit registration'],
                        expectedResult: 'Registration accepted — minimum boundary',
                    },
                    {
                        title: 'Age 65 boundary — maximum valid',
                        steps: ['Enter age 65', 'Submit registration'],
                        expectedResult: 'Registration accepted — maximum boundary',
                    },
                ],
            },
            makeCtx(''),
        );
        // These have identical steps token-wise but different title+result
        // "Enter age 18" vs "Enter age 65": tokens {enter, age, 18, submit, registration} vs {enter, age, 65, submit, registration}
        // Jaccard = 4/5 = 80% → stepsRedundant = true
        // But title+result: "age 18 boundary minimum valid registration accepted minimum boundary" vs "age 65 boundary maximum valid registration accepted maximum boundary"
        // Different enough → titleResultDupe should be false → no error
        const errors = results.filter((r) => !r.passed && r.severity === 'error' && r.invariantId === 'T-13');

        expect(errors).toHaveLength(0);
    });

    it('passes when coverage sets are completely different', () => {
        const artifact = {
            tests: [
                {
                    title: 'Login test',
                    steps: ['Click the login button'],
                    expectedResult: 'Login page appears',
                    coverage: [{ criterionId: 'C-1', criterionText: 'First' }],
                },
                {
                    title: 'Signup test',
                    steps: ['Click the signup button'],
                    expectedResult: 'Signup page appears',
                    coverage: [{ criterionId: 'C-2', criterionText: 'Second' }],
                },
            ],
        };
        const results = invariantRedundancyCoupling(artifact, makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-13')).toBeTruthy();
    });

    it('warns on Portuguese resource coupling', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Criar usuario',
                        steps: ['Preencher formulario', 'Registrar usuario_teste'],
                        expectedResult: 'Usuario criado',
                    },
                    {
                        title: 'Deletar usuario',
                        steps: ['Buscar usuario_teste', 'Abrir perfil', 'Remover usuario_teste'],
                        expectedResult: 'Usuario removido',
                    },
                ],
            },
            makeCtx(''),
        );
        const warnings = results.filter((r) => !r.passed && r.severity === 'warning' && r.invariantId === 'T-13');
        const couplingWarnings = warnings.filter((w) => w.message.includes('coupled'));

        expect(couplingWarnings.length).toBeGreaterThan(0);
    });

    it('warns when test A creates resource and test B deletes different resource (no coupling)', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Create admin',
                        steps: ['Create admin_user'],
                        expectedResult: 'Created',
                    },
                    {
                        title: 'Delete guest',
                        steps: ['Delete guest_user'],
                        expectedResult: 'Deleted',
                    },
                ],
            },
            makeCtx(''),
        );

        // Different resource names → no coupling
        expect(results.some((r) => r.passed && r.invariantId === 'T-13')).toBeTruthy();
    });

    it('detects both error and warning in the same test set', () => {
        const results = invariantRedundancyCoupling(
            {
                tests: [
                    {
                        title: 'Login with valid email accepts',
                        steps: ['Enter email', 'Enter password', 'Click Login'],
                        expectedResult: 'User is logged in to dashboard',
                        coverage: [{ criterionId: 'C-1', criterionText: 'Login' }],
                    },
                    {
                        title: 'Login with valid email accepts v2',
                        steps: ['Enter email', 'Enter password', 'Click Login'],
                        expectedResult: 'User is logged in to dashboard ok',
                        coverage: [{ criterionId: 'C-1', criterionText: 'Login' }],
                    },
                    {
                        title: 'Create user bob via form',
                        steps: ['Click Add', 'Fill form', 'Create user_bob'],
                        expectedResult: 'User bob created successfully',
                        coverage: [{ criterionId: 'C-2', criterionText: 'Create' }],
                    },
                    {
                        title: 'Delete user bob from system',
                        steps: ['Search for user_bob', 'Open profile', 'Delete user_bob'],
                        expectedResult: 'User bob deleted from system',
                        coverage: [{ criterionId: 'C-3', criterionText: 'Delete' }],
                    },
                ],
            },
            makeCtx(''),
        );
        const errors = results.filter((r) => !r.passed && r.severity === 'error' && r.invariantId === 'T-13');
        const warnings = results.filter((r) => !r.passed && r.severity === 'warning' && r.invariantId === 'T-13');

        expect(errors.length).toBeGreaterThan(0);

        const couplingWarnings = warnings.filter((w) => w.message.includes('coupled'));

        expect(couplingWarnings.length).toBeGreaterThan(0);
    });
});

describe('T-01 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantCoverageComplete({ tests: [] }, makeCtx('Acceptance Criteria: User can log in'));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-01')).toBeTruthy();
    });
});

describe('T-02 edge cases', () => {
    it('handles non-object artifact', () => {
        const results = invariantCoverageThreshold('string', makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-02')).toBeTruthy();
    });

    it('handles invalid coverage value', () => {
        const results = invariantCoverageThreshold({ coverageTable: { coverage: -1 } }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-02')).toBeTruthy();
    });

    it('passes when coverage < 90% with justified gaps', () => {
        const results = invariantCoverageThreshold(
            { coverageTable: { coverage: 80, gaps: [{ reason: 'Not implemented yet' }] } },
            makeCtx(''),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-02')).toBeTruthy();
    });

    it('fails when gaps are missing reasons', () => {
        const results = invariantCoverageThreshold(
            { coverageTable: { coverage: 80, gaps: [{ reason: '' }] } },
            makeCtx(''),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-02')).toBeTruthy();
    });
});

describe('T-03 edge cases', () => {
    it('warns when input has mutation keywords but too few tests', () => {
        const results = invariantStateMutation(
            { tests: [{ title: 'Test', steps: ['Create user'], expectedResult: 'OK' }] },
            makeCtx('user can create and delete records'),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-03')).toBeTruthy();
    });
});

describe('T-04 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantConcreteSteps({ tests: [] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-04')).toBeTruthy();
    });
});

describe('T-05 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantVerifiableResult({ tests: [] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-05')).toBeTruthy();
    });
});

describe('T-06 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantUniqueTitles({ tests: [] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-06')).toBeTruthy();
    });
});

describe('T-07 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantPreconditionsExist({ tests: [] }, makeCtx(''));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-07')).toBeTruthy();
    });
});

describe('T-09 edge cases', () => {
    it('passes for non-object artifact', () => {
        const results = invariantNumericConsistency('string', makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-09')).toBeTruthy();
    });

    it('passes for array artifact', () => {
        const results = invariantNumericConsistency([1, 2, 3], makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-09')).toBeTruthy();
    });
});

describe('T-10 edge cases', () => {
    it('passes for fewer than 2 tests', () => {
        const results = invariantNoDuplicateTests({ tests: [{ title: 'Only test' }] }, makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-10')).toBeTruthy();
    });

    it('warns on similar test steps', () => {
        const results = invariantNoDuplicateTests(
            {
                tests: [
                    { title: 'Test A', steps: ['Click button', 'Enter text', 'Submit'] },
                    { title: 'Test B', steps: ['Click button', 'Enter text', 'Submit'] },
                ],
            },
            makeCtx(''),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'T-10')).toBeTruthy();
    });
});

describe('T-11 edge cases', () => {
    it('fails when no tests exist', () => {
        const results = invariantPartitionCoverage({ tests: [] }, makeCtx('ages between 18 and 65'));

        expect(results.some((r) => !r.passed && r.invariantId === 'T-11')).toBeTruthy();
    });
});

describe('T-01 more edge cases', () => {
    it('matches criteria via test title', () => {
        const results = invariantCoverageComplete(
            { tests: [{ title: 'User can log in to dashboard' }] },
            makeCtx('Acceptance Criteria: User can log in'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'T-01')).toBeTruthy();
    });
});

describe('T-09 more edge cases', () => {
    it('skips non-numeric count values', () => {
        const results = invariantNumericConsistency({ item_count: 'N/A', items: [1, 2] }, makeCtx(''));

        expect(results.some((r) => r.passed && r.invariantId === 'T-09')).toBeTruthy();
    });
});
