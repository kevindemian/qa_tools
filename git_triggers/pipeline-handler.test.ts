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
    MSG_OPERATION_CANCELED: 'Operacao cancelada.',
}));

jest.mock('../shared/state', () => ({ load: jest.fn(() => ({})), update: jest.fn() }));

jest.mock('../shared/http-client', () => ({ sleep: jest.fn() }));

jest.mock('../shared/config', () => ({
    default: { jiraProject: 'TEST' },
}));

jest.mock('./test-results', () => ({
    collectTestResults: jest.fn(),
    createTestExecution: jest.fn(),
    _jiraEnv: jest.fn(() => ({ base: 'https://jira.com', token: 'tok', xray: 'xray' })),
    _resolveGlob: jest.fn(),
    downloadTestArtifacts: jest.fn(),
    parseTestResults: jest.fn(),
}));

jest.mock('./llm-pipeline', () => ({ offerPipelineFailureAnalysis: jest.fn() }));

jest.mock('../jira_management/jira_resource', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        postJiraResource: jest.fn().mockResolvedValue({ key: 'BUG-1' }),
    })),
}));

import { success, warn, info, prompt, confirm, printError } from '../shared/prompt';
import { pushHistory } from './session-state';
import { isComplete, pollPipeline, handleTriggerPipeline, handleExportVariables } from './pipeline-handler';
import type { GitProvider } from '../shared/types';

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
        mockLoad.mockReturnValue({
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

        expect(mockWarn).toHaveBeenCalledWith('Operacao cancelada.');
        expect(mockM.getCICDVariables).not.toHaveBeenCalled();
    });

    it('handles fetch error', async () => {
        mockConfirm.mockReturnValue(true);
        (mockM.getCICDVariables as jest.Mock).mockRejectedValue(new Error('fetch fail'));

        await handleExportVariables(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('export-vars', 'erro', 'error');
    });
});
