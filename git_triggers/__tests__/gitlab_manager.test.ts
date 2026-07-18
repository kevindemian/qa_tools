import { afterEach, describe, expect, it, vi } from 'vitest';

const client = { get: vi.fn(), put: vi.fn(), post: vi.fn() };

vi.mock('../../shared/infra/http-client.js', () => ({ createThrottledClient: vi.fn(() => client) }));
vi.mock('../../shared/logger.js', () => ({
    Logger: class {
        constructor(_o?: unknown) {}
    },
}));
vi.mock('../../shared/ci/git-provider-error.js', () => ({ handleError: vi.fn((_e: unknown) => null) }));

vi.mock('../gitlab-workflow.js', () => ({
    glTriggerPipeline: vi.fn(),
    glGetRecentPipelines: vi.fn(),
    glGetPipeline: vi.fn(),
    glGetPipelineJobs: vi.fn(),
    glListPipelineArtifacts: vi.fn(),
    glDownloadArtifact: vi.fn(),
    glGetCICDVariables: vi.fn(),
    glGetJobLogs: vi.fn(),
    glGetSchedules: vi.fn(),
    glRunSchedule: vi.fn(),
    glGetFileContents: vi.fn(),
    glListDirectory: vi.fn(),
    glGetRepoTree: vi.fn(),
    glGetTestReport: vi.fn(),
}));
vi.mock('../gitlab-pr.js', () => ({
    glCreateMergeRequest: vi.fn(),
    glUpdateMergeRequest: vi.fn(),
    glGetMergeRequest: vi.fn(),
    glSearchMergeRequests: vi.fn(),
    glAcceptMergeRequest: vi.fn(),
    glIsApproved: vi.fn(),
}));
vi.mock('../gitlab-issues.js', () => ({ glGetOpenIssues: vi.fn() }));
vi.mock('../gitlab-branch.js', () => ({ glGetBranch: vi.fn(), glGetDiff: vi.fn() }));

import { handleError } from '../../shared/ci/git-provider-error.js';
import GitLabManager from '../gitlab_manager.js';

import * as wf from '../gitlab-workflow.js';
import * as pr from '../gitlab-pr.js';
import * as issue from '../gitlab-issues.js';
import * as branch from '../gitlab-branch.js';

function makeManager(): GitLabManager {
    return new GitLabManager('group/proj', 'token-123', 'https://gl.example.com');
}

