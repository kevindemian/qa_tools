import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import type { WorkflowRunTiming } from '../../../types/data-hub.js';
import { calcAvgDuration } from '../../compute/avg-duration.js';

function makeRun(start: string, end: string, id = 1): PipelineRun {
    return {
        id,
        conclusion: 'success',
        run_started_at: start,
        updated_at: end,
    };
}

describe('Compute/avg-duration', () => {
    it('returns 0 for empty runs', () => {
        expect.hasAssertions();
        expect(calcAvgDuration([])).toBe(0);
    });

    it('returns 0 when no runs have timing data', () => {
        expect.hasAssertions();
        expect(calcAvgDuration([{ id: 1 }])).toBe(0);
    });

    it('calculates single run duration', () => {
        expect.hasAssertions();

        const runs = [makeRun('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z')];

        expect(calcAvgDuration(runs)).toBe(300);
    });

    it('calculates average of multiple runs', () => {
        expect.hasAssertions();

        const runs = [
            makeRun('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z'),
            makeRun('2026-07-01T11:00:00Z', '2026-07-01T11:10:00Z'),
        ];

        expect(calcAvgDuration(runs)).toBe(450);
    });

    it('saturates at 86400 (24h)', () => {
        expect.hasAssertions();

        const runs = [makeRun('2026-07-01T00:00:00Z', '2026-07-02T00:00:01Z')];

        expect(calcAvgDuration(runs)).toBe(86400);
    });

    it('skips runs with invalid dates', () => {
        expect.hasAssertions();

        const runs = [
            makeRun('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z'),
            { id: 2, run_started_at: 'invalid', updated_at: 'also-invalid' },
        ];

        expect(calcAvgDuration(runs)).toBe(300);
    });

    it('skips runs where end is before start', () => {
        expect.hasAssertions();

        const runs = [makeRun('2026-07-01T10:05:00Z', '2026-07-01T10:00:00Z')];

        expect(calcAvgDuration(runs)).toBe(0);
    });
});

function timing(entries: Array<[number, number]>): Map<number, WorkflowRunTiming> {
    const m = new Map<number, WorkflowRunTiming>();
    for (const [id, ms] of entries) {
        m.set(id, { run_duration_ms: ms });
    }
    return m;
}

describe('Compute/avg-duration — via timing data (run_duration_ms)', () => {
    it('usa run_duration_ms convertido para segundos quando timing existe', () => {
        const runs: PipelineRun[] = [{ id: 1 }];

        expect(calcAvgDuration(runs, timing([[1, 300000]]))).toBe(300);
    });

    it('timing tem prioridade sobre timestamps do run', () => {
        const runs = [makeRun('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z')];

        expect(calcAvgDuration(runs, timing([[1, 120000]]))).toBe(120);
    });

    it('resolve runId em string via parseInt para lookup no Map', () => {
        const runs: PipelineRun[] = [{ id: '42' }];

        expect(calcAvgDuration(runs, timing([[42, 60000]]))).toBe(60);
    });

    it('faz fallback para timestamps quando o Map não tem o runId', () => {
        const runs = [makeRun('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z')];

        expect(calcAvgDuration(runs, timing([[999, 120000]]))).toBe(300);
    });

    it('faz fallback para timestamps quando run.id é ausente', () => {
        const runs: PipelineRun[] = [{ run_started_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:05:00Z' }];

        expect(calcAvgDuration(runs, timing([[1, 120000]]))).toBe(300);
    });

    it('média entre run com timing (id 1) e run com timestamp (id 2, sem timing)', () => {
        const runs: PipelineRun[] = [{ id: 1 }, makeRun('2026-07-01T11:00:00Z', '2026-07-01T11:10:00Z', 2)];

        expect(calcAvgDuration(runs, timing([[1, 120000]]))).toBe(360);
    });
});
