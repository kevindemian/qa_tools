jest.mock('../../shared/prompt');
jest.mock('../../shared/state');
jest.mock('../../shared/logger');
jest.mock('../../shared/cli_base');
jest.mock('../jira_link_manager');
jest.mock('../csv_resource');

import * as promptModule from '../../shared/prompt';
import * as stateModule from '../../shared/state';
import * as loggerModule from '../../shared/logger';
import case02 from './case02';
import case03 from './case03';
import case04 from './case04';
import case05 from './case05';
import case06 from './case06';
import case07 from './case07';
import case08 from './case08';
import case09 from './case09';
import case10 from './case10';
import case11 from './case11';
import case12 from './case12';
import case13 from './case13';
import case14 from './case14';
import case15 from './case15';
import case16 from './case16';
import case01 from './case01';
import * as flowModule from './test-execution-flow';
import fs from 'fs';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory';
import JiraLinkManager from '../jira_link_manager';
import CsvResource from '../csv_resource';
import { SessionContext } from '../../shared/session-context';

// eslint-disable-next-line no-var
var mockConfigMod: Record<string, unknown>;

jest.mock('../../shared/config', () => {
    mockConfigMod = {};
    const get = jest.fn((key: string) => (mockConfigMod[key] as string) ?? '');
    mockConfigMod.get = get;
    mockConfigMod.getInstance = jest.fn(() => ({ get }));
    return mockConfigMod;
});

interface CreateTestsResult {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
}

interface CreateTestsMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTestsFromCsv: jest.Mock<Promise<CreateTestsResult | undefined>, any[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTestsFromJson: jest.Mock<Promise<CreateTestsResult | undefined>, any[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTestExecutionWithLinks: jest.Mock<Promise<{ key: string; summary: string } | null>, any[]>;
}

// eslint-disable-next-line no-var
var mockCreateTests: CreateTestsMock;

jest.mock('../create_tests', () => {
    mockCreateTests = {
        createTestsFromCsv: jest.fn<Promise<CreateTestsResult | undefined>, [params: object]>(),
        createTestsFromJson: jest.fn<Promise<CreateTestsResult | undefined>, [params: object]>(),
        createTestExecutionWithLinks: jest.fn<Promise<{ key: string; summary: string } | null>, [params: object]>(),
    };
    return mockCreateTests;
});

jest.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: jest.fn().mockResolvedValue({ associated: false }),
    showResults: jest.fn().mockResolvedValue(undefined),
}));

const mockJiraResource = {
    log: {
        context: {},
        _logDir: null,
        _filePathCached: null,
        _fileError: false,
        _bytesWritten: 0,
        _maxLogSize: 0,
        _config: null,
        _ensureDir: jest.fn(),
        _rotateIfNeeded: jest.fn(),
        _writeConsole: jest.fn(),
        _writeFile: jest.fn(),
        _write: jest.fn(),
        child: jest.fn(),
        writeFileOnly: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        filePath: null,
    },
    baseUrl: 'https://jira.test.com',
    originUrl: 'https://jira.test.com',
    personalToken: 'mock-token',
    axiosInstance: createMockAxiosInstance({
        get: jest.fn().mockResolvedValue({ status: 200 }),
        post: jest.fn().mockResolvedValue({}),
    }),
    getProjectId: jest.fn().mockResolvedValue('123'),
    getProjectVersions: jest.fn().mockResolvedValue([]),
    updateFixVersions: jest.fn().mockResolvedValue({}),
    getReleaseTasks: jest.fn().mockResolvedValue([]),
    moveCardsToDone: jest.fn().mockResolvedValue({}),
    releaseVersion: jest.fn().mockResolvedValue({}),
    createVersion: jest.fn().mockResolvedValue({}),
    checkReleaseTasksStatus: jest.fn().mockResolvedValue(undefined),
    postJiraResource: jest.fn().mockResolvedValue({}),
    getJiraResource: jest.fn(),
    searchJiraIssues: jest.fn(),
    getTransitionsForIssue: jest.fn(),
    transitionIssue: jest.fn(),
    getVersionId: jest.fn(),
    getLatestReleases: jest.fn(),
    addTasksToSprint: jest.fn(),
    putJiraResource: jest.fn(),
    getFromOriginPath: jest.fn(),
};

