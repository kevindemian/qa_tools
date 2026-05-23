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

import TestExecutionCreator from './test-execution-creator';

describe('TestExecutionCreator', () => {
    let creator: TestExecutionCreator;
    let mockJiraResource: {
        getJiraResource: jest.Mock;
        postJiraResource: jest.Mock;
    };
    let mockLinkManager: {
        createIssueLink: jest.Mock;
    };
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

        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
        };
        mockLinkManager = {
            createIssueLink: jest.fn(),
        };
        creator = new TestExecutionCreator(mockJiraResource as never, mockLinkManager as never);
    });

    afterEach(() => {
        jest.clearAllMocks();
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

        it('throws error when issue type not found', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce([
                { id: '1', name: 'Bug' },
                { id: '3', name: 'Story' },
            ]);
            await expect(creator.create(projectName, testKeys, csvName)).rejects.toThrow(
                'Issue type "Test Execution" não encontrado',
            );
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('throws error when custom field not found', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce([{ id: 'customfield_10100', name: 'Test', schema: { custom: 'some:other' } }]);
            await expect(creator.create(projectName, testKeys, csvName)).rejects.toThrow(
                'Campo "Tests association with a Test Execution" não encontrado',
            );
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('throws error when issuetype response is non-array', async () => {
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ id: '1' });
            await expect(creator.create(projectName, testKeys, csvName)).rejects.toThrow(
                'Falha ao obter tipos de issue do Jira',
            );
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });

        it('throws error when fields response is non-array', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce({ id: 'customfield_1' });
            await expect(creator.create(projectName, testKeys, csvName)).rejects.toThrow(
                'Falha ao obter campos customizados do Jira',
            );
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
});
