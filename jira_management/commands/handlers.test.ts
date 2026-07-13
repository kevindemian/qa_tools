import os from 'os';
import path from 'path';
vi.mock('../../shared/prompt');
vi.mock('../../shared/state');
vi.mock('../../shared/logger');
vi.mock('../../shared/cli_base');
vi.mock('../jira_link_manager');
vi.mock('../csv_resource');

import type { Mock } from 'vitest';
import { mockedSafe } from '../../shared/test-utils/mock-types.js';
import * as promptModule from '../../shared/prompt.js';
import * as stateModule from '../../shared/state.js';

import * as loggerModule from '../../shared/logger.js';
import case02 from './case02.js';
import case03 from './case03.js';
import case04 from './case04.js';
import case05 from './case05.js';
import case06 from './case06.js';
import case07 from './case07.js';
import case08 from './case08.js';
import case09 from './case09.js';
import case10 from './case10.js';
import case11 from './case11.js';
import case12 from './case12.js';
import case13 from './case13.js';
import case14 from './case14.js';
import case15 from './case15.js';
import case16 from './case16.js';
import case01 from './case01.js';
import * as flowModule from './test-execution-flow.js';
import fs from 'fs';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import JiraLinkManager from '../jira_link_manager.js';
import CsvResource from '../csv_resource.js';
import { SessionContext } from '../../shared/session-context.js';
import { setDataHub } from '../../shared/data-hub/global-hub.js';
import { makeDataHubMock } from '../../shared/test-utils/factories/data-hub-mock.js';

const mockConfigMod: { [key: string]: unknown } = vi.hoisted(() => {
    return {};
});

vi.mock('../../shared/config', () => {
    const get = vi.fn((key: string) => Reflect.get(mockConfigMod, key) as string);
    mockConfigMod['get'] = get;
    mockConfigMod['getInstance'] = vi.fn(() => ({ get }));
    return { default: mockConfigMod };
});

interface CreateTestsResult {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
}

const mockCreateTests = vi.hoisted(() => {
    return {
        createTestsFromCsv: vi.fn<(opts: { onBusy: (v: boolean) => void }) => Promise<CreateTestsResult | undefined>>(),
        createTestsFromJson: vi.fn<(params: object) => Promise<CreateTestsResult | undefined>>(),
        createTestExecutionWithLinks: vi.fn<(params: object) => Promise<{ key: string; summary: string } | null>>(),
    };
});

vi.mock('../create_tests', () => {
    return { default: mockCreateTests };
});

vi.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
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
        _ensureDir: vi.fn(),
        _initFileBytes: vi.fn(),
        _rotateIfNeeded: vi.fn(),
        _writeConsole: vi.fn(),
        _writeFile: vi.fn(),
        _write: vi.fn(),
        child: vi.fn(),
        writeFileOnly: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        filePath: null,
    },
    baseUrl: 'https://jira.test.com',
    originUrl: 'https://jira.test.com',
    personalToken: 'mock-token',
    jiraMode: 'server' as const,
    axiosInstance: createMockAxiosInstance({
        get: vi.fn().mockResolvedValue({ status: 200 }),
        post: vi.fn().mockResolvedValue({}),
    }),
    getProjectId: vi.fn().mockResolvedValue('123'),
    getProjectVersions: vi.fn().mockResolvedValue([]),
    updateFixVersions: vi.fn().mockResolvedValue({}),
    getReleaseTasks: vi.fn().mockResolvedValue([]),
    moveCardsToDone: vi.fn().mockResolvedValue({}),
    releaseVersion: vi.fn().mockResolvedValue({}),
    createVersion: vi.fn().mockResolvedValue({}),
    checkReleaseTasksStatus: vi.fn().mockResolvedValue(undefined),
    postJiraResource: vi.fn().mockResolvedValue({}),
    getJiraResource: vi.fn(),
    searchJiraIssues: vi.fn(),
    getTransitionsForIssue: vi.fn(),
    transitionIssue: vi.fn(),
    getVersionId: vi.fn(),
    getLatestReleases: vi.fn(),
    addTasksToSprint: vi.fn(),
    putJiraResource: vi.fn(),
    getFromOriginPath: vi.fn(),
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
    createPackageManager: vi
        .fn<(...args: [dir: string]) => { updateReleaseNotes: Mock; updateVersion: Mock }>()
        .mockReturnValue({ updateReleaseNotes: vi.fn(), updateVersion: vi.fn() }),
    pushHistory: vi.fn<(...args: []) => void>(),
    withBusy: vi
        .fn<(...args: [fn: () => Promise<void>, label?: string]) => Promise<void>>()
        .mockImplementation(async (fn: () => Promise<void>) => fn()),
});

