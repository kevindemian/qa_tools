import fs from 'fs';
import type { GitProvider, PipelineInfo } from '../shared/types.js';
import type JiraClient from '../shared/jira-client.js';
import type JiraLinkManager from '../jira_management/jira_link_manager.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import { nonNull } from '../shared/test-utils.js';
import * as prompt from '../shared/prompt.js';
import * as state from '../shared/state.js';
import * as nivelar from './nivelar.js';
import * as cliBase from '../shared/cli_base.js';
// sessionContext import removed — unused

vi.mock('fs', async (importOriginal) => {
    const mod: Record<string, unknown> = await importOriginal();
    const mockedReadFileSync = vi.fn((p: string) => {
        if (p.includes('providers.json')) return '{"proj-a":{"provider":"github"},"proj-b":{}}';
        if (p.includes('projects.json')) return '{"proj-a":"111","proj-b":"222"}';
        return (mod['readFileSync'] as (...args: unknown[]) => unknown)(p, 'utf8');
    });
    return {
        ...mod,
        default: { ...mod, readFileSync: mockedReadFileSync },
        readFileSync: mockedReadFileSync,
    };
});

vi.mock('../shared/breadcrumbs', () => ({
    pushBreadcrumb: vi.fn(),
    popBreadcrumb: vi.fn(),
    clearBreadcrumbs: vi.fn(),
    getBreadcrumbPath: vi.fn(() => 'GIT > proj-a'),
}));
vi.mock('../shared/show-docs', () => ({ showDocs: vi.fn(() => Promise.resolve()) }));
vi.mock('../shared/config', () => {
    const cfg: Record<string, unknown> = {
        autoConfirm: false,
        dryRun: true,
        jiraBaseUrl: 'https://jira.example.com',
        jiraPersonalToken: 'token',
        jiraMode: 'server',
        xrayBaseUrl: 'https://xray.example.com',
        gitToken: 'glpat-xxx',
        gitBaseUrl: 'https://gitlab.example.com',
        githubToken: '',
        githubApiUrl: '',
        cypressProjectPath: '',
        getAllPrefixed: vi.fn(() => ({})),
        quiet: false,
        get: vi.fn((key: string) => {
            const val = cfg[key] as string | undefined;
            return val !== undefined ? val : process.env[key] || undefined;
        }),
        set: vi.fn((key: string, value: unknown) => {
            cfg[key] = value;
        }),
    };
    return { __esModule: true, default: cfg };
});

vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    helpLine: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    ask: vi.fn(),
    askConfirm: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn((_label: string, fn: () => Promise<void>) => fn()),
    showSelect: vi.fn(),
    tableView: vi.fn(),
    Spinner: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../shared/state', () => ({
    load: vi.fn(() => ({})),
    update: vi.fn((fn: (s: Record<string, unknown>) => void) => {
        const s: Record<string, unknown> = {};
        fn(s);
        return s;
    }),
    save: vi.fn(),
}));

vi.mock('../shared/session-context', () => ({
    SessionContext: vi.fn().mockImplementation(function () {
        return {
            pushHistory: vi.fn(),
            buildContextLine: vi.fn(() => ''),
            sessionCounters: [] as Array<{ op: string; detail: string; status: string }>,
            lastOperation: '',
            history: [] as Array<Record<string, unknown>>,
        };
    }),
}));

vi.mock('../shared/logger', () => ({
    rootLogger: {
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
    Logger: vi.fn(),
}));

vi.mock('../shared/cli_base', () => ({
    createValidateEnv: vi.fn(() => vi.fn()),
    offerEnvSetup: vi.fn<(prompt: object) => Promise<boolean>>().mockResolvedValue(false),
    setupSigint: vi.fn(),
    printSessionSummary: vi.fn(),
    confirmDestructiveAction: vi.fn(() => true),
}));

vi.mock('adm-zip', () => ({
    default: vi.fn().mockImplementation(() => ({
        getEntries: vi.fn(() => []),
    })),
}));

vi.mock('../shared/result_parser', () => ({
    parseTestResults: vi.fn(),
}));

vi.mock('../jira_management/result_reporter', () => ({
    matchResultsToTests: vi.fn(() => ({ matched: [], unmatched: [] })),
    createTestExecutionFromResults: vi.fn(),
}));

vi.mock('../shared/metrics', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    calculateFlakiness: vi.fn(() => []),
}));

