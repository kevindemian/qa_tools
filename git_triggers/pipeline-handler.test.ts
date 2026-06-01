jest.mock('../shared/prompt', () => {
    const mockConfirm = jest.fn();
    return {
        print: jest.fn(),
        success: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        title: jest.fn(),
        prompt: jest.fn(),
        confirm: mockConfirm,
        printError: jest.fn(),
        error: jest.fn(),
        withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    };
});

jest.mock('./session-state', () => ({
    currentProvider: 'gitlab',
    pushHistory: jest.fn(),
    setIsBusy: jest.fn(),
    MSG_OPERATION_CANCELED: 'Operação cancelada.',
}));

jest.mock('../shared/state', () => ({
    load: jest.fn(() => ({})),
    update: jest.fn((fn: (s: Record<string, unknown>) => void) => {
        const s: Record<string, unknown> = {};
        fn(s);
        return s;
    }),
}));

jest.mock('../shared/http-client', () => ({ sleep: jest.fn() }));

jest.mock('../shared/config', () => ({
    __esModule: true,
    default: {
        jiraProject: 'TEST',
        get: jest.fn((key: string) => process.env[key] || undefined),
    },
}));

jest.mock('./test-results', () => ({
    collectTestResults: jest.fn(),
    createTestExecution: jest.fn(),
    _jiraEnv: jest.fn(() => ({ base: 'https://jira.com', token: 'tok', xray: 'xray' })),
    _resolveGlob: jest.fn(),
    downloadTestArtifacts: jest.fn(),
    parseTestResults: jest.fn(),
}));

jest.mock('./llm-pipeline', () => ({
    offerPipelineFailureAnalysis: jest.fn(
        (_parsed: unknown, onAnalysis?: (r: { content: string }) => Promise<void>) => {
            if (onAnalysis) return onAnalysis({ content: 'test analysis' });
            return undefined;
        },
    ),
}));

jest.mock('../shared/bug-report', () => ({
    collectAutomated: jest.fn(() => ({ description: '', title: 'Bug', severity: 'major' })),
    fileToJira: jest.fn(() => 'BUG-1'),
}));

jest.mock('../shared/jira-client', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        postJiraResource: jest.fn().mockResolvedValue({ key: 'BUG-1' }),
    })),
}));

import { success, warn, info, prompt, confirm, printError } from '../shared/prompt';
import { pushHistory, setIsBusy, MSG_OPERATION_CANCELED } from './session-state';
import {
    isComplete,
    pollPipeline,
    handleTriggerPipeline,
    handleExportVariables,
    parseTestResults,
    createTestExecution,
    downloadTestArtifacts,
    collectTestResults,
} from './pipeline-handler';
import type { GitProvider } from '../shared/types';
import type JiraClient from '../shared/jira-client';
import type JiraLinkManager from '../jira_management/jira_link_manager';

const mockPrompt = prompt as jest.Mock;
const mockConfirm = confirm as jest.Mock;
const mockPrintError = printError as jest.Mock;
const mockInfo = info as jest.Mock;
const mockWarn = warn as jest.Mock;
const mockSuccess = success as jest.Mock;
const mockPushHistory = pushHistory as jest.Mock;

const mockM = {
    getPipeline: jest.fn(),
    getBranch: jest.fn(),
    triggerPipeline: jest.fn(),
    getCICDVariables: jest.fn(),
    createMergeRequest: jest.fn(),
    acceptMergeRequest: jest.fn(),
} as unknown as GitProvider;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('isComplete', () => {
    it('returns true for terminal statuses', () => {
        expect(isComplete('success')).toBe(true);
        expect(isComplete('failed')).toBe(true);
        expect(isComplete('canceled')).toBe(true);
        expect(isComplete('skipped')).toBe(true);
    });

    it('returns false for pending statuses', () => {
        expect(isComplete('pending')).toBe(false);
        expect(isComplete('running')).toBe(false);
        expect(isComplete('')).toBe(false);
    });
});

describe('pollPipeline', () => {
    it('returns completed status when pipeline finishes', async () => {
        (mockM.getPipeline as jest.Mock).mockResolvedValue({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });

        const result = await pollPipeline(mockM, '1', 100, 10000);
        expect(result).toEqual({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });
    });

    it('continues polling when pipeline returns null', async () => {
        (mockM.getPipeline as jest.Mock)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ status: 'success', web_url: 'https://gitlab.com/pipe/1' });

        const result = await pollPipeline(mockM, '1', 100, 10000);
        expect(result.status).toBe('success');
    });

    it('returns timeout when pipeline does not complete', async () => {
        (mockM.getPipeline as jest.Mock).mockResolvedValue({ status: 'running', web_url: '' });

        const result = await pollPipeline(mockM, '1', 50, 0);
        expect(result).toEqual({ status: 'timeout', web_url: '' });
    });

    it('handles missing status/state and web_url', async () => {
        let callCount = 0;
        (mockM.getPipeline as jest.Mock).mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { web_url: '' };
            return { status: 'success', web_url: 'https://gitlab.com/pipe/1' };
        });
        const result = await pollPipeline(mockM, '1', 100, 10000);
        expect(result.status).toBe('success');
    });
});

