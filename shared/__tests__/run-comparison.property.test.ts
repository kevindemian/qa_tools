import * as fc from 'fast-check';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MetricsRun } from '../types/data-hub.js';
import { nonNull } from '../test-utils.js';
import { calcRunPassRate } from '../data-hub/compute/run-pass-rate.js';

vi.mock('../llm/llm-client.js', () => ({
    llmPrompt: vi.fn().mockResolvedValue('analysis'),
    getLlmClientMetrics: vi.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: vi.fn(),
    parseRetryAfter: vi.fn(() => 2000),
}));

import { llmPrompt } from '../llm/llm-client.js';
import { compareRuns } from '../quality/run-comparison.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

const MetricsRunArb: fc.Arbitrary<MetricsRun> = fc.record({
    timestamp: fc.constantFrom('2026-01-01T00:00:00.000Z', '2026-06-15T12:30:00.000Z', '2025-12-31T23:59:59.000Z'),
    project: fc
        .string({ minLength: 1, maxLength: 10 })
        .filter((s) => /^[a-zA-Z0-9_ -]+$/.test(s) && s.trim().length > 0),
    total: fc.nat({ max: 1000 }),
    passed: fc.nat({ max: 1000 }),
    failed: fc.nat({ max: 1000 }),
    skipped: fc.nat({ max: 1000 }),
    duration: fc.nat({ max: 3600000 }),
    tests: fc.constant([]),
});

describe('Run Comparison.Property', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLlmPrompt.mockResolvedValue('analysis');
    });

    describe('CompareRuns PBT invariants', () => {
        it('pass rate is always 0-100 regardless of input values', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                    mockLlmPrompt.mockResolvedValue('analysis');
                    const result = await compareRuns(runA, runB);

                    expect(typeof result).toBe('string');
                }),
            );
        });

        it('lLM prompt includes run summary with date, project, and metrics', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                    mockLlmPrompt.mockClear();
                    mockLlmPrompt.mockResolvedValue('analysis');
                    await compareRuns(runA, runB);

                    expect(mockLlmPrompt).toHaveBeenCalledTimes(1);

                    const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];

                    expect(callArg.user).toContain('=== RUN A (older) ===');
                    expect(callArg.user).toContain(`Date: ${runA.timestamp.slice(0, 10)}`);
                    expect(callArg.user).toContain(`Project: ${runA.project}`);
                }),
            );
        });

        it('lLM prompt includes pass rate for both runs', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                    mockLlmPrompt.mockClear();
                    mockLlmPrompt.mockResolvedValue('analysis');
                    await compareRuns(runA, runB);

                    expect(mockLlmPrompt).toHaveBeenCalledTimes(1);

                    const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
                    const rateA = Math.round(calcRunPassRate(runA));

                    expect(callArg.user).toContain(`Pass rate: ${rateA}%`);

                    const rateB = Math.round(calcRunPassRate(runB));

                    expect(callArg.user).toContain(`Pass rate: ${rateB}%`);
                }),
            );
        });

        it('null run returns early message without calling LLM', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(MetricsRunArb, async (runA) => {
                    mockLlmPrompt.mockClear();
                    const result = await compareRuns(null, runA);

                    expect(result).toBe('No run data provided');
                    expect(mockLlmPrompt).not.toHaveBeenCalled();
                }),
            );
        });

        it('pass rate is 0 when all tests fail', async () => {
            expect.hasAssertions();

            const failingRun: MetricsRun = {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'test',
                total: 10,
                passed: 0,
                failed: 10,
                skipped: 0,
                duration: 5000,
                tests: [],
            };
            mockLlmPrompt.mockClear();
            mockLlmPrompt.mockResolvedValue('analysis');
            await compareRuns(failingRun, failingRun);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);

            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];

            expect(callArg.user).toContain('Pass rate: 0%');
        });

        it('pass rate is 100 when all tests pass', async () => {
            expect.hasAssertions();

            const passingRun: MetricsRun = {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'test',
                total: 10,
                passed: 10,
                failed: 0,
                skipped: 0,
                duration: 5000,
                tests: [],
            };
            mockLlmPrompt.mockClear();
            mockLlmPrompt.mockResolvedValue('analysis');
            await compareRuns(passingRun, passingRun);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);

            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];

            expect(callArg.user).toContain('Pass rate: 100%');
        });

        it('pass rate is 0 when no tests executed', async () => {
            expect.hasAssertions();

            const noExecRun: MetricsRun = {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'test',
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                tests: [],
            };
            mockLlmPrompt.mockClear();
            mockLlmPrompt.mockResolvedValue('analysis');
            await compareRuns(noExecRun, noExecRun);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);

            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];

            expect(callArg.user).toContain('Pass rate: 0%');
        });
    });
});
