vi.mock('../shared/prompt', () => {
    const mockConfirm = vi.fn();
    return {
        print: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        title: vi.fn(),
        prompt: vi.fn(),
        confirm: mockConfirm,
        printError: vi.fn(),
        error: vi.fn(),
        withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    };
});

vi.mock('./session-state', () => ({
    currentProvider: 'gitlab',
    pushHistory: vi.fn(),
    setIsBusy: vi.fn(),
    MSG_OPERATION_CANCELED: 'Operação cancelada.',
}));

vi.mock('../shared/state', () => ({
    load: vi.fn(() => ({})),
    update: vi.fn((fn: (s: Record<string, unknown>) => void) => {
        const s: Record<string, unknown> = {};
        fn(s);
        return s;
    }),
}));

vi.mock('../shared/http-client', () => ({ sleep: vi.fn() }));
vi.mock('../shared/git-sha.js', () => ({
    getHeadSha: vi.fn().mockReturnValue('pipeline-sha-999'),
    getCurrentBranch: vi.fn().mockReturnValue('main'),
    detectGitDir: vi.fn().mockReturnValue('/project'),
}));
vi.mock('../shared/store-backend.js', () => ({
    detectStoreBackend: vi.fn(),
    detectProjectGitDir: vi.fn().mockReturnValue('/project'),
}));
vi.mock('../shared/store.js', () => {
    function makeMockStore() {
        return {
            lookup: vi.fn(),
            put: vi.fn(),
            listByProject: vi.fn().mockReturnValue([]),
            saveReport: vi.fn(),
            loadReport: vi.fn(),
            loadMetrics: vi.fn(),
            saveMetrics: vi.fn(),
            appendBranch: vi.fn(),
            getBranch: vi.fn().mockReturnValue([]),
            flush: vi.fn(),
        };
    }
    return {
        Store: vi.fn(function () {
            return makeMockStore();
        }),
    };
});

vi.mock('../shared/config', () => ({
    __esModule: true,
    default: {
        jiraProject: 'TEST',
        get: vi.fn((key: string) => process.env[key] || undefined),
    },
}));

vi.mock('./test-results', () => ({
    collectTestResults: vi.fn(),
    createTestExecution: vi.fn(),
    _jiraEnv: vi.fn(() => ({ base: 'https://jira.com', token: 'tok', xray: 'xray', mode: 'server' })),
    _resolveGlob: vi.fn(),
    downloadTestArtifacts: vi.fn(),
    parseTestResults: vi.fn(),
}));

vi.mock('./llm-pipeline', () => ({
    offerPipelineFailureAnalysis: vi.fn(),
}));

vi.mock('../shared/bug-report', () => ({
    collectAutomated: vi.fn(() => ({ description: '', title: 'Bug', severity: 'major' })),
    fileToJira: vi.fn(() => 'BUG-1'),
}));

vi.mock('../shared/jira-client', () => ({
    __esModule: true,
    default: vi.fn(function () {
        return {
            postJiraResource: vi.fn().mockResolvedValue({ key: 'BUG-1' }),
        };
    }),
}));

import { success, warn, info, prompt, confirm, printError } from '../shared/prompt.js';
import { pushHistory, setIsBusy, MSG_OPERATION_CANCELED } from './session-state.js';
import {
    isComplete,
    pollPipeline,
    handleTriggerPipeline,
    handleExportVariables,
    parseTestResults,
    createTestExecution,
    downloadTestArtifacts,
    collectTestResults,
} from './pipeline-handler.js';
import type JiraClient from '../shared/jira-client.js';
import type JiraLinkManager from '../jira_management/jira_link_manager.js';
import type { AnalysisReport } from '../shared/failure-analysis.js';
import type { ParseResult } from '../shared/result_parser.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import * as testResultsModule from './test-results.js';
import * as stateModule from '../shared/state.js';
import * as llmModule from './llm-pipeline.js';
import * as bugReportModule from '../shared/bug-report.js';

const mockPrompt = vi.mocked(prompt);
const mockConfirm = vi.mocked(confirm);
const mockPrintError = vi.mocked(printError);
const mockInfo = vi.mocked(info);
const mockWarn = vi.mocked(warn);
const mockSuccess = vi.mocked(success);
const mockPushHistory = vi.mocked(pushHistory);

