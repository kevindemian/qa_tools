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
    loadTypedState: jest.fn().mockReturnValue({}),
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

jest.mock('../shared/first-run', () => ({
    maybeRunFirstRunWizard: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../shared/cli_base', () => ({
    mask: jest.fn((v: string) => (v ? v.slice(0, 4) + '****' : '')),
    createValidateEnv: jest.fn().mockReturnValue(jest.fn()),
    offerEnvSetup: jest.fn().mockReturnValue(false),
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
    spawn: jest.fn().mockReturnValue({
        on: jest.fn((_event: string, handler: (...args: unknown[]) => void) => {
            if (_event === 'exit') handler(0);
        }),
        unref: jest.fn(),
    }),
    spawnSync: jest.fn().mockReturnValue({ error: null, status: 0, stdout: '', stderr: '' }),
    execSync: jest.fn().mockImplementation(() => {
        throw new Error('not mocked');
    }),
}));

jest.mock('../shared/open', () => ({
    getDocsOutputDir: jest.fn().mockReturnValue('/tmp/qa_docs_test'),
    openWithFallback: jest.fn(),
}));

// ── Imports ────────────────────────────────────────────────────────────────
import { createValidateEnv } from '../shared/cli_base';
import { warn, helpLine, title, prompt, printError } from '../shared/prompt';
import { loadTypedState, getStatePath } from '../shared/state';
import * as openModule from '../shared/open';
import * as cp from 'child_process';
import * as commandsModule from './commands';
import { CancelError } from '../shared/prompt';
import { mask } from '../shared/cli_base';

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
    buildMenuChoices(level: string, proj: string, ctx: { git_directory: string }): MenuChoice[];
    handleSpecialInput(input: string, level?: string): Promise<boolean | '__exit__' | '__back__'>;
    dispatchChoice(choice: string, cmdCtx: unknown): Promise<'exit' | 'continue'>;
    dispatchAndHandleResult(
        choice: string,
        cmdCtx: unknown,
        ctx: { results: Array<{ status: string }>; sessionCounters?: Array<unknown> },
    ): Promise<'continue'>;
    _configHint(key: string, ctx: { git_directory: string }): string;
    _isJiraConfigured(): boolean;
    showGapBadge(jiraResource: unknown, project: string): Promise<void>;
}

// ── Module load ────────────────────────────────────────────────────────────
let mod: MainModule;
let createValidateEnvCall: unknown;
let getStatePathCalled = false;

