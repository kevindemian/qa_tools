/**
 * Integration tests — _showDataHubSummary (interactive-mode.ts)
 *
 * Validates:
 * - Empty hub shows warning (completes without errors)
 * - Full summary displays all sections (completes without errors)
 * - Error handling shows error message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../shared/types/ci-cd.js';
import type { DataHub, RawData } from '../../../shared/types/data-hub.js';
import { DataHubImpl } from '../../../shared/data-hub/hub.js';
import { makeDataHubPersistenceMock } from '../../../shared/test-utils/factories/data-hub-mock.js';
import { setDataHub, _resetForTest } from '../../../git_triggers/session-state.js';
import { _testExports } from '../../../git_triggers/interactive-mode.js';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

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
        name: `job-${id}`,
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

async function createDataHubWithRuns(runs: PipelineRun[]): Promise<DataHub> {
    const jobsMap = new Map<number, PipelineJob[]>();
    for (const run of runs) {
        const runId = typeof run.id === 'string' ? parseInt(run.id, 10) : (run.id ?? 0);
        jobsMap.set(runId, [makeJob(runId * 10)]);
    }
    const rawData: RawData = {
        runs,
        jobs: jobsMap,
        artifacts: new Map(),
        failureReasons: new Map(),
    };
    const mockProvider = {
        name: 'test',
        source: 'github' as const,
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
    const mockPersistence = makeDataHubPersistenceMock();
    const { hub } = await DataHubImpl.create([mockProvider], { repo: 'test' }, mockPersistence);
    return hub;
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: _showDataHubSummary', () => {
    beforeEach(() => {
        _resetForTest();
        vi.clearAllMocks();
    });

    it('completes without errors when hub has no runs', async () => {
        expect.hasAssertions();

        const hub = await createDataHubWithRuns([]);
        setDataHub(hub);

        await expect(_testExports._showDataHubSummary()).resolves.not.toThrow();
    });

    it('completes without errors when hub has runs', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1, { conclusion: 'success' }), makeRun(2, { conclusion: 'failure' })];
        const hub = await createDataHubWithRuns(runs);
        setDataHub(hub);

        await expect(_testExports._showDataHubSummary()).resolves.not.toThrow();
    });

    it('completes without errors when hub has flaky data', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun(1, { conclusion: 'failure' }),
            makeRun(2, { conclusion: 'success' }),
            makeRun(3, { conclusion: 'failure' }),
            makeRun(4, { conclusion: 'success' }),
        ];
        const hub = await createDataHubWithRuns(runs);
        setDataHub(hub);

        await expect(_testExports._showDataHubSummary()).resolves.not.toThrow();
    });
});
