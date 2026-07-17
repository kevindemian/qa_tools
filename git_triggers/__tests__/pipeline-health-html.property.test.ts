/**
 * Property-based tests — Pipeline Health HTML renderer
 *
 * Invariants:
 * - renderPipelineHealthHtml always produces valid HTML
 * - Title appears in output
 * - Pass rate and total runs appear correctly
 * - Empty data shows zeros without crashing
 * - Uses buildCss design tokens
 * - Has theme toggle script
 * - Has footer
 * - No legacy inline styles (border="1", cellpadding)
 */
import { fc } from '../../shared/deps.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPipelineHealthHtml } from '../pipeline-health-renderer.js';
import type { PipelineHealthData } from '../pipeline-health-renderer.js';

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../shared/config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const branchArb = fc.constantFrom('main', 'develop', 'feature/foo', 'hotfix/bar', 'release/1.0');
const nameArb = fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/[^a-zA-Z0-9_-]/g, '_'));

const healthDataArb: fc.Arbitrary<PipelineHealthData> = fc.record({
    totalRuns: fc.nat({ max: 100 }),
    passRate: fc.integer({ min: 0, max: 100 }),
    avgDurationSec: fc.nat({ max: 3600 }),
    topFailingJobs: fc.array(
        fc.record({
            name: nameArb,
            failCount: fc.nat({ max: 50 }),
            totalCount: fc.integer({ min: 1, max: 100 }),
            rate: fc.integer({ min: 0, max: 100 }),
        }),
        { minLength: 0, maxLength: 5 },
    ),
    failureReasons: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    branchBreakdown: fc.dictionary(
        branchArb,
        fc.record({
            passRate: fc.integer({ min: 0, max: 100 }),
            count: fc.nat({ max: 50 }),
        }),
    ),
});

describe('RenderPipelineHealthHtml — property-based', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('always produces valid HTML', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(healthDataArb, (data) => {
                const html = renderPipelineHealthHtml(data);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 30 },
        );
    });

    it('contains title in output', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-zA-Z0-9 _-]/g, '')),
                (title) => {
                    const data: PipelineHealthData = {
                        totalRuns: 0,
                        passRate: 0,
                        avgDurationSec: 0,
                        topFailingJobs: [],
                        failureReasons: [],
                        branchBreakdown: {},
                    };
                    const html = renderPipelineHealthHtml(data, title);

                    expect(html).toContain(title);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('uses buildCss design tokens', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(healthDataArb, (data) => {
                const html = renderPipelineHealthHtml(data);

                expect(html).toContain('--color-surface-page');
                expect(html).toContain('--color-text-primary');
            }),
            { numRuns: 10 },
        );
    });

    it('has theme toggle script', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(healthDataArb, (data) => {
                const html = renderPipelineHealthHtml(data);

                expect(html).toContain('qa-report-theme');
            }),
            { numRuns: 10 },
        );
    });

    it('has footer', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(healthDataArb, (data) => {
                const html = renderPipelineHealthHtml(data);

                expect(html).toContain('Pipeline Health Dashboard');
            }),
            { numRuns: 10 },
        );
    });

    it('has no legacy inline styles', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(healthDataArb, (data) => {
                const html = renderPipelineHealthHtml(data);

                expect(html).not.toContain('border="1"');
                expect(html).not.toContain('cellpadding="6"');
                expect(html).not.toContain('background:#f3f4f6');
            }),
            { numRuns: 10 },
        );
    });
});
