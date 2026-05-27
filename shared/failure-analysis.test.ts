jest.mock('fs');
jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));
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

    it('calls reviewWithLlm with failed tests when failures exist', async () => {
        const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockReviewWithLlm.mockResolvedValueOnce({
            content: 'Root cause: assertion error',
            reviewed: true,
            confidence: 'high',
        });

        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toBe('Root cause: assertion error');
        expect(mockReviewWithLlm).toHaveBeenCalledTimes(1);
    });

    it('handles missing prompt template gracefully', async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

        const result = await analyzeFailuresWithReport(tests);
        expect(result.content).toBe('');
    });
});

describe('classifyFailure', () => {
    it('calls llmPrompt (fast tier) with test title and error', async () => {
        const promptContent = 'Classify: {{TEST_TITLE}} - {{ERROR_MESSAGE}}';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected true but got false');

        const result = await classifyFailure('Login test', 'expected true, got false');
        expect(result).toBe('ASSERTION: expected true but got false');
        expect(mockLlmPrompt).toHaveBeenCalledWith('fast', expect.any(String), expect.any(String), 'classify');
    });

    it('retries when response format is invalid', async () => {
        const promptContent = 'Classify: {{TEST_TITLE}} - {{ERROR_MESSAGE}}';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt
            .mockResolvedValueOnce('raw text without category')
            .mockResolvedValueOnce('ASSERTION: expected 200 got 500');

        const result = await classifyFailure('Login test', 'expected 200, got 500');
        expect(result).toBe('ASSERTION: expected 200 got 500');
        expect(mockLlmPrompt).toHaveBeenCalledTimes(2);
    });

    it('falls back to UNKNOWN when both attempts fail regex', async () => {
        const promptContent = 'Classify: {{TEST_TITLE}} - {{ERROR_MESSAGE}}';
        (fs.readFileSync as jest.Mock).mockReturnValue(promptContent);
        mockLlmPrompt.mockResolvedValueOnce('some invalid text').mockResolvedValueOnce('more invalid text');

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
