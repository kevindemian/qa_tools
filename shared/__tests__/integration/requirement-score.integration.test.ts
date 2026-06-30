/**
 * Integration tests — Requirement Quality Score (FT-32)
 *
 * Validates end-to-end flow:
 * - calculateRequirementScores → generateRequirementScoreHtml
 * - HTML output structure, score table, error handling, custom title
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AiGenerationRecord } from '../../types/llm.js';

vi.mock('../../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

describe('Requirement Score.Integration', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    function makeRecords(): AiGenerationRecord[] {
        return [
            {
                id: 'req-001',
                generatedAt: '2026-06-01T12:00:00.000Z',
                promptVersion: 'v2',
                userStory: 'User login feature',
                acceptanceCriteria: 'User can login with email and password',
                generatedTests: [
                    { title: 'TC-1', preConditions: [], stepCount: 3 },
                    { title: 'TC-2', preConditions: [], stepCount: 2 },
                ],
                preconditionMatches: [],
                feedback: [
                    { testKey: 'TC-1', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                    {
                        testKey: 'TC-2',
                        recordedAt: '2026-06-02T10:00:00.000Z',
                        action: 'modified',
                        reason: 'Add edge case',
                    },
                ],
            },
            {
                id: 'req-002',
                generatedAt: '2026-06-01T12:00:00.000Z',
                promptVersion: 'v1',
                userStory: 'Password reset flow',
                acceptanceCriteria: 'User can reset password via email',
                generatedTests: [
                    { title: 'TC-3', preConditions: [], stepCount: 4 },
                    { title: 'TC-4', preConditions: [], stepCount: 2 },
                    { title: 'TC-5', preConditions: [], stepCount: 3 },
                ],
                preconditionMatches: [],
                feedback: [
                    { testKey: 'TC-3', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' },
                    { testKey: 'TC-4', recordedAt: '2026-06-02T10:00:00.000Z', action: 'deleted', reason: 'Redundant' },
                ],
            },
            {
                id: 'req-003',
                generatedAt: '2026-06-01T12:00:00.000Z',
                promptVersion: 'v2',
                userStory: 'Dashboard view',
                acceptanceCriteria: 'Dashboard shows key metrics',
                generatedTests: [{ title: 'TC-6', preConditions: [], stepCount: 5 }],
                preconditionMatches: [],
                feedback: [{ testKey: 'TC-6', recordedAt: '2026-06-02T10:00:00.000Z', action: 'kept' }],
            },
        ];
    }

    describe('Integration: Requirement Quality Score', () => {
        describe('FT-32a: basic HTML generation with entries', () => {
            it('generates valid HTML from real score data', async () => {
                expect.hasAssertions();

                const { calculateRequirementScores, generateRequirementScoreHtml } =
                    await import('../../requirement-score.js');
                const result = calculateRequirementScores(makeRecords());
                const html = generateRequirementScoreHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('Requirement Quality Score');
                expect(html).toContain('data-component="metric-card"');
                expect(html).toContain('data-component="data-table"');
                expect(html).toContain('Score Breakdown');
                expect(html).toContain('User login feature');
                expect(html).toContain('Password reset flow');
                expect(html).toContain('Dashboard view');
            });

            it('shows correct summary card values', async () => {
                expect.hasAssertions();

                const { calculateRequirementScores, generateRequirementScoreHtml } =
                    await import('../../requirement-score.js');
                const result = calculateRequirementScores(makeRecords());
                const html = generateRequirementScoreHtml(result);

                expect(html).toContain('Requirements');
                expect(html).toContain('Overall Score');
                expect(html).toContain('Acceptance Rate');
                expect(html).toContain('Generated Tests');
            });
        });

        describe('FT-32b: empty input shows no-data message', () => {
            it('generates HTML with no-data message when entries are empty', async () => {
                expect.hasAssertions();

                const { calculateRequirementScores, generateRequirementScoreHtml } =
                    await import('../../requirement-score.js');
                const result = calculateRequirementScores([]);
                const html = generateRequirementScoreHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('No requirement data available');
                expect(html).not.toContain('data-component="data-table"');
            });
        });

        describe('FT-32c: null/undefined input returns error page', () => {
            it('returns error page for null result', async () => {
                expect.hasAssertions();

                const { generateRequirementScoreHtml } = await import('../../requirement-score.js');
                const html = generateRequirementScoreHtml(null);

                expect(html).toContain('Requirement Score Report Error');
            });

            it('returns error page for undefined result', async () => {
                expect.hasAssertions();

                const { generateRequirementScoreHtml } = await import('../../requirement-score.js');
                const html = generateRequirementScoreHtml(undefined);

                expect(html).toContain('Requirement Score Report Error');
            });
        });

        describe('FT-32d: custom title', () => {
            it('uses custom title in HTML and page title', async () => {
                expect.hasAssertions();

                const { calculateRequirementScores, generateRequirementScoreHtml } =
                    await import('../../requirement-score.js');
                const result = calculateRequirementScores(makeRecords());
                const html = generateRequirementScoreHtml(result, 'Sprint Review Scores');

                expect(html).toContain('<title>Sprint Review Scores</title>');
                expect(html).toContain('<h1>Sprint Review Scores</h1>');
            });

            it('defaults to Requirement Quality Score when no title given', async () => {
                expect.hasAssertions();

                const { calculateRequirementScores, generateRequirementScoreHtml } =
                    await import('../../requirement-score.js');
                const result = calculateRequirementScores(makeRecords());
                const html = generateRequirementScoreHtml(result);

                expect(html).toContain('<title>Requirement Quality Score</title>');
                expect(html).toContain('<h1>Requirement Quality Score</h1>');
            });
        });
    });
});
