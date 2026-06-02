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
    default: {
        jiraProject: 'TEST',
        setAutoConfirm: jest.fn(),
        get(key: string) {
            return (this as Record<string, unknown>)[key] as string;
        },
    },
}));

jest.mock('./pipeline-handler', () => ({ pollPipeline: jest.fn() }));

jest.mock('./llm-pipeline', () => ({ offerPipelineFailureAnalysis: jest.fn() }));

jest.mock('./test-results', () => ({ collectTestResults: jest.fn(() => null) }));

jest.mock('../shared/metrics', () => ({
    loadMetrics: jest.fn(() => ({ runs: [] })),
    calculateFlakiness: jest.fn(() => []),
}));

jest.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: jest.fn(() => '<html>') }));

jest.mock('fs', () => ({ writeFileSync: jest.fn(), mkdirSync: jest.fn(), existsSync: jest.fn(() => false) }));
jest.mock('../shared/temp-dir', () => ({ writeReport: jest.fn(() => '/tmp/flakiness-test.html') }));

import Config from '../shared/config';
import { success, error, printError } from '../shared/prompt';
import { pushHistory, getProjects } from './session-state';
import { pollPipeline } from './pipeline-handler';
import { parseBatchArgs, tryBatchMode } from './batch-mode';
import { createMockGitProvider } from '../shared/test-utils/factories';

const mockSuccess = jest.mocked(success);
const mockError = jest.mocked(error);
const mockPrintError = jest.mocked(printError);
const mockPushHistory = jest.mocked(pushHistory);
const mockPollPipeline = jest.mocked(pollPipeline);
const mockGetProjects = jest.mocked(getProjects);

const mockManager = createMockGitProvider();

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

    it('parses --publish flag', () => {
        process.argv = ['node', 'script.js', '--publish', 's3'];
        const result = parseBatchArgs();
        expect(result.publish).toBe('s3');
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
        jest.mocked(mockManager.getBranch).mockResolvedValue(null);

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('não encontrada'));
    });

    it('triggers pipeline and polls when batch mode', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({
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
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({ id: '1', web_url: '' });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        await tryBatchMode();

        expect(Config.setAutoConfirm).toHaveBeenCalledWith(true);
    });

    it('handles pipeline trigger error', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockRejectedValue(new Error('fail'));

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockPrintError).toHaveBeenCalled();
    });

    it('returns early when pipelineResult is undefined', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue(undefined);

        const result = await tryBatchMode();

        expect(result).toBe(true);
    });

    it('calls offerPipelineFailureAnalysis when results are collected', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        jest.isolateModules(() => {
            const testResults = jest.mocked(jest.requireMock<typeof import('./test-results')>('./test-results'));
            testResults.collectTestResults.mockImplementation(() =>
                Promise.resolve({ tests: [], stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 0 } }),
            );
        });

        const result = await tryBatchMode();
        expect(result).toBe(true);
    });

    it('generates flakiness dashboard when pipeline completes', async () => {
        const mockSessionState = jest.requireMock<typeof import('./session-state')>('./session-state');
        const origProjectName = mockSessionState.currentProjectName;
        mockSessionState.currentProjectName = 'proj1';

        const mockMetrics = jest.mocked(jest.requireMock<typeof import('../shared/metrics')>('../shared/metrics'));
        mockMetrics.loadMetrics.mockReturnValue({
            runs: [
                {
                    project: 'proj1',
                    timestamp: new Date().toISOString(),
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 100,
                    tests: [],
                },
                {
                    project: 'proj1',
                    timestamp: new Date(Date.now() - 1000).toISOString(),
                    total: 10,
                    passed: 9,
                    failed: 1,
                    skipped: 0,
                    duration: 200,
                    tests: [],
                },
            ],
        });

        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockMetrics.loadMetrics).toHaveBeenCalled();
        expect(success).toHaveBeenCalledWith(expect.stringContaining('Dashboard'));

        mockSessionState.currentProjectName = origProjectName;
    });

    it('handles empty pipelineId', async () => {
        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({ web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBe(true);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('ID da pipeline'));
    });

    it('handles flakiness dashboard generation with publish target (line 149)', async () => {
        const mockSessionState = jest.requireMock<typeof import('./session-state')>('./session-state');
        const origProjectName = mockSessionState.currentProjectName;
        mockSessionState.currentProjectName = 'proj1';

        const mockMetrics = jest.mocked(jest.requireMock<typeof import('../shared/metrics')>('../shared/metrics'));
        mockMetrics.loadMetrics.mockReturnValue({
            runs: [
                {
                    project: 'proj1',
                    timestamp: new Date().toISOString(),
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 100,
                    tests: [],
                },
                {
                    project: 'proj1',
                    timestamp: new Date(Date.now() - 1000).toISOString(),
                    total: 10,
                    passed: 9,
                    failed: 1,
                    skipped: 0,
                    duration: 200,
                    tests: [],
                },
            ],
        });

        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main', '--publish', 'gh-pages'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        jest.mocked(mockManager.getBranch).mockResolvedValue({ name: 'main' });
        jest.mocked(mockManager.triggerPipeline).mockResolvedValue({ id: '42', web_url: '' });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        const result = await tryBatchMode();
        expect(result).toBe(true);

        mockSessionState.currentProjectName = origProjectName;
    });
});
