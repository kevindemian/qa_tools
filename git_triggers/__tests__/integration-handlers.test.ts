import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _currentProvider: 'gitlab' | 'github' = 'gitlab';
let _currentProjectName = 'TEST';

vi.mock('../../shared/prompt.js', () => ({
    prompt: vi.fn(),
    confirm: vi.fn(),
    print: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    error: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn((_msg: string, fn: () => unknown) => fn()),
    divider: vi.fn(),
    showSelect: vi.fn(),
}));
vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), writeFileOnly: vi.fn() },
    Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
    })),
}));
vi.mock('../session-state.js', () => ({
    get currentProvider() {
        return _currentProvider;
    },
    set currentProvider(v: 'gitlab' | 'github') {
        _currentProvider = v;
    },
    get currentProjectName() {
        return _currentProjectName;
    },
    set currentProjectName(v: string) {
        _currentProjectName = v;
    },
    pushHistory: vi.fn(),
    setIsBusy: vi.fn(),
    displayProjects: vi.fn(),
    displayRecentPipelines: vi.fn(),
    createManagerForProject: vi.fn(),
    getProviderForProject: vi.fn(),
    setCurrentProjectName: vi.fn(),
    setProjectId: vi.fn(),
    setManager: vi.fn(),
    getProjects: vi.fn(() => ['TEST', 'OTHER']),
    getDataHub: vi.fn(),
    MSG_OPERATION_CANCELED: 'Operação cancelada.',
    sessionLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    sessionContext: { ensureDataHub: vi.fn(), setDataHub: vi.fn() },
}));
vi.mock('../../shared/state.js', () => ({
    update: vi.fn(),
    loadState: vi.fn(() => ({})),
}));
vi.mock('../ai-pr-desc.js', () => ({
    generatePrDescription: vi.fn(),
}));
vi.mock('../ai-test-impact.js', () => ({
    assessTestImpact: vi.fn(),
}));
vi.mock('../nivelar.js', () => ({
    nivelarBranches: vi.fn(),
}));
vi.mock('../../shared/temp-dir.js', () => ({
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'qa-test-report.html')),
    reportsDir: vi.fn(() => path.join(os.tmpdir(), 'qa-test-reports')),
    writeEphemeral: vi.fn(),
}));
vi.mock('../../shared/open.js', () => ({
    openWithFallback: vi.fn(),
}));
vi.mock('../../shared/flakiness-dashboard.js', () => ({
    generateFlakinessHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../pipeline-health-renderer.js', () => ({
    renderPipelineHealthHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../../shared/quarantine.js', () => ({
    expireQuarantine: vi.fn(),
    listQuarantined: vi.fn(),
    quarantineRatio: vi.fn(),
    generatePipelineQuarantine: vi.fn(),
}));
vi.mock('../../shared/git-metrics-adapter.js', () => ({
    generateGitMetricsRuns: vi.fn(() => []),
    generateGitFailureClassifications: vi.fn(() => []),
}));
vi.mock('../../shared/report-export.js', () => ({
    exportTestsCsv: vi.fn(),
    exportTestsJson: vi.fn(),
}));
vi.mock('../test-results.js', () => ({
    collectTestResults: vi.fn(),
    createTestExecution: vi.fn(),
    downloadTestArtifacts: vi.fn(),
    parseTestResults: vi.fn(),
}));
vi.mock('../llm-pipeline.js', () => ({
    offerPipelineFailureAnalysis: vi.fn(),
}));
vi.mock('../pipeline-jira.js', () => ({
    handleBugCreation: vi.fn(),
}));
vi.mock('../../shared/http-client.js', () => ({
    sleep: vi.fn(),
}));
vi.mock('../../shared/git-sha.js', () => ({
    getHeadSha: vi.fn(() => 'abc123'),
}));
vi.mock('../../shared/store.js', () => ({
    Store: vi.fn().mockImplementation(() => ({
        put: vi.fn(),
        lookup: vi.fn(),
        runs: [],
    })),
    detectStoreBackend: vi.fn(),
}));
vi.mock('../../shared/cli_base.js', () => ({
    confirmDestructiveAction: vi.fn(),
}));
vi.mock('../cli-args.js', () => ({
    parseCliArgs: vi.fn(() => ({})),
}));

function makeMockGitProvider() {
    return {
        getSchedules: vi.fn().mockResolvedValue([
            { id: '1', description: 'Nightly build', next_run_at: '2026-06-15T02:00:00Z' },
            { id: '2', description: 'Weekly deploy', next_run_at: '2026-06-20T08:00:00Z' },
        ]),
        runSchedule: vi.fn().mockResolvedValue(undefined),
        getPipeline: vi.fn().mockResolvedValue({ status: 'success', web_url: 'https://gitlab.com/test' }),
        triggerPipeline: vi.fn().mockResolvedValue({ id: 1, web_url: 'https://gitlab.com/test' }),
        getBranch: vi.fn().mockResolvedValue({ name: 'main' }),
        getCICDVariables: vi.fn().mockResolvedValue([
            { key: 'TOKEN', value: 'secret', protected: true },
            { key: 'API_URL', value: 'https://api.test.com', protected: false },
        ]),
        createMergeRequest: vi.fn().mockResolvedValue({ web_url: 'https://gitlab.com/mr/1', iid: 1 }),
        searchMergeRequests: vi.fn().mockResolvedValue([
            { iid: 1, title: 'Fix bug', number: 1 },
            { iid: 2, title: 'Add feature', number: 2 },
        ]),
        isApproved: vi.fn().mockResolvedValue(true),
        acceptMergeRequest: vi.fn().mockResolvedValue({ web_url: 'https://gitlab.com/mr/1' }),
        getRecentPipelines: vi
            .fn()
            .mockResolvedValue([{ id: 1, status: 'success', created_at: '2026-06-14T10:00:00Z', ref: 'main' }]),
        getPipelineJobs: vi.fn().mockResolvedValue([{ name: 'test', status: 'success', duration: 120 }]),
    };
}

