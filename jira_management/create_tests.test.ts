import os from 'os';
import path from 'path';
// 1. Define mock factory values FIRST (before jest.mock)
const mockPrompt = vi.hoisted(() => ({
    success: vi.fn<(...args: [string]) => void>(),
    error: vi.fn<(...args: [string]) => void>(),
    warn: vi.fn<(...args: [string]) => void>(),
    info: vi.fn<(...args: [string]) => void>(),
    title: vi.fn<(...args: [string]) => void>(),
    divider: vi.fn<(...args: []) => void>(),
    prompt: vi.fn<(...args: [string]) => string>().mockReturnValue(''),
    confirm: vi.fn<(...args: [string]) => boolean>(),
    ask: vi.fn<(...args: [string]) => Promise<string>>().mockResolvedValue(''),
    askConfirm: vi.fn<(...args: [string]) => Promise<boolean>>().mockResolvedValue(true),
    smartPrompt: vi.fn<(...args: [string]) => Promise<string>>(),
    printError: vi.fn<(...args: [label: string, error: Error]) => void>(),
    printSummary: vi.fn<(...args: [results: object[], header?: string]) => void>(),
    onError: vi.fn<(...args: [context: string, error: Error]) => 'retry' | 'abort' | 'continue'>(),
    ProgressBar: vi.fn<(...args: [total: number]) => object>(),
    Spinner: vi.fn<(...args: [opts: object]) => object>(),
    isQuiet: vi.fn<(...args: []) => boolean>().mockReturnValue(true),
    withSpinner: vi
        .fn<(...args: [label: string, fn: () => Promise<void>]) => Promise<void>>()
        .mockImplementation(async (_label: string, fn: () => Promise<void>) => fn()),
    print: vi.fn<(...args: [string]) => void>(),
    askFilePath: vi.fn<(...args: [string]) => Promise<string>>().mockResolvedValue('/fake/path.json'),
}));

// 2. jest.mock BEFORE any require that uses those modules
vi.mock('../shared/prompt', () => mockPrompt);

const mockFsMod = vi.hoisted(() => ({
    readFileSync:
        vi.fn<
            (...args: Parameters<typeof import('fs').readFileSync>) => ReturnType<typeof import('fs').readFileSync>
        >(),
    existsSync:
        vi.fn<(...args: Parameters<typeof import('fs').existsSync>) => ReturnType<typeof import('fs').existsSync>>(),
}));
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, ...mockFsMod };
});

vi.mock('../shared/state', () => ({
    load: vi.fn<(...args: []) => object>().mockReturnValue({}),
    update: vi.fn<(...args: [(state: object) => void]) => object>(),
}));

vi.mock('../shared/temp-dir', () => ({
    reportsDir: vi.fn<(...args: []) => string>(),
    writeEphemeral: vi.fn<(...args: [string, string, string]) => string>(),
    tempDirPath: vi.fn<(...args: []) => string>().mockReturnValue(path.join(os.tmpdir(), 'qa-tools-temp')),
}));

vi.mock('axios', () => {
    const mockInstance = {
        interceptors: {
            request: {
                use: vi.fn<
                    (
                        ...args: [
                            onFulfilled: (value: object) => object | Promise<object>,
                            onRejected: (error: object) => object,
                        ]
                    ) => void
                >(),
            },
            response: {
                use: vi.fn<
                    (
                        ...args: [onFulfilled: (response: object) => object, onRejected: (error: object) => object]
                    ) => void
                >(),
            },
        },
        get: vi.fn<(...args: [url: string]) => Promise<object>>(),
        post: vi.fn<(...args: [url: string, data?: object]) => Promise<object>>(),
        put: vi.fn<(...args: [url: string, data?: object]) => Promise<object>>(),
    };
    return {
        default: { create: vi.fn<(...args: [config?: object]) => typeof mockInstance>().mockReturnValue(mockInstance) },
    };
});

// 3. THEN import the source modules (they'll get the mocked dependencies)
import JiraResource from './jira_resource.js';
import type { Mock, Mocked } from 'vitest';
import JiraLinkManager from './jira_link_manager.js';
import TestExecutionCreator from './test-execution-creator.js';
import type { TestCase } from '../shared/types.js';
import CsvResource from './csv_resource.js';
import IssueLinker from './issue-linker.js';
import createTestsModule from './create_tests.js';
import * as tempDirModule from '../shared/temp-dir.js';
const {
    createTestsFromCsv,
    createTestExecution,
    createTestExecutionWithLinks,
    generateMappingFiles,
    validateCsvTests,
    createTestsFromJson,
    updateCrossReferences,
} = createTestsModule;
import * as PROMPT from '../shared/prompt.js';
import fs from 'fs';

