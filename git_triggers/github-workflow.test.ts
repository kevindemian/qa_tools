import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { Mock, Mocked } from 'vitest';
import { nonNull } from '../shared/test-utils.js';
import type { AxiosInstance } from '../shared/deps.js';
import type { JsonObject } from '../shared/types.js';
import { CONTEXT_IDS, CI_CD_PATH } from '../shared/test-utils/constants.js';
import { ExternalError } from '../shared/errors.js';
import { apiGet, apiPost } from './github-api.js';
import {
    wfTriggerPipeline,
    wfGetRecentPipelines,
    wfGetPipeline,
    wfGetPipelineJobs,
    wfListPipelineArtifacts,
    wfDownloadArtifact,
    wfGetJobLogs,
    wfGetCICDVariables,
    wfGetSchedules,
    wfRunSchedule,
    wfGetWorkflowRunTiming,
    wfGetWorkflowUsage,
    wfGetRepoTree,
    wfGetFileContents,
    wfListDirectory,
    wfGetRepoTreeCached,
    clearTreeCache,
} from './github-workflow.js';

vi.mock('./github-api', () => ({
    apiGet: vi.fn<(...args: [client: AxiosInstance, url: string, options?: object]) => Promise<JsonObject | null>>(),
    apiPost:
        vi.fn<
            (...args: [client: AxiosInstance, url: string, data?: object, options?: object]) => Promise<JsonObject>
        >(),
}));

vi.mock('../shared/logger', () => ({
    Logger: vi.fn<(...args: [opts?: object]) => Record<string, Mock>>().mockImplementation(function () {
        return {
            error: vi.fn<(...args: [msg: string, meta?: object]) => void>(),
            warn: vi.fn<(...args: [msg: string, meta?: object]) => void>(),
        };
    }),
    rootLogger: {
        error: vi.fn<(...args: [msg: string, meta?: object]) => void>(),
        warn: vi.fn<(...args: [msg: string, meta?: object]) => void>(),
    },
}));

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn<(...args: [err: Error, opts?: { returnNull?: boolean }]) => null>(
        (err: Error, opts?: { returnNull?: boolean }) => {
            if (opts?.returnNull) return null;
            throw err;
        },
    ),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

describe('WfTriggerPipeline', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
        mockApiPost.mockClear();
    });

    it('dispatches workflow with given workflow_id', async () => {
        expect.hasAssertions();

        mockApiPost.mockResolvedValue({});
        const result = await wfTriggerPipeline(
            client,
            CONTEXT_IDS.ORGANIZATION,
            CONTEXT_IDS.REPOSITORY,
            CI_CD_PATH.GITHUB_API,
            {
                ref: 'main',
                variables: [{ key: 'VAR', value: 'val' }],
                workflow_id: '123',
            },
        );

        expect(mockApiPost).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/actions/workflows/123/dispatches',
            { ref: 'main', inputs: { VAR: 'val' } },
            { operation: 'disparar workflow' },
        );
        expect(result).toStrictEqual({ id: '123', web_url: 'https://api.github.com/myorg/myrepo/actions/runs' });
    });

    it('auto-detects first workflow when workflow_id not given', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ workflows: [{ id: 42, name: 'ci' }] });
        mockApiPost.mockResolvedValue({});
        const result = await wfTriggerPipeline(
            client,
            CONTEXT_IDS.ORGANIZATION,
            CONTEXT_IDS.REPOSITORY,
            CI_CD_PATH.GITHUB_API,
            {
                ref: 'dev',
                variables: [],
            },
        );

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/workflows', {
            operation: 'listar workflows',
            params: { per_page: 10 },
        });
        expect(mockApiPost).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/actions/workflows/42/dispatches',
            { ref: 'dev', inputs: {} },
            { operation: 'disparar workflow' },
        );
        expect(result).toStrictEqual({ id: 42, web_url: 'https://api.github.com/myorg/myrepo/actions/runs' });
    });

    it('returns undefined when no workflows found', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ workflows: [] });
        const result = await wfTriggerPipeline(
            client,
            CONTEXT_IDS.ORGANIZATION,
            CONTEXT_IDS.REPOSITORY,
            CI_CD_PATH.GITHUB_API,
            {
                ref: 'main',
                variables: [],
            },
        );

        expect(result).toBeUndefined();
    });

    it('returns undefined when workflows data is null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfTriggerPipeline(
            client,
            CONTEXT_IDS.ORGANIZATION,
            CONTEXT_IDS.REPOSITORY,
            CI_CD_PATH.GITHUB_API,
            {
                ref: 'main',
                variables: [],
            },
        );

        expect(result).toBeUndefined();
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        mockApiPost.mockRejectedValue(new Error('API error'));

        await expect(
            wfTriggerPipeline(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, CI_CD_PATH.GITHUB_API, {
                ref: 'main',
                variables: [],
                workflow_id: '1',
            }),
        ).rejects.toThrow('API error');
    });
});