vi.mock('../shared/http-client', () => ({
    sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}),
}));

vi.mock('../shared/jira-client', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('../jira_management/jira_link_manager', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('./gitlab_manager', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('./github_manager', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('./nivelar', () => ({
    nivelarBranches: vi.fn(),
}));

vi.mock('./case00-handler', () => ({
    handleSetupWizard: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('../shared/temp-dir', () => ({
    ensureDirs: vi.fn(),
    registerCleanup: vi.fn(),
    writeEphemeral: vi.fn(() => '/tmp/test'),
    reportsDir: vi.fn(() => '/tmp/reports'),
}));

type MainModule = typeof import('./interactive-mode.js')._testExports;

const globSyncMock = vi.fn<(...args: unknown[]) => unknown>().mockReturnValue([]);
vi.mock('../shared/deps', async (importOriginal) => {
    const mod: Record<string, unknown> = await importOriginal();
    return { ...mod, globSync: globSyncMock };
});

const mockProvider = createMockGitProvider();

let mainModule: MainModule;

beforeAll(async () => {
    const sessionState: typeof import('./session-state.js') = await import('./session-state.js');
    sessionState._resetForTest();

    const interactiveMode = await import('./interactive-mode.js');
    mainModule = interactiveMode._testExports;
}, 30_000);

afterAll(() => {
    vi.clearAllMocks();
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prompt, 'prompt').mockReturnValue('0');
    vi.spyOn(prompt, 'confirm').mockReturnValue(false);
});

// ---------- isComplete ----------

describe('IsComplete', () => {
    it('returns true for success', () => {
        expect(mainModule.isComplete('success')).toBeTruthy();
    });

    it('returns true for failed', () => {
        expect(mainModule.isComplete('failed')).toBeTruthy();
    });

    it('returns true for canceled', () => {
        expect(mainModule.isComplete('canceled')).toBeTruthy();
    });

    it('returns true for skipped', () => {
        expect(mainModule.isComplete('skipped')).toBeTruthy();
    });

    it('returns false for running', () => {
        expect(mainModule.isComplete('running')).toBeFalsy();
    });

    it('returns false for pending', () => {
        expect(mainModule.isComplete('pending')).toBeFalsy();
    });

    it('returns false for empty string', () => {
        expect(mainModule.isComplete('')).toBeFalsy();
    });

    it('returns false for timeout', () => {
        expect(mainModule.isComplete('timeout')).toBeFalsy();
    });
});

// ---------- providerLabel ----------

describe('ProviderLabel', () => {
    it('returns GitLab by default', () => {
        expect(mainModule.providerLabel()).toBe('GitLab');
    });
});

// ---------- getProviderForProject ----------

describe('GetProviderForProject', () => {
    it('returns github for project configured with github provider', () => {
        expect(mainModule.getProviderForProject('proj-a')).toBe('github');
    });

    it('returns gitlab for project without explicit provider', () => {
        expect(mainModule.getProviderForProject('proj-b')).toBe('gitlab');
    });

    it('returns gitlab for unconfigured project', () => {
        expect(mainModule.getProviderForProject('unknown')).toBe('gitlab');
    });
});

// ---------- buildActionChoices ----------

describe('BuildActionChoices', () => {
    it('includes schedule options when provider is gitlab', () => {
        const choices = mainModule.buildActionChoices();

        expect(choices.some((c) => c['value'] === '2')).toBeTruthy();
        expect(choices.some((c) => c['value'] === '3')).toBeTruthy();
    });
});

// ---------- _jiraEnv ----------

describe('JiraEnv', () => {
    it('returns jira config when all vars set', () => {
        const result = mainModule._jiraEnv();

        expect(result).toStrictEqual({
            base: 'https://jira.example.com',
            token: 'token',
            xray: 'https://xray.example.com',
            mode: 'server',
        });
    });
});

// ---------- _resolveGlob ----------

describe('ResolveGlob', () => {
    it('returns resolved path when glob matches', () => {
        globSyncMock.mockReturnValueOnce(['/tmp/mapping.json']);
        const result = mainModule._resolveGlob('/tmp/*.json');

        expect(result).toBe('/tmp/mapping.json');
    });

    it('returns null when no match', () => {
        globSyncMock.mockReturnValueOnce([]);
        const result = mainModule._resolveGlob('/nonexistent/*.json');

        expect(result).toBeNull();
    });

    it('returns null when glob throws', () => {
        globSyncMock.mockImplementationOnce(() => {
            throw new Error('bad pattern');
        });
        const result = mainModule._resolveGlob('[');

        expect(result).toBeNull();
    });
});

// ---------- pollPipeline ----------

describe('PollPipeline', () => {
    const mockGetPipeline = vi.fn<(id: string | number) => Promise<PipelineInfo | null>>();

    beforeEach(() => {
        mockGetPipeline.mockReset();
    });

    it('returns status when pipeline completes', async () => {expect.hasAssertions();

        mockGetPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '1', 1, 1000);

        expect(result).toStrictEqual({ status: 'success', web_url: 'https://pipe/1' });
    });

    it('returns timeout when pipeline never completes', async () => {expect.hasAssertions();

        mockGetPipeline.mockResolvedValue({ status: 'running' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '1', 1, 50);

        expect(result).toStrictEqual({ status: 'timeout', web_url: '' });
    });

    it('reads state field when status is absent', async () => {expect.hasAssertions();

        mockGetPipeline.mockResolvedValue({ state: 'success', web_url: 'https://pipe/2' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '2', 1, 1000);

        expect(result).toStrictEqual({ status: 'success', web_url: 'https://pipe/2' });
    });

    it('handles null getPipeline response', async () => {expect.hasAssertions();

        mockGetPipeline.mockResolvedValue(null);
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '3', 1, 50);

        expect(result).toStrictEqual({ status: 'timeout', web_url: '' });
    });
});

// ---------- pushHistory ----------

describe('PushHistory', () => {
    it('calls updateState with history entry', () => {
        mainModule.pushHistory('test-op', 'detail-x', 'ok');

        expect(state.update).toHaveBeenCalled();
    });
});

// ---------- handleCreateMR ----------

describe('HandleCreateMR', () => {
    it('creates MR and shows success', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt')
            .mockReturnValueOnce('feature-x')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('My MR')
            .mockReturnValueOnce('Description');
        mockProvider.createMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/1' });

        await mainModule.handleCreateMR(mockProvider);

        expect(mockProvider.createMergeRequest).toHaveBeenCalledWith('feature-x', 'main', 'My MR', 'Description');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/1'));
    });

    it('handles creation error', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt')
            .mockReturnValueOnce('src')
            .mockReturnValueOnce('dst')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        mockProvider.createMergeRequest.mockRejectedValue(new Error('Conflict'));

        await mainModule.handleCreateMR(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao criar MR', expect.any(Error));
    });
});

// ---------- handleMergeMR ----------

describe('HandleMergeMR', () => {
    it('merges MR and shows success', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('42');
        mockProvider.acceptMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/42' });

        await mainModule.handleMergeMR(mockProvider);

        expect(mockProvider.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/42'));
    });

    it('handles merge error', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('99');
        mockProvider.acceptMergeRequest.mockRejectedValue(new Error('Merge conflict'));

        await mainModule.handleMergeMR(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao fazer merge', expect.any(Error));
    });
});

// ---------- handleListSchedules ----------

describe('HandleListSchedules', () => {
    it('lists schedules when found', async () => {expect.hasAssertions();

        mockProvider.getSchedules.mockResolvedValue([{ id: '5', description: 'Nightly', next_run_at: '2026-01-01' }]);

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Schedules encontrados'));
    });

    it('handles empty schedules', async () => {expect.hasAssertions();

        mockProvider.getSchedules.mockResolvedValue([]);

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum schedule'));
    });

    it('calls printError when getSchedules throws', async () => {expect.hasAssertions();

        mockProvider.getSchedules.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao listar schedules', expect.any(Error));
    });
});

// ---------- handleRunSchedule ----------

describe('HandleRunSchedule', () => {
    it('runs schedule on success', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('10');
        mockProvider.runSchedule.mockResolvedValue({ id: '10' });

        await mainModule.handleRunSchedule(mockProvider);

        expect(mockProvider.runSchedule).toHaveBeenCalledWith('10');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Schedule disparado'));
    });

    it('handles run error', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('bad-id');
        mockProvider.runSchedule.mockRejectedValue(new Error('Not found'));

        await mainModule.handleRunSchedule(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao disparar schedule', expect.any(Error));
    });
});

// ---------- handleListApprovedMRs ----------

describe('HandleListApprovedMRs', () => {
    it('lists approved MRs', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '1', title: 'Fix' }]);
        mockProvider.isApproved.mockResolvedValue(true);

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
    });

    it('warns when none approved', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '2', title: 'WIP' }]);
        mockProvider.isApproved.mockResolvedValue(false);

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum'));
    });
});

