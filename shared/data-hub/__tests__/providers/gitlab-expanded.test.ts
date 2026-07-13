/**
 * Expanded GitLab extraction tests (EIXO A — FASE EXPAND+STORE).
 *
 * Verifies that GitLabDataProvider.fetchRawData populates raw.doraMetrics,
 * deployments, releases and pmIssues from the optional GitProvider methods
 * (getDoraMetrics / getDeployments / getReleases / getIssues), with correct
 * shape and provenance, plus negative/edge cases.
 */
import { describe, it, expect, vi } from 'vitest';
import { GitLabDataProvider } from '../../providers/gitlab-provider.js';
import { createMockGitProvider } from '../../../test-utils/factories/git-provider-factory.js';
import type { GitLabDoraRaw, GitLabDeploymentRaw, GitLabReleaseRaw, GitLabIssueRaw } from '../../../types/ci-cd.js';

function makeRun(id: number) {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
    };
}

const sampleDora: GitLabDoraRaw = {
    deployment_frequency: 3.5,
    lead_time_for_changes: 120000,
    time_to_restore_service: 3600000,
    change_failure_rate: 0.1,
};

const sampleDeployments: GitLabDeploymentRaw[] = [
    {
        id: 1,
        environment: { name: 'production' },
        status: 'success',
        sha: 'abc123',
        ref: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        url: 'https://gitlab.example.com/group/project/deployments/1',
    },
];

const sampleReleases: GitLabReleaseRaw[] = [
    {
        id: 10,
        tag_name: 'v1.2.0',
        name: 'Release 1.2.0',
        released_at: '2026-07-02T08:00:00Z',
        upcoming: false,
        _links: { self: 'https://gitlab.example.com/group/project/releases/v1.2.0' },
    },
];

const sampleIssues: GitLabIssueRaw[] = [
    {
        id: 100,
        iid: 5,
        title: 'Bug in parser',
        state: 'opened',
        web_url: 'https://gitlab.example.com/group/project/issues/5',
        author: { username: 'alice' },
        labels: ['bug', 'p1'],
        created_at: '2026-07-01T09:00:00Z',
        updated_at: '2026-07-01T09:30:00Z',
    },
];

function baseProvider(overrides: Record<string, unknown>) {
    return createMockGitProvider({
        getRecentPipelines: vi.fn().mockResolvedValue([makeRun(1)]),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        ...overrides,
    });
}

