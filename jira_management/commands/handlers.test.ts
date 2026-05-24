jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: jest.fn().mockReturnValue(false),
    smartPrompt: jest.fn().mockReturnValue('v2.0.0'),
    printError: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    print: jest.fn(),
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

jest.mock('../../shared/config', () => ({
    Config: { getInstance: jest.fn().mockReturnValue({ get: jest.fn() }) },
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
    mockSessionContext.packageManager = undefined;
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
        prompt.prompt.mockReturnValueOnce('');
        const mod = require('./case03');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
    });

    it('creates version successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('v2.0.0').mockReturnValueOnce('descricao');
        const mod = require('./case03');
        await mod.handler(baseContext);
        expect(mockJiraResource.createVersion).toHaveBeenCalledWith('TEST', 'v2.0.0', 'descricao');
    });

    it('handles API error', async () => {
        const prompt = require('../../shared/prompt');
        const logger = require('../../shared/logger');
        prompt.prompt.mockReturnValueOnce('v2.0.0').mockReturnValueOnce('');
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
        prompt.confirm.mockReturnValueOnce(false);
        const mod = require('./case04');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });
});

describe('case05 — update package version', () => {
    it('handles missing packageManager by prompting dir', async () => {
        mockSessionContext.packageManager = undefined;
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['TASK-1']);
        const prompt = require('../../shared/prompt');
        prompt.smartPrompt.mockReturnValueOnce('/some/dir').mockReturnValueOnce('v2.0.0');
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
        mockJiraResource.checkReleaseTasksStatus.mockResolvedValueOnce(undefined);
        const mod = require('./case06');
        await mod.handler(baseContext);
        expect(mockJiraResource.checkReleaseTasksStatus).toHaveBeenCalledWith('TEST', 'v2.0.0');
    });

    it('handles API error', async () => {
        mockJiraResource.checkReleaseTasksStatus.mockRejectedValueOnce(new Error('API error'));
        const prompt = require('../../shared/prompt');
        const mod = require('./case06');
        await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
    });
});

describe('case07 — close tasks', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(false);
        const mod = require('./case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });

    it('returns true when no tasks found', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce([]);
        const mod = require('./case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
    });

    it('handles moveCardsToDone error', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(true);
        mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[TEST-1] task']);
        mockJiraResource.moveCardsToDone.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case07');
        await mod.handler(baseContext);
        expect(prompt.printSummary).toHaveBeenCalled();
    });
});

describe('case08 — release version', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(false);
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });

    it('releases version successfully', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(true);
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(mockJiraResource.releaseVersion).toHaveBeenCalledWith('TEST', 'v2.0.0');
        expect(result).toBe(false);
    });

    it('handles API error', async () => {
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(true);
        mockJiraResource.releaseVersion.mockRejectedValueOnce(new Error('API error'));
        const mod = require('./case08');
        const result = await mod.handler(baseContext);
        expect(prompt.printError).toHaveBeenCalled();
        expect(result).toBe(false);
    });
});

describe('case09 — switch project', () => {
    it('returns early when name is empty', () => {
        const prompt = require('../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('');
        const mod = require('./case09');
        mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Nome do projeto não pode ser vazio.');
    });

    it('updates project name', () => {
        const prompt = require('../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('NEWPROJ');
        const mod = require('./case09');
        mod.handler(baseContext);
        expect(mockSessionContext.project_name).toBe('NEWPROJ');
    });
});

describe('case10 — show counters', () => {
    it('calls handler without error', () => {
        const mod = require('./case10');
        expect(() => mod.handler(baseContext)).not.toThrow();
        expect(mod.handler(baseContext)).toBeUndefined();
    });
});

describe('case11 — generate CSV template', () => {
    it('generates template file', () => {
        const mod = require('./case11');
        expect(() => mod.handler(baseContext)).not.toThrow();
        expect(mod.handler(baseContext)).toBeUndefined();
    });

    it('handles copy error', () => {
        const fs = require('fs');
        jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
            throw new Error('permission denied');
        });
        const prompt = require('../../shared/prompt');
        const mod = require('./case11');
        mod.handler(baseContext);
        expect(prompt.error).toHaveBeenCalled();
    });
});

describe('case13 — create test execution', () => {
    it('creates from in-memory tasks', async () => {
        mockSessionContext.inMemoryTasksId = ['TEST-1', 'TEST-2'];
        const prompt = require('../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(true);
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
});

describe('case14 — config Cypress directory', () => {
    it('returns early when dir is empty', () => {
        const prompt = require('../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('');
        const mod = require('./case14');
        mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures Cypress directory', () => {
        const prompt = require('../../shared/prompt');
        const state = require('../../shared/state');
        prompt.prompt.mockReturnValueOnce('/cypress');
        const mod = require('./case14');
        mod.handler(baseContext);
        expect(state.update).toHaveBeenCalled();
    });
});

describe('case15 — create tests from JSON', () => {
    it('returns when jsonPath is empty', async () => {
        const prompt = require('../../shared/prompt');
        prompt.smartPrompt.mockReturnValueOnce('');
        const mod = require('./case15');
        await mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho do JSON vazio. Operação cancelada.');
    });
});

describe('case16 — config JSON directory', () => {
    it('returns early when dir is empty', () => {
        const prompt = require('../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('');
        const mod = require('./case16');
        mod.handler(baseContext);
        expect(prompt.warn).toHaveBeenCalledWith('Caminho vazio, ignorando.');
    });

    it('configures JSON directory', () => {
        const prompt = require('../../shared/prompt');
        const state = require('../../shared/state');
        prompt.prompt.mockReturnValueOnce('/json');
        const mod = require('./case16');
        mod.handler(baseContext);
        expect(state.update).toHaveBeenCalled();
    });
});
