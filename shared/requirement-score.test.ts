/**
 * Tests for requirement-score — Requirement Quality Score.
 */

import * as reportStyles from './report-styles.js';
import { calculateRequirementScores, generateRequirementScoreHtml } from './requirement-score.js';
import type { RequirementScoreResult } from './requirement-score.js';
import type { AiGenerationRecord } from './types/llm.js';
import { nullAs, undefinedAs } from './test-utils.js';
import { rootLogger } from './logger.js';

vi.mock('./logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

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
        expect(result.entries).toEqual([]);
    });

    it('returns empty result for undefined input', () => {
        const result = calculateRequirementScores(undefinedAs<AiGenerationRecord[]>());

        expect(result.totalRequirements).toBe(0);
        expect(result.overallScore).toBe(0);
        expect(result.entries).toEqual([]);
    });

    it('returns empty result for empty array', () => {
        const result = calculateRequirementScores([]);

        expect(result.totalRequirements).toBe(0);
        expect(result.overallScore).toBe(0);
        expect(result.entries).toEqual([]);
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

    it('sorts entries by score descending', () => {expect.hasAssertions();

        const result = calculateRequirementScores(makeRecords());
        for (let i = 1; i < result.entries.length; i++) {
            expect(result.entries[i]?.score).toBeLessThanOrEqual(result.entries[i - 1]?.score ?? 100);
        }
    });

    it('assigns correct grade for score ranges', () => {
        const records = [makeRecord({ id: 'a', generatedTests: [{ title: 'T1', preConditions: [], stepCount: 1 }] })];
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

describe('GenerateRequirementScoreHtml', () => {
    function makeResult(overrides?: Partial<RequirementScoreResult>): RequirementScoreResult {
        return {
            entries: [
                {
                    requirementId: 'req-001',
                    userStory: 'User login feature',
                    totalTests: 2,
                    keptTests: 1,
                    modifiedTests: 1,
                    deletedTests: 0,
                    acceptanceRate: 100,
                    score: 85,
                    scoreGrade: 'B',
                    promptVersion: 'v2',
                },
                {
                    requirementId: 'req-002',
                    userStory: 'Password reset flow',
                    totalTests: 3,
                    keptTests: 1,
                    modifiedTests: 0,
                    deletedTests: 1,
                    acceptanceRate: 50,
                    score: 55,
                    scoreGrade: 'D',
                    promptVersion: 'v1',
                },
            ],
            totalRequirements: 2,
            overallScore: 70,
            overallGrade: 'B',
            averageAcceptanceRate: 75,
            totalGenerated: 5,
            totalKept: 2,
            totalModified: 1,
            totalDeleted: 1,
            timestamp: '2026-06-03T12:00:00.000Z',
            ...overrides,
        };
    }

    it('generates valid HTML page', () => {
        const html = generateRequirementScoreHtml(makeResult());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
    });

    it('returns error page for null result', () => {
        const html = generateRequirementScoreHtml(nullAs<RequirementScoreResult>());

        expect(html).toContain('Requirement Score Report Error');
    });

    it('logs actionable guidance when result is null', () => {
        const errorSpy = vi.spyOn(rootLogger, 'error');
        generateRequirementScoreHtml(nullAs<RequirementScoreResult>());

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Ensure a valid RequirementScoreResult object'));
    });

    it('returns error page for undefined result', () => {
        const html = generateRequirementScoreHtml(undefinedAs<RequirementScoreResult>());

        expect(html).toContain('Requirement Score Report Error');
    });

    it('shows summary cards with score data', () => {
        const html = generateRequirementScoreHtml(makeResult());

        expect(html).toContain('Requirements');
        expect(html).toContain('Overall Score');
        expect(html).toContain('Acceptance Rate');
        expect(html).toContain('Generated Tests');
        expect(html).toContain('2');
        expect(html).toContain('B');
        expect(html).toContain('75%');
        expect(html).toContain('5');
    });

    it('includes requirement entries in data table', () => {
        const html = generateRequirementScoreHtml(makeResult());

        expect(html).toContain('data-component="table-wrapper"');
        expect(html).toContain('data-component="data-table"');
        expect(html).toContain('User login feature');
        expect(html).toContain('Password reset flow');
    });

    it('shows no-data message when entries is empty', () => {
        const result = makeResult({
            entries: [],
            totalRequirements: 0,
            overallScore: 0,
            overallGrade: 'F',
            averageAcceptanceRate: 0,
            totalGenerated: 0,
            totalKept: 0,
            totalModified: 0,
            totalDeleted: 0,
        });
        const html = generateRequirementScoreHtml(result);

        expect(html).toContain('No requirement data available');
        expect(html).not.toContain('data-component="data-table"');
    });

    it('uses custom title', () => {
        const html = generateRequirementScoreHtml(makeResult({ entries: [] }), 'My Score Report');

        expect(html).toContain('<title>My Score Report</title>');
        expect(html).toContain('<h1>My Score Report</h1>');
    });

    it('defaults title to Requirement Quality Score', () => {
        const html = generateRequirementScoreHtml(makeResult({ entries: [] }));

        expect(html).toContain('<title>Requirement Quality Score</title>');
        expect(html).toContain('<h1>Requirement Quality Score</h1>');
    });

    it('includes theme and dark mode support', () => {
        const html = generateRequirementScoreHtml(makeResult({ entries: [] }));

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('html.dark');
    });

    it('includes footer', () => {
        const html = generateRequirementScoreHtml(makeResult());

        expect(html).toContain('Requirement Quality Score');
    });

    it('shows data-component attributes from primitives', () => {
        const html = generateRequirementScoreHtml(makeResult());

        expect(html).toContain('data-component="metric-grid"');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('data-component="table-wrapper"');
    });

    it('returns error page when buildCss throws', () => {
        const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
            throw new Error('CSS build failure');
        });
        try {
            const html = generateRequirementScoreHtml(makeResult({ entries: [] }));

            expect(html).toContain('Requirement Score Report Error');
        } finally {
            spy.mockRestore();
        }
    });

    it('logs actionable guidance when HTML generation throws', () => {
        const result = makeResult({ entries: [] });
        const errorSpy = vi.spyOn(rootLogger, 'error');
        const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
            throw new Error('CSS build failure');
        });
        try {
            generateRequirementScoreHtml(result);

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Verify that requirement data and html-factory module are working correctly.'),
            );
        } finally {
            spy.mockRestore();
        }
    });
});
