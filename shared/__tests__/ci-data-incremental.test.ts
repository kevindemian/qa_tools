import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { GitProvider, PipelineRun } from '../types/ci-cd.js';
import type { DataHub, RawData } from '../types/data-hub.js';

import { getOrFetchDataHub, latestRunTimestamp } from '../ci/ci-data.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';
import { createMockGitProvider } from '../test-utils/factories/index.js';

const mockCreateDataHub =
    vi.fn<
        (
            provider: GitProvider,
            repo: string,
            opts?: { allowEmpty?: boolean; since?: Date },
        ) => Promise<{ hub: DataHub }>
    >();

vi.mock('../data-hub/factory.js', () => ({
    createDataHub: mockCreateDataHub,
}));

function run(id: number, created_at: string): PipelineRun {
    return {
        id,
        created_at,
        updated_at: created_at,
        status: 'success',
        conclusion: 'success',
        head_branch: 'main',
    };
}

function rawWithRuns(runs: PipelineRun[]): RawData {
    return {
        runs,
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

describe('LatestRunTimestamp (Gap 4 anchor)', () => {
    it('returns undefined when there are no runs', () => {
        expect(latestRunTimestamp(rawWithRuns([]))).toBeUndefined();
    });

    it('returns the most recent created_at', () => {
        const raw = rawWithRuns([
            run(1, '2026-01-01T00:00:00Z'),
            run(2, '2026-03-15T12:00:00Z'),
            run(3, '2026-02-10T08:00:00Z'),
        ]);

        expect(latestRunTimestamp(raw)?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    });

    it('ignores malformed dates and keeps the valid max (AGENTS §24)', () => {
        const raw = rawWithRuns([run(1, 'not-a-date'), run(2, '2026-03-15T12:00:00Z')]);

        expect(latestRunTimestamp(raw)?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    });
});

describe('GetOrFetchDataHub incremental merge (Gap 4)', () => {
    beforeEach(() => {
        mockCreateDataHub.mockReset();
    });

    it('merges fetched data into the existing hub and returns the same instance', async () => {
        expect.hasAssertions();

        const provider = createMockGitProvider();
        const existing = makeDataHubMock({ raw: rawWithRuns([run(1, '2026-01-01T00:00:00Z')]) });
        const fetched = makeDataHubMock({ raw: rawWithRuns([run(2, '2026-03-01T00:00:00Z')]) });
        mockCreateDataHub.mockResolvedValue({ hub: fetched });

        const result = await getOrFetchDataHub(provider, 'repo', existing);

        // same instance preserved (cached data not wiped when no re-fetch)
        expect(result).toBe(existing);

        // incremental merge applied onto the existing hub
        expect(existing['mergeIncremental']).toHaveBeenCalledWith(fetched.raw);

        // fetch requested only runs since the existing latest run
        expect(mockCreateDataHub).toHaveBeenCalledWith(
            provider,
            'repo',
            expect.objectContaining({ allowEmpty: true, since: new Date('2026-01-01T00:00:00.000Z') }),
        );
    });

    it('fetches without since when no existing hub is provided', async () => {
        expect.hasAssertions();

        const provider = createMockGitProvider();
        const fetched = makeDataHubMock({ raw: rawWithRuns([run(1, '2026-01-01T00:00:00Z')]) });
        mockCreateDataHub.mockResolvedValue({ hub: fetched });

        const result = await getOrFetchDataHub(provider, 'repo');

        expect(result).toBe(fetched);

        // G4.7: since is omitted (no key) on full fetch — only allowEmpty is sent
        const opts = mockCreateDataHub.mock.calls[0]?.[2];

        expect(opts).toStrictEqual({ allowEmpty: true });
    });

    it('passes since = latest run timestamp when an existing hub has runs (incremental)', async () => {
        expect.hasAssertions();

        const provider = createMockGitProvider();
        const existing = makeDataHubMock({ raw: rawWithRuns([run(1, '2026-01-01T00:00:00Z')]) });
        const fetched = makeDataHubMock({ raw: rawWithRuns([run(2, '2026-03-01T00:00:00Z')]) });
        mockCreateDataHub.mockResolvedValue({ hub: fetched });

        const result = await getOrFetchDataHub(provider, 'repo', existing);

        expect(result).toBe(existing);

        // incremental fetch anchored on the existing latest run
        expect(mockCreateDataHub).toHaveBeenCalledWith(
            provider,
            'repo',
            expect.objectContaining({ allowEmpty: true, since: new Date('2026-01-01T00:00:00.000Z') }),
        );

        // new runs merged in-place onto the existing hub
        expect(existing['mergeIncremental']).toHaveBeenCalledWith(fetched.raw);
    });

    it('omits since (full fetch) when the existing hub has zero runs', async () => {
        expect.hasAssertions();

        const provider = createMockGitProvider();
        const existing = makeDataHubMock({ raw: rawWithRuns([]) });
        const fetched = makeDataHubMock({ raw: rawWithRuns([run(1, '2026-01-01T00:00:00Z')]) });
        mockCreateDataHub.mockResolvedValue({ hub: fetched });

        const result = await getOrFetchDataHub(provider, 'repo', existing);

        expect(result).toBe(existing);

        // G4.7: since omitted because the existing hub has no runs to anchor on
        const opts = mockCreateDataHub.mock.calls[0]?.[2];

        expect(opts).toStrictEqual({ allowEmpty: true });

        // fetched runs still merged into the (empty) existing hub
        expect(existing['mergeIncremental']).toHaveBeenCalledWith(fetched.raw);
    });
});
