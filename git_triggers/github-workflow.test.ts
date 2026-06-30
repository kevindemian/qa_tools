import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { Mock, Mocked } from 'vitest';
import { nonNull } from '../shared/test-utils.js';
import type { AxiosInstance } from '../shared/deps.js';
import type { JsonObject } from '../shared/types.js';
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
        const result = await wfTriggerPipeline(client, 'myorg', 'myrepo', 'https://api.github.com', {
            ref: 'main',
            variables: [{ key: 'VAR', value: 'val' }],
            workflow_id: '123',
        });

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
        const result = await wfTriggerPipeline(client, 'myorg', 'myrepo', 'https://api.github.com', {
            ref: 'dev',
            variables: [],
        });

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/workflows', {
            operation: 'listar workflows',
            params: { per_page: 10 },
            returnNull: true,
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
        const result = await wfTriggerPipeline(client, 'myorg', 'myrepo', 'https://api.github.com', {
            ref: 'main',
            variables: [],
        });

        expect(result).toBeUndefined();
    });

    it('returns undefined when workflows data is null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfTriggerPipeline(client, 'myorg', 'myrepo', 'https://api.github.com', {
            ref: 'main',
            variables: [],
        });

        expect(result).toBeUndefined();
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        mockApiPost.mockRejectedValue(new Error('API error'));

        await expect(
            wfTriggerPipeline(client, 'myorg', 'myrepo', 'https://api.github.com', {
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
        const result = await wfGetRecentPipelines(client, 'myorg', 'myrepo', 2);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: 2 },
            returnNull: true,
        });
        expect(result).toStrictEqual(runs);
    });

    it('defaults to count=5 when not specified', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({ workflow_runs: [] });
        await wfGetRecentPipelines(client, 'myorg', 'myrepo');

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: 5 },
            returnNull: true,
        });
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetRecentPipelines(client, 'myorg', 'myrepo');

        expect(result).toStrictEqual([]);
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
        const result = await wfGetPipeline(client, 'myorg', 'myrepo', 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42', {
            operation: 'buscar run',
            returnNull: true,
        });
        expect(result).toStrictEqual({ id: 42, status: 'completed', conclusion: 'success' });
    });

    it('returns null when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetPipeline(client, 'myorg', 'myrepo', 999);

        expect(result).toBeNull();
    });
});

describe('WfGetPipelineJobs', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns mapped jobs from API', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [
                { id: 201, name: 'test (22)', runner_group_name: 'ubuntu', status: 'completed', conclusion: 'success' },
                { id: 202, name: 'test (24)', runner_group_name: 'ubuntu', status: 'completed', conclusion: 'failure' },
            ],
        });
        const result = await wfGetPipelineJobs(client, 'myorg', 'myrepo', 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42/jobs', {
            operation: 'listar jobs',
            returnNull: true,
        });
        expect(result).toHaveLength(2);
        expect(nonNull(result[0]).name).toBe('test (22)');
        expect(nonNull(result[0]).stage).toBe('ubuntu');
        expect(nonNull(result[0]).status).toBe('success');
        expect(nonNull(result[1]).status).toBe('failure');
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetPipelineJobs(client, 'myorg', 'myrepo', 42);

        expect(result).toStrictEqual([]);
    });

    it('returns empty array when data has no jobs', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({});
        const result = await wfGetPipelineJobs(client, 'myorg', 'myrepo', 42);

        expect(result).toStrictEqual([]);
    });

    it('uses conclusion first, then status as fallback', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            jobs: [{ id: 1, name: 'job1', runner_group_name: '', status: 'in_progress' }],
        });
        const result = await wfGetPipelineJobs(client, 'myorg', 'myrepo', 42);

        expect(nonNull(result[0]).status).toBe('in_progress');
    });
});

describe('WfListPipelineArtifacts', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns artifacts from API', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            artifacts: [
                { id: 301, name: 'mochawesome-report' },
                { id: 302, name: 'coverage' },
            ],
        });
        const result = await wfListPipelineArtifacts(client, 'myorg', 'myrepo', 42);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/runs/42/artifacts', {
            operation: 'listar artifacts',
            returnNull: true,
        });
        expect(result).toStrictEqual([
            { id: 301, name: 'mochawesome-report' },
            { id: 302, name: 'coverage' },
        ]);
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfListPipelineArtifacts(client, 'myorg', 'myrepo', 42);

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
        const result = await wfDownloadArtifact(client, 'myorg', 'myrepo', '301');

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

        await expect(wfDownloadArtifact(client, 'myorg', 'myrepo', '999')).rejects.toThrow('Download failed');
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
        const result = await wfGetJobLogs(client, 'myorg', 'myrepo', 42, 100);

        expect(getSpy2).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/jobs/42/logs', {
            responseType: 'text' as const,
            maxRedirects: 5,
        });
        expect(result).toBe('line1\nline2\nline3\n');
    });

    it('truncates log when exceeding maxBytes', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockResolvedValue({ data: 'a'.repeat(100) });
        const result = await wfGetJobLogs(client, 'myorg', 'myrepo', 42, 10);

        expect(result).toBe('a'.repeat(10));
        expect(nonNull(result)).toHaveLength(10);
    });

    it('handles non-string response data', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockResolvedValue({ data: Buffer.from('text-data') });
        const result = await wfGetJobLogs(client, 'myorg', 'myrepo', 42, 100);

        expect(result).toBe('text-data');
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockRejectedValue(new Error('Log fetch error'));

        await expect(wfGetJobLogs(client, 'myorg', 'myrepo', 42)).rejects.toThrow('Log fetch error');
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
        const result = await wfGetCICDVariables(client, 'myorg', 'myrepo');

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/actions/variables', {
            operation: 'buscar variáveis',
            params: { per_page: 100 },
            returnNull: true,
        });
        expect(result).toStrictEqual([
            { key: 'MY_VAR', value: 'myval', type: 'variable' },
            { key: 'OTHER_VAR', value: 'other', type: 'variable' },
        ]);
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await wfGetCICDVariables(client, 'myorg', 'myrepo');

        expect(result).toStrictEqual([]);
    });

    it('returns empty array when variables field is missing', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({});
        const result = await wfGetCICDVariables(client, 'myorg', 'myrepo');

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
