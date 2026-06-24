/**
 * Integration tests — Traceability Matrix (FT-33)
 *
 * Validates end-to-end flow:
 * - buildTraceabilityMatrix → generateTraceabilityHtml
 * - HTML output structure, tree rendering, error handling, custom title
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { MetricsStore } from '../../metrics.js';

vi.mock('../../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

beforeEach(() => {
    vi.restoreAllMocks();
});

function singleRunMetrics(
    tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>,
): MetricsStore {
    return {
        runs: [
            {
                timestamp: '2026-06-01T00:00:00.000Z',
                project: 'test',
                total: tests.length,
                passed: tests.filter((t) => t.state === 'passed').length,
                failed: tests.filter((t) => t.state === 'failed').length,
                skipped: tests.filter((t) => t.state === 'skipped').length,
                duration: tests.reduce((s, t) => s + t.duration, 0),
                tests: tests.map((t) => ({ title: t.title, state: t.state, duration: t.duration })),
            },
        ],
    };
}

describe('Integration: Traceability Matrix', () => {
    describe('FT-33a: basic HTML generation with nodes', () => {
        it('generates valid HTML from matrix data with epic tree', async () => {expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const metrics = singleRunMetrics([
                { title: 'TC-001', state: 'passed', duration: 200 },
                { title: 'TC-002', state: 'passed', duration: 150 },
            ]);
            const result = buildTraceabilityMatrix(metrics, {
                items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
                totals: { total: 1, covered: 1 },
                byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            });
            const html = generateTraceabilityHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Traceability Matrix');
            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('epic-node');
            expect(html).toContain('story-node');
            expect(html).toContain('test-row');
            expect(html).toContain('test-passed');
            expect(html).toContain('EPIC-1');
            expect(html).toContain('STORY-1');
            expect(html).toContain('TC-001');
            expect(html).toContain('TC-002');
        });

        it('renders health bars and status badges', async () => {expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const metrics = singleRunMetrics([
                { title: 'TC-PASS', state: 'passed', duration: 100 },
                { title: 'TC-FAIL', state: 'failed', duration: 50 },
            ]);
            const result = buildTraceabilityMatrix(metrics, {
                items: [
                    {
                        epic: 'EPIC-1',
                        hasTest: true,
                        linkedTestKeys: ['TC-PASS', 'TC-FAIL'],
                        issueKey: 'STORY-1',
                    },
                ],
                totals: { total: 1, covered: 1 },
                byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            });
            const html = generateTraceabilityHtml(result);

            expect(html).toContain('health-bar');
            expect(html).toContain('health-fill');
            expect(html).toContain('status-passed');
            expect(html).toContain('status-failed');
        });
    });

    describe('FT-33b: empty input shows no-data message', () => {
        it('generates HTML with no-data message when no epics exist', async () => {expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const metrics: MetricsStore = { runs: [] };
            const result = buildTraceabilityMatrix(metrics);
            const html = generateTraceabilityHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No traceability data available');
            expect(html).not.toContain('class="epic-node"');
        });
    });

    describe('FT-33c: null/undefined input returns error page', () => {
        it('returns error page for null result', async () => {expect.hasAssertions();

            const { generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const html = generateTraceabilityHtml(null);

            expect(html).toContain('Error generating traceability matrix');
        });

        it('returns error page for undefined result', async () => {expect.hasAssertions();

            const { generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const html = generateTraceabilityHtml(undefined);

            expect(html).toContain('Error generating traceability matrix');
        });
    });

    describe('FT-33d: custom title', () => {
        it('uses custom title in HTML and page title', async () => {expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const metrics = singleRunMetrics([]);
            const result = buildTraceabilityMatrix(metrics);
            const html = generateTraceabilityHtml(result, 'Release 3.0 Traceability');

            expect(html).toContain('<title>Release 3.0 Traceability</title>');
            expect(html).toContain('<h1>Release 3.0 Traceability</h1>');
        });

        it('defaults to Traceability Matrix when no title given', async () => {expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');
            const metrics = singleRunMetrics([]);
            const result = buildTraceabilityMatrix(metrics);
            const html = generateTraceabilityHtml(result);

            expect(html).toContain('<title>Traceability Matrix</title>');
            expect(html).toContain('<h1>Traceability Matrix</h1>');
        });
    });
});
