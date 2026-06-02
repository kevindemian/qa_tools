import { createThrottledClient } from '../shared/http-client';
import GitLabManager from './gitlab_manager';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory';
import { nonNull } from '../shared/test-utils';

jest.mock('../shared/http-client', () => ({
    createHttpClient: jest.fn(),
    createThrottledClient: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({ error: jest.fn() })),
    rootLogger: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    extractErrorMessage: jest.fn((err: Error) => err?.message || 'Erro desconhecido'),
}));

jest.mock('../shared/git-provider-error', () => ({
    handleError: jest.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

describe('GitLabManager', () => {
    let mockClient: ReturnType<typeof createMockAxiosInstance>;
    let manager: GitLabManager;

    beforeEach(() => {
        mockClient = createMockAxiosInstance();
        jest.mocked(createThrottledClient).mockReturnValue(mockClient);
        manager = new GitLabManager('project-123', 'test-token', 'https://gitlab.test.com');
    });

    describe('constructor', () => {
        it('throws when apiToken is empty string', () => {
            expect(() => new GitLabManager('project-123', '', 'https://gitlab.test.com')).toThrow(
                'apiToken é obrigatório',
            );
        });

        it('throws when projectId is empty string', () => {
            expect(() => new GitLabManager('', 'test-token', 'https://gitlab.test.com')).toThrow(
                'projectId é obrigatório',
            );
        });
    });

    describe('triggerPipeline', () => {
        it('calls POST /pipeline, returns data', async () => {
            mockClient.post.mockResolvedValue({ data: { id: 1, web_url: 'https://...' } });
            const result = await manager.triggerPipeline({ ref: 'main', variables: [] });
            expect(mockClient.post).toHaveBeenCalledWith('/projects/project-123/pipeline', {
                ref: 'main',
                variables: [],
            });
            expect(result).toEqual({ id: 1, web_url: 'https://...' });
        });

        it('throws on API error (mutation)', async () => {
            mockClient.post.mockRejectedValue(new Error('API error'));
            await expect(manager.triggerPipeline({} as { ref: string; variables: never[] })).rejects.toThrow(
                'API error',
            );
        });
    });

    describe('getSchedules', () => {
        it('calls GET /pipeline_schedules with per_page=100', async () => {
            mockClient.get.mockResolvedValue({ data: [{ id: 1, description: 'Daily' }] });
            const result = await manager.getSchedules();
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/pipeline_schedules', {
                params: { per_page: 100 },
            });
            expect(result).toEqual([{ id: 1, description: 'Daily' }]);
        });

        it('returns [] on API error (read)', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getSchedules();
            expect(result).toEqual([]);
        });
    });

    describe('runSchedule', () => {
        it('calls POST /pipeline_schedules/{id}/play', async () => {
            mockClient.post.mockResolvedValue({ data: { id: 42 } });
            const result = await manager.runSchedule('42');
            expect(mockClient.post).toHaveBeenCalledWith('/projects/project-123/pipeline_schedules/42/play');
            expect(result).toEqual({ id: 42 });
        });

        it('throws on API error (mutation)', async () => {
            mockClient.post.mockRejectedValue(new Error('API error'));
            await expect(manager.runSchedule('42')).rejects.toThrow('API error');
        });
    });

    describe('createMergeRequest', () => {
        const args = ['feature', 'main', 'MR Title', 'MR Desc'] as const;

        it('calls POST /merge_requests on success', async () => {
            mockClient.post.mockResolvedValue({ data: { iid: 10, web_url: 'https://...' } });
            const result = await manager.createMergeRequest(...args);
            expect(mockClient.post).toHaveBeenCalledWith('/projects/project-123/merge_requests', {
                id: 'project-123',
                source_branch: 'feature',
                target_branch: 'main',
                title: 'MR Title',
                description: 'MR Desc',
            });
            expect(result).toMatchObject({ iid: 10, web_url: 'https://...' });
        });

        it('handles 409 by searching and updating existing MR', async () => {
            const err = Object.assign(new Error('Conflict'), { response: { status: 409 } });
            mockClient.post.mockRejectedValue(err);
            mockClient.get.mockResolvedValue({ data: [{ iid: 5 }] });
            mockClient.put.mockResolvedValue({ data: { iid: 5 } });

            const result = await manager.createMergeRequest(...args);
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/merge_requests', {
                params: { state: 'opened', source_branch: 'feature', target_branch: 'main', per_page: 100 },
            });
            expect(mockClient.put).toHaveBeenCalledWith('/projects/project-123/merge_requests/5', {
                title: 'MR Title',
                description: 'MR Desc',
            });
            expect(result).toMatchObject({ iid: 5 });
        });

        it('re-throws on 409 when no existing MR found', async () => {
            const err = Object.assign(new Error('Conflict'), { response: { status: 409 } });
            mockClient.post.mockRejectedValue(err);
            mockClient.get.mockResolvedValue({ data: [] });

            await expect(manager.createMergeRequest(...args)).rejects.toThrow('Conflict');
        });

        it('re-throws on non-409 error', async () => {
            const err = Object.assign(new Error('Bad request'), { response: { status: 400 } });
            mockClient.post.mockRejectedValue(err);

            await expect(manager.createMergeRequest(...args)).rejects.toThrow('Bad request');
        });
    });

    describe('updateMergeRequest', () => {
        it('calls PUT /merge_requests/{iid}', async () => {
            mockClient.put.mockResolvedValue({ data: { iid: 5 } });
            const result = await manager.updateMergeRequest('5', 'New Title', 'New Desc');
            expect(mockClient.put).toHaveBeenCalledWith('/projects/project-123/merge_requests/5', {
                title: 'New Title',
                description: 'New Desc',
            });
            expect(result).toMatchObject({ iid: 5 });
        });

        it('throws on API error (mutation)', async () => {
            mockClient.put.mockRejectedValue(new Error('Update failed'));
            await expect(manager.updateMergeRequest('5', '', '')).rejects.toThrow('Update failed');
        });
    });

    describe('getMergeRequest', () => {
        it('calls GET /merge_requests/{iid}', async () => {
            mockClient.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            const result = await manager.getMergeRequest('5');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/merge_requests/5');
            expect(result).toMatchObject({ iid: 5, state: 'opened' });
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));
            const result = await manager.getMergeRequest('999');
            expect(result).toBeNull();
        });
    });

    describe('searchMergeRequests', () => {
        it('calls GET /merge_requests with per_page=100', async () => {
            mockClient.get.mockResolvedValue({ data: [{ iid: 1 }, { iid: 2 }] });
            const result = await manager.searchMergeRequests('dev', 'main', 'opened');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/merge_requests', {
                params: { state: 'opened', source_branch: 'dev', target_branch: 'main', per_page: 100 },
            });
            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ iid: 1 });
            expect(result[1]).toMatchObject({ iid: 2 });
        });

        it('returns [] on API error (read)', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.searchMergeRequests('', '', 'opened');
            expect(result).toEqual([]);
        });
    });

    describe('acceptMergeRequest', () => {
        it('calls GET then PUT /merge_requests/{iid}/merge when state is opened', async () => {
            mockClient.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            mockClient.put.mockResolvedValue({ data: { web_url: 'https://merge' } });

            const result = await manager.acceptMergeRequest('5');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/merge_requests/5');
            expect(mockClient.put).toHaveBeenCalledWith('/projects/project-123/merge_requests/5/merge', {
                should_remove_source_branch: true,
            });
            expect(result).toMatchObject({ web_url: 'https://merge' });
        });

        it('returns early without PUT when already merged', async () => {
            mockClient.get.mockResolvedValue({ data: { iid: 5, state: 'merged', web_url: 'https://...' } });

            const result = await manager.acceptMergeRequest('5');
            expect(mockClient.put).not.toHaveBeenCalled();
            expect(result).toMatchObject({ iid: 5, state: 'merged', web_url: 'https://...' });
        });

        it('throws when MR not found', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));

            await expect(manager.acceptMergeRequest('999')).rejects.toThrow('MR #999 not found');
        });

        it('throws on merge API failure', async () => {
            mockClient.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            mockClient.put.mockRejectedValue(new Error('Merge failed'));

            await expect(manager.acceptMergeRequest('5')).rejects.toThrow('Merge failed');
        });

        it('passes should_remove_source_branch=false when specified', async () => {
            mockClient.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            mockClient.put.mockResolvedValue({ data: {} });

            await manager.acceptMergeRequest('5', false);
            expect(mockClient.put).toHaveBeenCalledWith('/projects/project-123/merge_requests/5/merge', {
                should_remove_source_branch: false,
            });
        });
    });

    describe('getRecentPipelines', () => {
        it('calls GET /pipelines with per_page and order_by', async () => {
            mockClient.get.mockResolvedValue({ data: [{ id: 1, ref: 'main', status: 'success' }] });
            const result = await manager.getRecentPipelines(3);
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/pipelines', {
                params: { per_page: 3, order_by: 'updated_at' },
            });
            expect(result).toEqual([{ id: 1, ref: 'main', status: 'success' }]);
        });

        it('defaults to count=5', async () => {
            mockClient.get.mockResolvedValue({ data: [] });
            await manager.getRecentPipelines();
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/pipelines', {
                params: { per_page: 5, order_by: 'updated_at' },
            });
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getRecentPipelines();
            expect(result).toEqual([]);
        });
    });

    describe('getPipeline', () => {
        it('calls GET /pipelines/{id}', async () => {
            mockClient.get.mockResolvedValue({ data: { id: 42, status: 'success', web_url: 'https://...' } });
            const result = await manager.getPipeline('42');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/pipelines/42');
            expect(result).toEqual({ id: 42, status: 'success', web_url: 'https://...' });
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));
            const result = await manager.getPipeline('999');
            expect(result).toBeNull();
        });
    });

    describe('getBranch', () => {
        it('returns { name } for valid branch', async () => {
            mockClient.get.mockResolvedValue({ data: { name: 'main' } });
            const result = await manager.getBranch('main');
            expect(result).toEqual({ name: 'main' });
        });

        it('returns null when data is null', async () => {
            mockClient.get.mockResolvedValue({ data: null });
            const result = await manager.getBranch('main');
            expect(result).toBeNull();
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getBranch('main');
            expect(result).toBeNull();
        });
    });

    describe('getPipelineJobs', () => {
        it('returns formatted jobs from /pipelines/{id}/jobs', async () => {
            mockClient.get.mockResolvedValue({
                data: [
                    { id: 101, name: 'test', stage: 'test', status: 'success' },
                    { id: 102, name: 'build', stage: 'build', status: 'success' },
                ],
            });
            const result = await manager.getPipelineJobs('42');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/pipelines/42/jobs');
            expect(result).toEqual([
                { id: 101, name: 'test', stage: 'test', status: 'success' },
                { id: 102, name: 'build', stage: 'build', status: 'success' },
            ]);
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getPipelineJobs('42');
            expect(result).toEqual([]);
        });
    });

    describe('listPipelineArtifacts', () => {
        it('returns jobs with artifacts from pipeline jobs', async () => {
            mockClient.get.mockResolvedValue({
                data: [
                    {
                        id: 101,
                        name: 'test',
                        stage: 'test',
                        status: 'success',
                        artifacts_file: { filename: 'results.zip' },
                    },
                    { id: 102, name: 'build', stage: 'build', status: 'success', artifacts: [] },
                    { id: 103, name: 'lint', stage: 'lint', status: 'success' },
                ],
            });
            const result = await manager.listPipelineArtifacts('42');
            expect(result).toEqual([{ id: 101, name: 'test' }]);
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.listPipelineArtifacts('42');
            expect(result).toEqual([]);
        });
    });

    describe('downloadArtifact', () => {
        it('returns buffer and filename from /jobs/{id}/artifacts', async () => {
            mockClient.get.mockResolvedValue({
                data: Buffer.from('fake-zip-content'),
                headers: { 'content-disposition': 'attachment; filename="artifacts.zip"' },
            });
            const result = await manager.downloadArtifact('101');
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/jobs/101/artifacts', {
                responseType: 'arraybuffer',
            });
            expect(Buffer.isBuffer(result.buffer)).toBe(true);
            expect(result.filename).toBe('artifacts.zip');
        });

        it('falls back to artifacts.zip when no content-disposition', async () => {
            mockClient.get.mockResolvedValue({
                data: Buffer.from('data'),
                headers: {},
            });
            const result = await manager.downloadArtifact('101');
            expect(result.filename).toBe('artifacts.zip');
        });

        it('throws on API error (mutation)', async () => {
            mockClient.get.mockRejectedValue(new Error('Download failed'));
            await expect(manager.downloadArtifact('999')).rejects.toThrow('Download failed');
        });
    });

    describe('isApproved', () => {
        it('returns true when approved', async () => {
            mockClient.get.mockResolvedValue({ data: { approved: true } });
            const result = await manager.isApproved(42);
            expect(result).toBe(true);
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/merge_requests/42/approvals');
        });

        it('returns false when not approved', async () => {
            mockClient.get.mockResolvedValue({ data: { approved: false } });
            const result = await manager.isApproved(42);
            expect(result).toBe(false);
        });

        it('returns false on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.isApproved(42);
            expect(result).toBe(false);
        });
    });

    describe('getCICDVariables', () => {
        it('calls GET /variables with per_page=100', async () => {
            mockClient.get.mockResolvedValue({ data: [{ key: 'VAR1', value: 'val1' }] });
            const result = await manager.getCICDVariables();
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/variables', {
                params: { per_page: 100 },
            });
            expect(result).toEqual([{ key: 'VAR1', value: 'val1' }]);
        });

        it('returns [] on API error (read)', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getCICDVariables();
            expect(result).toEqual([]);
        });
    });

    describe('getDiff', () => {
        it('return diff string for valid comparison', async () => {
            mockClient.get.mockResolvedValue({
                data: { diffs: [{ diff: '+console.log("hi")', new_path: 'src/main.ts' }] },
            });
            const result = await manager.getDiff('feature', 'main');
            expect(result).toContain('src/main.ts');
            expect(result).toContain('console.log');
        });

        it('returns empty string when no diffs', async () => {
            mockClient.get.mockResolvedValue({ data: { diffs: [] } });
            const result = await manager.getDiff('feature', 'main');
            expect(result).toBe('');
        });

        it('returns empty string when data is null', async () => {
            mockClient.get.mockResolvedValue({ data: null });
            const result = await manager.getDiff('feature', 'main');
            expect(result).toBe('');
        });

        it('handles missing diff property', async () => {
            mockClient.get.mockResolvedValue({
                data: { diffs: [{ new_path: 'readme.md' }] },
            });
            const result = await manager.getDiff('feature', 'main');
            expect(result).toBe('');
        });
    });

    describe('getOpenIssues', () => {
        const ISSUE_FIXTURE = {
            iid: 42,
            title: 'Test bug',
            state: 'opened',
            updated_at: '2026-01-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            labels: ['bug', 'critical'],
            web_url: 'https://gitlab.test.com/project-123/-/issues/42',
        };

        it('returns formatted issues from GET /issues', async () => {
            mockClient.get.mockResolvedValue({ data: [ISSUE_FIXTURE] });
            const result = await manager.getOpenIssues();
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/issues', {
                params: { state: 'opened', per_page: 30 },
            });
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                number: 42,
                title: 'Test bug',
                state: 'opened',
            });
        });

        it('returns [] on API error (read)', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getOpenIssues();
            expect(result).toEqual([]);
        });

        it('returns [] when data is not an array', async () => {
            mockClient.get.mockResolvedValue({ data: null });
            const result = await manager.getOpenIssues();
            expect(result).toEqual([]);
        });

        it('maps labels as flat strings', async () => {
            const item = { ...ISSUE_FIXTURE, labels: ['bug', 'priority:high'] };
            mockClient.get.mockResolvedValue({ data: [item] });
            const result = await manager.getOpenIssues();
            expect(nonNull(result[0]).labels).toEqual(['bug', 'priority:high']);
        });

        it('handles missing optional fields gracefully', async () => {
            mockClient.get.mockResolvedValue({ data: [{ iid: 1 }] });
            const result = await manager.getOpenIssues();
            expect(nonNull(result[0]).title).toBe('');
            expect(nonNull(result[0]).number).toBe(1);
        });
    });

    describe('getJobLogs', () => {
        it('returns truncated log text from GET /jobs/{id}/trace', async () => {
            mockClient.get.mockResolvedValue({ data: 'line1\nline2\nline3\n' });
            const result = await manager.getJobLogs(101);
            expect(mockClient.get).toHaveBeenCalledWith('/projects/project-123/jobs/101/trace', {
                responseType: 'text',
            });
            expect(result).toBe('line1\nline2\nline3\n');
        });

        it('truncates log to maxBytes', async () => {
            const longLog = 'a'.repeat(100);
            mockClient.get.mockResolvedValue({ data: longLog });
            const result = await manager.getJobLogs(101, 10);
            expect(result).toBe('a'.repeat(10));
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('Log not found'));
            const result = await manager.getJobLogs(999);
            expect(result).toBeNull();
        });
    });
});
