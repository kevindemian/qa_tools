vi.mock('../../shared/logger', () => ({
    rootLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
    Logger: function () {},
}));

vi.mock('../../shared/ui/prompt.js', () => ({
    success: vi.fn(),
    info: vi.fn(),
    extractErrorMessage: vi.fn((err: unknown) => String(err)),
    withSpinner: vi.fn(async (_label: string, fn: () => Promise<void>) => {
        await fn();
    }),
}));

vi.mock('../../shared/config-accessor.js', () => ({
    default: { getDefault: () => ({ get: () => undefined }) },
}));

import { createMockJiraResource } from '../../shared/test-utils/factories/jira-resource-factory.js';
import type { Mock } from 'vitest';
import { createMockLinkManager } from '../../shared/test-utils/factories/link-manager-factory.js';
import TestExecutionCreator from '../test-execution-creator.js';
import { rootLogger } from '../../shared/logger.js';

describe('TestExecutionCreator', () => {
    let creator: TestExecutionCreator;
    let mockJiraResource: ReturnType<typeof createMockJiraResource>;
    let mockLinkManager: ReturnType<typeof createMockLinkManager>;
    let dateSpy: Mock;

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
        dateSpy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue(fixedTimestamp);

        mockJiraResource = createMockJiraResource();
        mockLinkManager = createMockLinkManager();
        creator = new TestExecutionCreator(mockJiraResource, mockLinkManager);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        dateSpy.mockRestore();
    });

    describe('Create()', () => {
        function setupHappyPath() {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce(defaultFields);
            mockJiraResource.postJiraResource.mockResolvedValue(defaultCreated);
        }

        it('returns { key, summary } with correct structure', async () => {
            expect.hasAssertions();

            setupHappyPath();
            const result = await creator.create(projectName, testKeys, csvName);

            expect(result).toStrictEqual({
                key: 'TE-1',
                summary: 'my_tests.csv - 23/05/2026 10:30',
                linkedParentCount: 0,
            });
        });

        it('posts with correct payload', async () => {
            expect.hasAssertions();

            setupHappyPath();
            await creator.create(projectName, testKeys, csvName);

            expect(mockJiraResource['postJiraResource']).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: projectName },
                    summary: 'my_tests.csv - 23/05/2026 10:30',
                    issuetype: { id: '2' },
                    customfield_10200: testKeys,
                },
            });
        });

        it('returns null and logs error when issue type not found', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce([
                { id: '1', name: 'Bug' },
                { id: '3', name: 'Story' },
            ]);
            const result = await creator.create(projectName, testKeys, csvName);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('Issue type'));
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });

        it('returns null and logs error when custom field not found', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce([{ id: 'customfield_10100', name: 'Test', schema: { custom: 'some:other' } }]);
            const result = await creator.create(projectName, testKeys, csvName);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('Tests association'));
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });

        it('returns null and logs error when issuetype response is non-array', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce({ id: '1' });
            const result = await creator.create(projectName, testKeys, csvName);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('tipos de issue'));
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });

        it('returns null and logs error when fields response is non-array', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(defaultIssueTypes)
                .mockResolvedValueOnce({ id: 'customfield_1' });
            const result = await creator.create(projectName, testKeys, csvName);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('campos customizados'));
            expect(mockJiraResource['postJiraResource']).not.toHaveBeenCalled();
        });

        it('uses title override instead of csvName + timestamp', async () => {
            expect.hasAssertions();

            setupHappyPath();
            await creator.create(projectName, testKeys, csvName, 'My Custom Title');
            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[0]).toBe('issue');
            expect(callArgs?.[1]).toHaveProperty('fields.summary', 'My Custom Title');
        });

        it('uses "Automated Execution" when csvName is empty and no title override', async () => {
            expect.hasAssertions();

            setupHappyPath();
            await creator.create(projectName, testKeys, '');
            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[0]).toBe('issue');
            expect(callArgs?.[1]).toHaveProperty('fields.summary', 'Automated Execution - 23/05/2026 10:30');
        });

        it('applies description from execOpts', async () => {
            expect.hasAssertions();

            setupHappyPath();
            await creator.create(projectName, testKeys, csvName, undefined, { description: 'Smoke suite' });
            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[1]).toHaveProperty('fields.description', 'Smoke suite');
        });

        it('applies labels from execOpts', async () => {
            expect.hasAssertions();

            setupHappyPath();
            await creator.create(projectName, testKeys, csvName, undefined, { labels: ['smoke', 'automacao'] });
            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[1]).toHaveProperty('fields.labels', ['smoke', 'automacao']);
        });
    });

    describe('CreateWithLinks()', () => {
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
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            const result = await creator.createWithLinks(projectName, testKeys, csvName);

            expect(result).toStrictEqual({
                key: 'TE-1',
                summary: 'my_tests.csv - 23/05/2026 10:30',
                linkedParentCount: 0,
            });
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(2);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-1']);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-2']);
        });

        it('skips already-linked tests', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }],
                },
            });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(1);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-2']);
        });

        it('links all unlinked tests when multiple provided', async () => {
            expect.hasAssertions();

            const manyTests = ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4', 'TEST-5'];
            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }, { outwardIssue: { key: 'TEST-3' } }],
                },
            });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            await creator.createWithLinks(projectName, manyTests, csvName);

            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(3);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-2']);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-4']);
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledWith('TE-1', ['TEST-5']);
        });

        it('logs warnings for failed links and continues', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution
                .mockResolvedValueOnce({ created: 1, skipped: 0, failed: [], missing: [] })
                .mockRejectedValueOnce(new Error('API error'));

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(2);
        });

        it('proceeds to try linking all when fetching existing links fails', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockRejectedValueOnce(new Error('Network error'));
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(2);
        });

        it('creates TE without linking when testKeys is empty', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            await creator.createWithLinks(projectName, [], csvName);

            expect(mockLinkManager['linkTestToTestExecution']).not.toHaveBeenCalled();
        });

        it('logs info when all tests are already linked (line 105)', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                fields: {
                    issuelinks: [{ outwardIssue: { key: 'TEST-1' } }, { outwardIssue: { key: 'TEST-2' } }],
                },
            });

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager['linkTestToTestExecution']).not.toHaveBeenCalled();
        });

        it('logs error when outer linking block throws (line 121)', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: {} });

            const prompt = await vi.importMock<{ withSpinner: Mock }>('../../shared/ui/prompt.js');
            prompt.withSpinner.mockRejectedValueOnce(new Error('Spinner error'));

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('Erro ao vincular testes'));
        });

        it('passes title override through to create()', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: {} });

            await creator.createWithLinks(projectName, testKeys, csvName, undefined, { title: 'Custom Title' });

            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[0]).toBe('issue');
            expect(callArgs?.[1]).toHaveProperty('fields.summary', 'Custom Title');
        });

        it('passes description and labels through to create()', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: {} });

            await creator.createWithLinks(projectName, testKeys, csvName, undefined, {
                description: 'Smoke suite',
                labels: ['smoke'],
            });

            const callArgs = mockJiraResource.postJiraResource.mock.calls[0];

            expect(callArgs?.[1]).toHaveProperty('fields.description', 'Smoke suite');
            expect(callArgs?.[1]).toHaveProperty('fields.labels', ['smoke']);
        });

        it('links TE to declared TE linked issues using each entry own link type', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });
            mockLinkManager.linkSourceToTargets.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            const result = await creator.createWithLinks(projectName, testKeys, csvName, [
                { key: 'ECSPOL-100', linkType: 'Relates' },
                { key: 'ECSPOL-200', linkType: 'blocks' },
            ]);

            expect(mockLinkManager['linkSourceToTargets']).toHaveBeenCalledTimes(1);
            expect(mockLinkManager['linkSourceToTargets']).toHaveBeenCalledWith('TE-1', [
                { key: 'ECSPOL-100', linkType: 'Relates' },
                { key: 'ECSPOL-200', linkType: 'blocks' },
            ]);
            expect(result?.linkedParentCount).toBe(1);
        });

        it('does NOT link TE to parents when no TE linked issues declared', async () => {
            expect.hasAssertions();

            setupCreate('TE-1');
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });

            await creator.createWithLinks(projectName, testKeys, csvName);

            expect(mockLinkManager['linkSourceToTargets']).not.toHaveBeenCalled();
        });
    });

    describe('AddTestsToExistingExecution', () => {
        const teKey = 'TE-1';
        const teIssue = {
            key: 'TE-1',
            fields: { summary: 'My TE', issuetype: { name: 'Test Execution' } },
        };

        function setupHappy(extraFields?: Record<string, unknown>) {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ ...teIssue, fields: { ...teIssue.fields, ...extraFields } }) // pagination
                .mockResolvedValueOnce(defaultFields)
                .mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });
        }

        it('returns { key, summary } on success', async () => {
            expect.hasAssertions();

            setupHappy({ customfield_10200: [] });
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(result).toStrictEqual({ key: 'TE-1', summary: 'My TE', linkedParentCount: 0 });
            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['TEST-1', 'TEST-2'] },
            });
        });

        it('returns null and logs error when issue is not Test Execution type', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'BUG-1',
                fields: { issuetype: { name: 'Bug' } },
            });
            const result = await creator.addTestsToExistingExecution('BUG-1', testKeys);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('não é uma Test Execution'));
        });

        it('returns null when TE has unknown issuetype', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'X-1',
                fields: {},
            });
            const result = await creator.addTestsToExistingExecution('X-1', testKeys);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('não é uma Test Execution'));
        });

        it('returns null when fields response is non-array', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce(teIssue).mockResolvedValueOnce({ not: 'array' });
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('campos customizados'));
        });

        it('returns null when custom field not found', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(teIssue)
                .mockResolvedValueOnce([{ id: 'cf1', name: 'Other', schema: { custom: 'other:type' } }]);
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(result).toBeNull();
            expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('Tests association'));
        });

        it('merges existing tests with new ones, deduplicating', async () => {
            expect.hasAssertions();

            setupHappy({ customfield_10200: ['EXISTING-1', 'TEST-1'] });
            await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['EXISTING-1', 'TEST-1', 'TEST-2'] },
            });
        });

        it('handles when TE has no current tests in custom field', async () => {
            expect.hasAssertions();

            setupHappy({});
            await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(mockJiraResource['putJiraResource']).toHaveBeenCalledWith('issue/TE-1', {
                fields: { customfield_10200: ['TEST-1', 'TEST-2'] },
            });
        });

        it('reports failed links alongside linked count', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ ...teIssue, fields: { ...teIssue.fields, customfield_10200: [] } }) // pagination
                .mockResolvedValueOnce(defaultFields)
                .mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution
                .mockResolvedValueOnce({ created: 1, skipped: 0, failed: [], missing: [] })
                .mockRejectedValueOnce(new Error('Link error'));
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(result).toStrictEqual({ key: 'TE-1', summary: 'My TE', linkedParentCount: 0 });
            expect(mockLinkManager['linkTestToTestExecution']).toHaveBeenCalledTimes(2);
        });

        it('uses teKey as summary when TE issue has no summary field', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValueOnce({
                key: 'TE-1',
                fields: { issuetype: { name: 'Test Execution' } },
            });
            mockJiraResource.getJiraResource.mockResolvedValueOnce(defaultFields);
            mockJiraResource.getJiraResource.mockResolvedValueOnce({ fields: { issuelinks: [] } });
            mockLinkManager.linkTestToTestExecution.mockResolvedValue({
                created: 1,
                skipped: 0,
                failed: [],
                missing: [],
            });
            const result = await creator.addTestsToExistingExecution(teKey, testKeys);

            expect(result).toStrictEqual({ key: 'TE-1', summary: 'TE-1', linkedParentCount: 0 });
        });
    });
});