describe('handleTriggerPipeline', () => {
    it('prompts for branch and triggers pipeline', async () => {
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValue(false); // Aguardar conclusao?
        mockPrompt.mockReturnValue('main');
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockM.triggerPipeline as jest.Mock).mockResolvedValue({ id: '42', web_url: 'https://gitlab.com/pipe/42' });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrompt).toHaveBeenCalledWith('Branch para disparar pipeline');
        expect(mockM.triggerPipeline).toHaveBeenCalled();
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/pipe/42'));
    });

    it('warns when branch not found', async () => {
        mockPrompt.mockReturnValue('unknown-branch');
        (mockM.getBranch as jest.Mock).mockResolvedValue(null);

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
        expect(mockPushHistory).toHaveBeenCalledWith('pipeline', expect.stringContaining('branch-not-found'), 'error');
    });

    it('handles trigger error', async () => {
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true); // Confirmar disparo?
        mockPrompt.mockReturnValue('main');
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockM.triggerPipeline as jest.Mock).mockRejectedValue(new Error('API fail'));

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('pipeline', 'main', 'error');
    });

    it('resumes pending pipeline when confirmed', async () => {
        const { load: mockLoad } = require('../shared/state');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        (mockM.getPipeline as jest.Mock).mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/99',
        });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Retomando'));
        expect(mockM.getPipeline).toHaveBeenCalledWith('99');
    });

    it('resumes pending pipeline with failed status triggers quick-merge early return', async () => {
        const { load: mockLoad } = require('../shared/state');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        (mockM.getPipeline as jest.Mock).mockResolvedValue({
            status: 'failed',
            web_url: '',
        });

        await handleTriggerPipeline(mockM, 'my-project');
        // icon uses '\u2717' branch since status !== 'success'
        // handleQuickMerge is called with pollStatus='failed' and returns early
        expect(mockPushHistory).not.toHaveBeenCalledWith(expect.stringContaining('quick-mr'));
    });

    it('resumes pending pipeline with canceled status skips post-pipeline', async () => {
        const { load: mockLoad } = require('../shared/state');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm.mockReturnValueOnce(true); // Continuar deste ponto?
        (mockM.getPipeline as jest.Mock).mockResolvedValue({
            status: 'canceled',
            web_url: '',
        });

        await handleTriggerPipeline(mockM, 'my-project');
        expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('resumes pending pipeline with undefined branch', async () => {
        const { load: mockLoad } = require('../shared/state');
        mockLoad.mockReturnValueOnce({
            pendingPipeline: { pipelineId: '77', projectName: 'my-project' },
        });
        mockConfirm
            .mockReturnValueOnce(true) // Continuar deste ponto?
            .mockReturnValue(false); // Coletar resultados?
        (mockM.getPipeline as jest.Mock).mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/77',
        });

        await handleTriggerPipeline(mockM, 'my-project');
        // pending.branch is undefined → branch = '' (covers L954)
        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Retomando'));
    });
});

describe('handleExportVariables', () => {
    it('exports variables when confirmed', async () => {
        mockConfirm.mockReturnValue(true);
        (mockM.getCICDVariables as jest.Mock).mockResolvedValue([
            { key: 'VAR1', value: 'val1' },
            { key: 'VAR2', value: 'val2' },
        ]);

        await handleExportVariables(mockM);

        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('2'));
        expect(mockPushHistory).toHaveBeenCalledWith('export-vars', '2 variáveis', 'ok');
    });

    it('cancels when not confirmed', async () => {
        mockConfirm.mockReturnValue(false);

        await handleExportVariables(mockM);

        expect(mockWarn).toHaveBeenCalledWith(MSG_OPERATION_CANCELED);
        expect(mockM.getCICDVariables).not.toHaveBeenCalled();
    });

    it('handles fetch error', async () => {
        mockConfirm.mockReturnValue(true);
        (mockM.getCICDVariables as jest.Mock).mockRejectedValue(new Error('fetch fail'));

        await handleExportVariables(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('export-vars', 'erro', 'error');
    });

    it('handles null variables', async () => {
        mockConfirm.mockReturnValue(true);
        (mockM.getCICDVariables as jest.Mock).mockResolvedValue(null);

        await handleExportVariables(mockM);

        expect(mockSuccess).not.toHaveBeenCalledWith(expect.stringContaining('Variáveis exportadas'));
    });

    it('handles undefined variable value', async () => {
        mockConfirm.mockReturnValue(true);
        (mockM.getCICDVariables as jest.Mock).mockResolvedValue([
            { key: 'VAR1', value: undefined },
            { key: 'VAR2', value: 'val2' },
        ]);

        await handleExportVariables(mockM);

        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('2'));
    });
});

