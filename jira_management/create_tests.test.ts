type FsModule = typeof import('fs');

// 1. Define mock factory values FIRST (before jest.mock)
const mockPrompt = {
    success: jest.fn<void, [string]>(),
    error: jest.fn<void, [string]>(),
    warn: jest.fn<void, [string]>(),
    info: jest.fn<void, [string]>(),
    title: jest.fn<void, [string]>(),
    divider: jest.fn<void, []>(),
    prompt: jest.fn<string, [string]>().mockReturnValue(''),
    confirm: jest.fn<boolean, [string]>(),
    ask: jest.fn<Promise<string>, [string]>().mockResolvedValue(''),
    askConfirm: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    smartPrompt: jest.fn<Promise<string>, [string]>(),
    printError: jest.fn<void, [label: string, error: Error]>(),
    printSummary: jest.fn<void, [results: object[], header?: string]>(),
    onError: jest.fn<'retry' | 'abort' | 'continue', [context: string, error: Error]>(),
    ProgressBar: jest.fn<object, [total: number]>(),
    Spinner: jest.fn<object, [opts: object]>(),
    isQuiet: jest.fn<boolean, []>().mockReturnValue(true),
    withSpinner: jest
        .fn<Promise<void>, [label: string, fn: () => Promise<void>]>()
        .mockImplementation(async (_label: string, fn: () => Promise<void>) => fn()),
    print: jest.fn<void, [string]>(),
    askFilePath: jest.fn<Promise<string>, [string]>().mockResolvedValue('/fake/path.json'),
};

// 2. jest.mock BEFORE any require that uses those modules
jest.mock('../shared/prompt', () => mockPrompt);

jest.mock('fs', () => {
    const actual = jest.requireActual<FsModule>('fs');
    return { ...actual, readFileSync: jest.fn<string, [string]>(), existsSync: jest.fn<boolean, [string]>() };
});

jest.mock('../shared/state', () => ({
    load: jest.fn<object, []>().mockReturnValue({}),
    update: jest.fn<object, [(state: object) => void]>(),
}));

jest.mock('../shared/temp-dir', () => ({
    reportsDir: jest.fn<string, []>(),
    writeEphemeral: jest.fn<string, [string, string, string]>(),
    tempDirPath: jest.fn<string, []>().mockReturnValue('/tmp/qa-tools-temp'),
}));

jest.mock('axios', () => {
    const mockInstance = {
        interceptors: {
            request: {
                use: jest.fn<
                    void,
                    [onFulfilled: (value: object) => object | Promise<object>, onRejected: (error: object) => object]
                >(),
            },
            response: {
                use: jest.fn<
                    void,
                    [onFulfilled: (response: object) => object, onRejected: (error: object) => object]
                >(),
            },
        },
        get: jest.fn<Promise<object>, [url: string]>(),
        post: jest.fn<Promise<object>, [url: string, data?: object]>(),
        put: jest.fn<Promise<object>, [url: string, data?: object]>(),
    };
    return { create: jest.fn<typeof mockInstance, [config?: object]>().mockReturnValue(mockInstance) };
});

// 3. THEN import the source modules (they'll get the mocked dependencies)
import JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import TestExecutionCreator from './test-execution-creator';
import type { TestCase } from '../shared/types';
import CsvResource from './csv_resource';
import IssueLinker from './issue-linker';
import createTestsModule from './create_tests';
import * as tempDirModule from '../shared/temp-dir';
const {
    createTestsFromCsv,
    createTestExecution,
    createTestExecutionWithLinks,
    generateMappingFiles,
    validateCsvTests,
    createTestsFromJson,
    updateCrossReferences,
} = createTestsModule;
import * as PROMPT from '../shared/prompt';
import * as STATE from '../shared/state';
import fs from 'fs';

import { createMockLogger, nonNull } from '../shared/test-utils';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory';
import { createMockLinkManager } from '../shared/test-utils/factories/link-manager-factory';

