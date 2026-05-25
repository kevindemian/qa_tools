jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));

import { llmPrompt } from './llm-client';
import { compareRuns } from './run-comparison';
import type { MetricsRun } from './metrics';

const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

const runA: MetricsRun = {
    timestamp: '2026-01-01T00:00:00.000Z',
    project: 'proj',
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0,
    duration: 5000,
    tests: [],
};

const runB: MetricsRun = {
    timestamp: '2026-01-02T00:00:00.000Z',
    project: 'proj',
    total: 10,
    passed: 9,
    failed: 1,
    skipped: 0,
    duration: 4000,
    tests: [],
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('compareRuns', () => {
    it('calls LLM with formatted run data and returns analysis', async () => {
        mockLlmPrompt.mockResolvedValueOnce('Overall improvement in pass rate from 80% to 90%.');

        const result = await compareRuns(runA, runB);
        expect(result).toBe('Overall improvement in pass rate from 80% to 90%.');
        expect(mockLlmPrompt).toHaveBeenCalledWith('fast', expect.any(String), expect.any(String));
        const promptArg = mockLlmPrompt.mock.calls[0][1];
        expect(promptArg).toContain('80%');
        expect(promptArg).toContain('90%');
    });

    it('returns empty string on LLM error', async () => {
        mockLlmPrompt.mockRejectedValueOnce(new Error('API error'));

        const result = await compareRuns(runA, runB);
        expect(result).toBe('');
    });
});
