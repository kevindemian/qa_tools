/**
 * Property-Based Tests — Traceability Matrix (FT-33)
 *
 * Invariants:
 * - buildTraceabilityMatrix: nodes.length equals totalEpics
 * - overallCoverage in [0, 100]
 * - totalTests >= 0 and totalEpics >= 0
 * - Each node has required fields
 * - Timestamp is valid ISO
 * - generateTraceabilityHtml always produces valid HTML
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildTraceabilityMatrix, generateTraceabilityHtml } from '../traceability-matrix.js';
import type { MetricsRun } from '../types/data-hub.js';
import { createTestHub } from './test-hub.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

function matrix(
    metrics: MetricsRun[],
    coverage?: Parameters<typeof buildTraceabilityMatrix>[1],
): ReturnType<typeof buildTraceabilityMatrix> {
    return buildTraceabilityMatrix(metrics, coverage, createTestHub());
}

const TestStateArb = fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const);

const FlatTestArb = fc.record({
    title: fc.string({ minLength: 1, maxLength: 15 }),
    state: TestStateArb,
    duration: fc.nat({ max: 5000 }),
});

const MetricsRunArb = fc.record({
    timestamp: fc.string({ minLength: 1, maxLength: 30 }),
    project: fc.constant('test'),
    total: fc.nat({ max: 30 }),
    passed: fc.nat({ max: 30 }),
    failed: fc.nat({ max: 30 }),
    skipped: fc.nat({ max: 30 }),
    duration: fc.nat({ max: 60000 }),
    tests: fc.array(FlatTestArb, { minLength: 0, maxLength: 10 }),
});

const MetricsRunArrayArb: fc.Arbitrary<MetricsRun[]> = fc.array(MetricsRunArb, { minLength: 0, maxLength: 5 });

const EpicKeyArb = fc
    .string({ minLength: 1, maxLength: 10 })
    .map((s) => 'EPIC-' + s.replace(/[^a-zA-Z0-9]/g, 'X'))
    .filter((s) => s.length > 0);

const CoverageResultArb = fc
    .array(
        fc.record({
            epic: EpicKeyArb,
            hasTest: fc.boolean(),
            testKeys: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 4 }),
            issueKey: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
            totalInEpic: fc.nat({ max: 10 }),
            coveredInEpic: fc.nat({ max: 10 }),
            rawPct: fc.nat({ max: 100 }),
        }),
        { minLength: 0, maxLength: 5 },
    )
    .map((entries) => {
        const byEpic: Record<string, { total: number; covered: number; rawPct: number }> = {};
        const items: Array<{
            epic: string;
            hasTest: boolean;
            linkedTestKeys?: string[];
            issueKey?: string;
        }> = [];
        for (const e of entries) {
            byEpic[e.epic] = { total: e.totalInEpic, covered: e.coveredInEpic, rawPct: e.rawPct };
            items.push({
                epic: e.epic,
                hasTest: e.hasTest,
                ...(e.testKeys.length > 0 ? { linkedTestKeys: e.testKeys } : {}),
                ...(e.issueKey !== undefined ? { issueKey: e.issueKey } : {}),
            });
        }
        const covered = entries.filter((e) => e.hasTest).length;
        return {
            items,
            totals: { total: entries.length, covered },
            byEpic,
        };
    });

describe('BuildTraceabilityMatrix — property-based', () => {
    it('nodes.length equals totalEpics', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);

                expect(result.nodes).toHaveLength(result.totalEpics);
            }),
            { numRuns: 50 },
        );
    });

    it('overallCoverage is in [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);

                expect(result.overallCoverage).toBeGreaterThanOrEqual(0);
                expect(result.overallCoverage).toBeLessThanOrEqual(100);
            }),
            { numRuns: 50 },
        );
    });

    it('totalTests and totalEpics are non-negative', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);

                expect(result.totalTests).toBeGreaterThanOrEqual(0);
                expect(result.totalEpics).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 50 },
        );
    });

    it('each node has required fields', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);
                for (const node of result.nodes) {
                    expect(typeof node.epic).toBe('string');
                    expect(node.coverage).toBeGreaterThanOrEqual(0);
                    expect(node.coverage).toBeLessThanOrEqual(100);
                    expect(node.health).toBeGreaterThanOrEqual(0);
                    expect(node.health).toBeLessThanOrEqual(100);
                    expect(node.flakiness).toBeGreaterThanOrEqual(0);
                    expect(Array.isArray(node.stories)).toBeTruthy();
                }
            }),
            { numRuns: 50 },
        );
    });

    it('timestamp is valid ISO string', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);

                expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            }),
            { numRuns: 50 },
        );
    });

    it('empty metrics returns empty result', () => {
        const empty: MetricsRun[] = [];
        const result = matrix(empty);

        expect(result.nodes).toStrictEqual([]);
        expect(result.totalEpics).toBe(0);
        expect(result.totalTests).toBe(0);
        expect(result.overallCoverage).toBe(0);
    });
});

describe('GenerateTraceabilityHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsRunArrayArb, CoverageResultArb, (metrics, coverage) => {
                const result = matrix(metrics, coverage);
                const html = generateTraceabilityHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('error page for null/undefined', () => {
        const nullHtml = generateTraceabilityHtml(null);

        expect(nullHtml).toContain('Error generating traceability matrix');

        const undefHtml = generateTraceabilityHtml(undefined);

        expect(undefHtml).toContain('Error generating traceability matrix');
    });
});