const MOCK_ISSUE_TYPES = [
    { id: '11200', name: 'Epic' },
    { id: '11800', name: 'Test' },
    { id: '11802', name: 'Test Execution', description: 'Represents a Test Execution' },
    { id: '11803', name: 'Pre-Condition' },
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

const PROJECT = 'TESTPROJ';

describe('createTestExecution', () => {
    let jiraResource: jest.MockedObjectDeep<JiraResource>;
    let testExecutionCreator: TestExecutionCreator;

    beforeEach(() => {
        jiraResource = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(jiraResource, 'getJiraResource');
        jest.spyOn(jiraResource, 'postJiraResource');
        const linkManager = new JiraLinkManager(jiraResource);
        testExecutionCreator = new TestExecutionCreator(jiraResource, linkManager);
    });

    it('creates a Test Execution with given keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1', id: '999' });

        const result = await createTestExecution({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-1', 'TEST-2'],
            csvName: 'meus-testes',
        });

        expect(nonNull(result).key).toBe('EXEC-1');
        expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issuetype');
        expect(jiraResource.getJiraResource).toHaveBeenCalledWith('field');
        expect(jiraResource.postJiraResource).toHaveBeenCalled();
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.project', { key: PROJECT });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.issuetype', { id: '11802' });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.customfield_13715', [
            'TEST-1',
            'TEST-2',
        ]);
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty(
            'fields.summary',
            expect.stringMatching(/^meus-testes - /),
        );
    });

    it('uses default name when csvName is empty', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-2' });

        const result = await createTestExecution({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-3'],
            csvName: '',
        });

        expect(nonNull(result).key).toBe('EXEC-2');
        expect(jiraResource.postJiraResource).toHaveBeenCalled();
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.project', { key: PROJECT });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.issuetype', { id: '11802' });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.customfield_13715', ['TEST-3']);
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty(
            'fields.summary',
            expect.stringMatching(/^Automated Execution - /),
        );
    });

    it('returns null when issuetype not found', async () => {
        jiraResource.getJiraResource.mockResolvedValue([
            { id: '11200', name: 'Epic' },
            { id: '11800', name: 'Test' },
        ]);

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('returns null when custom field not found', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve([]);
            return Promise.reject(new Error('unexpected url: ' + url));
        });

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('throws when issuetype API fails', async () => {
        jiraResource.getJiraResource.mockRejectedValue(new Error('API error'));

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).rejects.toThrow();
    });

    it('returns null when field API returns non-array', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(null);
            return Promise.reject(new Error('unexpected url: ' + url));
        });

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('returns null when issuetype API returns non-array', async () => {
        jiraResource.getJiraResource.mockResolvedValue(null);

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('accepts titleOverride as 5th param', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-3' });

        const result = await createTestExecution({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-1'],
            csvName: '',
            titleOverride: 'Custom Title',
        });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.summary', 'Custom Title');
        expect(nonNull(result).key).toBe('EXEC-3');
    });
});

describe('createTestExecutionWithLinks', () => {
    let jiraResource: jest.MockedObjectDeep<JiraResource>;
    let linkJiraRes: jest.MockedObjectDeep<JiraResource>;
    let testExecutionCreator: TestExecutionCreator;

    beforeEach(() => {
        jiraResource = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(jiraResource, 'getJiraResource');
        jest.spyOn(jiraResource, 'postJiraResource');

        linkJiraRes = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(linkJiraRes, 'getJiraResource');
        jest.spyOn(linkJiraRes, 'postJiraResource');
        linkJiraRes.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issueLinkType')
                return Promise.resolve({
                    issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
                });
            if (url === 'issueLink') return Promise.resolve({});
            return Promise.reject(new Error('unexpected: ' + url));
        });
        const linkManager = new JiraLinkManager(linkJiraRes);
        testExecutionCreator = new TestExecutionCreator(jiraResource, linkManager);
    });

    it('creates TE and links all test keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1') return Promise.resolve({ fields: { issuelinks: [] } });
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        const result = await createTestExecutionWithLinks({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-1', 'TEST-2'],
            csvName: 'meus-testes',
            execOpts: {},
        });

        expect(nonNull(result).key).toBe('EXEC-1');
        expect(linkJiraRes.postJiraResource).toHaveBeenCalledWith('issueLink', {
            type: { id: '10201' },
            inwardIssue: { key: 'EXEC-1' },
            outwardIssue: { key: 'TEST-1' },
        });
    });

    it('skips already linked test keys', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1')
                return Promise.resolve({
                    fields: {
                        issuelinks: [{ outwardIssue: { key: 'TEST-1' } }],
                    },
                });
            return Promise.reject(new Error('unexpected url: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockResolvedValue({});

        await createTestExecutionWithLinks({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-1', 'TEST-2'],
            csvName: '',
            execOpts: {},
        });

        const linkCalls = linkJiraRes.postJiraResource.mock.calls.filter(
            (c): c is [string, { outwardIssue: { key: string } }] => c[0] === 'issueLink',
        );
        expect(linkCalls).toHaveLength(1);
        expect(nonNull(linkCalls[0])[1].outwardIssue.key).toBe('TEST-2');
    });

    it('handles link API failure gracefully', async () => {
        jiraResource.getJiraResource.mockImplementation((url: string) => {
            if (url === 'issuetype') return Promise.resolve(MOCK_ISSUE_TYPES);
            if (url === 'field') return Promise.resolve(MOCK_FIELDS);
            if (url === 'issue/EXEC-1') return Promise.resolve({ fields: { issuelinks: [] } });
            return Promise.reject(new Error('unexpected: ' + url));
        });
        jiraResource.postJiraResource.mockResolvedValue({ key: 'EXEC-1' });
        linkJiraRes.postJiraResource.mockRejectedValue(new Error('Link failed'));

        const result = await createTestExecutionWithLinks({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys: ['TEST-1'],
            csvName: '',
            execOpts: {},
        });

        expect(nonNull(result).key).toBe('EXEC-1');
    });
});

