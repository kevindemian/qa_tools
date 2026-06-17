import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsRun } from '../../metrics.js';
import { nonNull } from '../../test-utils.js';

vi.mock('../../llm-client.js', () => ({
    llmPrompt: vi.fn(),
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

import { llmPrompt } from '../../llm-client.js';
import { compareRuns } from '../../run-comparison.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

const runA: MetricsRun = {
    timestamp: '2026-01-01T00:00:00.000Z',
    project: 'test-project',
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0,
    duration: 5000,
    tests: [],
};

const runB: MetricsRun = {
    timestamp: '2026-01-02T00:00:00.000Z',
    project: 'test-project',
    total: 10,
    passed: 9,
    failed: 1,
    skipped: 0,
    duration: 4000,
    tests: [],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Integration: Run Comparison (FT-39)', () => {
    describe('FT-39a: compareRuns data formatting', () => {
        it('formats run summary with correct structure', async () => {
            mockLlmPrompt.mockResolvedValue('Improved pass rate from 80% to 90%');

            const result = await compareRuns(runA, runB);

            expect(result).toBe('Improved pass rate from 80% to 90%');
            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);
            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
            expect(callArg.tier).toBe('fast');
            expect(callArg.callerId).toBe('compare-runs');
            expect(callArg.system).toContain('QA analyst');
            expect(callArg.user).toContain('=== RUN A (older) ===');
            expect(callArg.user).toContain('=== RUN B (newer) ===');
            expect(callArg.user).toContain('Date: 2026-01-01');
            expect(callArg.user).toContain('Date: 2026-01-02');
        });

        it('includes pass rate percentage in formatted data', async () => {
            mockLlmPrompt.mockResolvedValue('analysis');

            await compareRuns(runA, runB);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);
            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
            expect(callArg.user).toContain('Pass rate: 80%');
            expect(callArg.user).toContain('Pass rate: 90%');
        });

        it('includes detailed metrics in formatted data', async () => {
            mockLlmPrompt.mockResolvedValue('analysis');

            await compareRuns(runA, runB);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);
            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
            expect(callArg.user).toMatch(/Total: 10[\s\S]*Passed: 8[\s\S]*Failed: 2[\s\S]*Duration: 5000ms/);
        });
    });

    describe('FT-39b: compareRuns null handling', () => {
        it('returns early message when first run is null', async () => {
            const result = await compareRuns(null, runB);
            expect(result).toBe('No run data provided');
            expect(mockLlmPrompt).not.toHaveBeenCalled();
        });

        it('returns early message when second run is null', async () => {
            const result = await compareRuns(runA, null);
            expect(result).toBe('No run data provided');
            expect(mockLlmPrompt).not.toHaveBeenCalled();
        });

        it('returns early message when both runs are null', async () => {
            const result = await compareRuns(null, null);
            expect(result).toBe('No run data provided');
            expect(mockLlmPrompt).not.toHaveBeenCalled();
        });
    });

    describe('FT-39c: compareRuns error handling', () => {
        it('returns empty string when LLM call fails', async () => {
            mockLlmPrompt.mockRejectedValue(new Error('API rate limit exceeded'));

            const result = await compareRuns(runA, runB);

            expect(result).toBe('');
        });

        it('handles empty run data without error', async () => {
            const empty: MetricsRun = {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: '',
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                tests: [],
            };
            mockLlmPrompt.mockResolvedValue('analysis of empty run');

            const result = await compareRuns(empty, empty);
            expect(result).toBe('analysis of empty run');
        });
    });

    describe('FT-39d: sanitization integration', () => {
        it('sanitizes secrets from project name before LLM call', async () => {
            const secret = 'sk-12345678901234567890';
            const runWithSecret = { ...runA, project: `proj-${secret}` };
            mockLlmPrompt.mockResolvedValue('sanitized analysis');

            await compareRuns(runWithSecret, runB);

            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);
            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
            expect(callArg.user).not.toContain(secret);
        });

        it('passes sanitized string to LLM without modification', async () => {
            const { sanitizeForLlm } = await import('../../sanitize.js');
            mockLlmPrompt.mockResolvedValue('sanitized analysis');

            await compareRuns(runA, runB);
            expect(mockLlmPrompt).toHaveBeenCalledTimes(1);
            const callArg = nonNull(mockLlmPrompt.mock.calls[0])[0];
            const sanitized = sanitizeForLlm(callArg.user);
            expect(sanitized).toBe(callArg.user);
        });
    });
});
