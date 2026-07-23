/**
 * Robust characterization tests — Traceability Matrix (#C3, #C4).
 *
 * FASE: TESTES standard — no internal logic mocking.
 * - `createTestHub` supplies a real DataHub double with explicit `flakyRate`.
 * - Real-shaped coverage fixture matching the `CoverageGapResult` contract that
 *   `buildTraceabilityMatrix` actually consumes (see traceability-matrix.ts:18).
 *
 * Proves:
 *  (C3) when a real CoverageGapResult is supplied the matrix is NON-empty and
 *       per-epic `cov` reflects real requirements coverage (byEpic.rawPct);
 *  (C4) the HTML card is honestly labeled "Overall Test Pass Rate", never
 *       "Overall Coverage".
 *
 * OPEN ROOT CAUSE (#C3, documented): `buildTraceabilityMatrix` defines its own
 * narrow `CoverageGapResult` (requires `item.epic`) that does NOT match the real
 * `analyzeCoverageGaps` output (`shared/types/coverage.ts` items lack `epic`).
 * Callers therefore cannot pass real coverage without a contract reconciliation —
 * they currently pass `undefined`, yielding an always-empty matrix. This test
 * exercises the function contract directly with a valid fixture.
 */
import { describe, expect, it } from 'vitest';

import { buildTraceabilityMatrix, generateTraceabilityHtml } from '../report/traceability-matrix.js';
import { createTestHub } from './test-hub.js';
import { makeCoverageGapResult } from './coverage-fixture.js';

/** Fixture matching the function's consumed `CoverageGapResult` contract. */
function realCoverageFixture() {
    return makeCoverageGapResult({
        'EPIC-1': { items: [{ issueKey: 'STORY-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'] }], rawPct: 50 },
    });
}

function runWith(tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>) {
    return [
        {
            timestamp: '2026-01-01T00:00:00.000Z',
            project: 'test',
            total: tests.length,
            passed: tests.filter((t) => t.state === 'passed').length,
            failed: tests.filter((t) => t.state === 'failed').length,
            skipped: tests.filter((t) => t.state === 'skipped').length,
            duration: tests.reduce((s, t) => s + t.duration, 0),
            tests: tests.map((t) => ({ title: t.title, state: t.state, duration: t.duration })),
        },
    ];
}

describe('Robust: Traceability Matrix uses real coverage, honest labels (#C3/#C4)', () => {
    it('c3: real CoverageGapResult yields a non-empty matrix with real per-epic coverage', () => {
        expect.hasAssertions();

        const runs = runWith([
            { title: 'TC-001', state: 'passed', duration: 200 },
            { title: 'TC-002', state: 'passed', duration: 150 },
        ]);
        const result = buildTraceabilityMatrix(runs, realCoverageFixture(), createTestHub());

        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.nodes[0]?.epic).toBe('EPIC-1');
        expect(result.nodes[0]?.coverage).toBe(50);
    });

    it('c4: HTML card is labeled "Overall Test Pass Rate", not "Overall Coverage"', () => {
        expect.hasAssertions();

        const runs = runWith([{ title: 'TC-001', state: 'passed', duration: 200 }]);
        const html = generateTraceabilityHtml(buildTraceabilityMatrix(runs, realCoverageFixture(), createTestHub()));

        expect(html).toContain('Overall Test Pass Rate');
        expect(html).not.toContain('Overall Coverage');
    });

    it('honest no-data: undefined coverageResult yields an empty matrix (no fabricated coverage)', () => {
        expect.hasAssertions();

        const runs = runWith([{ title: 'TC-001', state: 'passed', duration: 200 }]);
        const result = buildTraceabilityMatrix(runs, undefined, createTestHub());

        expect(result.nodes).toStrictEqual([]);
        expect(result.totalEpics).toBe(0);
    });
});