describe('generateMappingFiles', () => {
    const realFs = jest.requireActual<FsModule>('fs');
    const tmpDir = '/tmp/qa-tools-test-mapping-' + Date.now();
    const csvPath = '/tmp/test-csv.csv';
    let testIdx = 0;
    const nextBase = () => '/tmp/test-csv-' + ++testIdx;

    beforeAll(() => {
        realFs.writeFileSync(csvPath, 'Title: X\nAction,Data,Expected\nx,y,z\n', 'utf8');
        jest.mocked(tempDirModule).reportsDir.mockReturnValue(tmpDir);
    });

    afterAll(() => {
        try {
            realFs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
        try {
            realFs.unlinkSync(csvPath);
        } catch {
            /* ignore */
        }
    });

    function makeSteps(...actions: string[]) {
        return actions.map((a) => ({ fields: { Action: a, Data: '', 'Expected Result': '' } }));
    }

    it('creates JSON and MD mapping files', () => {
        const base = nextBase();
        const testCases: Partial<TestCase>[] = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1', 'a2') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases as TestCase[]);

        const jsonPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json';
        const mdPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md';

        expect(realFs.existsSync(jsonPath)).toBe(true);
        expect(realFs.existsSync(mdPath)).toBe(true);

        const content = realFs.readFileSync(jsonPath, 'utf8');
        expect(content).toContain('"project": "PROJ"');
        expect(content).toContain('"title": "TC1"');
        expect(content).toContain('"key": "TEST-1"');
        expect(content).toContain('"description": "Descricao do TC1"');
        expect(content).toContain('"title": "TC2"');
        expect(content).toContain('"Action": "a1"');
        expect(content).toContain('"Action": "a2"');
    });

    it('generates mapping files regardless of CYPRESS_PROJECT_PATH', () => {
        delete process.env.CYPRESS_PROJECT_PATH;
        const base = nextBase();
        const testCases: TestCase[] = [{ title: 'TC', steps: [] }];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1'], testCases);
        expect(realFs.existsSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json')).toBe(true);
        process.env.CYPRESS_PROJECT_PATH = tmpDir;
    });

    it('returns early when tasksId is empty', () => {
        const capture = jest.fn<void, [...string[]]>();
        jest.spyOn(console, 'log').mockImplementation(capture);
        generateMappingFiles(nextBase() + '.csv', 'PROJ', [], []);
        expect(capture).not.toHaveBeenCalled();
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('includes steps and precondition in JSON mapping', () => {
        const base = nextBase();
        const testCases: TestCase[] = [
            {
                title: 'TC3',
                description: 'Desc',
                precondition: { type: 'inline', value: 'User must be logged in' },
                steps: makeSteps('Click login'),
            },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-3'], testCases);
        const content2 = realFs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json', 'utf8');
        expect(content2).toContain('"precondition": "User must be logged in"');
        expect(content2).toContain('"Action": "Click login"');
    });

    it('generates MD with full steps for each test', () => {
        const base = nextBase();
        const testCases: Partial<TestCase>[] = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1') },
            { title: 'TC2' },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases as TestCase[]);
        const md = realFs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md', 'utf8');
        const mdLines = md.split('\n');
        expect(md).toContain('## TEST-1 — TC1');
        expect(md).toContain('**Description:** Descricao do TC1');
        expect(md).toContain('### Steps');
        expect(md).toContain('**Step 1**');
        expect(md).toContain('- **Action:** a1');
        expect(md).toContain('## TEST-2 — TC2');
        const tc2Section = mdLines.indexOf('## TEST-2 — TC2');
        const tc2Block = md.slice(md.indexOf('## TEST-2 — TC2'), md.indexOf('\n---\n\n', tc2Section));
        expect(tc2Block).not.toContain('**Description:**');
    });
});

describe('validateCsvTests', () => {
    it('returns error for empty title', () => {
        const { errors } = validateCsvTests([{ title: '', steps: [{ fields: { Action: 'x' } }] }]);
        expect(errors[0]).toContain('Título é obrigatório');
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
        expect(errors[0]).toContain('Pelo menos um step');
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
    const FS: jest.MockedObjectDeep<typeof fs> = jest.mocked(fs);

    function makeJiraResource(): jest.MockedObjectDeep<JiraResource> {
        const r = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(r, 'getJiraResource');
        jest.spyOn(r, 'postJiraResource');
        return r;
    }

    function makeLinkManager(): JiraLinkManager & { postLink: jest.Mock } {
        const fakeJira = createMockJiraResource();
        const lm = new JiraLinkManager(fakeJira) as JiraLinkManager & { postLink: jest.Mock };
        lm.postLink = jest.fn<
            Promise<{ action?: string } | null>,
            [resource: JiraResource, payload: Record<string, object>]
        >();
        return lm;
    }

    function BASE_PARAMS() {
        return {
            jiraResource: makeJiraResource(),
            jiraResourceXray: makeJiraResource(),
            linkManager: makeLinkManager(),
            linkManagerXray: makeLinkManager(),
            project_name: 'TESTPROJ' as const,
            base_url: 'http://jira',
            sessionLog: createMockLogger(),
            onBusy: jest.fn<void, [boolean]>(),
        } satisfies Parameters<typeof createTestsFromJson>[0];
    }
    afterEach(() => {
        delete process.env.JSON_PATH;
        delete process.env.AUTO_CONFIRM;
        delete process.env.DRY_RUN;
        delete process.env.JSON_LABELS;
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('cancela com caminho vazio', async () => {
        jest.mocked(PROMPT.askFilePath).mockResolvedValueOnce('');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('vazio'));
    });

    it('cancela com JSON invalido', async () => {
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('not json');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler JSON', expect.any(Error));
    });

    it('cancela com array vazio', async () => {
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('[]');
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler JSON', expect.any(Error));
    });

    it('cancela com item sem title/steps', async () => {
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([{}]));
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler JSON', expect.any(Error));
    });

    it('executa dry-run com JSON valido', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([
                { title: 'TC1', steps: [{ Action: 'Click' }] },
                { title: 'TC2', steps: [{ Action: 'Type' }] },
            ]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('2');
        expect(nonNull(result).sourcePath).toBe('/fake/path.json');
    });

    it('usa state.lastJsonDir para resolver caminho relativo', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        jest.mocked(STATE.load).mockReturnValue({ lastJsonDir: '/base/dir' });
        jest.mocked(PROMPT.askFilePath).mockResolvedValueOnce('sub/testes.json');
        FS.existsSync.mockReturnValue(true);
        FS.readFileSync.mockImplementation(((p: string) => {
            if (p === '/base/dir/sub/testes.json') {
                return JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }] }]);
            }
            return '[]';
        }) as typeof FS.readFileSync);
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
        expect(nonNull(result).sourcePath).toBe('/base/dir/sub/testes.json');
    });

    it('parseia precondition como reference (formato ABC-123)', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }], precondition: 'PREC-001' }]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });

    it('parseia linkedIssues como strings', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }], linkedIssues: ['BUG-1', 'BUG-2'] }]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });

    it('parseia linkedIssues como objetos', async () => {
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        jest.mocked(PROMPT.ask).mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([
                { title: 'TC1', steps: [{ Action: 'Click' }], linkedIssues: [{ key: 'BUG-1', linkType: 'Blocks' }] },
            ]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });
});

