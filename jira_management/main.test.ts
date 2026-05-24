// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    helpLine: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue('0'),
    printError: jest.fn(),
    showSelect: jest.fn().mockResolvedValue('0'),
    tableView: jest.fn(),
}));

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
import { print, warn, helpLine, title, divider } from '../shared/prompt';
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
    main(): Promise<void>;
    showSplash(): void;
    showHelp(topic?: string): void;
    resolveAlias(choice: string): string;
    buildMenuChoices(proj: string, ctx: { git_directory: string }): MenuChoice[];
    handleSpecialInput(input: string): Promise<boolean>;
    displayMenu(
        proj: string,
        ctx: { lastOperation: string; sessionCounters: Array<{ status: string }>; git_directory: string },
    ): void;
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
    it('returns true and shows help for /help', async () => {
        expect(await mod.handleSpecialInput('/help')).toBe(true);
        expect(title).toHaveBeenCalled();
    });

    it('handles /h shorthand', async () => {
        expect(await mod.handleSpecialInput('/h')).toBe(true);
        expect(title).toHaveBeenCalled();
    });

    it('handles /help with specific topic', async () => {
        await mod.handleSpecialInput('/help csv');
        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
    });

    it('returns __exit__ for /back and /menu, true for /exit', async () => {
        expect(await mod.handleSpecialInput('/back')).toBe('__exit__');
        expect(await mod.handleSpecialInput('/menu')).toBe('__exit__');
        expect(await mod.handleSpecialInput('/exit')).toBe(true);
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

describe('displayMenu', () => {
    const ctx = {
        lastOperation: 'last-op',
        sessionCounters: [{ status: 'ok' }, { status: 'ok' }, { status: 'error' }],
        git_directory: '/tmp',
    };

    it('is a no-op — prints nothing, calls nothing', () => {
        mod.displayMenu('ECSPOL', ctx);
        expect(print).not.toHaveBeenCalled();
        expect(divider).not.toHaveBeenCalled();
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
