// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../shared/prompt', () => {
    class CancelError extends Error {
        constructor(msg?: string) {
            super(msg);
            this.name = 'CancelError';
        }
    }
    return {
        print: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        helpLine: vi.fn(),
        title: vi.fn(),
        divider: vi.fn(),
        prompt: vi.fn().mockReturnValue('0'),
        printError: vi.fn(),
        showSelect: vi.fn().mockReturnValue('0'),
        tableView: vi.fn(),
        CancelError,
    };
});

vi.mock('../shared/config', () => ({
    default: {
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
        get: vi.fn().mockReturnValue(''),
    },
    __esModule: true,
}));

vi.mock('../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    loadTypedState: vi.fn().mockReturnValue({}),
    update: vi.fn(),
    getStatePath: vi.fn().mockReturnValue('/tmp/state.json'),
}));

import { createMockRootLogger } from '../shared/test-utils.js';
import type { Mock } from 'vitest';

const mockRootLogger = {
    ...createMockRootLogger(),
    child: vi.fn().mockReturnThis(),
};

vi.mock('../shared/logger', () => ({
    rootLogger: mockRootLogger,
    Logger: vi.fn(),
}));

vi.mock('../shared/first-run', () => ({
    maybeRunFirstRunWizard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../shared/cli_base', () => ({
    mask: vi.fn((v: string) => (v ? v.slice(0, 4) + '****' : '')),
    createValidateEnv: vi.fn().mockReturnValue(vi.fn()),
    offerEnvSetup: vi.fn().mockReturnValue(false),
    setupSigint: vi.fn(),
    printSessionSummary: vi.fn(),
    sanitizeUrl: vi.fn((url: string) => url),
}));

vi.mock('../shared/session-context', () => ({
    SessionContext: vi.fn().mockImplementation(() => ({
        project_name: 'TESTPROJ',
        sessionCounters: [] as Array<{ status: string }>,
        results: [] as Array<{ status: string }>,
        lastOperation: '',
        git_directory: '/tmp',
        buildContextLine: vi.fn().mockReturnValue('TESTPROJ'),
        isBusy: false,
        createPackageManager: vi.fn(),
    })),
}));

vi.mock('./jira_resource');
vi.mock('./jira_link_manager');
vi.mock('./csv_resource');
vi.mock('./package_version_manager');

vi.mock('./commands', () => ({
    getHandler: vi.fn().mockReturnValue(null),
}));

vi.mock('child_process', () => ({
    spawn: vi.fn().mockReturnValue({
        on: vi.fn((_event: string, handler: (...args: unknown[]) => void) => {
            if (_event === 'exit') handler(0);
        }),
        unref: vi.fn(),
    }),
    spawnSync: vi.fn().mockReturnValue({ error: null, status: 0, stdout: '', stderr: '' }),
    execSync: vi.fn().mockImplementation(() => {
        throw new Error('not mocked');
    }),
}));

vi.mock('../shared/open', () => ({
    getDocsOutputDir: vi.fn().mockReturnValue('/tmp/qa_docs_test'),
    openWithFallback: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
    const mod: Record<string, unknown> = await importOriginal();
    return {
        ...mod,
        default: {
            ...mod,
            readdirSync: vi.fn<() => string[]>(() => []),
        },
        readdirSync: vi.fn<() => string[]>(() => []),
    };
});

// ── Imports ────────────────────────────────────────────────────────────────
import { createValidateEnv } from '../shared/cli_base.js';
import { warn, helpLine, title, prompt, printError } from '../shared/prompt.js';
import { loadTypedState, getStatePath } from '../shared/state.js';
import * as openModule from '../shared/open.js';
import * as cp from 'child_process';
import * as commandsModule from './commands/index.js';
import { CancelError } from '../shared/prompt.js';
import { mask } from '../shared/cli_base.js';
import fs from 'fs';

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
    showHelpLoop(): void;
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
    if (!vi.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
    if (!vi.isMockFunction(cp.spawn)) {
        throw new Error('Guard FAILED: child_process.spawn is NOT mocked. Browser would open!');
    }
});

