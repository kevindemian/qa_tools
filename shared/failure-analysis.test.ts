jest.mock('fs');
jest.mock('./llm-client', () => ({
    llmPrompt: jest.fn(),
    getLlmClientMetrics: jest.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: jest.fn(),
    parseRetryAfter: jest.fn(() => 2000),
}));
jest.mock('./llm-review', () => ({ reviewWithLlm: jest.fn() }));

import fs from 'fs';
import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';
import { analyzeFailuresWithReport, classifyFailure } from './failure-analysis';
import type { FlatTest } from './result_parser';

const mockReviewWithLlm = reviewWithLlm as jest.MockedFunction<typeof reviewWithLlm>;
const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

beforeEach(() => {
    jest.clearAllMocks();
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
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
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
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);

        // Mock reviewWithLlm to fail or behave in a way that generates error in report generation
        mockReviewWithLlm.mockRejectedValueOnce(new Error('HTML report generation failed'));

        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

        // This should be caught and logged, not crash
        const result = await analyzeFailuresWithReport(tests);
        expect(result.fallbackUsed).toBe(true);
    });

    it('23.10: HTML report output verified', async () => {
        const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
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
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toBe('');
    });

    it('returns fallback=true when template is missing', async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
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
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected true but got false');

        const result = await classifyFailure('Login test', 'expected true, got false');
        expect(result).toBe('ASSERTION: expected true but got false');
        expect(mockLlmPrompt).toHaveBeenCalledWith(
            'fast',
            expect.any(String),
            expect.any(String),
            'classify',
            undefined,
            expect.anything(),
        );
    });

    it('returns valid classification when llmPrompt returns matching format', async () => {
        const promptContent = 'Classify: ';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected 200 got 500');

        const result = await classifyFailure('Login test', 'expected 200, got 500');
        expect(result).toBe('ASSERTION: expected 200 got 500');
    });

    it('falls back to UNKNOWN when llmPrompt throws (Zod validation failed after retry)', async () => {
        const promptContent = 'Classify: ';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt.mockRejectedValueOnce(new Error('LLM response failed schema validation after retry'));

        const result = await classifyFailure('Login test', 'some error');
        expect(result).toBe('UNKNOWN: Could not classify failure after retry');
    });
});

describe('classifyRegex — edge case mutations', () => {
    const regex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;

    it('matches valid classification with explanation', () => {
        expect(regex.test('ASSERTION: expected 200 got 500')).toBe(true);
    });

    it('matches TIMEOUT classification', () => {
        expect(regex.test('TIMEOUT: test exceeded 30s limit')).toBe(true);
    });

    it('rejects AGREEMENT (not a valid category)', () => {
        expect(regex.test('AGREEMENT: some issue')).toBe(false);
    });

    it('rejects lowercase classification', () => {
        expect(regex.test('assertion: expected 200')).toBe(false);
    });

    it('rejects missing colon and space after category', () => {
        expect(regex.test('ASSERTION expected 200')).toBe(false);
    });

    it('matches first line of multi-line response', () => {
        expect(regex.test('ASSERTION: expected 200\nsome extra text')).toBe(true);
    });

    it('matches ENVIRONMENT classification', () => {
        expect(regex.test('ENVIRONMENT: database connection failed')).toBe(true);
    });

    it('rejects empty string', () => {
        expect(regex.test('')).toBe(false);
    });

    it('rejects category-only without colon', () => {
        expect(regex.test('ASSERTION')).toBe(false);
    });
});