// ---------- handleExportVariables ----------

describe('HandleExportVariables', () => {
    it('exports variables when confirmed', async () => {expect.hasAssertions();

        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'my_value' }]);

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Variáveis exportadas'));
    });

    it('cancels when user declines', async () => {expect.hasAssertions();

        const cliBase: typeof import('../shared/cli_base.js') = await import('../shared/cli_base.js');
        vi.spyOn(cliBase, 'confirmDestructiveAction').mockReturnValueOnce(false);

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });
});

// ---------- handleHelp ----------

describe('HandleHelp', () => {
    it('prints help box and prompts to continue', async () => {expect.hasAssertions();

        vi.spyOn(process.stdout, 'write').mockImplementationOnce(() => true);
        await mainModule.handleHelp();

        expect(process.stdout['write']).toHaveBeenCalledWith(expect.stringContaining('Ajuda'));
        expect(prompt.ask).toHaveBeenCalledWith('Pressione Enter para continuar');
    });
});

// ---------- handleShowHistory ----------

describe('HandleShowHistory', () => {
    it('shows history table when entries exist', async () => {expect.hasAssertions();

        vi.spyOn(state, 'load').mockReturnValueOnce({
            history: [{ op: 'pipeline', detail: 'main', status: 'ok', ts: '2026-01-01T00:00:00Z' }],
        });

        await mainModule.handleShowHistory();

        expect(prompt.title).toHaveBeenCalledWith('Histórico de operações');
        expect(prompt.tableView).toHaveBeenCalled();
    });

    it('warns when history is empty', async () => {expect.hasAssertions();

        vi.spyOn(state, 'load').mockReturnValueOnce({});

        await mainModule.handleShowHistory();

        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma operação registrada.');
    });
});