describe('HandleListSchedules', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('lists schedules for gitlab provider', { timeout: 15000 }, async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { handleListSchedules } = await import('../schedule-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleListSchedules(m as never);

        expect(m.getSchedules).toHaveBeenCalledTimes(1);
        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('list-schedules', '2 schedules', 'ok');
    });

    it('warns for github provider', { timeout: 15000 }, async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { handleListSchedules } = await import('../schedule-handler.js');
        _currentProvider = 'github';
        const { warn } = await import('../../shared/prompt.js');
        await handleListSchedules(m as never);

        expect(vi.mocked(warn)).toHaveBeenCalledWith('Opção não disponivel para GitHub.');
        expect(m.getSchedules).not.toHaveBeenCalled();
    });

    it('warns when no schedules found', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        m.getSchedules.mockResolvedValue([]);
        const { handleListSchedules } = await import('../schedule-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleListSchedules(m as never);

        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('list-schedules', 'vazio', 'ok');
    });
});

describe('HandleRunSchedule', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('runs schedule by ID', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { prompt } = await import('../../shared/prompt.js');
        vi.mocked(prompt).mockReturnValue('42');
        const { handleRunSchedule } = await import('../schedule-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleRunSchedule(m as never);

        expect(m.runSchedule).toHaveBeenCalledWith('42');
        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('schedule-run', '42', 'ok');
    });

    it('warns for github provider', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { handleRunSchedule } = await import('../schedule-handler.js');
        _currentProvider = 'github';
        const { warn } = await import('../../shared/prompt.js');
        await handleRunSchedule(m as never);

        expect(vi.mocked(warn)).toHaveBeenCalledWith('Opção não disponivel para GitHub.');
        expect(m.runSchedule).not.toHaveBeenCalled();
    });
});

describe('HandleCreateMR', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('creates MR with provided inputs', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { prompt, confirm } = await import('../../shared/prompt.js');
        vi.mocked(prompt)
            .mockReturnValueOnce('feature-x')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Fix stuff')
            .mockReturnValueOnce('Description');
        vi.mocked(confirm).mockReturnValue(false);
        const { handleCreateMR } = await import('../mr-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleCreateMR(m as never);

        expect(m.createMergeRequest).toHaveBeenCalledWith('feature-x', 'main', 'Fix stuff', 'Description');
        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('pr-create', 'feature-x->main', 'ok');
    });

    it('generates AI description when confirmed', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { prompt, confirm } = await import('../../shared/prompt.js');
        vi.mocked(prompt)
            .mockReturnValueOnce('feature-x')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Manual desc');
        vi.mocked(confirm).mockReturnValueOnce(true).mockReturnValueOnce(false);
        const { generatePrDescription } = await import('../ai-pr-desc.js');
        vi.mocked(generatePrDescription).mockResolvedValue('AI generated description');
        const { handleCreateMR } = await import('../mr-handler.js');
        await handleCreateMR(m as never);

        expect(m.createMergeRequest).toHaveBeenCalledWith('feature-x', 'main', 'Title', 'AI generated description');
    });
});

describe('HandleListApprovedMRs', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('lists approved MRs', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { prompt } = await import('../../shared/prompt.js');
        vi.mocked(prompt).mockReturnValue('opened');
        const { handleListApprovedMRs } = await import('../mr-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleListApprovedMRs(m as never);

        expect(m.searchMergeRequests).toHaveBeenCalledTimes(1);
        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('prs-approved', '2 MRs', 'ok');
    });

    it('warns when no approved MRs found', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        m.searchMergeRequests.mockResolvedValue([]);
        const { prompt } = await import('../../shared/prompt.js');
        vi.mocked(prompt).mockReturnValue('opened');
        const { handleListApprovedMRs } = await import('../mr-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleListApprovedMRs(m as never);

        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('prs-approved', 'vazio', 'ok');
    });
});

describe('HandleMergeMR', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('merges MR by IID', async () => {
        expect.hasAssertions();

        const m = makeMockGitProvider();
        const { prompt } = await import('../../shared/prompt.js');
        vi.mocked(prompt).mockReturnValue('42');
        const { handleMergeMR } = await import('../mr-handler.js');
        const { pushHistory } = await import('../session-state.js');
        await handleMergeMR(m as never);

        expect(m.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(vi.mocked(pushHistory)).toHaveBeenCalledWith('pr-merge', '42', 'ok');
    });
});

describe('HandleFlakinessDashboard', () => {
    beforeEach(() => {
        _currentProvider = 'gitlab';
        _currentProjectName = 'TEST';
        vi.clearAllMocks();
    });

    it('warns when no project selected', async () => {
        expect.hasAssertions();

        _currentProjectName = '';
        const { handleFlakinessDashboard } = await import('../schedule-handler.js');
        const { warn } = await import('../../shared/prompt.js');
        await handleFlakinessDashboard();

        expect(vi.mocked(warn)).toHaveBeenCalledTimes(1);
    });
});
