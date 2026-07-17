vi.mock('../llm-client', () => ({ llmPrompt: vi.fn() }));
vi.mock('../logger', () => ({
    rootLogger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));
vi.mock('fs');
vi.mock('../prompts/__fixtures__/index', () => ({
    loadFailureAnalysisFixtures: vi.fn(() => [
        {
            name: 'fa1',
            description: 'Failure analysis fixture',
            input: 'Test failure output',
            validate: { type: 'json-schema', minTests: 1, expectedCategories: [] },
        },
    ]),
    loadUserStoryFixtures: vi.fn(() => [
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
    loadClassifyFixtures: vi.fn(() => [
        {
            name: 'cl1',
            description: 'Classify fixture',
            input: { title: 'Test timeout', error: 'Request timed out' },
            expectedCategory: 'ASSERTION',
        },
    ]),
}));

import { runBenchmark } from '../llm-benchmark.js';
import { llmPrompt } from '../llm-client.js';
import type { Mock } from 'vitest';
import { withEnv } from '../test-utils.js';

// ---------------------------------------------------------------------------
// runBenchmark
// ---------------------------------------------------------------------------

describe('RunBenchmark', () => {
    let stdoutSpy: Mock;
    let restoreEnv: (() => void) | null = null;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (restoreEnv) {
            restoreEnv();
            restoreEnv = null;
        }
    });

    it('prints skip message and returns early when BENCHMARK env var is not true', async () => {
        expect.hasAssertions();

        restoreEnv = withEnv({ BENCHMARK: 'false' });

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    });

    it('loads fixtures and executes all benchmark types when BENCHMARK is true', async () => {
        expect.hasAssertions();

        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const llmMock = vi.mocked(llmPrompt);
        llmMock.mockImplementation(async (opts) => {
            await Promise.resolve();
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
// runBenchmark — error handling
// ---------------------------------------------------------------------------

describe('RunBenchmark — error handling', () => {
    let stdoutSpy: Mock;
    let restoreEnv: (() => void) | null = null;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (restoreEnv) {
            restoreEnv();
            restoreEnv = null;
        }
    });

    it('reports failure when llmPrompt throws', async () => {
        expect.hasAssertions();

        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const llmMock = vi.mocked(llmPrompt);
        llmMock.mockRejectedValue(new Error('API timeout'));

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('API timeout'));
    });

    it('handles empty fixture lists gracefully', async () => {
        expect.hasAssertions();

        restoreEnv = withEnv({ BENCHMARK: 'true' });

        const fixturesModule = await vi.importMock<{
            loadFailureAnalysisFixtures: Mock;
            loadUserStoryFixtures: Mock;
            loadClassifyFixtures: Mock;
        }>('../prompts/__fixtures__/index');
        fixturesModule.loadFailureAnalysisFixtures.mockReturnValue([]);
        fixturesModule.loadUserStoryFixtures.mockReturnValue([]);
        fixturesModule.loadClassifyFixtures.mockReturnValue([]);

        await runBenchmark();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Loading fixtures'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('BENCHMARK RESULTS'));
    });
});
