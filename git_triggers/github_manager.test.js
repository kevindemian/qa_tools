jest.mock('../shared/http-client', () => ({
    createHttpClient: jest.fn()
}));

const { createHttpClient } = require('../shared/http-client');

jest.mock('../shared/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({ error: jest.fn(), warn: jest.fn() }))
}));

jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    extractErrorMessage: jest.fn(err => err?.message || 'Erro desconhecido'),
}));

const GitHubManager = require('./github_manager');

describe('GitHubManager', () => {
    let mockClient;
    let manager;

    beforeEach(() => {
        mockClient = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() };
        createHttpClient.mockReturnValue(mockClient);
        manager = new GitHubManager('myorg/myrepo', 'ghp_test', 'https://api.github.com');
    });

    describe('constructor', () => {
        it('parses owner/repo from full name', () => {
            expect(manager.owner).toBe('myorg');
            expect(manager.repo).toBe('myrepo');
            expect(manager.provider).toBe('github');
        });

        it('defaults api.github.com when no baseUrl', () => {
            const m = new GitHubManager('a/b', 'tok');
            expect(m.apiUrl).toBe('https://api.github.com');
        });

        it('strips trailing slash from baseUrl', () => {
            const m = new GitHubManager('a/b', 'tok', 'https://ghe.test.com/');
            expect(m.apiUrl).toBe('https://ghe.test.com');
        });
    });

    describe('triggerPipeline', () => {
        it('calls workflow dispatch with workflow_id', async () => {
            mockClient.post.mockResolvedValue({ data: {} });
            const result = await manager.triggerPipeline({ ref: 'main', variables: [{ key: 'VAR', value: 'val' }], workflow_id: '123' });
            expect(mockClient.post).toHaveBeenCalledWith(
                '/repos/myorg/myrepo/actions/workflows/123/dispatches',
                { ref: 'main', inputs: { VAR: 'val' } }
            );
            expect(result.id).toBe('123');
            expect(result.web_url).toContain('actions/runs');
        });

        it('auto-detects first workflow when workflow_id not given', async () => {
            mockClient.get.mockResolvedValue({ data: { workflows: [{ id: 42, name: 'ci' }] } });
            mockClient.post.mockResolvedValue({ data: {} });
            const result = await manager.triggerPipeline({ ref: 'dev', variables: [] });
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/workflows', { params: { per_page: 10 } });
            expect(mockClient.post).toHaveBeenCalledWith(
                '/repos/myorg/myrepo/actions/workflows/42/dispatches',
                { ref: 'dev', inputs: {} }
            );
            expect(result.id).toBe(42);
        });

        it('throws when no workflows found', async () => {
            mockClient.get.mockResolvedValue({ data: { workflows: [] } });
            await expect(manager.triggerPipeline({ ref: 'main', variables: [] })).rejects.toThrow('No workflows found');
        });

        it('throws on API error', async () => {
            mockClient.post.mockRejectedValue(new Error('API error'));
            await expect(manager.triggerPipeline({ ref: 'main', variables: [], workflow_id: '1' })).rejects.toThrow('API error');
        });
    });

    describe('getSchedules', () => {
        it('returns empty array', async () => {
            const result = await manager.getSchedules();
            expect(result).toEqual([]);
        });
    });

    describe('runSchedule', () => {
        it('throws not-implemented error', async () => {
            await expect(manager.runSchedule('1')).rejects.toThrow('not available via REST API');
        });
    });

    describe('createMergeRequest (PR)', () => {
        const args = ['feature', 'main', 'PR Title', 'PR Desc'];
        const mockPR = { number: 10, title: 'PR Title', body: 'PR Desc', html_url: 'https://...', state: 'open', merged: false, head: { ref: 'feature' }, base: { ref: 'main' }, requested_reviewers: [] };

        it('calls POST /pulls on success', async () => {
            mockClient.post.mockResolvedValue({ data: mockPR });
            const result = await manager.createMergeRequest(...args);
            expect(mockClient.post).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls', {
                head: 'feature', base: 'main', title: 'PR Title', body: 'PR Desc'
            });
            expect(result.iid).toBe(10);
            expect(result.web_url).toBe('https://...');
        });

        it('handles 422 (already exists) by searching and updating existing PR', async () => {
            const err = Object.assign(new Error('Unprocessable'), {
                response: { status: 422, data: { errors: [{ message: 'already exists' }] } }
            });
            mockClient.post.mockRejectedValue(err);
            mockClient.get.mockResolvedValue({ data: [{ number: 5, title: 'old', body: 'old', html_url: '', state: 'open', merged: false, head: { ref: 'feature' }, base: { ref: 'main' }, requested_reviewers: [] }] });
            mockClient.patch.mockResolvedValue({ data: { ...mockPR, number: 5 } });

            const result = await manager.createMergeRequest(...args);
            expect(mockClient.patch).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5', {
                title: 'PR Title', body: 'PR Desc'
            });
            expect(result.iid).toBe(5);
        });

        it('re-throws on 422 without already_exists error', async () => {
            const err = Object.assign(new Error('Unprocessable'), {
                response: { status: 422, data: { errors: [{ message: 'other error' }] } }
            });
            mockClient.post.mockRejectedValue(err);
            await expect(manager.createMergeRequest(...args)).rejects.toThrow('Unprocessable');
        });

        it('re-throws on non-422 error', async () => {
            const err = Object.assign(new Error('Bad request'), { response: { status: 400 } });
            mockClient.post.mockRejectedValue(err);
            await expect(manager.createMergeRequest(...args)).rejects.toThrow('Bad request');
        });
    });

    describe('updateMergeRequest', () => {
        it('calls PATCH /pulls/{iid}', async () => {
            mockClient.patch.mockResolvedValue({ data: { number: 5, title: 'New', body: 'New Desc', html_url: '', state: 'open', merged: false, head: { ref: 'dev' }, base: { ref: 'main' }, requested_reviewers: [] } });
            const result = await manager.updateMergeRequest('5', 'dev', 'main', 'New Title', 'New Desc');
            expect(mockClient.patch).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5', {
                title: 'New Title', body: 'New Desc'
            });
            expect(result.iid).toBe(5);
        });

        it('throws on API error', async () => {
            mockClient.patch.mockRejectedValue(new Error('Update failed'));
            await expect(manager.updateMergeRequest('5')).rejects.toThrow('Update failed');
        });
    });

    describe('getMergeRequest', () => {
        it('calls GET /pulls/{iid}', async () => {
            mockClient.get.mockResolvedValue({ data: { number: 5, state: 'open', merged: false, title: 'T', body: 'D', html_url: '', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });
            const result = await manager.getMergeRequest('5');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5');
            expect(result.iid).toBe(5);
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));
            const result = await manager.getMergeRequest('999');
            expect(result).toBeNull();
        });
    });

    describe('searchMergeRequests', () => {
        it('calls GET /pulls with head:owner prefix', async () => {
            const mockPRs = [
                { number: 1, state: 'open', merged: false, title: 'T1', body: '', html_url: '', head: { ref: 'dev' }, base: { ref: 'main' }, requested_reviewers: [] },
                { number: 2, state: 'open', merged: false, title: 'T2', body: '', html_url: '', head: { ref: 'feat' }, base: { ref: 'main' }, requested_reviewers: [] },
            ];
            mockClient.get.mockResolvedValue({ data: mockPRs });
            const result = await manager.searchMergeRequests('dev', 'main', 'opened');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls', {
                params: { head: 'myorg:dev', base: 'main', state: 'open', per_page: 100 }
            });
            expect(result).toHaveLength(2);
        });

        it('maps opened status correctly', async () => {
            mockClient.get.mockResolvedValue({ data: [] });
            await manager.searchMergeRequests('', '', 'opened');
            expect(mockClient.get).toHaveBeenCalledWith(expect.any(String), {
                params: expect.objectContaining({ state: 'open', per_page: 100 })
            });
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.searchMergeRequests('', '', 'opened');
            expect(result).toEqual([]);
        });
    });

    describe('acceptMergeRequest', () => {
        it('calls GET then PUT /pulls/{iid}/merge when open', async () => {
            mockClient.get.mockResolvedValue({ data: { number: 5, state: 'open', merged: false, title: 'T', body: '', html_url: '', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });
            mockClient.put.mockResolvedValue({ data: { number: 5, state: 'open', merged: true, title: 'T', body: '', html_url: 'https://merge', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });

            const result = await manager.acceptMergeRequest('5');
            expect(mockClient.put).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5/merge', {
                delete_branch_on_merge: true
            });
            expect(result.web_url).toBe('https://merge');
        });

        it('returns early without PUT when already merged', async () => {
            mockClient.get.mockResolvedValue({ data: { number: 5, state: 'closed', merged: true, title: 'T', body: '', html_url: 'https://...', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });

            const result = await manager.acceptMergeRequest('5');
            expect(mockClient.put).not.toHaveBeenCalled();
            expect(result.state).toBe('merged');
        });

        it('throws when PR not found', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));
            await expect(manager.acceptMergeRequest('999')).rejects.toThrow('PR #999 not found');
        });

        it('throws on merge API failure', async () => {
            mockClient.get.mockResolvedValue({ data: { number: 5, state: 'open', merged: false, title: 'T', body: '', html_url: '', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });
            mockClient.put.mockRejectedValue(new Error('Merge failed'));
            await expect(manager.acceptMergeRequest('5')).rejects.toThrow('Merge failed');
        });

        it('omits delete_branch_on_merge when false', async () => {
            mockClient.get.mockResolvedValue({ data: { number: 5, state: 'open', merged: false, title: 'T', body: '', html_url: '', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });
            mockClient.put.mockResolvedValue({ data: { number: 5, state: 'open', merged: true, title: 'T', body: '', html_url: '', head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] } });

            await manager.acceptMergeRequest('5', false);
            expect(mockClient.put).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5/merge', {});
        });
    });

    describe('getPipelineJobs', () => {
        it('returns jobs from /actions/runs/{id}/jobs', async () => {
            mockClient.get.mockResolvedValue({
                data: {
                    jobs: [
                        { id: 201, name: 'test (22)', runner_group_name: 'ubuntu', status: 'completed', conclusion: 'success' },
                        { id: 202, name: 'test (24)', runner_group_name: 'ubuntu', status: 'completed', conclusion: 'failure' },
                    ]
                }
            });
            const result = await manager.getPipelineJobs('42');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/runs/42/jobs');
            expect(result).toHaveLength(2);
            expect(result[0].name).toContain('test');
            expect(result[1].status).toBe('failure');
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getPipelineJobs('42');
            expect(result).toEqual([]);
        });
    });

    describe('listPipelineArtifacts', () => {
        it('returns artifacts from /actions/runs/{id}/artifacts', async () => {
            mockClient.get.mockResolvedValue({
                data: {
                    artifacts: [
                        { id: 301, name: 'mochawesome-report', size: 12345 },
                    ]
                }
            });
            const result = await manager.listPipelineArtifacts('42');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/runs/42/artifacts');
            expect(result).toEqual([{ id: 301, name: 'mochawesome-report' }]);
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.listPipelineArtifacts('42');
            expect(result).toEqual([]);
        });
    });

    describe('downloadArtifact', () => {
        it('returns buffer from /actions/artifacts/{id}/zip', async () => {
            mockClient.get.mockResolvedValue({
                data: Buffer.from('zip-data'),
            });
            const result = await manager.downloadArtifact('301');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/artifacts/301/zip', {
                responseType: 'arraybuffer',
                maxRedirects: 5,
            });
            expect(Buffer.isBuffer(result.buffer)).toBe(true);
            expect(result.filename).toBe('artifact.zip');
        });

        it('throws on API error (mutation)', async () => {
            mockClient.get.mockRejectedValue(new Error('Download failed'));
            await expect(manager.downloadArtifact('999')).rejects.toThrow('Download failed');
        });
    });

    describe('getCICDVariables', () => {
        it('calls GET /actions/variables', async () => {
            mockClient.get.mockResolvedValue({ data: { variables: [{ name: 'MY_VAR', value: 'myval' }] } });
            const result = await manager.getCICDVariables();
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/variables', { params: { per_page: 100 } });
            expect(result).toEqual([{ key: 'MY_VAR', value: 'myval', type: 'variable' }]);
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getCICDVariables();
            expect(result).toEqual([]);
        });
    });

    describe('isApproved', () => {
        it('returns true when review is APPROVED', async () => {
            mockClient.get.mockResolvedValue({ data: [{ state: 'APPROVED' }] });
            const result = await manager.isApproved(42);
            expect(result).toBe(true);
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/42/reviews');
        });

        it('returns false when no APPROVED review', async () => {
            mockClient.get.mockResolvedValue({ data: [{ state: 'COMMENTED' }, { state: 'CHANGES_REQUESTED' }] });
            const result = await manager.isApproved(42);
            expect(result).toBe(false);
        });

        it('returns false on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.isApproved(42);
            expect(result).toBe(false);
        });
    });

    describe('_formatPR', () => {
        it('formats open PR', () => {
            const raw = { number: 1, title: 'T', body: 'D', html_url: 'url', state: 'open', merged: false, head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [] };
            const result = manager._formatPR(raw);
            expect(result.iid).toBe(1);
            expect(result.state).toBe('opened');
            expect(result.approved).toBe(false);
        });

        it('formats merged PR', () => {
            const raw = { number: 2, title: 'T', body: 'D', html_url: 'url', state: 'closed', merged: true, head: { ref: 'f' }, base: { ref: 'm' }, requested_reviewers: [{ id: 1 }] };
            const result = manager._formatPR(raw);
            expect(result.state).toBe('merged');
            expect(result.approved).toBe(false);
        });

        it('returns null for null input', () => {
            expect(manager._formatPR(null)).toBeNull();
        });
    });

    describe('getRecentPipelines', () => {
        it('calls GET /actions/runs with per_page', async () => {
            mockClient.get.mockResolvedValue({ data: { workflow_runs: [{ id: 1, run_number: 123, head_branch: 'main', status: 'completed', conclusion: 'success' }] } });
            const result = await manager.getRecentPipelines(3);
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/runs', {
                params: { per_page: 3 }
            });
            expect(result).toHaveLength(1);
        });

        it('defaults to count=5', async () => {
            mockClient.get.mockResolvedValue({ data: { workflow_runs: [] } });
            await manager.getRecentPipelines();
            expect(mockClient.get).toHaveBeenCalledWith(expect.any(String), {
                params: { per_page: 5 }
            });
        });

        it('returns [] on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('API error'));
            const result = await manager.getRecentPipelines();
            expect(result).toEqual([]);
        });
    });

    describe('getPipeline', () => {
        it('calls GET /actions/runs/{id}', async () => {
            mockClient.get.mockResolvedValue({ data: { id: 42, status: 'completed', conclusion: 'success' } });
            const result = await manager.getPipeline('42');
            expect(mockClient.get).toHaveBeenCalledWith('/repos/myorg/myrepo/actions/runs/42');
            expect(result).toEqual({ id: 42, status: 'completed', conclusion: 'success' });
        });

        it('returns null on API error', async () => {
            mockClient.get.mockRejectedValue(new Error('Not found'));
            const result = await manager.getPipeline('999');
            expect(result).toBeNull();
        });
    });
});
