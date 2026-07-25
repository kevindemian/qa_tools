/**
 * computeAiMetrics — Testes robustos.
 *
 * Testa o módulo compute/ai-metrics.ts com property-based testing (fast-check),
 * edge cases e testes negativos. Nenhum mock de lógica interna — fluxo real.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeAiMetrics } from '../data-hub/compute/ai-metrics.js';
import type { AiGenerationRecord } from '../types/llm.js';

// ─── Arbitraries ────────────────────────────────────────────────────

const FeedbackActionArb = fc.constantFrom<'kept' | 'modified' | 'deleted'>('kept', 'modified', 'deleted');

const FeedbackArb = fc.record({
    testKey: fc.string({ minLength: 6, maxLength: 6 }),
    recordedAt: fc.constant('2026-01-15T10:00:00Z'),
    action: FeedbackActionArb,
});

const TestArb = fc.record({
    title: fc.string({ minLength: 1, maxLength: 20 }),
    preConditions: fc.constant([] as string[]),
    stepCount: fc.constant(1),
});

const AiRecordArb = fc.record({
    id: fc.string({ minLength: 8, maxLength: 8 }),
    generatedAt: fc.constant('2026-03-15T14:30:00Z'),
    promptVersion: fc.constantFrom('v1', 'v2', 'v3'),
    userStory: fc.constantFrom('US-101', 'US-102', 'US-103'),
    acceptanceCriteria: fc.constant('criterion'),
    generatedTests: fc.array(TestArb, { minLength: 1, maxLength: 5 }),
    preconditionMatches: fc.constant([]),
    feedback: fc.option(fc.array(FeedbackArb, { maxLength: 3 })),
}) as unknown as fc.Arbitrary<AiGenerationRecord>;

function makeRecord(overrides: Partial<AiGenerationRecord>): AiGenerationRecord {
    return {
        id: 'test-id',
        generatedAt: '2026-03-15T14:30:00Z',
        promptVersion: 'v1',
        userStory: 'US-101',
        acceptanceCriteria: 'test',
        generatedTests: [{ title: 'test', preConditions: [], stepCount: 1 }],
        preconditionMatches: [],
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ComputeAiMetrics', () => {
    describe('Empty Input', () => {
        it('returns zero-valued result for empty array', () => {
            expect.hasAssertions();

            const result = computeAiMetrics([]);

            expect(result.totalRecords).toBe(0);
            expect(result.totalGenerated).toBe(0);
            expect(result.totalKept).toBe(0);
            expect(result.totalModified).toBe(0);
            expect(result.totalDeleted).toBe(0);
            expect(result.acceptanceRate).toBe(0);
            expect(result.topPromptVersion).toBe('');
        });

        it('returns empty collections and valid timestamp', () => {
            expect.hasAssertions();

            const result = computeAiMetrics([]);

            expect(result.byVersion).toHaveLength(0);
            expect(result.trend).toHaveLength(0);
            expect(Object.keys(result.requirementScores)).toHaveLength(0);
            expect(typeof result.timestamp).toBe('string');
            expect(result.timestamp.length).toBeGreaterThan(0);
        });
    });

    describe('Mathematical invariants (PBT)', () => {
        it('acceptanceRate always in [0, 100]', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 20 }), (records) => {
                    const r = computeAiMetrics(records);

                    expect(r.acceptanceRate).toBeGreaterThanOrEqual(0);
                    expect(r.acceptanceRate).toBeLessThanOrEqual(100);
                }),
                { numRuns: 100 },
            );
        });

        it('totalKept + totalModified + totalDeleted = totalGenerated', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 20 }), (records) => {
                    const r = computeAiMetrics(records);

                    expect(r.totalKept + r.totalModified + r.totalDeleted).toBe(r.totalGenerated);
                }),
                { numRuns: 100 },
            );
        });

        it('totalRecords equals input length', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 20 }), (records) => {
                    expect(computeAiMetrics(records).totalRecords).toBe(records.length);
                }),
                { numRuns: 50 },
            );
        });

        it('totalGenerated equals sum of all generatedTests.length', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 15 }), (records) => {
                    const r = computeAiMetrics(records);
                    const expected = records.reduce((sum, rec) => sum + rec.generatedTests.length, 0);

                    expect(r.totalGenerated).toBe(expected);
                }),
                { numRuns: 100 },
            );
        });

        it('byVersion sorted by count descending', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { minLength: 2, maxLength: 20 }), (records) => {
                    const r = computeAiMetrics(records);
                    for (let i = 1; i < r.byVersion.length; i++) {
                        const prevCount = r.byVersion[i - 1]?.count ?? 0;
                        const currCount = r.byVersion[i]?.count ?? 0;

                        expect(prevCount).toBeGreaterThanOrEqual(currCount);
                    }
                }),
                { numRuns: 100 },
            );
        });

        it('trend sorted by date ascending', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { minLength: 1, maxLength: 20 }), (records) => {
                    const r = computeAiMetrics(records);

                    expect(r.trend.length).toBeGreaterThanOrEqual(0);

                    for (let i = 1; i < r.trend.length; i++) {
                        expect(r.trend[i - 1]?.date.localeCompare(r.trend[i]?.date ?? '')).toBeLessThanOrEqual(0);
                    }
                }),
                { numRuns: 100 },
            );
        });

        it('requirementScores all in [0, 100]', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 20 }), (records) => {
                    const r = computeAiMetrics(records);
                    for (const score of Object.values(r.requirementScores)) {
                        expect(score).toBeGreaterThanOrEqual(0);
                        expect(score).toBeLessThanOrEqual(100);
                    }
                }),
                { numRuns: 100 },
            );
        });

        it('acceptanceRate formula matches independent computation', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 10 }), (records) => {
                    const r = computeAiMetrics(records);
                    const expected =
                        r.totalGenerated === 0
                            ? 0
                            : Math.round(((r.totalKept + r.totalModified) / r.totalGenerated) * 100);

                    expect(r.acceptanceRate).toBe(expected);
                }),
                { numRuns: 100 },
            );
        });

        it('sum of byVersion counts equals totalGenerated', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiRecordArb, { maxLength: 15 }), (records) => {
                    const r = computeAiMetrics(records);
                    const vSum = r.byVersion.reduce((s, v) => s + v.count, 0);

                    expect(vSum).toBe(r.totalGenerated);
                }),
                { numRuns: 50 },
            );
        });
    });

    describe('Acceptance logic', () => {
        it('all kept → acceptanceRate 100', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ feedback: [{ testKey: 'k1', recordedAt: '2026-01-15T00:00:00Z', action: 'kept' }] }),
            ];
            const r = computeAiMetrics(records);

            expect(r.acceptanceRate).toBe(100);
            expect(r.totalKept).toBe(1);
            expect(r.totalDeleted).toBe(0);
            expect(r.totalModified).toBe(0);
        });

        it('all deleted → totalKept 0, totalDeleted = totalGenerated', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedTests: [
                        { title: 't1', preConditions: [], stepCount: 1 },
                        { title: 't2', preConditions: [], stepCount: 1 },
                        { title: 't3', preConditions: [], stepCount: 1 },
                    ],
                    feedback: [{ testKey: 'k1', recordedAt: '2026-01-15T00:00:00Z', action: 'deleted' }],
                }),
            ];
            const r = computeAiMetrics(records);

            expect(r.totalKept).toBe(0);
            expect(r.totalDeleted).toBe(3);
            expect(r.totalModified).toBe(0);
        });

        it('no feedback → all classified as modified', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedTests: [
                        { title: 't1', preConditions: [], stepCount: 1 },
                        { title: 't2', preConditions: [], stepCount: 1 },
                    ],
                }),
            ];
            const r = computeAiMetrics(records);

            expect(r.totalModified).toBe(2);
            expect(r.totalKept).toBe(0);
            expect(r.totalDeleted).toBe(0);
        });

        it('accepted = kept OR modified', () => {
            expect.hasAssertions();

            const recKept = [
                makeRecord({
                    generatedTests: [{ title: 't', preConditions: [], stepCount: 5 }],
                    feedback: [{ testKey: 'k', recordedAt: '2026-01-15T00:00:00Z', action: 'kept' }],
                }),
            ];
            const recMod = [
                makeRecord({
                    generatedTests: [{ title: 't', preConditions: [], stepCount: 5 }],
                    feedback: [{ testKey: 'k', recordedAt: '2026-01-15T00:00:00Z', action: 'modified' }],
                }),
            ];

            expect(computeAiMetrics(recKept).totalKept).toBe(computeAiMetrics(recMod).totalKept);
        });

        it('mixed: 1 kept + 1 deleted + 1 modified across records', () => {
            expect.hasAssertions();

            // Record-level acceptance: any feedback kept/modified → ALL tests in that record counted as kept
            // Record 1: feedback=[kept], 1 test → totalKept += 1
            // Record 2: feedback=[deleted], 2 tests → totalDeleted += 2
            // Record 3: feedback=undefined, 1 test → totalModified += 1
            const records = [
                makeRecord({
                    generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }],
                    feedback: [{ testKey: 'k1', recordedAt: '2026-01-15T00:00:00Z', action: 'kept' }],
                }),
                makeRecord({
                    generatedTests: [
                        { title: 't2', preConditions: [], stepCount: 1 },
                        { title: 't2b', preConditions: [], stepCount: 1 },
                    ],
                    feedback: [{ testKey: 'k2', recordedAt: '2026-01-15T00:00:00Z', action: 'deleted' }],
                }),
                makeRecord({ generatedTests: [{ title: 't3', preConditions: [], stepCount: 1 }] }),
            ];
            const r = computeAiMetrics(records);

            expect(r.totalKept).toBe(1);
            expect(r.totalDeleted).toBe(2);
            expect(r.totalModified).toBe(1);
            expect(r.totalGenerated).toBe(4);
            expect(r.acceptanceRate).toBe(Math.round(((1 + 1) / 4) * 100));
        });
    });

    describe('Version aggregation', () => {
        it('groups records by promptVersion', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    promptVersion: 'v1',
                    generatedTests: [
                        { title: 't1', preConditions: [], stepCount: 1 },
                        { title: 't2', preConditions: [], stepCount: 1 },
                    ],
                }),
                makeRecord({ promptVersion: 'v1', generatedTests: [{ title: 't3', preConditions: [], stepCount: 1 }] }),
                makeRecord({ promptVersion: 'v2', generatedTests: [{ title: 't4', preConditions: [], stepCount: 1 }] }),
            ];
            const r = computeAiMetrics(records);

            expect(r.byVersion).toHaveLength(2);
            expect(r.byVersion.find((v) => v.version === 'v1')?.count).toBe(3);
            expect(r.byVersion.find((v) => v.version === 'v2')?.count).toBe(1);
        });

        it('topPromptVersion is version with most records', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ promptVersion: 'v1', generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }] }),
                makeRecord({
                    promptVersion: 'v2',
                    generatedTests: [
                        { title: 't2', preConditions: [], stepCount: 1 },
                        { title: 't3', preConditions: [], stepCount: 1 },
                    ],
                }),
            ];

            expect(computeAiMetrics(records).topPromptVersion).toBe('v2');
        });

        it('empty promptVersion defaults to "unknown"', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ promptVersion: '', generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }] }),
            ];

            expect(computeAiMetrics(records).topPromptVersion).toBe('unknown');
        });
    });

    describe('Trend', () => {
        it('single record → single trend entry', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedAt: '2026-03-15T14:30:00Z',
                    generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }],
                }),
            ];
            const r = computeAiMetrics(records);

            expect(r.trend).toHaveLength(1);
            expect(r.trend[0]?.date).toBe('2026-03-15');
        });

        it('invalid generatedAt → no trend entry', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedAt: 'not-a-date',
                    generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }],
                }),
            ];

            expect(computeAiMetrics(records).trend).toHaveLength(0);
        });

        it('multiple records same date → aggregated trend', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedAt: '2026-03-15T10:00:00Z',
                    generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }],
                }),
                makeRecord({
                    generatedAt: '2026-03-15T14:00:00Z',
                    generatedTests: [{ title: 't2', preConditions: [], stepCount: 1 }],
                }),
            ];
            const r = computeAiMetrics(records);

            expect(r.trend).toHaveLength(1);
            expect(r.trend[0]?.generated).toBe(2);
        });
    });

    describe('Requirement scores', () => {
        it('score formula: acceptance*0.5 + retention*0.3 + volume*0.2', () => {
            expect.hasAssertions();

            // 3 records: 1 accepted (kept), 2 not accepted (no feedback → modified)
            // Each record has 1 test → totalGenerated = 3
            // Record 1: userStory=US-101, feedback=[kept] → accepted → count=1, kept=1
            // Record 2: userStory=US-101, no feedback → modified → count=1, modified=1
            // Record 3: userStory=US-101, no feedback → modified → count=1, modified=1
            const records = [
                makeRecord({
                    generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }],
                    feedback: [{ testKey: 'k', recordedAt: '2026-01-15T00:00:00Z', action: 'kept' }],
                    userStory: 'US-101',
                }),
                makeRecord({ generatedTests: [{ title: 't2', preConditions: [], stepCount: 1 }], userStory: 'US-101' }),
                makeRecord({ generatedTests: [{ title: 't3', preConditions: [], stepCount: 1 }], userStory: 'US-101' }),
            ];
            const r = computeAiMetrics(records);

            // US-101: count=3, kept=1, modified=2
            // acceptanceScore = round(1/3*100) = 33
            // retentionRate = min(100, (1+2)/3*100) = 100
            // volumeScore = min(100, 3/10*100) = 30
            // score = round(33*0.5 + 100*0.3 + 30*0.2) = round(16.5+30+6) = round(52.5) = 53
            expect(r.requirementScores['US-101']).toBe(53);
        });

        it('score with all deleted → low retention, low score', () => {
            expect.hasAssertions();

            const tests = Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, preConditions: [], stepCount: 1 }));
            const feedback = Array.from({ length: 5 }, (_, i) => ({
                testKey: `k${i}`,
                recordedAt: '2026-01-15T00:00:00Z',
                action: 'deleted' as const,
            }));
            const records = [makeRecord({ generatedTests: tests, feedback, userStory: 'US-200' })];
            const r = computeAiMetrics(records);

            // acceptanceScore = 0, retentionRate = 0, volumeScore = 50
            // score = round(0*0.5 + 0*0.3 + 50*0.2) = 10
            expect(r.requirementScores['US-200']).toBe(10);
        });
    });

    describe('Edge cases', () => {
        it('empty generatedTests array → contributes 0 to totals', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ generatedTests: [] }),
                makeRecord({ generatedTests: [{ title: 't1', preConditions: [], stepCount: 1 }] }),
            ];

            expect(computeAiMetrics(records).totalGenerated).toBe(1);
        });

        it('timestamp is valid ISO string', () => {
            expect.hasAssertions();

            const r = computeAiMetrics([]);

            expect(Number.isFinite(new Date(r.timestamp).getTime())).toBeTruthy();
        });

        it('empty feedback array (not undefined) → classified as modified', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ generatedTests: [{ title: 't', preConditions: [], stepCount: 1 }], feedback: [] }),
            ];
            const r = computeAiMetrics(records);

            expect(r.totalModified).toBe(1);
            expect(r.totalKept).toBe(0);
            expect(r.totalDeleted).toBe(0);
        });

        it('multiple feedback on same record — kept wins over deleted', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({
                    generatedTests: [{ title: 't', preConditions: [], stepCount: 1 }],
                    feedback: [
                        { testKey: 'k1', recordedAt: '2026-01-15T00:00:00Z', action: 'kept' },
                        { testKey: 'k2', recordedAt: '2026-01-15T00:00:00Z', action: 'deleted' },
                    ],
                }),
            ];
            const r = computeAiMetrics(records);

            expect(r.totalKept).toBe(1);
            expect(r.totalDeleted).toBe(0);
            expect(r.totalModified).toBe(0);
        });
    });
});
