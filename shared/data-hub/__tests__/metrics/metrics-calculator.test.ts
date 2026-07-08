import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../../metrics/metrics-calculator.js';
import type { RawData } from '../../../types/data-hub.js';
import type { ArtifactParseResult } from '../../artifact-parser.js';

const EMPTY_RAW: RawData = {
    runs: [],
    jobs: new Map(),
    artifacts: new Map(),
    failureReasons: new Map(),
};

describe('CalculateMetrics', () => {
    it('r1: RawData vazia → métricas zeradas', () => {
        expect.hasAssertions();

        const result = calculateMetrics(EMPTY_RAW);

        expect(result.passRate).toBe(0);
        expect(result.avgDuration).toBe(0);
        expect(result.coverage).toBe(0);
        expect(result.flakyRate).toStrictEqual([]);
        expect(result.topFailingJobs).toStrictEqual([]);
        expect(result.topFailureReasons).toStrictEqual([]);
    });

    it('r2: Pass rate calculado corretamente', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [
                { id: 1, conclusion: 'success' },
                { id: 2, conclusion: 'success' },
                { id: 3, conclusion: 'failure' },
                { id: 4, conclusion: 'success' },
            ],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.passRate).toBeCloseTo(75);
    });

    it('r3: Average duration calculado', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [
                { id: 1, run_started_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z' },
                { id: 2, run_started_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:02:00Z' },
            ],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.avgDuration).toBeGreaterThan(0);
    });

    it('r4: Release score calculado', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [
                { id: 1, conclusion: 'success' },
                { id: 2, conclusion: 'success' },
            ],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.releaseScore.score).toBeGreaterThan(0);
        expect(result.releaseScore.grade).toBeDefined();
    });

    it('r5: Pipeline cost calculado', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [{ id: 1, run_started_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:30:00Z' }],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.pipelineCost.totalMinutes).toBeGreaterThan(0);
    });

    it('r6: branch breakdown presente', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [{ id: 1, head_branch: 'main', conclusion: 'success' }],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.branchBreakdown).toBeDefined();
    });

    it('r7: parsedArtifacts vazio → testCounts zerados', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            parsedArtifacts: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.testCounts).toStrictEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
        expect(result.testPassRate).toBe(0);
    });

    it('r8: parsedArtifacts com dados → testCounts agregados', () => {
        expect.hasAssertions();

        const artifact: ArtifactParseResult = {
            fileName: 'ctrf.json',
            format: 'ctrf',
            data: {
                tests: [],
                stats: { passed: 10, failed: 2, skipped: 1, total: 13, duration: 500 },
            },
        };
        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            parsedArtifacts: new Map([[1, [artifact]]]),
        };
        const result = calculateMetrics(raw);

        expect(result.testCounts).toStrictEqual({ passed: 10, failed: 2, skipped: 1, total: 13 });
        expect(result.testPassRate).toBeCloseTo(76.92);
    });

    it('r9: timing vazio não causa erro', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [{ id: 1, conclusion: 'success' }],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            timing: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.avgDuration).toBe(0);
    });

    it('r10: framework detectado propagado', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            framework: 'vitest',
        };
        const result = calculateMetrics(raw);

        expect(result.framework).toBe('vitest');
    });

    it('r11: framework ausente → unknown', () => {
        expect.hasAssertions();

        const result = calculateMetrics(EMPTY_RAW);

        expect(result.framework).toBe('unknown');
    });

    it('r12: coverage vazio → 0', () => {
        expect.hasAssertions();

        const result = calculateMetrics(EMPTY_RAW);

        expect(result.coverage).toBe(0);
    });

    it('r13: coverage com dados', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            coverage: { total: 80, covered: 64, percentage: 80 },
        };
        const result = calculateMetrics(raw);

        expect(result.coverage).toBe(80);
    });
});
