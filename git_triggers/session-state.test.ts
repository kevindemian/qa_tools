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

jest.mock('../shared/config', () => ({
    default: {
        get gitToken() {
            return 'glpat-test';
        },
        get gitBaseUrl() {
            return 'https://gitlab.com';
        },
        get githubToken() {
            return '';
        },
        get githubApiUrl() {
            return 'https://api.github.com';
        },
        getAllPrefixed: jest.fn(() => ({})),
    },
}));

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

import * as sessionState from './session-state';

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
            const m = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sessionState.setManager(m as any);
            expect(sessionState.manager).toBe(m);
        });
    });

    describe('pushHistory', () => {
        it('calls sessionContext.pushHistory and updateState', () => {
            sessionState.pushHistory('test-op', 'detail', 'ok');
            expect(sessionState.sessionContext.pushHistory).toHaveBeenCalledWith('test-op', 'detail', 'ok');
            const { update } = require('../shared/state');
            expect(update).toHaveBeenCalled();
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
                const mod = require('./session-state');
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
        });

        it('returns choices for github (no schedules)', () => {
            sessionState.setCurrentProvider('github');
            const choices = sessionState.buildActionChoices();
            expect(JSON.stringify(choices)).not.toContain('Listar schedules');
        });
    });
});
