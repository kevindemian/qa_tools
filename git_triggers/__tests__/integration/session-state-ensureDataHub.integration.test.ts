/**
 * Integration tests — ensureDataHub (session-state.ts)
 *
 * Validates:
 * - Lazy-init: first call triggers getOrFetchDataHub
 * - Cache hit: second call returns cached hub without re-fetching
 * - Missing manager returns undefined
 * - Missing project name returns undefined
 * - Error handling returns hub with empty data (resilient design)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitProvider } from '../../../shared/types/ci-cd.js';
import { DataHubImpl } from '../../../shared/data-hub/hub.js';
import { clearCache } from '../../../shared/data-hub/cache.js';
import {
    ensureDataHub,
    setDataHub,
    _resetForTest,
    setManager,
    setCurrentProjectName,
} from '../../../git_triggers/session-state.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockGitProvider(): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue([]),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
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
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getDiff: vi.fn(),
        getJobLogs: vi.fn(),
        getWorkflowRunTiming: vi.fn(),
        getFileContents: vi.fn(),
        listDirectory: vi.fn(),
        getTestReport: vi.fn(),
        provider: 'github',
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: ensureDataHub', () => {
    beforeEach(() => {
        _resetForTest();
        clearCache();
        vi.clearAllMocks();
    });

    it('returns cached _dataHub if already set', async () => {
        expect.hasAssertions();

        const { hub } = await DataHubImpl.create([], { repo: 'test' });
        setDataHub(hub);

        const result = await ensureDataHub();

        expect(result).toBe(hub);
    });

    it('returns undefined when manager is null', async () => {
        expect.hasAssertions();

        // manager is null after _resetForTest
        setCurrentProjectName('test-project');

        const result = await ensureDataHub();

        expect(result).toBeUndefined();
    });

    it('returns undefined when currentProjectName is empty', async () => {
        expect.hasAssertions();

        // currentProjectName is '' after _resetForTest
        setManager(createMockGitProvider());

        const result = await ensureDataHub();

        expect(result).toBeUndefined();
    });

    it('creates DataHub on first call and caches it', async () => {
        expect.hasAssertions();

        setManager(createMockGitProvider());
        setCurrentProjectName('test-project');

        const result1 = await ensureDataHub();

        expect(result1).toBeDefined();

        // Second call should return cached value
        const result2 = await ensureDataHub();

        expect(result2).toBe(result1);
    });

    it('returns hub with empty data when provider fails gracefully', async () => {
        expect.hasAssertions();

        const mockProvider = createMockGitProvider();
        mockProvider.getRecentPipelines = vi.fn().mockRejectedValue(new Error('Network error')) as never;
        setManager(mockProvider);
        setCurrentProjectName('error-project');

        const result = await ensureDataHub();

        // Provider errors are caught by Promise.allSettled — hub created with empty data
        expect(result).toBeDefined();
        expect(result?.raw.runs).toStrictEqual([]);
    });
});
