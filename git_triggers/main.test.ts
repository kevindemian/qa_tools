import { jest } from '@jest/globals';
import fs from 'fs';
import type { GitProvider } from '../shared/types';
import * as prompt from '../shared/prompt';
import * as state from '../shared/state';
import * as nivelar from './nivelar';
import * as cliBase from '../shared/cli_base';

const _realReadFileSync = fs.readFileSync.bind(fs);

jest.mock('../shared/config', () => {
    const cfg: Record<string, unknown> = {
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
    withSpinner: jest.fn((_label: string, fn: () => Promise<unknown>) => fn()),
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
        sessionCounters: [] as Array<{ status: string }>,
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
    parseMochawesome: jest.fn(),
}));

jest.mock('../jira_management/result_reporter', () => ({
    matchResultsToTests: jest.fn(() => ({ matched: [], unmatched: [] })),
    createTestExecutionFromResults: jest.fn(),
}));

jest.mock('../shared/http-client', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sleep: jest.fn<any>(async () => {}),
}));

jest.mock('../jira_management/jira_resource', () => ({
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

type MainModule = typeof import('./main');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globSyncMock = jest.fn<any>().mockReturnValue([]);
jest.mock('glob', () => ({ sync: globSyncMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockProvider: Record<string, jest.Mock<any>> = {
    getSchedules: jest.fn(),
    runSchedule: jest.fn(),
    createMergeRequest: jest.fn(),
    searchMergeRequests: jest.fn(),
    isApproved: jest.fn(),
    acceptMergeRequest: jest.fn(),
    getCICDVariables: jest.fn(),
    getPipeline: jest.fn(),
    triggerPipeline: jest.fn(),
    getRecentPipelines: jest.fn(),
    getBranch: jest.fn(),
    listPipelineArtifacts: jest.fn(),
    downloadArtifact: jest.fn(),
};

let mainModule: MainModule;

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(fs, 'readFileSync').mockImplementation(((p: any) => {
        if (p.includes('providers.json')) return '{"proj-a":{"provider":"github"},"proj-b":{}}';
        if (p.includes('projects.json')) return '{"proj-a":"111","proj-b":"222"}';

        return _realReadFileSync(p, 'utf8');
    }) as typeof fs.readFileSync);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    mainModule = require('./main') as MainModule;
});

afterAll(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    (prompt.prompt as jest.Mock).mockReturnValue('0');
    (prompt.confirm as jest.Mock).mockReturnValue(false);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockGetPipeline = jest.fn<any>();

    beforeEach(() => {
        mockGetPipeline.mockReset();
    });

    it('returns status when pipeline completes', async () => {
        mockGetPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        const m = { getPipeline: mockGetPipeline } as unknown as GitProvider;
        const result = await mainModule.pollPipeline(m, '1', 1, 1000);
        expect(result).toEqual({ status: 'success', web_url: 'https://pipe/1' });
    });

    it('returns timeout when pipeline never completes', async () => {
        mockGetPipeline.mockResolvedValue({ status: 'running' });
        const m = { getPipeline: mockGetPipeline } as unknown as GitProvider;
        const result = await mainModule.pollPipeline(m, '1', 1, 50);
        expect(result).toEqual({ status: 'timeout', web_url: '' });
    });

    it('reads state field when status is absent', async () => {
        mockGetPipeline.mockResolvedValue({ state: 'success', web_url: 'https://pipe/2' });
        const m = { getPipeline: mockGetPipeline } as unknown as GitProvider;
        const result = await mainModule.pollPipeline(m, '2', 1, 1000);
        expect(result).toEqual({ status: 'success', web_url: 'https://pipe/2' });
    });

    it('handles null getPipeline response', async () => {
        mockGetPipeline.mockResolvedValue(null);
        const m = { getPipeline: mockGetPipeline } as unknown as GitProvider;
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
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('creates MR and shows success', async () => {
        (prompt.prompt as jest.Mock)
            .mockReturnValueOnce('feature-x')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('My MR')
            .mockReturnValueOnce('Description');
        mockProvider.createMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/1' });

        await mainModule.handleCreateMR(ctx as never, mockProvider as unknown as GitProvider);

        expect(mockProvider.createMergeRequest).toHaveBeenCalledWith('feature-x', 'main', 'My MR', 'Description');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/1'));
    });

    it('handles creation error', async () => {
        (prompt.prompt as jest.Mock)
            .mockReturnValueOnce('src')
            .mockReturnValueOnce('dst')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        mockProvider.createMergeRequest.mockRejectedValue(new Error('Conflict'));

        await mainModule.handleCreateMR(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao criar MR', expect.any(Error));
    });
});

// ---------- handleMergeMR ----------

describe('handleMergeMR', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('merges MR and shows success', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('42');
        mockProvider.acceptMergeRequest.mockResolvedValue({ web_url: 'https://gitlab/mr/42' });

        await mainModule.handleMergeMR(ctx as never, mockProvider as unknown as GitProvider);

        expect(mockProvider.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/mr/42'));
    });

    it('handles merge error', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('99');
        mockProvider.acceptMergeRequest.mockRejectedValue(new Error('Merge conflict'));

        await mainModule.handleMergeMR(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao fazer merge', expect.any(Error));
    });
});

// ---------- handleListSchedules ----------

describe('handleListSchedules', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('lists schedules when found', async () => {
        mockProvider.getSchedules.mockResolvedValue([{ id: '5', description: 'Nightly', next_run_at: '2026-01-01' }]);

        await mainModule.handleListSchedules(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Schedules encontrados'));
    });

    it('handles empty schedules', async () => {
        mockProvider.getSchedules.mockResolvedValue([]);

        await mainModule.handleListSchedules(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum schedule'));
    });

    it('calls printError when getSchedules throws', async () => {
        mockProvider.getSchedules.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListSchedules(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao listar schedules', expect.any(Error));
    });
});

// ---------- handleRunSchedule ----------

describe('handleRunSchedule', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('runs schedule on success', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('10');
        mockProvider.runSchedule.mockResolvedValue({ id: '10' });

        await mainModule.handleRunSchedule(ctx as never, mockProvider as unknown as GitProvider);

        expect(mockProvider.runSchedule).toHaveBeenCalledWith('10');
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('Schedule disparado'));
    });

    it('handles run error', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('bad-id');
        mockProvider.runSchedule.mockRejectedValue(new Error('Not found'));

        await mainModule.handleRunSchedule(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao disparar schedule', expect.any(Error));
    });
});

// ---------- handleListApprovedMRs ----------

describe('handleListApprovedMRs', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('lists approved MRs', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '1', title: 'Fix' }]);
        mockProvider.isApproved.mockResolvedValue(true);

        await mainModule.handleListApprovedMRs(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
    });

    it('warns when none approved', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockResolvedValue([{ iid: '2', title: 'WIP' }]);
        mockProvider.isApproved.mockResolvedValue(false);

        await mainModule.handleListApprovedMRs(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum'));
    });
});