describe('readCsvTests (via createTestsFromCsv)', () => {
    let csvResource: jest.MockedObjectDeep<CsvResource>;

    function makeJiraResForCsv(): jest.MockedObjectDeep<JiraResource> {
        const r = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(r, 'getJiraResource');
        jest.spyOn(r, 'postJiraResource');
        return r;
    }

    function makeLinkMgrForCsv(): JiraLinkManager {
        const fakeJira = createMockJiraResource();
        return new JiraLinkManager(fakeJira);
    }

    function makeCsvArgs(overrides: Record<string, unknown> = {}) {
        const sessionLog = createMockLogger();
        return {
            jiraResource: makeJiraResForCsv(),
            jiraResourceXray: makeJiraResForCsv(),
            linkManager: makeLinkMgrForCsv(),
            linkManagerXray: makeLinkMgrForCsv(),
            csvResource,
            project_name: 'TESTPROJ',
            base_url: 'http://jira',
            sessionLog,
            onBusy: jest.fn<void, [boolean]>(),
            ...overrides,
        } satisfies Parameters<typeof createTestsFromCsv>[0];
    }

    beforeEach(() => {
        jest.clearAllMocks();
        csvResource = jest.mocked(new CsvResource());
        jest.spyOn(csvResource, 'readBulkCsv');
    });

    it('empty CSV -> warn', async () => {
        csvResource.readBulkCsv.mockResolvedValue([]);
        const result = await createTestsFromCsv(makeCsvArgs({ csvPath: '/empty.csv' }));
        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste'));
    });

    it('CSV read error -> printError', async () => {
        csvResource.readBulkCsv.mockRejectedValue(new Error('file not found'));
        const result = await createTestsFromCsv(makeCsvArgs({ csvPath: '/bad.csv' }));
        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler CSV', expect.any(Error));
    });
});

