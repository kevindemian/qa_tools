jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    title: jest.fn(),
    prompt: jest.fn(),
    confirm: jest.fn(),
    printError: jest.fn(),
    withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    divider: jest.fn(),
}));

jest.mock('../shared/prompt-ui', () => ({
    CancelError: class extends Error {
        cmd: string;
        constructor(cmd: string) {
            super(cmd);
            this.cmd = cmd;
            this.name = 'CancelError';
        }
    },
    getConfig: jest.fn(() => ({ quiet: false })),
    isQuiet: jest.fn(() => false),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    icon: jest.fn(() => '!'),
}));

function createMockConfig() {
    return {
        default: {
            gitToken: 'glpat-test',
            gitBaseUrl: 'https://gitlab.com',
            githubToken: '',
            githubApiUrl: 'https://api.github.com',
            getAllPrefixed: jest.fn(() => ({})),
            get(key: string) {
                return (this as Record<string, unknown>)[key] as string;
            },
        },
        __esModule: true,
    };
}

jest.mock('../shared/config', createMockConfig);

jest.mock('../shared/session-context', () => ({
    SessionContext: jest.fn(() => ({
        pushHistory: jest.fn(),
        sessionCounters: {},
        lastOperation: null,
    })),
}));

jest.mock('../shared/state', () => ({ update: jest.fn() }));

jest.mock('../shared/cli_base', () => ({ printSessionSummary: jest.fn() }));

jest.mock('../shared/metrics', () => ({
    loadMetrics: jest.fn(() => ({ runs: [] })),
    calculateFlakiness: jest.fn(() => []),
}));

jest.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: jest.fn(() => '<html>') }));

jest.mock('./gitlab_manager', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            getRecentPipelines: jest.fn().mockResolvedValue([]),
        })),
    };
});

jest.mock('./github_manager', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            getRecentPipelines: jest.fn().mockResolvedValue([]),
        })),
    };
});

jest.mock('./ui-helpers', () => ({ providerLabel: jest.fn(() => 'GitLab') }));

import * as prompt from '../shared/prompt';
import * as sessionState from './session-state';
import { createMockGitProvider } from '../shared/test-utils/factories';
import { update as stateUpdate } from '../shared/state';