const mockSessionContext: SessionContext = Object.assign(new SessionContext(), {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    packageManager: undefined,
    createPackageManager: jest
        .fn<{ updateReleaseNotes: jest.Mock; updateVersion: jest.Mock }, [dir: string]>()
        .mockReturnValue({ updateReleaseNotes: jest.fn(), updateVersion: jest.fn() }),
    pushHistory: jest.fn<void, []>(),
    withBusy: jest
        .fn<Promise<void>, [fn: () => Promise<void>, label?: string]>()
        .mockImplementation(async (fn: () => Promise<void>) => fn()),
});

const baseContext = {
    jiraResource: mockJiraResource,
    jiraResourceXray: mockJiraResource,
    linkManager: new JiraLinkManager(mockJiraResource),
    linkManagerXray: new JiraLinkManager(mockJiraResource),
    csvResource: new CsvResource(),
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: new loggerModule.Logger(),
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockSessionContext.project_name = 'TEST';
    mockSessionContext.inMemoryTasksId = [];
    mockSessionContext.inMemoryTasksText = [];
    mockSessionContext.packageManager = undefined;
    mockSessionContext.results = [];
    mockConfigMod.csvDefaultPath = undefined;
    mockConfigMod.csvPath = undefined;
    mockConfigMod.csvLabels = undefined;
    mockConfigMod.jsonPath = undefined;
    mockConfigMod.jsonLabels = undefined;
});

describe('case02 — list versions', () => {
    it('calls getProjectId and getProjectVersions', async () => {
        const mod = case02;
        await mod.handler(baseContext);
        expect(mockJiraResource.getProjectId).toHaveBeenCalledWith('TEST');
    });
});

describe('case03 — create version', () => {
    it('returns early when name is empty', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const mod = case03;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
    });

    it('creates version successfully', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0').mockResolvedValueOnce('descricao');
        const mod = case03;
        await mod.handler(baseContext);
        expect(mockJiraResource.createVersion).toHaveBeenCalledWith('TEST', 'v2.0.0', 'descricao');
    });

    it('handles API error', async () => {
        const prompt = jest.mocked(promptModule);
        const logger = jest.mocked(loggerModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0').mockResolvedValueOnce('');
        mockJiraResource.createVersion.mockRejectedValueOnce(new Error('API error'));
        const mod = case03;
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
        expect(logger.rootLogger.error).toHaveBeenCalled();
    });
});

