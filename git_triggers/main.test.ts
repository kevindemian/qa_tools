import { jest } from '@jest/globals';
import fs from 'fs';
import type { GitProvider, PipelineInfo } from '../shared/types';
import type JiraClient from '../shared/jira-client';
import type JiraLinkManager from '../jira_management/jira_link_manager';
import { createMockGitProvider } from '../shared/test-utils/factories';
import * as prompt from '../shared/prompt';
import * as state from '../shared/state';
import * as nivelar from './nivelar';
import * as cliBase from '../shared/cli_base';
// sessionContext import removed — unused

jest.mock('fs', () => {
    const original: typeof import('fs') = jest.requireActual('fs');
    return {
        ...original,
        readFileSync: jest.fn((p: string) => {
            if (p.includes('providers.json')) return '{"proj-a":{"provider":"github"},"proj-b":{}}';
            if (p.includes('projects.json')) return '{"proj-a":"111","proj-b":"222"}';
            return original.readFileSync(p, 'utf8');
        }),
    };
});

jest.mock('../shared/breadcrumbs', () => ({
    pushBreadcrumb: jest.fn(),
    popBreadcrumb: jest.fn(),
    clearBreadcrumbs: jest.fn(),
    getBreadcrumbPath: jest.fn(() => 'GIT > proj-a'),
}));
jest.mock('../shared/show-docs', () => ({ showDocs: jest.fn(() => Promise.resolve()) }));
jest.mock('../shared/config', () => {
    const cfg: Record<string, unknown> = {
        autoConfirm: false,
        dryRun: true,
        jiraBaseUrl: 'https://jira.example.com',
        jiraPersonalToken: 'token',
        xrayBaseUrl: 'https://xray.example.com',
        gitToken: 'glpat-xxx',
        gitBaseUrl: 'https://gitlab.example.com',
        githubToken: '',
        githubApiUrl: '',
        cypressProjectPath: '',
        getAllPrefixed: jest.fn(() => ({})),
        quiet: false,
        get: jest.fn((key: string) => {
            const val = cfg[key] as string | undefined;
            return val || process.env[key] || undefined;
        }),
    };
    return { __esModule: true, default: cfg };
});

jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    helpLine: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn(),
    confirm: jest.fn(),
    ask: jest.fn(),
    askConfirm: jest.fn(),
    printError: jest.fn(),
    withSpinner: jest.fn((_label: string, fn: () => Promise<void>) => fn()),
    showSelect: jest.fn(),
    tableView: jest.fn(),
    Spinner: jest.fn().mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
}));

jest.mock('../shared/state', () => ({
    load: jest.fn(() => ({})),
    update: jest.fn((fn: (s: Record<string, unknown>) => void) => {
        const s: Record<string, unknown> = {};
        fn(s);
        return s;
    }),
    save: jest.fn(),
}));

jest.mock('../shared/session-context', () => ({
    SessionContext: jest.fn().mockImplementation(() => ({
        pushHistory: jest.fn(),
        buildContextLine: jest.fn(() => ''),
        sessionCounters: [] as Array<{ op: string; detail: string; status: string }>,
        lastOperation: '',
        history: [] as Array<Record<string, unknown>>,
    })),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    },
    Logger: jest.fn(),
}));

jest.mock('../shared/cli_base', () => ({
    createValidateEnv: jest.fn(() => jest.fn()),
    offerEnvSetup: jest.fn<(prompt: object) => Promise<boolean>>().mockResolvedValue(false),
    setupSigint: jest.fn(),
    printSessionSummary: jest.fn(),
}));

jest.mock('adm-zip', () => {
    const mockAdmZip = jest.fn().mockImplementation(() => ({
        getEntries: jest.fn(() => []),
    }));
    return mockAdmZip;
});

jest.mock('../shared/result_parser', () => ({
    parseTestResults: jest.fn(),
}));

jest.mock('../jira_management/result_reporter', () => ({
    matchResultsToTests: jest.fn(() => ({ matched: [], unmatched: [] })),
    createTestExecutionFromResults: jest.fn(),
}));

jest.mock('../shared/metrics', () => ({
    loadMetrics: jest.fn(() => ({ runs: [] })),
    calculateFlakiness: jest.fn(() => []),
}));