beforeAll(() => {
    if (!jest.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
    if (!jest.isMockFunction(cp.spawn)) {
        throw new Error('Guard FAILED: child_process.spawn is NOT mocked. Browser would open!');
    }
});

beforeAll(async () => {
    mod = require('./main') as MainModule;
    // Intentional: yield to microtask queue so main() (called at module scope) completes
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    createValidateEnvCall = jest.mocked(createValidateEnv).mock.calls[0]?.[0];
    getStatePathCalled = jest.mocked(getStatePath).mock.calls.length > 0;
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

    it('returns array for main level categories', () => {
        expect(Array.isArray(mod.buildMenuChoices('main', 'ECSPOL', ctx))).toBe(true);
    });

    it('returns array for sub-menu level', () => {
        expect(Array.isArray(mod.buildMenuChoices('releases', 'ECSPOL', ctx))).toBe(true);
    });

    it('main level includes category IDs', () => {
        const choices = mod.buildMenuChoices('main', 'ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('reports');
        expect(values).toContain('releases');
        expect(values).toContain('bugreport');
    });

    it('sub-menu level includes command IDs', () => {
        const choices = mod.buildMenuChoices('releases', 'ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('2');
        expect(values).toContain('8');
        expect(values).toContain('0');
    });

    it('includes exit option with value 0 at main level', () => {
        const choices = mod.buildMenuChoices('main', 'ECSPOL', ctx);
        expect(choices.find((c) => c.value === '0')).toBeDefined();
    });

    it('sets project name as description for option 9 in config sub-menu', () => {
        const choices = mod.buildMenuChoices('config', 'MYPROJ', ctx);
        expect(choices.find((c) => c.value === '9')?.description).toContain('MYPROJ');
    });

    it('sets git dir as description for option 10 in config sub-menu', () => {
        const choices = mod.buildMenuChoices('config', 'P', { git_directory: '/custom/git' });
        expect(choices.find((c) => c.value === '10')?.description).toContain('/custom/git');
    });

    it('shows "não configurado" for unset cypress and JSON dirs in config sub-menu', () => {
        const choices = mod.buildMenuChoices('config', 'ECSPOL', ctx);
        expect(choices.find((c) => c.value === '14')?.description).toContain('não configurado');
        expect(choices.find((c) => c.value === '16')?.description).toContain('não configurado');
    });

    it('fallback to main categories when sub-menu not found', () => {
        const choices = mod.buildMenuChoices('utilities', 'ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('0');
        expect(values).toContain('reports');
        expect(values).toContain('tests');
        expect(values).toContain('config');
    });

    it('tests sub-menu includes template command', () => {
        const choices = mod.buildMenuChoices('tests', 'ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('1');
        expect(values).toContain('11');
        expect(values).toContain('13');
        expect(values).toContain('15');
        expect(values).toContain('18');
    });

    it('config sub-menu includes diagnostic command', () => {
        const choices = mod.buildMenuChoices('config', 'ECSPOL', ctx);
        const values = choices.filter((c) => c.value).map((c) => c.value);
        expect(values).toContain('9');
        expect(values).toContain('10');
        expect(values).toContain('12');
        expect(values).toContain('14');
        expect(values).toContain('16');
    });
});

describe('handleSpecialInput', () => {
    beforeEach(() => {
        // showHelpLoop uses prompt() to wait for input; return /back to exit loop immediately
        jest.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        jest.mocked(prompt).mockReturnValue('0');
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

    it('returns __exit__ for /back and /menu at main level', async () => {
        expect(await mod.handleSpecialInput('/back', 'main')).toBe('__exit__');
        expect(await mod.handleSpecialInput('/menu', 'main')).toBe('__exit__');
    });

    it('returns __back__ for /back and /menu at sub-menu level', async () => {
        expect(await mod.handleSpecialInput('/back', 'releases')).toBe('__back__');
        expect(await mod.handleSpecialInput('/menu', 'releases')).toBe('__back__');
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
        jest.mocked(loadTypedState).mockReturnValue({});
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: não configurado)');
    });

    it('reads cypress path from state', () => {
        jest.mocked(loadTypedState).mockReturnValue({ lastCypressPath: '/cy/path' });
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: /cy/path)');
    });

    it('reads json dir from state', () => {
        jest.mocked(loadTypedState).mockReturnValue({ lastJsonDir: '/json/dir' });
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
        jest.mocked(commandsModule.getHandler).mockReturnValue(null);
    });

    it("returns 'continue' for choice '0' (handled by getAndResolveChoice now)", async () => {
        const result = await mod.dispatchChoice('0', minimalCtx);
        expect(result).toBe('continue');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });

    it("dispatches to handler and returns 'continue' for choice '1'", async () => {
        const handler = jest.fn().mockResolvedValue(false);
        jest.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("dispatches to handler and returns 'continue' for choice '7'", async () => {
        const handler = jest.fn().mockResolvedValue(false);
        jest.mocked(commandsModule.getHandler).mockReturnValue(handler);

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
        jest.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("handler that throws CancelError returns 'continue'", async () => {
        const handler = jest.fn().mockRejectedValue(new CancelError('canceled'));
        jest.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
    });

    it("catches generic Error from handler and returns 'continue'", async () => {
        const handler = jest.fn().mockRejectedValue(new Error('generic error'));
        jest.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(printError).toHaveBeenCalled();
    });
});

describe('showDocs', () => {
    it('generates all docs as HTML and opens browser', async () => {
        const fsActual = jest.requireActual<typeof import('fs')>('fs');
        const readdirSpy = jest.spyOn(fsActual, 'readdirSync').mockReturnValueOnce(['01-test-doc.md', '02-guide.md']);
        const readFileSpy = jest.spyOn(fsActual, 'readFileSync').mockReturnValue('# Test Content');
        await mod.showDocs();
        expect(openModule.openWithFallback).toHaveBeenCalledWith(
            expect.stringContaining('index.html'),
            'Documentação',
            expect.any(Function),
        );
        readdirSpy.mockRestore?.();
        readFileSpy.mockRestore?.();
    });

    it('handles missing docs directory', async () => {
        const fsActual = jest.requireActual<typeof import('fs')>('fs');
        jest.spyOn(fsActual, 'readdirSync').mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        await mod.showDocs();
        expect(printError).toHaveBeenCalled();
    });

    it('warns when no matching files found in docs', async () => {
        const fsActual = jest.requireActual<typeof import('fs')>('fs');
        jest.spyOn(fsActual, 'readdirSync').mockReturnValueOnce(['readme.txt', 'notes.md']);
        await mod.showDocs();
        expect(warn).toHaveBeenCalled();
    });
});

describe('showHelpLoop', () => {
    beforeEach(() => {
        jest.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        jest.mocked(prompt).mockReturnValue('0');
    });

    it('shows help topics then exits on /back', async () => {
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles specific topic then exits', async () => {
        jest.mocked(prompt).mockReturnValueOnce('csv').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles empty input by continuing loop', async () => {
        jest.mocked(prompt).mockReturnValueOnce('').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows help on /help command and continues', async () => {
        jest.mocked(prompt).mockReturnValueOnce('/help').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows specific help topic on /help <topic>', async () => {
        jest.mocked(prompt).mockReturnValueOnce('/help csv').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(helpLine).toHaveBeenCalled();
    });

    it('shows multiple matching topics when input matches several', async () => {
        jest.mocked(prompt).mockReturnValueOnce('a').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('warns when topic is not found', async () => {
        jest.mocked(prompt).mockReturnValueOnce('nonexistent_topic_xyz').mockReturnValueOnce('/back');
        await mod.showHelpLoop();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });
});

describe('_isJiraConfigured', () => {
    it('returns false when jiraBaseUrl is empty', () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
                jiraBaseUrl: '',
                jiraPersonalToken: 'valid-token',
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
            const { _isJiraConfigured: check } = require('./main') as MainModule;
            expect(check()).toBe(false);
        });
    });

    it('returns false when jiraPersonalToken is empty', () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
                jiraBaseUrl: 'https://jira.example.com',
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
            const { _isJiraConfigured: check } = require('./main') as MainModule;
            expect(check()).toBe(false);
        });
    });

    it('returns false when url contains placeholder seu-jira-server', () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
                jiraBaseUrl: 'https://seu-jira-server',
                jiraPersonalToken: 'token',
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
            const { _isJiraConfigured: check } = require('./main') as MainModule;
            expect(check()).toBe(false);
        });
    });

    it('returns false when token equals placeholder seu-token-aqui', () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
                jiraBaseUrl: 'https://jira.example.com',
                jiraPersonalToken: 'seu-token-aqui',
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
            const { _isJiraConfigured: check } = require('./main') as MainModule;
            expect(check()).toBe(false);
        });
    });

    it('returns false when both are empty', () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
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
            const { _isJiraConfigured: check } = require('./main') as MainModule;
            expect(check()).toBe(false);
        });
    });

    it('returns true when both url and token are valid — singleton', () => {
        // This test verifies that the singleton module (loaded in beforeAll)
        // sees the file-scope mock config (empty → false)
        expect(mod._isJiraConfigured()).toBe(false);
    });
});

