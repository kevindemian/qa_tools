jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: jest.fn().mockReturnValue(false),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(true),
    smartPrompt: jest.fn().mockResolvedValue('v2.0.0'),
    printError: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    print: jest.fn(),
    badge: jest.fn().mockReturnValue(''),
    tableView: jest.fn(),
}));

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../shared/cli_base', () => ({
    sanitizeUrl: jest.fn((url) => url),
}));

const mockConfigMod: Record<string, unknown> = {
    getInstance: jest.fn().mockReturnValue({ get: jest.fn() }),
};
jest.mock('../../shared/config', () => mockConfigMod);

jest.mock('../create_tests', () => ({
    createTestsFromCsv: jest.fn(),
    createTestsFromJson: jest.fn(),
    createTestExecutionWithLinks: jest.fn(),
}));

jest.mock('./helpers', () => ({
    createTestExecutionWithLinksWrapper: jest.fn(),
}));

const mockJiraResource = {
    getProjectId: jest.fn().mockResolvedValue('123'),
    getProjectVersions: jest.fn().mockResolvedValue([]),
    updateFixVersions: jest.fn().mockResolvedValue({}),
    getReleaseTasks: jest.fn().mockResolvedValue([]),
    moveCardsToDone: jest.fn().mockResolvedValue({}),
    releaseVersion: jest.fn().mockResolvedValue({}),
    createVersion: jest.fn().mockResolvedValue({}),
    checkReleaseTasksStatus: jest.fn().mockResolvedValue(undefined),
    postJiraResource: jest.fn().mockResolvedValue({}),
    axiosInstance: { get: jest.fn().mockResolvedValue({ status: 200 }), post: jest.fn().mockResolvedValue({}) },
};

const mockSessionContext: Record<string, unknown> = {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    packageManager: undefined,
    createPackageManager: jest.fn().mockReturnValue({ updateReleaseNotes: jest.fn(), updateVersion: jest.fn() }),
    pushHistory: jest.fn(),
    withBusy: jest.fn(async (fn: () => Promise<void>) => fn()),
};

const baseContext = {
    jiraResource: mockJiraResource,
    jiraResourceXray: mockJiraResource,
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
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
        const mod = require('./case02');
        await mod.handler(baseContext);
        expect(mockJiraResource.getProjectId).toHaveBeenCalledWith('TEST');
    });
});

describe('case03 — create version', () => {
    it('returns early when name is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const mod = require('./case03');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
    });

    it('creates version successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0').mockResolvedValueOnce('descricao');
        const mod = require('./case03');
        await mod.handler(baseContext);
        expect(mockJiraResource.createVersion).toHaveBeenCalledWith('TEST', 'v2.0.0', 'descricao');
    });

    it('handles API error', async () => {
        const prompt = require('../../shared/prompt');
        const logger = require('../../shared/logger');
        prompt.ask.mockResolvedValueOnce('v2.0.0').mockResolvedValueOnce('');
        mockJiraResource.createVersion.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case03');
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
        expect(logger.rootLogger.error).toHaveBeenCalled();
    });
});

