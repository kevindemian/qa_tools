/**
 * Unit tests for DataHubImpl.
 *
 * Tests the orchestration of providers and compute functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { mockedSafe } from '../../test-utils/mock-types.js';
import { DataHubImpl } from '../hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';
import type {
    DataProvider,
    RawData,
    MetricsStore,
    DataHubPersistence,
    CoverageSnapshot,
    FailureClassification,
} from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';
import type { ParseResult } from '../../result_parser.js';

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: 1,
        conclusion: 'success',
        run_started_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:10:00Z',
        head_branch: 'main',
        ...overrides,
    };
}

function makeProvider(rawData: RawData, name = 'test-provider'): DataProvider {
    return {
        name,
        source: 'github' as const,
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

function makeEmptyRawData(): RawData {
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

function makeRawDataWithRuns(runs: PipelineRun[]): RawData {
    return {
        runs,
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

function makeMetricsStore(overrides?: Partial<MetricsStore>): MetricsStore {
    return {
        runs: [
            {
                timestamp: '2026-01-01T10:00:00Z',
                project: 'main',
                total: 100,
                passed: 95,
                failed: 3,
                skipped: 2,
                duration: 5000,
                tests: [],
            },
            {
                timestamp: '2026-01-02T10:00:00Z',
                project: 'main',
                total: 100,
                passed: 98,
                failed: 1,
                skipped: 1,
                duration: 4500,
                tests: [],
            },
        ],
        ...overrides,
    };
}

function createMockPersistence(overrides?: Partial<DataHubPersistence>): DataHubPersistence {
    return { ...makeDataHubPersistenceMock(), ...overrides };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('DataHubImpl', () => {
    it('creates hub from single provider', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' }), makeRun({ id: 2, conclusion: 'failure' })];
        const provider = makeProvider(makeRawDataWithRuns(runs));

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(hub).toBeDefined();
        expect(hub.raw.runs).toHaveLength(2);
        expect(hub.repo).toBe('test/repo');
        expect(hub.provider).toBe('github');
    });

    it('computes pass rate from runs', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, conclusion: 'success' }),
            makeRun({ id: 2, conclusion: 'success' }),
            makeRun({ id: 3, conclusion: 'failure' }),
        ];
        const provider = makeProvider(makeRawDataWithRuns(runs));

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(hub.computed.passRate).toBeCloseTo(66.67, 1);
    });

    it('getBranchPassRate returns branch-scoped pass rate (Gap 3)', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, head_branch: 'main', conclusion: 'success' }),
            makeRun({ id: 2, head_branch: 'main', conclusion: 'success' }),
            makeRun({ id: 3, head_branch: 'feature/x', conclusion: 'failure' }),
        ];
        const provider = makeProvider(makeRawDataWithRuns(runs));

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(hub.getBranchPassRate('main')).toBe(100);

        expect(hub.getBranchPassRate('feature/x')).toBe(0);
    });

    it('populates ComputedMetrics.runPassRate from parsed artifact test counts (DEF-1)', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' })];
        const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
            [
                1,
                [
                    {
                        fileName: 'ctrf.json',
                        format: 'ctrf',
                        data: { tests: [], stats: { passed: 8, failed: 2, skipped: 0, total: 10, duration: 0 } },
                    },
                ],
            ],
        ]);
        const raw: RawData = { ...makeRawDataWithRuns(runs), parsedArtifacts };
        const provider = makeProvider(raw);

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(hub.computed.runPassRate).toBeDefined();
        expect(hub.computed.runPassRate).toBeCloseTo(80, 5);
    });

    it('b1: computed.passRate reflects test-level pass rate when only parsed artifacts exist (no pipeline runs)', () => {
        expect.hasAssertions();

        const parseResult = {
            framework: 'jest',
            tests: [
                { title: 'test A', state: 'passed' as const, duration: 100 },
                { title: 'test B', state: 'passed' as const, duration: 150 },
                { title: 'test C', state: 'passed' as const, duration: 200 },
            ],
            stats: { passed: 3, failed: 0, skipped: 0, total: 3, duration: 450 },
        };

        const hub = DataHubImpl.createFromParseResult(parseResult, 'test/repo', createMockPersistence());

        expect(hub.raw.runs).toHaveLength(0);
        expect(hub.computed.passRate).toBe(100);
        expect(hub.computed.runPassRate).toBe(100);
    });

    it('b1: computed.passRate stays 0 only when there is genuinely no data at all', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        expect(hub.computed.passRate).toBe(0);
        expect(hub.computed.runPassRate).toBe(0);
    });

    it('merges data from multiple providers', async () => {
        expect.hasAssertions();

        const runs1 = [makeRun({ id: 1, conclusion: 'success' })];
        const runs2 = [makeRun({ id: 2, conclusion: 'failure' })];
        const provider1 = makeProvider(makeRawDataWithRuns(runs1), 'provider1');
        const provider2 = makeProvider(makeRawDataWithRuns(runs2), 'provider2');

        const { hub } = await DataHubImpl.create(
            [provider1, provider2],
            {
                repo: 'test/repo',
            },
            createMockPersistence(),
        );

        expect(hub.raw.runs).toHaveLength(2);
    });

    it('handles provider failure gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' })];
        const workingProvider = makeProvider(makeRawDataWithRuns(runs));
        const failingProvider: DataProvider = {
            name: 'failing',
            source: 'github' as const,
            fetchRawData: vi.fn().mockRejectedValue(new Error('API error')),
        };

        const { hub } = await DataHubImpl.create(
            [failingProvider, workingProvider],
            {
                repo: 'test/repo',
            },
            createMockPersistence(),
        );

        expect(hub.raw.runs).toHaveLength(1);
        expect(hub.computed.passRate).toBe(100);
    });

    it('creates empty hub as fallback', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        expect(hub.raw.runs).toHaveLength(0);
        expect(hub.computed.passRate).toBe(0);
        expect(hub.computed.pipelineCost.totalMinutes).toBe(0);
        expect(hub.repo).toBe('test/repo');
        expect(hub.provider).toBe('github');
    });

    it('sets timestamp on creation', async () => {
        expect.hasAssertions();

        const before = Date.now();
        const provider = makeProvider(makeEmptyRawData());

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(hub.timestamp.getTime()).toBeGreaterThanOrEqual(before);
        expect(hub.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('b3: computed.releaseScore is the single enriched implementation — noData for absent data sources', () => {
        expect.hasAssertions();

        const parseResult = {
            framework: 'jest',
            tests: [{ title: 'test A', state: 'passed' as const, duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        };

        const hub = DataHubImpl.createFromParseResult(parseResult, 'test/repo', createMockPersistence());

        const rs = hub.computed.releaseScore;

        expect(rs.breakdown).toBeDefined();
        expect(rs.breakdown).toHaveLength(5);

        const passRateDim = (rs.breakdown ?? []).find((d) => d.label === 'Pass Rate');

        expect(passRateDim?.noData).toBeFalsy();

        for (const label of ['Coverage', 'Suite Speed', 'Execution Rate']) {
            const dim = (rs.breakdown ?? []).find((d) => d.label === label);

            expect(dim?.noData).toBeTruthy();
        }
    });

    it('computes backlogHealth with explicit no-data when there are no jira issues (Rule 25)', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        const bh = hub.computed.backlogHealth;

        expect(bh).toBeDefined();
        expect(bh?.noData).toBeTruthy();
        expect(bh?.totalIssues).toBe(0);
        expect(bh?.score).toBe(0);
    });

    it('computes backlogHealth from raw.jiraIssues (unassigned bugs, bugs without tests)', async () => {
        expect.hasAssertions();

        const raw: RawData = {
            ...makeEmptyRawData(),
            jiraIssues: [
                {
                    key: 'PROJ-1',
                    summary: 'Bug sem assignee',
                    status: 'To Do',
                    type: 'Bug',
                    labels: [],
                    fixVersions: [],
                    components: [],
                    created: '2026-01-01T00:00:00.000Z',
                    updated: '2026-01-01T00:00:00.000Z',
                },
                {
                    key: 'PROJ-2',
                    summary: 'Bug coberto por teste',
                    status: 'To Do',
                    type: 'Bug',
                    labels: [],
                    fixVersions: [],
                    components: [],
                    created: '2026-01-01T00:00:00.000Z',
                    updated: '2026-01-01T00:00:00.000Z',
                    linkedTestKeys: ['TEST-1'],
                    linkedTestCount: 1,
                },
            ],
        };
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        const bh = hub.computed.backlogHealth;

        expect(bh?.noData).toBeFalsy();
        expect(bh?.totalIssues).toBe(2);
        expect(bh?.unassignedIssues.map((i) => i.key)).toStrictEqual(['PROJ-1', 'PROJ-2']);
        expect(bh?.bugsWithoutTests.map((i) => i.key)).toStrictEqual(['PROJ-1']);
        expect(bh?.densityByEpic[0]?.testCount).toBe(1);
    });

    it('computes developerProfile from failureClassifications and empty result on no data', () => {
        expect.hasAssertions();

        const empty = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        expect(empty.computed.developerProfile?.totalFailures).toBe(0);
        expect(empty.computed.developerProfile?.authors).toStrictEqual([]);

        const classifications: FailureClassification[] = [
            { timestamp: '2026-01-01T00:00:00Z', testTitle: 't1', category: 'FLAKY', project: 'main' },
            { timestamp: '2026-01-01T00:00:00Z', testTitle: 't1', category: 'FLAKY', project: 'main' },
        ];
        const store = makeMetricsStore({ failureClassifications: classifications });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.failureClassifications).toHaveLength(2);
        expect(hub.computed.developerProfile?.totalFailures).toBe(2);
        expect(hub.computed.developerProfile?.authors[0]?.author).toBe('Unknown');
    });

    it('leaves aiComparison as explicit no-data — undefined (P-3; raw não carrega AiComparisonRecord)', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        expect(hub.computed.aiComparison).toBeUndefined();
    });

    it('computes pipelineCostResult from runs and perRunCosts (SSOT projection)', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' }), makeRun({ id: 2, conclusion: 'failure' })];
        const provider = makeProvider(makeRawDataWithRuns(runs));
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        const pcr = hub.computed.pipelineCostResult;

        expect(pcr).toBeDefined();
        expect(pcr?.runCount).toBe(2);
        expect(pcr?.totalDurationSec).toBeGreaterThan(0);
        expect(pcr?.costByRun.some((e) => e.status === 'passed')).toBeTruthy();
        expect(pcr?.costByRun.some((e) => e.status === 'failed')).toBeTruthy();
    });

    it('computes coverageGap equivalent from raw.jiraIssues linkedTestKeys (N6)', async () => {
        expect.hasAssertions();

        const raw: RawData = {
            ...makeEmptyRawData(),
            jiraIssues: [
                {
                    key: 'PROJ-1',
                    summary: 'Story com teste',
                    status: 'Done',
                    type: 'Story',
                    labels: [],
                    fixVersions: [],
                    components: [],
                    created: '2026-01-01T00:00:00.000Z',
                    updated: '2026-01-01T00:00:00.000Z',
                    linkedTestKeys: ['TEST-1'],
                },
                {
                    key: 'PROJ-2',
                    summary: 'Story sem teste',
                    status: 'To Do',
                    type: 'Story',
                    labels: [],
                    fixVersions: [],
                    components: [],
                    created: '2026-01-01T00:00:00.000Z',
                    updated: '2026-01-01T00:00:00.000Z',
                },
            ],
        };
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        const cg = hub.computed.coverageGap;

        expect(cg).toBeDefined();
        expect(cg?.totals.totalIssues).toBe(2);
        expect(cg?.totals.covered).toBe(1);
        expect(cg?.totals.gap).toBe(1);
        expect(cg?.items[0]?.hasTest).toBeTruthy();
        expect(cg?.items[1]?.hasTest).toBeFalsy();
    });

    it('keeps coverageGap undefined when there are no jira issues', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());

        expect(hub.computed.coverageGap).toBeUndefined();
    });
});

describe('DataHubImpl — mergeIncremental (Gap 4)', () => {
    function makeHub(): DataHubImpl {
        return DataHubImpl.createEmpty('github', 'test/repo', createMockPersistence());
    }

    it('preserves existing runs and ignores duplicate ids when merging (G4.6)', () => {
        expect.hasAssertions();

        const hub = makeHub();
        hub.raw.runs.push(makeRun({ id: 1, conclusion: 'success' }));

        const incoming: RawData = makeRawDataWithRuns([
            makeRun({ id: 1, conclusion: 'failure' }), // duplicate id -> ignored
            makeRun({ id: 2, conclusion: 'failure' }),
        ]);
        hub.mergeIncremental(incoming);

        expect(hub.raw.runs).toHaveLength(2);

        const ids = hub.raw.runs.map((r) => r.id).sort((a, b) => Number(a) - Number(b));

        expect(ids).toStrictEqual([1, 2]);

        // existing run's original data is preserved (not overwritten by incoming dup)
        const existing = hub.raw.runs.find((r) => r.id === 1);

        expect(existing?.conclusion).toBe('success');
    });

    it('adds only new runs correctly (G4.7)', () => {
        expect.hasAssertions();

        const hub = makeHub();
        hub.raw.runs.push(makeRun({ id: 1, conclusion: 'success' }));

        const incoming: RawData = makeRawDataWithRuns([
            makeRun({ id: 2, conclusion: 'failure' }),
            makeRun({ id: 3, conclusion: 'success' }),
        ]);
        hub.mergeIncremental(incoming);

        expect(hub.raw.runs).toHaveLength(3);

        const ids = hub.raw.runs.map((r) => r.id).sort((a, b) => Number(a) - Number(b));

        expect(ids).toStrictEqual([1, 2, 3]);
    });

    it('recomputes computed metrics after merge (no stale values)', () => {
        expect.hasAssertions();

        const hub = makeHub();
        hub.raw.runs.push(makeRun({ id: 1, conclusion: 'success' }));

        hub.mergeIncremental(makeRawDataWithRuns([makeRun({ id: 2, conclusion: 'failure' })]));

        // 1 success + 1 failure out of 2 -> 50% pass rate
        expect(hub.computed.passRate).toBe(50);
    });

    it('refreshes timestamp on merge', () => {
        expect.hasAssertions();

        const hub = makeHub();
        const before = new Date(Date.now() - 100000);
        hub.timestamp = before;

        hub.mergeIncremental(makeRawDataWithRuns([makeRun({ id: 99, conclusion: 'success' })]));

        expect(hub.timestamp.getTime()).toBeGreaterThan(before.getTime());
    });

    it('merges job/artifact maps by run id without clobbering existing entries', () => {
        expect.hasAssertions();

        const hub = makeHub();
        const existingJobs = new Map<number, unknown>();
        existingJobs.set(1, [{ id: 1 }]);
        hub.raw.jobs = existingJobs as never;

        const incoming: RawData = makeRawDataWithRuns([makeRun({ id: 2 })]);
        const incomingJobs = new Map<number, unknown>();
        incomingJobs.set(2, [{ id: 2 }]);
        incoming.jobs = incomingJobs as never;

        hub.mergeIncremental(incoming);

        expect(hub.raw.jobs.has(1)).toBeTruthy();
        expect(hub.raw.jobs.has(2)).toBeTruthy();
    });
});

/* ── HasDataChanged ─────────────────────────────────────────────────────── */