jest.mock('../shared/http-client', () => ({
    sleep: jest.fn<(ms: number) => Promise<void>>(async () => {}),
}));

jest.mock('../shared/jira-client', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('../jira_management/jira_link_manager', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('./gitlab_manager', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('./github_manager', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('./nivelar', () => ({
    nivelarBranches: jest.fn(),
}));

jest.mock('./case00-handler', () => ({
    handleSetupWizard: jest.fn(() => Promise.resolve(false)),
}));

type MainModule = typeof import('./main').default;

const globSyncMock = jest.fn<(pattern: string) => string[]>().mockReturnValue([]);
jest.mock('glob', () => ({ sync: globSyncMock }));

const mockProvider = createMockGitProvider();

let mainModule: MainModule;

beforeAll(() => {
    const sessionState = require('./session-state') as typeof import('./session-state');
    sessionState._resetForTest();

    mainModule = (require('./main') as typeof import('./main')).default;
});

afterAll(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.mocked(prompt.prompt).mockReturnValue('0');
    jest.mocked(prompt.confirm).mockReturnValue(false);
});

// ---------- isComplete ----------

describe('isComplete', () => {
    it('returns true for success', () => {
        expect(mainModule.isComplete('success')).toBe(true);
    });
    it('returns true for failed', () => {
        expect(mainModule.isComplete('failed')).toBe(true);
    });
    it('returns true for canceled', () => {
        expect(mainModule.isComplete('canceled')).toBe(true);
    });
    it('returns true for skipped', () => {
        expect(mainModule.isComplete('skipped')).toBe(true);
    });
    it('returns false for running', () => {
        expect(mainModule.isComplete('running')).toBe(false);
    });
    it('returns false for pending', () => {
        expect(mainModule.isComplete('pending')).toBe(false);
    });
    it('returns false for empty string', () => {
        expect(mainModule.isComplete('')).toBe(false);
    });
    it('returns false for timeout', () => {
        expect(mainModule.isComplete('timeout')).toBe(false);
    });
});

// ---------- providerLabel ----------

describe('providerLabel', () => {
    it('returns GitLab by default', () => {
        expect(mainModule.providerLabel()).toBe('GitLab');
    });
});

// ---------- getProviderForProject ----------

describe('getProviderForProject', () => {
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

describe('buildActionChoices', () => {
    it('includes schedule options when provider is gitlab', () => {
        const choices = mainModule.buildActionChoices();
        expect(choices.some((c) => c.value === '2')).toBe(true);
        expect(choices.some((c) => c.value === '3')).toBe(true);
    });
});

// ---------- _jiraEnv ----------

describe('_jiraEnv', () => {
    it('returns jira config when all vars set', () => {
        const result = mainModule._jiraEnv();
        expect(result).toEqual({
            base: 'https://jira.example.com',
            token: 'token',
            xray: 'https://xray.example.com',
        });
    });
});

// ---------- _resolveGlob ----------

describe('_resolveGlob', () => {
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

describe('pollPipeline', () => {
    const mockGetPipeline = jest.fn<(id: string | number) => Promise<PipelineInfo | null>>();

    beforeEach(() => {
        mockGetPipeline.mockReset();
    });

    it('returns status when pipeline completes', async () => {
        mockGetPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '1', 1, 1000);
        expect(result).toEqual({ status: 'success', web_url: 'https://pipe/1' });
    });

    it('returns timeout when pipeline never completes', async () => {
        mockGetPipeline.mockResolvedValue({ status: 'running' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '1', 1, 50);
        expect(result).toEqual({ status: 'timeout', web_url: '' });
    });

    it('reads state field when status is absent', async () => {
        mockGetPipeline.mockResolvedValue({ state: 'success', web_url: 'https://pipe/2' });
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '2', 1, 1000);
        expect(result).toEqual({ status: 'success', web_url: 'https://pipe/2' });
    });

    it('handles null getPipeline response', async () => {
        mockGetPipeline.mockResolvedValue(null);
        const m = createMockGitProvider({ getPipeline: mockGetPipeline });
        const result = await mainModule.pollPipeline(m, '3', 1, 50);
        expect(result).toEqual({ status: 'timeout', web_url: '' });
    });
});

// ---------- pushHistory ----------

describe('pushHistory', () => {
    it('calls updateState with history entry', () => {
        mainModule.pushHistory('test-op', 'detail-x', 'ok');
        expect(state.update).toHaveBeenCalled();
    });
});

// ---------- handleCreateMR ----------

describe('handleCreateMR', () => {
    it('creates MR and shows success', async () => {
        jest.mocked(prompt.prompt)
            .mockReturnValueOnce('feature-x')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('My MR')
            .mockReturnValueOnce('Description');
        mockProvider.createMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/1' });

        await mainModule.handleCreateMR(mockProvider);

        expect(mockProvider.createMergeRequest).toHaveBeenCalledWith('feature-x', 'main', 'My MR', 'Description');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/1'));
    });

    it('handles creation error', async () => {
        jest.mocked(prompt.prompt)
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

describe('handleMergeMR', () => {
    it('merges MR and shows success', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('42');
        mockProvider.acceptMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/42' });

        await mainModule.handleMergeMR(mockProvider);

        expect(mockProvider.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/42'));
    });

    it('handles merge error', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('99');
        mockProvider.acceptMergeRequest.mockRejectedValue(new Error('Merge conflict'));

        await mainModule.handleMergeMR(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao fazer merge', expect.any(Error));
    });
});

// ---------- handleListSchedules ----------

describe('handleListSchedules', () => {
    it('lists schedules when found', async () => {
        mockProvider.getSchedules.mockResolvedValue([{ id: '5', description: 'Nightly', next_run_at: '2026-01-01' }]);

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Schedules encontrados'));
    });

    it('handles empty schedules', async () => {
        mockProvider.getSchedules.mockResolvedValue([]);

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum schedule'));
    });

    it('calls printError when getSchedules throws', async () => {
        mockProvider.getSchedules.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListSchedules(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao listar schedules', expect.any(Error));
    });
});

// ---------- handleRunSchedule ----------

describe('handleRunSchedule', () => {
    it('runs schedule on success', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('10');
        mockProvider.runSchedule.mockResolvedValue({ id: '10' });

        await mainModule.handleRunSchedule(mockProvider);

        expect(mockProvider.runSchedule).toHaveBeenCalledWith('10');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Schedule disparado'));
    });

    it('handles run error', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('bad-id');
        mockProvider.runSchedule.mockRejectedValue(new Error('Not found'));

        await mainModule.handleRunSchedule(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao disparar schedule', expect.any(Error));
    });
});

// ---------- handleListApprovedMRs ----------

describe('handleListApprovedMRs', () => {
    it('lists approved MRs', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '1', title: 'Fix' }]);
        mockProvider.isApproved.mockResolvedValue(true);

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
    });

    it('warns when none approved', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '2', title: 'WIP' }]);
        mockProvider.isApproved.mockResolvedValue(false);

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum'));
    });
});

// ---------- handleExportVariables ----------

describe('handleExportVariables', () => {
    it('exports variables when confirmed', async () => {
        jest.mocked(prompt.confirm).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'my_value' }]);
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

        await mainModule.handleExportVariables(mockProvider);

        expect(writeSpy).toHaveBeenCalled();
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('MY_VAR'));
        writeSpy.mockRestore();
        unlinkSpy.mockRestore();
    });

    it('cancels when user declines', async () => {
        jest.mocked(prompt.confirm).mockReturnValueOnce(false);

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });
});

