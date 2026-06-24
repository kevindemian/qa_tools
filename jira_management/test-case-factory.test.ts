const mockPrompt = vi.hoisted(() => ({
    success: vi.fn(),
    info: vi.fn(),
    onError: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
    ProgressBar: vi.fn<(...args: [total: number, options?: { width?: number }]) => { update: Mock; stop: Mock }>(
        function () {
            return { update: vi.fn(), stop: vi.fn() };
        },
    ),
}));

vi.mock('../shared/prompt', () => mockPrompt);

import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';
import type { Mock } from 'vitest';
import TestCaseFactory from './test-case-factory.js';

function createMockImporter() {
    return { importStep: vi.fn() };
}

describe('TestCaseFactory', () => {
    let factory: TestCaseFactory;
    let mockJiraResource: ReturnType<typeof createMockJiraResource>;
    let mockImporter: ReturnType<typeof createMockImporter>;

    beforeEach(() => {
        mockJiraResource = createMockJiraResource();
        mockImporter = createMockImporter();
        factory = new TestCaseFactory(mockJiraResource, mockImporter);
        mockPrompt.isQuiet.mockReturnValue(true);
        mockPrompt.ProgressBar.mockImplementation(function () {
            return { update: vi.fn(), stop: vi.fn() };
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('CreateIssue', () => {
        const testData = { fields: { summary: 'Test' } };
        const opLog = { info: vi.fn() };

        it('returns key on success', async () => {
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-123' });
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toEqual({ key: 'TEST-123' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
            expect(opLog.info).toHaveBeenCalledWith('Issue criada', { key: 'TEST-123' });
        });

        it('calls success when not quiet', async () => {
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-123' });
            mockPrompt.isQuiet.mockReturnValue(false);
            await factory.createIssue({ testData, testTitle: 'Test Title', testIdx: 0, totalTests: 5, opLog });

            expect(mockPrompt.success).toHaveBeenCalledWith('Issue criada: TEST-123');
        });

        it('returns retry action on error with onError returning retry', async () => {
            mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('retry');
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toEqual({ action: 'retry' });
        });

        it('returns abort action on error with onError returning abort', async () => {
            mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('abort');
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toEqual({ action: 'abort' });
        });
    });

    describe('CreateIssue with skipExisting', () => {
        const testData = { project: 'TEST', fields: { summary: 'Login Test' } };
        const opLog = { info: vi.fn() };

        it('skips creation when existing issue found by title', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'TEST-42', fields: { summary: 'Login Test' } }],
                total: 1,
            });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                skipExisting: true,
            });

            expect(result).toEqual({ key: 'TEST-42', skipped: true });
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
            expect(opLog.info).toHaveBeenCalledWith('Issue pulada (já existe)', {
                key: 'TEST-42',
                title: 'Login Test',
            });
        });

        it('proceeds with creation when no existing issue matches', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [],
                total: 0,
            });
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-43' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                skipExisting: true,
            });

            expect(result).toEqual({ key: 'TEST-43' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
        });

        it('falls through to create when search fails gracefully', async () => {
            mockJiraResource.searchJiraIssues.mockRejectedValue(new Error('Search error'));
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-44' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                skipExisting: true,
            });

            expect(result).toEqual({ key: 'TEST-44' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalled();
        });

        it('does not search when skipExisting is false', async () => {
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-45' });

            await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                skipExisting: false,
            });

            expect(mockJiraResource['searchJiraIssues']).not.toHaveBeenCalled();
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalled();
        });

        it('shows prompt info when quiet is false and issue skipped', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'TEST-42', fields: { summary: 'Login Test' } }],
                total: 1,
            });
            mockPrompt.isQuiet.mockReturnValue(false);

            await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                skipExisting: true,
            });

            expect(mockPrompt.info).toHaveBeenCalledWith('Issue já existe, pulando: TEST-42');
        });
    });

    describe('PostSteps', () => {
        const issueKey = 'TEST-123';
        const test = {
            title: 'Test',
            steps: [{ fields: { Action: 'Click' } }, { fields: { Action: 'Type' } }],
        };
        const opLog = { info: vi.fn() };

        it('returns null on all steps success', async () => {
            mockImporter.importStep.mockResolvedValue({});
            const result = await factory.postSteps(issueKey, test, opLog);

            expect(result).toBeNull();
            expect(mockImporter.importStep).toHaveBeenCalledTimes(2);
        });

        it('calls update on ProgressBar when not quiet', async () => {
            const update = vi.fn();
            const stop = vi.fn();
            mockPrompt.ProgressBar.mockImplementation(function () {
                return { update, stop };
            });
            mockImporter.importStep.mockResolvedValue({});
            mockPrompt.isQuiet.mockReturnValue(false);
            await factory.postSteps(issueKey, test, opLog);

            expect(update).toHaveBeenCalledWith(1);
            expect(update).toHaveBeenCalledWith(2);
            expect(stop).toHaveBeenCalled();
        });

        it('aborts on step error when onError returns abort', async () => {
            mockImporter.importStep.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Step error'));
            mockPrompt.onError.mockReturnValue('abort');
            const result = await factory.postSteps(issueKey, test, opLog);

            expect(result).toEqual({ action: 'abort' });
            expect(mockImporter.importStep).toHaveBeenCalledTimes(2);
        });

        it('continues after step error when onError does not return abort', async () => {
            const test3 = {
                title: 'Test',
                steps: [
                    { fields: { Action: 'Click' } },
                    { fields: { Action: 'Type' } },
                    { fields: { Action: 'Verify' } },
                ],
            };
            mockImporter.importStep
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('Step error'))
                .mockResolvedValueOnce({});
            mockPrompt.onError.mockReturnValue('continue');
            const result = await factory.postSteps(issueKey, test3, opLog);

            expect(result).toBeNull();
            expect(mockImporter.importStep).toHaveBeenCalledTimes(3);
        });
    });
});