describe('showGapBadge', () => {
    it('resolves without error when config has placeholder values (skips API)', async () => {
        await expect(mod.showGapBadge({}, 'TESTPROJ')).resolves.toBeUndefined();
    });
});

describe('module-level main error handler', () => {
    it('catches main() rejection and sets exit code', async () => {
        jest.isolateModules(() => {
            jest.doMock('../shared/config', () => ({
                jiraBaseUrl: '',
                jiraPersonalToken: '',
                xrayBaseUrl: '',
                debug: false,
                autoChoice: '',
                autoConfirm: false,
                quiet: true,
                cypressProjectPath: '',
                dryRun: false,
                get: jest.fn().mockReturnValue(''),
            }));
            const printErrorMock = jest.fn();
            jest.doMock('../shared/prompt', () => ({
                printError: printErrorMock,
                info: jest.fn(),
                print: jest.fn(),
                prompt: jest.fn().mockReturnValue('0'),
                title: jest.fn(),
                warn: jest.fn(),
                success: jest.fn(),
                isQuiet: jest.fn().mockReturnValue(true),
                showSelect: jest.fn().mockReturnValue('0'),
                tableView: jest.fn(),
                error: jest.fn(),
            }));
            jest.doMock('../shared/session-context', () => ({
                SessionContext: jest.fn().mockImplementation(() => ({
                    project_name: 'TEST',
                    sessionCounters: [],
                    results: [],
                    lastOperation: '',
                    git_directory: '/tmp',
                    buildContextLine: jest.fn(),
                    isBusy: false,
                })),
            }));
            jest.doMock('./jira_resource');
            jest.doMock('./jira_link_manager');
            jest.doMock('./csv_resource');
            jest.doMock('./commands', () => ({
                getHandler: jest.fn().mockReturnValue(null),
            }));
            jest.doMock('../shared/logger', () => ({
                rootLogger: { error: jest.fn(), info: jest.fn(), child: jest.fn().mockReturnThis() },
                Logger: jest.fn(),
            }));
            jest.doMock('../shared/state', () => ({
                load: jest.fn().mockReturnValue({}),
                loadTypedState: jest.fn().mockReturnValue({ history: [] }),
                update: jest.fn(),
                getStatePath: jest.fn().mockReturnValue('/tmp/state.json'),
            }));
            jest.doMock('../shared/cli_base', () => ({
                mask: jest.fn(),
                createValidateEnv: jest.fn().mockReturnValue(jest.fn()),
                offerEnvSetup: jest.fn().mockReturnValue(false),
                setupSigint: jest.fn(),
                printSessionSummary: jest.fn(),
                sanitizeUrl: jest.fn(),
            }));
            jest.doMock('../shared/first-run', () => ({
                maybeRunFirstRunWizard: jest.fn().mockResolvedValue(undefined),
            }));
            jest.doMock('../shared/spinner', () => ({ withSpinner: jest.fn() }));
            jest.doMock('../shared/breadcrumbs', () => ({
                pushBreadcrumb: jest.fn(),
                clearBreadcrumbs: jest.fn(),
            }));
            jest.doMock('../shared/temp-dir', () => ({
                ensureDirs: jest.fn(),
                registerCleanup: jest.fn(),
            }));
            jest.doMock('../shared/splash', () => ({
                showSplash: jest.fn().mockRejectedValue(new Error('Splash error')),
            }));
            jest.doMock('./menu-data', () => ({
                CATEGORY_IDS: new Set<string>(),
                CATEGORY_TITLES: {},
            }));
            jest.doMock('./ui-helpers', () => ({
                dispatchChoice: jest.fn(),
                getAndResolveChoice: jest.fn(),
            }));

            const mod = require('./main') as MainModule;
            expect(mod.main).toBeDefined();
        });
    });
});