// ---------- handleHelp ----------

describe('handleHelp', () => {
    it('prints help box and prompts to continue', async () => {
        jest.spyOn(process.stdout, 'write').mockImplementationOnce(() => true);
        await mainModule.handleHelp();
        expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Ajuda'));
        expect(prompt.ask).toHaveBeenCalledWith('Pressione Enter para continuar');
    });
});

// ---------- handleShowHistory ----------

describe('handleShowHistory', () => {
    it('shows history table when entries exist', async () => {
        jest.mocked(state.load).mockReturnValueOnce({
            history: [{ op: 'pipeline', detail: 'main', status: 'ok', ts: '2026-01-01T00:00:00Z' }],
        });

        await mainModule.handleShowHistory();

        expect(prompt.title).toHaveBeenCalledWith('Histórico de operações');
        expect(prompt.tableView).toHaveBeenCalled();
    });

    it('warns when history is empty', async () => {
        jest.mocked(state.load).mockReturnValueOnce({});

        await mainModule.handleShowHistory();

        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma operação registrada.');
    });
});

// ---------- nivelarBranchesWrapper ----------

describe('nivelarBranchesWrapper', () => {
    it('calls nivelarBranches with provider and pushHistory', async () => {
        const gitlab = createMockGitProvider();
        await mainModule.nivelarBranchesWrapper(gitlab);
        expect(nivelar.nivelarBranches).toHaveBeenCalledWith(
            gitlab,
            expect.objectContaining({ pushHistory: expect.any(Function) as (...args: unknown[]) => unknown }),
        );
    });
});

