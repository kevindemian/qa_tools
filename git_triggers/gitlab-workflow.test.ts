import {
    glTriggerPipeline,
    glGetSchedules,
    glRunSchedule,
    glGetRecentPipelines,
    glGetPipeline,
    glGetPipelineJobs,
    glListPipelineArtifacts,
    glGetCICDVariables,
    glDownloadArtifact,
    glGetJobLogs,
} from './gitlab-workflow.js';
import { apiGet, apiPost, projectPath } from './gitlab-api.js';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
vi.mock('./gitlab-api', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    projectPath: vi.fn(),
}));

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

const mockClient = createMockAxiosInstance();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectPath).mockImplementation(
        (owner: string, repo: string) =>
            `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
    );
});

describe('glTriggerPipeline', () => {
    it('calls apiPost and returns result', async () => {
        vi.mocked(apiPost).mockResolvedValue({ id: 1, web_url: 'https://...' });
        const payload = { ref: 'main', variables: [{ key: 'VAR', value: 'val' }] };
        const result = await glTriggerPipeline(mockClient, 'owner', 'repo', payload);

        expect(result).toEqual({ id: 1, web_url: 'https://...' });
        expect(apiPost).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipeline'), payload, {
            operation: 'disparar pipeline',
        });
    });

    it('returns undefined when apiPost returns undefined', async () => {
        vi.mocked(apiPost).mockResolvedValue(undefined);
        const result = await glTriggerPipeline(mockClient, 'owner', 'repo', { ref: 'main', variables: [] });

        expect(result).toBeUndefined();
    });
});

describe('glGetSchedules', () => {
    it('calls apiGet and returns schedules', async () => {
        vi.mocked(apiGet).mockResolvedValue([{ id: 1, description: 'Daily' }]);
        const result = await glGetSchedules(mockClient, 'owner', 'repo');

        expect(result).toEqual([{ id: 1, description: 'Daily' }]);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipeline_schedules'), {
            operation: 'listar schedules',
            params: { per_page: 100 },
            returnNull: true,
        });
    });

    it('returns [] when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetSchedules(mockClient, 'owner', 'repo');

        expect(result).toEqual([]);
    });
});

describe('glRunSchedule', () => {
    it('calls apiPost and returns result', async () => {
        vi.mocked(apiPost).mockResolvedValue({ id: 42 });
        const result = await glRunSchedule(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual({ id: 42 });
        expect(apiPost).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/pipeline_schedules/42/play'),
            undefined,
            { operation: 'disparar schedule' },
        );
    });

    it('works with string scheduleId', async () => {
        vi.mocked(apiPost).mockResolvedValue({ id: 7 });
        const result = await glRunSchedule(mockClient, 'owner', 'repo', '7');

        expect(result).toEqual({ id: 7 });
    });

    it('re-throws on API error', async () => {
        vi.mocked(apiPost).mockRejectedValue(new Error('fail'));

        await expect(glRunSchedule(mockClient, 'owner', 'repo', 42)).rejects.toThrow('fail');
    });
});

describe('glGetRecentPipelines', () => {
    it('calls apiGet and returns pipelines', async () => {
        vi.mocked(apiGet).mockResolvedValue([{ id: 1, ref: 'main', status: 'success' }]);
        const result = await glGetRecentPipelines(mockClient, 'owner', 'repo', 3);

        expect(result).toEqual([{ id: 1, ref: 'main', status: 'success' }]);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines'), {
            operation: 'buscar pipelines',
            params: { per_page: 3, order_by: 'updated_at' },
            returnNull: true,
        });
    });

    it('defaults to count=5', async () => {
        vi.mocked(apiGet).mockResolvedValue([]);
        await glGetRecentPipelines(mockClient, 'owner', 'repo');

        expect(apiGet).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/pipelines'),
            expect.objectContaining({ params: { per_page: 5, order_by: 'updated_at' } }),
        );
    });

    it('returns [] when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetRecentPipelines(mockClient, 'owner', 'repo');

        expect(result).toEqual([]);
    });
});

describe('glGetPipeline', () => {
    it('calls apiGet and returns pipeline', async () => {
        vi.mocked(apiGet).mockResolvedValue({ id: 42, status: 'success', web_url: 'https://...' });
        const result = await glGetPipeline(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual({ id: 42, status: 'success', web_url: 'https://...' });
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines/42'), {
            operation: 'buscar pipeline',
            returnNull: true,
        });
    });

    it('returns null when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetPipeline(mockClient, 'owner', 'repo', 42);

        expect(result).toBeNull();
    });
});

describe('glGetPipelineJobs', () => {
    it('returns formatted jobs', async () => {
        vi.mocked(apiGet).mockResolvedValue([
            { id: 101, name: 'test', stage: 'test', status: 'success' },
            { id: 102, name: 'build', stage: 'build', status: 'running' },
        ]);
        const result = await glGetPipelineJobs(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual([
            { id: 101, name: 'test', stage: 'test', status: 'success' },
            { id: 102, name: 'build', stage: 'build', status: 'running' },
        ]);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines/42/jobs'), {
            operation: 'listar jobs',
            returnNull: true,
        });
    });

    it('returns [] when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetPipelineJobs(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual([]);
    });
});

describe('glListPipelineArtifacts', () => {
    it('returns jobs with artifacts_file', async () => {
        vi.mocked(apiGet).mockResolvedValue([
            { id: 101, name: 'test', artifacts_file: { filename: 'results.zip' } },
            { id: 102, name: 'build', artifacts: [] },
            { id: 103, name: 'lint' },
        ]);
        const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual([{ id: 101, name: 'test' }]);
    });

    it('returns jobs with non-empty artifacts array', async () => {
        vi.mocked(apiGet).mockResolvedValue([{ id: 201, name: 'deploy', artifacts: [{ file_type: 'zip' }] }]);
        const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual([{ id: 201, name: 'deploy' }]);
    });

    it('returns [] when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

        expect(result).toEqual([]);
    });
});

describe('glGetCICDVariables', () => {
    it('calls apiGet and returns variables', async () => {
        vi.mocked(apiGet).mockResolvedValue([{ key: 'VAR1', value: 'val1' }]);
        const result = await glGetCICDVariables(mockClient, 'owner', 'repo');

        expect(result).toEqual([{ key: 'VAR1', value: 'val1' }]);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/variables'), {
            operation: 'buscar variáveis CI/CD',
            params: { per_page: 100 },
            returnNull: true,
        });
    });

    it('returns [] when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetCICDVariables(mockClient, 'owner', 'repo');

        expect(result).toEqual([]);
    });
});

describe('glDownloadArtifact', () => {
    it('returns buffer and filename from /jobs/{id}/artifacts', async () => {
        mockClient.get.mockResolvedValue({
            data: Buffer.from('fake-zip-content'),
            headers: { 'content-disposition': 'attachment; filename="artifacts.zip"' },
        });
        const result = await glDownloadArtifact(mockClient, 'owner', 'repo', 101);

        expect(mockClient['get']).toHaveBeenCalledWith(expect.stringContaining('/jobs/101/artifacts'), {
            responseType: 'arraybuffer',
        });
        expect(Buffer.isBuffer(result.buffer)).toBeTruthy();
        expect(result.filename).toBe('artifacts.zip');
    });

    it('falls back to artifacts.zip when no content-disposition', async () => {
        mockClient.get.mockResolvedValue({
            data: Buffer.from('data'),
            headers: {},
        });
        const result = await glDownloadArtifact(mockClient, 'owner', 'repo', 101);

        expect(result.filename).toBe('artifacts.zip');
    });

    it('throws on API error (mutation)', async () => {
        mockClient.get.mockRejectedValue(new Error('Download failed'));

        await expect(glDownloadArtifact(mockClient, 'owner', 'repo', 999)).rejects.toThrow('Download failed');
    });
});

describe('glGetJobLogs', () => {
    it('returns truncated log text from GET /jobs/{id}/trace', async () => {
        mockClient.get.mockResolvedValue({ data: 'line1\nline2\nline3\n' });
        const result = await glGetJobLogs(mockClient, 'owner', 'repo', 101);

        expect(mockClient['get']).toHaveBeenCalledWith(expect.stringContaining('/jobs/101/trace'), {
            responseType: 'text',
        });
        expect(result).toBe('line1\nline2\nline3\n');
    });

    it('truncates log to maxBytes', async () => {
        const longLog = 'a'.repeat(100);
        mockClient.get.mockResolvedValue({ data: longLog });
        const result = await glGetJobLogs(mockClient, 'owner', 'repo', 101, 10);

        expect(result).toBe('a'.repeat(10));
    });

    it('returns null on API error', async () => {
        mockClient.get.mockRejectedValue(new Error('Log not found'));
        const result = await glGetJobLogs(mockClient, 'owner', 'repo', 999);

        expect(result).toBeNull();
    });
});
