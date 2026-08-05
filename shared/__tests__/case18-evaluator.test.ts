import { describe, it, expect } from 'vitest';
import { evaluateDeterministic, CASE18_FLOOR_PROVENANCE } from '../quality/case18-deterministic.js';
import { evaluateCase18, generateEvaluationReport } from '../quality/case18-evaluator.js';
import { ECSPOL960_BASELINE, ECSPOL960_STORY } from '../quality/case18-benchmarks.js';
import type { GeneratedTestCase } from '../quality/case18-types.js';

// --- Fixtures ---

const PERFECT_TEST: GeneratedTestCase[] = [
    {
        title: 'Valid login redirects to dashboard',
        steps: ['Navigate to /login', 'Enter valid email', 'Enter correct password', 'Click Sign In'],
        expectedResult: 'User is redirected to /dashboard and sees welcome message',
        preConditions: [{ type: 'create', description: 'User must be registered with valid admin credentials' }],
        coverage: [{ criterionId: 'C-1', criterionText: 'User can log in with valid credentials' }],
        evidence: ['Login page must authenticate users'],
    },
    {
        title: 'Empty form submission shows validation errors',
        steps: ['Navigate to /login', 'Leave all fields empty', 'Click Sign In', 'Review validation messages'],
        expectedResult: 'Validation errors appear for email and password fields',
        preConditions: [{ type: 'create', description: 'Login page is displayed with empty form' }],
        coverage: [{ criterionId: 'C-2', criterionText: 'Invalid credentials show error message' }],
        evidence: ['System must validate required fields'],
    },
];

const VAGUE_TEST: GeneratedTestCase[] = [
    {
        title: 'Test login',
        steps: ['Validate that login works', 'Ensure user can log in', 'Check that page is displayed'],
        expectedResult: 'Works correctly',
        preConditions: [{ type: 'create', description: 'Login setup' }],
        coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }],
        evidence: [],
    },
];

const REDUNDANT_TEST: GeneratedTestCase[] = [
    {
        title: 'Test A',
        steps: ['Click button', 'Enter text', 'Submit form'],
        expectedResult: 'Form is submitted',
        coverage: [{ criterionId: 'C-1', criterionText: 'Criterion A' }],
    },
    {
        title: 'Test B',
        steps: ['Click button', 'Enter text', 'Submit form'],
        expectedResult: 'Form is submitted successfully',
        coverage: [{ criterionId: 'C-2', criterionText: 'Criterion B' }],
    },
];

const BVA_TEST: GeneratedTestCase[] = [
    {
        title: 'Age 17 — below minimum',
        steps: ['Enter age 17', 'Submit form'],
        expectedResult: 'Validation error: age must be 18 or older',
        coverage: [{ criterionId: 'C-1', criterionText: 'Age must be between 18 and 65' }],
    },
    {
        title: 'Age 18 — minimum boundary',
        steps: ['Enter age 18', 'Submit form'],
        expectedResult: 'Form accepted',
        coverage: [{ criterionId: 'C-1', criterionText: 'Age must be between 18 and 65' }],
    },
    {
        title: 'Age 65 — maximum boundary',
        steps: ['Enter age 65', 'Submit form'],
        expectedResult: 'Form accepted',
        coverage: [{ criterionId: 'C-1', criterionText: 'Age must be between 18 and 65' }],
    },
    {
        title: 'Age 66 — above maximum',
        steps: ['Enter age 66', 'Submit form'],
        expectedResult: 'Validation error: age must be 65 or younger',
        coverage: [{ criterionId: 'C-1', criterionText: 'Age must be between 18 and 65' }],
    },
];

// --- Tests ---

