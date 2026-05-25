jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    prompt: jest.fn(),
    confirm: jest.fn(),
    printError: jest.fn(),
    error: jest.fn(),
    withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
}));

jest.mock('./session-state', () => ({
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    createManagerForProject: jest.fn(() => mockManager),
    setCurrentProjectName: jest.fn(),
    setProjectId: jest.fn(),
    setManager: jest.fn(),
    getProjects: jest.fn(() => ({})),
    currentProjectName: '',
    currentProvider: 'gitlab',
}));

jest.mock('../shared/config', () => ({
    __esModule: true,
    default: { jiraProject: 'TEST' },
}));

jest.mock('./pipeline-handler', () => ({ pollPipeline: jest.fn() }));

jest.mock('./llm-pipeline', () => ({ offerPipelineFailureAnalysis: jest.fn() }));

jest.mock('./test-results', () => ({ collectTestResults: jest.fn(() => null) }));

jest.mock('../shared/metrics', () => ({
    loadMetrics: jest.fn(() => ({ runs: [] })),
    calculateFlakiness: jest.fn(() => []),
}));

jest.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: jest.fn(() => '<html>') }));

jest.mock('fs', () => ({ writeFileSync: jest.fn() }));

import { success, error, info, printError, withSpinner } from '../shared/prompt';
import {
    pushHistory,
    getProjects,
    createManagerForProject,
    setCurrentProjectName,
    setProjectId,
    setManager,
    printSessionSummary,
} from './session-state';
import { pollPipeline } from './pipeline-handler';
import { parseBatchArgs, tryBatchMode } from './batch-mode';
import type { GitProvider, PipelineTriggerResult } from '../shared/types';

const mockSuccess = success as jest.Mock;
const mockError = error as jest.Mock;
const mockInfo = info as jest.Mock;
const mockPrintError = printError as jest.Mock;
const mockPushHistory = pushHistory as jest.Mock;
const mockPollPipeline = pollPipeline as jest.Mock;
const mockGetProjects = getProjects as jest.Mock;

const mockManager = {
    getBranch: jest.fn(),
    triggerPipeline: jest.fn(),
    getRecentPipelines: jest.fn(),
} as unknown as GitProvider;

let originalArgv: string[];
let originalAutoConfirm: string | undefined;

beforeEach(() => {
    jest.clearAllMocks();
    originalArgv = process.argv;
    originalAutoConfirm = process.env.AUTO_CONFIRM;
    delete process.env.AUTO_CONFIRM;
});

afterEach(() => {
    process.argv = originalArgv;
    if (originalAutoConfirm !== undefined) {
        process.env.AUTO_CONFIRM = originalAutoConfirm;
    } else {
        delete process.env.AUTO_CONFIRM;
    }
});

describe('parseBatchArgs', () => {
    it('parses --project long flag', () => {
        process.argv = ['node', 'script.js', '--project', 'my-proj'];
        const result = parseBatchArgs();
        expect(result.project).toBe('my-proj');
    });

    it('parses -p short flag', () => {
        process.argv = ['node', 'script.js', '-p', 'my-proj'];
        const result = parseBatchArgs();
        expect(result.project).toBe('my-proj');
    });

    it('parses --branch flag', () => {
        process.argv = ['node', 'script.js', '--branch', 'develop'];
        const result = parseBatchArgs();
        expect(result.branch).toBe('develop');
    });

    it('parses -b short flag', () => {
        process.argv = ['node', 'script.js', '-b', 'develop'];
        const result = parseBatchArgs();
        expect(result.branch).toBe('develop');
    });

    it('parses --auto flag', () => {
        process.argv = ['node', 'script.js', '--auto'];
        const result = parseBatchArgs();
        expect(result.auto).toBe(true);
    });

    it('parses --batch flag', () => {
        process.argv = ['node', 'script.js', '--batch'];
        const result = parseBatchArgs();
        expect(result.auto).toBe(true);
    });

    it('returns empty when no args', () => {
        process.argv = ['node', 'script.js'];
        const result = parseBatchArgs();
        expect(result).toEqual({});
    });
});

describe('tryBatchMode', () => {
    it('returns false when no batch args', async () => {
        process.argv = ['node', 'script.js'];
        const result = await tryBatchMode();
        expect(result).toBe(false);
    });

    it('errors when no projects configured', async () => {
        process.argv = ['node', 'script.js', '--auto'];
        mockGetProjects.mockReturnValue({});

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
    });

    it('errors when project not found', async () => {
        process.argv = ['node', 'script.js', '--project', 'unknown'];
        mockGetProjects.mockReturnValue({ existing: '1' });

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('errors when branch not found', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'bad'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue(null);

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
    });

    it('triggers pipeline and polls when batch mode', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockManager.triggerPipeline as jest.Mock).mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/pipe/42'));
        expect(mockPushHistory).toHaveBeenCalledWith('batch-pipeline', 'main', 'ok');
        expect(mockPollPipeline).toHaveBeenCalledWith(mockManager, '42');
    });

    it('sets AUTO_CONFIRM when --auto flag passed', async () => {
        process.argv = ['node', 'script.js', '--auto', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockManager.triggerPipeline as jest.Mock).mockResolvedValue({ id: '1', web_url: '' });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        await tryBatchMode();

        expect(process.env.AUTO_CONFIRM).toBe('true');
    });

    it('handles pipeline trigger error', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockManager.triggerPipeline as jest.Mock).mockRejectedValue(new Error('fail'));

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockPrintError).toHaveBeenCalled();
    });

    it('returns early when pipelineResult is undefined', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockManager.triggerPipeline as jest.Mock).mockResolvedValue(undefined);

        const result = await tryBatchMode();

        expect(result).toBe(true);
    });

    it('handles empty pipelineId', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        (mockManager.getBranch as jest.Mock).mockResolvedValue({ name: 'main' });
        (mockManager.triggerPipeline as jest.Mock).mockResolvedValue({ web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('ID da pipeline'));
    });
});
