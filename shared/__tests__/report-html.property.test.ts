/**
 * Property-based tests — HTML Report (FT-17)
 *
 * Invariants:
 * - generateHtmlReport: always produces valid HTML, contains all test titles
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateHtmlReport } from '../report/report-html.js';
import type { FlatTest } from '../result_parser.js';
import type { ComputedMetrics } from '../types/data-hub.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeString = (min: number, max: number) =>
    fc
        .stringMatching(/^[a-zA-Z0-9 _.-]+$/)
        .map((s) => s.slice(0, max))
        .filter((s) => s.length >= min);

const flatTestArb: fc.Arbitrary<FlatTest> = fc.record({
    title: safeString(1, 20),
    state: fc.constantFrom('passed', 'failed', 'skipped'),
    duration: fc.integer({ min: 0, max: 60000 }),
});

function computedFor(tests: FlatTest[]): ComputedMetrics {
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    return {
        passRate: passed + failed > 0 ? (passed / (passed + failed)) * 100 : 0,
        avgDuration: 0,
        suiteSpeedP95: 0,
        flakyRate: [],
        coverage: 0,
        pipelineCost: { totalRuns: 0, totalCostUsd: 0, billableMinutes: 0 },
        defectTrends: [],
        branchBreakdown: {},
        topFailingJobs: [],
        topFailureReasons: [],
        releaseScore: { overall: 0, grade: 'unknown' as const, metrics: {} },
        quarantineStatus: { blocked: 0, quarantined: 0, passed: 0 },
        testPassRate: passed + failed > 0 ? (passed / (passed + failed)) * 100 : 0,
        testCounts: { passed, failed, skipped: 0, total: tests.length },
        framework: '',
        metricsRuns: [
            {
                timestamp: '2026-05-31T00:00:00Z',
                project: 'qa-tools',
                total: tests.length,
                passed,
                failed,
                skipped: 0,
                duration: 0,
                tests,
            },
        ],
    } as unknown as ComputedMetrics;
}

describe('GenerateHtmlReport — property-based', () => {
    it('contains all test titles', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flatTestArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const html = generateHtmlReport(tests, {
                    computed: computedFor(tests),
                });
                for (const t of tests) {
                    expect(html).toContain(t.title);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('always produces valid HTML structure', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flatTestArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const html = generateHtmlReport(tests, {
                    computed: computedFor(tests),
                });

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('<html');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });
});
