vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    title: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    divider: vi.fn(),
}));

vi.mock('../shared/prompt-ui', () => ({
    CancelError: class extends Error {
        cmd: string;
        constructor(cmd: string) {
            super(cmd);
            this.cmd = cmd;
            this.name = 'CancelError';
        }
    },
    getConfig: vi.fn(() => ({ quiet: false })),
    isQuiet: vi.fn(() => false),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    icon: vi.fn(() => '!'),
}));

function createMockConfig() {
    return {
        default: {
            gitToken: 'glpat-test',
            gitBaseUrl: 'https://gitlab.com',
            githubToken: '',
            githubApiUrl: 'https://api.github.com',
            getAllPrefixed: vi.fn(() => ({})),
            get(key: string) {
                return (this as Record<string, unknown>)[key] as string;
            },
        },
        __esModule: true,
    };
}

vi.mock('../shared/config', createMockConfig);

vi.mock('../shared/session-context', () => ({
    SessionContext: vi.fn(function () {
        return {
            pushHistory: vi.fn(),
            sessionCounters: {},
            lastOperation: null,
        };
    }),
}));

vi.mock('../shared/state', () => ({ update: vi.fn() }));

vi.mock('../shared/cli_base', () => ({ printSessionSummary: vi.fn() }));

vi.mock('../shared/metrics', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    calculateFlakiness: vi.fn(() => []),
}));

vi.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: vi.fn(() => '<html>') }));

vi.mock('./gitlab_manager', () => {
    return {
        __esModule: true,
        default: vi.fn().mockImplementation(function () {
            return {
                getRecentPipelines: vi.fn().mockResolvedValue([]),
            };
        }),
    };
});

vi.mock('./github_manager', () => {
    return {
        __esModule: true,
        default: vi.fn().mockImplementation(function () {
            return {
                getRecentPipelines: vi.fn().mockResolvedValue([]),
            };
        }),
    };
});

vi.mock('./ui-helpers', () => ({ providerLabel: vi.fn(() => 'GitLab') }));

import * as prompt from '../shared/prompt.js';
import * as sessionState from './session-state.js';
import { loadMetrics as _loadMetrics, calculateFlakiness as _calculateFlakiness } from '../shared/metrics.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import { update as stateUpdate } from '../shared/state.js';
const pushHistorySpy = vi.spyOn(sessionState.sessionContext, 'pushHistory');

describe('session-state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('module-level exports', () => {
        it('has default values', () => {
            expect(sessionState.currentProjectName).toBe('');
            expect(sessionState.currentProvider).toBe('gitlab');
            expect(sessionState.isBusy).toBeFalsy();
            expect(sessionState.manager).toBeNull();
            expect(sessionState.MSG_OPERATION_CANCELED).toBe('Operação cancelada.');
        });
    });

    describe('setters', () => {
        it('setCurrentProvider updates value', () => {
            sessionState.setCurrentProvider('github');

            expect(sessionState.currentProvider).toBe('github');
        });

        it('setCurrentProjectName updates value', () => {
            sessionState.setCurrentProjectName('my-project');

            expect(sessionState.currentProjectName).toBe('my-project');
        });

        it('setProjectId updates value', () => {
            sessionState.setProjectId('123');

            expect(sessionState.projectId).toBe('123');
        });

        it('setIsBusy updates value', () => {
            sessionState.setIsBusy(true);

            expect(sessionState.isBusy).toBeTruthy();
        });

        it('setManager updates value', () => {
            const m = createMockGitProvider();
            sessionState.setManager(m);

            expect(sessionState.manager).toBe(m);
        });
    });

    describe('pushHistory', () => {
        it('calls sessionContext.pushHistory and updateState', () => {
            sessionState.pushHistory('test-op', 'detail', 'ok');

            expect(pushHistorySpy).toHaveBeenCalledWith('test-op', 'detail', 'ok');
            expect(stateUpdate).toHaveBeenCalled();
        });
    });

    describe('providerLabel', () => {
        it('delegates to ui-helpers', () => {
            const result = sessionState.providerLabel();

            expect(result).toBe('GitLab');
        });
    });

    describe('displayProjects', () => {
        it('displays projects from real projects.json', () => {
            sessionState.displayProjects();

            expect(prompt.title).toHaveBeenCalledWith('Projetos');
            expect(prompt.print).toHaveBeenCalled();
        });
    });

    describe('createManagerForProject', () => {
        it('creates GitLabManager when provider is gitlab', () => {
            const mgr = sessionState.createManagerForProject('qa_ibabs', '47849962');

            expect(mgr).toBeTruthy();
            expect(typeof mgr.getRecentPipelines).toBe('function');
        });
    });

    describe('displayRecentPipelines flakiness', () => {
        it('warns about high flakiness tests', async () => {
            vi.mocked(_loadMetrics).mockReturnValueOnce({
                runs: [
                    {
                        project: 'qa_ibabs',
                        timestamp: '2024-01-01',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'qa_ibabs',
                        timestamp: '2024-01-02',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
            });
            vi.mocked(_calculateFlakiness).mockReturnValueOnce([
                { title: 'flaky-test', rate: 0.5, passCount: 2, failCount: 2, skipCount: 0, totalRuns: 4 },
            ]);

            sessionState.setCurrentProjectName('qa_ibabs');
            const m = createMockGitProvider();
            vi.spyOn(m, 'getRecentPipelines').mockResolvedValue([]);
            await sessionState.displayRecentPipelines(m);

            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('flakiness'));

            sessionState.setCurrentProjectName('');
        });
    });
});
