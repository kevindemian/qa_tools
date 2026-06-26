/**
 * Property-Based Tests — Requirement Quality Score (FT-32)
 *
 * Invariants:
 * - calculateRequirementScores: entries.length equals totalRequirements
 * - Each score in [0, 100] with matching grade
 * - Sorted by score descending
 * - Counts are consistent
 * - acceptanceRate in [0, 100]
 * - Timestamp is valid ISO
 * - generateRequirementScoreHtml always produces valid HTML
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateRequirementScores, generateRequirementScoreHtml } from '../requirement-score.js';
import type { AiGenerationRecord, AiModification } from '../types/llm.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

describe('Requirement Score.Property', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const ActionArb = fc.constantFrom('kept' as const, 'modified' as const, 'deleted' as const);
    const PromptVersionArb = fc.constantFrom('v1', 'v2', 'v3', 'v4');

    const AiModificationArb = fc
        .record({
            testKey: fc.string({ minLength: 1, maxLength: 10 }),
            recordedAt: fc.constant(new Date().toISOString()),
            action: ActionArb,
            reason: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
        })
        .map(
            (r): AiModification => ({
                testKey: r.testKey,
                recordedAt: r.recordedAt,
                action: r.action,
                ...(r.reason !== undefined ? { reason: r.reason } : {}),
            }),
        );

    const AiGenerationRecordArb = fc
        .record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            generatedAt: fc.constant(new Date().toISOString()),
            promptVersion: PromptVersionArb,
            userStory: fc.string({ minLength: 1, maxLength: 120 }),
            acceptanceCriteria: fc.string({ minLength: 1, maxLength: 100 }),
            generatedTests: fc.array(
                fc.record({
                    title: fc.string({ minLength: 1, maxLength: 20 }),
                    preConditions: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
                    stepCount: fc.nat({ max: 10 }),
                }),
                { minLength: 0, maxLength: 8 },
            ),
            preconditionMatches: fc.array(
                fc.record({
                    summary: fc.string({ minLength: 1, maxLength: 30 }),
                    matchType: fc.string({ minLength: 1, maxLength: 20 }),
                }),
                { minLength: 0, maxLength: 3 },
            ),
            feedback: fc.option(fc.array(AiModificationArb, { minLength: 0, maxLength: 8 }), { nil: undefined }),
        })
        .map(
            (r): AiGenerationRecord => ({
                id: r.id,
                generatedAt: r.generatedAt,
                promptVersion: r.promptVersion,
                userStory: r.userStory,
                acceptanceCriteria: r.acceptanceCriteria,
                generatedTests: r.generatedTests,
                preconditionMatches: r.preconditionMatches,
                ...(r.feedback !== undefined ? { feedback: r.feedback } : {}),
            }),
        );

    const ValidGrades = ['A', 'B', 'C', 'D', 'F'] as const;

    describe('CalculateRequirementScores — property-based', () => {
        it('entries.length equals totalRequirements', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);

                    expect(result.entries).toHaveLength(result.totalRequirements);
                }),
                { numRuns: 50 },
            );
        });

        it('each score is non-negative and grade is valid', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);
                    for (const entry of result.entries) {
                        expect(entry.score).toBeGreaterThanOrEqual(0);
                        expect(entry.score).toBeLessThanOrEqual(100);
                        expect(ValidGrades).toContain(entry.scoreGrade);
                    }
                }),
                { numRuns: 50 },
            );
        });

        it('entries are sorted by score descending', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);
                    for (let i = 1; i < result.entries.length; i++) {
                        const prev: unknown = Reflect.get(result.entries, i - 1);
                        const curr: unknown = Reflect.get(result.entries, i);
                        if (curr === undefined || curr === null || prev === undefined || prev === null) return;

                        const p = prev as { score: number };
                        const c = curr as { score: number };

                        expect(p.score).toBeGreaterThanOrEqual(c.score);
                    }
                }),
                { numRuns: 50 },
            );
        });

        it('acceptanceRate is in [0, 100]', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);
                    for (const entry of result.entries) {
                        expect(entry.acceptanceRate).toBeGreaterThanOrEqual(0);
                        expect(entry.acceptanceRate).toBeLessThanOrEqual(100);
                    }
                }),
                { numRuns: 50 },
            );
        });

        it('aggregate counts match sum of entries', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);
                    const sumGenerated = result.entries.reduce((s, e) => s + e.totalTests, 0);
                    const sumKept = result.entries.reduce((s, e) => s + e.keptTests, 0);
                    const sumModified = result.entries.reduce((s, e) => s + e.modifiedTests, 0);
                    const sumDeleted = result.entries.reduce((s, e) => s + e.deletedTests, 0);

                    expect(result.totalGenerated).toBe(sumGenerated);
                    expect(result.totalKept).toBe(sumKept);
                    expect(result.totalModified).toBe(sumModified);
                    expect(result.totalDeleted).toBe(sumDeleted);
                }),
                { numRuns: 50 },
            );
        });

        it('overallScore matches average of entry scores', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);
                    const expectedAvg = result.totalRequirements > 0
                        ? Math.round(result.entries.reduce((s, e) => s + e.score, 0) / result.totalRequirements)
                        : result.overallScore;

                    expect(result.overallScore).toBe(expectedAvg);

                    expect(ValidGrades).toContain(result.overallGrade);
                }),
                { numRuns: 50 },
            );
        });

        it('timestamp is valid ISO string', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 10 }), (records) => {
                    const result = calculateRequirementScores(records);

                    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                }),
                { numRuns: 50 },
            );
        });

        it('null/undefined/empty returns empty result', () => {
            const empty = calculateRequirementScores([]);

            expect(empty.totalRequirements).toBe(0);
            expect(empty.overallScore).toBe(0);
            expect(empty.overallGrade).toBe('F');
            expect(empty.entries).toStrictEqual([]);

            const nullResult = calculateRequirementScores(null);

            expect(nullResult.totalRequirements).toBe(0);
            expect(nullResult.overallScore).toBe(0);

            const undefinedResult = calculateRequirementScores(undefined);

            expect(undefinedResult.totalRequirements).toBe(0);
            expect(undefinedResult.overallScore).toBe(0);
        });
    });

    describe('GenerateRequirementScoreHtml — property-based', () => {
        it('always produces valid HTML with DOCTYPE', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(AiGenerationRecordArb, { minLength: 0, maxLength: 8 }), (records) => {
                    const result = calculateRequirementScores(records);
                    const html = generateRequirementScoreHtml(result);

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                }),
                { numRuns: 50 },
            );
        });
    });

});
