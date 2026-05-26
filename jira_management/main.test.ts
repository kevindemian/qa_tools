// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../shared/prompt', () => {
    class CancelError extends Error {
        constructor(msg?: string) {
            super(msg);
            this.name = 'CancelError';
        }
    }
    return {
        print: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        helpLine: jest.fn(),
        title: jest.fn(),
        divider: jest.fn(),
        prompt: jest.fn().mockReturnValue('0'),
        printError: jest.fn(),
        showSelect: jest.fn().mockReturnValue('0'),
        tableView: jest.fn(),
        CancelError,
    };
});

jest.mock('../shared/config', () => ({
    jiraBaseUrl: '',
    jiraPersonalToken: '',
    xrayBaseUrl: '',
    jiraProject: '',
    debug: false,
    autoChoice: '',
    autoConfirm: false,
    quiet: false,
    cypressProjectPath: '',
    dryRun: false,
    get: jest.fn().mockReturnValue(''),
}));

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
    getStatePath: jest.fn().mockReturnValue('/tmp/state.json'),
}));

import { createMockRootLogger } from '../shared/test-utils';

const mockRootLogger = {
    ...createMockRootLogger(),
    child: jest.fn().mockReturnThis(),
};

jest.mock('../shared/logger', () => ({
    rootLogger: mockRootLogger,
    Logger: jest.fn(),
}));

jest.mock('../shared/cli_base', () => ({
    mask: jest.fn((v: string) => (v ? v.slice(0, 4) + '****' : '')),
    createValidateEnv: jest.fn().mockReturnValue(jest.fn()),
    setupSigint: jest.fn(),
    printSessionSummary: jest.fn(),
    sanitizeUrl: jest.fn((url: string) => url),
}));

jest.mock('../shared/session-context', () => ({
    SessionContext: jest.fn().mockImplementation(() => ({
        project_name: 'TESTPROJ',
        sessionCounters: [] as Array<{ status: string }>,
        results: [] as Array<{ status: string }>,
        lastOperation: '',
        git_directory: '/tmp',
        buildContextLine: jest.fn().mockReturnValue('TESTPROJ'),
        isBusy: false,
        createPackageManager: jest.fn(),
    })),
}));

jest.mock('./jira_resource');
jest.mock('./jira_link_manager');
jest.mock('./csv_resource');
jest.mock('./package_version_manager');

jest.mock('./commands', () => ({
    getHandler: jest.fn().mockReturnValue(null),
}));

jest.mock('child_process', () => ({
    spawnSync: jest.fn().mockReturnValue({ error: null, status: 0, stdout: '', stderr: '' }),
}));

// ── Imports ────────────────────────────────────────────────────────────────
import { createValidateEnv } from '../shared/cli_base';
import { warn, helpLine, title, prompt, showSelect, printError } from '../shared/prompt';
import { load as loadState, update as updateState, getStatePath } from '../shared/state';

// ── Types ──────────────────────────────────────────────────────────────────
interface MenuChoice {
    type?: 'separator';
    line?: string;
    name?: string;
    value?: string;
    description?: string;
}

interface MainModule {
    main(ctx: { project_name?: string; git_directory: string }): Promise<void>;
    showSplash(statePath: string): Promise<void>;
    showHelp(choice?: string): void;
    showDocs(choice?: string): Promise<void>;
    showHelpLoop(): Promise<void>;
    resolveAlias(input: string): string;
    buildMenuChoices(proj: string, ctx: { git_directory: string }): MenuChoice[];
    handleSpecialInput(input: string): Promise<boolean | '__exit__'>;
    dispatchChoice(choice: string, cmdCtx: unknown): Promise<'exit' | 'continue'>;
    _configHint(key: string, ctx: { git_directory: string }): string;
}

// ── Module load ────────────────────────────────────────────────────────────
let mod: MainModule;
let createValidateEnvCall: unknown;
let updateStateCalled = false;
let getStatePathCalled = false;

beforeAll(async () => {
    mod = require('./main') as MainModule;
    // Yield to microtask queue so main() (called at module scope) completes
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    createValidateEnvCall = (createValidateEnv as jest.Mock).mock.calls[0]?.[0];
    updateStateCalled = (updateState as jest.Mock).mock.calls.length > 0;
    getStatePathCalled = (getStatePath as jest.Mock).mock.calls.length > 0;
});

