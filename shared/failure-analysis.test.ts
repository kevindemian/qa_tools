jest.mock('fs');
jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));
jest.mock('./llm-review', () => ({ reviewWithLlm: jest.fn() }));

import fs from 'fs';
import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';
import { analyzeFailures, classifyFailure } from './failure-analysis';
import type { FlatTest } from './result_parser';

const mockReviewWithLlm = reviewWithLlm as jest.MockedFunction<typeof reviewWithLlm>;
const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('analyzeFailures', () => {
    it('returns empty string when no failed tests', async () => {
        const tests: FlatTest[] = [{ title: 'Pass', state: 'passed', duration: 100 }];

        const result = await analyzeFailures(tests);
        expect(result).toBe('');
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

        const result = await analyzeFailures(tests);
        expect(result).toBe('Root cause: assertion error');
        expect(mockReviewWithLlm).toHaveBeenCalledTimes(1);
    });

    it('handles missing prompt template gracefully', async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

        const result = await analyzeFailures(tests);
        expect(result).toBe('');
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
});