describe('WfGetRecentPipelines', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns workflow runs from API', async () => {
        expect.hasAssertions();

        const runs = [
            { id: 1, run_number: 100, head_branch: 'main', status: 'completed', conclusion: 'success' },
            { id: 2, run_number: 99, head_branch: 'dev', status: 'completed', conclusion: 'failure' },
        ];
        mockApiGet.mockResolvedValue({ workflow_runs: runs });
        const result = await wfGetRecentPipelines(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 2);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: 2 },
        });
        expect(result).toStrictEqual(runs);
    });

    it('defaults to count=5 when not specified', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ workflow_runs: [] });
        await wfGetRecentPipelines(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: 5 },
        });
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetRecentPipelines(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY);

        expect(result).toStrictEqual([]);
    });

    it('passes created filter to API when since is set (Gap 4 incremental)', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ workflow_runs: [] });
        const since = new Date('2026-01-01T00:00:00Z');
        await wfGetRecentPipelines(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 5, since);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: 5, created: '>=' + since.toISOString() },
        });
    });
});

describe('WfGetPipeline', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns pipeline info for valid run ID', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ id: 42, status: 'completed', conclusion: 'success' });
        const result = await wfGetPipeline(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42', {
            operation: 'buscar run',
        });
        expect(result).toStrictEqual({ id: 42, status: 'completed', conclusion: 'success' });
    });

    it('returns null when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetPipeline(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 999);

        expect(result).toBeNull();
    });
});

describe('WfGetPipelineJobs', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns mapped jobs metadata from API', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 201,
                    name: 'test (22)',
                    runner_group_name: 'ubuntu',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:05:30Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: 'success', number: 2 },
                    ],
                },
                {
                    id: 202,
                    name: 'test (24)',
                    runner_group_name: 'ubuntu',
                    status: 'completed',
                    conclusion: 'failure',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:03:00Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: 'failure', number: 2 },
                    ],
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42/jobs', {
            operation: 'listar jobs',
        });
        expect(result).toHaveLength(2);
    });

    it('maps success job fields correctly', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 201,
                    name: 'test (22)',
                    runner_group_name: 'ubuntu',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:05:30Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: 'success', number: 2 },
                    ],
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        const job0 = nonNull(nonNull(result)[0]);

        expect(job0.name).toBe('test (22)');
        expect(job0.stage).toBe('ubuntu');
        expect(job0.status).toBe('success');
        expect(job0.started_at).toBe('2025-01-15T10:00:00Z');
        expect(job0.finished_at).toBe('2025-01-15T10:05:30Z');
        expect(job0.duration).toBe(330);
    });

    it('maps success job step conclusions correctly', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 201,
                    name: 'test (22)',
                    runner_group_name: 'ubuntu',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:05:30Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: 'success', number: 2 },
                    ],
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        const job0 = nonNull(nonNull(result)[0]);

        expect(job0.stepConclusions).toHaveLength(2);
        expect(nonNull(nonNull(job0.stepConclusions)[0])).toStrictEqual({
            name: 'Checkout',
            conclusion: 'success',
            number: 1,
        });
        expect(nonNull(nonNull(job0.stepConclusions)[1])).toStrictEqual({
            name: 'Run tests',
            conclusion: 'success',
            number: 2,
        });
    });

    it('maps failure job fields correctly', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 202,
                    name: 'test (24)',
                    runner_group_name: 'ubuntu',
                    status: 'completed',
                    conclusion: 'failure',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:03:00Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: 'failure', number: 2 },
                    ],
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        const job1 = nonNull(nonNull(result)[0]);

        expect(job1.name).toBe('test (24)');
        expect(job1.status).toBe('failure');
        expect(job1.started_at).toBe('2025-01-15T10:00:00Z');
        expect(job1.finished_at).toBe('2025-01-15T10:03:00Z');
        expect(job1.duration).toBe(180);
        expect(job1.stepConclusions).toHaveLength(2);
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toStrictEqual([]);
    });

    it('returns empty array when data has no jobs', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({});
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toStrictEqual([]);
    });

    it('uses conclusion first, then status as fallback', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [{ id: 1, name: 'job1', runner_group_name: '', status: 'in_progress' }],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(nonNull(result[0]).status).toBe('in_progress');
    });

    it('handles jobs without timestamps gracefully', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 1,
                    name: 'no-timestamps',
                    runner_group_name: '',
                    status: 'completed',
                    conclusion: 'success',
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toHaveLength(1);

        const job = nonNull(result[0]);

        expect(job.started_at).toBeUndefined();
        expect(job.finished_at).toBeUndefined();
        expect(job.duration).toBeUndefined();
        expect(job.stepConclusions).toBeUndefined();
    });

    it('handles jobs without steps gracefully', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 1,
                    name: 'no-steps',
                    runner_group_name: '',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:05:00Z',
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toHaveLength(1);

        const job = nonNull(result[0]);

        expect(job.started_at).toBe('2025-01-15T10:00:00Z');
        expect(job.finished_at).toBe('2025-01-15T10:05:00Z');
        expect(job.duration).toBe(300);
        expect(job.stepConclusions).toBeUndefined();
    });

    it('handles jobs with null conclusion in steps', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                {
                    id: 1,
                    name: 'partial-steps',
                    runner_group_name: '',
                    status: 'completed',
                    conclusion: 'cancelled',
                    started_at: '2025-01-15T10:00:00Z',
                    completed_at: '2025-01-15T10:02:00Z',
                    steps: [
                        { name: 'Checkout', conclusion: 'success', number: 1 },
                        { name: 'Run tests', conclusion: null, number: 2 },
                        { name: 'Deploy', conclusion: null, number: 3 },
                    ],
                },
            ],
        });
        const result = await wfGetPipelineJobs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toHaveLength(1);

        const job = nonNull(result[0]);

        expect(job.stepConclusions).toHaveLength(1);
        expect(nonNull(job.stepConclusions)).toStrictEqual([{ name: 'Checkout', conclusion: 'success', number: 1 }]);
    });
});

