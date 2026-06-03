jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));
jest.mock('./logger', () => ({
    rootLogger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));
jest.mock('fs');
jest.mock('./prompts/__fixtures__/index', () => ({
    loadFailureAnalysisFixtures: jest.fn(() => [
        {
            name: 'fa1',
            description: 'Failure analysis fixture',
            input: 'Test failure output',
            validate: { type: 'json-schema', minTests: 1, expectedCategories: [] },
        },
    ]),
    loadUserStoryFixtures: jest.fn(() => [
        {
            name: 'us1',
            description: 'User story fixture',
            input: { story: 'As a user I want to log in', criteria: ['Login form is displayed'] },
            validate: {
                type: 'json-array',
                minItems: 2,
                itemSchema: { title: 'string', steps: 'array', expectedResult: 'string' },
            },
            coverage: { expectedCriteria: ['Login form is displayed'], numericRanges: [] },
        },
        {
            name: 'numeric-age-validation',
            description: 'Age validation fixture',
            input: { story: 'Age validation', criteria: [] },
            validate: { type: 'json-array', minItems: 4, itemSchema: {} },
            coverage: {
                expectedCriteria: [
                    'Registration succeeds for age 18',
                    'Registration fails for age 17',
                    'Registration fails for age 66',
                ],
                numericRanges: [{ field: 'age', min: 18, max: 65 }],
            },
        },
    ]),
    loadClassifyFixtures: jest.fn(() => [
        {
            name: 'cl1',
            description: 'Classify fixture',
            input: { title: 'Test timeout', error: 'Request timed out' },
            expectedCategory: 'ASSERTION',
        },
    ]),
}));

import {
    validateJsonSchema,
    validateJsonArray,
    validateClassify,
    computeCoverageMetrics,
    runBenchmark,
} from './llm-benchmark';
import { llmPrompt } from './llm-client';
import { withEnv } from './test-utils';

const VALID_SCHEMA_ITEM = {
    title: 'Login test',
    classification: 'A',
    severity: 'high',
    recommendation: 'Fix this properly now with enough text',
};

const VALID_ARRAY_ITEM = {
    title: 'Login form displays',
    steps: ['Navigate to login page'],
    expectedResult: 'User sees a login form with username and password fields',
};

// ---------------------------------------------------------------------------
// validateJsonSchema
// ---------------------------------------------------------------------------

describe('validateJsonSchema', () => {
    it('returns null for valid JSON with 2 test cases', () => {
        const body = JSON.stringify({ tests: [VALID_SCHEMA_ITEM, VALID_SCHEMA_ITEM] });
        expect(validateJsonSchema(body, 1)).toBeNull();
    });

    it('returns error for malformed JSON (parse error)', () => {
        const result = validateJsonSchema('{ broken json', 1);
        expect(result).toBe('Invalid JSON');
    });

    it('returns error when tests array is empty', () => {
        const body = JSON.stringify({ tests: [] });
        const result = validateJsonSchema(body, 1);
        expect(result).toContain('Too few tests');
    });

    it('returns error when test case lacks title field', () => {
        const body = JSON.stringify({
            tests: [
                { classification: 'A', severity: 'high', recommendation: 'Fix this properly now with enough text' },
            ],
        });
        const result = validateJsonSchema(body, 1);
        expect(result).not.toBeNull();
        expect(result).toContain('title');
    });

    it('returns error when test case lacks severity field', () => {
        const body = JSON.stringify({
            tests: [
                { title: 'Login test', classification: 'A', recommendation: 'Fix this properly now with enough text' },
            ],
        });
        const result = validateJsonSchema(body, 1);
        expect(result).not.toBeNull();
        expect(result).toContain('severity');
    });
});

// ---------------------------------------------------------------------------
// validateJsonArray
// ---------------------------------------------------------------------------

describe('validateJsonArray', () => {
    it('returns null for valid JSON array', () => {
        const body = JSON.stringify([VALID_ARRAY_ITEM]);
        expect(validateJsonArray(body, 1)).toBeNull();
    });

    it('returns error when array is empty', () => {
        const body = JSON.stringify([]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('Too few items');
    });

    it('returns error when an element lacks steps', () => {
        const body = JSON.stringify([
            {
                title: 'Login form displays',
                expectedResult: 'User sees a login form with username and password fields',
            },
        ]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('invalid steps');
    });

    it('returns error when expectedResult is shorter than 10 characters', () => {
        const body = JSON.stringify([{ title: 'Login form displays', steps: ['Step 1'], expectedResult: 'Short' }]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('invalid expectedResult');
    });

    it('returns error when body is an object instead of an array', () => {
        const body = JSON.stringify({ title: 'not an array' });
        const result = validateJsonArray(body, 1);
        expect(result).toBe('Not an array');
    });
});

// ---------------------------------------------------------------------------
// validateClassify
// ---------------------------------------------------------------------------

describe('validateClassify', () => {
    it('returns null when body contains the expected category', () => {
        expect(validateClassify('ASSERTION: expected true got false', 'ASSERTION')).toBeNull();
    });

    it('returns error when body contains a different category', () => {
        const result = validateClassify('TIMEOUT: request timed out after 30s', 'ASSERTION');
        expect(result).toContain('Wrong category');
        expect(result).toContain('ASSERTION');
        expect(result).toContain('TIMEOUT');
    });

    it('returns error for empty body', () => {
        const result = validateClassify('', 'ASSERTION');
        expect(result).toContain('Invalid format');
    });
});

// ---------------------------------------------------------------------------
// computeCoverageMetrics
// ---------------------------------------------------------------------------

describe('computeCoverageMetrics', () => {
    const ageFixture = {
        name: 'numeric-age-validation',
        description: '',
        input: { story: '', criteria: [] },
        validate: { type: 'json-array' as const, minItems: 4, itemSchema: {} },
        coverage: {
            expectedCriteria: [
                'Registration succeeds for age 18',
                'Registration fails for age 17',
                'Registration fails for age 66',
            ],
            numericRanges: [{ field: 'age', min: 18, max: 65 }],
        },
    };

    it('returns zero metrics for invalid JSON body', () => {
        const result = computeCoverageMetrics('not json', ageFixture);
        expect(result.criteriaCoverage).toBe(0);
        expect(result.totalTests).toBe(0);
    });

    it('computes full coverage when all criteria and boundaries are present', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 is accepted',
                steps: ['Enter age 18', 'Submit form'],
                expectedResult: 'User is accepted',
                coverage: [{ criterionId: 'C-1', criterionText: 'Registration succeeds for age 18' }],
            },
            {
                title: 'Age 17 is rejected',
                steps: ['Enter age 17', 'Submit form'],
                expectedResult: 'User is rejected',
                coverage: [{ criterionId: 'C-2', criterionText: 'Registration fails for age 17' }],
            },
            {
                title: 'Age 66 is rejected',
                steps: ['Enter age 66', 'Submit form'],
                expectedResult: 'User is rejected',
                coverage: [{ criterionId: 'C-3', criterionText: 'Registration fails for age 66' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);
        expect(metrics.criteriaCoverage).toBe(1);
        expect(metrics.totalCriteria).toBe(3);
        expect(metrics.coveredCriteriaCount).toBe(3);
    });

    it('computes partial coverage when some criteria are missing', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 is accepted',
                steps: ['Enter age 18', 'Submit form'],
                expectedResult: 'User is accepted',
                coverage: [{ criterionId: 'C-1', criterionText: 'Registration succeeds for age 18' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);
        expect(metrics.criteriaCoverage).toBeCloseTo(1 / 3);
        expect(metrics.coveredCriteriaCount).toBe(1);
        expect(metrics.totalCriteria).toBe(3);
    });

    it('computes boundary coverage from test steps containing boundary values', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 boundary',
                steps: ['Enter age 18', 'Submit'],
                expectedResult: 'Accepted',
            },
            {
                title: 'Age 17 boundary',
                steps: ['Enter age 17', 'Submit'],
                expectedResult: 'Rejected',
            },
            {
                title: 'Age 65 boundary',
                steps: ['Enter age 65', 'Submit'],
                expectedResult: 'Accepted',
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);
        // 18, 17, 65 covered — missing 66 → 3/4
        expect(metrics.boundaryCoverage).toBe(0.75);
    });

    it('handles fixture with empty numeric ranges', () => {
        const noRangeFixture = {
            ...ageFixture,
            coverage: { expectedCriteria: ['Criterion 1'], numericRanges: [] },
        };
        const body = JSON.stringify([
            {
                title: 'Test',
                steps: ['Do something'],
                expectedResult: 'Works',
                coverage: [{ criterionId: 'C-1', criterionText: 'Criterion 1' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, noRangeFixture);
        expect(metrics.criteriaCoverage).toBe(1);
        expect(metrics.partitionCoverage).toBe(0);
        expect(metrics.boundaryCoverage).toBe(0);
    });

    it('handles empty test array', () => {
        const metrics = computeCoverageMetrics('[]', ageFixture);
        expect(metrics.criteriaCoverage).toBe(0);
        expect(metrics.totalTests).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// runBenchmark
// ---------------------------------------------------------------------------

describe('runBenchmark', () => {
    let stdoutSpy: jest.SpyInstance;
    let restoreEnv: (() => void) | null = null;

    beforeEach(() => {
        stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (restoreEnv) {
            restoreEnv();
            restoreEnv = null;
        }
    });

    it('prints skip message and returns early when BENCHMARK env var is not true', async () => {
        restoreEnv = withEnv({ BENCHMARK: 'false' });

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    });

    it('loads fixtures and executes all benchmark types when BENCHMARK is true', async () => {
        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const llmMock = jest.mocked(llmPrompt);
        llmMock.mockImplementation(async (opts) => {
            const callerId = opts.callerId;
            if (callerId === 'benchmark-fa') {
                return JSON.stringify({
                    tests: [
                        {
                            title: 'Login validation',
                            classification: 'B',
                            severity: 'high',
                            recommendation: 'Add input validation on the login endpoint',
                        },
                    ],
                });
            }
            if (callerId === 'benchmark-us') {
                return JSON.stringify([
                    {
                        title: 'Login form is rendered',
                        steps: ['Open browser', 'Navigate to /login'],
                        expectedResult: 'User sees a login form with username and password inputs',
                    },
                    {
                        title: 'Error on wrong password',
                        steps: ['Type wrong password', 'Click submit'],
                        expectedResult: 'Error message "Invalid credentials" is displayed',
                    },
                ]);
            }
            if (callerId === 'benchmark-cl') {
                return 'ASSERTION: Expected condition to be true but got false';
            }
            return '';
        });

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Loading fixtures'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Running'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('BENCHMARK RESULTS'));
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateJsonSchema
// ---------------------------------------------------------------------------

describe('validateJsonSchema — edge cases', () => {
    it('returns error when tests field is not an array', () => {
        const body = JSON.stringify({ tests: 'not-an-array' });
        expect(validateJsonSchema(body, 1)).toBe('Missing tests array');
    });

    it('returns error when tests field is null', () => {
        const body = JSON.stringify({ tests: null });
        expect(validateJsonSchema(body, 1)).toBe('Missing tests array');
    });

    it('returns error when minTests is higher than available test count', () => {
        const body = JSON.stringify({ tests: [VALID_SCHEMA_ITEM] });
        const result = validateJsonSchema(body, 10);
        expect(result).toContain('Too few tests');
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateJsonArray
// ---------------------------------------------------------------------------

describe('validateJsonArray — edge cases', () => {
    it('returns error when title is shorter than 5 characters', () => {
        const body = JSON.stringify([
            { title: 'AB', steps: ['Step 1'], expectedResult: 'Long enough expected result text here' },
        ]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('invalid title');
    });

    it('returns error when title field is missing', () => {
        const body = JSON.stringify([{ steps: ['Step 1'], expectedResult: 'Long enough expected result text here' }]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('invalid title');
    });

    it('returns error when steps is not an array', () => {
        const body = JSON.stringify([
            { title: 'Valid title', steps: 'not-an-array', expectedResult: 'Long enough expected result text here' },
        ]);
        const result = validateJsonArray(body, 1);
        expect(result).toContain('invalid steps');
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateClassify
// ---------------------------------------------------------------------------

describe('validateClassify — edge cases', () => {
    it('accepts any of the valid category prefixes', () => {
        expect(validateClassify('TIMEOUT: connection dropped', 'TIMEOUT')).toBeNull();
        expect(validateClassify('ENVIRONMENT: missing env var', 'ENVIRONMENT')).toBeNull();
        expect(validateClassify('FLAKY: intermittently fails', 'FLAKY')).toBeNull();
        expect(validateClassify('APPLICATION: null pointer', 'APPLICATION')).toBeNull();
        expect(validateClassify('UNKNOWN: no clear cause', 'UNKNOWN')).toBeNull();
    });

    it('returns error when body has no colon separator', () => {
        const result = validateClassify('ASSERTION without colon', 'ASSERTION');
        expect(result).toContain('Invalid format');
    });

    it('returns error when body contains only whitespace', () => {
        const result = validateClassify('   ', 'ASSERTION');
        expect(result).toContain('Invalid format');
    });
});

// ---------------------------------------------------------------------------
// runBenchmark — additional edge cases
// ---------------------------------------------------------------------------

describe('runBenchmark — error handling', () => {
    let stdoutSpy: jest.SpyInstance;
    let restoreEnv: (() => void) | null = null;

    beforeEach(() => {
        stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (restoreEnv) {
            restoreEnv();
            restoreEnv = null;
        }
    });

    it('reports failure when llmPrompt throws', async () => {
        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const llmMock = jest.mocked(llmPrompt);
        llmMock.mockRejectedValue(new Error('API timeout'));

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('API timeout'));
    });

    it('handles empty fixture lists gracefully', async () => {
        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const fixturesModule = jest.requireMock<{
            loadFailureAnalysisFixtures: jest.Mock;
            loadUserStoryFixtures: jest.Mock;
            loadClassifyFixtures: jest.Mock;
        }>('./prompts/__fixtures__/index');
        fixturesModule.loadFailureAnalysisFixtures.mockReturnValue([]);
        fixturesModule.loadUserStoryFixtures.mockReturnValue([]);
        fixturesModule.loadClassifyFixtures.mockReturnValue([]);

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Loading fixtures'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('BENCHMARK RESULTS'));
    });
});