describe('HasDataChanged', () => {
    it('returns false when runs are identical', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const raw: RawData = makeRawDataWithRuns(runs);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([
            makeRun({ id: 1, updated_at: '2026-01-01T10:10:00Z' }),
            makeRun({ id: 2, updated_at: '2026-01-01T10:10:00Z' }),
        ]);

        expect(hasDataChanged(hub, newRaw)).toBeFalsy();
    });

    it('returns true when run count differs', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 3 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when new run added', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 2 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run updated_at changes', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1, updated_at: '2026-01-01T10:10:00Z' })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1, updated_at: '2026-01-01T11:00:00Z' })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run id missing in new data', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 2 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run has null id', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: undefined })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when both empty', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeEmptyRawData();
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' }, createMockPersistence());

        const newRaw: RawData = makeEmptyRawData();

        expect(hasDataChanged(hub, newRaw)).toBeFalsy();
    });
});

/* ── loadFromStore tests ─────────────────────────────────────────────────── */

describe('DataHubImpl.loadFromStore', () => {
    it('creates DataHub from MetricsStore with runs', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub).toBeDefined();
        expect(hub.raw.runs).toHaveLength(2);
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe('test-repo');
    });

    it('converts MetricsRun to PipelineRun correctly', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        const run = hub.raw.runs[0];

        expect(run).toBeDefined();
        expect(run?.id).toBe(0);
        expect(run?.run_number).toBe(0);
        expect(run?.head_branch).toBe('main');
        expect(run?.status).toBe('completed');
        expect(run?.conclusion).toBe('success');
        expect(run?.created_at).toBe('2026-01-01T10:00:00Z');
    });

    it('sets conclusion to failure when failed > passed', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: 'main',
                    total: 100,
                    passed: 50,
                    failed: 50,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.runs[0]?.conclusion).toBe('failure');
    });

    it('converts last CoverageSnapshot to RawCoverage', () => {
        const store = makeMetricsStore({
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'main', totalIssues: 100, mappedIssues: 80, coveragePct: 80 },
                { timestamp: '2026-01-02', project: 'main', totalIssues: 100, mappedIssues: 85, coveragePct: 85 },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.coverage).toBeDefined();
        expect(hub.raw.coverage?.total).toBe(100);
        expect(hub.raw.coverage?.covered).toBe(85);
        expect(hub.raw.coverage?.percentage).toBe(85);
    });

    it('sets coverage to undefined when no history', () => {
        const store = makeMetricsStore({ coverageHistory: [] });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.coverage).toBeUndefined();
    });

    it('uses "unknown" when project is empty', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: '',
                    total: 100,
                    passed: 100,
                    failed: 0,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.runs[0]?.head_branch).toBe('unknown');
    });

    it('computes metrics from converted data', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.computed.passRate).toBeDefined();
        expect(typeof hub.computed.passRate).toBe('number');
    });

    it('accepts optional persistence', () => {
        const store = makeMetricsStore();
        const persistence = createMockPersistence();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);

        // Verify persistence is configured by testing that saveRun() delegates correctly
        const testRun = {
            timestamp: '2026-01-01T10:00:00Z',
            project: 'main',
            total: 100,
            passed: 100,
            failed: 0,
            skipped: 0,
            duration: 5000,
            tests: [],
        };
        hub.saveRun('abc123', testRun);

        expect(mockedSafe(persistence).saveRun).toHaveBeenCalledTimes(1);
        expect(mockedSafe(persistence).saveRun.mock.calls[0]).toStrictEqual(['abc123', testRun]);
    });

    it('creates parsedArtifacts from MetricsRun', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: 'main',
                    total: 100,
                    passed: 95,
                    failed: 3,
                    skipped: 2,
                    duration: 5000,
                    tests: [{ title: 'test1', state: 'passed', duration: 100 }],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.parsedArtifacts).toBeDefined();
        expect(hub.raw.parsedArtifacts?.size).toBe(1);

        const artifacts = hub.raw.parsedArtifacts?.get(0);

        expect(artifacts).toBeDefined();
        expect(artifacts).toHaveLength(1);
        expect(artifacts?.[0]?.fileName).toBe('metrics-store');
        expect(artifacts?.[0]?.format).toBe('ctrf');
        expect(artifacts?.[0]?.data.tests).toHaveLength(1);
        expect(artifacts?.[0]?.data.stats).toStrictEqual({
            passed: 95,
            failed: 3,
            skipped: 2,
            total: 100,
            duration: 5000,
        });
    });

    it('preserves failureClassifications', () => {
        const classifications = [
            { timestamp: '2026-01-01T10:00:00Z', testTitle: 'flaky test', category: 'FLAKY', project: 'main' },
        ];
        const store = makeMetricsStore({ failureClassifications: classifications });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.failureClassifications).toBeDefined();
        expect(hub.raw.failureClassifications).toHaveLength(1);
        expect(hub.raw.failureClassifications?.[0]?.testTitle).toBe('flaky test');
    });

    it('does not set failureClassifications when empty', () => {
        const store = makeMetricsStore({ failureClassifications: [] });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.failureClassifications).toBeUndefined();
    });

    it('preserves original timestamps in PipelineRun', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2025-12-25T08:30:00Z',
                    project: 'main',
                    total: 50,
                    passed: 50,
                    failed: 0,
                    skipped: 0,
                    duration: 3000,
                    tests: [],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        expect(hub.raw.runs[0]?.created_at).toBe('2025-12-25T08:30:00Z');
    });

    it('does not add non-existent fields to PipelineRun', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', createMockPersistence());

        const run = hub.raw.runs[0];

        expect(run).toBeDefined();
        expect(run?.id).toBe(0);
        expect(run?.run_number).toBe(0);
        expect(run?.head_branch).toBe('main');
        expect(run?.status).toBe('completed');
        expect(run?.conclusion).toBe('success');
    });
});