describe('case04 — assign fixVersion', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const mod = require('./case04');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });

    it('assigns fixVersion from in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Task one', 'Task two'];
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const mod = require('./case04');
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
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        mockJiraResource.updateFixVersions.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case04');
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
        const prompt = require('../../shared/prompt');
        prompt.askConfirm
            .mockResolvedValueOnce(false) // useInMemory = false
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(false); // don't add to sprint
        prompt.ask.mockResolvedValueOnce('MANUAL-1 MANUAL-2');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        const mod = require('./case04');
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
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce('6991'); // sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = require('./case04');
        await mod.handler(baseContext);
        expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('sprint/6991/issue', { issues: ['TEST-1'] });
    });

    it('warns when sprint ID is empty after confirming add to sprint', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Task one'];
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce(''); // empty sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = require('./case04');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Sprint ID vazio. Pulando...');
    });

    it('handles error when adding tasks to sprint fails', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1'];
        mockSessionContext.inMemoryTasksText = ['Task one'];
        mockJiraResource.postJiraResource = jest.fn().mockRejectedValueOnce(new Error('Sprint API error'));
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0'); // version name
        prompt.ask.mockResolvedValueOnce('6991'); // sprint ID
        prompt.askConfirm
            .mockResolvedValueOnce(true) // useInMemory = true
            .mockResolvedValueOnce(true) // confirm fixVersion
            .mockResolvedValueOnce(true); // add to sprint
        const mod = require('./case04');
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case05 — update package version', () => {
    it('handles missing packageManager by prompting dir', async () => {
        mockSessionContext.packageManager = undefined;
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1']);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('/some/dir').mockResolvedValueOnce('v2.0.0');
        const mod = require('./case05');
        await mod.handler(baseContext);
        expect(prompt.success).toHaveBeenCalled();
    });

    it('handles no tasks for version', async () => {
        mockSessionContext.packageManager = { updateReleaseNotes: jest.fn(), updateVersion: jest.fn() };
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(null);
        const prompt = require('../../shared/prompt');
        const mod = require('./case05');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
    });

    it('handles API error', async () => {
        mockJiraResource.getReleaseTasks.mockRejectedValueOnce(new Error('API error'));
        const prompt = require('../../shared/prompt');
        const mod = require('./case05');
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case06 — check release status', () => {
    it('checks status successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        mockJiraResource.checkReleaseTasksStatus.mockResolvedValueOnce(undefined);
        const mod = require('./case06');
        await mod.handler(baseContext);
        expect(mockJiraResource.checkReleaseTasksStatus).toHaveBeenCalledWith('TEST', 'v2.0.0');
    });

    it('handles API error', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        mockJiraResource.checkReleaseTasksStatus.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case06');
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case07 — close tasks', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });

    it('returns true when no tasks found', async () => {
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce([]);
        const mod = require('./case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
    });

    it('handles moveCardsToDone error', async () => {
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] task']);
        mockJiraResource.moveCardsToDone.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case07');
        await mod.handler(baseContext);
        expect(prompt.printSummary).toHaveBeenCalled();
    });

    it('moves tasks to done successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] Fix bug', '[TEST-42] Add feature']);
        const mod = require('./case07');
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
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1', 'TASK-2']);
        const mod = require('./case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada.');
    });
});

describe('case08 — release version', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });

    it('releases version successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(mockJiraResource.releaseVersion).toHaveBeenCalledWith('TEST', 'v2.0.0');
        expect(result).toBe(false);
    });

    it('handles API error', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('v2.0.0');
        prompt.askConfirm.mockResolvedValueOnce(true);
        mockJiraResource.releaseVersion.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
        expect(result).toBe(false);
    });
});

describe('case09 — switch project', () => {
    it('returns early when name is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const mod = require('./case09');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome do projeto não pode ser vazio.');
    });

    it('updates project name', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('NEWPROJ');
        const mod = require('./case09');
        await mod.handler(baseContext);
        expect(mockSessionContext.project_name).toBe('NEWPROJ');
    });
});

describe('case10 — show counters', () => {
    it('returns undefined', async () => {
        const mod = require('./case10');
        expect(await mod.handler(baseContext)).toBeUndefined();
    });

    it('sets directory and creates package manager', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('/my/git/dir');
        const mod = require('./case10');
        await mod.handler(baseContext);
        expect(mockSessionContext.createPackageManager).toHaveBeenCalledWith('/my/git/dir');
        expect(mockSessionContext.git_directory).toBe('/my/git/dir');
        expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /my/git/dir');
    });

    it('handles missing createPackageManager', async () => {
        mockSessionContext.createPackageManager = undefined;
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('/some/dir');
        const mod = require('./case10');
        await mod.handler(baseContext);
        expect(mockSessionContext.packageManager).toBeUndefined();
        expect(prompt.success).toHaveBeenCalledWith('Diretório alterado para: /some/dir');
    });
});

describe('case11 — generate CSV template', () => {
    it('generates template file', async () => {
        const mod = require('./case11');
        expect(await mod.handler(baseContext)).toBeUndefined();
    });

    it('handles copy error', async () => {
        const fs = require('fs');
        jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
            throw new Error('permission denied');
        });
        const prompt = require('../../shared/prompt');
        const mod = require('./case11');
        await mod.handler(baseContext);
        expect(prompt.error).toHaveBeenCalled();
    });

    it('uses default path when ask returns empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const fs = require('fs');
        jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(jest.fn());
        const mod = require('./case11');
        await mod.handler(baseContext);
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Template CSV gerado em:'));
    });
});