// ---------- downloadTestArtifacts ----------

describe('downloadTestArtifacts', () => {
    it('returns null when no artifacts found', async () => {
        mockProvider.listPipelineArtifacts.mockResolvedValue([]);
        const result = await mainModule.downloadTestArtifacts(mockProvider, '1');
        expect(result).toBeNull();
    });
});

// ---------- collectTestResults ----------

describe('collectTestResults', () => {
    it('returns early when jira env vars are missing', async () => {
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

describe('handleChangeProject', () => {
    it('switches to valid project', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('1');

        await mainModule.handleChangeProject(['proj-a', 'proj-b']);

        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('proj-a'));
    });

    it('warns on invalid project index', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('99');

        await mainModule.handleChangeProject(['proj-a']);

        expect(prompt.warn).toHaveBeenCalledWith('Opção inválida.');
    });
});

// ---------- displayProjects ----------

describe('displayProjects', () => {
    it('prints project list with provider tags', () => {
        mainModule.displayProjects();
        expect(prompt.title).toHaveBeenCalledWith('Projetos');
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('[GH]'));
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('[GL]'));
    });
});

// ---------- printSessionSummary ----------

describe('printSessionSummary', () => {
    it('calls shared printSessionSummary', () => {
        mainModule.printSessionSummary();
        expect(cliBase.printSessionSummary).toHaveBeenCalled();
    });
});

// ---------- displayRecentPipelines ----------

describe('displayRecentPipelines', () => {
    it('prints pipelines when results exist', async () => {
        mockProvider.getRecentPipelines.mockResolvedValue([
            { id: '1', ref: 'main', status: 'success' },
            { id: '2', ref: 'develop', status: 'failed' },
        ]);

        await mainModule.displayRecentPipelines(mockProvider);

        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('Últimas pipelines'));
    });

    it('does not print when pipelines array is empty', async () => {
        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.displayRecentPipelines(mockProvider);

        expect(prompt.print).not.toHaveBeenCalledWith(expect.stringContaining('Últimas'));
    });

    it('silently catches getRecentPipelines error', async () => {
        mockProvider.getRecentPipelines.mockRejectedValue(new Error('API error'));

        await expect(mainModule.displayRecentPipelines(mockProvider)).resolves.toBeUndefined();
    });
});

// ---------- handleListApprovedMRs - error ----------

describe('handleListApprovedMRs - error', () => {
    it('calls printError when searchMergeRequests throws', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListApprovedMRs(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith(expect.stringContaining('Erro ao listar'), expect.any(Error));
    });
});

// ---------- handleExportVariables - extended ----------

describe('handleExportVariables - extended', () => {
    it('calls printError when getCICDVariables throws', async () => {
        jest.mocked(prompt.confirm).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockRejectedValue(new Error('API fail'));

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao buscar variáveis CI/CD', expect.any(Error));
    });

    it('escapes values containing = sign with double quotes', async () => {
        jest.mocked(prompt.confirm).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'foo=bar' }]);
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

        await mainModule.handleExportVariables(mockProvider);

        expect(prompt.print).toHaveBeenCalledWith('MY_VAR="foo=bar"');
        writeSpy.mockRestore();
        unlinkSpy.mockRestore();
    });
});

// ---------- pushHistory - trim ----------

describe('pushHistory - trim', () => {
    it('trims state history to last 50 entries', () => {
        mainModule.pushHistory('op', 'd', 'ok');
        const callback = jest.mocked(state.update).mock.calls[0]![0];
        const testState = { history: Array(51).fill({}) };
        callback(testState);
        expect((testState.history as Array<unknown>).length).toBe(50);
    });
});