describe('updateCrossReferences', () => {
    it('delegates to linker', async () => {
        const linker: IssueLinker = {
            jiraResource: createMockJiraResource(),
            linkManager: createMockLinkManager(),
            associatePrecondition: jest.fn<
                Promise<{ action?: string } | null>,
                [tc: TestCase, key: string, opts?: { info: (msg: string) => void }]
            >(),
            linkIssues: jest.fn<Promise<{ action?: string } | null>, [key: string, tc: TestCase]>(),
            updateCrossReferences: jest
                .fn<Promise<void>, [tests: TestCase[], keys: string[]]>()
                .mockResolvedValue(undefined),
        };
        const tests: TestCase[] = [{ title: 'T1', steps: [], group: 'g1' }];
        await updateCrossReferences(linker, tests, ['T-1']);
        expect(linker.updateCrossReferences).toHaveBeenCalledWith(tests, ['T-1']);
    });
});

describe('createTestsFromCsv', () => {
    let csvResource: jest.MockedObjectDeep<CsvResource>;

    function makeJiraResCSV(): jest.MockedObjectDeep<JiraResource> {
        const r = jest.mocked(new JiraResource('fake-token', 'http://jira/rest/api/2'));
        jest.spyOn(r, 'getJiraResource');
        jest.spyOn(r, 'postJiraResource');
        return r;
    }

    function makeFullArgs(overrides: Partial<Parameters<typeof createTestsFromCsv>[0]> = {}) {
        const base: Parameters<typeof createTestsFromCsv>[0] = {
            jiraResource: makeJiraResCSV(),
            jiraResourceXray: makeJiraResCSV(),
            linkManager: new JiraLinkManager(createMockJiraResource()),
            linkManagerXray: new JiraLinkManager(createMockJiraResource()),
            csvResource,
            project_name: 'TESTPROJ' as const,
            base_url: 'http://jira' as const,
            sessionLog: createMockLogger(),
            onBusy: jest.fn<void, [boolean]>(),
            csvPath: '/test.csv' as const,
        };
        return { ...base, ...overrides };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        csvResource = jest.mocked(new CsvResource());
        jest.spyOn(csvResource, 'readBulkCsv');
    });

    it('success path with valid CSV -> creates tests', async () => {
        jest.mocked(PROMPT.smartPrompt).mockResolvedValue('/test.csv');
        jest.mocked(PROMPT.prompt).mockReturnValue('');
        process.env.AUTO_CONFIRM = 'true';
        process.env.DRY_RUN = 'true';
        csvResource.readBulkCsv.mockResolvedValue([{ title: 'TC1', steps: [{ fields: { Action: 'Click' } }] }]);
        const result = await createTestsFromCsv(makeFullArgs());
        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });
});
