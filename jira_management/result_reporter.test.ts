import fs from 'fs';
import type { Mocked } from 'vitest';
import os from 'os';
import { matchResultsToTests, createTestExecutionFromResults } from './result_reporter.js';
import JiraResource from './jira_resource.js';
import JiraLinkManager from './jira_link_manager.js';
import { rootLogger } from '../shared/logger.js';
import { nonNull } from '../shared/test-utils.js';

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
        })),
    },
}));

vi.mock('../shared/logger', () => ({
    rootLogger: {
        debug: vi.fn(),
        warn: vi.fn(),
        child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    },
    Logger: vi.fn(function () {
        return { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    }),
}));

vi.mock('../shared/prompt', () => ({
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    isQuiet: () => true,
    withSpinner: vi.fn(async (_label: string, fn: () => Promise<void>) => fn()),
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
        } catch {
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
        expect(nonNull(result.matched[0]).key).toBe('TEST-1');
        expect(nonNull(result.matched[0]).status).toBe('passed');
        expect(nonNull(result.matched[1]).key).toBe('TEST-2');
        expect(nonNull(result.matched[1]).status).toBe('failed');
        expect(result.unmatched).toHaveLength(0);
    });

    it('flags unmatched titles', () => {
        const results = [{ title: 'TC99 - Unknown', state: 'passed' as const, duration: 100 }];
        const result = matchResultsToTests(results, mappingPath);

        expect(result.matched).toHaveLength(0);
        expect(result.unmatched).toHaveLength(1);
        expect(nonNull(result.unmatched[0]).title).toBe('TC99 - Unknown');
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
        expect(nonNull(result.matched[0]).key).toBe('TEST-1');
    });

    it('returns empty result and warns when tests array is empty', () => {
        const emptyMappingPath = tmpDir + '/empty_mapping.json';
        fs.writeFileSync(emptyMappingPath, JSON.stringify({ tests: [] }), 'utf8');

        const result = matchResultsToTests([], emptyMappingPath);

        expect(result.stats.total).toBe(0);
        expect(result.matched).toEqual([]);
        expect(rootLogger['warn']).toHaveBeenCalledWith('Mapping JSON vazio');
    });

    it('returns null for empty/undefined title in _fuzzyMatch', () => {
        const results = [{ title: '', state: 'passed' as const, duration: 100 }];
        const result = matchResultsToTests(results, mappingPath);

        expect(result.unmatched).toHaveLength(1);
        expect(nonNull(result.unmatched[0]).title).toBe('');
    });
});

describe('createTestExecutionFromResults', () => {
    let jiraResource: Mocked<JiraResource>;
    let linkJiraRes: Mocked<JiraResource>;
    let linkManager: JiraLinkManager;

    beforeEach(() => {
        jiraResource = vi.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jiraResource.getJiraResource = vi.fn() as typeof jiraResource.getJiraResource;
        jiraResource.postJiraResource = vi.fn() as typeof jiraResource.postJiraResource;
        jiraResource.putJiraResource = vi.fn() as typeof jiraResource.putJiraResource;

        linkJiraRes = vi.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        linkJiraRes.getJiraResource = vi.fn() as typeof linkJiraRes.getJiraResource;
        linkJiraRes.postJiraResource = vi.fn() as typeof linkJiraRes.postJiraResource;
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

        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'PROJ',
            matchedResults: matched,
            csvName: 'test-csv',
            pipelineInfo: { pipelineId: 42, branch: 'main', provider: 'gitlab' },
        });

        expect(result.key).toBe('EXEC-1');
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
        expect(jiraResource['postJiraResource']).toHaveBeenCalledWith('issue', expect.anything());

        const [, postArg] = nonNull(jiraResource.postJiraResource.mock.calls[0]);

        expect(postArg).toHaveProperty('fields.summary', expect.stringContaining('Results:'));
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

        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'PROJ',
            matchedResults: matched,
            csvName: 'test-csv',
        });

        expect(result.key).toBe('EXEC-2');
        expect(result.passed).toBe(1);
        expect(result.skipped).toBe(1);

        const linkCalls = linkJiraRes.postJiraResource.mock.calls.filter(
            (c): c is [string, { outwardIssue: { key: string } }] => c[0] === 'issueLink',
        );

        expect(linkCalls).toHaveLength(1);
        expect(nonNull(linkCalls[0])[1].outwardIssue.key).toBe('TEST-1');
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

        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'PROJ',
            matchedResults: matched,
            csvName: 'test-csv',
        });

        expect(result.key).toBe('EXEC-3');
        expect(rootLogger['warn']).toHaveBeenCalledWith(expect.stringContaining('Falha ao linkar'));
    });

    it('uses existingTeKey to add tests to existing TE instead of creating new', async () => {
        const teKey = 'EXEC-EXISTING-1';
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issue/' + teKey) {
                return Promise.resolve({
                    key: teKey,
                    fields: { summary: 'Regression run', issuetype: { name: 'Test Execution' } },
                });
            }
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.resolve({});
        });
        jiraResource.putJiraResource = vi.fn().mockResolvedValue({});

        const matched = [
            { key: 'TEST-1', title: 'TC01', status: 'passed' as const, duration: 300 },
            { key: 'TEST-2', title: 'TC02', status: 'failed' as const, duration: 200 },
        ];

        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'PROJ',
            matchedResults: matched,
            csvName: 'test-csv',
            pipelineInfo: { pipelineId: 42, branch: 'main', provider: 'gitlab' },
            existingTeKey: teKey,
        });

        expect(result.key).toBe(teKey);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
        expect(jiraResource['putJiraResource']).toHaveBeenCalledWith('issue/' + teKey, expect.anything());

        const [, putArg] = nonNull(jiraResource.putJiraResource.mock.calls[0]);

        expect(putArg).toHaveProperty('fields.customfield_13715', expect.any(Array));
        expect(jiraResource['postJiraResource']).not.toHaveBeenCalledWith('issue', expect.anything());
    });
});
