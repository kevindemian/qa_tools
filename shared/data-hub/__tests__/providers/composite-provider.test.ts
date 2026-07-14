/**
 * Unit tests for Composite Data Provider.
 *
 * Tests aggregation of multiple providers and failure resilience.
 */
import { describe, it, expect, vi } from 'vitest';
import { CompositeProvider } from '../../providers/composite-provider.js';
import type { DataProvider, FetchOptions, RawData } from '../../../types/data-hub.js';

/* ── Mock DataProvider ─────────────────────────────────────────────────── */

function createMockProvider(name: string, data: RawData): DataProvider {
    return {
        name,
        source: 'github' as const,
        fetchRawData: vi.fn().mockResolvedValue(data),
    };
}

function makeRawData(overrides?: Partial<RawData>): RawData {
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('CompositeProvider', () => {
    const options: FetchOptions = { repo: 'test' };

    it('has correct name', () => {
        expect.hasAssertions();

        const provider = new CompositeProvider([]);

        expect(provider.name).toBe('composite');
    });

    it('merges results from multiple providers', async () => {
        expect.hasAssertions();

        const provider1 = createMockProvider(
            'github',
            makeRawData({
                runs: [{ id: 1, head_branch: 'main' }],
            }),
        );
        const provider2 = createMockProvider(
            'coverage',
            makeRawData({
                coverage: { total: 100, covered: 80, percentage: 80 },
            }),
        );

        const composite = new CompositeProvider([provider1, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.runs).toHaveLength(1);
        expect(result.coverage).toBeDefined();

        const coverage = result.coverage;

        expect(coverage?.percentage).toBe(80);
    });

    it('skips providers that fail', async () => {
        expect.hasAssertions();

        const failingProvider: DataProvider = {
            name: 'failing',
            source: 'github' as const,
            fetchRawData: vi.fn().mockRejectedValue(new Error('Network error')),
        };

        const provider2 = createMockProvider(
            'working',
            makeRawData({
                runs: [{ id: 1, head_branch: 'main' }],
            }),
        );

        const composite = new CompositeProvider([failingProvider, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.runs).toHaveLength(1);
    });

    it('returns empty data when all providers fail', async () => {
        expect.hasAssertions();

        const failingProvider1: DataProvider = {
            name: 'failing1',
            source: 'github' as const,
            fetchRawData: vi.fn().mockRejectedValue(new Error('Error 1')),
        };

        const failingProvider2: DataProvider = {
            name: 'failing2',
            source: 'github' as const,
            fetchRawData: vi.fn().mockRejectedValue(new Error('Error 2')),
        };

        const composite = new CompositeProvider([failingProvider1, failingProvider2]);
        const result = await composite.fetchRawData(options);

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
    });

    it('returns empty data when no providers', async () => {
        expect.hasAssertions();

        const composite = new CompositeProvider([]);
        const result = await composite.fetchRawData(options);

        expect(result.runs).toHaveLength(0);
    });

    it('merges jobs and artifacts from multiple providers', async () => {
        expect.hasAssertions();

        const jobs1 = new Map([[1, [{ id: 101, name: 'job-a', stage: 'test', status: 'success' }]]]);
        const jobs2 = new Map([[1, [{ id: 102, name: 'job-b', stage: 'build', status: 'success' }]]]);

        const provider1 = createMockProvider('p1', makeRawData({ jobs: jobs1 }));
        const provider2 = createMockProvider('p2', makeRawData({ jobs: jobs2 }));

        const composite = new CompositeProvider([provider1, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.jobs.get(1)).toHaveLength(1);
    });

    it('unions provenance from multiple providers (no silent loss)', async () => {
        expect.hasAssertions();

        const prov1 = new Map<string, { confidence: number; source: string; timestamp: string }>();
        prov1.set('runs', { confidence: 1, source: 'github-api', timestamp: '2026-01-01T00:00:00Z' });
        const provider1 = createMockProvider('github', makeRawData({ provenance: prov1 }));

        const prov2 = new Map<string, { confidence: number; source: string; timestamp: string }>();
        prov2.set('deployments', { confidence: 0.9, source: 'gitlab-api', timestamp: '2026-01-01T00:00:00Z' });
        const provider2 = createMockProvider('gitlab', makeRawData({ provenance: prov2 }));

        const composite = new CompositeProvider([provider1, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.provenance?.has('runs')).toBeTruthy();
        expect(result.provenance?.has('deployments')).toBeTruthy();
        expect(result.provenance?.get('deployments')?.source).toBe('gitlab-api');
    });
});