const mockM = createMockGitProvider();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('IsComplete', () => {
    it('returns true for terminal statuses', () => {
        expect(isComplete('success')).toBeTruthy();
        expect(isComplete('failed')).toBeTruthy();
        expect(isComplete('canceled')).toBeTruthy();
        expect(isComplete('skipped')).toBeTruthy();
    });

    it('returns false for pending statuses', () => {
        expect(isComplete('pending')).toBeFalsy();
        expect(isComplete('running')).toBeFalsy();
        expect(isComplete('')).toBeFalsy();
    });
});

describe('PollPipeline', () => {
    it('returns completed status when pipeline finishes', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });

        const result = await pollPipeline(mockM, '1', 100, 10000);

        expect(result).toStrictEqual({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });
    });

    it('continues polling when pipeline returns null', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'getPipeline')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });

        const result = await pollPipeline(mockM, '1', 100, 10000);

        expect(result.status).toBe('success');
    });

    it('returns timeout when pipeline does not complete', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({ status: 'running', web_url: '' });

        const result = await pollPipeline(mockM, '1', 50, 0);

        expect(result).toStrictEqual({ status: 'timeout', web_url: '' });
    });

    it('handles missing status/state and web_url', async () => {expect.hasAssertions();

        let callCount = 0;
        vi.spyOn(mockM, 'getPipeline').mockImplementation(async () => {
            await Promise.resolve();
            callCount++;
            if (callCount === 1) return { web_url: '' };
            return { status: 'success', web_url: 'https://gitlab.com/pipe/1' };
        });
        const result = await pollPipeline(mockM, '1', 100, 10000);

        expect(result.status).toBe('success');
    });
});

describe('HandleTriggerPipeline', () => {
    it('prompts for branch and triggers pipeline', async () => {expect.hasAssertions();

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValue(false); // Aguardar conclusao?
        mockPrompt.mockReturnValue('main');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockM, 'triggerPipeline').mockResolvedValue({ id: '42', web_url: 'https://gitlab.com/pipe/42' });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrompt).toHaveBeenCalledWith('Branch para disparar pipeline');
        expect(mockM.triggerPipeline).toHaveBeenCalledWith();
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/pipe/42'));
    });

    it('warns when branch not found', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('unknown-branch');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue(null);

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
        expect(mockPushHistory).toHaveBeenCalledWith('pipeline', expect.stringContaining('branch-not-found'), 'error');
    });

    it('handles trigger error', async () => {expect.hasAssertions();

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true); // Confirmar disparo?
        mockPrompt.mockReturnValue('main');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockM, 'triggerPipeline').mockRejectedValue(new Error('API fail'));

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalledWith();
        expect(mockPushHistory).toHaveBeenCalledWith('pipeline', 'main', 'error');
    });

    it('resumes pending pipeline when confirmed', async () => {expect.hasAssertions();

        const mockLoad = vi.spyOn(stateModule, 'load');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/99',
        });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Retomando'));
        expect(mockM.getPipeline).toHaveBeenCalledWith('99');
    });

    it('resumes pending pipeline with failed status triggers quick-merge early return', async () => {expect.hasAssertions();

        const mockLoad = vi.spyOn(stateModule, 'load');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({
            status: 'failed',
            web_url: '',
        });

        await handleTriggerPipeline(mockM, 'my-project');

        // icon uses '\u2717' branch since status !== 'success'
        // handleQuickMerge is called with pollStatus='failed' and returns early
        expect(mockPushHistory).not.toHaveBeenCalledWith(expect.stringContaining('quick-mr'));
    });

    it('resumes pending pipeline with canceled status skips post-pipeline', async () => {expect.hasAssertions();

        const mockLoad = vi.spyOn(stateModule, 'load');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm.mockReturnValueOnce(true); // Continuar deste ponto?
        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({
            status: 'canceled',
            web_url: '',
        });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('resumes pending pipeline with undefined branch', async () => {expect.hasAssertions();

        const mockLoad = vi.spyOn(stateModule, 'load');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { pipelineId: '77', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/77',
        });

        await handleTriggerPipeline(mockM, 'my-project');

        // pending.branch is undefined → branch = '' (covers L954)
        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Retomando'));
    });
});

