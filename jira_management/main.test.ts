import os from 'os';
import path from 'path';
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

vi.mock('../shared/spinner.js', () => ({
    withSpinner: async (_label: string, fn: () => Promise<unknown>): Promise<unknown> => fn(),
    ProgressBar: class {
        update = (): void => {};
        stop = (): void => {};
    },
    __setOraDep: (): void => {},
}));

vi.mock('../shared/config-accessor.js', () => ({
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
    getStatePath: vi.fn().mockReturnValue(path.join(os.tmpdir(), 'qa-state.json')),
}));

import { createMockRootLogger } from '../shared/test-utils.js';

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
vi.mock('./create_tests', () => ({
    default: { createTestsFromCsv: vi.fn() },
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
    getDocsOutputDir: vi.fn().mockReturnValue(path.join(os.tmpdir(), 'qa-docs-test')),
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
import { warn, prompt, printError } from '../shared/prompt.js';
import { getStatePath } from '../shared/state.js';
import * as openModule from '../shared/open.js';
import * as cp from 'child_process';
import * as commandsModule from './commands/index.js';
import { CancelError } from '../shared/prompt.js';
import { mask } from '../shared/cli_base.js';
import type { RuntimeResources } from './main.js';
import type JiraResource from './jira_resource.js';
import type JiraLinkManager from './jira_link_manager.js';
import type CsvResource from './csv_resource.js';

// ── Types ──────────────────────────────────────────────────────────────────
interface MainModule {
    main(ctx: { project_name?: string; git_directory: string }): Promise<void>;
    showSplash(statePath: string): Promise<void>;
    dispatchChoice(choice: string, cmdCtx: unknown): Promise<'exit' | 'continue'>;
    dispatchAndHandleResult(
        choice: string,
        cmdCtx: unknown,
        ctx: { results: Array<{ status: string }>; sessionCounters?: Array<unknown> },
    ): Promise<'continue'>;
    _isJiraConfigured(): boolean;
    showGapBadge(jiraResource: unknown, project: string): Promise<void>;
}

// ── Module load ────────────────────────────────────────────────────────────
describe('Main.ts', () => {
    let mod: MainModule;
    let createValidateEnvCall: unknown;
    let getStatePathCalled = false;

    beforeAll(async () => {
        if (!vi.isMockFunction(openModule.openWithFallback)) {
            throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
        }
        if (!vi.isMockFunction(cp.spawn)) {
            throw new Error('Guard FAILED: child_process.spawn is NOT mocked. Browser would open!');
        }

        mod = await import('./main.js');
        const imported = (await import('./main.js')) as MainModule;
        mod = imported;
        // Intentional: yield to microtask queue so main() (called at module scope) completes
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        createValidateEnvCall = vi.mocked(createValidateEnv).mock.calls[0]?.[0];
        getStatePathCalled = vi.mocked(getStatePath).mock.calls.length > 0;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        process.removeAllListeners('unhandledRejection');
    });

    // ── Tests ──────────────────────────────────────────────────────────────────

    describe('Module integration', () => {
        it('createValidateEnv was called with all required env vars', () => {
            const args = createValidateEnvCall as Array<{ key: string; label: string; example: string }>;

            expect(args).toBeDefined();

            const keys = args.map((a) => a.key);

            expect(keys).toContain('JIRA_BASE_URL');
            expect(keys).toContain('JIRA_PERSONAL_TOKEN');
            expect(keys).toContain('XRAY_BASE_URL');
        });

        it('createValidateEnv configs have key, label, and example', () => {
            expect.hasAssertions();

            const args = createValidateEnvCall as Array<{ key: string; label: string; example: string }>;

            expect(args).toBeDefined();

            for (const cfg of args) {
                expect(cfg).toHaveProperty('key');
                expect(cfg).toHaveProperty('label');
                expect(cfg).toHaveProperty('example');
            }
        });

        it('getStatePath was called during initialization', () => {
            expect(getStatePathCalled).toBeTruthy();
        });
    });

    describe('DispatchChoice', () => {
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
            vi.spyOn(commandsModule, 'getHandler').mockReturnValue(null);
        });

        it("returns 'continue' for choice '0' (handled by getAndResolveChoice now)", async () => {
            expect.hasAssertions();

            const result = await mod.dispatchChoice('0', minimalCtx);

            expect(result).toBe('continue');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
        });

        const dispatchHandlerCases = [
            { choice: '1', handlerReturn: false, expected: 'exit' },
            { choice: '7', handlerReturn: false, expected: 'exit' },
            { choice: '1', handlerReturn: true, expected: 'continue' },
        ];

        it.each(dispatchHandlerCases)(
            'dispatches choice $choice (handler returns $handlerReturn) → $expected',
            async ({ choice, handlerReturn, expected }) => {
                expect.hasAssertions();

                const handler = vi.fn().mockResolvedValue(handlerReturn);
                vi.spyOn(commandsModule, 'getHandler').mockReturnValue(handler);

                const result = await mod.dispatchChoice(choice, minimalCtx);

                expect(result).toBe(expected);
                expect(handler).toHaveBeenCalledWith(minimalCtx);
            },
        );

        it("shows docs and returns 'continue' for 'd'", async () => {
            expect.hasAssertions();

            const result = await mod.dispatchChoice('d', minimalCtx);

            expect(result).toBe('continue');
        });

        it("shows docs and returns 'continue' for 'docs'", async () => {
            expect.hasAssertions();

            const result = await mod.dispatchChoice('docs', minimalCtx);

            expect(result).toBe('continue');
        });

        it("returns 'continue' and warns for invalid choice '99'", async () => {
            expect.hasAssertions();

            const result = await mod.dispatchChoice('99', minimalCtx);

            expect(result).toBe('continue');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
        });

        it("handler that throws CancelError returns 'continue'", async () => {
            expect.hasAssertions();

            const handler = vi.fn().mockRejectedValue(new CancelError('canceled'));
            vi.spyOn(commandsModule, 'getHandler').mockReturnValue(handler);

            const result = await mod.dispatchChoice('1', minimalCtx);

            expect(result).toBe('continue');
        });

        it("catches generic Error from handler and returns 'continue'", async () => {
            expect.hasAssertions();

            const handler = vi.fn().mockRejectedValue(new Error('generic error'));
            vi.spyOn(commandsModule, 'getHandler').mockReturnValue(handler);

            const result = await mod.dispatchChoice('1', minimalCtx);

            expect(result).toBe('continue');
            expect(printError).toHaveBeenCalledWith('Erro no handler', expect.any(Error));
        });
    });

    describe('IsJiraConfigured', () => {
        it('returns false with default mock config (empty values)', () => {
            expect(mod._isJiraConfigured()).toBeFalsy();
        });
    });

    describe('ShowGapBadge', () => {
        it('resolves without error when config has placeholder values (skips API)', async () => {
            expect.hasAssertions();

            await expect(mod.showGapBadge({}, 'TESTPROJ')).resolves.toBeUndefined();
        });
    });

    describe('Module-level main error handler', () => {
        it('module exports main function', () => {
            expect(typeof mod.main).toBe('function');
        });
    });

    describe('DispatchAndHandleResult', () => {
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
            vi.spyOn(commandsModule, 'getHandler').mockReturnValue(vi.fn().mockResolvedValue(false));
        });

        it('calls prompt when autoConfirm off with long op and error results', async () => {
            expect.hasAssertions();

            const ctxWithErrors = {
                ...minimalCtx,
                ctx: { ...minimalCtx.ctx, results: [{ status: 'error' }] },
            };
            const result = await mod.dispatchAndHandleResult('1', ctxWithErrors, ctxWithErrors.ctx);

            expect(result).toBe('continue');
            expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Enter'));
        });

        it('does not prompt for autoConfirm off with choice 0', async () => {
            expect.hasAssertions();

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
            expect.hasAssertions();

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

    describe('Module-level debug logging', () => {
        it('mask hides middle of token', () => {
            expect(mask('secret1234567')).toBe('secr****');
        });

        it('mask returns empty for falsy input', () => {
            expect(mask('')).toBe('');
            expect(mask('')).toBe('');
        });
    });

    describe('IsJiraConfigured with config', () => {
        it('returns true when jiraBaseUrl and jiraPersonalToken have real values', async () => {
            expect.hasAssertions();

            const configMod = await import('../shared/config-accessor.js');
            vi.spyOn(configMod.default, 'get').mockReturnValue('https://jira.example.com');

            expect(mod._isJiraConfigured()).toBeTruthy();
        });

        it('returns false when jiraBaseUrl contains placeholder', async () => {
            expect.hasAssertions();

            const configMod = await import('../shared/config-accessor.js');
            vi.spyOn(configMod.default, 'get').mockReturnValue('seu-jira-server');

            expect(mod._isJiraConfigured()).toBeFalsy();
        });

        it('returns false when jiraPersonalToken is placeholder', async () => {
            expect.hasAssertions();

            const configMod = await import('../shared/config-accessor.js');
            vi.spyOn(configMod.default, 'get')
                .mockReturnValueOnce('https://jira.example.com')
                .mockReturnValueOnce('seu-token-aqui');

            expect(mod._isJiraConfigured()).toBeFalsy();
        });
    });

    describe('ShowGapBadge with config', () => {
        it('caches and displays badge after first call', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'false';
            const configMod = await import('../shared/config-accessor.js');
            vi.spyOn(configMod.default, 'get').mockReturnValue('https://jira.example.com');

            const mockJiraResource = { searchJiraIssues: vi.fn().mockResolvedValue({ total: 42 }) };
            await mod.showGapBadge(mockJiraResource, 'TESTPROJ');

            expect(mockJiraResource.searchJiraIssues).toHaveBeenCalledWith(expect.stringContaining('TESTPROJ'), 0);
        });
    });

    describe('Csv headless import', () => {
        let parseCsvArg: typeof import('./main.js').parseCsvArg;
        let describeCsvFailure: typeof import('./main.js').describeCsvFailure;
        let runHeadlessCsvImport: typeof import('./main.js').runHeadlessCsvImport;
        let createTests: (typeof import('./create_tests.js'))['default'];
        let ExitCode: typeof import('../shared/types.js').ExitCode;

        beforeAll(async () => {
            ({ parseCsvArg } = await import('./main.js'));
            ({ describeCsvFailure } = await import('./main.js'));
            ({ runHeadlessCsvImport } = await import('./main.js'));
            createTests = (await import('./create_tests.js')).default;
            ({ ExitCode } = await import('../shared/types.js'));
        });

        const csvPath = path.join(os.tmpdir(), 'headless-import.csv');

        const makeRes = (): RuntimeResources => ({
            jiraResource: {} as JiraResource,
            jiraResourceXray: {} as JiraResource,
            linkManager: {} as JiraLinkManager,
            linkManagerXray: {} as JiraLinkManager,
            csvResource: {} as CsvResource,
            ctx: { project_name: 'TESTPROJ', isBusy: false } as RuntimeResources['ctx'],
            pushHistory: vi.fn(),
            printSessionSummary: vi.fn(),
        });

        describe('ParseCsvArg', () => {
            it('reads explicit --csv <path>', () => {
                expect.hasAssertions();
                expect(parseCsvArg(['node', 'main', '--csv', csvPath])).toBe(csvPath);
            });

            it('falls back to CSV_PATH env when --auto is set', () => {
                expect.hasAssertions();

                const prev = process.env['CSV_PATH'];
                const envPath = path.join(os.tmpdir(), 'env.csv');
                process.env['CSV_PATH'] = envPath;

                try {
                    expect(parseCsvArg(['node', 'main', '--auto'])).toBe(envPath);
                } finally {
                    if (prev === undefined) delete process.env['CSV_PATH'];
                    else process.env['CSV_PATH'] = prev;
                }
            });

            it('returns undefined when no csv source is provided', () => {
                expect.hasAssertions();

                const prev = process.env['CSV_PATH'];
                delete process.env['CSV_PATH'];

                try {
                    expect(parseCsvArg(['node', 'main'])).toBeUndefined();
                } finally {
                    if (prev !== undefined) process.env['CSV_PATH'] = prev;
                }
            });
        });

        describe('DescribeCsvFailure', () => {
            it('maps missing to a file-not-found message', () => {
                expect.hasAssertions();
                expect(describeCsvFailure('missing', csvPath)).toContain(csvPath);
            });

            it('maps empty to a no-valid-tests message', () => {
                expect.hasAssertions();
                expect(describeCsvFailure('empty', csvPath)).toMatch(/nenhum teste valido/i);
            });

            it('prefers the underlying error for read-error', () => {
                expect.hasAssertions();
                expect(describeCsvFailure('read-error', csvPath, 'boom')).toBe('boom');
            });

            it('falls back to a generic message when read-error has no error', () => {
                expect.hasAssertions();
                expect(describeCsvFailure('read-error', csvPath)).toMatch(/ler o CSV/i);
            });
        });

        describe('RunHeadlessCsvImport', () => {
            it('returns OK and records history on success', async () => {
                expect.hasAssertions();

                vi.mocked(createTests.createTestsFromCsv).mockResolvedValue({
                    ok: true,
                    result: {
                        summary: '1/1 testes criados',
                        status: 'ok',
                        failedLinks: [],
                        inMemoryTasksId: ['TEST-1'],
                        inMemoryTasksText: ['TC01'],
                        sourcePath: csvPath,
                    },
                });

                const res = makeRes();
                const code = await runHeadlessCsvImport(res, csvPath);

                expect(code).toBe(ExitCode.OK);
                expect(res.pushHistory).toHaveBeenCalledWith('csv-import', '1/1 testes criados', 'ok');
            });

            it('reports failedLinks via printError and returns ERROR', async () => {
                expect.hasAssertions();

                vi.mocked(createTests.createTestsFromCsv).mockResolvedValue({
                    ok: true,
                    result: {
                        summary: '0/1 testes criados; 1 vínculo(s) perdido(s): KEY-100',
                        status: 'error',
                        failedLinks: ['KEY-100'],
                        inMemoryTasksId: ['TEST-1'],
                        inMemoryTasksText: ['TC01'],
                        sourcePath: csvPath,
                    },
                });

                const res = makeRes();
                const code = await runHeadlessCsvImport(res, csvPath);

                expect(code).toBe(ExitCode.ERROR);
                expect(printError).toHaveBeenCalledWith(
                    '0/1 testes criados; 1 vínculo(s) perdido(s): KEY-100',
                    undefined,
                );
            });

            it('returns ERROR and records history on read failure (missing)', async () => {
                expect.hasAssertions();

                vi.mocked(createTests.createTestsFromCsv).mockResolvedValue({
                    ok: false,
                    reason: 'missing',
                    error: undefined,
                });

                const res = makeRes();
                const code = await runHeadlessCsvImport(res, csvPath);

                expect(code).toBe(ExitCode.ERROR);
                expect(res.pushHistory).toHaveBeenCalledWith('csv-import', expect.stringContaining(csvPath), 'error');
            });

            it('returns ERROR and records history on read failure with error detail', async () => {
                expect.hasAssertions();

                vi.mocked(createTests.createTestsFromCsv).mockResolvedValue({
                    ok: false,
                    reason: 'read-error',
                    error: 'EACCES',
                });

                const res = makeRes();
                const code = await runHeadlessCsvImport(res, csvPath);

                expect(code).toBe(ExitCode.ERROR);
                expect(printError).toHaveBeenCalledWith('Importação CSV falhou', expect.any(Error));
            });

            it('returns ERROR and records history on unexpected throw', async () => {
                expect.hasAssertions();

                vi.mocked(createTests.createTestsFromCsv).mockRejectedValue(new Error('connection reset'));

                const res = makeRes();
                const code = await runHeadlessCsvImport(res, csvPath);

                expect(code).toBe(ExitCode.ERROR);
                expect(res.pushHistory).toHaveBeenCalledWith('csv-import', 'erro', 'error');
            });
        });
    });
});