// ---------- handleExportVariables ----------

describe('handleExportVariables', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('exports variables when confirmed', async () => {
        (prompt.confirm as jest.Mock).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'my_value' }]);
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

        await mainModule.handleExportVariables(ctx as never, mockProvider as unknown as GitProvider);

        expect(writeSpy).toHaveBeenCalled();
        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('MY_VAR'));
        writeSpy.mockRestore();
        unlinkSpy.mockRestore();
    });

    it('cancels when user declines', async () => {
        (prompt.confirm as jest.Mock).mockReturnValueOnce(false);

        await mainModule.handleExportVariables(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.warn).toHaveBeenCalledWith('Operação cancelada.');
    });
});

// ---------- handleHelp ----------

describe('handleHelp', () => {
    it('prints help box and prompts to continue', async () => {
        jest.spyOn(console, 'log').mockImplementationOnce(() => {});
        await mainModule.handleHelp();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Ajuda'));
        expect(prompt.ask).toHaveBeenCalledWith('Pressione Enter para continuar');
    });
});

// ---------- handleShowHistory ----------

describe('handleShowHistory', () => {
    it('shows history table when entries exist', async () => {
        (state.load as jest.Mock).mockReturnValueOnce({
            history: [{ op: 'pipeline', detail: 'main', status: 'ok', ts: '2026-01-01T00:00:00Z' }],
        });

        await mainModule.handleShowHistory();

        expect(prompt.title).toHaveBeenCalledWith('Histórico de operações');
        expect(prompt.tableView).toHaveBeenCalled();
    });

    it('warns when history is empty', async () => {
        (state.load as jest.Mock).mockReturnValueOnce({});

        await mainModule.handleShowHistory();

        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma operação registrada.');
    });
});