const baseContext = {
    jiraResource: mockJiraResource,
    jiraResourceXray: mockJiraResource,
    linkManager: new JiraLinkManager(mockJiraResource),
    linkManagerXray: new JiraLinkManager(mockJiraResource),
    csvResource: new CsvResource(),
    ctx: mockSessionContext,
    pushHistory: vi.fn(),
    printSessionSummary: vi.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: new loggerModule.Logger(),
    dataHub: { computed: { metricsRuns: [] } as never, raw: {} as never, saveMetricsStore: vi.fn() } as never,
};

describe('Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        // Phase 0.8: handlers resolve a DataHub via resolveSessionContext(); provide one.
        setDataHub(makeDataHubMock());
        mockSessionContext.project_name = 'TEST';
        mockSessionContext.inMemoryTasksId = [];
        mockSessionContext.inMemoryTasksText = [];
        mockSessionContext.packageManager = undefined;
        mockSessionContext.results = [];
        mockConfigMod['csvDefaultPath'] = undefined;
        mockConfigMod['csvPath'] = undefined;
        mockConfigMod['csvLabels'] = undefined;
        mockConfigMod['jsonPath'] = undefined;
        mockConfigMod['jsonLabels'] = undefined;
    });

    describe('Case02 — list versions', () => {
        it('calls getProjectId and getProjectVersions', async () => {
            expect.hasAssertions();

            const mod = case02;
            await mod.handler(baseContext);

            expect(mockJiraResource.getProjectId).toHaveBeenCalledWith('TEST');
        });
    });

    describe('Case03 — create version', () => {
        beforeEach(() => {
            const prompt = vi.mocked(promptModule);
            (prompt as { askMultiline: ReturnType<typeof vi.fn> }).askMultiline = vi.fn();
        });

        it('returns early when name is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const mod = case03;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
        });

        it('creates version successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askMultiline.mockResolvedValueOnce('descricao');
            const mod = case03;
            await mod.handler(baseContext);

            expect(mockJiraResource.createVersion).toHaveBeenCalledWith('TEST', 'v2.0.0', 'descricao');
        });

        it('handles API error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const logger = mockedSafe(vi.mocked(loggerModule));
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askMultiline.mockResolvedValueOnce('');
            mockJiraResource.createVersion.mockRejectedValueOnce(new Error('API error'));
            const mod = case03;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledTimes(1);
            expect(logger.rootLogger.error).toHaveBeenCalledTimes(1);
        });
    });

    describe('Case04 — assign fixVersion', () => {
        it('returns true when cancelled', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
            const mod = case04;
            const result = await mod.handler(baseContext);

            expect(result).toBeTruthy();
        });

        it('assigns fixVersion from in-memory tasks', async () => {
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            mockSessionContext.inMemoryTasksText = ['Task one', 'Task two'];
            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
            const mod = case04;
            const result = await mod.handler(baseContext);

            expect(result).toBeFalsy();
            expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(1, ['TEST-1'], 'TEST', 'v2.0.0');
            expect(mockJiraResource.updateFixVersions).toHaveBeenNthCalledWith(2, ['TEST-2'], 'TEST', 'v2.0.0');
            expect(mockJiraResource.updateFixVersions).toHaveBeenCalledTimes(2);
            expect(baseContext.pushHistory).toHaveBeenCalledWith(
                'atribuir-fixversion',
                '2/2 tarefas atualizadas',
                'ok',
            );
        });

        it('handles partial error on updateFixVersions', async () => {
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            mockSessionContext.inMemoryTasksText = ['Task one', 'Task two'];
            const prompt = vi.mocked(promptModule);
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
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1'];
            mockSessionContext.inMemoryTasksText = ['Existing task'];
            const prompt = vi.mocked(promptModule);
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
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1'];
            mockSessionContext.inMemoryTasksText = ['Task one'];
            mockJiraResource.postJiraResource = vi.fn().mockResolvedValueOnce({});
            const prompt = vi.mocked(promptModule);
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
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1'];
            mockSessionContext.inMemoryTasksText = ['Task one'];
            const prompt = vi.mocked(promptModule);
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
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1'];
            mockSessionContext.inMemoryTasksText = ['Task one'];
            mockJiraResource.postJiraResource = vi.fn().mockRejectedValueOnce(new Error('Sprint API error'));
            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
            prompt.ask.mockResolvedValueOnce('6991'); // sprint ID
            prompt.askConfirm
                .mockResolvedValueOnce(true) // useInMemory = true
                .mockResolvedValueOnce(true) // confirm fixVersion
                .mockResolvedValueOnce(true); // add to sprint
            const mod = case04;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledTimes(1);
        });
    });

    describe('Case05 — update package version', () => {
        it('handles missing packageManager by prompting dir', async () => {
            expect.hasAssertions();

            mockSessionContext.packageManager = undefined;
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1']);
            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('/some/dir').mockResolvedValueOnce('v2.0.0');
            const mod = case05;
            await mod.handler(baseContext);

            expect(prompt.success).toHaveBeenCalledTimes(1);
        });

        it('handles no tasks for version', async () => {
            expect.hasAssertions();

            mockSessionContext.packageManager = { updateReleaseNotes: vi.fn(), updateVersion: vi.fn() };
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(null);
            const prompt = vi.mocked(promptModule);
            const mod = case05;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
        });

        it('handles API error', async () => {
            expect.hasAssertions();

            mockJiraResource.getReleaseTasks.mockRejectedValueOnce(new Error('API error'));
            const prompt = vi.mocked(promptModule);
            const mod = case05;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledTimes(1);
        });
    });

    describe('Case06 — check release status', () => {
        it('checks status successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            mockJiraResource.checkReleaseTasksStatus.mockResolvedValueOnce(undefined);
            const mod = case06;
            await mod.handler(baseContext);

            expect(mockJiraResource.checkReleaseTasksStatus).toHaveBeenCalledWith('TEST', 'v2.0.0');
        });

        it('handles API error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            mockJiraResource.checkReleaseTasksStatus.mockRejectedValueOnce(new Error('API error'));
            const mod = case06;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledTimes(1);
        });
    });

    describe('Case07 — close tasks', () => {
        it('returns true when cancelled', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(false);
            const mod = case07;
            const result = await mod.handler(baseContext);

            expect(result).toBeTruthy();
        });

        it('returns true when no tasks found', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce([]);
            const mod = case07;
            const result = await mod.handler(baseContext);

            expect(result).toBeTruthy();
            expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
        });

        it('handles moveCardsToDone error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] task']);
            mockJiraResource.moveCardsToDone.mockRejectedValueOnce(new Error('API error'));
            const mod = case07;
            await mod.handler(baseContext);

            expect(prompt.printSummary).toHaveBeenCalledTimes(1);
        });

        it('moves tasks to done successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] Fix bug', '[TEST-42] Add feature']);
            const mod = case07;
            const result = await mod.handler(baseContext);

            expect(result).toBeFalsy();
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
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1', 'TASK-2']);
            const mod = case07;
            const result = await mod.handler(baseContext);

            expect(result).toBeTruthy();
            expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada.');
        });
    });

    describe('Case08 — release version', () => {
        it('returns true when cancelled', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            prompt.askConfirm.mockResolvedValueOnce(false);
            const mod = case08;
            const result = await mod.handler(baseContext);

            expect(result).toBeTruthy();
            expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
        });

        it('releases version successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askConfirm.mockResolvedValueOnce(true);
            const mod = case08;
            const result = await mod.handler(baseContext);

            expect(mockJiraResource.releaseVersion).toHaveBeenCalledWith('TEST', 'v2.0.0');
            expect(result).toBeFalsy();
        });

        it('handles API error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('v2.0.0');
            prompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.releaseVersion.mockRejectedValueOnce(new Error('API error'));
            const mod = case08;
            const result = await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledTimes(1);
            expect(result).toBeFalsy();
        });
    });

    describe('Case09 — switch project', () => {
        it('returns early when name is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const mod = case09;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Nome do projeto não pode ser vazio.');
        });

        it('updates project name', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('NEWPROJ');
            const mod = case09;
            await mod.handler(baseContext);

            expect(mockSessionContext.project_name).toBe('NEWPROJ');
        });
    });

    describe('Case10 — show counters', () => {
        it('returns undefined', async () => {
            expect.hasAssertions();

            const mod = case10;

            await expect(mod.handler(baseContext)).resolves.toBeUndefined();
        });

        it('sets directory and creates package manager', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('/my/git/dir');
            const mod = case10;
            await mod.handler(baseContext);

            expect(mockSessionContext.createPackageManager).toHaveBeenCalledWith('/my/git/dir');
            expect(mockSessionContext.git_directory).toBe('/my/git/dir');
            expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /my/git/dir');
        });

        it('handles missing createPackageManager', async () => {
            expect.hasAssertions();

            delete mockSessionContext.createPackageManager;
            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('/some/dir');
            const mod = case10;
            await mod.handler(baseContext);

            expect(mockSessionContext.packageManager).toBeUndefined();
            expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /some/dir');
        });
    });

    describe('Case11 — generate template (CSV/JSON)', () => {
        it('generates CSV template', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask
                .mockResolvedValueOnce('CSV')
                .mockResolvedValueOnce(path.join(os.tmpdir(), 'qa-test-template.csv'));
            const mod = case11;
            await mod.handler(baseContext);

            expect(prompt.success).toHaveBeenCalledWith(
                expect.stringContaining('Template CSV gerado em: ' + path.join(os.tmpdir(), 'qa-test-template.csv')),
            );
        });

        it('generates JSON template', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask
                .mockResolvedValueOnce('JSON')
                .mockResolvedValueOnce(path.join(os.tmpdir(), 'qa-test-template.json'));
            const mod = case11;
            await mod.handler(baseContext);

            expect(prompt.success).toHaveBeenCalledWith(
                expect.stringContaining('Template JSON gerado em: ' + path.join(os.tmpdir(), 'qa-test-template.json')),
            );
        });

        it('handles copy error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask
                .mockResolvedValueOnce('CSV')
                .mockResolvedValueOnce(path.join(os.tmpdir(), 'qa-test-template.csv'));

            vi.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
                throw new Error('permission denied');
            });
            const mod = case11;
            await mod.handler(baseContext);

            expect(prompt.error).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
        });

        it('rejects invalid format', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('XML');
            const mod = case11;
            await mod.handler(baseContext);

            expect(prompt.error).toHaveBeenCalledWith('Formato inválido. Use CSV ou JSON.');
        });
    });

    describe('Case13 — create test execution', () => {
        it('creates from in-memory tasks', async () => {
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(true);
            const mod = case13;
            await mod.handler(baseContext);

            expect(prompt.info).toHaveBeenCalledWith('Testes da sessão atual: TEST-1, TEST-2');
        });

        it('returns early when no keys', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const mod = case13;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Nenhuma key informada.');
        });

        it('creates test execution with manual key entry', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('TEST-3 TEST-4');
            const flow = vi.mocked(flowModule);
            flow.offerTestExecutionAssociation.mockResolvedValueOnce({
                associated: true,
                key: 'TE-1',
                mode: 'created',
            });
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
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(false);
            prompt.ask.mockResolvedValueOnce('MANUAL-1 MANUAL-2');
            const flow = vi.mocked(flowModule);
            const mod = case13;
            await mod.handler(baseContext);

            expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(
                baseContext,
                ['MANUAL-1', 'MANUAL-2'],
                'standalone',
            );
        });

        it('creates test execution from in-memory tasks with full flow', async () => {
            expect.hasAssertions();

            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            mockSessionContext.inMemoryTasksText = ['Test one', 'Test two'];
            const prompt = vi.mocked(promptModule);
            prompt.askConfirm.mockResolvedValueOnce(true);
            const flow = vi.mocked(flowModule);
            const mod = case13;
            await mod.handler(baseContext);

            expect(flow.offerTestExecutionAssociation).toHaveBeenCalledWith(
                baseContext,
                ['TEST-1', 'TEST-2'],
                'standalone',
            );
        });
    });

    describe('Case14 — config Cypress directory', () => {
        it('returns early when dir is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const mod = case14;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
        });

        it('configures Cypress directory', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const state = vi.mocked(stateModule);
            prompt.ask.mockResolvedValueOnce('/cypress');
            const mod = case14;
            await mod.handler(baseContext);

            expect(state.update).toHaveBeenCalledTimes(1);
        });
    });

    describe('Case15 — create tests from JSON', () => {
        it('returns when jsonPath is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const mod = case15;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Caminho do JSON vazio. Operação cancelada.');
        });

        it('imports tests from JSON successfully', async () => {
            expect.hasAssertions();

            mockConfigMod['jsonPath'] = '/fake/tests.json';
            mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
                inMemoryTasksId: ['TEST-10', 'TEST-11'],
                inMemoryTasksText: ['JSON test 1', 'JSON test 2'],
                summary: '',
                status: '',
                sourcePath: '/fake/tests.json',
            });
            const prompt = vi.mocked(promptModule);
            const mod = case15;
            await mod.handler(baseContext);

            expect(mockCreateTests.createTestsFromJson).toHaveBeenCalledWith(
                expect.objectContaining({ jsonPath: '/fake/tests.json' }),
            );
            expect(mockSessionContext.inMemoryTasksId).toStrictEqual(['TEST-10', 'TEST-11']);
            expect(prompt.success).toHaveBeenCalledWith('Importacao JSON concluída: 2 testes');
            expect(baseContext.pushHistory).toHaveBeenCalledWith('importar-json', '2 testes', 'ok');
        });

        it('handles null result from createTestsFromJson', async () => {
            expect.hasAssertions();

            mockConfigMod['jsonPath'] = '/fake/tests.json';
            mockCreateTests.createTestsFromJson.mockResolvedValueOnce(undefined);
            const mod = case15;

            await expect(mod.handler(baseContext)).resolves.toBeUndefined();
            expect(mockSessionContext.inMemoryTasksId).toStrictEqual([]);
        });
    });

    describe('Case16 — config JSON directory', () => {
        it('returns early when dir is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const mod = case16;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
        });

        it('configures JSON directory', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('/json');
            const mod = case16;
            await mod.handler(baseContext);

            expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('/json'));
        });
    });

    describe('Case12 — diagnostic connection', () => {
        it('reports all endpoints as ok', async () => {
            expect.hasAssertions();

            mockJiraResource.axiosInstance.get
                .mockResolvedValueOnce({ status: 200 })
                .mockResolvedValueOnce({ status: 200 })
                .mockResolvedValueOnce({ status: 200 });
            const mod = case12;
            await mod.handler(baseContext);
            const prompt = vi.mocked(promptModule);

            expect(prompt.printSummary).toHaveBeenCalledTimes(1);
            expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('3/4'), 'ok');
        });

        it('records error when one endpoint fails', async () => {
            expect.hasAssertions();

            mockJiraResource.axiosInstance.get
                .mockResolvedValueOnce({ status: 200 })
                .mockRejectedValueOnce({ response: { status: 401 } })
                .mockResolvedValueOnce({ status: 200 });
            const mod = case12;
            await mod.handler(baseContext);
            const prompt = vi.mocked(promptModule);

            expect(prompt.printSummary).toHaveBeenCalledTimes(1);
            expect(baseContext.pushHistory).toHaveBeenCalledWith(
                'diagnostico',
                expect.stringContaining('2/4'),
                'error',
            );
        });

        it('marks error as connection failure for non-auth HTTP errors', async () => {
            expect.hasAssertions();

            mockJiraResource.axiosInstance.get
                .mockResolvedValueOnce({ status: 200 })
                .mockRejectedValueOnce({ response: { status: 500 } })
                .mockResolvedValueOnce({ status: 200 });
            const mod = case12;
            await mod.handler(baseContext);
            const prompt = vi.mocked(promptModule);

            expect(prompt.printSummary).toHaveBeenCalledTimes(1);
            expect(baseContext.pushHistory).toHaveBeenCalledWith(
                'diagnostico',
                expect.stringContaining('2/4'),
                'error',
            );
        });

        it('handles network error with no response object', async () => {
            expect.hasAssertions();

            mockJiraResource.axiosInstance.get
                .mockResolvedValueOnce({ status: 200 })
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ status: 200 });
            const mod = case12;
            await mod.handler(baseContext);
            const prompt = vi.mocked(promptModule);

            expect(prompt.printSummary).toHaveBeenCalledTimes(1);
            expect(baseContext.pushHistory).toHaveBeenCalledWith(
                'diagnostico',
                expect.stringContaining('2/4'),
                'error',
            );
        });
    });

    describe('Case01 — create tests from CSV', () => {
        it('creates tests with Config csvPath and stores in-memory tasks', async () => {
            expect.hasAssertions();

            mockConfigMod['csvPath'] = '/fake/test.csv';
            mockConfigMod['csvLabels'] = 'label1, label2';
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
            expect(mockSessionContext.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
            expect(baseContext.pushHistory).toHaveBeenCalledWith('csv-import', '2 tests created from CSV', 'ok');
        });

        it('invokes onBusy callback during CSV import', async () => {
            expect.hasAssertions();

            mockConfigMod['csvPath'] = '/fake/test.csv';
            mockConfigMod['csvLabels'] = 'label1';
            mockCreateTests.createTestsFromCsv.mockImplementationOnce(
                async (_opts: { onBusy: (v: boolean) => void }) => {
                    await Promise.resolve();
                    _opts.onBusy(true);
                    _opts.onBusy(false);
                    return {
                        inMemoryTasksId: ['TEST-1'],
                        inMemoryTasksText: ['Test'],
                        summary: '1 test',
                        status: 'ok',
                        sourcePath: '',
                    };
                },
            );
            const mod = case01;
            await mod.handler(baseContext);

            expect(mockSessionContext.isBusy).toBeFalsy();
        });

        it('prompts to create test execution after CSV import', async () => {
            expect.hasAssertions();

            mockConfigMod['csvPath'] = '/fake/test.csv';
            mockConfigMod['csvLabels'] = 'label1';
            mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
            mockSessionContext.inMemoryTasksText = ['Test 1', 'Test 2'];
            const state = vi.mocked(stateModule);
            state.load.mockReturnValue({ lastCsvPath: '/fake/test.csv' });
            state.loadTypedState.mockReturnValue({ lastCsvPath: '/fake/test.csv' });
            mockCreateTests.createTestsFromCsv.mockResolvedValueOnce({
                inMemoryTasksId: ['TEST-1', 'TEST-2'],
                inMemoryTasksText: ['Test 1', 'Test 2'],
                summary: '2 tests',
                status: 'ok',
                sourcePath: '',
            });
            const flow = vi.mocked(flowModule);
            flow.offerTestExecutionAssociation.mockResolvedValueOnce({
                associated: true,
                key: 'TE-1',
                summary: 'test',
            });
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
            expect.hasAssertions();

            mockConfigMod['csvPath'] = '/fake/test.csv';
            mockConfigMod['csvLabels'] = '';
            mockCreateTests.createTestsFromJson.mockResolvedValueOnce({
                inMemoryTasksId: ['TEST-10', 'TEST-11'],
                inMemoryTasksText: ['JSON test 2b', 'JSON test 2c'],
                summary: 'success',
                status: '',
                sourcePath: '',
            });
            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');
            const state = vi.mocked(stateModule);
            state.load.mockReturnValue({});
            state.loadTypedState.mockReturnValue({});
            const mod = case01;

            await expect(mod.handler(baseContext)).resolves.toBeUndefined();
            expect(mockSessionContext.inMemoryTasksId).toStrictEqual([]);
        });
    });
});