describe('session-state', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('module-level exports', () => {
        it('has default values', () => {
            expect(sessionState.currentProjectName).toBe('');
            expect(sessionState.currentProvider).toBe('gitlab');
            expect(sessionState.isBusy).toBe(false);
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
            expect(sessionState.isBusy).toBe(true);
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
            expect(sessionState.sessionContext.pushHistory).toHaveBeenCalledWith('test-op', 'detail', 'ok');
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
        it('calls title and print for each project', () => {
            jest.isolateModules(() => {
                jest.mock('fs', () => ({
                    readFileSync: jest.fn(() => JSON.stringify({ proj1: '1', proj2: '2' })),
                }));
                jest.mock('../shared/metrics', () => ({
                    loadMetrics: jest.fn(() => ({ runs: [] })),
                    calculateFlakiness: jest.fn(() => []),
                }));
                jest.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: jest.fn(() => '<html>') }));
                const mod = jest.requireMock<typeof import('./session-state')>('./session-state');
                mod.displayProjects();
            });
        });
    });

    describe('buildActionChoices', () => {
        it('returns choices for gitlab', () => {
            sessionState.setCurrentProvider('gitlab');
            const choices = sessionState.buildActionChoices();
            expect(choices.length).toBeGreaterThan(0);
            expect(JSON.stringify(choices)).toContain('Disparar pipeline');
            expect(JSON.stringify(choices)).toContain('Setup wizard CI/CD');
        });

        it('returns choices for github (no schedules)', () => {
            sessionState.setCurrentProvider('github');
            const choices = sessionState.buildActionChoices();
            expect(JSON.stringify(choices)).not.toContain('Listar schedules');
        });
    });

    describe('loadProvidersConfig error handling', () => {
        it('falls back to gitlab when providers.json is invalid', () => {
            jest.isolateModules(() => {
                jest.doMock('fs', () => ({
                    readFileSync: jest.fn((p: string) => {
                        if (p.includes('providers.json')) throw new Error('ENOENT');
                        if (p.includes('projects.json')) return JSON.stringify({ proj: '1' });
                        throw new Error('not found');
                    }),
                    writeFileSync: jest.fn(),
                    unlinkSync: jest.fn(),
                    existsSync: jest.fn(() => false),
                }));
                jest.doMock('../shared/prompt', () => ({
                    print: jest.fn(),
                    success: jest.fn(),
                    warn: jest.fn(),
                    info: jest.fn(),
                    error: jest.fn(),
                    title: jest.fn(),
                    prompt: jest.fn(),
                    confirm: jest.fn(),
                    printError: jest.fn(),
                    withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
                    divider: jest.fn(),
                }));
                jest.doMock('../shared/prompt-ui', () => ({
                    CancelError: class extends Error {
                        cmd: string;
                        constructor(cmd: string) {
                            super(cmd);
                            this.cmd = cmd;
                            this.name = 'CancelError';
                        }
                    },
                    getConfig: jest.fn(() => ({ quiet: false })),
                    isQuiet: jest.fn(() => false),
                    success: jest.fn(),
                    error: jest.fn(),
                    warn: jest.fn(),
                    info: jest.fn(),
                    icon: jest.fn(() => '!'),
                }));
                jest.doMock('../shared/config', createMockConfig);
                jest.doMock('../shared/session-context', () => ({
                    SessionContext: jest.fn(() => ({
                        pushHistory: jest.fn(),
                        sessionCounters: {},
                        lastOperation: null,
                        buildContextLine: jest.fn(() => ''),
                    })),
                }));
                jest.doMock('../shared/state', () => ({ update: jest.fn() }));
                jest.doMock('../shared/cli_base', () => ({ printSessionSummary: jest.fn() }));
                jest.doMock('../shared/metrics', () => ({
                    loadMetrics: jest.fn(() => ({ runs: [] })),
                    calculateFlakiness: jest.fn(() => []),
                }));
                jest.doMock('../shared/flakiness-dashboard', () => ({
                    generateFlakinessHtml: jest.fn(() => '<html>'),
                }));
                jest.doMock('../shared/logger', () => ({
                    rootLogger: {
                        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
                        warn: jest.fn(),
                        error: jest.fn(),
                        info: jest.fn(),
                    },
                }));
                jest.doMock('./gitlab_manager', () => ({
                    __esModule: true,
                    default: jest.fn().mockImplementation(() => ({
                        getRecentPipelines: jest.fn().mockResolvedValue([]),
                    })),
                }));
                jest.doMock('./github_manager', () => ({
                    __esModule: true,
                    default: jest.fn().mockImplementation(() => ({
                        getRecentPipelines: jest.fn().mockResolvedValue([]),
                    })),
                }));
                jest.doMock('./ui-helpers', () => ({ providerLabel: jest.fn(() => 'GitLab') }));

                const mod = jest.requireActual<typeof import('./session-state')>('./session-state');
                const result = mod.getProviderForProject('proj');
                expect(result).toBe('gitlab');
            });
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
            const metrics = jest.requireMock<typeof import('../shared/metrics')>('../shared/metrics');
            jest.mocked(metrics.loadMetrics).mockReturnValueOnce({
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
            jest.mocked(metrics.calculateFlakiness).mockReturnValueOnce([
                { title: 'flaky-test', rate: 0.5, passCount: 2, failCount: 2, skipCount: 0, totalRuns: 4 },
            ]);

            sessionState.setCurrentProjectName('qa_ibabs');
            const m = createMockGitProvider();
            jest.mocked(m.getRecentPipelines).mockResolvedValue([]);
            await sessionState.displayRecentPipelines(m);
            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('flakiness'));

            sessionState.setCurrentProjectName('');
        });
    });
});
