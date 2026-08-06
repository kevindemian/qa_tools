/**
 * System tests — Quality Gate (FT-10 D1-D5 / F1-F2 / EIXO C)
 *
 * Full pipeline: DataProvider (external, mocked) → DataHubImpl → runQualityGate →
 * buildQualityGateSectionMd / generateHtmlReport.
 *
 * Boundary discipline (AGENTS §26.2): only the external `DataProvider.fetchRawData`
 * (CI API boundary) is mocked. ALL local business logic runs real:
 *   - DataHubImpl.create / computeMetrics (gating, provenance)
 *   - calculateHealthScore
 *   - runQualityGate (health-score + data-quality:* checks, EIXO C incompleteItems)
 *   - buildQualityGateSectionMd (markdown SSOT) + generateHtmlReport (HTML)
 *
 * Prioritizes negative/edge cases: empty data, non-finite (Rule 24/25 N/A),
 * low-confidence valid category (F1), missing categories (never silent pass).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { DataProvider, DataHub, RawData } from '../../types/data-hub.js';
import { DataHubImpl } from '../../data-hub/hub.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';

const METRICS_BASE = () => ({
    timestamp: new Date().toISOString(),
    project: 'owner/repo',
});

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

function createMockDataProvider(rawData: RawData): DataProvider {
    return {
        name: 'mock-github',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(rawData),
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
        name: 'test',
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

/**
 * Runs present (so gate does not short-circuit to `metrics-data` at line 190),
 * but NO ST-1 category data -> all 8 incompleteItems must be reported.
 */