describe('GitLabDataProvider — expanded extraction (EIXO A)', () => {
    it('populates doraMetrics with finite values', async () => {
        expect.assertions(6);

        const provider = baseProvider({ getDoraMetrics: vi.fn().mockResolvedValue(sampleDora) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.doraMetrics?.source).toBe('gitlab');
        expect(result.doraMetrics?.confidence).toBeCloseTo(0.9);
        expect(result.doraMetrics?.deploymentFrequency).toBe(3.5);
        expect(result.doraMetrics?.leadTimeForChanges).toBe(120000);
        expect(result.doraMetrics?.meanTimeToRecovery).toBe(3600000);
        expect(result.doraMetrics?.changeFailureRate).toBeCloseTo(0.1);
    });

    it('records doraMetrics provenance', async () => {
        expect.assertions(1);

        const provider = baseProvider({ getDoraMetrics: vi.fn().mockResolvedValue(sampleDora) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.provenance?.get('doraMetrics')?.source).toBe('gitlab-api');
    });

    it('populates deployments with mapped shape', async () => {
        expect.assertions(8);

        const provider = baseProvider({ getDeployments: vi.fn().mockResolvedValue(sampleDeployments) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.deployments).toHaveLength(1);

        const dep = result.deployments?.[0];

        expect(dep?.id).toBe('1');
        expect(dep?.environment).toBe('production');
        expect(dep?.status).toBe('success');
        expect(dep?.sha).toBe('abc123');
        expect(dep?.ref).toBe('main');
        expect(dep?.url).toBe('https://gitlab.example.com/group/project/deployments/1');
        expect(dep?.confidence).toBeCloseTo(0.9);
    });

    it('records deployments provenance', async () => {
        expect.assertions(2);

        const provider = baseProvider({ getDeployments: vi.fn().mockResolvedValue(sampleDeployments) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.provenance?.get('deployments')?.source).toBe('gitlab-api');
        expect(result.deployments?.[0]?.createdAt).toBe('2026-07-01T10:00:00Z');
    });

    it('populates releases with mapped shape', async () => {
        expect.assertions(8);

        const provider = baseProvider({ getReleases: vi.fn().mockResolvedValue(sampleReleases) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.releases).toHaveLength(1);

        const rel = result.releases?.[0];

        expect(rel?.id).toBe('10');
        expect(rel?.tag).toBe('v1.2.0');
        expect(rel?.draft).toBeFalsy();
        expect(rel?.prerelease).toBeFalsy();
        expect(rel?.createdAt).toBe('2026-07-02T08:00:00Z');
        expect(rel?.name).toBe('Release 1.2.0');
        expect(rel?.confidence).toBeCloseTo(0.9);
    });

    it('records releases provenance and url', async () => {
        expect.assertions(2);

        const provider = baseProvider({ getReleases: vi.fn().mockResolvedValue(sampleReleases) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.provenance?.get('releases')?.source).toBe('gitlab-api');
        expect(result.releases?.[0]?.url).toBe('https://gitlab.example.com/group/project/releases/v1.2.0');
    });

    it('populates pmIssues with mapped shape', async () => {
        expect.assertions(8);

        const provider = baseProvider({ getIssues: vi.fn().mockResolvedValue(sampleIssues) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.pmIssues).toHaveLength(1);

        const issue = result.pmIssues?.[0];

        expect(issue?.source).toBe('gitlab');
        expect(issue?.id).toBe('100');
        expect(issue?.key).toBe(5);
        expect(issue?.title).toBe('Bug in parser');
        expect(issue?.state).toBe('opened');
        expect(issue?.author).toBe('alice');
        expect(issue?.labels).toStrictEqual(['bug', 'p1']);
    });

    it('records pmIssues provenance and timestamps', async () => {
        expect.assertions(3);

        const provider = baseProvider({ getIssues: vi.fn().mockResolvedValue(sampleIssues) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.provenance?.get('pmIssues')?.source).toBe('gitlab-api');
        expect(result.pmIssues?.[0]?.createdAt).toBe('2026-07-01T09:00:00Z');
        expect(result.pmIssues?.[0]?.url).toBe('https://gitlab.example.com/group/project/issues/5');
    });

    it('does nothing when the optional methods are absent', async () => {
        expect.assertions(8);

        const provider = baseProvider({});
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.doraMetrics).toBeUndefined();
        expect(result.deployments).toBeUndefined();
        expect(result.releases).toBeUndefined();
        expect(result.pmIssues).toBeUndefined();
        expect(result.provenance?.has('doraMetrics')).toBeFalsy();
        expect(result.provenance?.has('deployments')).toBeFalsy();
        expect(result.provenance?.has('releases')).toBeFalsy();
        expect(result.provenance?.has('pmIssues')).toBeFalsy();
    });

    it('negative: getDoraMetrics null leaves doraMetrics undefined', async () => {
        expect.assertions(2);

        const provider = baseProvider({ getDoraMetrics: vi.fn().mockResolvedValue(null) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.doraMetrics).toBeUndefined();
        expect(result.provenance?.has('doraMetrics')).toBeFalsy();
    });

    it('negative: non-finite DORA values are omitted, not coerced', async () => {
        expect.assertions(4);

        const partialDora = {
            deployment_frequency: 3.5,
            lead_time_for_changes: NaN,
            time_to_restore_service: NaN,
            change_failure_rate: Infinity,
        } as GitLabDoraRaw;
        const provider = baseProvider({ getDoraMetrics: vi.fn().mockResolvedValue(partialDora) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.doraMetrics?.deploymentFrequency).toBe(3.5);
        expect(result.doraMetrics?.leadTimeForChanges).toBeUndefined();
        expect(result.doraMetrics?.meanTimeToRecovery).toBeUndefined();
        expect(result.doraMetrics?.changeFailureRate).toBeUndefined();
    });

    it('negative: issues missing required fields are dropped', async () => {
        expect.assertions(2);

        const badIssues = [
            { id: 100, iid: 5, title: 'ok', state: 'opened' },
            { id: 101 },
            { iid: 6, title: 'no id', state: 'opened' },
        ] as unknown as GitLabIssueRaw[];
        const provider = baseProvider({ getIssues: vi.fn().mockResolvedValue(badIssues) });
        const dp = new GitLabDataProvider(provider);

        const result = await dp.fetchRawData({ repo: 'group/project' });

        expect(result.pmIssues).toHaveLength(1);
        expect(result.pmIssues?.[0]?.id).toBe('100');
    });
});