// ---------- parseTestResults delegation ----------

describe('parseTestResults', () => {
    it('delegates to test-results parseTestResults', async () => {
        const testResults = require('./test-results');
        (testResults.parseTestResults as jest.Mock).mockResolvedValue({
            matched: [],
            unmatched: [],
            csvName: 'test',
        });
        const result = await parseTestResults({
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 0 },
            tests: [],
        });
        expect(result).toEqual({ matched: [], unmatched: [], csvName: 'test' });
    });

    it('returns null when delegate returns null', async () => {
        const testResults = require('./test-results');
        (testResults.parseTestResults as jest.Mock).mockResolvedValue(null);
        const result = await parseTestResults({
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            tests: [],
        });
        expect(result).toBeNull();
    });
});

// ---------- createTestExecution delegation ----------

describe('createTestExecution', () => {
    it('delegates to test-results createTestExecution', async () => {
        const testResults = require('./test-results');
        (testResults.createTestExecution as jest.Mock).mockResolvedValue(undefined);
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
                pushHistory: jest.fn(),
            }),
        ).resolves.toBeUndefined();
        expect(testResults.createTestExecution).toHaveBeenCalled();
    });
});

// ---------- downloadTestArtifacts delegation ----------

describe('downloadTestArtifacts', () => {
    it('delegates to test-results downloadTestArtifacts', async () => {
        const testResults = require('./test-results');
        (testResults.downloadTestArtifacts as jest.Mock).mockResolvedValue(null);
        const result = await downloadTestArtifacts(mockM, '1');
        expect(result).toBeNull();
        expect(testResults.downloadTestArtifacts).toHaveBeenCalledWith(mockM, '1');
    });
});

// ---------- collectTestResults delegation ----------

