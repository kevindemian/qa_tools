const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');
const { createTestExecution, createTestExecutionWithLinks, generateMappingFiles, validateCsvTests } = require('./create_tests');

jest.mock('axios', () => {
    const mockInstance = {
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    };
    return { create: jest.fn(() => mockInstance) };
});

const MOCK_ISSUE_TYPES = [
    { id: '11200', name: 'Epic' },
    { id: '11800', name: 'Test' },
    { id: '11802', name: 'Test Execution', description: 'Represents a Test Execution' },
    { id: '11803', name: 'Pre-Condition' },
];

const MOCK_FIELDS = [
    { id: 'customfield_13715', name: 'Tests association with a Test Execution', schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' } },
    { id: 'customfield_13708', name: 'Pre-Conditions association with a Test', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
];

const PROJECT = 'TESTPROJ';

describe('createTestExecution', () => {
    let jiraResource;

    beforeEach(() => {
        jiraResource = new JiraResource('fake-token', 'http://jira/rest/api/2');
        jiraResource.getJiraResource = jest.fn();
        jiraResource.postJiraResource = jest.fn();
    });

    it('creates a Test Execution with given keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1', id: '999' });

        const result = await createTestExecution(jiraResource, PROJECT, ['TEST-1', 'TEST-2'], 'meus-testes');

        expect(result.key).toBe('EXEC-1');
        expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issuetype');
        expect(jiraResource.getJiraResource).toHaveBeenCalledWith('field');
        expect(jiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
            fields: {
                project: { key: PROJECT },
                summary: expect.stringMatching(/^meus-testes - /),
                issuetype: { id: '11802' },
                customfield_13715: ['TEST-1', 'TEST-2'],
            }
        });
    });

    it('uses default name when csvName is empty', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-2' });

        const result = await createTestExecution(jiraResource, PROJECT, ['TEST-3'], '');

        expect(result.key).toBe('EXEC-2');
        expect(jiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
            fields: {
                project: { key: PROJECT },
                summary: expect.stringMatching(/^Automated Execution - /),
                issuetype: { id: '11802' },
                customfield_13715: ['TEST-3'],
            }
        });
    });

    it('throws when issuetype not found', async () => {
        jiraResource.getJiraResource.mockResolvedValue([
            { id: '11200', name: 'Epic' },
            { id: '11800', name: 'Test' },
        ]);

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow('Issue type "Test Execution" nao encontrado');
    });

    it('throws when custom field not found', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve([]);
            return Promise.reject(new Error('unexpected url: ' + url));
        });

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow('Campo "Tests association with a Test Execution" nao encontrado');
    });

    it('throws when issuetype API fails', async () => {
        jiraResource.getJiraResource.mockRejectedValue(new Error('API error'));

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow();
    });

    it('throws when field API returns non-array', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(null);
            return Promise.reject(new Error('unexpected url: ' + url));
        });

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow('Falha ao obter campos customizados');
    });

    it('throws when issuetype API returns non-array', async () => {
        jiraResource.getJiraResource.mockResolvedValue(null);

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow('Falha ao obter tipos de issue');
    });

    it('accepts titleOverride as 5th param', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-3' });

        const result = await createTestExecution(jiraResource, PROJECT, ['TEST-1'], '', 'Custom Title');
        expect(jiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
            fields: expect.objectContaining({
                summary: 'Custom Title',
            })
        });
        expect(result.key).toBe('EXEC-3');
    });
});

describe('createTestExecutionWithLinks', () => {
    /** @type {JiraResource} */
    let jiraResource;
    /** @type {JiraResource} */
    let linkJiraRes;
    /** @type {JiraLinkManager} */
    let linkManager;

    beforeEach(() => {
        jiraResource = new JiraResource('fake-token', 'http://jira/rest/api/2');
        jiraResource.getJiraResource = jest.fn();
        jiraResource.postJiraResource = jest.fn();

        linkJiraRes = new JiraResource('fake-token', 'http://jira/rest/api/2');
        linkJiraRes.getJiraResource = jest.fn();
        linkJiraRes.postJiraResource = jest.fn();
        linkJiraRes.getJiraResource.mockImplementation((url) => {
            if (url === 'issueLinkType') return Promise.resolve({
                issueLinkTypes: [
                    { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' },
                ]
            });
            if (url === 'issueLink') return Promise.resolve({});
            return Promise.reject(new Error('unexpected: ' + url));
        });
        linkManager = new JiraLinkManager(linkJiraRes);
    });

    it('creates TE and links all test keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1') return Promise.resolve({ fields: { issuelinks: [] } });
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        const result = await createTestExecutionWithLinks(
            jiraResource, linkManager, PROJECT, ['TEST-1', 'TEST-2'], 'meus-testes', {}
        );

        expect(result.key).toBe('EXEC-1');
        expect(linkJiraRes.postJiraResource).toHaveBeenCalledWith('issueLink', {
            type: { id: '10201' },
            inwardIssue: { key: 'EXEC-1' },
            outwardIssue: { key: 'TEST-1' }
        });
    });

    it('skips already linked test keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1') return Promise.resolve({
                fields: {
                    issuelinks: [
                        { outwardIssue: { key: 'TEST-1' } }
                    ]
                }
            });
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        await createTestExecutionWithLinks(
            jiraResource, linkManager, PROJECT, ['TEST-1', 'TEST-2'], '', {}
        );

        const linkCalls = linkJiraRes.postJiraResource.mock.calls.filter(c => c[0] === 'issueLink');
        expect(linkCalls).toHaveLength(1);
        expect(linkCalls[0][1].outwardIssue.key).toBe('TEST-2');
    });

    it('handles link API failure gracefully', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1') return Promise.resolve({ fields: { issuelinks: [] } });
            return Promise.reject(new Error('unexpected: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockRejectedValue(new Error('Link failed'));

        const result = await createTestExecutionWithLinks(
            jiraResource, linkManager, PROJECT, ['TEST-1'], '', {}
        );

        expect(result.key).toBe('EXEC-1');
    });
});