describe('case13 — create test execution', () => {
    it('creates from in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true);
        const mod = require('./case13');
        await mod.handler(baseContext);
        expect(prompt.info).toHaveBeenCalledWith('Testes da sessão atual: TEST-1, TEST-2');
    });

    it('returns early when no keys', async () => {
        const prompt = require('../../shared/prompt');
        const mod = require('./case13');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma key informada.');
    });

    it('creates test execution with manual key entry', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('TEST-3 TEST-4');
        prompt.ask.mockResolvedValueOnce('my-execution');
        prompt.ask.mockResolvedValueOnce('Exec Title');
        prompt.ask.mockResolvedValueOnce('Exec desc');
        const helpers = require('./helpers');
        helpers.createTestExecutionWithLinksWrapper.mockResolvedValueOnce(undefined);
        const mod = require('./case13');
        await mod.handler(baseContext);
        expect(helpers.createTestExecutionWithLinksWrapper).toHaveBeenCalledWith(
            baseContext,
            ['TEST-3', 'TEST-4'],
            'my-execution',
            'Exec Title',
            'Exec desc',
        );
    });

    it('falls back to manual key entry when user declines in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(false);
        prompt.ask.mockResolvedValueOnce('MANUAL-1 MANUAL-2');
        prompt.ask.mockResolvedValueOnce('manual-exec');
        prompt.ask.mockResolvedValueOnce('Manual Title');
        prompt.ask.mockResolvedValueOnce('');
        const helpers = require('./helpers');
        helpers.createTestExecutionWithLinksWrapper.mockResolvedValueOnce(undefined);
        const mod = require('./case13');
        await mod.handler(baseContext);
        expect(helpers.createTestExecutionWithLinksWrapper).toHaveBeenCalledWith(
            baseContext,
            ['MANUAL-1', 'MANUAL-2'],
            'manual-exec',
            'Manual Title',
            '',
        );
    });

    it('creates test execution from in-memory tasks with full flow', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Test one', 'Test two'];
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true);
        prompt.ask.mockResolvedValueOnce('');
        prompt.ask.mockResolvedValueOnce('Auto Exec');
        prompt.ask.mockResolvedValueOnce('');
        const helpers = require('./helpers');
        helpers.createTestExecutionWithLinksWrapper.mockResolvedValueOnce(undefined);
        const mod = require('./case13');
        await mod.handler(baseContext);
        expect(helpers.createTestExecutionWithLinksWrapper).toHaveBeenCalledWith(
            baseContext,
            ['TEST-1', 'TEST-2'],
            '',
            'Auto Exec',
            '',
        );
    });
});

describe('case14 — config Cypress directory', () => {
    it('returns early when dir is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const mod = require('./case14');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures Cypress directory', async () => {
        const prompt = require('../../shared/prompt');
        const state = require('../../shared/state');
        prompt.ask.mockResolvedValueOnce('/cypress');
        const mod = require('./case14');
        await mod.handler(baseContext);
        expect(state.update).toHaveBeenCalled();
    });
});

describe('case15 — create tests from JSON', () => {
    it('returns when jsonPath is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const mod = require('./case15');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho do JSON vazio. Operação cancelada.');
    });

    it('imports tests from JSON successfully', async () => {
        mockConfigMod.jsonPath = '/fake/tests.json';
        const createTests = require('../create_tests');
        createTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-10', 'TEST-11'],
            inMemoryTasksText: ['JSON test 1', 'JSON test 2'],
            sourcePath: '/fake/tests.json',
        });
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case15');
        await mod.handler(baseContext);
        expect(createTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: '/fake/tests.json' }),
        );
        expect(mockSessionContext.inMemoryTasksId).toEqual(['TEST-10', 'TEST-11']);
        expect(prompt.success).toHaveBeenCalledWith('Importacao JSON concluída: 2 testes');
        expect(baseContext.pushHistory).toHaveBeenCalledWith('importar-json', '2 testes', 'ok');
    });

    it('handles null result from createTestsFromJson', async () => {
        mockConfigMod.jsonPath = '/fake/tests.json';
        const createTests = require('../create_tests');
        createTests.createTestsFromJson.mockResolvedValueOnce(null);
        const prompt = require('../../shared/prompt');
        const mod = require('./case15');
        expect(await mod.handler(baseContext)).toBeUndefined();
        expect(mockSessionContext.inMemoryTasksId).toEqual([]);
    });

    it('resolves relative jsonPath using lastJsonDir from state', async () => {
        const state = require('../../shared/state');
        state.load.mockReturnValue({ lastJsonDir: '/base/dir' });
        const createTests = require('../create_tests');
        createTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1'],
            inMemoryTasksText: ['Test'],
            sourcePath: '/base/dir/tests.json',
        });
        const fs = require('fs');
        jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('relative/tests.json');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case15');
        await mod.handler(baseContext);
        // path.resolve('/base/dir', 'relative/tests.json') = '/base/dir/relative/tests.json'
        expect(createTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: '/base/dir/relative/tests.json' }),
        );
    });

    it('does not resolve relative path when file does not exist', async () => {
        const state = require('../../shared/state');
        state.load.mockReturnValue({ lastJsonDir: '/base/dir' });
        const createTests = require('../create_tests');
        createTests.createTestsFromJson.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1'],
            inMemoryTasksText: ['Test'],
            sourcePath: '/base/dir/tests.json',
        });
        const fs = require('fs');
        jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('relative/tests.json');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case15');
        await mod.handler(baseContext);
        expect(createTests.createTestsFromJson).toHaveBeenCalledWith(
            expect.objectContaining({ jsonPath: 'relative/tests.json' }),
        );
    });
});

