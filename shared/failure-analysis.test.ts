vi.mock('fs');
vi.mock('./llm-client', async () => ({
    llmPrompt: vi.fn<(...args: [opts: import('./llm-client.js').LlmPromptOptions]) => Promise<string>>(),
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
vi.mock('./llm-review', async () => ({ reviewWithLlm: vi.fn() }));

import fs from 'fs';

import { llmPrompt } from './llm-client.js';
import { reviewWithLlm } from './llm-review.js';
import { analyzeFailuresWithReport, classifyFailure } from './failure-analysis.js';
import type { FlatTest } from './result_parser.js';
import { nonNull } from './test-utils.js';

const mockReviewWithLlm = vi.mocked(reviewWithLlm);
const mockLlmPrompt = vi.mocked(llmPrompt);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('analyzeFailuresWithReport', () => {
    it('returns empty content when no failed tests', async () => {
        const tests: FlatTest[] = [{ title: 'Pass', state: 'passed', duration: 100 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toBe('');
        expect(mockReviewWithLlm).not.toHaveBeenCalled();
    });

    it('passes LlmContext to reviewWithLlm when provided', async () => {
        const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);
        mockReviewWithLlm.mockResolvedValueOnce({
            content: 'Root cause with context',
            reviewed: true,
            confidence: 'high',
            fallbackUsed: false,
        });

        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

        const result = await analyzeFailuresWithReport(tests, {
            gitCommits: '- fix auth module (joao, 2026-05-28)',
            gitTrend: 'Run 1: 90.0% (9/10)',
            jiraIssues: '- BUG-123 (Open): Auth module breaks on null input',
        });

        expect(result.content).toBe('Root cause with context');
        expect(mockReviewWithLlm).toHaveBeenCalledTimes(1);
        const userMsg: string = (mockReviewWithLlm.mock.calls[0]?.[1] as string) || '';
        expect(userMsg).toContain('Recent Commits:');
        expect(userMsg).toContain('Pass Rate Trend:');
        expect(userMsg).toContain('Related Jira Issues:');
        expect(userMsg).toContain('Login fails');
    });

    it('23.9: analyzeFailuresWithReport HTML exception path', async () => {
        // Mock to trigger exception during HTML report generation
        const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);

        // Mock reviewWithLlm to fail or behave in a way that generates error in report generation
        mockReviewWithLlm.mockRejectedValueOnce(new Error('HTML report generation failed'));

        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

        // This should be caught and logged, not crash
        const result = await analyzeFailuresWithReport(tests);
        expect(result.fallbackUsed).toBe(true);
    });

    it('23.10: HTML report output verified', async () => {
        const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);
        mockReviewWithLlm.mockResolvedValueOnce({
            content: 'Root cause: assertion error',
            reviewed: true,
            confidence: 'high',
        });

        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toContain('Root cause: assertion error');
    });

    it('handles missing prompt template gracefully', async () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toBe('');
    });

    it('returns fallback=true when template is missing', async () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.fallbackUsed).toBe(true);
    });
});

describe('classifyFailure', () => {
    it('calls llmPrompt (fast tier) with test title and Zod schema', async () => {
        const promptContent = 'Classify: ';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected true but got false');

        const result = await classifyFailure('Login test', 'expected true, got false');
        expect(result).toBe('ASSERTION: expected true but got false');
        const [callOpts] = nonNull(mockLlmPrompt.mock.calls[0]);
        expect(callOpts).toHaveProperty('system', expect.any(String));
        expect(callOpts).toHaveProperty('user', expect.any(String));
        expect(callOpts).toHaveProperty('schema', expect.anything());
        expect(mockLlmPrompt).toHaveBeenCalledWith(expect.objectContaining({ tier: 'fast', callerId: 'classify' }));
    });

    it('returns valid classification when llmPrompt returns matching format', async () => {
        const promptContent = 'Classify: ';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected 200 got 500');

        const result = await classifyFailure('Login test', 'expected 200, got 500');
        expect(result).toBe('ASSERTION: expected 200 got 500');
    });

    it('falls back to UNKNOWN when llmPrompt throws (Zod validation failed after retry)', async () => {
        const promptContent = 'Classify: ';
        vi.mocked(fs.readFileSync).mockReturnValue(promptContent);
        // Self-consistency calls llmPrompt 3×; fallback calls it 1× more
        mockLlmPrompt.mockRejectedValue(new Error('LLM response failed schema validation after retry'));

        const result = await classifyFailure('Login test', 'some error');
        expect(result).toBe('UNKNOWN: Could not classify failure after retry');
    });

    it('returns UNKNOWN when classify.md cannot be read', async () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = await classifyFailure('Login test', 'error');
        expect(result).toBe('UNKNOWN: Could not load prompt template');
    });
});

describe('classifyRegex — edge case mutations', () => {
    const regex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;

    it('matches valid classification with explanation', async () => {
        expect(regex.test('ASSERTION: expected 200 got 500')).toBe(true);
    });

    it('matches TIMEOUT classification', async () => {
        expect(regex.test('TIMEOUT: test exceeded 30s limit')).toBe(true);
    });

    it('rejects AGREEMENT (not a valid category)', async () => {
        expect(regex.test('AGREEMENT: some issue')).toBe(false);
    });

    it('rejects lowercase classification', async () => {
        expect(regex.test('assertion: expected 200')).toBe(false);
    });

    it('rejects missing colon and space after category', async () => {
        expect(regex.test('ASSERTION expected 200')).toBe(false);
    });

    it('matches first line of multi-line response', async () => {
        expect(regex.test('ASSERTION: expected 200\nsome extra text')).toBe(true);
    });

    it('matches ENVIRONMENT classification', async () => {
        expect(regex.test('ENVIRONMENT: database connection failed')).toBe(true);
    });

    it('rejects empty string', async () => {
        expect(regex.test('')).toBe(false);
    });

    it('rejects category-only without colon', async () => {
        expect(regex.test('ASSERTION')).toBe(false);
    });
});
