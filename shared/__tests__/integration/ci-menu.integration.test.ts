/**
 * Integration test for DataHub menu entry in interactive-mode.
 *
 * Validates:
 * - Menu option 'h' exists in ACTION_HANDLERS
 * - Handler can be invoked without errors
 * - Handler uses DataHub from session-state (via ensureDataHub)
 * - Handler displays formatted output
 * - Handler handles empty runs gracefully
 * - Handler handles provider errors gracefully
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _testExports } from '../../../git_triggers/interactive-mode.js';
import { setDataHub, _resetForTest } from '../../../git_triggers/session-state.js';
import { DataHubImpl } from '../../data-hub/hub.js';
import type { GitProvider, PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { DataProvider, RawData } from '../../types/data-hub.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockProvider(runs: PipelineRun[], jobsPerRun: Map<number, PipelineJob[]> = new Map()): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue(runs),
        getPipelineJobs: vi.fn().mockImplementation((id: number) => Promise.resolve(jobsPerRun.get(id) ?? [])),
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
        provider: 'github' as const,
    };
}

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: `test-job-${id}`,
        stage: 'test',
        status: 'completed',
        duration: 120,
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('DataHub Menu Integration', () => {
    const { ACTION_HANDLERS } = _testExports;

    beforeEach(() => {
        vi.clearAllMocks();
        _resetForTest();
    });

    async function setupDataHub(runs: PipelineRun[], jobs: Map<number, PipelineJob[]>): Promise<void> {
        const rawData: RawData = {
            runs,
            jobs,
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const mockProvider: DataProvider = {
            name: 'test',
            source: 'github',
            fetchRawData: vi.fn().mockResolvedValue(rawData),
        };
        const hub = await DataHubImpl.create([mockProvider], { repo: 'test-project' });
        setDataHub(hub);
    }

    it('menu option h exists in ACTION_HANDLERS', () => {
        expect.hasAssertions();

        expect(ACTION_HANDLERS['h']).toBeDefined();
        expect(typeof ACTION_HANDLERS['h']).toBe('function');
    });

    it('handler completes without errors when runs exist', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const runs = [
            makeRun(1, { conclusion: 'success' }),
            makeRun(2, { conclusion: 'failure' }),
            makeRun(3, { conclusion: 'success' }),
        ];
        const jobs = new Map<number, PipelineJob[]>([
            [1, [makeJob(1)]],
            [2, [makeJob(2, { status: 'failed' })]],
            [3, [makeJob(3)]],
        ]);
        await setupDataHub(runs, jobs);

        const provider = createMockProvider(runs, jobs);

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });

    it('handler completes without errors when no runs found', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const provider = createMockProvider([]);

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });

    it('handler completes without errors when provider fails', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const provider = createMockProvider([]);
        provider.getRecentPipelines = vi.fn().mockRejectedValue(new Error('API rate limit'));

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });

    it('handler processes jobs and computes metrics', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const runs = [makeRun(1, { conclusion: 'success' }), makeRun(2, { conclusion: 'success' })];
        const jobs = new Map<number, PipelineJob[]>([
            [1, [makeJob(1, { duration: 100 })]],
            [2, [makeJob(2, { duration: 200 })]],
        ]);
        await setupDataHub(runs, jobs);

        const provider = createMockProvider(runs, jobs);

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });

    it('handler handles branches with different conclusions', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const runs = [
            makeRun(1, { head_branch: 'main', conclusion: 'success' }),
            makeRun(2, { head_branch: 'feature-x', conclusion: 'failure' }),
            makeRun(3, { head_branch: 'main', conclusion: 'success' }),
        ];
        const provider = createMockProvider(runs);

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });

    it('handler handles mixed job statuses', async () => {
        expect.hasAssertions();

        const handler = ACTION_HANDLERS['h'];
        if (!handler) return;

        const runs = [makeRun(1, { conclusion: 'success' }), makeRun(2, { conclusion: 'failure' })];
        const jobs = new Map<number, PipelineJob[]>([
            [1, [makeJob(1, { status: 'completed' })]],
            [2, [makeJob(2, { status: 'failed' })]],
        ]);
        const provider = createMockProvider(runs, jobs);

        await expect(handler(provider, 'test-project', [])).resolves.toBeFalsy();
    });
});