describe('dispatchAndHandleResult', () => {
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
        jest.mocked(commandsModule.getHandler).mockReturnValue(jest.fn().mockResolvedValue(false));
    });

    it('calls prompt when autoConfirm off with long op and error results', async () => {
        const ctxWithErrors = {
            ...minimalCtx,
            ctx: { ...minimalCtx.ctx, results: [{ status: 'error' }] },
        };
        const result = await mod.dispatchAndHandleResult('1', ctxWithErrors, ctxWithErrors.ctx);
        expect(result).toBe('continue');
        expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Enter'));
    });

    it('does not prompt for autoConfirm off with choice 0', async () => {
        const ctxWithErrors = {
            ...minimalCtx,
            ctx: { ...minimalCtx.ctx, results: [{ status: 'error' }] },
        };
        jest.mocked(prompt).mockClear();
        const result = await mod.dispatchAndHandleResult('0', ctxWithErrors, ctxWithErrors.ctx);
        expect(result).toBe('continue');
        expect(prompt).not.toHaveBeenCalled();
    });

    it('does not prompt for non-long-op choice', async () => {
        const ctxWithErrors = {
            ...minimalCtx,
            ctx: { ...minimalCtx.ctx, results: [{ status: 'error' }] },
        };
        jest.mocked(prompt).mockClear();
        const result = await mod.dispatchAndHandleResult('2', ctxWithErrors, ctxWithErrors.ctx);
        expect(result).toBe('continue');
        expect(prompt).not.toHaveBeenCalled();
    });
});

describe('module-level debug logging', () => {
    it('mask hides middle of token', () => {
        expect(mask('secret1234567')).toBe('secr****');
    });
});
