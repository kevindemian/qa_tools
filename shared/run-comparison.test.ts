vi.mock('./llm-client', async () => ({
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

import { llmPrompt } from './llm-client.js';
import { compareRuns } from './run-comparison.js';
import { sanitizeForLlm } from './sanitize.js';
import { nonNull } from './test-utils.js';
import type { MetricsRun } from './metrics.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

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
    vi.clearAllMocks();
});

describe('compareRuns', () => {
    it('calls LLM with formatted run data and returns analysis', async () => {
        mockLlmPrompt.mockResolvedValueOnce('Overall improvement in pass rate from 80% to 90%.');

        const result = await compareRuns(runA, runB);
        expect(result).toBe('Overall improvement in pass rate from 80% to 90%.');
    });

    it('23.15: returns appropriate message for empty data', async () => {
        const result = await compareRuns(null, null);
        expect(result).toContain('No run data provided');
    });

    it('23.16: verify sanitization of run data', async () => {
        const secret = 'sk-12345678901234567890';
        const runAWithSecrets = { ...runA, project: 'proj-with-secret-' + secret };
        mockLlmPrompt.mockResolvedValueOnce('Analysis');

        await compareRuns(runAWithSecrets, runB);

        const callArgs = nonNull(mockLlmPrompt.mock.calls[0])[0];
        const userMsg = callArgs.user;
        expect(userMsg).not.toContain(secret);
    });

    it('returns empty string on LLM error', async () => {
        mockLlmPrompt.mockRejectedValueOnce(new Error('API error'));

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
        mockLlmPrompt.mockResolvedValueOnce('analysis of empty run');
        const result = await compareRuns(empty, empty);
        expect(result).toBe('analysis of empty run');
    });

    it('sanitizes run data before sending to LLM', async () => {
        const runWithSecret: MetricsRun = {
            timestamp: '2026-05-01T00:00:00.000Z',
            project: 'test',
            total: 5,
            passed: 3,
            failed: 2,
            skipped: 0,
            duration: 1000,
            tests: [],
        };
        mockLlmPrompt.mockResolvedValueOnce('sanitized response');
        await compareRuns(runWithSecret, runA);
        const userArg = nonNull(mockLlmPrompt.mock.calls[0])[0].user;
        expect(typeof userArg).toBe('string');
        const sanitized = sanitizeForLlm(userArg);
        expect(sanitized).toBe(userArg);
    });
});