describe('collectTestResults', () => {
    it('delegates to test-results collectTestResults', async () => {
        const testResults = require('./test-results');
        (testResults.collectTestResults as jest.Mock).mockResolvedValue(null);
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

describe('buildPipelinePayload cancel', () => {
    it('cancels when user declines trigger confirmation', async () => {
        mockPrompt.mockReturnValue('main');
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(false); // Confirmar disparo?

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockWarn).toHaveBeenCalledWith(MSG_OPERATION_CANCELED);
    });
});

// ---------- triggerAndPollPipeline with full flow ----------

describe('triggerAndPollPipeline full flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPrompt.mockReturnValue('main');
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockM.triggerPipeline as jest.Mock).mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        (mockM.getPipeline as jest.Mock).mockResolvedValue({
            status: 'success',
            web_url: 'https://gitlab.com/pipe/42',
        });
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1',
            iid: '1',
        });
        (mockM.acceptMergeRequest as jest.Mock).mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1/merge',
        });
    });

    it('completes full pipeline flow with bug creation and quick merge', async () => {
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true) // Criar bug no Jira?
            .mockReturnValueOnce(true) // Criar merge request?
            .mockReturnValueOnce(true); // Fazer merge agora?

        // Make collectTestResults return a parsed result
        const testResults = require('./test-results');
        (testResults.collectTestResults as jest.Mock).mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1 },
            tests: [
                { title: 'test-1', state: 'failed' },
                { title: 'test-2', state: 'passed' },
            ],
        });

        // Make offerPipelineFailureAnalysis call the callback
        const llmPipeline = require('./llm-pipeline');
        (llmPipeline.offerPipelineFailureAnalysis as jest.Mock).mockImplementation(
            (_parsed: unknown, onAnalysis?: (r: { content: string }) => Promise<void>) => {
                if (onAnalysis) return onAnalysis({ content: 'analysis result' });
                return undefined;
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

    it('handles bug creation error', async () => {
        const bugReport = require('../shared/bug-report');
        (bugReport.fileToJira as jest.Mock).mockRejectedValue(new Error('Jira API error'));

        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true) // Criar bug no Jira?
            .mockReturnValueOnce(false); // Não criar merge request (padrão)

        const testResults = require('./test-results');
        (testResults.collectTestResults as jest.Mock).mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1 },
            tests: [
                { title: 'test-1', state: 'failed' },
                { title: 'test-2', state: 'passed' },
            ],
        });

        const llmPipeline = require('./llm-pipeline');
        (llmPipeline.offerPipelineFailureAnalysis as jest.Mock).mockImplementation(
            (_parsed: unknown, onAnalysis?: (r: { content: string }) => Promise<void>) => {
                if (onAnalysis) return onAnalysis({ content: 'analysis result' });
                return undefined;
            },
        );

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockPrintError).toHaveBeenCalledWith('Falha ao criar bug no Jira', expect.any(Error));
        expect(mockPushHistory).toHaveBeenCalledWith('create-jira-issue', '42', 'error');
    });

    it('handles quick merge creation error', async () => {
        (mockM.createMergeRequest as jest.Mock).mockRejectedValue(new Error('Merge create error'));

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

    it('handles merge acceptance error', async () => {
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({
            web_url: 'https://gitlab.com/mr/1',
            iid: '1',
        });
        (mockM.acceptMergeRequest as jest.Mock).mockRejectedValue(new Error('Merge accept error'));

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

    it('skips empty variable keys during payload build', async () => {
        mockPrompt
            .mockReturnValueOnce('main') // branch
            .mockReturnValueOnce('=bad,good=val'); // variables input
        mockConfirm
            .mockReturnValueOnce(true) // Adicionar variáveis? yes
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(false); // Aguardar conclusao?
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockM.triggerPipeline as jest.Mock).mockResolvedValue({ id: '42', web_url: 'https://gitlab.com/pipe/42' });

        await handleTriggerPipeline(mockM, 'my-project');

        expect(mockM.triggerPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: [{ key: 'good', value: 'val' }],
            }),
        );
    });

    it('skips bug creation when jira env is null', async () => {
        const testResults = require('./test-results');
        (testResults._jiraEnv as jest.Mock).mockReturnValueOnce(null);
        const testResults2 = require('./test-results');
        (testResults2.collectTestResults as jest.Mock).mockResolvedValue({
            stats: { passed: 5, failed: 2, skipped: 1 },
            tests: [
                { title: 'test-1', state: 'failed' },
                { title: 'test-2', state: 'passed' },
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
        const bugReport = require('../shared/bug-report');
        expect(bugReport.fileToJira).not.toHaveBeenCalled();
    });

    it('triggers pipeline with canceled status skips post-pipeline', async () => {
        (mockM.getPipeline as jest.Mock).mockResolvedValue({ status: 'canceled', web_url: '' });
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true); // Aguardar conclusao?

        await handleTriggerPipeline(mockM, 'my-project');
        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('✗'));
    });

    it('handles pipelineResult being null from triggerPipeline', async () => {
        (mockM.triggerPipeline as jest.Mock).mockResolvedValue(null);
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true); // Confirmar disparo?

        await handleTriggerPipeline(mockM, 'my-project');
        // pipelineResult is null → the if(pipelineResult) block skipped (L1026)
        // then !pipelineResult is true → early return
        expect(setIsBusy).not.toHaveBeenCalled();
    });

    it('creates merge request returning null', async () => {
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue(null);
        mockConfirm
            .mockReturnValueOnce(false) // Adicionar variáveis?
            .mockReturnValueOnce(true) // Confirmar disparo?
            .mockReturnValueOnce(true) // Aguardar conclusao?
            .mockReturnValueOnce(true) // Coletar resultados?
            .mockReturnValueOnce(true); // Criar bug no Jira?
        const testResults = require('./test-results');
        (testResults.collectTestResults as jest.Mock).mockResolvedValue({
            stats: { passed: 0, failed: 0, skipped: 0 },
            tests: [],
        });

        await handleTriggerPipeline(mockM, 'my-project');
        // Mr is null → if(mr) else path (L885)
        expect(mockM.acceptMergeRequest).not.toHaveBeenCalled();
    });

    it('accepts merge returning null', async () => {
        (mockM.acceptMergeRequest as jest.Mock).mockResolvedValue(null);
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

    it('declines merge when user says no to merge now', async () => {
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

describe('triggerPipeline missing id', () => {
    it('returns early when pipeline result has no id', async () => {
        mockPrompt.mockReturnValue('main');
        (mockM.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockM.triggerPipeline as jest.Mock).mockResolvedValue({
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

describe('resumePendingPipeline decline', () => {
    it('deletes pending state when user declines resume', async () => {
        const state = require('../shared/state');
        (state.load as jest.Mock).mockReturnValueOnce({
            pendingPipeline: { branch: 'feat', pipelineId: '99', projectName: 'my-project' },
        });
        mockConfirm.mockReturnValue(false); // Continuar deste ponto? → não

        await handleTriggerPipeline(mockM, 'my-project');

        expect(state.update).toHaveBeenCalled();
        // After decline, should continue to buildPipelinePayload
        expect(mockPrompt).toHaveBeenCalledWith('Branch para disparar pipeline');
    });
});