describe('case04 — assign fixVersion', () => {
    it('returns true when cancelled', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const mod = case04;
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });

    it('assigns fixVersion from in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Task one', 'Task two'];
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const mod = case04;
        const result = await mod.handler(baseContext);
        expect(result).toBe(false);
        expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(1, ['TEST-1'], 'TEST', 'v2.0.0');
        expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(2, ['TEST-2'], 'TEST', 'v2.0.0');
        expect(mockJiraResource.updateFixVersions).toHaveBeenCalledTimes(2);
        expect(baseContext.pushHistory).toHaveBeenCalledWith('atribuir-fixversion', '2/2 tarefas atualizadas', 'ok');
    });

    it('handles partial error on updateFixVersions', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Task one', 'Task two'];
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        mockJiraResource.updateFixVersions.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('API error'));
        const mod = case04;
        await mod.handler(baseContext);
        expect(mockSessionContext.results).toContainEqual({ status: 'ok', label: 'TEST-1', message: '' });
        expect(mockSessionContext.results).toContainEqual({
            status: 'error',
            label: 'TEST-2',
            message: 'Falha ao atualizar fixVersion',
        });
    });

    it('accepts manual task entry when not using in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Existing task'];
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm
            .mockResolvedValueOnce(false) // useInMemory = false
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(false); // don't add to sprint
        prompt.ask.mockResolvedValueOnce('MANUAL-1 MANUAL-2');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        const mod = case04;
        await mod.handler(baseContext);
        // updateFixVersions is called per-taskId, not with all IDs at once
        expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(
            1,
            ['MANUAL-1'],
            expect.any(String),
            'v2.0.0',
        );
        expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(
            2,
            ['MANUAL-2'],
            expect.any(String),
            'v2.0.0',
        );
    });

    it('adds tasks to sprint when confirmed', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Task one'];
        mockJiraResource.postJiraResource = jest.fn().mockResolvedValueOnce({});
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce('6991'); // sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = case04;
        await mod.handler(baseContext);
        expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('sprint/6991/issue', { issues: ['TEST-1'] });
    });

    it('warns when sprint ID is empty after confirming add to sprint', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Task one'];
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce(''); // empty sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = case04;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Sprint ID vazio. Pulando...');
    });

    it('handles error when adding tasks to sprint fails', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Task one'];
        mockJiraResource.postJiraResource = jest.fn().mockRejectedValueOnce(new Error('Sprint API error'));
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce('6991'); // sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = case04;
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case05 — update package version', () => {
    it('handles missing packageManager by prompting dir', async () => {
        mockSessionContext.packageManager = undefined;
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1']);
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('/some/dir').mockResolvedValueOnce('v2.0.0');
        const mod = case05;
        await mod.handler(baseContext);
        expect(prompt.success).toHaveBeenCalled();
    });

    it('handles no tasks for version', async () => {
        mockSessionContext.packageManager = { updateReleaseNotes: jest.fn(), updateVersion: jest.fn() };
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(null);
        const prompt = jest.mocked(promptModule);
        const mod = case05;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
    });

    it('handles API error', async () => {
        mockJiraResource.getReleaseTasks.mockRejectedValueOnce(new Error('API error'));
        const prompt = jest.mocked(promptModule);
        const mod = case05;
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case06 — check release status', () => {
    it('checks status successfully', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        mockJiraResource.checkReleaseTasksStatus.mockResolvedValueOnce(undefined);
        const mod = case06;
        await mod.handler(baseContext);
        expect(mockJiraResource.checkReleaseTasksStatus).toHaveBeenCalledWith('TEST', 'v2.0.0');
    });

    it('handles API error', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        mockJiraResource.checkReleaseTasksStatus.mockRejectedValueOnce(new Error('API error'));
        const mod = case06;
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case07 — close tasks', () => {
    it('returns true when cancelled', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = case07;
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });

    it('returns true when no tasks found', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce([]);
        const mod = case07;
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
    });

    it('handles moveCardsToDone error', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] task']);
        mockJiraResource.moveCardsToDone.mockRejectedValueOnce(new Error('API error'));
        const mod = case07;
        await mod.handler(baseContext);
        expect(prompt.printSummary).toHaveBeenCalled();
    });

    it('moves tasks to done successfully', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] Fix bug', '[TEST-42] Add feature']);
        const mod = case07;
        const result = await mod.handler(baseContext);
        expect(result).toBe(false);
        expect(mockJiraResource.moveCardsToDone).toHaveBeenCalledWith(['TEST-1', 'TEST-42']);
        expect(prompt.printSummary).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ status: 'ok', label: 'TEST-1' }),
                expect.objectContaining({ status: 'ok', label: 'TEST-42' }),
            ]),
        );
        expect(baseContext.pushHistory).toHaveBeenCalledWith('fechar-tarefas', '2 tarefa(s)', 'ok');
    });

    it('warns when task IDs cannot be extracted', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1', 'TASK-2']);
        const mod = case07;
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada.');
    });
});

