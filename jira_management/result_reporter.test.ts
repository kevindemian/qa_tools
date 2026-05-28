import fs from 'fs';
import os from 'os';
import { matchResultsToTests, createTestExecutionFromResults } from './result_reporter';
import JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import { rootLogger } from '../shared/logger';

jest.mock('axios', () => {
    const mockInstance = {
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    };
    return { create: jest.fn(() => mockInstance) };
});

jest.mock('../shared/logger', () => ({
    rootLogger: { warn: jest.fn(), child: () => ({ info: jest.fn(), warn: jest.fn() }) },
    Logger: jest.fn().mockImplementation(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    isQuiet: () => true,
}));

const MOCK_ISSUE_TYPES = [
    { id: '11802', name: 'Test Execution' },
    { id: '11800', name: 'Test' },
];

const MOCK_FIELDS = [
    {
        id: 'customfield_13715',
        name: 'Tests association with a Test Execution',
        schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
    },
    {
        id: 'customfield_13708',
        name: 'Pre-Conditions association with a Test',
        schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' },
    },
];

describe('matchResultsToTests', () => {
    const tmpDir = os.tmpdir() + '/qa-test-reporter-' + Date.now();
    const mappingPath = tmpDir + '/mapping.json';

    beforeAll(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        const mapping = {
            project: 'PROJ',
            csv: 'test.csv',
            timestamp: new Date().toISOString(),
            tests: [
                { title: 'TC01 - Login valido', key: 'TEST-1' },
                { title: 'TC02 - Login invalido', key: 'TEST-2' },
            ],
        };
        fs.writeFileSync(mappingPath, JSON.stringify(mapping), 'utf8');
    });

    afterAll(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            /* ignore */
        }
    });

    it('matches exact titles to Jira keys', () => {
        const results = [
            { title: 'TC01 - Login valido', state: 'passed' as const, duration: 300 },
            { title: 'TC02 - Login invalido', state: 'failed' as const, duration: 200 },
        ];
        const result = matchResultsToTests(results, mappingPath);
        expect(result.matched).toHaveLength(2);
        expect(result.matched[0]!.key).toBe('TEST-1');
        expect(result.matched[0]!.status).toBe('passed');
        expect(result.matched[1]!.key).toBe('TEST-2');
        expect(result.matched[1]!.status).toBe('failed');
        expect(result.unmatched).toHaveLength(0);
    });

    it('flags unmatched titles', () => {
        const results = [{ title: 'TC99 - Unknown', state: 'passed' as const, duration: 100 }];
        const result = matchResultsToTests(results, mappingPath);
        expect(result.matched).toHaveLength(0);
        expect(result.unmatched).toHaveLength(1);
        expect(result.unmatched[0]!.title).toBe('TC99 - Unknown');
    });

    it('calculates stats correctly', () => {
        const results = [
            { title: 'TC01 - Login valido', state: 'passed' as const, duration: 300 },
            { title: 'TC02 - Login invalido', state: 'failed' as const, duration: 200 },
            { title: 'Extra', state: 'passed' as const, duration: 100 },
        ];
        const result = matchResultsToTests(results, mappingPath);
        expect(result.stats.passed).toBe(1);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.skipped).toBe(0);
        expect(result.stats.total).toBe(2);
    });

    it('returns empty for missing mapping file', () => {
        const result = matchResultsToTests([], '/nonexistent.json');
        expect(result.matched).toEqual([]);
    });

    it('performs fuzzy match when title differs slightly', () => {
        const results = [{ title: 'Login valido', state: 'passed' as const, duration: 100 }];
        const result = matchResultsToTests(results, mappingPath);
        expect(result.matched).toHaveLength(1);
        expect(result.matched[0]!.key).toBe('TEST-1');
    });

    it('returns empty result and warns when tests array is empty', () => {
        const emptyMappingPath = tmpDir + '/empty_mapping.json';
        fs.writeFileSync(emptyMappingPath, JSON.stringify({ tests: [] }), 'utf8');

        const result = matchResultsToTests([], emptyMappingPath);
        expect(result.stats.total).toBe(0);
        expect(result.matched).toEqual([]);
        expect(rootLogger.warn).toHaveBeenCalledWith('Mapping JSON vazio');
    });

    it('returns null for empty/undefined title in _fuzzyMatch', () => {
        const results = [{ title: '', state: 'passed' as const, duration: 100 }];
        const result = matchResultsToTests(results, mappingPath);
        expect(result.unmatched).toHaveLength(1);
        expect(result.unmatched[0]!.title).toBe('');
    });
});

describe('createTestExecutionFromResults', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- methods replaced with jest.fn() in beforeEach
    let jiraResource: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- methods replaced with jest.fn() in beforeEach
    let linkJiraRes: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JiraLinkManager used with mocked JiraResource
    let linkManager: any;

    beforeEach(() => {
        jiraResource = new JiraResource('fake-token', 'http://jira/rest/api/2');
        jiraResource.getJiraResource = jest.fn();
        jiraResource.postJiraResource = jest.fn();

        linkJiraRes = new JiraResource('fake-token', 'http://jira/rest/api/2');
        linkJiraRes.getJiraResource = jest.fn();
        linkJiraRes.postJiraResource = jest.fn();
        linkJiraRes.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issueLinkType')
                return Promise.resolve({
                    issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
                });
            return Promise.resolve({});
        });
        linkManager = new JiraLinkManager(linkJiraRes);
    });

    it('creates TE with matched results and links', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.resolve({});
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        const matched = [
            { key: 'TEST-1', title: 'TC01', status: 'passed' as const, duration: 300 },
            { key: 'TEST-2', title: 'TC02', status: 'failed' as const, duration: 200 },
        ];

        const result = await createTestExecutionFromResults(jiraResource, linkManager, 'PROJ', matched, 'test-csv', {
            pipelineId: 42,
            branch: 'main',
            provider: 'gitlab',
        });

        expect(result.key).toBe('EXEC-1');
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
        expect(jiraResource.postJiraResource).toHaveBeenCalledWith(
            'issue',
            expect.objectContaining({
                fields: expect.objectContaining({
                    summary: expect.stringContaining('Results:'),
                }),
            }),
        );
    });

    it('skips linking for skipped tests', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.resolve({});
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-2' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        const matched = [
            { key: 'TEST-1', title: 'TC01', status: 'passed' as const, duration: 300 },
            { key: 'TEST-3', title: 'TC03', status: 'skipped' as const, duration: 0 },
        ];

        const result = await createTestExecutionFromResults(jiraResource, linkManager, 'PROJ', matched, 'test-csv');

        expect(result.key).toBe('EXEC-2');
        expect(result.passed).toBe(1);
        expect(result.skipped).toBe(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock.calls on replaced method
        const linkCalls = linkJiraRes.postJiraResource.mock.calls.filter((c: any) => c[0] === 'issueLink');
        expect(linkCalls).toHaveLength(1);
        expect(linkCalls[0][1].outwardIssue.key).toBe('TEST-1');
    });

    it('logs warning when createIssueLink throws, but execution is still created', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.resolve({});
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-3' });
        linkJiraRes.postJiraResource.mockRejectedValue(new Error('Link error'));

        const matched = [{ key: 'TEST-1', title: 'TC01', status: 'passed' as const, duration: 300 }];

        const result = await createTestExecutionFromResults(jiraResource, linkManager, 'PROJ', matched, 'test-csv');
        expect(result.key).toBe('EXEC-3');
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao linkar'));
    });
});