describe('DataHubImpl — SSOT Persistence', () => {
    describe('SaveRun()', () => {
        it('delegates to persistence when configured', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);
            const testRun = {
                timestamp: '2026-01-01T10:00:00Z',
                project: 'main',
                total: 100,
                passed: 100,
                failed: 0,
                skipped: 0,
                duration: 5000,
                tests: [],
            };

            hub.saveRun('abc123', testRun);

            expect(mockedSafe(persistence).saveRun).toHaveBeenCalledTimes(1);
            expect(mockedSafe(persistence).saveRun.mock.calls[0]).toStrictEqual(['abc123', testRun]);
        });
    });

    describe('SaveCoverageSnapshot()', () => {
        it('delegates to persistence when configured', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);
            const snapshot: CoverageSnapshot = {
                timestamp: '2026-01-01',
                project: 'main',
                totalIssues: 100,
                mappedIssues: 80,
                coveragePct: 80,
            };

            hub.saveCoverageSnapshot(snapshot);

            expect(mockedSafe(persistence).saveCoverageSnapshot).toHaveBeenCalledTimes(1);
            expect(mockedSafe(persistence).saveCoverageSnapshot.mock.calls[0]).toStrictEqual([snapshot]);
        });
    });

    describe('SaveFailureClassification()', () => {
        it('delegates to persistence when configured', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);
            const classification: FailureClassification = {
                timestamp: '2026-01-01T10:00:00Z',
                testTitle: 'test failure',
                category: 'REVERT',
                project: 'main',
            };

            hub.saveFailureClassification(classification);

            expect(mockedSafe(persistence).saveFailureClassification).toHaveBeenCalledTimes(1);
            expect(mockedSafe(persistence).saveFailureClassification.mock.calls[0]).toStrictEqual([classification]);
        });
    });

    describe('Flush()', () => {
        it('delegates to persistence when configured', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);

            hub.flush('test commit');

            expect(mockedSafe(persistence).flush).toHaveBeenCalledTimes(1);
            expect(mockedSafe(persistence).flush.mock.calls[0]).toStrictEqual(['test commit']);
        });
    });

    describe('SaveParseResult() (F0-T8 reconciliation)', () => {
        function makeParseResult(overrides?: { failed?: number; title?: string }): ParseResult {
            const failed = overrides?.failed ?? 0;
            const passed = 3 - failed;
            return {
                tests: [
                    { title: overrides?.title ?? 'test1', state: 'passed', duration: 100 },
                    { title: 'test2', state: 'passed', duration: 100 },
                    { title: 'test3', state: failed > 0 ? 'failed' : 'passed', duration: 100 },
                ],
                stats: {
                    passed,
                    failed,
                    skipped: 0,
                    total: 3,
                    duration: 300,
                },
            };
        }

        it('delegates to persistence and reconciles parsedArtifacts under sourceRunId', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);
            const result = makeParseResult();

            hub.saveParseResult('my-project', result, 42);

            expect(mockedSafe(persistence).saveParseResult).toHaveBeenCalledTimes(1);
            expect(mockedSafe(persistence).saveParseResult.mock.calls[0]).toStrictEqual(['my-project', result]);

            const artifacts = hub.raw.parsedArtifacts;

            expect(artifacts).toBeDefined();

            const run42 = artifacts?.get(42)?.[0];

            expect(run42).toBeDefined();
            expect(run42?.fileName).toBe('42');
            expect(run42?.data).toBe(result);
        });

        it('recomputes computed.metricsRuns[0] from the reconciled artifact (never stale)', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);
            const result = makeParseResult();

            hub.saveParseResult('my-project', result, 42);

            expect(hub.computed.metricsRuns).toHaveLength(3);

            const firstRun = hub.computed.metricsRuns?.[0];

            expect(firstRun).toBeDefined();
            expect(firstRun?.tests).toStrictEqual(result.tests);
            expect(firstRun?.total).toBe(3);
            expect(firstRun?.passed).toBe(3);
            expect(firstRun?.failed).toBe(0);
        });

        it('dedups by sourceRunId: same key replaces the previous artifact', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);

            hub.saveParseResult('my-project', makeParseResult(), 42);
            const second = makeParseResult({ failed: 1, title: 'second' });
            hub.saveParseResult('my-project', second, 42);

            const artifacts = hub.raw.parsedArtifacts;

            expect(artifacts?.get(42)).toHaveLength(1);

            const latest = artifacts?.get(42)?.[0];

            expect(latest).toBeDefined();
            expect(latest?.data).toBe(second);
            expect(hub.computed.metricsRuns).toHaveLength(3);
            expect(hub.computed.metricsRuns?.[0]?.failed).toBe(1);
        });

        it('uses the user-fallback slot (key 0) when sourceRunId is omitted', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);

            hub.saveParseResult('my-project', makeParseResult());

            const artifacts = hub.raw.parsedArtifacts;

            expect(artifacts?.get(0)).toHaveLength(1);

            const slot = artifacts?.get(0)?.[0];

            expect(slot).toBeDefined();
            expect(slot?.fileName).toBe('user-fallback');
        });

        it('throws on non-integer sourceRunId (§24 boundary guard)', () => {
            const store = makeMetricsStore();
            const persistence = createMockPersistence();
            const hub = DataHubImpl.loadFromStore(store, 'test-repo', persistence);

            expect(() => hub.saveParseResult('my-project', makeParseResult(), 1.5)).toThrow(/inteiro/);
            expect(() => hub.saveParseResult('my-project', makeParseResult(), NaN)).toThrow(/inteiro/);
            expect(mockedSafe(persistence).saveParseResult).not.toHaveBeenCalled();
        });
    });
});