describe('HandleExportVariables', () => {
    it('exports variables when confirmed', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValue(true);
        vi.spyOn(mockM, 'getCICDVariables').mockResolvedValue([
            { key: 'VAR1', value: 'val1' },
            { key: 'VAR2', value: 'val2' },
        ]);

        await handleExportVariables(mockM);

        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('2'));
        expect(mockPushHistory).toHaveBeenCalledWith('export-vars', '2 variáveis', 'ok');
    });

    it('cancels when not confirmed', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValue(false);

        await handleExportVariables(mockM);

        expect(mockWarn).toHaveBeenCalledWith(MSG_OPERATION_CANCELED);
        expect(mockM.getCICDVariables).not.toHaveBeenCalled();
    });

    it('handles fetch error', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValue(true);
        vi.spyOn(mockM, 'getCICDVariables').mockRejectedValue(new Error('fetch fail'));

        await handleExportVariables(mockM);

        expect(mockPrintError).toHaveBeenCalledWith();
        expect(mockPushHistory).toHaveBeenCalledWith('export-vars', 'erro', 'error');
    });

    it('handles null variables', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValue(true);
        vi.spyOn(mockM, 'getCICDVariables').mockResolvedValue(null);

        await handleExportVariables(mockM);

        expect(mockSuccess).not.toHaveBeenCalledWith(expect.stringContaining('Variáveis exportadas'));
    });

    it('handles empty variable value', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValue(true);
        vi.spyOn(mockM, 'getCICDVariables').mockResolvedValue([
            { key: 'VAR1', value: '' },
            { key: 'VAR2', value: 'val2' },
        ]);

        await handleExportVariables(mockM);

        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('2'));
    });
});

// ---------- parseTestResults delegation ----------

describe('ParseTestResults', () => {
    it('delegates to test-results parseTestResults', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'parseTestResults').mockResolvedValue({
            matched: [],
            unmatched: [],
            csvName: 'test',
        });
        const result = await parseTestResults({
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 0 },
            tests: [],
        });

        expect(result).toStrictEqual({ matched: [], unmatched: [], csvName: 'test' });
    });

    it('returns null when delegate returns null', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'parseTestResults').mockResolvedValue(null);
        const result = await parseTestResults({
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            tests: [],
        });

        expect(result).toBeNull();
    });
});

// ---------- createTestExecution delegation ----------

describe('CreateTestExecution', () => {
    it('delegates to test-results createTestExecution', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'createTestExecution').mockResolvedValue(undefined);
        const jiraResource = {} as JiraClient;
        const linkManager = {} as JiraLinkManager;

        await expect(
            createTestExecution({
                matched: [],
                csvName: 'csv',
                projectName: 'proj',
                pipelineId: '1',
                branch: 'main',
                jiraResource,
                linkManager,
                jiraBaseUrl: '',
                currentProvider: 'github' as const,
                pushHistory: vi.fn(),
            }),
        ).resolves.toBeUndefined();
        expect(testResults.createTestExecution).toHaveBeenCalledWith();
    });
});

// ---------- downloadTestArtifacts delegation ----------

describe('DownloadTestArtifacts', () => {
    it('delegates to test-results downloadTestArtifacts', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'downloadTestArtifacts').mockResolvedValue(null);
        const result = await downloadTestArtifacts(mockM, '1');

        expect(result).toBeNull();
        expect(testResults.downloadTestArtifacts).toHaveBeenCalledWith(mockM, '1');
    });
});

// ---------- collectTestResults delegation ----------

describe('CollectTestResults', () => {
    it('delegates to test-results collectTestResults', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'collectTestResults').mockResolvedValue(null);
        const jiraResource = {} as JiraClient;
        const linkManager = {} as JiraLinkManager;
        const result = await collectTestResults(mockM, '1', 'main', 'proj', {
            jiraResource,
            linkManager,
            jiraBaseUrl: '',
        });

        expect(result).toBeNull();
    });
});

// ---------- buildPipelinePayload cancel ----------

describe('BuildPipelinePayload cancel', () => {
    it('cancels when user declines trigger confirmation', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('main');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(false); // Confirmar disparo?

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockWarn).toHaveBeenCalledWith(MSG_OPERATION_CANCELED);
    });
});

