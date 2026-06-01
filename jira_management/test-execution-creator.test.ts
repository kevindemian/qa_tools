jest.mock('../shared/logger', () => ({
    rootLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
    Logger: function () {},
}));

jest.mock('../shared/prompt', () => ({
    success: jest.fn(),
    info: jest.fn(),
    withSpinner: jest.fn(async (_label: string, fn: () => Promise<void>) => {
        await fn();
    }),
}));

import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory';
import { createMockLinkManager } from '../shared/test-utils/factories/link-manager-factory';
import TestExecutionCreator from './test-execution-creator';
import { rootLogger } from '../shared/logger';

describe('TestExecutionCreator', () => {
    let creator: TestExecutionCreator;
    let mockJiraResource: ReturnType<typeof createMockJiraResource>;
    let mockLinkManager: ReturnType<typeof createMockLinkManager>;
    let dateSpy: jest.SpyInstance;

    const fixedTimestamp = '23/05/2026 10:30';
    const projectName = 'PROJ';
    const csvName = 'my_tests.csv';
    const testKeys = ['TEST-1', 'TEST-2'];

    const defaultIssueTypes = [
        { id: '1', name: 'Bug' },
        { id: '2', name: 'Test Execution' },
        { id: '3', name: 'Story' },
    ];

    const defaultFields = [
        {
            id: 'customfield_10100',
            name: 'Text',
            schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' },
        },
        {
            id: 'customfield_10200',
            name: 'Tests',
            schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
        },
    ];

    const defaultCreated = { key: 'TE-1', summary: 'my_tests.csv - 23/05/2026 10:30' };

    beforeEach(() => {
        dateSpy = jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue(fixedTimestamp);

        mockJiraResource = createMockJiraResource();
        mockLinkManager = createMockLinkManager();
        creator = new TestExecutionCreator(mockJiraResource, mockLinkManager);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        dateSpy.mockRestore();
    });

    describe('create()', () => {
        function setupHappyPath() {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce(defaultFields);
            mockJiraResource.postJiraResource.mockResolvedValue(defaultCreated);
        }

        it('returns { key, summary } with correct structure', async () => {
            setupHappyPath();
            const result = await creator.create(projectName, testKeys, csvName);
            expect(result).toEqual({ key: 'TE-1', summary: 'my_tests.csv - 23/05/2026 10:30' });
        });

        it('posts with correct payload', async () => {
            setupHappyPath();
            await creator.create(projectName, testKeys, csvName);
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: projectName },
                    summary: 'my_tests.csv - 23/05/2026 10:30',
                    issuetype: { id: '2' },
                    customfield_10200: testKeys,
                },
            });
        });

        it('returns null and logs error when issue type not found', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce([
                { id: '1', name: 'Bug' },
                { id: '3', name: 'Story' },
            ]);
            const result = await creator.create(projectName, testKeys, csvName);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Issue type'));
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('returns null and logs error when custom field not found', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce([{ id: 'customfield_10100', name: 'Test', schema: { custom: 'some:other' } }]);
            const result = await creator.create(projectName, testKeys, csvName);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Tests association'));
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('returns null and logs error when issuetype response is non-array', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ id: '1' });
            const result = await creator.create(projectName, testKeys, csvName);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('tipos de issue'));
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('returns null and logs error when fields response is non-array', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce({ id: 'customfield_1' });
            const result = await creator.create(projectName, testKeys, csvName);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('campos customizados'));
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('uses title override instead of csvName + timestamp', async () => {
            setupHappyPath();
            await creator.create(projectName, testKeys, csvName, 'My Custom Title');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith(
                'issue',
                expect.objectContaining({
                    fields: expect.objectContaining({ summary: 'My Custom Title' }),
                }),
            );
        });

        it('uses "Automated Execution" when csvName is empty and no title override', async () => {
            setupHappyPath();
            await creator.create(projectName, testKeys, '');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith(
                'issue',
                expect.objectContaining({
                    fields: expect.objectContaining({ summary: 'Automated Execution - 23/05/2026 10:30' }),
                }),
            );
        });
    });

    describe('createWithLinks()', () => {
        function setupCreate(resultKey = 'TE-1') {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce(defaultFields);
            mockJiraResource.postJiraResource.mockResolvedValue({
                key: resultKey,
                summary: 'my_tests.csv - 23/05/2026 10:30',
            });
        }

        it('creates TE and links all tests', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.createIssueLink.mockResolvedValue({});

            const result = await creator.createWithLinks(projectName, testKeys, csvName);

            expect(result).toEqual({ key: 'TE-1', summary: 'my_tests.csv - 23/05/2026 10:30' });
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(2);
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-1', 'TE-1', 'Tests');
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-2', 'TE-1', 'Tests');
        });

        it('skips already-linked tests', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }],
                },
            });
            mockLinkManager.createIssueLink.mockResolvedValue({});

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(1);
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-2', 'TE-1', 'Tests');
        });

        it('links all unlinked tests when multiple provided', async () => {
            const manyTests = ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4', 'TEST-5'];
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }, { outwardIssue: { key: 'TEST-3' } }],
                },
            });
            mockLinkManager.createIssueLink.mockResolvedValue({});

            await creator.createWithLinks(projectName, manyTests, csvName);

            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(3);
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-2', 'TE-1', 'Tests');
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-4', 'TE-1', 'Tests');
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledWith('TEST-5', 'TE-1', 'Tests');
        });

        it('logs warnings for failed links and continues', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.createIssueLink.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('API error'));

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(2);
        });

        it('proceeds to try linking all when fetching existing links fails', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockRejectedValueOnce(new Error('Network error'));
            mockLinkManager.createIssueLink.mockResolvedValue({});

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(2);
        });

        it('creates TE without linking when testKeys is empty', async () => {
            setupCreate('TE-1');
            await creator.createWithLinks(projectName, [], csvName);
            expect(mockLinkManager.createIssueLink).not.toHaveBeenCalled();
        });

        it('logs info when all tests are already linked (line 105)', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }, { outwardIssue: { key: 'TEST-2' } }],
                },
            });

            await creator.createWithLinks(projectName, testKeys, csvName);
            expect(mockLinkManager.createIssueLink).not.toHaveBeenCalled();
        });

        it('logs error when outer linking block throws (line 121)', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: {} });

            const prompt = jest.requireMock('../shared/prompt');
            prompt.withSpinner.mockRejectedValueOnce(new Error('Spinner error'));

            await creator.createWithLinks(projectName, testKeys, csvName);
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao vincular testes'));
        });

        it('passes title override through to create()', async () => {
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: {} });

            await creator.createWithLinks(projectName, testKeys, csvName, { title: 'Custom Title' });

            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith(
                'issue',
                expect.objectContaining({
                    fields: expect.objectContaining({ summary: 'Custom Title' }),
                }),
            );
        });
    });

    describe('addTestsToExistingExecution', () => {
        const teKey = 'TE-1';
        const teIssue = {
            key: 'TE-1',
            fields: { summary: 'My TE', issuetype: { name: 'Test Execution' } },
        };

        function setupHappy(extraFields?: Record<string, unknown>) {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ ...teIssue, fields: { ...teIssue.fields, ...extraFields } })
                .mockResolvedValueOnce(defaultFields)
                .mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.createIssueLink.mockResolvedValue({});
        }

        it('returns { key, summary } on success', async () => {
            setupHappy({ customfield_10200: [] });
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(result).toEqual({ key: 'TE-1', summary: 'My TE' });
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['TEST-1', 'TEST-2'] },
            });
        });

        it('returns null and logs error when issue is not Test Execution type', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'BUG-1',
                fields: { issuetype: { name: 'Bug' } },
            });
            const result = await creator.addTestsToExistingExecution('BUG-1', testKeys);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('não é uma Test Execution'));
        });

        it('returns null when TE has unknown issuetype', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'X-1',
                fields: {},
            });
            const result = await creator.addTestsToExistingExecution('X-1', testKeys);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('não é uma Test Execution'));
        });

        it('returns null when fields response is non-array', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce(teIssue).mockResolvedValueOnce({ not: 'array' });
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('campos customizados'));
        });

        it('returns null when custom field not found', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(teIssue)
                .mockResolvedValueOnce([{ id: 'cf1', name: 'Other', schema: { custom: 'other:type' } }]);
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(result).toBeNull();
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Tests association'));
        });

        it('merges existing tests with new ones, deduplicating', async () => {
            setupHappy({ customfield_10200: ['EXISTING-1', 'TEST-1'] });
            await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['EXISTING-1', 'TEST-1', 'TEST-2'] },
            });
        });

        it('handles when TE has no current tests in custom field', async () => {
            setupHappy({});
            await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['TEST-1', 'TEST-2'] },
            });
        });

        it('reports failed links alongside linked count', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ ...teIssue, fields: { ...teIssue.fields, customfield_10200: [] } })
                .mockResolvedValueOnce(defaultFields)
                .mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.createIssueLink.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Link error'));
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(result).toEqual({ key: 'TE-1', summary: 'My TE' });
            expect(mockLinkManager.createIssueLink).toHaveBeenCalledTimes(2);
        });

        it('uses teKey as summary when TE issue has no summary field', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'TE-1',
                fields: { issuetype: { name: 'Test Execution' } },
            });
            mockJiraResource.getJiraResource.mockResolvedValueOnce(defaultFields);
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.createIssueLink.mockResolvedValue({});
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);
            expect(result).toEqual({ key: 'TE-1', summary: 'TE-1' });
        });
    });
});
