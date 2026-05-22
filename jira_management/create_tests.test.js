// 1. Define mock factory values FIRST (before jest.mock)
const mockPrompt = {
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: jest.fn(),
    smartPrompt: jest.fn(),
    printError: jest.fn(),
    printSummary: jest.fn(),
    onError: jest.fn(),
    ProgressBar: jest.fn(),
    Spinner: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    withSpinner: jest.fn().mockImplementation(async (label, fn) => fn()),
    print: jest.fn(),
};

// 2. jest.mock BEFORE any require that uses those modules
jest.mock('../shared/prompt', () => mockPrompt);

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return { ...actual, readFileSync: jest.fn(), existsSync: jest.fn() };
});

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

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

// 3. THEN require the source modules (they'll get the mocked dependencies)
const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');
const { createTestExecution, createTestExecutionWithLinks, generateMappingFiles, validateCsvTests, createTestsFromJson } = require('./create_tests');

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
            .rejects.toThrow('Issue type "Test Execution" não encontrado');
    });

    it('throws when custom field not found', async () => {
        jiraResource.getJiraResource.mockImplementation((url) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve([]);
            return Promise.reject(new Error('unexpected url: ' + url));
        });

        await expect(createTestExecution(jiraResource, PROJECT, ['TEST-1']))
            .rejects.toThrow('Campo "Tests association with a Test Execution" não encontrado');
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
    const realFs = jest.requireActual('fs');
    const tmpDir = '/tmp/qa-tools-test-mapping-' + Date.now();
    const csvPath = '/tmp/test-csv.csv';
    let testIdx = 0;
    const nextBase = () => '/tmp/test-csv-' + (++testIdx);

    beforeAll(() => {
        realFs.writeFileSync(csvPath, 'Title: X\nAction,Data,Expected\nx,y,z\n', 'utf8');
        process.env.CYPRESS_PROJECT_PATH = tmpDir;
    });

    afterAll(() => {
        delete process.env.CYPRESS_PROJECT_PATH;
        try { realFs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        try { realFs.unlinkSync(csvPath); } catch (e) { /* ignore */ }
    });

    function makeSteps(...actions) {
        return actions.map(a => ({ fields: { Action: a, Data: '', ExpectedResult: '' } }));
    }

    it('creates JSON and MD mapping files', () => {
        const base = nextBase();
        const testCases = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1', 'a2') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);

        const jsonPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json';
        const mdPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md';

        expect(realFs.existsSync(jsonPath)).toBe(true);
        expect(realFs.existsSync(mdPath)).toBe(true);

        const json = JSON.parse(realFs.readFileSync(jsonPath, 'utf8'));
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
        const json = JSON.parse(realFs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json', 'utf8'));
        expect(json.tests[0].precondition).toBe('User must be logged in');
        expect(json.tests[0].steps).toHaveLength(1);
        expect(json.tests[0].steps[0].Action).toBe('Click login');
    });

    it('generates MD with full table for each test', () => {
        const base = nextBase();
        const testCases = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);
        const md = realFs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md', 'utf8');
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

describe('createTestsFromJson', () => {
    const PROMPT = require('../shared/prompt');
    const STATE = require('../shared/state');
    const FS = require('fs');

    function makeJiraResource() {
        const r = new JiraResource('fake-token', 'http://jira/rest/api/2');
        r.getJiraResource = jest.fn();
        r.postJiraResource = jest.fn();
        return r;
    }

    function makeLinkManager() {
        const lm = new JiraLinkManager({ get: jest.fn(), post: jest.fn() });
        lm.postLink = jest.fn();
        return lm;
    }

    const BASE_PARAMS = () => ({
        jiraResource: makeJiraResource(),
        jiraResourceXray: makeJiraResource(),
        linkManager: makeLinkManager(),
        linkManagerXray: makeLinkManager(),
        project_name: 'TESTPROJ',
        base_url: 'http://jira',
        sessionLog: { log: jest.fn(), child: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() }) },
        onBusy: jest.fn(),
    });

    afterEach(() => {
        delete process.env.JSON_PATH;
        delete process.env.AUTO_CONFIRM;
        delete process.env.DRY_RUN;
        delete process.env.JSON_LABELS;
        jest.clearAllMocks();
    });

    it('cancela com caminho vazio', async () => {
        PROMPT.smartPrompt.mockReturnValue('');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('vazio'));
    });

    it('cancela com JSON invalido', async () => {
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('not json');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler JSON', expect.any(Error));
    });

    it('cancela com array vazio', async () => {
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('[]');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste'));
    });

    it('cancela com item sem title/steps', async () => {
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([{}]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler JSON', expect.any(Error));
    });

    it('executa dry-run com JSON valido', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([
            { title: 'TC1', steps: [{ Action: 'Click' }] },
            { title: 'TC2', steps: [{ Action: 'Type' }] },
        ]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(result.summary).toContain('2');
        expect(result.sourcePath).toBe('/fake/path.json');
    });

    it('usa state.lastJsonDir para resolver caminho relativo', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        STATE.load.mockReturnValue({ lastJsonDir: '/base/dir' });
        PROMPT.smartPrompt.mockReturnValue('sub/testes.json');
        FS.existsSync.mockReturnValue(true);
        FS.readFileSync.mockImplementation((p) => {
            if (p === '/base/dir/sub/testes.json') {
                return JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }] }]);
            }
            return '[]';
        });
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(result.summary).toContain('1');
        expect(result.sourcePath).toBe('/base/dir/sub/testes.json');
    });

    it('parseia precondition como reference (formato ABC-123)', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([
            { title: 'TC1', steps: [{ Action: 'Click' }], precondition: 'PREC-001' },
        ]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(result.summary).toContain('1');
    });

    it('parseia linkedIssues como strings', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([
            { title: 'TC1', steps: [{ Action: 'Click' }], linkedIssues: ['BUG-1', 'BUG-2'] },
        ]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(result.summary).toContain('1');
    });

    it('parseia linkedIssues como objetos', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        PROMPT.smartPrompt.mockReturnValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([
            { title: 'TC1', steps: [{ Action: 'Click' }], linkedIssues: [{ key: 'BUG-1', linkType: 'Blocks' }] },
        ]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(result.summary).toContain('1');
    });
});