import { createMockLogger, nonNull } from '../shared/test-utils.js';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';
import { createMockLinkManager } from '../shared/test-utils/factories/link-manager-factory.js';

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

describe('CreateTestExecution', () => {
    let jiraResource: Mocked<JiraResource>;
    let testExecutionCreator: TestExecutionCreator;
    let getJiraResourceSpy: Mock;
    let postJiraResourceSpy: Mock;

    beforeEach(() => {
        jiraResource = vi.mocked(new JiraResource('fake-token', 'https://jira/rest/api/2'));
        getJiraResourceSpy = vi.spyOn(jiraResource, 'getJiraResource');
        postJiraResourceSpy = vi.spyOn(jiraResource, 'postJiraResource');
        const linkManager = new JiraLinkManager(jiraResource);
        testExecutionCreator = new TestExecutionCreator(jiraResource, linkManager);
    });

    it('creates a Test Execution with given keys', async () => {
        expect.hasAssertions();

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
        expect(getJiraResourceSpy).toHaveBeenCalledWith('issuetype');
        expect(getJiraResourceSpy).toHaveBeenCalledWith('field');
        expect(postJiraResourceSpy).toHaveBeenCalledTimes(1);
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
        expect.hasAssertions();

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
        expect(postJiraResourceSpy).toHaveBeenCalledTimes(1);
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.project', { key: PROJECT });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.issuetype', { id: '11802' });
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty('fields.customfield_13715', ['TEST-3']);
        expect(jiraResource.postJiraResource.mock.lastCall?.[1]).toHaveProperty(
            'fields.summary',
            expect.stringMatching(/^Automated Execution - /),
        );
    });

    it('returns null when issuetype not found', async () => {
        expect.hasAssertions();

        jiraResource.getJiraResource.mockResolvedValue([
            { id: '11200', name: 'Epic' },
            { id: '11800', name: 'Test' },
        ]);

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('returns null when custom field not found', async () => {
        expect.hasAssertions();

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
        expect.hasAssertions();

        jiraResource.getJiraResource.mockRejectedValue(new Error('API error'));

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).rejects.toThrow(/./i);
    });

    it('returns null when field API returns non-array', async () => {
        expect.hasAssertions();

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
        expect.hasAssertions();

        jiraResource.getJiraResource.mockResolvedValue(null);

        await expect(
            createTestExecution({ testExecutionCreator, projectName: PROJECT, testKeys: ['TEST-1'], csvName: '' }),
        ).resolves.toBeNull();
    });

    it('accepts titleOverride as 5th param', async () => {
        expect.hasAssertions();

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

describe('CreateTestExecutionWithLinks', () => {
    let jiraResource: Mocked<JiraResource>;
    let linkJiraRes: Mocked<JiraResource>;
    let testExecutionCreator: TestExecutionCreator;
    let linkPostJiraResourceSpy: Mock;

    beforeEach(() => {
        jiraResource = vi.mocked(new JiraResource('fake-token', 'https://jira/rest/api/2'));
        vi.spyOn(jiraResource, 'getJiraResource');
        vi.spyOn(jiraResource, 'postJiraResource');

        linkJiraRes = vi.mocked(new JiraResource('fake-token', 'https://jira/rest/api/2'));
        vi.spyOn(linkJiraRes, 'getJiraResource');
        linkPostJiraResourceSpy = vi.spyOn(linkJiraRes, 'postJiraResource');
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
        expect.hasAssertions();

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
        expect(linkPostJiraResourceSpy).toHaveBeenCalledWith('issueLink', {
            type: { id: '10201' },
            inwardIssue: { key: 'EXEC-1' },
            outwardIssue: { key: 'TEST-1' },
        });
    });

    it('skips already linked test keys', async () => {
        expect.hasAssertions();

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
        expect.hasAssertions();

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

describe('GenerateMappingFiles', async () => {
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const tmpDir = path.join(os.tmpdir(), 'qa-tools-test-mapping-' + Date.now());
    const csvPath = path.join(os.tmpdir(), 'qa-test-csv.csv');
    let testIdx = 0;
    const nextBase = () => path.join(os.tmpdir(), 'qa-test-csv-' + ++testIdx);

    beforeAll(() => {
        realFs.writeFileSync(csvPath, 'Title: X\nAction,Data,Expected\nx,y,z\n', 'utf8');
        vi.mocked(tempDirModule).reportsDir.mockReturnValue(tmpDir);
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
        const testCases: TestCase[] = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1', 'a2') },
            { title: 'TC2', steps: [] },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);

        const jsonPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json';
        const mdPath = tmpDir + '/test-csv-' + testIdx + '-jira-mapping.md';

        expect(realFs.existsSync(jsonPath)).toBeTruthy();
        expect(realFs.existsSync(mdPath)).toBeTruthy();

        const content = realFs.readFileSync(jsonPath, 'utf8');

        expect(content).toContain('"project": "PROJ"');
        expect(content).toContain('"title": "TC1"');
        expect(content).toContain('"key": "TEST-1"');
        expect(content).toContain('"description": "Descricao do TC1"');
        expect(content).toContain('"title": "TC2"');
        expect(content).toContain('"Action": "a1"');
    });

    it('includes second action in mapping', () => {
        const base = nextBase();
        const testCases: TestCase[] = [{ title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1', 'a2') }];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1'], testCases);

        const content = realFs.readFileSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json', 'utf8');

        expect(content).toContain('"Action": "a2"');
    });

    it('generates mapping files regardless of CYPRESS_PROJECT_PATH', () => {
        delete process.env['CYPRESS_PROJECT_PATH'];
        const base = nextBase();
        const testCases: TestCase[] = [{ title: 'TC', steps: [] }];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1'], testCases);

        expect(realFs.existsSync(tmpDir + '/test-csv-' + testIdx + '-jira-mapping.json')).toBeTruthy();

        process.env['CYPRESS_PROJECT_PATH'] = tmpDir;
    });

    it('returns early when tasksId is empty', () => {
        const capture = vi.fn<(...args: [...string[]]) => void>();
        vi.spyOn(console, 'log').mockImplementation(capture);
        generateMappingFiles(nextBase() + '.csv', 'PROJ', [], []);

        expect(capture).not.toHaveBeenCalled();

        vi.clearAllMocks();
        vi.restoreAllMocks();
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
        const testCases: TestCase[] = [
            { title: 'TC1', description: 'Descricao do TC1', steps: makeSteps('a1') },
            { title: 'TC2', steps: [] },
        ];
        generateMappingFiles(base + '.csv', 'PROJ', ['TEST-1', 'TEST-2'], testCases);
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

describe('ValidateCsvTests', () => {
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

function makeJiraResource(): Mocked<JiraResource> {
    const r = vi.mocked(new JiraResource('fake-token', 'https://jira/rest/api/2'));
    vi.spyOn(r, 'getJiraResource');
    vi.spyOn(r, 'postJiraResource');
    return r;
}

function makeJiraResCSV(): Mocked<JiraResource> {
    return makeJiraResource();
}

describe('CreateTestsFromJson', () => {
    const FS = vi.mocked({ ...fs, ...mockFsMod } as typeof fs);

    function makeLinkManager(): JiraLinkManager & { postLink: Mock } {
        const fakeJira = createMockJiraResource();
        const lm = new JiraLinkManager(fakeJira) as JiraLinkManager & { postLink: Mock };
        lm.postLink =
            vi.fn<
                (
                    ...args: [resource: JiraResource, payload: Record<string, object>]
                ) => Promise<{ action?: string } | null>
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
            base_url: 'https://jira',
            sessionLog: createMockLogger(),
            onBusy: vi.fn<(...args: [boolean]) => void>(),
        } satisfies Parameters<typeof createTestsFromJson>[0];
    }

    afterEach(() => {
        delete process.env['JSON_PATH'];
        delete process.env['AUTO_CONFIRM'];
        delete process.env['DRY_RUN'];
        delete process.env['JSON_LABELS'];
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('cancela com caminho vazio', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'askFilePath').mockResolvedValueOnce('');
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('vazio'));
    });

    it('cancela com JSON invalido', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('not json');
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledTimes(2);
    });

    it('cancela com array vazio', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue('[]');
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledTimes(2);
    });

    it('cancela com item sem title/steps', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(JSON.stringify([{}]));
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledTimes(2);
    });

    it('executa dry-run com JSON valido', async () => {
        expect.hasAssertions();

        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'true';
        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
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

    it('parseia precondition como reference (formato ABC-123)', async () => {
        expect.hasAssertions();

        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'true';
        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }], precondition: 'PREC-001' }]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });

    it('parseia linkedIssues como strings', async () => {
        expect.hasAssertions();

        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'true';
        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
        FS.readFileSync.mockReturnValue(
            JSON.stringify([{ title: 'TC1', steps: [{ Action: 'Click' }], linkedIssues: ['BUG-1', 'BUG-2'] }]),
        );
        const result = await createTestsFromJson(BASE_PARAMS());

        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });

    it('parseia linkedIssues como objetos', async () => {
        expect.hasAssertions();

        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'true';
        vi.spyOn(PROMPT, 'ask').mockResolvedValue('/fake/path.json');
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

describe('ReadCsvTests (via createTestsFromCsv)', () => {
    let csvResource: Mocked<CsvResource>;

    function makeLinkMgrForCsv(): JiraLinkManager {
        const fakeJira = createMockJiraResource();
        return new JiraLinkManager(fakeJira);
    }

    function makeCsvArgs(overrides: Record<string, unknown> = {}) {
        const sessionLog = createMockLogger();
        return {
            jiraResource: makeJiraResCSV(),
            jiraResourceXray: makeJiraResCSV(),
            linkManager: makeLinkMgrForCsv(),
            linkManagerXray: makeLinkMgrForCsv(),
            csvResource,
            project_name: 'TESTPROJ',
            base_url: 'https://jira',
            sessionLog,
            onBusy: vi.fn<(...args: [boolean]) => void>(),
            ...overrides,
        } satisfies Parameters<typeof createTestsFromCsv>[0];
    }

    beforeEach(() => {
        vi.clearAllMocks();
        csvResource = vi.mocked(new CsvResource());
        vi.spyOn(csvResource, 'readBulkCsv');
    });

    it('empty CSV -> warn', async () => {
        expect.hasAssertions();

        csvResource.readBulkCsv.mockResolvedValue([]);
        const result = await createTestsFromCsv(makeCsvArgs({ csvPath: '/empty.csv' }));

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste'));
    });

    it('cSV read error -> printError', async () => {
        expect.hasAssertions();

        csvResource.readBulkCsv.mockRejectedValue(new Error('file not found'));
        const result = await createTestsFromCsv(makeCsvArgs({ csvPath: '/bad.csv' }));

        expect(result).toBeUndefined();
        expect(PROMPT.printError).toHaveBeenCalledWith('Erro ao ler CSV', expect.any(Error));
    });
});

describe('UpdateCrossReferences', () => {
    it('delegates to linker', async () => {
        expect.hasAssertions();

        const updateCrossRefSpy = vi
            .fn<(...args: [tests: TestCase[], keys: string[]]) => Promise<void>>()
            .mockResolvedValue(undefined);
        const linker: IssueLinker = {
            jiraResource: createMockJiraResource(),
            linkManager: createMockLinkManager(),
            associatePrecondition:
                vi.fn<
                    (
                        ...args: [tc: TestCase, key: string, opts?: { info: (msg: string) => void }]
                    ) => Promise<{ action?: string } | null>
                >(),
            linkIssues: vi.fn<(...args: [key: string, tc: TestCase]) => Promise<{ action?: string } | null>>(),
            updateCrossReferences: updateCrossRefSpy,
        };
        const tests: TestCase[] = [{ title: 'T1', steps: [], group: 'g1' }];
        await updateCrossReferences(linker, tests, ['T-1']);

        expect(updateCrossRefSpy).toHaveBeenCalledWith(tests, ['T-1']);
    });
});

describe('CreateTestsFromCsv', () => {
    let csvResource: Mocked<CsvResource>;

    function makeFullArgs(overrides: Partial<Parameters<typeof createTestsFromCsv>[0]> = {}) {
        const base: Parameters<typeof createTestsFromCsv>[0] = {
            jiraResource: makeJiraResCSV(),
            jiraResourceXray: makeJiraResCSV(),
            linkManager: new JiraLinkManager(createMockJiraResource()),
            linkManagerXray: new JiraLinkManager(createMockJiraResource()),
            csvResource,
            project_name: 'TESTPROJ' as const,
            base_url: 'https://jira' as const,
            sessionLog: createMockLogger(),
            onBusy: vi.fn<(...args: [boolean]) => void>(),
            csvPath: '/test.csv' as const,
        };
        return { ...base, ...overrides };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        csvResource = vi.mocked(new CsvResource());
        vi.spyOn(csvResource, 'readBulkCsv');
    });

    it('success path with valid CSV -> creates tests', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'smartPrompt').mockResolvedValue('/test.csv');
        vi.spyOn(PROMPT, 'prompt').mockReturnValue('');
        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'true';
        csvResource.readBulkCsv.mockResolvedValue([{ title: 'TC1', steps: [{ fields: { Action: 'Click' } }] }]);
        const result = await createTestsFromCsv(makeFullArgs());

        expect(result).toBeDefined();
        expect(nonNull(result).summary).toContain('1');
    });
});
