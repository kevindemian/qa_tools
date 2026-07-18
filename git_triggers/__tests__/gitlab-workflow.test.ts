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
    glGetRepoTree,
    glGetFileContents,
    glListDirectory,
    glGetTestReport,
} from '../gitlab-workflow.js';
import { apiGet, apiPost, projectPath } from '../gitlab-api.js';
import { ExternalError } from '../../shared/errors.js';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import { nonNull } from '../../shared/test-utils.js';
vi.mock('../gitlab-api', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    projectPath: vi.fn(),
}));

vi.mock('../../shared/ci/git-provider-error.js', () => ({
    handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

const mockClient = createMockAxiosInstance();

describe('Gitlab Workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(projectPath).mockImplementation(
            (owner: string, repo: string) =>
                `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
        );
    });

    describe('GlTriggerPipeline', () => {
        it('calls apiPost and returns result', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue({ id: 1, web_url: 'https://...' });
            const payload = { ref: 'main', variables: [{ key: 'VAR', value: 'val' }] };
            const result = await glTriggerPipeline(mockClient, 'owner', 'repo', payload);

            expect(result).toStrictEqual({ id: 1, web_url: 'https://...' });
            expect(apiPost).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipeline'), payload, {
                operation: 'disparar pipeline',
            });
        });

        it('returns undefined when apiPost returns undefined', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue(undefined);
            const result = await glTriggerPipeline(mockClient, 'owner', 'repo', { ref: 'main', variables: [] });

            expect(result).toBeUndefined();
        });
    });

    describe('GlGetSchedules', () => {
        it('calls apiGet and returns schedules', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([{ id: 1, description: 'Daily' }]);
            const result = await glGetSchedules(mockClient, 'owner', 'repo');

            expect(result).toStrictEqual([{ id: 1, description: 'Daily' }]);
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipeline_schedules'), {
                operation: 'listar schedules',
                params: { per_page: 100 },
            });
        });

        it('throws when apiGet fails (not silently [])', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetSchedules(mockClient, 'owner', 'repo')).rejects.toThrow('API error');
        });
    });

    describe('GlRunSchedule', () => {
        it('calls apiPost and returns result', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue({ id: 42 });
            const result = await glRunSchedule(mockClient, 'owner', 'repo', 42);

            expect(result).toStrictEqual({ id: 42 });
            expect(apiPost).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/pipeline_schedules/42/play'),
                undefined,
                { operation: 'disparar schedule' },
            );
        });

        it('works with string scheduleId', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue({ id: 7 });
            const result = await glRunSchedule(mockClient, 'owner', 'repo', '7');

            expect(result).toStrictEqual({ id: 7 });
        });

        it('re-throws on API error', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockRejectedValue(new Error('fail'));

            await expect(glRunSchedule(mockClient, 'owner', 'repo', 42)).rejects.toThrow('fail');
        });
    });

    describe('GlGetRecentPipelines', () => {
        it('calls apiGet and returns pipelines', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([{ id: 1, ref: 'main', status: 'success' }]);
            const result = await glGetRecentPipelines(mockClient, 'owner', 'repo', 3);

            expect(result).toStrictEqual([{ id: 1, ref: 'main', status: 'success' }]);
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines'), {
                operation: 'buscar pipelines',
                params: { per_page: 3, order_by: 'updated_at' },
            });
        });

        it('defaults to count=5', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([]);
            await glGetRecentPipelines(mockClient, 'owner', 'repo');

            expect(apiGet).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/pipelines'),
                expect.objectContaining({ params: { per_page: 5, order_by: 'updated_at' } }),
            );
        });

        it('lA-2: plumbs retried flag from GitLab list API', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { id: 1, ref: 'main', status: 'success', retried: true },
                { id: 2, ref: 'main', status: 'success', retried: false },
            ]);
            const result = await glGetRecentPipelines(mockClient, 'owner', 'repo', 3);

            expect(result[0]?.retried).toBeTruthy();
            expect(result[1]?.retried).toBeFalsy();
        });

        it('throws when apiGet fails (not silently [])', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetRecentPipelines(mockClient, 'owner', 'repo')).rejects.toThrow('API error');
        });

        it('passes created_after filter to API when since is set (Gap 4 incremental)', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([]);
            const since = new Date('2026-01-01T00:00:00Z');
            await glGetRecentPipelines(mockClient, 'owner', 'repo', 5, since);

            expect(apiGet).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/pipelines'),
                expect.objectContaining({
                    params: { per_page: 5, order_by: 'updated_at', created_after: since.toISOString() },
                }),
            );
        });
    });

    describe('GlGetPipeline', () => {
        it('calls apiGet and returns pipeline', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ id: 42, status: 'success', web_url: 'https://...' });
            const result = await glGetPipeline(mockClient, 'owner', 'repo', 42);

            expect(result).toStrictEqual({ id: 42, status: 'success', web_url: 'https://...' });
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines/42'), {
                operation: 'buscar pipeline',
            });
        });

        it('returns null when pipeline not found (404)', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue({ response: { status: 404 } });
            const result = await glGetPipeline(mockClient, 'owner', 'repo', 42);

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 API error', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetPipeline(mockClient, 'owner', 'repo', 42)).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlGetPipelineJobs', () => {
        it('returns formatted jobs with timing fields', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                {
                    id: 101,
                    name: 'test',
                    stage: 'test',
                    status: 'success',
                    started_at: '2026-07-01T10:00:00Z',
                    finished_at: '2026-07-01T10:05:00Z',
                    duration: 300,
                },
                { id: 102, name: 'build', stage: 'build', status: 'running', started_at: '2026-07-01T10:00:00Z' },
            ]);
            const result = await glGetPipelineJobs(mockClient, 'owner', 'repo', 42);

            expect(result).toStrictEqual([
                {
                    id: 101,
                    name: 'test',
                    stage: 'test',
                    status: 'success',
                    started_at: '2026-07-01T10:00:00Z',
                    finished_at: '2026-07-01T10:05:00Z',
                    duration: 300,
                },
                {
                    id: 102,
                    name: 'build',
                    stage: 'build',
                    status: 'running',
                    started_at: '2026-07-01T10:00:00Z',
                    finished_at: undefined,
                    duration: undefined,
                },
            ]);
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/pipelines/42/jobs'), {
                operation: 'listar jobs',
            });
        });

        it('throws when apiGet fails (not silently [])', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetPipelineJobs(mockClient, 'owner', 'repo', 42)).rejects.toThrow('API error');
        });
    });

    describe('GlListPipelineArtifacts', () => {
        it('returns jobs with artifacts_file including size', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { id: 101, name: 'test', artifacts_file: { filename: 'results.zip', size: 2048 } },
                { id: 102, name: 'build', artifacts: [] },
                { id: 103, name: 'lint' },
            ]);
            const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0])).toStrictEqual({ id: 101, name: 'test', size_in_bytes: 2048 });
        });

        it('returns jobs with artifacts_file without size', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { id: 101, name: 'test', artifacts_file: { filename: 'results.zip' } },
            ]);
            const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0])).toStrictEqual({ id: 101, name: 'test' });
            expect(nonNull(result[0]).size_in_bytes).toBeUndefined();
        });

        it('returns jobs with non-empty artifacts array', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([{ id: 201, name: 'deploy', artifacts: [{ file_type: 'zip' }] }]);
            const result = await glListPipelineArtifacts(mockClient, 'owner', 'repo', 42);

            expect(result).toStrictEqual([{ id: 201, name: 'deploy' }]);
        });

        it('throws when apiGet fails (not silently [])', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glListPipelineArtifacts(mockClient, 'owner', 'repo', 42)).rejects.toThrow('API error');
        });
    });

    describe('GlGetCICDVariables', () => {
        it('calls apiGet and returns variables', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([{ key: 'VAR1', value: 'val1' }]);
            const result = await glGetCICDVariables(mockClient, 'owner', 'repo');

            expect(result).toStrictEqual([{ key: 'VAR1', value: 'val1' }]);
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/variables'), {
                operation: 'buscar variáveis CI/CD',
                params: { per_page: 100 },
            });
        });

        it('throws when apiGet fails (not silently [])', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetCICDVariables(mockClient, 'owner', 'repo')).rejects.toThrow('API error');
        });
    });

    describe('GlDownloadArtifact', () => {
        it('returns buffer and filename from /jobs/{id}/artifacts', async () => {
            expect.hasAssertions();

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
            expect.hasAssertions();

            mockClient.get.mockResolvedValue({
                data: Buffer.from('data'),
                headers: {},
            });
            const result = await glDownloadArtifact(mockClient, 'owner', 'repo', 101);

            expect(result.filename).toBe('artifacts.zip');
        });

        it('throws on API error (mutation)', async () => {
            expect.hasAssertions();

            mockClient.get.mockRejectedValue(new Error('Download failed'));

            await expect(glDownloadArtifact(mockClient, 'owner', 'repo', 999)).rejects.toThrow('Download failed');
        });
    });

    describe('GlGetJobLogs', () => {
        it('returns truncated log text from GET /jobs/{id}/trace', async () => {
            expect.hasAssertions();

            mockClient.get.mockResolvedValue({ data: 'line1\nline2\nline3\n' });
            const result = await glGetJobLogs(mockClient, 'owner', 'repo', 101);

            expect(mockClient['get']).toHaveBeenCalledWith(expect.stringContaining('/jobs/101/trace'), {
                responseType: 'text',
            });
            expect(result).toBe('line1\nline2\nline3\n');
        });

        it('truncates log to maxBytes', async () => {
            expect.hasAssertions();

            const longLog = 'a'.repeat(100);
            mockClient.get.mockResolvedValue({ data: longLog });
            const result = await glGetJobLogs(mockClient, 'owner', 'repo', 101, 10);

            expect(result).toBe('a'.repeat(10));
        });

        it('returns null when job log not found (404)', async () => {
            expect.hasAssertions();

            mockClient.get.mockRejectedValue({ response: { status: 404 } });
            const result = await glGetJobLogs(mockClient, 'owner', 'repo', 999);

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 API error', async () => {
            expect.hasAssertions();

            mockClient.get.mockRejectedValue(new Error('Log not found'));

            await expect(glGetJobLogs(mockClient, 'owner', 'repo', 999)).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlGetRepoTree', () => {
        it('returns manifest file paths from tree', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { name: 'package.json', path: 'package.json', type: 'blob' },
                { name: 'README.md', path: 'README.md', type: 'blob' },
                { name: 'src', path: 'src', type: 'tree' },
                { name: 'package.json', path: 'packages/a/package.json', type: 'blob' },
            ]);

            const result = await glGetRepoTree(mockClient, 'owner', 'repo', 'main');

            expect(result).toStrictEqual(['package.json', 'packages/a/package.json']);
        });

        it('returns empty array when no manifests found', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([{ name: 'README.md', path: 'README.md', type: 'blob' }]);

            const result = await glGetRepoTree(mockClient, 'owner', 'repo', 'main');

            expect(result).toStrictEqual([]);
        });

        it('returns null when tree not found (404)', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue({ response: { status: 404 } });

            const result = await glGetRepoTree(mockClient, 'owner', 'repo', 'main');

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 API error', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetRepoTree(mockClient, 'owner', 'repo', 'main')).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlGetFileContents', () => {
        it('returns file content from Repository Files API', async () => {
            expect.hasAssertions();

            mockClient.get.mockResolvedValue({ data: 'file content here' });

            const result = await glGetFileContents(mockClient, 'owner', 'repo', 'package.json', 'main');

            expect(result).toBe('file content here');
        });

        it('returns null on 404', async () => {
            expect.hasAssertions();

            mockClient.get.mockRejectedValue({ response: { status: 404 } });

            const result = await glGetFileContents(mockClient, 'owner', 'repo', 'missing.txt');

            expect(result).toBeNull();
        });

        it('throws ExternalError on API error (not silently null)', async () => {
            expect.hasAssertions();

            mockClient.get.mockRejectedValue(new Error('API error'));

            await expect(glGetFileContents(mockClient, 'owner', 'repo', 'package.json')).rejects.toBeInstanceOf(
                ExternalError,
            );
        });
    });

    describe('GlListDirectory', () => {
        it('returns directory entries from Tree API', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { name: 'index.ts', path: 'src/index.ts', type: 'blob' },
                { name: 'utils', path: 'src/utils', type: 'tree' },
            ]);

            const result = await glListDirectory(mockClient, 'owner', 'repo', 'src');

            expect(result).toStrictEqual([
                { name: 'index.ts', path: 'src/index.ts', type: 'file' },
                { name: 'utils', path: 'src/utils', type: 'dir' },
            ]);
        });

        it('returns null when directory not found (404)', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue({ response: { status: 404 } });

            const result = await glListDirectory(mockClient, 'owner', 'repo', 'src');

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 API error', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glListDirectory(mockClient, 'owner', 'repo', 'src')).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlGetTestReport', () => {
        it('returns test report from Pipelines API', async () => {
            expect.hasAssertions();

            const report = {
                total_count: 10,
                success_count: 8,
                failed_count: 2,
                skipped_count: 0,
                error_count: 0,
                test_suites: [],
            };
            vi.mocked(apiGet).mockResolvedValue(report);

            const result = await glGetTestReport(mockClient, 'owner', 'repo', 42);

            expect(result).toStrictEqual(report);
        });

        it('returns null when test report not found (404)', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue({ response: { status: 404 } });

            const result = await glGetTestReport(mockClient, 'owner', 'repo', 999);

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 API error', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockRejectedValue(new Error('API error'));

            await expect(glGetTestReport(mockClient, 'owner', 'repo', 42)).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
