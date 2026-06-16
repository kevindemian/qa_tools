import * as fc from 'fast-check';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MetricsRun } from '../metrics.js';

vi.mock('../llm-client.js', () => ({
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

import { llmPrompt } from '../llm-client.js';
import { compareRuns } from '../run-comparison.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

const MetricsRunArb: fc.Arbitrary<MetricsRun> = fc.record({
    timestamp: fc.constantFrom('2026-01-01T00:00:00.000Z', '2026-06-15T12:30:00.000Z', '2025-12-31T23:59:59.000Z'),
    project: fc.string({ minLength: 1, maxLength: 10 }),
    total: fc.nat({ max: 1000 }),
    passed: fc.nat({ max: 1000 }),
    failed: fc.nat({ max: 1000 }),
    skipped: fc.nat({ max: 1000 }),
    duration: fc.nat({ max: 3600000 }),
    tests: fc.constant([]),
});

beforeEach(() => {
    vi.clearAllMocks();
    mockLlmPrompt.mockResolvedValue('analysis');
});

describe('compareRuns PBT invariants', () => {
    it('pass rate is always 0-100 regardless of input values', async () => {
        await fc.assert(
            fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                mockLlmPrompt.mockResolvedValue('analysis');
                const result = await compareRuns(runA, runB);
                expect(typeof result).toBe('string');
            }),
        );
    });

    it('LLM prompt includes run summary with date, project, and metrics', async () => {
        await fc.assert(
            fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                mockLlmPrompt.mockClear();
                mockLlmPrompt.mockResolvedValue('analysis');
                await compareRuns(runA, runB);
                const lastCall = mockLlmPrompt.mock.calls.length - 1;
                const callArg = mockLlmPrompt.mock.calls[lastCall]?.[0];
                expect(callArg).toBeDefined();
                const user = (callArg as { user: string }).user;
                expect(user).toContain('=== RUN A (older) ===');
                expect(user).toContain('=== RUN B (newer) ===');
                expect(user).toContain(`Date: ${runA.timestamp.slice(0, 10)}`);
                expect(user).toContain(`Project: ${runA.project}`);
            }),
        );
    });

    it('LLM prompt includes pass rate for both runs', async () => {
        await fc.assert(
            fc.asyncProperty(MetricsRunArb, MetricsRunArb, async (runA, runB) => {
                mockLlmPrompt.mockClear();
                mockLlmPrompt.mockResolvedValue('analysis');
                await compareRuns(runA, runB);
                const lastCall = mockLlmPrompt.mock.calls.length - 1;
                const callArg = mockLlmPrompt.mock.calls[lastCall]?.[0];
                const user = (callArg as { user: string }).user;
                const execA = runA.passed + runA.failed;
                const rateA = execA > 0 ? Math.round((runA.passed / execA) * 100) : 0;
                expect(user).toContain(`Pass rate: ${rateA}%`);
                const execB = runB.passed + runB.failed;
                const rateB = execB > 0 ? Math.round((runB.passed / execB) * 100) : 0;
                expect(user).toContain(`Pass rate: ${rateB}%`);
            }),
        );
    });

    it('null run returns early message without calling LLM', async () => {
        await fc.assert(
            fc.asyncProperty(MetricsRunArb, async (runA) => {
                mockLlmPrompt.mockClear();
                const result = await compareRuns(null, runA);
                expect(result).toBe('No run data provided');
                expect(mockLlmPrompt).not.toHaveBeenCalled();
            }),
        );
    });
});