// ---------- nivelarBranchesWrapper ----------

describe('NivelarBranchesWrapper', () => {
    it('calls nivelarBranches with provider and pushHistory', async () => {expect.hasAssertions();

        const gitlab = createMockGitProvider();
        await mainModule.nivelarBranchesWrapper(gitlab);

        expect(nivelar.nivelarBranches).toHaveBeenCalledWith(
            gitlab,
            expect.objectContaining({ pushHistory: expect.any(Function) as (...args: unknown[]) => void }),
        );
    });
});

// ---------- downloadTestArtifacts ----------

describe('DownloadTestArtifacts', () => {
    it('returns null when no artifacts found', async () => {expect.hasAssertions();

        mockProvider.listPipelineArtifacts.mockResolvedValue([]);
        const result = await mainModule.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
    });
});

// ---------- collectTestResults ----------

describe('CollectTestResults', () => {
    it('returns early when jira env vars are missing', async () => {expect.hasAssertions();

        const jiraResource = {} as JiraClient;
        const linkManager = {} as JiraLinkManager;
        const result = await mainModule.collectTestResults(mockProvider, '1', 'main', 'proj', {
            jiraResource,
            linkManager,
            jiraBaseUrl: '',
        });

        expect(result).toBeNull();
    });
});

// ---------- handleChangeProject ----------

