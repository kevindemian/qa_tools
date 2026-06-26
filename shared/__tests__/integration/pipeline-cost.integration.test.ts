/**
 * Integration tests — Pipeline Cost (FT-29)
 *
 * Validates the Pipeline Cost Analytics report end-to-end:
 * - calculatePipelineCost + generatePipelineCostHtml with runs
 * - Empty input
 * - Error fallback
 * - Custom title
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsRun } from '../../metrics.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-06-16T00:00:00.000Z',
        project: 'test',
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 120,
        tests: [],
        ...overrides,
    };
}

describe('Integration: Pipeline Cost (FT-29)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-29a: calculate and render pipeline cost', () => {
        it('produces complete HTML with summary and data table', async () => {expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const runs = [makeRun({ timestamp: '2026-06-16T00:00:00.000Z', duration: 120, failed: 1, passed: 9 })];
            const result = calculatePipelineCost(runs, 0.01);
            const html = generatePipelineCostHtml(result);

            const parts = ['<!DOCTYPE html>', 'Pipeline Cost Analytics', 'Total Cost', 'Avg Cost / Run', 'Total Duration', 'Run Count', '$0.02', '2m', 'failed', 'data-component="data-table"'];

            expect(parts.every(p => html.includes(p))).toBeTruthy();
        });
    });

    describe('FT-29b: empty runs', () => {
        it('shows no-data message and zeroed metrics', async () => {expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const result = calculatePipelineCost([]);
            const html = generatePipelineCostHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No pipeline run data available');
            expect(html).toContain('$0.00');
            expect(html).toContain('0');
        });
    });

    describe('FT-29d: custom title', () => {
        it('uses custom title in HTML page', async () => {expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const result = calculatePipelineCost([]);
            const html = generatePipelineCostHtml(result, 'My Cost Report');

            expect(html).toContain('My Cost Report');
        });
    });
});
