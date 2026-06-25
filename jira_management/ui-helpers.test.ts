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

vi.mock('../shared/show-docs', () => ({ showDocs: vi.fn(() => Promise.resolve()) }));
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
}));

vi.mock('../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    loadTypedState: vi.fn().mockReturnValue({}),
    update: vi.fn(),
    getStatePath: vi.fn().mockReturnValue('/tmp/state.json'),
}));

const mockRootLogger = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    filePath: undefined as string | undefined,
    writeFileOnly: vi.fn(),
    file: vi.fn(),
    writeSplash: vi.fn(),
    updateSplashStep: vi.fn(),
    child: vi.fn().mockReturnThis(),
}));

vi.mock('../shared/logger', () => ({
    rootLogger: mockRootLogger,
    Logger: vi.fn(),
}));

vi.mock('../shared/cli_base', () => ({
    mask: vi.fn((v: string) => (v ? v.slice(0, 4) + '****' : '')),
    createValidateEnv: vi.fn().mockReturnValue(vi.fn()),
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

import { warn, helpLine, title, prompt } from '../shared/prompt.js';

import { showHelp, showHelpLoop, handleSpecialInput, dispatchChoice } from './ui-helpers.js';
import { _configHint, buildMenuChoices, type MenuChoice } from './menu-data.js';
import { createMockContext } from '../shared/test-utils/factories/context-factory.js';

beforeAll(async () => {
    const openModule = vi.mocked(await vi.importMock<typeof import('../shared/open.js')>('../shared/open'));
    if (!vi.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
    const cp = vi.mocked(await vi.importMock<typeof import('child_process')>('child_process'));
    if (!vi.isMockFunction(cp.spawn)) {
        throw new Error('Guard FAILED: child_process.spawn is NOT mocked. Browser would open!');
    }
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ShowHelp', () => {
    it('displays general help when no topic given', () => {
        showHelp();

        expect(title).toHaveBeenCalledWith(expect.stringContaining('HELP'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Escolha uma opção'));
    });

    it('displays help for known topic', () => {
        showHelp('csv');

        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Formato CSV'));
    });

    it('warns for unknown topic', () => {
        showHelp('nonexistent');

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('searches topics with search prefix', () => {
        showHelp('search csv');

        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
        expect(helpLine).toHaveBeenCalledWith(expect.stringContaining('Formato CSV'));
    });

    it('is case insensitive', () => {
        showHelp('CSV');

        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
    });
});

describe('ConfigHint', () => {
    const ctx = { git_directory: '/my/git' };

    it('returns git directory for gitDir key', () => {
        expect(_configHint('gitDir', ctx)).toBe('(atual: /my/git)');
    });

    it('returns empty string for unknown key', () => {
        expect(_configHint('unknown', ctx)).toBe('');
    });
});

describe('BuildMenuChoices', () => {
    const ctx = { git_directory: '/tmp/repo' };

    it('returns array for main level', () => {
        expect(Array.isArray(buildMenuChoices('main', 'ECSPOL', ctx))).toBeTruthy();
    });

    it('returns array for sub-menu level', () => {
        expect(Array.isArray(buildMenuChoices('releases', 'ECSPOL', ctx))).toBeTruthy();
    });

    it('main level includes category IDs', () => {
        const choices = buildMenuChoices('main', 'ECSPOL', ctx);
        const values = choices.filter((c: MenuChoice) => c.value).map((c: MenuChoice) => c.value);

        expect(values).toContain('reports');
        expect(values).toContain('releases');
    });

    it('sub-menu includes command IDs', () => {
        const choices = buildMenuChoices('releases', 'ECSPOL', ctx);
        const values = choices.filter((c: MenuChoice) => c.value).map((c: MenuChoice) => c.value);

        expect(values).toContain('2');
        expect(values).toContain('8');
        expect(values).toContain('0');
    });
});

describe('HandleSpecialInput', () => {
    beforeEach(() => {
        vi.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        vi.mocked(prompt).mockReturnValue('0');
    });

    it('returns true and shows help for /help', async () => {expect.hasAssertions();
        await expect(handleSpecialInput('/help')).resolves.toBeTruthy();
        expect(title).toHaveBeenCalled();
    });

    it('returns false for /exit', async () => {expect.hasAssertions();
        await expect(handleSpecialInput('/exit')).resolves.toBeFalsy();
    });

    it('returns __exit__ for /back at main level', async () => {expect.hasAssertions();
        await expect(handleSpecialInput('/back', 'main')).resolves.toBe('__exit__');
    });

    it('returns __back__ for /back at sub-menu level', async () => {expect.hasAssertions();
        await expect(handleSpecialInput('/back', 'releases')).resolves.toBe('__back__');
    });

    it('returns false for regular input', async () => {expect.hasAssertions();
        await expect(handleSpecialInput('1')).resolves.toBeFalsy();
        await expect(handleSpecialInput('')).resolves.toBeFalsy();
    });
});

describe('DispatchChoice', () => {
    const minimalCtx = createMockContext();

    beforeEach(async () => {
        const commands = vi.mocked(await vi.importMock<typeof import('./commands/index.js')>('./commands'));
        commands.getHandler.mockReturnValue(null);
    });

    it("returns 'continue' for invalid choice", async () => {expect.hasAssertions();

        const result = await dispatchChoice('99', minimalCtx);

        expect(result).toBe('continue');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });

    it("returns 'continue' for docs choice", async () => {expect.hasAssertions();

        const result = await dispatchChoice('d', minimalCtx);

        expect(result).toBe('continue');
    });

    it('dispatches to handler', async () => {expect.hasAssertions();

        const handler = vi.fn().mockResolvedValue(false);
        const commands = vi.mocked(await vi.importMock<typeof import('./commands/index.js')>('./commands'));
        commands.getHandler.mockReturnValue(handler);

        const result = await dispatchChoice('1', minimalCtx);

        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });
});

describe('ShowHelpLoop', () => {
    beforeEach(() => {
        vi.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        vi.mocked(prompt).mockReturnValue('0');
    });

    it('shows help and exits on /back', () => {
        showHelpLoop();

        expect(title).toHaveBeenCalled();
    });

    it('handles specific topic input', () => {
        vi.mocked(prompt).mockReturnValueOnce('csv').mockReturnValueOnce('/back');
        showHelpLoop();

        expect(title).toHaveBeenCalled();
    });

    it('warns for unknown topic', () => {
        vi.mocked(prompt).mockReturnValueOnce('nonexistent_topic_xyz').mockReturnValueOnce('/back');
        showHelpLoop();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('handles CancelError in showHelpLoop (line 84-85)', async () => {expect.hasAssertions();

        const { CancelError } = await vi.importMock<typeof import('../shared/prompt.js')>('../shared/prompt');
        vi.mocked(prompt).mockImplementationOnce(() => {
            throw new CancelError('/back');
        });

        // Should not throw, just return
        expect(() => showHelpLoop()).not.toThrow();
    });

    it('handles /help and /h prefix commands', () => {
        vi.mocked(prompt).mockReturnValueOnce('/help csv').mockReturnValueOnce('/back');
        showHelpLoop();

        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
    });
});