function runsOnlyRawData(): RawData {
    return {
        runs: [
            makeRun(1, { conclusion: 'success' }),
            makeRun(2, { conclusion: 'success' }),
            makeRun(3, { conclusion: 'success' }),
        ],
        jobs: new Map<number, PipelineJob[]>([
            [1, [makeJob(10)]],
            [2, [makeJob(20)]],
            [3, [makeJob(30)]],
        ]),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

/** Healthy pipeline: 4/5 success -> 80% pass, execution rate 80%. */
function healthyRawData(): RawData {
    return {
        runs: [
            makeRun(1, { conclusion: 'success' }),
            makeRun(2, { conclusion: 'success' }),
            makeRun(3, { conclusion: 'success' }),
            makeRun(4, { conclusion: 'success' }),
            makeRun(5, { conclusion: 'failure' }),
        ],
        jobs: new Map<number, PipelineJob[]>([
            [1, [makeJob(10), makeJob(11, { name: 'lint', status: 'success' })]],
            [2, [makeJob(20)]],
            [3, [makeJob(30)]],
            [4, [makeJob(40)]],
            [5, [makeJob(50, { status: 'failure' })]],
        ]),
        artifacts: new Map(),
        failureReasons: new Map(),
        coverage: { total: 100, covered: 85, percentage: 85 },
        coverageFiles: [{ file: 'src/a.ts', lines: { total: 10, covered: 10, percentage: 100 }, confidence: 0.54 }],
    };
}

async function buildHub(raw: RawData): Promise<DataHub> {
    const provider = createMockDataProvider(raw);
    const result = await DataHubImpl.create([provider], { repo: 'owner/repo' }, makeDataHubPersistenceMock());
    return result.hub;
}

describe('System: Quality Gate — Full Pipeline Flow', () => {
    describe('Real hub → runQualityGate', () => {
        it('emits health-score + data-quality checks on healthy data (D1)', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const hub = await buildHub(healthyRawData());
            const result = runQualityGate({ dataHub: hub });

            const names = result.checks.map((c) => c.name);

            expect(names).toContain('health-score');
            expect(names.some((n) => n.startsWith('data-quality:'))).toBeTruthy();

            // EIXO C: healthy coverageFiles present -> gated + in checks.
            expect(names).toContain('data-quality:coverageFiles');
        });

        it('fails explicitly (metrics-data) when there is no metrics data at all (negative)', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const raw: RawData = { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() };
            const hub = await buildHub(raw);
            const result = runQualityGate({ dataHub: hub });

            expect(result.overall).toBe('fail');
            expect(result.checks.map((c) => c.name)).toContain('metrics-data');
            expect(result.score).toBe(0);
        });
    });

    describe('F1 — valid low-confidence category (never gated by confidence)', () => {
        it('passes a present valid category with confidence surfaced in details, not as a gate', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const hub = await buildHub(healthyRawData());
            const result = runQualityGate({ dataHub: hub });

            const categoryCheck = result.checks.find((c) => c.name === 'data-quality:coverageFiles');

            expect(categoryCheck).toBeDefined();
            expect(categoryCheck?.status).toBe('pass');
            expect(categoryCheck?.score).toBe(100);
            expect(categoryCheck?.threshold).toBe(100);
            // confidence remains metadata in details — never a pass gate.
            expect(categoryCheck?.details).toContain('confidence ');
        });
    });

    describe('EIXO C — data categories absent are reported, never silently passed', () => {
        it('lists absent categories in incompleteItems (never silent pass)', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            // Runs present but no ST-1 category data -> all 8 categories absent.
            const hub = await buildHub(runsOnlyRawData());
            const result = runQualityGate({ dataHub: hub });

            expect(result.incompleteItems ?? []).toHaveLength(8);
            expect(result.incompleteItems).toContain('failureRecords');
            expect(result.incompleteItems).toContain('coverageFiles');
        });
    });

    describe('Renderers — SSOT markdown + HTML gate section', () => {
        it('buildQualityGateSectionMd surfaces EIXO C items and never renders NaN (Rule 24/25)', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const { buildQualityGateSectionMd } = await import('../../pr-report-core.js');
            const hub = await buildHub(healthyRawData());
            const result = runQualityGate({ dataHub: hub });
            const md = buildQualityGateSectionMd(result);

            expect(md).toContain('## Quality Gate:');
            expect(md).toContain('health-score');
            expect(md).not.toContain('NaN');
        });

        it('generateHtmlReport renders composite gate section when qualityGateResult provided', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const { generateHtmlReport } = await import('../../report/report-html.js');
            const hub = await buildHub(healthyRawData());
            const qgResult = runQualityGate({ dataHub: hub });

            const html = generateHtmlReport([{ title: 'T1', state: 'passed' as const, duration: 1 }], {
                computed: {
                    ...hub.computed,
                    metricsRuns: [
                        {
                            ...METRICS_BASE(),
                            tests: [{ title: 'T1', state: 'passed', duration: 1 }],
                            total: 1,
                            passed: 1,
                            failed: 0,
                            skipped: 0,
                            duration: 1,
                        },
                    ],
                    testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                },
                title: 'System QG',
                qualityGateResult: qgResult,
            });

            expect(html).toContain('data-component="quality-gate"');
            expect(html).toContain('health-score');
        });

        it('f2: HTML dashboard renderer surfaces incompleteItems via data-part (EIXO C absent categories)', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality/quality-gate.js');
            const { generateHtmlReport } = await import('../../report/report-html.js');
            const hub = await buildHub(runsOnlyRawData());
            const qgResult = runQualityGate({ dataHub: hub });

            expect(qgResult.incompleteItems ?? []).toContain('failureRecords');

            const html = generateHtmlReport([{ title: 'T1', state: 'passed' as const, duration: 1 }], {
                computed: {
                    ...hub.computed,
                    metricsRuns: [
                        {
                            ...METRICS_BASE(),
                            tests: [{ title: 'T1', state: 'passed', duration: 1 }],
                            total: 1,
                            passed: 1,
                            failed: 0,
                            skipped: 0,
                            duration: 1,
                        },
                    ],
                    testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                },
                title: 'System QG',
                qualityGateResult: qgResult,
            });

            expect(html).toContain('data-part="quality-gate-incomplete"');
            expect(html).toContain('Dados ausentes (EIXO C):');
            expect(html).toContain('failureRecords');
            expect(html).not.toContain('NaN');
        });
    });
});
