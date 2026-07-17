import os from 'os';
import { makeDataHubGetters } from '../shared/test-utils/factories/data-hub-mock.js';

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
                return Reflect.get(this, key) as string;
            },
        },
        __esModule: true,
    };
}

vi.mock('../shared/config-accessor.js', createMockConfig);

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

vi.mock('../shared/project-registry', () => ({
    listProjects: vi.fn(() => [
        {
            name: 'qa_tools',
            projectId: '62689551',
            dir: os.tmpdir() + '/qa-tools-test',
            provider: 'gitlab',
            valid: true,
        },
    ]),
    getProject: vi.fn(() => ({
        name: 'qa_tools',
        projectId: '62689551',
        dir: os.tmpdir() + '/qa-tools-test',
        provider: 'gitlab',
        valid: true,
    })),
}));

vi.mock('../shared/project-context', () => ({
    getCurrentProject: vi.fn(() => undefined),
    setCurrentProject: vi.fn(),
    clearCurrentProject: vi.fn(),
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
import { getCurrentProject } from '../shared/project-context.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import { update as stateUpdate } from '../shared/state.js';
const pushHistorySpy = vi.spyOn(sessionState.sessionContext, 'pushHistory');

describe('Session-state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Module-level exports', () => {
        it('has default values', () => {
            expect(getCurrentProject()).toBeUndefined();
            expect(sessionState.currentProvider).toBe('gitlab');
            expect(sessionState.isBusy).toBeFalsy();
            expect(sessionState.manager).toBeNull();
            expect(sessionState.MSG_OPERATION_CANCELED).toBe('Operação cancelada.');
        });
    });

    describe('Setters', () => {
        it('setCurrentProvider updates value', () => {
            sessionState.setCurrentProvider('github');

            expect(sessionState.currentProvider).toBe('github');
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

    describe('PushHistory', () => {
        it('calls sessionContext.pushHistory and updateState', () => {
            sessionState.pushHistory('test-op', 'detail', 'ok');

            expect(pushHistorySpy).toHaveBeenCalledWith('test-op', 'detail', 'ok');
            expect(stateUpdate).toHaveBeenCalledWith(expect.any(Function));
        });
    });

    describe('ProviderLabel', () => {
        it('delegates to ui-helpers', () => {
            const result = sessionState.providerLabel();

            expect(result).toBe('GitLab');
        });
    });

    describe('DisplayProjects', () => {
        it('displays projects from real projects.json', () => {
            sessionState.displayProjects();

            expect(prompt.title).toHaveBeenCalledWith('Projetos');
            expect(prompt.print).toHaveBeenCalledWith(expect.any(String));
        });
    });

    describe('GetProjects — single source = registry', () => {
        it('reads projects from the registry (ignores PROJECT_ID_<NAME> env overrides)', () => {
            expect.hasAssertions();

            process.env['PROJECT_ID_QA_TOOLS'] = 'ENV_OVERRIDE_SHOULD_BE_IGNORED';

            const projects = sessionState.getProjects();

            expect(projects['qa_tools']).toBe('62689551');
            expect(projects['qa_tools']).not.toBe('ENV_OVERRIDE_SHOULD_BE_IGNORED');

            delete process.env['PROJECT_ID_QA_TOOLS'];
        });
    });

    describe('CreateManagerForProject', () => {
        it('creates GitLabManager when provider is gitlab', () => {
            const mgr = sessionState.createManagerForProject('qa_ibabs', '47849962');

            expect(mgr).toBeTruthy();
            expect(typeof mgr.getRecentPipelines).toBe('function');
        });
    });

    describe('DisplayRecentPipelines flakiness', () => {
        it('warns about high flakiness tests', async () => {
            expect.hasAssertions();

            sessionState.setDataHub({
                raw: {} as never,
                computed: {
                    flakinessEntries: [
                        {
                            title: 'flaky-test',
                            project: 'qa_ibabs',
                            rate: 0.5,
                            passCount: 2,
                            failCount: 2,
                            skipCount: 0,
                            totalRuns: 4,
                        },
                    ],
                } as never,
                timestamp: new Date(),
                provider: 'gitlab',
                repo: 'qa_ibabs',
                saveRun: vi.fn(),
                saveCoverageSnapshot: vi.fn(),
                saveFailureClassification: vi.fn(),
                flush: vi.fn(),
                loadCoverageHistory: vi.fn().mockReturnValue([]),
                loadFailureClassifications: vi.fn().mockReturnValue([]),
                saveMetricsStore: vi.fn(),
                saveParseResult: vi.fn().mockReturnValue({
                    timestamp: new Date().toISOString(),
                    project: '',
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                }),
                saveQualityMetrics: vi.fn(),
                loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
                // ─── ST-1 categories ───────────────────────────────────────────
                saveFailureRecords: vi.fn(),
                loadFailureRecords: vi.fn().mockReturnValue([]),
                saveSecurityFindings: vi.fn(),
                loadSecurityFindings: vi.fn().mockReturnValue([]),
                saveDeployments: vi.fn(),
                loadDeployments: vi.fn().mockReturnValue([]),
                saveReleases: vi.fn(),
                loadReleases: vi.fn().mockReturnValue([]),
                saveDoraMetrics: vi.fn(),
                loadDoraMetrics: vi.fn().mockReturnValue(null),
                savePmIssues: vi.fn(),
                loadPmIssues: vi.fn().mockReturnValue([]),
                saveCoverageFiles: vi.fn(),
                loadCoverageFiles: vi.fn().mockReturnValue([]),
                savePerformanceMetrics: vi.fn(),
                loadPerformanceMetrics: vi.fn().mockReturnValue(null),
                savePullRequests: vi.fn(),
                loadPullRequests: vi.fn().mockReturnValue([]),
                getQuality: vi.fn(),
                getQuarantine: vi.fn(() => ({ entries: [] })),
                ...makeDataHubGetters(),
                getBranchPassRate: vi.fn(),
                mergeIncremental: vi.fn(),
                loadReport: vi.fn(),
                saveReport: vi.fn(),
                put: vi.fn(),
                getBranch: vi.fn(),
                loadMetrics: vi.fn(),
                saveMetrics: vi.fn(),
            });

            vi.mocked(getCurrentProject).mockReturnValue('qa_ibabs');
            const m = createMockGitProvider();
            vi.spyOn(m, 'getRecentPipelines').mockResolvedValue([]);
            await sessionState.displayRecentPipelines(m);

            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('flakiness'));

            sessionState.setDataHub(undefined);
            vi.mocked(getCurrentProject).mockReturnValue(undefined);
        });
    });
});
