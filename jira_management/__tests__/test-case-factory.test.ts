const mockPrompt = vi.hoisted(() => ({
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    prompt: vi.fn().mockReturnValue(''),
    confirm: vi.fn().mockReturnValue(true),
    onError: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
}));

vi.mock('../../shared/ui/prompt.js', () => mockPrompt);

import { createMockJiraResource } from '../../shared/test-utils/factories/jira-resource-factory.js';
import TestCaseFactory from '../test-case-factory.js';
import Config from '../../shared/config-accessor.js';

function createMockImporter() {
    return { importStep: vi.fn(), setSteps: vi.fn() };
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
    });

    afterEach(() => {
        vi.resetAllMocks();
        Config.reset();
    });

    describe('CreateIssue', () => {
        const testData = { fields: { summary: 'Test' } };
        const opLog = { info: vi.fn() };

        it('returns key on success', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-123' });
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toStrictEqual({ key: 'TEST-123' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
            expect(opLog.info).toHaveBeenCalledWith('Issue criada', { key: 'TEST-123' });
        });

        it('calls success when not quiet', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-123' });
            mockPrompt.isQuiet.mockReturnValue(false);
            await factory.createIssue({ testData, testTitle: 'Test Title', testIdx: 0, totalTests: 5, opLog });

            expect(mockPrompt.success).toHaveBeenCalledWith('Issue criada: TEST-123');
        });

        it('returns abort action on error when handler returns abort', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));
            factory.setStepFailureHandler(async () => 'abort');
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toStrictEqual({ action: 'abort' });
        });

        it('returns skip action on error when handler returns skip', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));
            factory.setStepFailureHandler(async () => 'skip');
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toStrictEqual({ action: 'skip' });
        });

        it('returns rollback action on error without handler', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toStrictEqual({ action: 'rollback' });
        });

        it('retries POST when handler returns retry then succeeds', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource
                .mockRejectedValueOnce(new Error('API error'))
                .mockResolvedValueOnce({ key: 'TEST-123' });
            factory.setStepFailureHandler(async () => 'retry');
            const result = await factory.createIssue({
                testData,
                testTitle: 'Test Title',
                testIdx: 0,
                totalTests: 5,
                opLog,
            });

            expect(result).toStrictEqual({ key: 'TEST-123' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledTimes(2);
        });
    });

    describe('CreateIssue with skipExisting', () => {
        const testData = { project: 'TEST', fields: { summary: 'Login Test' } };
        const opLog = { info: vi.fn() };

        it('updates existing issue when skipExisting finds match by title', async () => {
            expect.hasAssertions();

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
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-42', updated: true });
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalledWith();
            expect(opLog.info).toHaveBeenCalledWith('Issue atualizada (auto)', {
                key: 'TEST-42',
                title: 'Login Test',
            });
        });

        it('proceeds with creation when no existing issue matches', async () => {
            expect.hasAssertions();

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
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-43' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
        });

        it('falls through to create when search fails gracefully', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockRejectedValue(new Error('Search error'));
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-44' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-44' });
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
        });

        it('does not search when skipExisting is false', async () => {
            expect.hasAssertions();

            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'TEST-45' });

            await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'create',
            });

            expect(mockJiraResource['searchJiraIssues']).not.toHaveBeenCalledWith();
            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', testData);
        });

        it('with prompt policy and multiple matches, user selects an issue to update', async () => {
            expect.hasAssertions();

            Config.set('updatePolicy', 'prompt');
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'TEST-10', fields: { summary: 'Login Test' } },
                    { key: 'TEST-11', fields: { summary: 'Login Test' } },
                ],
                total: 2,
            });
            mockPrompt.isQuiet.mockReturnValue(false);
            mockPrompt.prompt.mockReturnValue('1');

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-10', updated: true });
            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledTimes(1);
        });

        it('shows prompt info when quiet is false and issue is updated', async () => {
            expect.hasAssertions();

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
                importMode: 'hybrid',
            });

            expect(mockPrompt.success).toHaveBeenCalledWith('Issue atualizada (auto): TEST-42');
        });

        it('skips when multiple matches with auto policy', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'TEST-40', fields: { summary: 'Login Test' } },
                    { key: 'TEST-42', fields: { summary: 'Login Test' } },
                ],
                total: 2,
            });
            mockPrompt.isQuiet.mockReturnValue(false);

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ skipped: true });
            expect(mockJiraResource['putJiraResource']).not.toHaveBeenCalled();
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
            expect(mockPrompt.warn).toHaveBeenCalled();
            expect(mockPrompt.info).toHaveBeenCalled();
        });

        it('skips when multiple matches with skip policy', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'TEST-40', fields: { summary: 'Login Test' } },
                    { key: 'TEST-42', fields: { summary: 'Login Test' } },
                ],
                total: 2,
            });
            Config.set('updatePolicy', 'skip');

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ skipped: true });
            expect(mockJiraResource['putJiraResource']).not.toHaveBeenCalled();
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });

        it('updates selected match when multiple matches with prompt policy', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'TEST-40', fields: { summary: 'Login Test' } },
                    { key: 'TEST-42', fields: { summary: 'Login Test' } },
                ],
                total: 2,
            });
            mockPrompt.isQuiet.mockReturnValue(false);
            mockPrompt.prompt.mockReturnValue('2');
            Config.set('updatePolicy', 'prompt');

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-42', updated: true });
            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledWith('issue/TEST-42', {
                fields: { summary: 'Login Test' },
            });
            expect(mockPrompt.success).toHaveBeenCalledWith('Issue atualizada (prompt): TEST-42');
        });

        it('skips on Enter when multiple matches with prompt policy', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'TEST-40', fields: { summary: 'Login Test' } },
                    { key: 'TEST-42', fields: { summary: 'Login Test' } },
                ],
                total: 2,
            });
            mockPrompt.isQuiet.mockReturnValue(false);
            mockPrompt.prompt.mockReturnValue('');
            Config.set('updatePolicy', 'prompt');

            const result = await factory.createIssue({
                testData,
                testTitle: 'Login Test',
                testIdx: 0,
                totalTests: 5,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ skipped: true });
            expect(mockJiraResource['putJiraResource']).not.toHaveBeenCalled();
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });
    });

    describe('CreateIssue with targetKeys', () => {
        const testData = { project: 'TEST', fields: { summary: 'Login Test' } };
        const opLog = { info: vi.fn() };

        beforeEach(() => {
            Config.set('targetKeys', 'ECSPOL-1605,ECSPOL-1606,ECSPOL-1607');
        });

        afterEach(() => {
            Config.set('targetKeys', '');
        });

        it('uses explicitly set target keys over global Config when provided', async () => {
            expect.hasAssertions();

            factory.setTargetKeys(['ECSPOL-1605']);
            mockJiraResource.getJiraResource.mockResolvedValue({ key: 'ECSPOL-1605' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Some Title',
                testIdx: 0,
                totalTests: 3,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'ECSPOL-1605', updated: true });
            expect(mockJiraResource['getJiraResource']).toHaveBeenCalledWith('issue/ECSPOL-1605');
        });

        it('parses a single target key as one element, not per-character', async () => {
            expect.hasAssertions();

            Config.set('targetKeys', 'ECSPOL-1605');
            mockJiraResource.getJiraResource.mockResolvedValue({ key: 'ECSPOL-1605' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Some Title',
                testIdx: 0,
                totalTests: 1,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'ECSPOL-1605', updated: true });
            expect(mockJiraResource['getJiraResource']).toHaveBeenCalledWith('issue/ECSPOL-1605');
        });

        it('updates by target key when targetKeys is set', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue({ key: 'ECSPOL-1605' });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Some Title',
                testIdx: 0,
                totalTests: 3,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'ECSPOL-1605', updated: true });
            expect(mockJiraResource['getJiraResource']).toHaveBeenCalledWith('issue/ECSPOL-1605');
            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledWith('issue/ECSPOL-1605', {
                fields: { summary: 'Login Test' },
            });
        });

        it('returns skipped when target key not found in Jira', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue({});

            const result = await factory.createIssue({
                testData,
                testTitle: 'Some Title',
                testIdx: 0,
                totalTests: 3,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'ECSPOL-1605', skipped: true });
        });

        it('skips target key when testIdx exceeds targetKeys length', async () => {
            expect.hasAssertions();

            Config.set('targetKeys', 'ECSPOL-1605');
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'TEST-99', fields: { summary: 'Some Title' } }],
                total: 1,
            });

            const result = await factory.createIssue({
                testData,
                testTitle: 'Some Title',
                testIdx: 2,
                totalTests: 3,
                opLog,
                importMode: 'hybrid',
            });

            expect(result).toStrictEqual({ key: 'TEST-99', updated: true });
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
            expect.hasAssertions();

            mockImporter.importStep.mockResolvedValue({});
            const result = await factory.postSteps(issueKey, test, opLog);

            expect(result).toBeNull();
            expect(mockImporter.importStep).toHaveBeenCalledTimes(2);
        });

        it('logs step progress when not quiet (no progress bar)', async () => {
            expect.hasAssertions();

            mockImporter.importStep.mockResolvedValue({});
            mockPrompt.isQuiet.mockReturnValue(false);
            mockPrompt.info.mockClear();
            await factory.postSteps(issueKey, test, opLog);

            expect(mockPrompt.info).toHaveBeenCalledWith(
                '  Importando ' + test.steps.length + ' passo(s) de "' + test.title + '"...',
            );
            expect(mockPrompt.info).toHaveBeenCalledWith('  Step 1/' + test.steps.length + ' ok');
            expect(mockPrompt.info).toHaveBeenCalledWith('  Step 2/' + test.steps.length + ' ok');
        });

        it('aborts on step error when handler returns abort', async () => {
            expect.hasAssertions();

            mockImporter.importStep.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Step error'));
            factory.setStepFailureHandler(vi.fn().mockResolvedValue('abort'));
            const result = await factory.postSteps(issueKey, test, opLog);

            expect(result).toStrictEqual({ action: 'abort', failedSteps: 1, totalSteps: 2 });
            expect(mockImporter.importStep).toHaveBeenCalledTimes(2);
        });

        it('records failed steps when handler returns skip', async () => {
            expect.hasAssertions();

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
            factory.setStepFailureHandler(vi.fn().mockResolvedValue('skip'));
            const result = await factory.postSteps(issueKey, test3, opLog);

            expect(result).toStrictEqual({ failedSteps: 1, totalSteps: 3 });
            expect(mockImporter.importStep).toHaveBeenCalledTimes(3);
        });

        it('returns rollback action when handler returns rollback', async () => {
            expect.hasAssertions();

            mockImporter.importStep.mockRejectedValueOnce(new Error('Step error'));
            factory.setStepFailureHandler(vi.fn().mockResolvedValue('rollback'));
            const result = await factory.postSteps(issueKey, test, opLog);

            expect(result).toStrictEqual({ action: 'rollback', failedSteps: 1, totalSteps: 2 });
        });
    });
});
