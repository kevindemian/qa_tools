/**
 * FASE EXPAND+STORE (EIXO A) — GitHubManager optional GitProvider methods +
 * LA-4 artifact-derived failure records.
 *
 * Tests:
 *  - GitHubManager.getDeployments / getReleases / getSecurityAlerts /
 *    getPullRequests / getIssues return raw[] or [] when null.
 *  - GitHubDataProvider LA-4 emits FailureRecords from parsed artifacts that
 *    carry retries/flaky/file/line, and never fabricates otherwise.
 *
 * Uses createMockGitProvider for the provider-side assertions (AGENTS: strict
 * mocks, no partial objects). The GitHubManager methods are exercised against a
 * mocked HTTP client (no network).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitHubManager from '../github_manager.js';
import { GitHubDataProvider } from '../../shared/data-hub/providers/github-provider.js';
import { createMockGitProvider } from '../../shared/test-utils/factories/git-provider-factory.js';
import { parseArtifactBufferAll } from '../../shared/data-hub/artifact-parser.js';
import type {
    GitProvider,
    GitHubReleaseRaw,
    GitHubSecurityAlertRaw,
    GitHubPullRequestRaw,
} from '../../shared/types/ci-cd.js';

// Mock the artifact parser so we can inject test entries with retries/flaky/file/line.
vi.mock('../../shared/data-hub/artifact-parser.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../shared/data-hub/artifact-parser.js')>();
    return { ...actual, parseArtifactBufferAll: vi.fn() };
});

const mockGet = vi.fn();

function makeManager(): GitHubManager {
    const manager = new GitHubManager('owner/repo', 'token');
    (manager as unknown as { client: unknown }).client = {
        get: mockGet,
    };
    return manager;
}

describe('GitHubManager — FASE EXPAND+STORE optional methods', () => {
    let manager: GitHubManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = makeManager();
    });

    it('getDeployments GETs {repo}/deployments and maps raw[]', async () => {
        expect.hasAssertions();

        const payload = [{ id: 1, environment: 'prod', state: 'success', created_at: '2026-01-01T00:00:00Z' }];
        mockGet.mockResolvedValue({ data: payload });

        const result = await manager.getDeployments();

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(1);
        expect(mockGet).toHaveBeenCalledWith('/repos/owner/repo/deployments');
    });

    it('getDeployments fails closed (throws) when the API errors', async () => {
        expect.hasAssertions();

        mockGet.mockRejectedValue(new Error('network'));

        await expect(manager.getDeployments()).rejects.toThrow(/network/);
    });

    it('getReleases GETs {repo}/releases', async () => {
        expect.hasAssertions();

        const payload: GitHubReleaseRaw[] = [
            { id: 2, tag_name: 'v1', draft: false, prerelease: false, created_at: '2026-02-01T00:00:00Z' },
        ];
        mockGet.mockResolvedValue({ data: payload });

        const result = await manager.getReleases();

        expect(result).toHaveLength(1);
        expect(mockGet).toHaveBeenCalledWith('/repos/owner/repo/releases');
    });

    it('getSecurityAlerts merges code-scanning + secret-scanning', async () => {
        expect.hasAssertions();

        const codeScanning: GitHubSecurityAlertRaw[] = [
            { number: 1, html_url: 'https://github.com/o/r/security/code-scanning/1' },
        ];
        const secretScanning: GitHubSecurityAlertRaw[] = [
            { number: 2, html_url: 'https://github.com/o/r/security/secret-scanning/2' },
        ];
        mockGet.mockResolvedValueOnce({ data: codeScanning }).mockResolvedValueOnce({ data: secretScanning });

        const result = await manager.getSecurityAlerts();

        expect(result).toHaveLength(2);
        expect(mockGet).toHaveBeenCalledWith('/repos/owner/repo/code-scanning/alerts');
        expect(mockGet).toHaveBeenCalledWith('/repos/owner/repo/secret-scanning/alerts');
    });

    it('getPullRequests GETs {repo}/pulls with state param', async () => {
        expect.hasAssertions();

        const payload: GitHubPullRequestRaw[] = [{ number: 7, html_url: 'u7' }];
        mockGet.mockResolvedValue({ data: payload });

        const result = await manager.getPullRequests('open');

        expect(result).toHaveLength(1);
        expect(mockGet).toHaveBeenCalledWith(
            '/repos/owner/repo/pulls',
            expect.objectContaining({ params: { state: 'open' } }),
        );
    });

    it('getIssues GETs {repo}/issues and excludes pull_request entries', async () => {
        expect.hasAssertions();

        const payload = [
            { number: 5, title: 'Issue', state: 'open', created_at: '2026-03-01T00:00:00Z', html_url: 'u5' },
            {
                number: 6,
                title: 'A PR',
                state: 'open',
                created_at: '2026-03-01T00:00:00Z',
                html_url: 'u6',
                pull_request: {},
            },
        ];
        mockGet.mockResolvedValue({ data: payload });

        const result = await manager.getIssues();

        expect(result).toHaveLength(1);
        expect(result[0]?.number).toBe(5);
        expect(mockGet).toHaveBeenCalledWith('/repos/owner/repo/issues');
    });
});

describe('GitHubDataProvider — LA-4 artifact failure records', () => {
    let mockProvider: GitProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        mockProvider = createMockGitProvider({
            getRecentPipelines: vi.fn().mockResolvedValue([{ id: 1, head_branch: 'main', conclusion: 'success' }]),
            getPipelineJobs: vi.fn().mockResolvedValue([{ id: 101, name: 'j', stage: 'test', status: 'success' }]),
            listPipelineArtifacts: vi.fn().mockResolvedValue([{ id: 9, name: 'ctrf' }]),
            downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from('{}'), filename: 'ctrf.json' }),
        });
    });

    it('emits a FailureRecord for parsed tests carrying retries/flaky/file/line', async () => {
        expect.hasAssertions();

        vi.mocked(parseArtifactBufferAll).mockReturnValue([
            {
                fileName: 'ctrf.json',
                format: 'ctrf',
                data: {
                    tests: [
                        {
                            title: 'flakyTest',
                            state: 'passed',
                            duration: 1,
                            retries: 2,
                            flaky: true,
                            filePath: 'a.spec.ts',
                            line: 12,
                        },
                    ],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 1 },
                },
            },
        ] as unknown as ReturnType<typeof parseArtifactBufferAll>);

        const provider = new GitHubDataProvider(mockProvider);
        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        const records = result.failureRecords ?? [];

        expect(records).toHaveLength(1);

        const rec = records[0];
        if (rec == null) throw new Error('expected a failure record');

        expect(rec.source).toBe('ctrf');
        expect(rec.retries).toBe(2);
        expect(rec.flaky).toBeTruthy();
        expect(rec.file).toBe('a.spec.ts');
        expect(rec.line).toBe(12);
        expect(rec.category).toBe('environment');
        expect(rec.confidence).toBeCloseTo(0.9, 5);
    });

    it('does NOT emit a FailureRecord for tests without retries/flaky/file/line', async () => {
        expect.hasAssertions();

        vi.mocked(parseArtifactBufferAll).mockReturnValue([
            {
                fileName: 'ctrf.json',
                format: 'ctrf',
                data: {
                    tests: [{ title: 'plainTest', state: 'passed', duration: 1 }],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 1 },
                },
            },
        ] as unknown as ReturnType<typeof parseArtifactBufferAll>);

        const provider = new GitHubDataProvider(mockProvider);
        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.failureRecords ?? []).toHaveLength(0);
    });

    it('ignores non-ctrf/playwright/allure formats for LA-4', async () => {
        expect.hasAssertions();

        vi.mocked(parseArtifactBufferAll).mockReturnValue([
            {
                fileName: 'junit.xml',
                format: 'junit',
                data: {
                    tests: [
                        { title: 'x', state: 'failed', duration: 1, retries: 3, flaky: true, filePath: 'y', line: 5 },
                    ],
                    stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 1 },
                },
            },
        ] as unknown as ReturnType<typeof parseArtifactBufferAll>);

        const provider = new GitHubDataProvider(mockProvider);
        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.failureRecords ?? []).toHaveLength(0);
    });
});
