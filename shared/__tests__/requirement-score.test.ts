/**
 * Tests for requirement-score — Requirement Quality Score.
 */

import { calculateRequirementScores } from '../data-hub/compute/requirement-score.js';
import type { AiGenerationRecord } from '../types/llm.js';
import { nullAs, undefinedAs } from '../test-utils.js';

describe('Requirement Score', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    function makeRecord(overrides?: Partial<AiGenerationRecord>): AiGenerationRecord {
        return {
            id: 'req-001',
            generatedAt: '2026-06-01T12:00:00.000Z',
            promptVersion: 'v2',
            userStory: 'As a user I want to login so that I can access my account',
            acceptanceCriteria: 'User can login with email and password',
            generatedTests: [
                { title: 'TC-1 Login success', preConditions: [], stepCount: 3 },
                { title: 'TC-2 Login failure', preConditions: [], stepCount: 2 },
            ],
            preconditionMatches: [],
            ...overrides,
        };
    }

    function makeRecords(): AiGenerationRecord[] {
        return [
            makeRecord({
                id: 'req-001',
                userStory: 'User login feature',
                promptVersion: 'v2',
                generatedTests: [
                    { title: 'TC-1', preConditions: [], stepCount: 3 },
                    { title: 'TC-2', preConditions: [], stepCount: 2 },
                ],
                feedback: [
                    { testKey: 'TC-1', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                    {
                        testKey: 'TC-2',
                        recordedAt: '2026-06-02T10:00:00.000Z',
                        action: 'modified',
                        reason: 'Add edge case',
                    },
                ],
            }),
            makeRecord({
                id: 'req-002',
                userStory: 'Password reset flow',
                promptVersion: 'v1',
                generatedTests: [
                    { title: 'TC-3', preConditions: [], stepCount: 4 },
                    { title: 'TC-4', preConditions: [], stepCount: 2 },
                    { title: 'TC-5', preConditions: [], stepCount: 3 },
                ],
                feedback: [
                    { testKey: 'TC-3', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                    { testKey: 'TC-4', recordedAt: '2026-06-02T10:00:00.000Z', action: 'deleted', reason: 'Redundant' },
                ],
            }),
            makeRecord({
                id: 'req-003',
                userStory: 'Dashboard view',
                promptVersion: 'v2',
                generatedTests: [{ title: 'TC-6', preConditions: [], stepCount: 5 }],
                feedback: [{ testKey: 'TC-6', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' }],
            }),
        ];
    }

    describe('CalculateRequirementScores', () => {
        it('returns empty result for null input', () => {
            const result = calculateRequirementScores(nullAs<AiGenerationRecord[]>());

            expect(result.totalRequirements).toBe(0);
            expect(result.overallScore).toBe(0);
            expect(result.overallGrade).toBe('F');
            expect(result.entries).toStrictEqual([]);
        });

        it('returns empty result for undefined input', () => {
            const result = calculateRequirementScores(undefinedAs<AiGenerationRecord[]>());

            expect(result.totalRequirements).toBe(0);
            expect(result.overallScore).toBe(0);
            expect(result.entries).toStrictEqual([]);
        });

        it('returns empty result for empty array', () => {
            const result = calculateRequirementScores([]);

            expect(result.totalRequirements).toBe(0);
            expect(result.overallScore).toBe(0);
            expect(result.entries).toStrictEqual([]);
        });

        it('calculates scores for multiple records', () => {
            const result = calculateRequirementScores(makeRecords());

            expect(result.totalRequirements).toBe(3);
            expect(result.entries).toHaveLength(3);
            expect(result.totalGenerated).toBe(6);
        });

        it('computes acceptance rate correctly', () => {
            const result = calculateRequirementScores(makeRecords());
            const req3 = result.entries.find((e) => e.requirementId === 'req-003');

            expect(req3?.acceptanceRate).toBe(100);
        });

        it('computes overall score correctly', () => {
            const result = calculateRequirementScores(makeRecords());

            expect(result.overallScore).toBeGreaterThan(0);
            expect(result.overallScore).toBeLessThanOrEqual(100);
        });

        it('sorts entries by score descending', () => {
            expect.hasAssertions();

            const result = calculateRequirementScores(makeRecords());
            for (let i = 1; i < result.entries.length; i++) {
                const curr = Reflect.get(result.entries, i) as { score: number };
                const prev = Reflect.get(result.entries, i - 1) as { score: number };

                expect(curr.score).toBeLessThanOrEqual(prev.score);
            }
        });

        it('assigns correct grade for score ranges', () => {
            const records = [
                makeRecord({ id: 'a', generatedTests: [{ title: 'T1', preConditions: [], stepCount: 1 }] }),
            ];
            const result = calculateRequirementScores(records);

            expect(['A', 'B', 'C', 'D', 'F']).toContain(result.entries[0]?.scoreGrade);
        });

        it('handles records without feedback', () => {
            const records: AiGenerationRecord[] = [
                {
                    id: 'no-feedback',
                    generatedAt: '2026-06-01T12:00:00.000Z',
                    promptVersion: 'v1',
                    userStory: 'No feedback test',
                    acceptanceCriteria: 'Test',
                    generatedTests: [{ title: 'T1', preConditions: [], stepCount: 1 }],
                    preconditionMatches: [],
                },
            ];
            const result = calculateRequirementScores(records);

            expect(result.totalRequirements).toBe(1);
            expect(result.entries[0]?.keptTests).toBe(0);
            expect(result.entries[0]?.acceptanceRate).toBe(0);
        });

        it('handles records with empty feedback', () => {
            const records = [makeRecord({ feedback: [] })];
            const result = calculateRequirementScores(records);

            expect(result.totalRequirements).toBe(1);
            expect(result.entries[0]?.keptTests).toBe(0);
            expect(result.entries[0]?.acceptanceRate).toBe(0);
        });

        it('counts kept, modified, and deleted correctly', () => {
            const result = calculateRequirementScores(makeRecords());

            expect(result.totalKept).toBeGreaterThan(0);
            expect(result.totalModified).toBeGreaterThan(0);
            expect(result.totalDeleted).toBeGreaterThan(0);
        });

        it('sets timestamp to valid ISO string', () => {
            const result = calculateRequirementScores([]);

            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('truncates long user stories to 120 chars', () => {
            const longStory = 'A'.repeat(200);
            const records = [makeRecord({ userStory: longStory })];
            const result = calculateRequirementScores(records);

            expect(result.entries[0]?.userStory.length).toBe(120);
        });
    });

    describe('Grade boundaries (expected behavior)', () => {
        // Score formula (provenance weights 0.5/0.3/0.2, ISO/IEC 25010 grade bands):
        //   score = round(acceptance*0.5 + retention*0.3 + volume*0.2)
        //   retention = min(100, (kept+modified)/total*100), volume = min(100, total/10*100)
        // Each case pins an EXACT score at or just below a grade threshold, derived
        // from the formula — the code must obey these bands, not vice-versa.
        function makeBoundary(kept: number, modified: number, deleted: number, id: string): AiGenerationRecord {
            const tests = Array.from({ length: kept + modified }, (_, i) => ({
                title: `T-${i}`,
                preConditions: [],
                stepCount: 1,
            }));
            const feedback: Array<{ testKey: string; recordedAt: string; action: 'kept' | 'modified' | 'deleted' }> = [
                ...Array.from({ length: kept }, (_, i) => ({
                    testKey: `T-${i}`,
                    recordedAt: '2026-06-02T10:00:00.000Z',
                    action: 'kept' as const,
                })),
                ...Array.from({ length: modified }, (_, i) => ({
                    testKey: `T-${kept + i}`,
                    recordedAt: '2026-06-02T10:00:00.000Z',
                    action: 'modified' as const,
                })),
                ...Array.from({ length: deleted }, (_, i) => ({
                    testKey: `D-${i}`,
                    recordedAt: '2026-06-02T10:00:00.000Z',
                    action: 'deleted' as const,
                })),
            ];
            return makeRecord({ id, generatedTests: tests, feedback });
        }

        it.each([
            // [kept, modified, deleted, expectedScore, expectedGrade]
            // score 90: acceptance 100 (5/5), retention 100, volume 50 -> 50+30+10
            [5, 0, 0, 90, 'A'],
            // score 89: acceptance 78 (39/50), retention 100, volume 100 -> 39+30+20
            [39, 0, 11, 89, 'B'],
            // score 75: acceptance 50 (10/20), retention 100, volume 100 -> 25+30+20
            [10, 0, 10, 75, 'B'],
            // score 74: acceptance 48 (12/25), retention 100, volume 100 -> 24+30+20
            [12, 0, 13, 74, 'C'],
            // score 60: acceptance 20 (10/50), retention 100, volume 100 -> 10+30+20
            [10, 0, 40, 60, 'C'],
            // score 59: acceptance 18 (18/100), retention 100, volume 100 -> 9+30+20
            [18, 0, 82, 59, 'D'],
            // score 40: acceptance 0 (5/1005), retention 100, volume 50 -> 0+30+10
            [5, 0, 1000, 40, 'D'],
            // score 39: acceptance 2 (4/200), retention 100, volume 40 -> 1+30+8
            [4, 0, 196, 39, 'F'],
        ])(
            'exact score %s from kept=%i modified=%i deleted=%i maps to grade %s',
            (kept, modified, deleted, expectedScore, expectedGrade) => {
                expect.hasAssertions();

                const result = calculateRequirementScores([makeBoundary(kept, modified, deleted, 'b')]);
                const entry = result.entries[0];

                expect(entry?.score).toBe(expectedScore);
                expect(entry?.scoreGrade).toBe(expectedGrade);
            },
        );

        it('retention is 0 when no tests were generated even if feedback exists (score = acceptance only)', () => {
            expect.hasAssertions();

            // totalTests=0 -> retention 0, volume 0. acceptance 100 (1/1 reviewed).
            // score = 100*0.5 = 50 -> grade D. A mutant forcing retention>0 would yield 80 (B).
            const result = calculateRequirementScores([
                makeRecord({
                    id: 'zero-tests',
                    generatedTests: [],
                    feedback: [{ testKey: 'X', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' }],
                }),
            ]);

            expect(result.entries[0]?.score).toBe(50);
            expect(result.entries[0]?.scoreGrade).toBe('D');
        });

        it('retention below the cap reflects the kept+modified share of total tests', () => {
            expect.hasAssertions();

            // total=10, kept=2, mod=0, deleted=0 -> acceptance 100 (2/2 reviewed),
            // retention = min(100, 2/10*100) = 20 (NOT capped), volume 100.
            // score = 100*0.5 + 20*0.3 + 100*0.2 = 50 + 6 + 20 = 76 -> B.
            // A mutant turning "/total" into "*total" would cap retention at 100 -> score 100 (A).
            const result = calculateRequirementScores([
                makeRecord({
                    id: 'partial-retention',
                    generatedTests: Array.from({ length: 10 }, (_, i) => ({
                        title: `T-${i}`,
                        preConditions: [],
                        stepCount: 1,
                    })),
                    feedback: [
                        { testKey: 'T-0', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                        { testKey: 'T-1', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                    ],
                }),
            ]);

            expect(result.entries[0]?.score).toBe(76);
            expect(result.entries[0]?.scoreGrade).toBe('B');
        });

        it('counts a modified-only record as modified, not deleted', () => {
            expect.hasAssertions();

            const result = calculateRequirementScores([
                makeRecord({
                    id: 'mod-only',
                    feedback: [{ testKey: 'T1', recordedAt: '2026-06-02T10:00:00.000Z', action: 'modified' }],
                }),
            ]);

            expect(result.entries[0]?.modifiedTests).toBe(1);
            expect(result.entries[0]?.deletedTests).toBe(0);
        });

        it('averageAcceptanceRate and overallScore are arithmetic means over entries', () => {
            expect.hasAssertions();

            // Entry A: acceptance 100, score 90. Entry B: acceptance 0, score 0.
            const result = calculateRequirementScores([makeBoundary(5, 0, 0, 'r1'), makeBoundary(0, 0, 0, 'r2')]);

            expect(result.averageAcceptanceRate).toBe(50);
            expect(result.overallScore).toBe(45);
            expect(result.overallGrade).toBe('D');
            expect(result.totalKept).toBe(5);
        });
    });
});