// ---------- nivelarBranchesWrapper ----------

describe('nivelarBranchesWrapper', () => {
    it('calls nivelarBranches with provider and pushHistory', async () => {
        const gitlab = { dummy: true } as unknown as GitProvider;
        await mainModule.nivelarBranchesWrapper(gitlab);
        expect(nivelar.nivelarBranches).toHaveBeenCalledWith(
            gitlab,
            expect.objectContaining({ pushHistory: expect.any(Function) }),
        );
    });
});

// ---------- downloadTestArtifacts ----------

describe('downloadTestArtifacts', () => {
    it('returns null when no artifacts found', async () => {
        mockProvider.listPipelineArtifacts.mockResolvedValue([]);
        const result = await mainModule.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');
        expect(result).toBeNull();
    });
});

// ---------- collectTestResults ----------

describe('collectTestResults', () => {
    it('returns early when jira env vars are missing', async () => {
        const result = await mainModule.collectTestResults(mockProvider as unknown as GitProvider, '1', 'main', 'proj');
        expect(result).toBeUndefined();
    });
});

// ---------- handleChangeProject ----------

describe('handleChangeProject', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('switches to valid project', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('1');

        await mainModule.handleChangeProject(ctx as never, mockProvider as unknown as GitProvider, [
            'proj-a',
            'proj-b',
        ]);

        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('proj-a'));
    });

    it('warns on invalid project index', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('99');

        await mainModule.handleChangeProject(ctx as never, mockProvider as unknown as GitProvider, ['proj-a']);

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

        await mainModule.displayRecentPipelines(mockProvider as unknown as GitProvider);

        expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining('Últimas pipelines'));
    });

    it('does not print when pipelines array is empty', async () => {
        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.displayRecentPipelines(mockProvider as unknown as GitProvider);

        expect(prompt.print).not.toHaveBeenCalledWith(expect.stringContaining('Últimas'));
    });

    it('silently catches getRecentPipelines error', async () => {
        mockProvider.getRecentPipelines.mockRejectedValue(new Error('API error'));

        await expect(
            mainModule.displayRecentPipelines(mockProvider as unknown as GitProvider),
        ).resolves.toBeUndefined();
    });
});

// ---------- handleListApprovedMRs - error ----------

describe('handleListApprovedMRs - error', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('calls printError when searchMergeRequests throws', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('opened');
        mockProvider.searchMergeRequests.mockRejectedValue(new Error('API fail'));

        await mainModule.handleListApprovedMRs(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith(expect.stringContaining('Erro ao listar'), expect.any(Error));
    });
});

// ---------- handleExportVariables - extended ----------

describe('handleExportVariables - extended', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('calls printError when getCICDVariables throws', async () => {
        (prompt.confirm as jest.Mock).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockRejectedValue(new Error('API fail'));

        await mainModule.handleExportVariables(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao buscar variáveis CI/CD', expect.any(Error));
    });

    it('escapes values containing = sign with double quotes', async () => {
        (prompt.confirm as jest.Mock).mockReturnValueOnce(true);
        mockProvider.getCICDVariables.mockResolvedValue([{ key: 'MY_VAR', value: 'foo=bar' }]);
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

        await mainModule.handleExportVariables(ctx as never, mockProvider as unknown as GitProvider);

        expect(prompt.print).toHaveBeenCalledWith('MY_VAR="foo=bar"');
        writeSpy.mockRestore();
        unlinkSpy.mockRestore();
    });
});

