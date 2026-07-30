/**
 * enrichFailuresWithAuthor — Testes robustos.
 *
 * Testa extractors/failure-attribution.ts com PBT, edge cases e negativos.
 * Fluxo real — zero mocks internos.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { enrichFailuresWithAuthor } from '../data-hub/extractors/failure-attribution.js';
import type { PipelineRun } from '../types/ci-cd.js';
import type { FailureRecord } from '../types/data-hub.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<FailureRecord> = {}): FailureRecord {
    return {
        name: 'test-name',
        status: 'failed',
        confidence: 0.8,
        source: 'test',
        ...overrides,
    };
}

function makeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
    return {
        id: 1,
        status: 'completed',
        conclusion: 'failure',
        created_at: '2026-03-15T10:00:00Z',
        run_started_at: '2026-03-15T10:00:00Z',
        updated_at: '2026-03-15T10:05:00Z',
        head_commit: { author: { name: 'dev1' }, message: 'test commit' },
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('EnrichFailuresWithAuthor', () => {
    describe('Empty input', () => {
        it('returns empty for empty records', () => {
            expect.hasAssertions();

            const r = enrichFailuresWithAuthor([] as FailureRecord[], [makeRun()] as PipelineRun[]);

            expect(r).toHaveLength(0);
        });

        it('returns records unchanged for empty runs', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord()];

            const r = enrichFailuresWithAuthor(records, [] as PipelineRun[]);

            expect(r).toHaveLength(1);
            expect(r[0]?.author).toBeUndefined();
        });
    });

    describe('Author attribution', () => {
        it('assigns author from last run when no timestamp match', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'no-match-suite' })];
            const runs: PipelineRun[] = [makeRun({ head_commit: { author: { name: 'alice' }, message: 'commit' } })];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('alice');
        });

        it('does not overwrite existing author', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ author: 'existing' })];
            const runs: PipelineRun[] = [makeRun({ head_commit: { author: { name: 'new' }, message: 'commit' } })];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('existing');
        });

        it('matches by suite name in commit message', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'flakiness.test.ts' })];
            const runs: PipelineRun[] = [
                makeRun({ head_commit: { author: { name: 'bob' }, message: 'fix flakiness.test.ts bug' } }),
            ];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('bob');
        });

        it('matches by suite name in run title', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'unit-tests' })];
            const runs: PipelineRun[] = [
                makeRun({ title: 'Run unit-tests suite', head_commit: { author: { name: 'carol' }, message: '' } }),
            ];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('carol');
        });

        it('suite match takes priority over last-run fallback', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'target-suite' })];
            const runs: PipelineRun[] = [
                makeRun({ head_commit: { author: { name: 'last' }, message: 'commit' } }),
                makeRun({ head_commit: { author: { name: 'match' }, message: 'target-suite fix' } }),
            ];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('match');
        });

        it('handles case-insensitive suite matching', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'FLAKINESS.TEST.TS' })];
            const runs: PipelineRun[] = [
                makeRun({ head_commit: { author: { name: 'dave' }, message: 'fix flakiness.test.ts' } }),
            ];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('dave');
        });
    });

    describe('Edge cases', () => {
        it('multiple records enriched independently', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'suite-a' }), makeRecord({ suite: 'suite-b' })];
            const runs: PipelineRun[] = [
                makeRun({ head_commit: { author: { name: 'author-a' }, message: 'suite-a fix' } }),
                makeRun({ head_commit: { author: { name: 'author-b' }, message: 'suite-b fix' } }),
            ];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('author-a');
            expect(r[1]?.author).toBe('author-b');
        });

        it('runs without head_commit.author are skipped', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'no-author-run' })];
            const runs: PipelineRun[] = [makeRun({ head_commit: { message: 'commit' } })];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBeUndefined();
        });

        it('records with undefined suite skip suite matching', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: undefined })];
            const runs: PipelineRun[] = [makeRun({ head_commit: { author: { name: 'fallback' }, message: 'commit' } })];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBe('fallback');
        });
    });

    describe('Property-based (PBT)', () => {
        it('enriched records always have same length as input', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            name: fc.string({ minLength: 1, maxLength: 10 }),
                            status: fc.constantFrom<'failed' | 'broken'>('failed', 'broken'),
                            confidence: fc.constant(0.8),
                            source: fc.constant('test'),
                        }),
                        { maxLength: 20 },
                    ),
                    fc.array(fc.constant(makeRun()), { maxLength: 5 }),
                    (records: FailureRecord[], runs: PipelineRun[]) => {
                        const r = enrichFailuresWithAuthor(records, runs);

                        expect(r).toHaveLength(records.length);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('records with existing author are preserved unchanged', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            name: fc.string({ minLength: 1, maxLength: 10 }),
                            status: fc.constantFrom<'failed' | 'broken'>('failed', 'broken'),
                            confidence: fc.constant(0.8),
                            source: fc.constant('test'),
                            author: fc.constant('pre-existing'),
                        }),
                        { minLength: 1, maxLength: 10 },
                    ),
                    fc.array(fc.constant(makeRun()), { maxLength: 3 }),
                    (records: FailureRecord[], runs: PipelineRun[]) => {
                        const r = enrichFailuresWithAuthor(records, runs);
                        for (const rec of r) {
                            expect(rec.author).toBe('pre-existing');
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    describe('Negative cases', () => {
        it('suite match requires non-empty suite string', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: '' })];
            const runs: PipelineRun[] = [makeRun({ head_commit: { author: { name: 'x' }, message: '' } })];

            const r = enrichFailuresWithAuthor(records, runs);

            // empty suite → no suite match → falls back to last run
            expect(r[0]?.author).toBe('x');
        });

        it('all runs without start time → runWindows empty → records unchanged', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [makeRecord({ suite: 'test' })];
            const runs = [
                {
                    id: 1,
                    status: 'completed',
                    conclusion: 'failure',
                    updated_at: '2026-03-15T10:05:00Z',
                    head_commit: { author: { name: 'x' }, message: 'commit' },
                },
            ] as unknown as PipelineRun[];

            const r = enrichFailuresWithAuthor(records, runs);

            expect(r[0]?.author).toBeUndefined();
        });
    });
});
