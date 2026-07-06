import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../../metrics/metrics-calculator.js';
import type { RawData } from '../../../types/data-hub.js';

const EMPTY_RAW: RawData = {
    runs: [],
    jobs: new Map(),
    artifacts: new Map(),
    failureReasons: new Map(),
};

describe('CalculateMetrics', () => {
    it('r1: RawData vazia → métricas zeradas', () => {
        const result = calculateMetrics(EMPTY_RAW);

        expect(result.passRate).toBe(0);
        expect(result.avgDuration).toBe(0);
        expect(result.coverage).toBe(0);
        expect(result.flakyRate).toStrictEqual([]);
        expect(result.topFailingJobs).toStrictEqual([]);
        expect(result.topFailureReasons).toStrictEqual([]);
    });

    it('r2: Pass rate calculado corretamente', () => {
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
        const raw: RawData = {
            runs: [{ id: 1, head_branch: 'main', conclusion: 'success' }],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const result = calculateMetrics(raw);

        expect(result.branchBreakdown).toBeDefined();
    });
});
