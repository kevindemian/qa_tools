const mockPrompt = {
    success: jest.fn(),
    info: jest.fn(),
    onError: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    ProgressBar: jest.fn().mockImplementation(() => ({
        update: jest.fn(),
        stop: jest.fn(),
    })),
};
jest.mock('../shared/prompt', () => mockPrompt);

import TestCaseFactory from './test-case-factory';

function createMockImporter() {
    return { importStep: jest.fn() };
}

describe('TestCaseFactory', () => {
    let factory: TestCaseFactory;
    let mockJiraResource: { postJiraResource: jest.Mock; searchJiraIssues: jest.Mock };
    let mockImporter: ReturnType<typeof createMockImporter>;

    beforeEach(() => {
        mockJiraResource = { postJiraResource: jest.fn(), searchJiraIssues: jest.fn() };
        mockImporter = createMockImporter();
        factory = new TestCaseFactory(mockJiraResource as never, mockImporter);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createIssue', () => {
        const testData = { fields: { summary: 'Test' } };
        const opLog = { info: jest.fn() };

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
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', testData);
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
            mockPrompt.onError.mockResolvedValue('retry');
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
            mockPrompt.onError.mockResolvedValue('abort');
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

    describe('createIssue with skipExisting', () => {
        const testData = { project: 'TEST', fields: { summary: 'Login Test' } };
        const opLog = { info: jest.fn() };

        it('skips creation when existing issue found by title', async () => {
            mockJiraResource.searchJiraIssues = jest.fn().mockResolvedValue({
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
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
            expect(opLog.info).toHaveBeenCalledWith('Issue pulada (já existe)', {
                key: 'TEST-42',
                title: 'Login Test',
            });
        });

        it('proceeds with creation when no existing issue matches', async () => {
            mockJiraResource.searchJiraIssues = jest.fn().mockResolvedValue({
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
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', testData);
        });

        it('falls through to create when search fails gracefully', async () => {
            mockJiraResource.searchJiraIssues = jest.fn().mockRejectedValue(new Error('Search error'));
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
            expect(mockJiraResource.postJiraResource).toHaveBeenCalled();
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

            expect(mockJiraResource.searchJiraIssues).not.toHaveBeenCalled();
            expect(mockJiraResource.postJiraResource).toHaveBeenCalled();
        });

        it('shows prompt info when quiet is false and issue skipped', async () => {
            mockJiraResource.searchJiraIssues = jest.fn().mockResolvedValue({
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

    describe('postSteps', () => {
        const issueKey = 'TEST-123';
        const test = {
            title: 'Test',
            steps: [{ fields: { Action: 'Click' } }, { fields: { Action: 'Type' } }],
        };
        const opLog = { info: jest.fn() };

        it('returns null on all steps success', async () => {
            mockImporter.importStep.mockResolvedValue({});
            const result = await factory.postSteps(issueKey, test, opLog);
            expect(result).toBeNull();
            expect(mockImporter.importStep).toHaveBeenCalledTimes(2);
        });

        it('calls update on ProgressBar when not quiet', async () => {
            mockImporter.importStep.mockResolvedValue({});
            mockPrompt.isQuiet.mockReturnValue(false);
            await factory.postSteps(issueKey, test, opLog);
            const barInstance = mockPrompt.ProgressBar.mock.results[0]!.value;
            expect(barInstance.update).toHaveBeenCalledWith(1);
            expect(barInstance.update).toHaveBeenCalledWith(2);
            expect(barInstance.stop).toHaveBeenCalled();
        });

        it('aborts on step error when onError returns abort', async () => {
            mockImporter.importStep.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Step error'));
            mockPrompt.onError.mockResolvedValue('abort');
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
            mockPrompt.onError.mockResolvedValue('continue');
            const result = await factory.postSteps(issueKey, test3, opLog);
            expect(result).toBeNull();
            expect(mockImporter.importStep).toHaveBeenCalledTimes(3);
        });
    });
});