beforeAll(async () => {
    mod = await import('./main.js');
    const imported = (await import('./main.js')) as MainModule;
    mod = imported;
    // Intentional: yield to microtask queue so main() (called at module scope) completes
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    createValidateEnvCall = vi.mocked(createValidateEnv).mock.calls[0]?.[0];
    getStatePathCalled = vi.mocked(getStatePath).mock.calls.length > 0;
});

afterAll(() => {
    process.removeAllListeners('unhandledRejection');
});

beforeEach(() => {
    vi.clearAllMocks();
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

    it('shows "não configurado" for unset cypress dir in config sub-menu', () => {
        const choices = mod.buildMenuChoices('config', 'ECSPOL', ctx);
        expect(choices.find((c) => c.value === '14')?.description).toContain('não configurado');
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
        vi.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        vi.mocked(prompt).mockReturnValue('0');
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
        vi.mocked(loadTypedState).mockReturnValue({});
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: não configurado)');
    });

    it('reads cypress path from state', () => {
        vi.mocked(loadTypedState).mockReturnValue({ lastCypressPath: '/cy/path' });
        expect(mod._configHint('cypressDir', ctx)).toBe('(atual: /cy/path)');
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
        pushHistory: vi.fn(),
        printSessionSummary: vi.fn(),
        base_url: '',
        sessionLog: '',
    };

    beforeEach(() => {
        vi.mocked(commandsModule.getHandler).mockReturnValue(null);
    });

    it("returns 'continue' for choice '0' (handled by getAndResolveChoice now)", async () => {
        const result = await mod.dispatchChoice('0', minimalCtx);
        expect(result).toBe('continue');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });

    it("dispatches to handler and returns 'continue' for choice '1'", async () => {
        const handler = vi.fn().mockResolvedValue(false);
        vi.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("dispatches to handler and returns 'continue' for choice '7'", async () => {
        const handler = vi.fn().mockResolvedValue(false);
        vi.mocked(commandsModule.getHandler).mockReturnValue(handler);

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
        const handler = vi.fn().mockResolvedValue(true);
        vi.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });

    it("handler that throws CancelError returns 'continue'", async () => {
        const handler = vi.fn().mockRejectedValue(new CancelError('canceled'));
        vi.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
    });

    it("catches generic Error from handler and returns 'continue'", async () => {
        const handler = vi.fn().mockRejectedValue(new Error('generic error'));
        vi.mocked(commandsModule.getHandler).mockReturnValue(handler);

        const result = await mod.dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(printError).toHaveBeenCalled();
    });
});

describe('showDocs', () => {
    it('generates all docs as HTML and opens browser', async () => {
        (fs.readdirSync as Mock).mockReturnValueOnce(['01-test-doc.md', '02-guide.md']);
        const readFileSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('# Test Content');
        await mod.showDocs();
        expect(openModule.openWithFallback).toHaveBeenCalledWith(
            expect.stringContaining('index.html'),
            'Documentação',
            expect.any(Function),
        );
        readFileSpy.mockRestore();
    });

    it('handles missing docs directory', async () => {
        (fs.readdirSync as Mock).mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        await mod.showDocs();
        expect(printError).toHaveBeenCalled();
    });

    it('warns when no matching files found in docs', async () => {
        (fs.readdirSync as Mock).mockReturnValueOnce(['readme.txt', 'notes.md']);
        await mod.showDocs();
        expect(warn).toHaveBeenCalled();
    });
});

describe('showHelpLoop', () => {
    beforeEach(() => {
        vi.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        vi.mocked(prompt).mockReturnValue('0');
    });

    it('shows help topics then exits on /back', () => {
        mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles specific topic then exits', () => {
        vi.mocked(prompt).mockReturnValueOnce('csv').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles empty input by continuing loop', () => {
        vi.mocked(prompt).mockReturnValueOnce('').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows help on /help command and continues', () => {
        vi.mocked(prompt).mockReturnValueOnce('/help').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('shows specific help topic on /help <topic>', () => {
        vi.mocked(prompt).mockReturnValueOnce('/help csv').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(helpLine).toHaveBeenCalled();
    });

    it('shows multiple matching topics when input matches several', () => {
        vi.mocked(prompt).mockReturnValueOnce('a').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('warns when topic is not found', () => {
        vi.mocked(prompt).mockReturnValueOnce('nonexistent_topic_xyz').mockReturnValueOnce('/back');
        mod.showHelpLoop();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });
});

describe('_isJiraConfigured', () => {
    it('returns false with default mock config (empty values)', () => {
        expect(mod._isJiraConfigured()).toBe(false);
    });
});

describe('showGapBadge', () => {
    it('resolves without error when config has placeholder values (skips API)', async () => {
        await expect(mod.showGapBadge({}, 'TESTPROJ')).resolves.toBeUndefined();
    });
});

describe('module-level main error handler', () => {
    it('module exports main function', () => {
        expect(typeof mod.main).toBe('function');
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
        pushHistory: vi.fn(),
        printSessionSummary: vi.fn(),
        base_url: '',
        sessionLog: '',
    };

    beforeEach(() => {
        vi.mocked(commandsModule.getHandler).mockReturnValue(vi.fn().mockResolvedValue(false));
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
        vi.mocked(prompt).mockClear();
        const result = await mod.dispatchAndHandleResult('0', ctxWithErrors, ctxWithErrors.ctx);
        expect(result).toBe('continue');
        expect(prompt).not.toHaveBeenCalled();
    });

    it('does not prompt for non-long-op choice', async () => {
        const ctxWithErrors = {
            ...minimalCtx,
            ctx: { ...minimalCtx.ctx, results: [{ status: 'error' }] },
        };
        vi.mocked(prompt).mockClear();
        const result = await mod.dispatchAndHandleResult('2', ctxWithErrors, ctxWithErrors.ctx);
        expect(result).toBe('continue');
        expect(prompt).not.toHaveBeenCalled();
    });
});

describe('module-level debug logging', () => {
    it('mask hides middle of token', () => {
        expect(mask('secret1234567')).toBe('secr****');
    });

    it('mask returns empty for falsy input', () => {
        expect(mask('')).toBe('');
        expect(mask('')).toBe('');
    });
});

describe('_isJiraConfigured with config', () => {
    it('returns true when jiraBaseUrl and jiraPersonalToken have real values', async () => {
        const configMod = await import('../shared/config.js');
        vi.spyOn(configMod.default, 'get').mockReturnValue('https://jira.example.com');
        expect(mod._isJiraConfigured()).toBe(true);
    });

    it('returns false when jiraBaseUrl contains placeholder', async () => {
        const configMod = await import('../shared/config.js');
        vi.spyOn(configMod.default, 'get').mockReturnValue('seu-jira-server');
        expect(mod._isJiraConfigured()).toBe(false);
    });

    it('returns false when jiraPersonalToken is placeholder', async () => {
        const configMod = await import('../shared/config.js');
        vi.spyOn(configMod.default, 'get')
            .mockReturnValueOnce('https://jira.example.com')
            .mockReturnValueOnce('seu-token-aqui');
        expect(mod._isJiraConfigured()).toBe(false);
    });
});

describe('showGapBadge with config', () => {
    it('caches and displays badge after first call', async () => {
        process.env['CI'] = 'false';
        const configMod = await import('../shared/config.js');
        vi.spyOn(configMod.default, 'get').mockReturnValue('https://jira.example.com');

        const mockJiraResource = { searchJiraIssues: vi.fn().mockResolvedValue({ total: 42 }) };
        await mod.showGapBadge(mockJiraResource, 'TESTPROJ');
        expect(mockJiraResource.searchJiraIssues).toHaveBeenCalled();
    });
});