describe('HandleChangeProject', () => {
    it('switches to valid project', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('1');

        await mainModule.handleChangeProject(['proj-a', 'proj-b']);

        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('proj-a'));
    });

    it('warns on invalid project index', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('99');

        await mainModule.handleChangeProject(['proj-a']);

        expect(prompt.warn).toHaveBeenCalledWith('Opção inválida.');
    });
});

// ---------- displayProjects ----------

describe('DisplayProjects', () => {
    it('prints project list with provider tags', () => {
        mainModule.displayProjects();

        expect(prompt.title).toHaveBeenCalledWith('Projetos');
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('[GH]'));
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('[GL]'));
    });
});

// ---------- printSessionSummary ----------

describe('PrintSessionSummary', () => {
    it('calls shared printSessionSummary', () => {
        mainModule.printSessionSummary();

        expect(cliBase.printSessionSummary).toHaveBeenCalled();
    });
});

// ---------- displayRecentPipelines ----------

describe('DisplayRecentPipelines', () => {
    it('prints pipelines when results exist', async () => {expect.hasAssertions();

        mockProvider.getRecentPipelines.mockResolvedValue([
            { id: '1', ref: 'main', status: 'success' },
            { id: '2', ref: 'develop', status: 'failed' },
        ]);

        await mainModule.displayRecentPipelines(mockProvider);

        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('Últimas pipelines'));
    });

    it('does not print when pipelines array is empty', async () => {expect.hasAssertions();

        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.displayRecentPipelines(mockProvider);

        expect(prompt.print).not.toHaveBeenCalledWith(expect.stringContaining('Últimas'));
    });

    it('silently catches getRecentPipelines error', async () => {expect.hasAssertions();

        mockProvider.getRecentPipelines.mockRejectedValue(new Error('API error'));

        await expect(mainModule.displayRecentPipelines(mockProvider)).resolves.toBeUndefined();
    });
});

// ---------- handleListApprovedMRs - error ----------

describe('HandleListApprovedMRs - error', () => {
    it('calls printError when searchMergeRequests throws', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith(expect.stringContaining('Erro ao listar'), expect.any(Error));
    });
});

// ---------- handleExportVariables - extended ----------

describe('HandleExportVariables - extended', () => {
    it('calls printError when getCICDVariables throws', async () => {expect.hasAssertions();

        mockProvider.getCICDVariables.mockRejectedValue(new Error('API fail'));

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao buscar variáveis CI/CD', expect.any(Error));
    });

    it('escapes values containing = sign with double quotes', async () => {expect.hasAssertions();

        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'foo=bar' }]);
        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.print).toHaveBeenCalledWith('MY_VAR="foo=bar"');

        writeSpy.mockRestore();
        unlinkSpy.mockRestore();
    });
});

// ---------- pushHistory - trim ----------

describe('PushHistory - trim', () => {
    it('trims state history to last 50 entries', () => {
        mainModule.pushHistory('op', 'd', 'ok');
        const callback = nonNull(vi.spyOn(state, 'update').mock.calls[0])[0];
        const testState = { history: Array(51).fill({}) };
        callback(testState);

        expect((testState.history as Array<unknown>)).toHaveLength(50);
    });
});

// ---------- handleTriggerPipeline ----------

describe('HandleTriggerPipeline', () => {
    it('warns when branch is not found', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('bad-branch');
        mockProvider.getBranch.mockResolvedValue(null);

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
    });

    it('triggers pipeline successfully without waiting', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt')
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        vi.spyOn(prompt, 'confirm')
            .mockReturnValueOnce(false) // add variables = no
            .mockReturnValueOnce(false); // wait for completion = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockResolvedValue({ web_url: 'https://gitlab/pipe/1' });

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(mockProvider.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({ ref: 'main', variables: [] }),
        );
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/pipe/1'));
    });

    it('handles triggerPipeline error', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt')
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        vi.spyOn(prompt, 'confirm').mockReturnValueOnce(false); // add variables = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockRejectedValue(new Error('Trigger fail'));

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao disparar pipeline', expect.any(Error));
    });

    it('triggers with custom variables', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt')
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce('') // workflow ID (empty = auto-detect, GitHub path)
            .mockReturnValueOnce('VAR1=val1,VAR2=val2'); // variables
        vi.spyOn(prompt, 'confirm')
            .mockReturnValueOnce(true) // add variables = yes
            .mockReturnValueOnce(false); // wait = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockResolvedValue({ web_url: 'https://gitlab/pipe/2' });

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(mockProvider.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                ref: 'main',
                variables: [
                    { key: 'VAR1', value: 'val1' },
                    { key: 'VAR2', value: 'val2' },
                ],
            }),
        );
    });

    it('resumes pending pipeline', async () => {expect.hasAssertions();

        vi.spyOn(state, 'load').mockReturnValueOnce({
            pendingPipeline: { branch: 'feature-x', pipelineId: '123', projectName: 'proj-b' },
        });
        vi.spyOn(prompt, 'confirm').mockReturnValueOnce(true); // confirm resume
        mockProvider.getPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(mockProvider.getPipeline).toHaveBeenCalledWith('123');
    });
});