afterAll(() => {
    process.removeAllListeners('unhandledRejection');
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('showHelp', () => {
    it('displays general help when no topic is given', () => {
        mod.showHelp();
        expect(title).toHaveBeenCalledWith(expect.stringContaining('HELP'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Escolha uma opção'));
    });

    it('displays help for a known topic', () => {
        mod.showHelp('csv');
        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Formato CSV'));
    });

    it('shows warning for unknown topic', () => {
        mod.showHelp('nonexistent');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('searches topics with search prefix', () => {
        mod.showHelp('search csv');
        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Formato CSV'));
    });

    it('shows warning when search finds nothing', () => {
        mod.showHelp('search xyzzy');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum'));
    });

    it('is case insensitive', () => {
        mod.showHelp('CSV');
        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
    });
});

describe('resolveAlias', () => {
    it('maps known aliases to command numbers', () => {
        expect(mod.resolveAlias('criar')).toBe('1');
        expect(mod.resolveAlias('versoes')).toBe('2');
        expect(mod.resolveAlias('fechar')).toBe('7');
        expect(mod.resolveAlias('sair')).toBe('0');
    });

    it('is case insensitive', () => {
        expect(mod.resolveAlias('CRIAR')).toBe('1');
        expect(mod.resolveAlias('Criar')).toBe('1');
    });

    it('returns original input for unknown alias', () => {
        expect(mod.resolveAlias('unknown')).toBe('unknown');
        expect(mod.resolveAlias('42')).toBe('42');
    });

    it('handles empty string', () => {
        expect(mod.resolveAlias('')).toBe('');
    });
});

describe('buildMenuChoices', () => {
    const ctx = { git_directory: '/tmp/repo' };

    it('returns an array', () => {
        expect(Array.isArray(mod.buildMenuChoices('ECSPOL', ctx))).toBe(true);
    });

    it('includes section separators', () => {
        const choices = mod.buildMenuChoices('ECSPOL', ctx);
        const separators = choices.filter((c) => c.type === 'separator' && c.line);
        expect(separators.length).toBeGreaterThanOrEqual(4);
    });

    it('includes exit option with value 0', () => {
        const choices = mod.buildMenuChoices('ECSPOL', ctx);
        expect(choices.find((c) => c.value === '0')).toBeDefined();
    });

    it('sets project name as description for option 9', () => {
        const choices = mod.buildMenuChoices('MYPROJ', ctx);
        expect(choices.find((c) => c.value === '9')?.description).toBe('MYPROJ');
    });

    it('sets git dir as description for option 10', () => {
        const choices = mod.buildMenuChoices('P', { git_directory: '/custom/git' });
        expect(choices.find((c) => c.value === '10')?.description).toBe('/custom/git');
    });

    it('shows "não configurado" for unset cypress and JSON dirs', () => {
        const choices = mod.buildMenuChoices('ECSPOL', ctx);
        expect(choices.find((c) => c.value === '14')?.description).toBe('não configurado');
        expect(choices.find((c) => c.value === '16')?.description).toBe('não configurado');
    });

    it('includes all known command IDs', () => {
        const choices = mod.buildMenuChoices('ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('1');
        expect(values).toContain('15');
        expect(values).toContain('d');
        expect(values).toContain('12');
    });
});

describe('handleSpecialInput', () => {
    beforeEach(() => {
        // showHelpLoop uses prompt() to wait for input; return /back to exit loop immediately
        (prompt as jest.Mock).mockReturnValue('/back');
    });

    afterEach(() => {
        (prompt as jest.Mock).mockReturnValue('0');
    });

    it('returns true and shows help for /help', async () => {
        expect(await mod.handleSpecialInput('/help')).toBe(true);
        expect(title).toHaveBeenCalled();
    });

    it('handles /h shorthand', async () => {
        expect(await mod.handleSpecialInput('/h')).toBe(true);
        expect(title).toHaveBeenCalled();
    });

    it('returns false for /exit (handled by runMainLoop, not by handleSpecialInput)', async () => {
        expect(await mod.handleSpecialInput('/exit')).toBe(false);
    });

    it('returns __exit__ for /back and /menu', async () => {
        expect(await mod.handleSpecialInput('/back')).toBe('__exit__');
        expect(await mod.handleSpecialInput('/menu')).toBe('__exit__');
    });

    it('handles /docs and /d', async () => {
        expect(await mod.handleSpecialInput('/docs')).toBe(true);
        expect(await mod.handleSpecialInput('/d')).toBe(true);
    });

    it('handles /history correctly', async () => {
        expect(await mod.handleSpecialInput('/history')).toBe(true);
        expect(title).toHaveBeenCalledWith(expect.stringContaining('Histórico'));
    });

    it('handles /home to show splash', async () => {
        expect(await mod.handleSpecialInput('/home')).toBe(true);
    });

    it('returns false for regular input', async () => {
        expect(await mod.handleSpecialInput('1')).toBe(false);
        expect(await mod.handleSpecialInput('')).toBe(false);
        expect(await mod.handleSpecialInput('texto livre')).toBe(false);
    });
});

describe('_configHint', () => {
    const ctx = { git_directory: '/my/git' };

    it('returns git directory for gitDir key', () => {
        expect(mod._configHint('gitDir', ctx)).toBe('(atual: /my/git)');
    });

    it('returns "não configurado" when state has no cypress path', () => {
        (loadState as jest.Mock).mockReturnValue({});
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: não configurado)');
    });

    it('reads cypress path from state', () => {
        (loadState as jest.Mock).mockReturnValue({ lastCypressPath: '/cy/path' });
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: /cy/path)');
    });

    it('reads json dir from state', () => {
        (loadState as jest.Mock).mockReturnValue({ lastJsonDir: '/json/dir' });
        expect(mod._configHint('jsonDir', ctx)).toBe('(atual: /json/dir)');
    });

    it('returns empty string for unknown key', () => {
        expect(mod._configHint('unknown', ctx)).toBe('');
    });
});

describe('module integration', () => {
    it('createValidateEnv was called with all required env vars', () => {
        const args = createValidateEnvCall as Array<{ key: string; label: string; example: string }>;
        expect(args).toBeDefined();
        const keys = args.map((a) => a.key);
        expect(keys).toContain('JIRA_BASE_URL');
        expect(keys).toContain('JIRA_PERSONAL_TOKEN');
        expect(keys).toContain('XRAY_BASE_URL');
    });

    it('createValidateEnv configs have key, label, and example', () => {
        const args = createValidateEnvCall as Array<{ key: string; label: string; example: string }>;
        expect(args).toBeDefined();
        for (const cfg of args) {
            expect(cfg).toHaveProperty('key');
            expect(cfg).toHaveProperty('label');
            expect(cfg).toHaveProperty('example');
        }
    });

    it('updateState was called during main loop', () => {
        expect(updateStateCalled).toBe(true);
    });

    it('getStatePath was called during initialization', () => {
        expect(getStatePathCalled).toBe(true);
    });
});

describe('dispatchChoice', () => {
    const minimalCtx = {
        jiraResource: {},
        jiraResourceXray: {},
        linkManager: {},
        linkManagerXray: {},
        csvResource: {},
        ctx: { project_name: 'test', git_directory: '/tmp', sessionCounters: [], results: [] },
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: '',
        sessionLog: '',
    };

    beforeEach(() => {
        (jest.requireMock('./commands').getHandler as jest.Mock).mockReturnValue(null);
    });

    it("returns 'exit' for choice '0'", async () => {
        const result = await mod.dispatchChoice('0', minimalCtx);
        expect(result).toBe('exit');
    });

    it("dispatches to handler and returns 'continue' for choice '1'", async () => {
        const handler = jest.fn().mockResolvedValue(false);
        (jest.requireMock('./commands').getHandler as jest.Mock).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("dispatches to handler and returns 'continue' for choice '7'", async () => {
        const handler = jest.fn().mockResolvedValue(false);
        (jest.requireMock('./commands').getHandler as jest.Mock).mockReturnValue(handler);

        const result = await mod.dispatchChoice('7', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("shows docs and returns 'continue' for 'd'", async () => {
        const result = await mod.dispatchChoice('d', minimalCtx);
        expect(result).toBe('continue');
    });

    it("shows docs and returns 'continue' for 'docs'", async () => {
        const result = await mod.dispatchChoice('docs', minimalCtx);
        expect(result).toBe('continue');
    });

    it("returns 'continue' and warns for invalid choice '99'", async () => {
        const result = await mod.dispatchChoice('99', minimalCtx);
        expect(result).toBe('continue');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });

    it('handler returning true triggers continue properly', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        (jest.requireMock('./commands').getHandler as jest.Mock).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("handler that throws CancelError returns 'continue'", async () => {
        const { CancelError } = jest.requireMock('../shared/prompt');
        const handler = jest.fn().mockRejectedValue(new CancelError('canceled'));
        (jest.requireMock('./commands').getHandler as jest.Mock).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
    });
});

describe('showDocs', () => {
    it('lists available documentation files and exits on 0', async () => {
        await mod.showDocs();
        expect(showSelect).toHaveBeenCalled();
    });

    it('handles missing docs directory', async () => {
        const fs = require('fs');
        jest.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        await mod.showDocs();
        expect(printError).toHaveBeenCalled();
    });

    it('warns when no matching files found in docs', async () => {
        const fs = require('fs');
        jest.spyOn(fs, 'readdirSync').mockReturnValueOnce(['readme.txt', 'notes.md']);
        await mod.showDocs();
        expect(warn).toHaveBeenCalled();
    });

    it('reads and displays a selected document', async () => {
        (showSelect as jest.Mock).mockResolvedValueOnce('01-test-doc.md').mockResolvedValueOnce('0');
        const fs = require('fs');
        jest.spyOn(fs, 'readdirSync').mockReturnValueOnce(['01-test-doc.md']);
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('# Test Document\nContent here.');
        await mod.showDocs();
        expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Pressione Enter'));
    });
});

describe('showHelpLoop', () => {
    beforeEach(() => {
        (prompt as jest.Mock).mockReturnValue('/back');
    });

    afterEach(() => {
        (prompt as jest.Mock).mockReturnValue('0');
    });

    it('shows help topics then exits on /back', async () => {
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles specific topic then exits', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('csv').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles empty input by continuing loop', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows help on /help command and continues', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('/help').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows specific help topic on /help <topic>', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('/help csv').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(helpLine).toHaveBeenCalled();
    });

    it('shows multiple matching topics when input matches several', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('a').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('warns when topic is not found', async () => {
        (prompt as jest.Mock).mockReturnValueOnce('nonexistent_topic_xyz').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });
});