describe('WfListPipelineArtifacts', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns artifacts from API with size and creation date', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            artifacts: [
                { id: 301, name: 'mochawesome-report', size_in_bytes: 2048, created_at: '2025-01-15T10:00:00Z' },
                { id: 302, name: 'coverage', size_in_bytes: 4096, created_at: '2025-01-15T10:05:00Z' },
            ],
        });
        const result = await wfListPipelineArtifacts(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42/artifacts', {
            operation: 'listar artifacts',
        });
        expect(result).toStrictEqual([
            { id: 301, name: 'mochawesome-report', size_in_bytes: 2048, created_at: '2025-01-15T10:00:00Z' },
            { id: 302, name: 'coverage', size_in_bytes: 4096, created_at: '2025-01-15T10:05:00Z' },
        ]);
    });

    it('handles artifacts without optional fields', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            artifacts: [{ id: 301, name: 'old-artifact' }],
        });
        const result = await wfListPipelineArtifacts(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toHaveLength(1);
        expect(nonNull(result[0]).id).toBe(301);
        expect(nonNull(result[0]).name).toBe('old-artifact');
        expect(nonNull(result[0]).size_in_bytes).toBeUndefined();
        expect(nonNull(result[0]).created_at).toBeUndefined();
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfListPipelineArtifacts(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(result).toStrictEqual([]);
    });
});

describe('WfDownloadArtifact', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
    });

    it('returns buffer and filename from artifact zip', async () => {
        expect.hasAssertions();

        const getSpy = vi.spyOn(client, 'get').mockResolvedValue({ data: Buffer.from('zip-data') });
        const result = await wfDownloadArtifact(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, '301');

        expect(getSpy).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/artifacts/301/zip', {
            responseType: 'arraybuffer',
            maxRedirects: 5,
        });
        expect(Buffer.isBuffer(result.buffer)).toBeTruthy();
        expect(result.buffer).toStrictEqual(Buffer.from('zip-data'));
        expect(result.filename).toBe('artifact.zip');
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockRejectedValue(new Error('Download failed'));

        await expect(
            wfDownloadArtifact(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, '999'),
        ).rejects.toThrow('Download failed');
    });
});

