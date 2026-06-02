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

jest.mock('../shared/show-docs', () => ({ showDocs: jest.fn(() => Promise.resolve()) }));
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

import { warn, helpLine, title, prompt } from '../shared/prompt';

import { showHelp, showHelpLoop, handleSpecialInput, dispatchChoice } from './ui-helpers';
import { _configHint, buildMenuChoices, type MenuChoice } from './menu-data';
import { createMockContext } from '../shared/test-utils/factories/context-factory';

beforeAll(() => {
    const openModule = jest.mocked(jest.requireMock<typeof import('../shared/open')>('../shared/open'));
    if (!jest.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
    const cp = jest.mocked(jest.requireMock<typeof import('child_process')>('child_process'));
    if (!jest.isMockFunction(cp.spawn)) {
        throw new Error('Guard FAILED: child_process.spawn is NOT mocked. Browser would open!');
    }
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('showHelp', () => {
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

describe('_configHint', () => {
    const ctx = { git_directory: '/my/git' };

    it('returns git directory for gitDir key', () => {
        expect(_configHint('gitDir', ctx)).toBe('(atual: /my/git)');
    });

    it('returns empty string for unknown key', () => {
        expect(_configHint('unknown', ctx)).toBe('');
    });
});

describe('buildMenuChoices', () => {
    const ctx = { git_directory: '/tmp/repo' };

    it('returns array for main level', () => {
        expect(Array.isArray(buildMenuChoices('main', 'ECSPOL', ctx))).toBe(true);
    });

    it('returns array for sub-menu level', () => {
        expect(Array.isArray(buildMenuChoices('releases', 'ECSPOL', ctx))).toBe(true);
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

describe('handleSpecialInput', () => {
    beforeEach(() => {
        jest.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        jest.mocked(prompt).mockReturnValue('0');
    });

    it('returns true and shows help for /help', async () => {
        expect(await handleSpecialInput('/help')).toBe(true);
        expect(title).toHaveBeenCalled();
    });

    it('returns false for /exit', async () => {
        expect(await handleSpecialInput('/exit')).toBe(false);
    });

    it('returns __exit__ for /back at main level', async () => {
        expect(await handleSpecialInput('/back', 'main')).toBe('__exit__');
    });

    it('returns __back__ for /back at sub-menu level', async () => {
        expect(await handleSpecialInput('/back', 'releases')).toBe('__back__');
    });

    it('returns false for regular input', async () => {
        expect(await handleSpecialInput('1')).toBe(false);
        expect(await handleSpecialInput('')).toBe(false);
    });
});

describe('dispatchChoice', () => {
    const minimalCtx = createMockContext();

    beforeEach(() => {
        const commands = jest.mocked(jest.requireMock<typeof import('./commands')>('./commands'));
        commands.getHandler.mockReturnValue(null);
    });

    it("returns 'continue' for invalid choice", async () => {
        const result = await dispatchChoice('99', minimalCtx);
        expect(result).toBe('continue');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });

    it("returns 'continue' for docs choice", async () => {
        const result = await dispatchChoice('d', minimalCtx);
        expect(result).toBe('continue');
    });

    it('dispatches to handler', async () => {
        const handler = jest.fn().mockResolvedValue(false);
        const commands = jest.mocked(jest.requireMock<typeof import('./commands')>('./commands'));
        commands.getHandler.mockReturnValue(handler);

        const result = await dispatchChoice('1', minimalCtx);
        expect(result).toBe('continue');
        expect(handler).toHaveBeenCalledWith(minimalCtx);
    });
});

describe('showHelpLoop', () => {
    beforeEach(() => {
        jest.mocked(prompt).mockReturnValue('/back');
    });

    afterEach(() => {
        jest.mocked(prompt).mockReturnValue('0');
    });

    it('shows help and exits on /back', () => {
        showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('handles specific topic input', () => {
        jest.mocked(prompt).mockReturnValueOnce('csv').mockReturnValueOnce('/back');
        showHelpLoop();
        expect(title).toHaveBeenCalled();
    });

    it('warns for unknown topic', () => {
        jest.mocked(prompt).mockReturnValueOnce('nonexistent_topic_xyz').mockReturnValueOnce('/back');
        showHelpLoop();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('handles CancelError in showHelpLoop (line 84-85)', () => {
        const { CancelError } = jest.requireMock<typeof import('../shared/prompt')>('../shared/prompt');
        jest.mocked(prompt).mockImplementationOnce(() => {
            throw new CancelError('/back');
        });
        // Should not throw, just return
        expect(() => showHelpLoop()).not.toThrow();
    });

    it('handles /help and /h prefix commands', () => {
        jest.mocked(prompt).mockReturnValueOnce('/help csv').mockReturnValueOnce('/back');
        showHelpLoop();
        expect(title).toHaveBeenCalledWith(expect.stringContaining('csv'));
    });
});
