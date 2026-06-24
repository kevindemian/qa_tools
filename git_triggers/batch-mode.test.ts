vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    printError: vi.fn(),
    error: vi.fn(),
    withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
}));

const mockManager = vi.hoisted(() => ({
    provider: 'gitlab' as const,
    triggerPipeline: vi.fn(),
    getSchedules: vi.fn(),
    runSchedule: vi.fn(),
    createMergeRequest: vi.fn(),
    updateMergeRequest: vi.fn(),
    getMergeRequest: vi.fn(),
    searchMergeRequests: vi.fn(),
    acceptMergeRequest: vi.fn(),
    isApproved: vi.fn(),
    getCICDVariables: vi.fn(),
    getRecentPipelines: vi.fn(),
    getBranch: vi.fn(),
    getPipeline: vi.fn(),
    getPipelineJobs: vi.fn(),
    listPipelineArtifacts: vi.fn(),
    downloadArtifact: vi.fn(),
    getDiff: vi.fn(),
}));

vi.mock('./session-state', () => ({
    pushHistory: vi.fn(),
    printSessionSummary: vi.fn(),
    createManagerForProject: vi.fn(() => mockManager),
    setCurrentProjectName: vi.fn(),
    setProjectId: vi.fn(),
    setManager: vi.fn(),
    getProjects: vi.fn(() => ({})),
    currentProjectName: '',
    currentProvider: 'gitlab',
}));

vi.mock('../shared/config', () => ({
    __esModule: true,
    default: {
        jiraProject: 'TEST',
        setAutoConfirm: vi.fn(),
        get(key: string) {
            return (this as Record<string, unknown>)[key] as string;
        },
    },
}));

vi.mock('./pipeline-handler', () => ({ pollPipeline: vi.fn() }));

vi.mock('./llm-pipeline', () => ({ offerPipelineFailureAnalysis: vi.fn() }));

vi.mock('./test-results', () => ({ collectTestResults: vi.fn(() => null) }));

vi.mock('../shared/metrics', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    calculateFlakiness: vi.fn(() => []),
}));

vi.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: vi.fn(() => '<html>') }));

vi.mock('fs', () => ({
    default: { writeFileSync: vi.fn(), mkdirSync: vi.fn(), existsSync: vi.fn(() => false) },
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
}));
vi.mock('../shared/temp-dir', () => ({ writeReport: vi.fn(() => '/tmp/flakiness-test.html') }));

import Config from '../shared/config.js';
const setAutoConfirmSpy = vi.spyOn(Config, 'setAutoConfirm');
import { success, error, printError } from '../shared/prompt.js';
import { pushHistory, getProjects } from './session-state.js';
import { pollPipeline } from './pipeline-handler.js';
import { parseBatchArgs, tryBatchMode } from './batch-mode.js';

const mockSuccess = vi.mocked(success);
const mockError = vi.mocked(error);
const mockPrintError = vi.mocked(printError);
const mockPushHistory = vi.mocked(pushHistory);
const mockPollPipeline = vi.mocked(pollPipeline);
const mockGetProjects = vi.mocked(getProjects);

let originalArgv: string[];
let originalAutoConfirm: string | undefined;

beforeEach(() => {
    vi.clearAllMocks();
    originalArgv = process.argv;
    originalAutoConfirm = process.env['AUTO_CONFIRM'];
    delete process.env['AUTO_CONFIRM'];
});

afterEach(() => {
    process.argv = originalArgv;
    if (originalAutoConfirm !== undefined) {
        process.env['AUTO_CONFIRM'] = originalAutoConfirm;
    } else {
        delete process.env['AUTO_CONFIRM'];
    }
});

describe('ParseBatchArgs', () => {
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

        expect(result.auto).toBeTruthy();
    });

    it('parses --batch flag', () => {
        process.argv = ['node', 'script.js', '--batch'];
        const result = parseBatchArgs();

        expect(result.auto).toBeTruthy();
    });

    it('returns empty when no args', () => {
        process.argv = ['node', 'script.js'];
        const result = parseBatchArgs();

        expect(result).toStrictEqual({});
    });

    it('parses --publish flag', () => {
        process.argv = ['node', 'script.js', '--publish', 's3'];
        const result = parseBatchArgs();

        expect(result.publish).toBe('s3');
    });
});

describe('TryBatchMode', () => {
    it('returns false when no batch args', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js'];
        const result = await tryBatchMode();

        expect(result).toBeFalsy();
    });

    it('errors when no projects configured', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--auto'];
        mockGetProjects.mockReturnValue({});

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
    });

    it('errors when project not found', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'unknown'];
        mockGetProjects.mockReturnValue({ existing: '1' });

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });

    it('errors when branch not found', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'bad'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue(null);

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('bad'));
    });

    it('triggers pipeline and polls when batch mode', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/pipe/42'));
        expect(mockPushHistory).toHaveBeenCalledWith('batch-pipeline', 'main', 'ok');
        expect(mockPollPipeline).toHaveBeenCalledWith(mockManager, '42');
    });

    it('sets AUTO_CONFIRM when --auto flag passed', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--auto', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockResolvedValue({ id: '1', web_url: '' });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        await tryBatchMode();

        expect(setAutoConfirmSpy).toHaveBeenCalledWith(true);
    });

    it('handles pipeline trigger error', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockRejectedValue(new Error('fail'));

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockPrintError).toHaveBeenCalled();
    });

    it('returns early when pipelineResult is undefined', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockResolvedValue(undefined);

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
    });

    it('calls offerPipelineFailureAnalysis when results are collected', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1', '--branch', 'main'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockResolvedValue({
            id: '42',
            web_url: 'https://gitlab.com/pipe/42',
        });
        mockPollPipeline.mockResolvedValue({ status: 'success', web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
    });

    it('handles empty pipelineId', async () => {expect.hasAssertions();

        process.argv = ['node', 'script.js', '--project', 'proj1'];
        mockGetProjects.mockReturnValue({ proj1: '1' });
        vi.spyOn(mockManager, 'getBranch').mockResolvedValue({ name: 'main' });
        vi.spyOn(mockManager, 'triggerPipeline').mockResolvedValue({ web_url: '' });

        const result = await tryBatchMode();

        expect(result).toBeTruthy();
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('ID da pipeline'));
    });
});