describe('WfGetJobLogs', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
    });

    it('returns truncated log text on success', async () => {
        expect.hasAssertions();

        const getSpy2 = vi.spyOn(client, 'get').mockResolvedValue({ data: 'line1\nline2\nline3\n' });
        const result = await wfGetJobLogs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42, 100);

        expect(getSpy2).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/jobs/42/logs', {
            responseType: 'text' as const,
            maxRedirects: 5,
        });
        expect(result).toBe('line1\nline2\nline3\n');
    });

    it('truncates log when exceeding maxBytes', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockResolvedValue({ data: 'a'.repeat(100) });
        const result = await wfGetJobLogs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42, 10);

        expect(result).toBe('a'.repeat(10));
        expect(nonNull(result)).toHaveLength(10);
    });

    it('handles non-string response data', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockResolvedValue({ data: Buffer.from('text-data') });
        const result = await wfGetJobLogs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42, 100);

        expect(result).toBe('text-data');
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockRejectedValue(new Error('Log fetch error'));

        await expect(wfGetJobLogs(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42)).rejects.toThrow(
            'Log fetch error',
        );
    });
});

describe('WfGetCICDVariables', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns mapped variables from API', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            variables: [
                { name: 'MY_VAR', value: 'myval' },
                { name: 'OTHER_VAR', value: 'other' },
            ],
        });
        const result = await wfGetCICDVariables(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/variables', {
            operation: 'buscar variáveis',
            params: { per_page: 100 },
        });
        expect(result).toStrictEqual([
            { key: 'MY_VAR', value: 'myval', type: 'variable' },
            { key: 'OTHER_VAR', value: 'other', type: 'variable' },
        ]);
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetCICDVariables(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY);

        expect(result).toStrictEqual([]);
    });

    it('returns empty array when variables field is missing', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({});
        const result = await wfGetCICDVariables(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY);

        expect(result).toStrictEqual([]);
    });
});

describe('WfGetSchedules', () => {
    it('returns empty array', async () => {
        expect.hasAssertions();

        const result = await wfGetSchedules();

        expect(result).toStrictEqual([]);
    });
});

describe('WfRunSchedule', () => {
    it('throws not-implemented error', () => {
        expect(() => wfRunSchedule('1')).toThrow('not available via REST API');
    });
});