describe('case16 — config JSON directory', () => {
    it('returns early when dir is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const mod = require('./case16');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures JSON directory', async () => {
        const prompt = require('../../shared/prompt');
        const state = require('../../shared/state');
        prompt.ask.mockResolvedValueOnce('/json');
        const mod = require('./case16');
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
        const mod = require('./case12');
        await mod.handler(baseContext);
        const prompt = require('../../shared/prompt');
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('3/3'), 'ok');
    });

    it('records error when one endpoint fails', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({ status: 200 });
        const mod = require('./case12');
        await mod.handler(baseContext);
        const prompt = require('../../shared/prompt');
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/3'), 'error');
    });

    it('marks error as connection failure for non-auth HTTP errors', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce({ response: { status: 500 } })
            .mockResolvedValueOnce({ status: 200 });
        const mod = require('./case12');
        await mod.handler(baseContext);
        const prompt = require('../../shared/prompt');
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/3'), 'error');
    });

    it('handles network error with no response object', async () => {
        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ status: 200 });
        const mod = require('./case12');
        await mod.handler(baseContext);
        const prompt = require('../../shared/prompt');
        expect(prompt.printSummary).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/3'), 'error');
    });
});

describe('case01 — create tests from CSV', () => {
    it('creates tests with Config csvPath and stores in-memory tasks', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1, label2';
        const createTests = require('../create_tests');
        createTests.createTestsFromCsv.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1', 'TEST-2'],
            inMemoryTasksText: ['First test', 'Second test'],
            summary: '2 tests created from CSV',
            status: 'ok',
        });
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case01');
        await mod.handler(baseContext);
        expect(createTests.createTestsFromCsv).toHaveBeenCalledWith(
            expect.objectContaining({ csvPath: '/fake/test.csv', jiraLabels: ['label1', 'label2'] }),
        );
        expect(mockSessionContext.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
        expect(baseContext.pushHistory).toHaveBeenCalledWith('csv-import', '2 tests created from CSV', 'ok');
    });

    it('invokes onBusy callback during CSV import', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1';
        const createTests = require('../create_tests');
        createTests.createTestsFromCsv.mockImplementationOnce(async (_opts: { onBusy: (v: boolean) => void }) => {
            _opts.onBusy(true);
            _opts.onBusy(false);
            return {
                inMemoryTasksId: ['TEST-1'],
                inMemoryTasksText: ['Test'],
                summary: '1 test',
                status: 'ok',
            };
        });
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(false);
        const mod = require('./case01');
        await mod.handler(baseContext);
        expect(mockSessionContext.isBusy).toBe(false);
    });

    it('prompts to create test execution after CSV import when confirmed', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = 'label1';
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        mockSessionContext.inMemoryTasksText = ['Test 1', 'Test 2'];
        const state = require('../../shared/state');
        state.load.mockReturnValue({ lastCsvPath: '/fake/test.csv' });
        const createTests = require('../create_tests');
        createTests.createTestsFromCsv.mockResolvedValueOnce({
            inMemoryTasksId: ['TEST-1', 'TEST-2'],
            inMemoryTasksText: ['Test 1', 'Test 2'],
            summary: '2 tests',
            status: 'ok',
        });
        const prompt = require('../../shared/prompt');
        prompt.askConfirm.mockResolvedValueOnce(true);
        prompt.ask.mockResolvedValueOnce('Exec Title');
        prompt.ask.mockResolvedValueOnce('Exec Description');
        const helpers = require('./helpers');
        helpers.createTestExecutionWithLinksWrapper.mockResolvedValueOnce(undefined);
        const mod = require('./case01');
        await mod.handler(baseContext);
        expect(helpers.createTestExecutionWithLinksWrapper).toHaveBeenCalledWith(
            baseContext,
            ['TEST-1', 'TEST-2'],
            'test',
            'Exec Title',
            'Exec Description',
        );
    });

    it('handles null result from createTestsFromCsv gracefully', async () => {
        mockConfigMod.csvPath = '/fake/test.csv';
        mockConfigMod.csvLabels = '';
        const createTests = require('../create_tests');
        createTests.createTestsFromCsv.mockResolvedValueOnce(null);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');
        const state = require('../../shared/state');
        state.load.mockReturnValue({});
        const mod = require('./case01');
        expect(await mod.handler(baseContext)).toBeUndefined();
        expect(mockSessionContext.inMemoryTasksId).toEqual([]);
    });
});