// ---------- handleFlakinessDashboard ----------

describe('HandleFlakinessDashboard', () => {
    it('warns when fewer than 2 runs exist for current project', () => {
        void mainModule.handleFlakinessDashboard();

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2 execuções registradas'));
    });
});

// ---------- parseBatchArgs / tryBatchMode ----------

describe('ParseBatchArgs', () => {
    const origArgv = process.argv;

    afterEach(() => {
        process.argv = origArgv;
    });

    it('parses --project and --branch', () => {
        process.argv = ['node', 'main.ts', '--project', 'my-proj', '--branch', 'feature/x'];
        const result = mainModule.parseBatchArgs();

        expect(result).toStrictEqual({ project: 'my-proj', branch: 'feature/x' });
    });

    it('parses --auto flag', () => {
        process.argv = ['node', 'main.ts', '--auto'];
        const result = mainModule.parseBatchArgs();

        expect(result).toStrictEqual({ auto: true });
    });

    it('parses -p and -b short flags', () => {
        process.argv = ['node', 'main.ts', '-p', 'proj', '-b', 'dev'];
        const result = mainModule.parseBatchArgs();

        expect(result).toStrictEqual({ project: 'proj', branch: 'dev' });
    });

    it('returns empty object when no args', () => {
        process.argv = ['node', 'main.ts'];
        const result = mainModule.parseBatchArgs();

        expect(result).toStrictEqual({});
    });
});

// ---------- _ensureProjectsConfigured ----------

describe('EnsureProjectsConfigured', () => {
    const mockConfirm = vi.spyOn(prompt, 'confirm');

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when getProjects has entries', async () => {expect.hasAssertions();

        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        vi.spyOn(ss, 'getProjects').mockReturnValueOnce({ proj: '123' });
        const result = await mainModule._ensureProjectsConfigured();

        expect(result).toBeTruthy();
    });

    it('warns and prompts when no projects exist, returns false on user decline', async () => {expect.hasAssertions();

        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        vi.spyOn(ss, 'getProjects').mockReturnValue({});
        mockConfirm.mockReturnValue(false);
        const result = await mainModule._ensureProjectsConfigured();

        expect(prompt.warn).toHaveBeenCalledWith('Nenhum projeto configurado.');
        expect(result).toBeFalsy();
    });

    it('returns false when setup wizard is cancelled', async () => {expect.hasAssertions();

        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        vi.spyOn(ss, 'getProjects').mockReturnValue({});
        mockConfirm.mockReturnValue(true);
        const result = await mainModule._ensureProjectsConfigured();

        expect(result).toBeFalsy();
    });
});

// ---------- _selectProjectAndCreateManager ----------

describe('SelectProjectAndCreateManager', () => {
    it('returns null when _selectProject returns null projectName', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('99');
        const result = await mainModule._selectProjectAndCreateManager();

        expect(result).toBeNull();
    });
});

// ---------- buildContextLine ----------

describe('BuildContextLine', () => {
    it('returns provider TOOLS with session context', () => {
        const result = mainModule.buildContextLine();

        expect(result).toMatch(/TOOLS$/);
    });
});

// ---------- withErrorHandling ----------

