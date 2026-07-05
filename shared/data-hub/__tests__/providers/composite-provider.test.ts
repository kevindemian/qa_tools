/**
 * Unit tests for Composite Data Provider.
 *
 * Tests aggregation of multiple providers and failure resilience.
 */
import { describe, it, expect, vi } from 'vitest';
import { CompositeProvider } from '../../providers/composite-provider.js';
import type { DataProvider, FetchOptions, RawData } from '../../../types/data-hub.js';

/* ── Mock DataProvider ─────────────────────────────────────────────────── */

function createMockProvider(name: string, data: RawData, source: DataProvider['source'] = 'github'): DataProvider {
    return {
        name,
        source,
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

    it('source reflects first provider source', () => {
        expect.hasAssertions();

        const provider1 = createMockProvider('p1', makeRawData(), 'gitlab');
        const provider2 = createMockProvider('p2', makeRawData(), 'github');

        const composite = new CompositeProvider([provider1, provider2]);

        expect(composite.source).toBe('gitlab');
    });

    it('source defaults to github when no providers', () => {
        expect.hasAssertions();

        const composite = new CompositeProvider([]);

        expect(composite.source).toBe('github');
    });

    it('coverage merge: first writer wins', async () => {
        expect.hasAssertions();

        const provider1 = createMockProvider(
            'p1',
            makeRawData({
                coverage: { total: 100, covered: 70, percentage: 70 },
            }),
        );
        const provider2 = createMockProvider(
            'p2',
            makeRawData({
                coverage: { total: 100, covered: 90, percentage: 90 },
            }),
        );

        const composite = new CompositeProvider([provider1, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.coverage?.percentage).toBe(70);
    });

    it('jiraIssues merge: first writer wins', async () => {
        expect.hasAssertions();

        const provider1 = createMockProvider(
            'p1',
            makeRawData({
                jiraIssues: [
                    {
                        key: 'T-1',
                        summary: 'First',
                        status: 'Open',
                        type: 'Bug',
                        labels: [],
                        created: '2026-01-01',
                        updated: '2026-01-02',
                    },
                ],
            }),
        );
        const provider2 = createMockProvider(
            'p2',
            makeRawData({
                jiraIssues: [
                    {
                        key: 'T-2',
                        summary: 'Second',
                        status: 'Done',
                        type: 'Story',
                        labels: [],
                        created: '2026-01-03',
                        updated: '2026-01-04',
                    },
                ],
            }),
        );

        const composite = new CompositeProvider([provider1, provider2]);
        const result = await composite.fetchRawData(options);

        expect(result.jiraIssues).toHaveLength(1);
        expect(result.jiraIssues?.[0]?.key).toBe('T-1');
    });

    it('order of providers matters for first-writer-wins fields', async () => {
        expect.hasAssertions();

        const providerA = createMockProvider(
            'a',
            makeRawData({
                coverage: { total: 100, covered: 50, percentage: 50 },
            }),
        );
        const providerB = createMockProvider(
            'b',
            makeRawData({
                coverage: { total: 100, covered: 95, percentage: 95 },
            }),
        );

        const composite1 = new CompositeProvider([providerA, providerB]);
        const result1 = await composite1.fetchRawData(options);
        expect(result1.coverage?.percentage).toBe(50);

        const composite2 = new CompositeProvider([providerB, providerA]);
        const result2 = await composite2.fetchRawData(options);
        expect(result2.coverage?.percentage).toBe(95);
    });
});