describe('WfGetWorkflowRunTiming', () => {
    it('returns run_duration_ms from API', async () => {
        expect.hasAssertions();

        const mockTiming = { run_duration_ms: 123456 };
        const client = createMockAxiosInstance();

        vi.mocked(apiGet).mockResolvedValue(mockTiming);

        const result = await wfGetWorkflowRunTiming(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(apiGet).toHaveBeenCalledWith(
            client,
            '/repos/' + CONTEXT_IDS.ORGANIZATION + '/' + CONTEXT_IDS.REPOSITORY + '/actions/runs/42/timing',
            { operation: 'buscar run duration' },
        );
        expect(result).toStrictEqual({ run_duration_ms: 123456 });
    });

    it('returns null when apiGet returns null', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();

        vi.mocked(apiGet).mockResolvedValue(null);

        const result = await wfGetWorkflowRunTiming(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 99);

        expect(result).toBeNull();
    });

    it('throws ExternalError when apiGet throws (not silently null)', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();

        vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

        await expect(
            wfGetWorkflowRunTiming(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 55),
        ).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('WfGetWorkflowUsage', () => {
    it('lA-2: returns run_duration_ms AND billable (real cost, not dropped)', async () => {
        expect.hasAssertions();

        const mockUsage = {
            run_duration_ms: 120000,
            billable: { UBUNTU: { total_ms: 60000, jobs: 2 }, MACOS: { total_ms: 30000, jobs: 1 } },
        };
        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue(mockUsage);

        const result = await wfGetWorkflowUsage(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 42);

        expect(apiGet).toHaveBeenCalledWith(
            client,
            '/repos/' + CONTEXT_IDS.ORGANIZATION + '/' + CONTEXT_IDS.REPOSITORY + '/actions/runs/42/timing',
            { operation: 'buscar run usage' },
        );
        expect(result).not.toBeNull();
        expect(result?.run_duration_ms).toBe(120000);
        expect(result?.billable?.['UBUNTU']?.total_ms).toBe(60000);
        expect(result?.billable?.['MACOS']?.jobs).toBe(1);
    });

    it('lA-2: tolerates missing billable (duration only)', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue({ run_duration_ms: 5000 });

        const result = await wfGetWorkflowUsage(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 7);

        expect(result?.run_duration_ms).toBe(5000);
        expect(result?.billable).toBeUndefined();
    });

    it('returns null when apiGet returns null', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue(null);

        const result = await wfGetWorkflowUsage(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 99);

        expect(result).toBeNull();
    });
});

describe('WfGetRepoTree', () => {
    const TREE_RESPONSE = {
        tree: [
            { path: 'package.json', type: 'blob' },
            { path: 'README.md', type: 'blob' },
            { path: 'src', type: 'tree' },
            { path: 'packages/a/package.json', type: 'blob' },
            { path: 'requirements.txt', type: 'blob' },
            { path: 'Gemfile.lock', type: 'blob' },
        ],
        truncated: false,
    };

    beforeEach(() => {
        vi.mocked(apiGet).mockClear();
        clearTreeCache();
    });

    it('returns manifest file paths from tree', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue(TREE_RESPONSE);

        const result = await wfGetRepoTree(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'main');

        expect(result).toStrictEqual(['package.json', 'packages/a/package.json', 'requirements.txt']);
    });

    it('returns empty array when no manifests found', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue({
            tree: [
                { path: 'README.md', type: 'blob' },
                { path: 'src/index.ts', type: 'blob' },
            ],
            truncated: false,
        });

        const result = await wfGetRepoTree(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'main');

        expect(result).toStrictEqual([]);
    });

    it('throws ExternalError on API error (not silently null)', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

        await expect(
            wfGetRepoTree(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'main'),
        ).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('WfGetFileContents', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
    });

    it('returns file content from Contents API', async () => {
        expect.hasAssertions();

        const mockGet = vi.fn().mockResolvedValue({ data: 'file content here' });
        client.get = mockGet;

        const result = await wfGetFileContents(
            client,
            CONTEXT_IDS.ORGANIZATION,
            CONTEXT_IDS.REPOSITORY,
            'package.json',
            'main',
        );

        expect(mockGet).toHaveBeenCalledWith(
            '/repos/' + CONTEXT_IDS.ORGANIZATION + '/' + CONTEXT_IDS.REPOSITORY + '/contents/package.json?ref=main',
            {
                headers: { Accept: 'application/vnd.github.v3.raw' },
                responseType: 'text',
            },
        );
        expect(result).toBe('file content here');
    });

    it('returns null on 404', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue({ response: { status: 404 } });

        const result = await wfGetFileContents(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'missing.txt');

        expect(result).toBeNull();
    });

    it('throws ExternalError on other API error (not silently null)', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(new Error('API error'));

        await expect(
            wfGetFileContents(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'package.json'),
        ).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('WfListDirectory', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
    });

    it('returns directory entries from Contents API', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: [
                { name: 'index.ts', path: 'src/index.ts', type: 'file' },
                { name: 'utils', path: 'src/utils', type: 'dir' },
            ],
        });

        const result = await wfListDirectory(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'src');

        expect(result).toStrictEqual([
            { name: 'index.ts', path: 'src/index.ts', type: 'file' },
            { name: 'utils', path: 'src/utils', type: 'dir' },
        ]);
    });

    it('returns null on 404', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue({ response: { status: 404 } });

        const result = await wfListDirectory(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'missing');

        expect(result).toBeNull();
    });

    it('returns null when response is not an array', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: { not: 'an array' } });

        const result = await wfListDirectory(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'file.json');

        expect(result).toBeNull();
    });

    it('throws ExternalError on API error (not silently null)', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(new Error('API error'));

        await expect(
            wfListDirectory(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'test-file.json'),
        ).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('WfGetRepoTreeCached', () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockClear();
        clearTreeCache();
    });

    it('caches and returns tree paths', async () => {
        expect.hasAssertions();

        const client = createMockAxiosInstance();
        vi.mocked(apiGet).mockResolvedValue({
            tree: [{ path: 'package.json', type: 'blob' }],
            truncated: false,
        });

        const result1 = await wfGetRepoTreeCached(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'main');
        const result2 = await wfGetRepoTreeCached(client, CONTEXT_IDS.ORGANIZATION, CONTEXT_IDS.REPOSITORY, 'main');

        expect(result1).toStrictEqual(['package.json']);
        expect(result2).toStrictEqual(['package.json']);
        expect(apiGet).toHaveBeenCalledTimes(1);
    });
});