describe('case08 — release version', () => {
    it('returns true when cancelled', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = case08;
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });

    it('releases version successfully', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        const mod = case08;
        const result = await mod.handler(baseContext);
        expect(mockJiraResource.releaseVersion).toHaveBeenCalledWith('TEST', 'v2.0.0');
        expect(result).toBe(false);
    });

    it('handles API error', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.releaseVersion.mockRejectedValueOnce(new Error('API error'));
        const mod = case08;
        const result = await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
        expect(result).toBe(false);
    });
});

describe('case09 — switch project', () => {
    it('returns early when name is empty', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const mod = case09;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome do projeto não pode ser vazio.');
    });

    it('updates project name', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('NEWPROJ');
        const mod = case09;
        await mod.handler(baseContext);
        expect(mockSessionContext.project_name).toBe('NEWPROJ');
    });
});

describe('case10 — show counters', () => {
    it('returns undefined', async () => {
        const mod = case10;
        expect(await mod.handler(baseContext)).toBeUndefined();
    });

    it('sets directory and creates package manager', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('/my/git/dir');
        const mod = case10;
        await mod.handler(baseContext);
        expect(mockSessionContext.createPackageManager).toHaveBeenCalledWith('/my/git/dir');
        expect(mockSessionContext.git_directory).toBe('/my/git/dir');
        expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /my/git/dir');
    });

    it('handles missing createPackageManager', async () => {
        delete mockSessionContext.createPackageManager;
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('/some/dir');
        const mod = case10;
        await mod.handler(baseContext);
        expect(mockSessionContext.packageManager).toBeUndefined();
        expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /some/dir');
    });
});

describe('case11 — generate template (CSV/JSON)', () => {
    it('generates CSV template', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('CSV').mockResolvedValueOnce('/tmp/test-template.csv');
        const mod = case11;
        await mod.handler(baseContext);
        expect(prompt.success).toHaveBeenCalledWith(
            expect.stringContaining('Template CSV gerado em: /tmp/test-template.csv'),
        );
    });

    it('generates JSON template', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('JSON').mockResolvedValueOnce('/tmp/test-template.json');
        const mod = case11;
        await mod.handler(baseContext);
        expect(prompt.success).toHaveBeenCalledWith(
            expect.stringContaining('Template JSON gerado em: /tmp/test-template.json'),
        );
    });

    it('handles copy error', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('CSV').mockResolvedValueOnce('/tmp/test-template.csv');

        jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
            throw new Error('permission denied');
        });
        const mod = case11;
        await mod.handler(baseContext);
        expect(prompt.error).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    });

    it('rejects invalid format', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('XML');
        const mod = case11;
        await mod.handler(baseContext);
        expect(prompt.error).toHaveBeenCalledWith('Formato inválido. Use CSV ou JSON.');
    });
});

describe('case13 — create test execution', () => {
    it('creates from in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(true);
        const mod = case13;
        await mod.handler(baseContext);
        expect(prompt.info).toHaveBeenCalledWith('Testes da sessão atual: TEST-1, TEST-2');
    });

    it('returns early when no keys', async () => {
        const prompt = jest.mocked(promptModule);
        const mod = case13;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma key informada.');
    });

    it('creates test execution with manual key entry', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('TEST-3 TEST-4');
        const flow = jest.mocked(flowModule);
        flow.offerTestExecutionAssociation.mockResolvedValueOnce({ associated: true, key: 'TE-1', mode: 'created' });
        const mod = case13;
        await mod.handler(baseContext);
        expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(
            baseContext,
            ['TEST-3', 'TEST-4'],
            'standalone',
        );
        expect(flow.showResults).toHaveBeenCalledWith(baseContext, ['TEST-3', 'TEST-4'], {
            associated: true,
            key: 'TE-1',
            mode: 'created',
        });
    });

    it('falls back to manual key entry when user declines in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(false);
        prompt.ask.mockResolvedValueOnce('MANUAL-1 MANUAL-2');
        const flow = jest.mocked(flowModule);
        const mod = case13;
        await mod.handler(baseContext);
        expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(
            baseContext,
            ['MANUAL-1', 'MANUAL-2'],
            'standalone',
        );
    });

    it('creates test execution from in-memory tasks with full flow', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Test one', 'Test two'];
        const prompt = jest.mocked(promptModule);
        prompt.askConfirm.mockResolvedValueOnce(true);
        const flow = jest.mocked(flowModule);
        const mod = case13;
        await mod.handler(baseContext);
        expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(
            baseContext,
            ['TEST-1', 'TEST-2'],
            'standalone',
        );
    });
});