describe('WithErrorHandling', () => {
    it('returns false when handler resolves', async () => {expect.hasAssertions();

        const handler: (m: GitProvider, pn: string, ns: string[]) => Promise<object> = vi
            .fn<(m: GitProvider, pn: string, ns: string[]) => Promise<object>>()
            .mockResolvedValue({ ok: true as const });
        const wrapped = mainModule.withErrorHandling(handler);
        const result = await wrapped(createMockGitProvider(), 'p', ['p']);

        expect(result).toBeFalsy();
    });

    it('calls printError when handler rejects and returns false', async () => {expect.hasAssertions();

        const handler: (m: GitProvider, pn: string, ns: string[]) => Promise<object> = vi
            .fn<(m: GitProvider, pn: string, ns: string[]) => Promise<object>>()
            .mockRejectedValue(new Error('fail'));
        const wrapped = mainModule.withErrorHandling(handler);
        const result = await wrapped(createMockGitProvider(), 'p', ['p']);

        expect(result).toBeFalsy();
        expect(prompt.printError).toHaveBeenCalledWith('Handler error', expect.any(Error));
    });
});

// ---------- _handleExit ----------

describe('HandleExit', () => {
    it('prints goodbye and returns true', async () => {expect.hasAssertions();

        const breadcrumbs: typeof import('../shared/breadcrumbs.js') = await import('../shared/breadcrumbs.js');
        const result = mainModule._handleExit();

        expect(result).toBeTruthy();
        expect(prompt.title).toHaveBeenCalledWith('Até logo!');
        expect(breadcrumbs.clearBreadcrumbs).toHaveBeenCalled();
    });

    it('does not set exit code when session has errors — no exitCode', async () => {expect.hasAssertions();

        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        const orig = ss.sessionContext.sessionCounters;
        ss.sessionContext.sessionCounters = [{ op: '', detail: '', status: 'error' }];
        try {
            mainModule._handleExit();

            expect(process.exitCode).toBeUndefined();
        } finally {
            ss.sessionContext.sessionCounters = orig;
        }
    });
});

// ---------- _dispatchAction ----------

describe('DispatchAction', () => {
    const mockM = createMockGitProvider();
    const pn = 'proj-a';
    const ns = ['proj-a', 'proj-b'];

    beforeAll(async () => {
        const outputMod: typeof import('../shared/output.js') = await import('../shared/output.js');
        vi.spyOn(outputMod.defaultOutput, 'box').mockImplementation(() => {});
    });

    it('handles /help and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/help', mockM, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handles /history and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/history', mockM, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handles /docs and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/docs', mockM, pn, ns);

        expect(result).toBeFalsy();
        expect(prompt.warn).not.toHaveBeenCalledWith('Documentação disponível apenas no módulo Jira.');
    });

    it('handles /d and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/d', mockM, pn, ns);

        expect(result).toBeFalsy();
        expect(prompt.warn).not.toHaveBeenCalledWith('Documentação disponível apenas no módulo Jira.');
    });

    it('handles /back and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/back', mockM, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handles /menu and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/menu', mockM, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handles /exit and returns true via _handleExit', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/exit', mockM, pn, ns);

        expect(result).toBeTruthy();
    });

    it('handles /sair and returns true via _handleExit', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('/sair', mockM, pn, ns);

        expect(result).toBeTruthy();
    });

    it('handles option 0 and returns true via _handleExit', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('0', mockM, pn, ns);

        expect(result).toBeTruthy();
    });

    it('dispatches to action handler and returns false', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('1', mockM, pn, ns);

        expect(result).toBeFalsy();
    });

    it('warns for invalid option', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('zzz', mockM, pn, ns);

        expect(result).toBeFalsy();
        expect(prompt.warn).toHaveBeenCalledWith('Opção inválida.');
    });
});

// ---------- _selectProject ----------