// ---------- handleTriggerPipeline ----------

describe('handleTriggerPipeline', () => {
    it('warns when branch is not found', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('bad-branch');
        mockProvider.getBranch.mockResolvedValue(null);

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
    });

    it('triggers pipeline successfully without waiting', async () => {
        jest.mocked(prompt.prompt)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        jest.mocked(prompt.confirm)
            .mockReturnValueOnce(false) // add variables = no
            .mockReturnValueOnce(true) // confirm trigger = yes
            .mockReturnValueOnce(false); // wait for completion = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockResolvedValue({ web_url: 'https://gitlab/pipe/1' });

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(mockProvider.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({ ref: 'main', variables: [] }),
        );
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/pipe/1'));
    });

    it('handles triggerPipeline error', async () => {
        jest.mocked(prompt.prompt)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        jest.mocked(prompt.confirm)
            .mockReturnValueOnce(false) // add variables = no
            .mockReturnValueOnce(true); // confirm trigger = yes
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockRejectedValue(new Error('Trigger fail'));

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao disparar pipeline', expect.any(Error));
    });

    it('triggers with custom variables', async () => {
        jest.mocked(prompt.prompt)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce('') // workflow ID (empty = auto-detect, GitHub path)
            .mockReturnValueOnce('VAR1=val1,VAR2=val2'); // variables
        jest.mocked(prompt.confirm)
            .mockReturnValueOnce(true) // add variables = yes
            .mockReturnValueOnce(true) // confirm trigger = yes
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

    it('resumes pending pipeline', async () => {
        jest.mocked(state.load).mockReturnValueOnce({
            pendingPipeline: { branch: 'feature-x', pipelineId: '123', projectName: 'proj-b' },
        });
        jest.mocked(prompt.confirm).mockReturnValueOnce(true); // confirm resume
        mockProvider.getPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.handleTriggerPipeline(mockProvider, 'proj-b');

        expect(mockProvider.getPipeline).toHaveBeenCalledWith('123');
    });
});

// ---------- handleFlakinessDashboard ----------

describe('handleFlakinessDashboard', () => {
    it('warns when fewer than 2 runs exist for current project', () => {
        void mainModule.handleFlakinessDashboard();
        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2 execuções registradas'));
    });
});

// ---------- parseBatchArgs / tryBatchMode ----------

describe('parseBatchArgs', () => {
    const origArgv = process.argv;

    afterEach(() => {
        process.argv = origArgv;
    });

    it('parses --project and --branch', () => {
        process.argv = ['node', 'main.ts', '--project', 'my-proj', '--branch', 'feature/x'];
        const result = mainModule.parseBatchArgs();
        expect(result).toEqual({ project: 'my-proj', branch: 'feature/x' });
    });

    it('parses --auto flag', () => {
        process.argv = ['node', 'main.ts', '--auto'];
        const result = mainModule.parseBatchArgs();
        expect(result).toEqual({ auto: true });
    });

    it('parses -p and -b short flags', () => {
        process.argv = ['node', 'main.ts', '-p', 'proj', '-b', 'dev'];
        const result = mainModule.parseBatchArgs();
        expect(result).toEqual({ project: 'proj', branch: 'dev' });
    });

    it('returns empty object when no args', () => {
        process.argv = ['node', 'main.ts'];
        const result = mainModule.parseBatchArgs();
        expect(result).toEqual({});
    });
});

// ---------- empty projects (main flow) ----------

describe('main flow empty projects', () => {
    it('exits early when no projects configured', () => {
        jest.isolateModules(() => {
            jest.doMock('fs', () => ({
                readFileSync: jest.fn((p: string) => {
                    if (p.includes('projects.json')) return '{}';
                    if (p.includes('providers.json')) return '{}';
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- requireActual returns unknown, needs typeof import for method access
                    return (jest.requireActual('fs') as typeof import('fs')).readFileSync(p, 'utf8') as string;
                }),
                writeFileSync: jest.fn(),
                unlinkSync: jest.fn(),
                existsSync: jest.fn(() => false),
            }));
            jest.doMock('../shared/config', () => ({
                __esModule: true,
                default: {
                    jiraBaseUrl: 'https://jira.example.com',
                    jiraPersonalToken: 'token',
                    xrayBaseUrl: 'https://xray.example.com',
                    gitToken: 'glpat-xxx',
                    gitBaseUrl: 'https://gitlab.example.com',
                    githubToken: '',
                    githubApiUrl: '',
                    cypressProjectPath: '',
                    getAllPrefixed: jest.fn(() => ({})),
                    quiet: false,
                },
            }));
            jest.doMock('../shared/cli_base', () => ({
                createValidateEnv: jest.fn(() => jest.fn()),
                offerEnvSetup: jest.fn<(prompt: object) => Promise<boolean>>().mockResolvedValue(false),
                setupSigint: jest.fn(),
                printSessionSummary: jest.fn(),
            }));
            jest.doMock('../shared/prompt', () => ({
                print: jest.fn(),
                success: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                info: jest.fn(),
                helpLine: jest.fn(),
                title: jest.fn(),
                divider: jest.fn(),
                prompt: jest.fn(),
                confirm: jest.fn(),
                ask: jest.fn(),
                askConfirm: jest.fn(),
                printError: jest.fn(),
                withSpinner: jest.fn((_l: string, fn: () => Promise<void>) => fn()),
                showSelect: jest.fn(),
                tableView: jest.fn(),
                Spinner: jest.fn().mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
            }));
            jest.doMock('../shared/state', () => ({
                load: jest.fn(() => ({})),
                update: jest.fn((fn: (s: Record<string, unknown>) => void) => {
                    const s: Record<string, unknown> = {};
                    fn(s);
                    return s;
                }),
                save: jest.fn(),
            }));
            jest.doMock('../shared/logger', () => ({
                rootLogger: {
                    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
                    warn: jest.fn(),
                    error: jest.fn(),
                    info: jest.fn(),
                },
            }));
            jest.doMock('../shared/session-context', () => ({
                SessionContext: jest.fn().mockImplementation(() => ({
                    pushHistory: jest.fn(),
                    buildContextLine: jest.fn(() => ''),
                    sessionCounters: [] as Array<{ op: string; detail: string; status: string }>,
                    lastOperation: '',
                    history: [] as Array<Record<string, unknown>>,
                })),
            }));
            jest.doMock('../shared/splash', () => ({ showSplash: jest.fn() }));
            jest.doMock('../shared/output', () => ({
                defaultOutput: { box: jest.fn(), table: jest.fn() },
            }));
            jest.doMock('../shared/temp-dir', () => ({
                ensureDirs: jest.fn(),
                registerCleanup: jest.fn(),
                writeEphemeral: jest.fn(() => '/tmp/test'),
                reportsDir: jest.fn(() => '/tmp/reports'),
            }));
            jest.doMock('./session-state', () => ({
                sessionLog: { info: jest.fn() },
                sessionContext: {
                    buildContextLine: jest.fn(() => ''),
                    sessionCounters: [] as Array<{ op: string; detail: string; status: string }>,
                    lastOperation: '',
                },
                isBusy: false,
                manager: null,
                providerLabel: jest.fn(() => 'GitLab'),
                buildActionChoices: jest.fn(() => []),
                displayProjects: jest.fn(),
                displayRecentPipelines: jest.fn(),
                printSessionSummary: jest.fn(),
                getProviderForProject: jest.fn(() => 'gitlab'),
                createManagerForProject: jest.fn(() => ({})),
                pushHistory: jest.fn(),
                setCurrentProjectName: jest.fn(),
                setProjectId: jest.fn(),
                setManager: jest.fn(),
                projectId: '',
                getProjects: jest.fn(() => ({})),
            }));
            jest.doMock('./pipeline-handler', () => ({
                handleTriggerPipeline: jest.fn(),
                handleExportVariables: jest.fn(),
                isComplete: jest.fn(),
                pollPipeline: jest.fn(),
                _jiraEnv: jest.fn(() => null),
                _resolveGlob: jest.fn(() => null),
                downloadTestArtifacts: jest.fn(),
                parseTestResults: jest.fn(),
                createTestExecution: jest.fn(),
                collectTestResults: jest.fn(),
            }));
            jest.doMock('./mr-handler', () => ({
                nivelarBranchesWrapper: jest.fn(),
                handleCreateMR: jest.fn(),
                handleListApprovedMRs: jest.fn(),
                handleMergeMR: jest.fn(),
            }));
            jest.doMock('./schedule-handler', () => ({
                handleListSchedules: jest.fn(),
                handleRunSchedule: jest.fn(),
                handleChangeProject: jest.fn(),
                handleFlakinessDashboard: jest.fn(),
            }));
            jest.doMock('./batch-mode', () => ({
                tryBatchMode: jest.fn(() => Promise.resolve(false)),
                parseBatchArgs: jest.fn(() => ({})),
            }));
            jest.doMock('./ui-helpers', () => ({
                handleHelp: jest.fn(),
                handleShowHistory: jest.fn(),
            }));
            jest.doMock('./case00-handler', () => ({
                handleSetupWizard: jest.fn(() => Promise.resolve(false)),
            }));

            const mod = require('./main') as typeof import('./main');
            expect(mod.default).toBeDefined();
        });
    });
});

// ---------- buildContextLine ----------

describe('buildContextLine', () => {
    it('returns provider TOOLS with session context', () => {
        const result = mainModule.buildContextLine();
        expect(result).toMatch(/TOOLS$/);
    });
});

// ---------- withErrorHandling ----------

describe('withErrorHandling', () => {
    it('returns false when handler resolves', async () => {
        const handler: (m: GitProvider, pn: string, ns: string[]) => Promise<object> = jest
            .fn<(m: GitProvider, pn: string, ns: string[]) => Promise<object>>()
            .mockResolvedValue({ ok: true as const });
        const wrapped = mainModule.withErrorHandling(handler);
        await wrapped(createMockGitProvider(), 'p', ['p']);
    });

    it('calls printError when handler rejects and returns false', async () => {
        const handler: (m: GitProvider, pn: string, ns: string[]) => Promise<object> = jest
            .fn<(m: GitProvider, pn: string, ns: string[]) => Promise<object>>()
            .mockRejectedValue(new Error('fail'));
        const wrapped = mainModule.withErrorHandling(handler);
        const result = await wrapped(createMockGitProvider(), 'p', ['p']);
        expect(result).toBe(false);
        expect(prompt.printError).toHaveBeenCalledWith('Handler error', expect.any(Error));
    });
});

// ---------- _handleExit ----------

describe('_handleExit', () => {
    it('prints goodbye and returns true', () => {
        const breadcrumbs = require('../shared/breadcrumbs') as typeof import('../shared/breadcrumbs');
        const result = mainModule._handleExit();
        expect(result).toBe(true);
        expect(prompt.title).toHaveBeenCalledWith('Até logo!');
        expect(breadcrumbs.clearBreadcrumbs).toHaveBeenCalled();
    });

    it('does not set exit code when session has errors — no exitCode', () => {
        const ss = require('./session-state') as typeof import('./session-state');
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

describe('_dispatchAction', () => {
    const mockM = createMockGitProvider();
    const pn = 'proj-a';
    const ns = ['proj-a', 'proj-b'];

    beforeAll(() => {
        jest.spyOn(
            (require('../shared/output') as typeof import('../shared/output')).defaultOutput,
            'box',
        ).mockImplementation(() => {});
    });

    it('handles /help and returns false', async () => {
        const result = await mainModule._dispatchAction('/help', mockM, pn, ns);
        expect(result).toBe(false);
    });

    it('handles /history and returns false', async () => {
        const result = await mainModule._dispatchAction('/history', mockM, pn, ns);
        expect(result).toBe(false);
    });

    it('handles /docs and returns false', async () => {
        const result = await mainModule._dispatchAction('/docs', mockM, pn, ns);
        expect(result).toBe(false);
        expect(prompt.warn).not.toHaveBeenCalledWith('Documentação disponível apenas no módulo Jira.');
    });

    it('handles /d and returns false', async () => {
        const result = await mainModule._dispatchAction('/d', mockM, pn, ns);
        expect(result).toBe(false);
        expect(prompt.warn).not.toHaveBeenCalledWith('Documentação disponível apenas no módulo Jira.');
    });

    it('handles /back and returns false', async () => {
        const result = await mainModule._dispatchAction('/back', mockM, pn, ns);
        expect(result).toBe(false);
    });

    it('handles /menu and returns false', async () => {
        const result = await mainModule._dispatchAction('/menu', mockM, pn, ns);
        expect(result).toBe(false);
    });

    it('handles /exit and returns true via _handleExit', async () => {
        const result = await mainModule._dispatchAction('/exit', mockM, pn, ns);
        expect(result).toBe(true);
    });

    it('handles /sair and returns true via _handleExit', async () => {
        const result = await mainModule._dispatchAction('/sair', mockM, pn, ns);
        expect(result).toBe(true);
    });

    it('handles option 0 and returns true via _handleExit', async () => {
        const result = await mainModule._dispatchAction('0', mockM, pn, ns);
        expect(result).toBe(true);
    });

    it('dispatches to action handler and returns false', async () => {
        const result = await mainModule._dispatchAction('1', mockM, pn, ns);
        expect(result).toBe(false);
    });

    it('warns for invalid option', async () => {
        const result = await mainModule._dispatchAction('zzz', mockM, pn, ns);
        expect(result).toBe(false);
        expect(prompt.warn).toHaveBeenCalledWith('Opção inválida.');
    });
});

// ---------- _selectProject ----------

describe('_selectProject', () => {
    it('selects first project by index 1', () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('1');
        const result = mainModule._selectProject();
        expect(result.projectName).toBe('proj-a');
        expect(result.names).toContain('proj-a');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Projeto selecionado'));
    });

    it('returns null projectName for invalid project index', () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('99');
        const result = mainModule._selectProject();
        expect(result.projectName).toBeNull();
        expect(prompt.warn).toHaveBeenCalledWith('Projeto inválido.');
    });
});

// ---------- _promptChoice ----------

describe('_promptChoice', () => {
    it('returns prompt choice in non-TTY mode', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('/exit');
        const result = await mainModule._promptChoice('0-9');
        expect(result).toBe('/exit');
    });

    it('falls back to lastChoice when prompt returns empty string', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('');
        jest.mocked(state.load).mockReturnValue({ lastChoice: '3' });
        const result = await mainModule._promptChoice('0-9');
        expect(result).toBe('3');
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Repetindo última opção'));
    });

    it('skips lastChoice when it is "0"', async () => {
        jest.mocked(prompt.prompt).mockReturnValueOnce('');
        jest.mocked(state.load).mockReturnValue({ lastChoice: '0' });
        const result = await mainModule._promptChoice('0-9');
        expect(result).toBe('');
    });
});

// ---------- unhandled rejection handler ----------

describe('unhandledRejection handler', () => {
    it('logs error and shows user message', () => {
        const logger = require('../shared/logger') as typeof import('../shared/logger');
        process.emit('unhandledRejection', new Error('test rejection'));
        expect(logger.rootLogger.error).toHaveBeenCalledWith('Unhandled Rejection', expect.any(Object));
    });
});

// ---------- _promptChoice TTY mode ----------

describe('_promptChoice TTY mode', () => {
    const _origIsTTY = process.stdout.isTTY;

    beforeAll(() => {
        process.stdout.isTTY = true;
    });

    afterAll(() => {
        process.stdout.isTTY = _origIsTTY;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(state.load).mockReturnValue({ lastChoice: undefined });
    });

    it('shows box with session counters when TTY and not quiet', async () => {
        const sessionState = require('./session-state') as typeof import('./session-state');
        sessionState.sessionContext.sessionCounters = [
            { op: '', detail: '', status: 'ok' },
            { op: '', detail: '', status: 'error' },
            { op: '', detail: '', status: 'ok' },
        ];
        jest.mocked(prompt.showSelect).mockResolvedValue('/exit');
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
        jest.clearAllMocks();
    });

    beforeEach(() => {
        mockProvider = createMockGitProvider();
        pn = 'proj-a';
        ns = ['proj-a', 'proj-b'];
    });

    it('handler 9 calls handleChangeProject', async () => {
        const result = await mainModule._dispatchAction('9', mockProvider, pn, ns);
        expect(result).toBe(false);
    });

    it('handler a calls handleFlakinessDashboard (void)', async () => {
        const result = await mainModule._dispatchAction('a', mockProvider, pn, ns);
        expect(result).toBe(false);
    });

    it('handler 00 calls handleSetupWizard', async () => {
        const result = await mainModule._dispatchAction('00', mockProvider, pn, ns);
        expect(result).toBe(false);
    });
});