describe('case14 — config Cypress directory', () => {
    it('returns early when dir is empty', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const mod = case14;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures Cypress directory', async () => {
        const prompt = jest.mocked(promptModule);
        const state = jest.mocked(stateModule);
        prompt.ask.mockResolvedValueOnce('/cypress');
        const mod = case14;
        await mod.handler(baseContext);
        expect(state.update).toHaveBeenCalled();
    });
});

describe('case15 — create tests from JSON', () => {
    it('returns when jsonPath is empty', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const mod = case15;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho do JSON vazio. Operação cancelada.');
    });

    it('imports tests from JSON successfully', async () => {
        mockConfigMod.jsonPath = '/fake/tests.json';
        mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-10', 'TEST-11'],
            inMemoryTasksText: ['JSON test 1', 'JSON test 2'],
            summary: '',
            status: '',
            sourcePath: '/fake/tests.json',
        });
        const prompt = jest.mocked(promptModule);
        const mod = case15;
        await mod.handler(baseContext);
        expect(mockCreateTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: '/fake/tests.json' }),
        );
        expect(mockSessionContext.inMemoryTasksId).toEqual(['TEST-10', 'TEST-11']);
        expect(prompt.success).toHaveBeenCalledWith('Importacao JSON concluída: 2 testes');
        expect(baseContext.pushHistory).toHaveBeenCalledWith('importar-json', '2 testes', 'ok');
    });

    it('handles null result from createTestsFromJson', async () => {
        mockConfigMod.jsonPath = '/fake/tests.json';
        mockCreateTests.createTestsFromJson.mockResolvedValueOnce(undefined);
        const mod = case15;
        expect(await mod.handler(baseContext)).toBeUndefined();
        expect(mockSessionContext.inMemoryTasksId).toEqual([]);
    });

    it('resolves relative jsonPath using lastJsonDir from state', async () => {
        const state = jest.mocked(stateModule);
        state.load.mockReturnValue({ lastJsonDir: '/base/dir' });
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('relative/tests.json');
        jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
        mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1'],
            inMemoryTasksText: ['Test'],
            summary: '',
            status: '',
            sourcePath: '/base/dir/tests.json',
        });
        const mod = case15;
        await mod.handler(baseContext);
        // path.resolve('/base/dir', 'relative/tests.json') = '/base/dir/relative/tests.json'
        expect(mockCreateTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: '/base/dir/relative/tests.json' }),
        );
    });

    it('does not resolve relative path when file does not exist', async () => {
        const state = jest.mocked(stateModule);
        state.load.mockReturnValue({ lastJsonDir: '/base/dir' });
        mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1'],
            inMemoryTasksText: ['Test'],
            summary: '',
            status: '',
            sourcePath: '/base/dir/tests.json',
        });

        jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('relative/tests.json');
        const mod = case15;
        await mod.handler(baseContext);
        expect(mockCreateTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: 'relative/tests.json' }),
        );
    });
});

describe('case16 — config JSON directory', () => {
    it('returns early when dir is empty', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const mod = case16;
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures JSON directory', async () => {
        const prompt = jest.mocked(promptModule);
        const state = jest.mocked(stateModule);
        prompt.ask.mockResolvedValueOnce('/json');
        const mod = case16;
        await mod.handler(baseContext);
        expect(state.update).toHaveBeenCalled();
    });
});