// ---------- pushHistory - trim ----------

describe('pushHistory - trim', () => {
    it('trims state history to last 50 entries', () => {
        mainModule.pushHistory('op', 'd', 'ok');
        const callback = (state.update as jest.Mock).mock.calls[0][0] as (s: Record<string, unknown>) => void;
        const testState = { history: Array(51).fill({}) };
        callback(testState);
        expect((testState.history as Array<unknown>).length).toBe(50);
    });
});

// ---------- handleTriggerPipeline ----------

describe('handleTriggerPipeline', () => {
    const ctx = { pushHistory: jest.fn(), sessionCounters: [], lastOperation: '' };

    it('warns when branch is not found', async () => {
        (prompt.prompt as jest.Mock).mockReturnValueOnce('bad-branch');
        mockProvider.getBranch.mockResolvedValue(null);

        await mainModule.handleTriggerPipeline(ctx as never, mockProvider as unknown as GitProvider, 'proj-b');

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
    });

    it('triggers pipeline successfully without waiting', async () => {
        (prompt.prompt as jest.Mock)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        (prompt.confirm as jest.Mock)
            .mockReturnValueOnce(false) // add variables = no
            .mockReturnValueOnce(true) // confirm trigger = yes
            .mockReturnValueOnce(false); // wait for completion = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockResolvedValue({ web_url: 'https://gitlab/pipe/1' });

        await mainModule.handleTriggerPipeline(ctx as never, mockProvider as unknown as GitProvider, 'proj-b');

        expect(mockProvider.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({ ref: 'main', variables: [] }),
        );
        expect(prompt.success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab/pipe/1'));
    });

    it('handles triggerPipeline error', async () => {
        (prompt.prompt as jest.Mock)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce(''); // workflow ID (empty = auto-detect, GitHub path)
        (prompt.confirm as jest.Mock)
            .mockReturnValueOnce(false) // add variables = no
            .mockReturnValueOnce(true); // confirm trigger = yes
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockRejectedValue(new Error('Trigger fail'));

        await mainModule.handleTriggerPipeline(ctx as never, mockProvider as unknown as GitProvider, 'proj-b');

        expect(prompt.printError).toHaveBeenCalledWith('Falha ao disparar pipeline', expect.any(Error));
    });

    it('triggers with custom variables', async () => {
        (prompt.prompt as jest.Mock)
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce('') // workflow ID (empty = auto-detect, GitHub path)
            .mockReturnValueOnce('VAR1=val1,VAR2=val2'); // variables
        (prompt.confirm as jest.Mock)
            .mockReturnValueOnce(true) // add variables = yes
            .mockReturnValueOnce(true) // confirm trigger = yes
            .mockReturnValueOnce(false); // wait = no
        mockProvider.getBranch.mockResolvedValue({ name: 'main' });
        mockProvider.triggerPipeline.mockResolvedValue({ web_url: 'https://gitlab/pipe/2' });

        await mainModule.handleTriggerPipeline(ctx as never, mockProvider as unknown as GitProvider, 'proj-b');

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
        (state.load as jest.Mock).mockReturnValueOnce({
            pendingPipeline: { branch: 'feature-x', pipelineId: '123', projectName: 'proj-b' },
        });
        (prompt.confirm as jest.Mock).mockReturnValueOnce(true); // confirm resume
        mockProvider.getPipeline.mockResolvedValue({ status: 'success', web_url: 'https://pipe/1' });
        mockProvider.getRecentPipelines.mockResolvedValue([]);

        await mainModule.handleTriggerPipeline(ctx as never, mockProvider as unknown as GitProvider, 'proj-b');

        expect(mockProvider.getPipeline).toHaveBeenCalledWith('123');
    });
});
