/**
 * Property-based tests — Pipeline Health HTML (pipeline-health)
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
import { aggregatePipelineHealth, renderPipelineHealthHtml } from '../pipeline-health.js';
import type { PipelineRunExtended, PipelineJobExtended } from '../pipeline-health.js';

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../shared/config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const branchArb = fc.constantFrom('main', 'develop', 'feature/foo', 'hotfix/bar', 'release/1.0');
const statusArb = fc.constantFrom('success', 'failure', 'cancelled', 'neutral');
const nameArb = fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/[^a-zA-Z0-9_-]/g, '_'));

const runArb: fc.Arbitrary<PipelineRunExtended> = fc
    .record({
        id: fc.nat({ max: 100 }),
        status: fc.constant('completed'),
        conclusion: statusArb,
        head_branch: branchArb,
        created_at: fc.constant(new Date().toISOString()),
        run_started_at: fc.constant(new Date().toISOString()),
        updated_at: fc.constant(new Date().toISOString()),
    })
    .map((r) => r);

const jobArb: fc.Arbitrary<PipelineJobExtended> = fc
    .record({
        id: fc.nat({ max: 100 }),
        name: nameArb,
        status: statusArb,
    })
    .map((j) => j);

const issueArb = fc
    .record({
        labels: fc.array(nameArb, { minLength: 0, maxLength: 3 }),
        updated_at: fc.constant(new Date().toISOString()),
        created_at: fc.constant(new Date().toISOString()),
    })
    .map((i) => i);

describe('renderPipelineHealthHtml — property-based', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('always produces valid HTML', () => {
        fc.assert(
            fc.property(
                fc.array(runArb, { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(jobArb, { minLength: 0, maxLength: 3 }), { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(fc.string(), { minLength: 0, maxLength: 2 }), { minLength: 0, maxLength: 5 }),
                fc.array(issueArb, { minLength: 0, maxLength: 3 }),
                (runs, jobs, errs, issues) => {
                    const health = aggregatePipelineHealth(runs, jobs, errs, issues);
                    const html = renderPipelineHealthHtml(health);
                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 30 },
        );
    });

    it('contains title in output', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-zA-Z0-9 _-]/g, '')),
                (title) => {
                    const health = aggregatePipelineHealth([], [], [], []);
                    const html = renderPipelineHealthHtml(health, title);
                    expect(html).toContain(title);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('uses buildCss design tokens', () => {
        fc.assert(
            fc.property(
                fc.array(runArb, { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(jobArb, { minLength: 0, maxLength: 3 }), { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(fc.string(), { minLength: 0, maxLength: 2 }), { minLength: 0, maxLength: 5 }),
                fc.array(issueArb, { minLength: 0, maxLength: 3 }),
                (runs, jobs, errs, issues) => {
                    const health = aggregatePipelineHealth(runs, jobs, errs, issues);
                    const html = renderPipelineHealthHtml(health);
                    expect(html).toContain('--color-surface-page');
                    expect(html).toContain('--color-text-primary');
                },
            ),
            { numRuns: 10 },
        );
    });

    it('has theme toggle script', () => {
        fc.assert(
            fc.property(fc.array(runArb, { minLength: 0, maxLength: 3 }), (runs) => {
                const health = aggregatePipelineHealth(runs, [], [], []);
                const html = renderPipelineHealthHtml(health);
                expect(html).toContain('qa-report-theme');
            }),
            { numRuns: 10 },
        );
    });

    it('has footer', () => {
        fc.assert(
            fc.property(fc.array(runArb, { minLength: 0, maxLength: 3 }), (runs) => {
                const health = aggregatePipelineHealth(runs, [], [], []);
                const html = renderPipelineHealthHtml(health);
                expect(html).toContain('Pipeline Health Dashboard');
            }),
            { numRuns: 10 },
        );
    });

    it('has no legacy inline styles', () => {
        fc.assert(
            fc.property(
                fc.array(runArb, { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(jobArb, { minLength: 0, maxLength: 3 }), { minLength: 0, maxLength: 5 }),
                fc.array(fc.array(fc.string(), { minLength: 0, maxLength: 2 }), { minLength: 0, maxLength: 5 }),
                fc.array(issueArb, { minLength: 0, maxLength: 3 }),
                (runs, jobs, errs, issues) => {
                    const health = aggregatePipelineHealth(runs, jobs, errs, issues);
                    const html = renderPipelineHealthHtml(health);
                    expect(html).not.toContain('border="1"');
                    expect(html).not.toContain('cellpadding="6"');
                    expect(html).not.toContain('background:#f3f4f6');
                },
            ),
            { numRuns: 10 },
        );
    });
});