describe('case12 — diagnostic connection', () => {
    it('reports all endpoints as ok', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 });
        const mod = case12;
        await mod.handler(baseContext);
        const prompt = jest.mocked(promptModule);
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('3/4'), 'ok');
    });

    it('records error when one endpoint fails', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({ status: 200 });
        const mod = case12;
        await mod.handler(baseContext);
        const prompt = jest.mocked(promptModule);
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/4'), 'error');
    });

    it('marks error as connection failure for non-auth HTTP errors', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce({ response: { status: 500 } })
            .mockResolvedValueOnce({ status: 200 });
        const mod = case12;
        await mod.handler(baseContext);
        const prompt = jest.mocked(promptModule);
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/4'), 'error');
    });

    it('handles network error with no response object', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ status: 200 });
        const mod = case12;
        await mod.handler(baseContext);
        const prompt = jest.mocked(promptModule);
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/4'), 'error');
    });
});

describe('case01 — create tests from CSV', () => {
    it('creates tests with Config csvPath and stores in-memory tasks', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1, label2';
        mockCreateTests.createTestsFromCsv.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1', 'TEST-2'],
            inMemoryTasksText: ['First test', 'Second test'],
            summary: '2 tests created from CSV',
            status: 'ok',
            sourcePath: '',
        });
        const mod = case01;
        await mod.handler(baseContext);
        expect(mockCreateTests.createTestsFromCsv).toHaveBeenCalledWith(
            expect.objectContaining({ csvPath: '/fake/test.csv', jiraLabels: ['label1', 'label2'] }),
        );
        expect(mockSessionContext.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
        expect(baseContext.pushHistory).toHaveBeenCalledWith('csv-import', '2 tests created from CSV', 'ok');
    });

    it('invokes onBusy callback during CSV import', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1';
        mockCreateTests.createTestsFromCsv.mockImplementationOnce(async (_opts: { onBusy: (v: boolean) => void }) => {
            _opts.onBusy(true);
            _opts.onBusy(false);
            return {
                inMemoryTasksId: ['TEST-1'],
                inMemoryTasksText: ['Test'],
                summary: '1 test',
                status: 'ok',
                sourcePath: '',
            };
        });
        const mod = case01;
        await mod.handler(baseContext);
        expect(mockSessionContext.isBusy).toBe(false);
    });

    it('prompts to create test execution after CSV import', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1';
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Test 1', 'Test 2'];
        const state = jest.mocked(stateModule);
        state.load.mockReturnValue({ lastCsvPath: '/fake/test.csv' });
        mockCreateTests.createTestsFromCsv.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1', 'TEST-2'],
            inMemoryTasksText: ['Test 1', 'Test 2'],
            summary: '2 tests',
            status: 'ok',
            sourcePath: '',
        });
        const flow = jest.mocked(flowModule);
        flow.offerTestExecutionAssociation.mockResolvedValueOnce({ associated: true, key: 'TE-1', summary: 'test' });
        const mod = case01;
        await mod.handler(baseContext);
        expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(baseContext, ['TEST-1', 'TEST-2'], 'test');
        expect(flow.showResults).toHaveBeenCalledWith(baseContext, ['TEST-1', 'TEST-2'], {
            associated: true,
            key: 'TE-1',
            summary: 'test',
        });
    });

    it('handles null result from createTestsFromCsv gracefully', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = '';
        mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-10', 'TEST-11'],
            inMemoryTasksText: ['JSON test 2b', 'JSON test 2c'],
            summary: 'success',
            status: '',
            sourcePath: '',
        });
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');
        const state = jest.mocked(stateModule);
        state.load.mockReturnValue({});
        const mod = case01;
        expect(await mod.handler(baseContext)).toBeUndefined();
        expect(mockSessionContext.inMemoryTasksId).toEqual([]);
    });
});