describe('generateMappingFiles', () => {
    const tmpDir = '/tmp/qa-tools-test-mapping-' + Date.now();
    const csvPath = '/tmp/test-csv.csv';
    let testIdx = 0;
    const nextBase = () => '/tmp/test-csv-' + (++testIdx);

    beforeAll(() => {
        require('fs').writeFileSync(csvPath, 'Title: X\nAction,Data,Expected\nx,y,z\n', 'utf8');
        process.env.CYPRESS_PROJECT_PATH = tmpDir;
    });

    afterAll(() => {
        delete process.env.CYPRESS_PROJECT_PATH;
        try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        try { require('fs').unlinkSync(csvPath); } catch (e) { /* ignore */ }
    });

    function makeSteps(...actions) {
        return actions.map(a => ({ fields: { Action: a, Data: '', ExpectedResult: '' } }));
    }

    it('creates JSON and MD mapping files', () => {
        const fs = require('fs');
        const base = nextBase();
        const testCases = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1', 'a2') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);

        const jsonPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json';
        const mdPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md';

        expect(fs.existsSync(jsonPath)).toBe(true);
        expect(fs.existsSync(mdPath)).toBe(true);

        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        expect(json.project).toBe('PROJ');
        expect(json.tests).toHaveLength(2);
        expect(json.tests[0].title).toBe('TC1');
        expect(json.tests[0].key).toBe('TEST-1');
        expect(json.tests[0].description).toBe('Descricao do TC1');
        expect(json.tests[0].steps).toHaveLength(2);
    });

    it('returns early when no cypress dir configured', () => {
        delete process.env.CYPRESS_PROJECT_PATH;
        expect(() => generateMappingFiles(nextBase() + '.csv', 'PROJ', ['TEST-1'], [{}])).not.toThrow();
        process.env.CYPRESS_PROJECT_PATH = tmpDir;
    });

    it('returns early when tasksId is empty', () => {
        const capture = jest.fn();
        jest.spyOn(console, 'log').mockImplementation(capture);
        generateMappingFiles(nextBase() + '.csv', 'PROJ', [], []);
        expect(capture).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('includes steps and precondition in JSON mapping', () => {
        const fs = require('fs');
        const base = nextBase();
        const testCases = [
            {
                title: 'TC3',
                description: 'Desc',
                precondition: { type: 'inline', value: 'User must be logged in' },
                steps: makeSteps('Click login')
            },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-3'], testCases);
        const json = JSON.parse(fs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json', 'utf8'));
        expect(json.tests[0].precondition).toBe('User must be logged in');
        expect(json.tests[0].steps).toHaveLength(1);
        expect(json.tests[0].steps[0].Action).toBe('Click login');
    });

    it('generates MD with full table for each test', () => {
        const fs = require('fs');
        const base = nextBase();
        const testCases = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);
        const md = fs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md', 'utf8');
        const mdLines = md.split('\n');
        expect(md).toContain('## TEST-1 — TC1');
        expect(md).toContain('**Descrição:** Descricao do TC1');
        expect(md).toContain('| 1 | a1 |  |  |');
        expect(md).toContain('## TEST-2 — TC2');
        const tc2Section = mdLines.indexOf('## TEST-2 — TC2');
        const tc2Block = md.slice(md.indexOf('## TEST-2 — TC2'), md.indexOf('\n---\n\n', tc2Section));
        expect(tc2Block).not.toContain('**Descrição:**');
    });
});

describe('validateCsvTests', () => {
    it('returns error for empty title', () => {
        const { errors } = validateCsvTests([{ title: '', steps: [{ fields: { Action: 'x' } }] }]);
        expect(errors).toContain('Teste 1: Titulo vazio');
    });

    it('returns warning for duplicate titles', () => {
        const { warnings } = validateCsvTests([
            { title: 'TC1', steps: [{ fields: { Action: 'x' } }] },
            { title: 'TC1', steps: [{ fields: { Action: 'y' } }] },
        ]);
        expect(warnings).toContain('Teste 2: Titulo duplicado "TC1"');
    });

    it('returns error for no steps', () => {
        const { errors } = validateCsvTests([{ title: 'TC1', steps: [] }]);
        expect(errors[0]).toContain('Nenhum step definido');
    });

    it('returns warning for empty Action in step', () => {
        const { warnings } = validateCsvTests([{ title: 'TC1', steps: [{ fields: { Action: '' } }] }]);
        expect(warnings[0]).toContain('sem Action');
    });

    it('returns no errors for valid test', () => {
        const { errors, warnings } = validateCsvTests([{ title: 'TC1', steps: [{ fields: { Action: 'Click' } }] }]);
        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
    });
});