describe('Gitlab_manager', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Constructor', () => {
        it('throws when apiToken is empty', () => {
            expect.hasAssertions();
            expect(() => new GitLabManager('p', '', 'https://gl')).toThrow(/apiToken/);
        });

        it('throws when projectId is empty', () => {
            expect.hasAssertions();
            expect(() => new GitLabManager('', 'tok', 'https://gl')).toThrow(/projectId/);
        });

        it('builds apiUrl from base url and normalizes repo', () => {
            expect.hasAssertions();

            const m = makeManager();

            expect(m['apiUrl']).toBe('https://gl.example.com/api/v4');
            expect(m['repo']).toBe('group/proj');
            expect(m['owner']).toBe('');
        });
    });

    describe('Delegating read methods', () => {
        it('triggerPipeline delegates to glTriggerPipeline', async () => {
            expect.hasAssertions();

            vi.mocked(wf.glTriggerPipeline).mockResolvedValue({ id: 1 });
            const out = await makeManager().triggerPipeline({ ref: 'main', variables: [] });

            expect(wf.glTriggerPipeline).toHaveBeenCalledWith(client, '', 'group/proj', { ref: 'main', variables: [] });
            expect(out).toStrictEqual({ id: 1 });
        });

        it('getSchedules / runSchedule delegate', async () => {
            expect.hasAssertions();

            vi.mocked(wf.glGetSchedules).mockResolvedValue([{ id: 9 }] as never);
            const m = makeManager();
            await m.getSchedules();
            await m.runSchedule(9);

            expect(wf.glGetSchedules).toHaveBeenCalledWith(client, '', 'group/proj');
            expect(wf.glRunSchedule).toHaveBeenCalledWith(client, '', 'group/proj', 9);
        });

        it('merge request CRUD delegates', async () => {
            expect.hasAssertions();

            const m = makeManager();
            await m.createMergeRequest('s', 't', 'title');
            await m.updateMergeRequest(1, 't2');
            await m.getMergeRequest(1);
            await m.searchMergeRequests('s', 't', 'opened');
            await m.acceptMergeRequest(1, false);
            await m.isApproved(1);

            expect(pr.glCreateMergeRequest).toHaveBeenCalledWith(
                client,
                '',
                'group/proj',
                's',
                't',
                'title',
                undefined,
            );
            expect(pr.glUpdateMergeRequest).toHaveBeenCalledWith(client, '', 'group/proj', 1, 't2', undefined);
            expect(pr.glGetMergeRequest).toHaveBeenCalledWith(client, '', 'group/proj', 1);
            expect(pr.glSearchMergeRequests).toHaveBeenCalledWith(client, '', 'group/proj', 's', 't', 'opened');
            expect(pr.glAcceptMergeRequest).toHaveBeenCalledWith(client, '', 'group/proj', 1, false);
            expect(pr.glIsApproved).toHaveBeenCalledWith(client, '', 'group/proj', 1);
        });

        it('pipeline + artifact reads delegate', async () => {
            expect.hasAssertions();

            const m = makeManager();
            await m.getRecentPipelines(3);
            await m.getPipeline(5);
            await m.getPipelineJobs(5);
            await m.listPipelineArtifacts(5);
            await m.getCICDVariables();
            await m.getJobLogs(7);
            await m.downloadArtifact(8);

            expect(wf.glGetRecentPipelines).toHaveBeenCalledWith(client, '', 'group/proj', 3, undefined);
            expect(wf.glGetPipeline).toHaveBeenCalledWith(client, '', 'group/proj', 5);
            expect(wf.glGetPipelineJobs).toHaveBeenCalledWith(client, '', 'group/proj', 5);
            expect(wf.glListPipelineArtifacts).toHaveBeenCalledWith(client, '', 'group/proj', 5);
            expect(wf.glGetCICDVariables).toHaveBeenCalledWith(client, '', 'group/proj');
            expect(wf.glGetJobLogs).toHaveBeenCalledWith(client, '', 'group/proj', 7, 10240);
            expect(wf.glDownloadArtifact).toHaveBeenCalledWith(client, '', 'group/proj', 8);
        });

        it('branch / diff / issues delegate', async () => {
            expect.hasAssertions();

            const m = makeManager();
            await m.getBranch('main');
            await m.getDiff('a', 'b');
            await m.getOpenIssues();

            expect(branch.glGetBranch).toHaveBeenCalledWith(client, '', 'group/proj', 'main');
            expect(branch.glGetDiff).toHaveBeenCalledWith(client, '', 'group/proj', 'a', 'b');
            expect(issue.glGetOpenIssues).toHaveBeenCalledWith(client, '', 'group/proj');
        });

        it('file/directory/tree/test-report overrides delegate', async () => {
            expect.hasAssertions();

            const m = makeManager();
            await m.getFileContents('x.ts');
            await m.listDirectory('src');
            await m.getRepoTree('main');
            await m.getTestReport(5);

            expect(wf.glGetFileContents).toHaveBeenCalledWith(client, '', 'group/proj', 'x.ts', undefined);
            expect(wf.glListDirectory).toHaveBeenCalledWith(client, '', 'group/proj', 'src', undefined);
            expect(wf.glGetRepoTree).toHaveBeenCalledWith(client, '', 'group/proj', 'main');
            expect(wf.glGetTestReport).toHaveBeenCalledWith(client, '', 'group/proj', 5);
        });
    });

    describe('Put', () => {
        it('returns null on 204 status', async () => {
            expect.hasAssertions();

            client.put.mockResolvedValue({ status: 204, data: undefined });
            const out = await makeManager()['_put']('/x', { a: 1 });

            expect(client.put).toHaveBeenCalledWith('/x', { a: 1 });
            expect(out).toBeNull();
        });

        it('returns data when status is not 204', async () => {
            expect.hasAssertions();

            client.put.mockResolvedValue({ status: 200, data: { ok: true } });
            const out = await makeManager()['_put']('/x', { a: 1 });

            expect(out).toStrictEqual({ ok: true });
        });

        it('omits the body argument when undefined', async () => {
            expect.hasAssertions();

            client.put.mockResolvedValue({ status: 200, data: 'd' });
            await makeManager()['_put']('/x');

            expect(client.put).toHaveBeenCalledWith('/x');
        });

        it('surfaces errors through handleError', async () => {
            expect.hasAssertions();

            client.put.mockRejectedValue(new Error('boom'));
            const out = await makeManager()['_put']('/x', undefined, { operation: 'op' });

            expect(handleError).toHaveBeenCalledWith(expect.any(Error), { context: 'op' });
            expect(out).toBeNull();
        });
    });

    describe('DORA / deployments / releases / issues', () => {
        it('getDoraMetrics returns null when data is null', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ status: 200, data: null });
            const out = await makeManager().getDoraMetrics();

            expect(client.get).toHaveBeenCalledWith('/projects/group%2Fproj/dora/metrics');
            expect(out).toBeNull();
        });

        it('getDeployments defaults to empty array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ status: 200, data: null });

            await expect(makeManager().getDeployments()).resolves.toStrictEqual([]);
        });

        it('getReleases defaults to empty array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ status: 200, data: null });

            await expect(makeManager().getReleases()).resolves.toStrictEqual([]);
        });

        it('getIssues passes state param when provided', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ status: 200, data: [] });
            await makeManager().getIssues('opened');
            const opts = client.get.mock.calls[0]?.[1] as { params?: { state: string } };

            expect(opts.params?.state).toBe('opened');
        });

        it('getIssues omits params when state is undefined', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ status: 200, data: [] });
            await makeManager().getIssues();
            const opts = client.get.mock.calls[0]?.[1] as { params?: unknown } | undefined;

            expect(opts?.params).toBeUndefined();
        });
    });
});