describe('evaluateDeterministic', () => {
    describe('coverage', () => {
        it('returns 100 when all criteria are covered', () => {
            const result = evaluateDeterministic(
                PERFECT_TEST,
                'C-1: User can log in\nC-2: Invalid credentials show error',
            );
            expect(result.metrics.coverage.score).toBe(100);
        });

        it('returns <100 when criteria are missing', () => {
            const result = evaluateDeterministic(
                PERFECT_TEST,
                'C-1: User can log in\nC-2: Error shown\nC-3: Third criterion',
            );
            expect(result.metrics.coverage.score).toBeLessThan(100);
        });

        it('returns 100 when no criteria provided', () => {
            const result = evaluateDeterministic(PERFECT_TEST, '');
            expect(result.metrics.coverage.score).toBe(100);
        });
    });

    describe('step concreteness', () => {
        it('scores high for imperative steps', () => {
            const result = evaluateDeterministic(PERFECT_TEST, '');
            expect(result.metrics.stepConcreteness.score).toBeGreaterThanOrEqual(75);
        });

        it('scores low for vague steps', () => {
            const result = evaluateDeterministic(VAGUE_TEST, '');
            expect(result.metrics.stepConcreteness.score).toBeLessThan(50);
        });

        it('detects vague verbs like "validate" and "ensure"', () => {
            const result = evaluateDeterministic(VAGUE_TEST, '');
            expect(result.metrics.stepConcreteness.failed.length).toBeGreaterThan(0);
        });
    });

    describe('precondition specificity', () => {
        it('scores 100 when no preconditions', () => {
            const result = evaluateDeterministic([{ title: 'Test', steps: ['Step'], expectedResult: 'Result' }], '');
            expect(result.metrics.preconditionSpecificity.score).toBe(100);
        });

        it('scores high for specific preconditions', () => {
            const result = evaluateDeterministic(PERFECT_TEST, '');
            expect(result.metrics.preconditionSpecificity.score).toBe(100);
        });

        it('scores low for generic preconditions', () => {
            const result = evaluateDeterministic(VAGUE_TEST, '');
            expect(result.metrics.preconditionSpecificity.score).toBeLessThan(50);
        });
    });

    describe('BVA application', () => {
        it('returns 100 when no numeric ranges in criteria', () => {
            const result = evaluateDeterministic(PERFECT_TEST, 'No ranges here');
            expect(result.metrics.bvaApplication.score).toBe(100);
        });

        it('detects boundary values when present', () => {
            const result = evaluateDeterministic(BVA_TEST, 'Age must be between 18 and 65');
            expect(result.metrics.bvaApplication.score).toBe(100);
        });

        it('penalizes missing boundaries', () => {
            const incompleteTest: GeneratedTestCase[] = [
                {
                    title: 'Age 18 only',
                    steps: ['Enter 18'],
                    expectedResult: 'Accepted',
                    coverage: [{ criterionId: 'C-1', criterionText: 'Age 18-65' }],
                },
            ];
            const result = evaluateDeterministic(incompleteTest, 'Age must be between 18 and 65');
            expect(result.metrics.bvaApplication.score).toBeLessThan(100);
        });
    });

    describe('EP application', () => {
        it('returns 100 when no constrained fields in criteria', () => {
            const result = evaluateDeterministic(PERFECT_TEST, 'No specific constraints here');
            expect(result.metrics.epApplication.score).toBe(100);
        });

        it('scores 100 when constrained field has an invalid-partition test', () => {
            const epTest: GeneratedTestCase[] = [
                {
                    title: 'Email must be valid',
                    steps: ['Enter email invalid@bad', 'Submit form'],
                    expectedResult: 'Validation error shown for invalid email',
                    coverage: [{ criterionId: 'C-1', criterionText: 'Email must be valid' }],
                },
            ];
            const result = evaluateDeterministic(epTest, 'Email must be valid');
            expect(result.metrics.epApplication.score).toBe(100);
        });

        it('penalizes constrained field without invalid-partition test', () => {
            const onlyValidTest: GeneratedTestCase[] = [
                {
                    title: 'Email valid case',
                    steps: ['Enter valid email user@example.com', 'Submit form'],
                    expectedResult: 'Form accepted',
                    coverage: [{ criterionId: 'C-1', criterionText: 'Email must be valid' }],
                },
            ];
            const result = evaluateDeterministic(onlyValidTest, 'Email must be valid');
            expect(result.metrics.epApplication.score).toBeLessThan(100);
            expect(result.metrics.epApplication.failed.length).toBeGreaterThan(0);
        });

        it('detects null/empty partitions as invalid coverage', () => {
            const emptyTest: GeneratedTestCase[] = [
                {
                    title: 'Password cannot be empty',
                    steps: ['Enter empty password', 'Submit form'],
                    expectedResult: 'Validation error shown',
                    coverage: [{ criterionId: 'C-1', criterionText: 'Password cannot be empty' }],
                },
            ];
            const result = evaluateDeterministic(emptyTest, 'Password cannot be empty');
            expect(result.metrics.epApplication.score).toBe(100);
        });
    });

    describe('evidence citations', () => {
        it('scores 100 when all tests have evidence', () => {
            const result = evaluateDeterministic(PERFECT_TEST, '');
            expect(result.metrics.evidenceCitations.score).toBe(100);
        });

        it('scores 0 when no tests have evidence', () => {
            const noEvidence: GeneratedTestCase[] = [
                { title: 'Test', steps: ['Step'], expectedResult: 'Result', evidence: [] },
            ];
            const result = evaluateDeterministic(noEvidence, '');
            expect(result.metrics.evidenceCitations.score).toBe(0);
        });
    });

    describe('redundancy', () => {
        it('scores 100 when no redundant tests', () => {
            const result = evaluateDeterministic(PERFECT_TEST, '');
            expect(result.metrics.redundancy.score).toBe(100);
        });

        it('penalizes redundant test pairs', () => {
            const result = evaluateDeterministic(REDUNDANT_TEST, '');
            expect(result.metrics.redundancy.score).toBeLessThan(100);
            expect(result.metrics.redundancy.failed.length).toBeGreaterThan(0);
        });
    });

    describe('overall score', () => {
        it('returns weighted average of all metrics', () => {
            const result = evaluateDeterministic(PERFECT_TEST, 'C-1: Criterion');
            expect(result.score).toBeGreaterThanOrEqual(75);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('provenance weights sum to 1.0', () => {
            const weights = Object.values(CASE18_FLOOR_PROVENANCE.weights);
            const sum = weights.reduce((s, w) => s + w.value, 0);
            expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
        });
    });
});

describe('evaluateCase18', () => {
    it('returns grade B or higher for high-quality tests', () => {
        const result = evaluateCase18(PERFECT_TEST, 'C-1: User can log in\nC-2: Invalid credentials show error');
        expect(result.score).toBeGreaterThanOrEqual(75);
        expect(['A', 'B']).toContain(result.grade);
    });

    it('returns low grade for low-quality tests', () => {
        const result = evaluateCase18(VAGUE_TEST, 'Some criterion');
        // Score correction (Rule 19.5, weight-bug fix): EP metric (10%) was added,
        // weights now sum to 100%. VAGUE_TEST scores 55 → grade D (40 ≤ 55 < 60).
        expect(result.score).toBeLessThan(60);
        expect(['D', 'F']).toContain(result.grade);
    });

    it('populates details.passed and details.failed', () => {
        const result = evaluateCase18(PERFECT_TEST, 'C-1: Criterion');
        expect(result.details.passed.length).toBeGreaterThan(0);
    });

    it('includes deterministic layer result', () => {
        const result = evaluateCase18(PERFECT_TEST, '');
        expect(result.layers.deterministic).toBeDefined();
        expect(result.layers.deterministic.metrics).toBeDefined();
    });
});

describe('generateEvaluationReport', () => {
    it('generates valid HTML', () => {
        const evalResult = evaluateCase18(PERFECT_TEST, 'C-1: Criterion');
        const html = generateEvaluationReport(evalResult);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Case18 Quality Evaluator');
        expect(html).toContain(String(evalResult.score));
    });
});

describe('ECSPOL-960 baseline', () => {
    it('has 14 test cases', () => {
        expect(ECSPOL960_BASELINE).toHaveLength(14);
    });

    it('evaluates with reasonable score', () => {
        const result = evaluateCase18(ECSPOL960_BASELINE, ECSPOL960_STORY.description);
        expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('all tests have coverage', () => {
        for (const tc of ECSPOL960_BASELINE) {
            expect(tc.coverage).toBeDefined();
            expect((tc.coverage ?? []).length).toBeGreaterThan(0);
        }
    });
});