describe('SelectProject', () => {
    const PROJ_DATA: Record<string, string> = { 'proj-a': '111', 'proj-b': '222' };
    let gpSpy: { mockRestore: () => void };

    beforeEach(async () => {
        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        gpSpy = vi.spyOn(ss, 'getProjects').mockReturnValue(PROJ_DATA);
    });

    afterEach(() => {
        gpSpy.mockRestore();
    });

    it('selects first project by index 1', () => {
        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('1');
        const result = mainModule._selectProject();

        expect(result.projectName).toBe('proj-a');
        expect(result.names).toContain('proj-a');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Projeto selecionado'));
    });

    it('returns null projectName for invalid project index', () => {
        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('99');
        const result = mainModule._selectProject();

        expect(result.projectName).toBeNull();
        expect(prompt.warn).toHaveBeenCalledWith('Projeto inválido.');
    });

    it('returns null when no projects available and user declines setup', async () => {expect.hasAssertions();

        const ss: typeof import('./session-state.js') = await import('./session-state.js');
        gpSpy.mockRestore();
        const spy2 = vi.spyOn(ss, 'getProjects').mockReturnValue({});
        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('');
        const result = mainModule._selectProject();

        expect(result.projectName).toBeNull();
        expect(result.names).toStrictEqual([]);

        spy2.mockRestore();
    });
});

// ---------- _promptChoice ----------

describe('PromptChoice', () => {
    it('returns prompt choice in non-TTY mode', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('/exit');
        const result = await mainModule._promptChoice('0-9');

        expect(result).toBe('/exit');
    });

    it('falls back to lastChoice when prompt returns empty string', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('');
        vi.spyOn(state, 'load').mockReturnValue({ lastChoice: '3' });
        const result = await mainModule._promptChoice('0-9');

        expect(result).toBe('3');
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Repetindo última opção'));
    });

    it('skips lastChoice when it is "0"', async () => {expect.hasAssertions();

        vi.spyOn(prompt, 'prompt').mockReturnValueOnce('');
        vi.spyOn(state, 'load').mockReturnValue({ lastChoice: '0' });
        const result = await mainModule._promptChoice('0-9');

        expect(result).toBe('');
    });
});

// ---------- _promptChoice TTY mode ----------

describe('PromptChoice TTY mode', () => {
    const _origIsTTY = process.stdout.isTTY;

    beforeAll(() => {
        process.stdout.isTTY = true;
    });

    afterAll(() => {
        process.stdout.isTTY = _origIsTTY;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(state, 'load').mockReturnValue({ lastChoice: undefined });
    });

    it('shows box with session counters when TTY and not quiet', async () => {expect.hasAssertions();

        const sessionState: typeof import('./session-state.js') = await import('./session-state.js');
        sessionState.sessionContext.sessionCounters = [
            { op: '', detail: '', status: 'ok' },
            { op: '', detail: '', status: 'error' },
            { op: '', detail: '', status: 'ok' },
        ];
        vi.spyOn(prompt, 'showSelect').mockResolvedValue('/exit');
        const result = await mainModule._promptChoice('0-9');

        expect(result).toBe('/exit');
        expect(prompt.showSelect).toHaveBeenCalled();
    });
});

// ---------- ACTION_HANDLERS ----------

describe('ACTION_HANDLERS', () => {
    let mockProvider: GitProvider;
    let pn: string;
    let ns: string[];

    beforeAll(() => {
        vi.clearAllMocks();
    });

    beforeEach(() => {
        mockProvider = createMockGitProvider();
        pn = 'proj-a';
        ns = ['proj-a', 'proj-b'];
    });

    it('handler 9 calls handleChangeProject', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('9', mockProvider, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handler a calls handleFlakinessDashboard (void)', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('a', mockProvider, pn, ns);

        expect(result).toBeFalsy();
    });

    it('handler 00 calls handleSetupWizard', async () => {expect.hasAssertions();

        const result = await mainModule._dispatchAction('00', mockProvider, pn, ns);

        expect(result).toBeFalsy();
    });

    it('has handler keys for all new menu entries', () => {
        const keys = Object.keys(mainModule.ACTION_HANDLERS);

        expect(keys).toContain('c');
        expect(keys).toContain('d');
        expect(keys).toContain('e');
        expect(keys).toContain('g');
        expect(keys).toContain('i');
        expect(keys).toContain('p');
        expect(keys).toContain('q');
        expect(keys).toContain('t');
        expect(keys).toContain('b');
        expect(keys).toContain('r');
    });
});