// ---------- triggerAndPollPipeline with full flow ----------

describe('TriggerAndPollPipeline full flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrompt.mockReturnValue('main');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockM, 'triggerPipeline').mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/42',
        });
        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1',
            iid: '1',
        });
        vi.spyOn(mockM, 'acceptMergeRequest').mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1/merge',
        });
    });

    it('completes full pipeline flow with bug creation and quick merge', async () => {expect.hasAssertions();

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true) // Criar bug no Jira?
            .mockReturnValueOnce(true) // Criar merge request?
            .mockReturnValueOnce(true); // Fazer merge agora?

        // Make collectTestResults return a parsed result
        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'collectTestResults').mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1, total: 7, duration: 100 },
            tests: [
                { title: 'test-1', state: 'failed', duration: 0 },
                { title: 'test-2', state: 'passed', duration: 0 },
            ],
        });

        // Make offerPipelineFailureAnalysis call the callback
        const llmPipeline = vi.mocked(llmModule);
        vi.spyOn(llmPipeline, 'offerPipelineFailureAnalysis').mockImplementation(
            (_parsed: ParseResult, onAnalysis?: (report: AnalysisReport) => Promise<void>) => {
                if (onAnalysis)
                    return onAnalysis({ content: 'analysis result', confidence: 'high', fallbackUsed: false });
                return Promise.resolve();
            },
        );

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/pipe/42'));
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Bug criado'));
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('MR criado'));
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Merge realizado'));
        expect(mockPushHistory).toHaveBeenCalledWith('pipeline', 'main', 'ok');
        expect(mockPushHistory).toHaveBeenCalledWith('create-jira-issue', 'BUG-1', 'ok');
        expect(mockPushHistory).toHaveBeenCalledWith('quick-mr', 'main->main', 'ok');
        expect(mockPushHistory).toHaveBeenCalledWith('quick-merge', '1', 'ok');
    });

    it('handles bug creation error', async () => {expect.hasAssertions();

        const bugReport = vi.mocked(bugReportModule);
        vi.spyOn(bugReport, 'fileToJira').mockRejectedValue(new Error('Jira API error'));

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true) // Criar bug no Jira?
            .mockReturnValueOnce(false); // Não criar merge request (padrão)

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'collectTestResults').mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1, total: 7, duration: 100 },
            tests: [
                { title: 'test-1', state: 'failed', duration: 0 },
                { title: 'test-2', state: 'passed', duration: 0 },
            ],
        });

        const llmPipeline = vi.mocked(llmModule);
        vi.spyOn(llmPipeline, 'offerPipelineFailureAnalysis').mockImplementation(
            (_parsed: ParseResult, onAnalysis?: (report: AnalysisReport) => Promise<void>) => {
                if (onAnalysis)
                    return onAnalysis({ content: 'analysis result', confidence: 'high', fallbackUsed: false });
                return Promise.resolve();
            },
        );

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalledWith('Falha ao criar bug no Jira', expect.any(Error));
        expect(mockPushHistory).toHaveBeenCalledWith('create-jira-issue', '42', 'error');
    });

    it('handles quick merge creation error', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'createMergeRequest').mockRejectedValue(new Error('Merge create error'));

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(false) // Não coletar resultados (para simplificar)
            .mockReturnValueOnce(true); // Criar merge request?

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalledWith('Falha ao criar MR', expect.any(Error));
        expect(mockPushHistory).toHaveBeenCalledWith('quick-mr', 'main->main', 'error');
    });

    it('handles merge acceptance error', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1',
            iid: '1',
        });
        vi.spyOn(mockM, 'acceptMergeRequest').mockRejectedValue(new Error('Merge accept error'));

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(false) // Não coletar resultados
            .mockReturnValueOnce(true) // Criar merge request?
            .mockReturnValueOnce(true); // Fazer merge agora?

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalledWith('Falha ao fazer merge', expect.any(Error));
        expect(mockPushHistory).toHaveBeenCalledWith('quick-merge', '1', 'error');
    });

    it('skips empty variable keys during payload build', async () => {expect.hasAssertions();

        mockPrompt
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce('=bad,good=val'); // variables input
        mockConfirm
            .mockReturnValueOnce(true) // Adicionar variáveis? yes
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(false); // Aguardar conclusao?
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockM, 'triggerPipeline').mockResolvedValue({ id: '42', web_url: 'https://gitlab.com/pipe/42' });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockM.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: [{ key: 'good', value: 'val' }],
            }),
        );
    });

    it('skips bug creation when jira env is null', async () => {expect.hasAssertions();

        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, '_jiraEnv').mockReturnValueOnce(null);
        const testResults2 = vi.mocked(testResultsModule);
        vi.spyOn(testResults2, 'collectTestResults').mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1, total: 7, duration: 100 },
            tests: [
                { title: 'test-1', state: 'failed', duration: 0 },
                { title: 'test-2', state: 'passed', duration: 0 },
            ],
        });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(false); // Não criar merge request

        await handleTriggerPipeline(mockM, 'my-project');
        // handleBugCreation called, but _jiraEnv returns null → early return
        const bugReport = vi.mocked(bugReportModule);

        expect(bugReport.fileToJira).not.toHaveBeenCalled();
    });

    it('triggers pipeline with canceled status skips post-pipeline', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'getPipeline').mockResolvedValue({ status: 'canceled', web_url: '' });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true); // Aguardar conclusao?

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('✗'));
    });

    it('handles pipelineResult being null from triggerPipeline', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'triggerPipeline').mockResolvedValue(undefined);
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true); // Confirmar disparo?

        await handleTriggerPipeline(mockM, 'my-project');

        // pipelineResult is null → the if(pipelineResult) block skipped (L1026)
        // then !pipelineResult is true → early return
        expect(setIsBusy).not.toHaveBeenCalled();
    });

    it('creates merge request returning null', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue(null);
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true); // Criar bug no Jira?
        const testResults = vi.mocked(testResultsModule);
        vi.spyOn(testResults, 'collectTestResults').mockResolvedValue({
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            tests: [],
        });

        await handleTriggerPipeline(mockM, 'my-project');

        // Mr is null → if(mr) else path (L885)
        expect(mockM.acceptMergeRequest).not.toHaveBeenCalled();
    });

    it('accepts merge returning null', async () => {expect.hasAssertions();

        vi.spyOn(mockM, 'acceptMergeRequest').mockResolvedValue(null);
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(false) // Não coletar resultados
            .mockReturnValueOnce(true) // Criar merge request?
            .mockReturnValueOnce(true); // Fazer merge agora?

        await handleTriggerPipeline(mockM, 'my-project');

        // mergeResult is null → if(mergeResult) else path (L902)
        expect(mockSuccess).not.toHaveBeenCalledWith(expect.stringContaining('Merge realizado'));
    });

    it('declines merge when user says no to merge now', async () => {expect.hasAssertions();

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(false) // Coletar resultados?
            .mockReturnValueOnce(true) // Criar merge request?
            .mockReturnValueOnce(false); // Fazer merge agora? → NO!
        // All 6 Once values consumed, no leftover pollution

        await handleTriggerPipeline(mockM, 'my-project');

        // tryAcceptMerge called, confirm returns false → early return (L142)
        expect(mockM.acceptMergeRequest).not.toHaveBeenCalled();
    });
});

// ---------- triggerPipeline with missing ID ----------

describe('TriggerPipeline missing id', () => {
    it('returns early when pipeline result has no id', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('main');
        vi.spyOn(mockM, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockM, 'triggerPipeline').mockResolvedValue({
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true); // Aguardar conclusao?

        await handleTriggerPipeline(mockM, 'my-project');

        // Should not have called setIsBusy (early return before polling)
        expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Aguardando'));
    });
});

// ---------- resume pipeline decline ----------

describe('ResumePendingPipeline decline', () => {
    it('deletes pending state when user declines resume', async () => {expect.hasAssertions();

        const state = vi.mocked(stateModule);
        vi.spyOn(state, 'load').mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm.mockReturnValue(false); // Continuar deste ponto? → não

        await handleTriggerPipeline(mockM, 'my-project');

        expect(state.update).toHaveBeenCalledWith();
        // After decline, should continue to buildPipelinePayload
        expect(mockPrompt).toHaveBeenCalledWith('Branch para disparar pipeline');
    });
});
