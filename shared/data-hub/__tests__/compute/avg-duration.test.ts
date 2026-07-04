import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import { calcAvgDuration } from '../../compute/avg-duration.js';

function makeRun(start: string, end: string): PipelineRun {
    return {
        id: 1,
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
