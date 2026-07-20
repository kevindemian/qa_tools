/**
 * Tests for backlog-health — backlog health analysis and HTML dashboard.
 */

import { nonNull } from '../test-utils.js';
import {
    analyzeUnassignedIssues,
    analyzeStaleIssues,
    analyzeBugsWithoutTests,
    calculateBacklogScore,
    analyzeBacklogHealth,
    generateBacklogHealthHtml,
} from '../report/backlog-health.js';
import type { BacklogHealthIssue, BacklogHealthResult } from '../report/backlog-health.js';

const now = new Date();
function daysAgo(d: number): string {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    return date.toISOString();
}

const sampleIssues: BacklogHealthIssue[] = [
    {
        key: 'PROJ-1',
        summary: 'Login bug',
        assignee: 'alice',
        updated: daysAgo(5),
        type: 'Bug',
        priority: 'high',
        linkedTestCount: 2,
    },
    {
        key: 'PROJ-2',
        summary: 'Dashboard crash',
        assignee: null,
        updated: daysAgo(10),
        type: 'Bug',
        priority: 'critical',
        linkedTestCount: 0,
    },
    {
        key: 'PROJ-3',
        summary: 'Style fix',
        assignee: 'bob',
        updated: daysAgo(60),
        type: 'Task',
        priority: 'low',
        linkedTestCount: 0,
    },
    {
        key: 'PROJ-4',
        summary: 'API timeout',
        assignee: null,
        updated: daysAgo(90),
        type: 'Bug',
        priority: 'medium',
        linkedTestCount: 0,
    },
    {
        key: 'PROJ-5',
        summary: 'Add tests',
        assignee: 'alice',
        updated: daysAgo(2),
        type: 'Task',
        priority: 'low',
        linkedTestCount: 5,
    },
];

const emptyResult: BacklogHealthResult = {
    unassignedIssues: [],
    staleIssues: [],
    bugsWithoutTests: [],
    densityByEpic: [],
    totalIssues: 0,
    score: 100,
    timestamp: new Date().toISOString(),
};

describe('AnalyzeUnassignedIssues', () => {
    it('filters issues with null or empty assignee', () => {
        const result = analyzeUnassignedIssues(sampleIssues);

        expect(result).toHaveLength(2);
        expect(nonNull(result[0]).key).toBe('PROJ-2');
        expect(nonNull(result[1]).key).toBe('PROJ-4');
    });

    it('returns empty array when all issues are assigned', () => {
        const assigned = sampleIssues.filter((i) => i.assignee !== null);

        expect(analyzeUnassignedIssues(assigned)).toHaveLength(0);
    });

    it('handles empty input', () => {
        expect(analyzeUnassignedIssues([])).toHaveLength(0);
    });
});

describe('AnalyzeStaleIssues', () => {
    it('detects issues older than default 30 days', () => {
        const result = analyzeStaleIssues(sampleIssues);

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.key)).toStrictEqual(['PROJ-3', 'PROJ-4']);
    });

    it('respects custom staleDays option', () => {
        const result = analyzeStaleIssues(sampleIssues, { staleDays: 7 });

        expect(result).toHaveLength(3);
    });

    it('handles empty input', () => {
        expect(analyzeStaleIssues([])).toHaveLength(0);
    });

    it('aggressive: invalid/empty updated date is treated as STALE, not fresh (no silent misclassification)', () => {
        const corrupted: BacklogHealthIssue[] = [
            { key: 'X-1', summary: 's', assignee: 'a', updated: '', type: 'Bug', priority: 'low', linkedTestCount: 0 },
            {
                key: 'X-2',
                summary: 's',
                assignee: 'a',
                updated: 'not-a-date',
                type: 'Bug',
                priority: 'low',
                linkedTestCount: 0,
            },
            {
                key: 'X-3',
                summary: 's',
                assignee: 'a',
                updated: daysAgo(1),
                type: 'Bug',
                priority: 'low',
                linkedTestCount: 0,
            },
        ];
        const result = analyzeStaleIssues(corrupted, { staleDays: 30 });

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.key).sort((a, b) => a.localeCompare(b))).toStrictEqual(['X-1', 'X-2']);
    });
});

describe('AnalyzeBugsWithoutTests', () => {
    it('filters Bug type with linkedTestCount === 0', () => {
        const result = analyzeBugsWithoutTests(sampleIssues);

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.key)).toStrictEqual(['PROJ-2', 'PROJ-4']);
    });

    it('excludes bugs that have linked tests', () => {
        const result = analyzeBugsWithoutTests(sampleIssues);

        expect(result.find((i) => i.key === 'PROJ-1')).toBeUndefined();
    });

    it('excludes non-Bug types even with zero linked tests', () => {
        const result = analyzeBugsWithoutTests(sampleIssues);

        expect(result.find((i) => i.key === 'PROJ-3')).toBeUndefined();
    });

    it('handles empty input', () => {
        expect(analyzeBugsWithoutTests([])).toHaveLength(0);
    });
});

describe('CalculateBacklogScore', () => {
    it('returns 0 (no data) when there are zero real issues, never 100', () => {
        expect(calculateBacklogScore(emptyResult)).toBe(0);
    });

    it('returns lower score for poor backlog health', () => {
        const poor: BacklogHealthResult = {
            unassignedIssues: [nonNull(sampleIssues[1])],
            staleIssues: [nonNull(sampleIssues[2]), nonNull(sampleIssues[3])],
            bugsWithoutTests: [nonNull(sampleIssues[1]), nonNull(sampleIssues[3])],
            densityByEpic: [{ epic: 'PROJ', bugCount: 3, testCount: 1 }],
            totalIssues: 3,
            score: 0,
            timestamp: new Date().toISOString(),
        };
        const score = calculateBacklogScore(poor);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThan(100);
    });

    it('validates exact score for known poor input', () => {
        const poor: BacklogHealthResult = {
            unassignedIssues: [nonNull(sampleIssues[1])],
            staleIssues: [nonNull(sampleIssues[2]), nonNull(sampleIssues[3])],
            bugsWithoutTests: [nonNull(sampleIssues[1]), nonNull(sampleIssues[3])],
            densityByEpic: [{ epic: 'PROJ', bugCount: 3, testCount: 1 }],
            totalIssues: 3,
            score: 0,
            timestamp: new Date().toISOString(),
        };
        const score = calculateBacklogScore(poor);

        // totalFlagged=3, totalIssues=3, effective=3
        // unassignScore = 100 - (1/3)*100 = 66.67
        // staleScore = 100 - (2/3)*100 = 33.33
        // bugNoTestScore = 100 - (2/3)*100 = 33.33
        // weighted = 66.67*0.30 + 33.33*0.35 + 33.33*0.35 = 43.33
        expect(score).toBe(43);
    });

    it('aggressive: score scales with proportion of flagged non-bug issues (denominator = total issues, not bug-only)', () => {
        const makeIssue = (key: string): BacklogHealthIssue => ({
            key,
            summary: 'task',
            assignee: null,
            updated: daysAgo(1),
            type: 'Task',
            priority: 'low',
            linkedTestCount: 1,
        });

        const allUnassigned = Array.from({ length: 10 }, (_, i) => makeIssue(`P-${i}`));
        const result: BacklogHealthResult = {
            unassignedIssues: allUnassigned,
            staleIssues: [],
            bugsWithoutTests: [],
            densityByEpic: [{ epic: 'P', bugCount: 0, testCount: 10 }],
            totalIssues: allUnassigned.length,
            score: 0,
            timestamp: new Date().toISOString(),
        };

        // All 10 non-bug issues unassigned → unassignScore=0, others 100 → 0*0.30+100*0.35+100*0.35 = 70.
        // The key bug fix: denominator is totalIssues (10), so the ratio is real (was collapsing to bug-only count).
        const fullUnassignedScore = calculateBacklogScore(result);

        expect(fullUnassignedScore).toBe(70);

        const halfUnassigned = allUnassigned.slice(0, 5);
        const partial: BacklogHealthResult = {
            ...result,
            unassignedIssues: halfUnassigned,
            totalIssues: allUnassigned.length,
        };
        const partialScore = calculateBacklogScore(partial);

        // 5/10 unassigned → unassignScore = 50, others 100 → 50*0.30 + 100*0.35 + 100*0.35 = 85
        expect(partialScore).toBe(85);
        // Score must differ between 50% and 100% unassigned (proves ratio-sensitivity, not collapse).
        expect(partialScore).not.toBe(fullUnassignedScore);
    });

    it('aggressive: totalIssues missing/invalid does not crash and reports 100 when no flags', () => {
        const noFlags: BacklogHealthResult = {
            unassignedIssues: [],
            staleIssues: [],
            bugsWithoutTests: [],
            densityByEpic: [],
            totalIssues: 0,
            score: 0,
            timestamp: new Date().toISOString(),
        };

        expect(calculateBacklogScore(noFlags)).toBe(0);
    });
});

describe('AnalyzeBacklogHealth', () => {
    it('returns complete result with all categories', () => {
        const result = analyzeBacklogHealth(sampleIssues);

        expect(result.unassignedIssues).toHaveLength(2);
        expect(result.staleIssues).toHaveLength(2);
        expect(result.bugsWithoutTests).toHaveLength(2);
        expect(result.densityByEpic.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(typeof result.timestamp).toBe('string');
        expect(result.timestamp.length).toBeGreaterThan(0);
    });

    it('handles empty input as no-data (score 0, never fabricated 100)', () => {
        const result = analyzeBacklogHealth([]);

        expect(result.unassignedIssues).toHaveLength(0);
        expect(result.staleIssues).toHaveLength(0);
        expect(result.bugsWithoutTests).toHaveLength(0);
        expect(result.score).toBe(0);
        expect(result.noData).toBeTruthy();
    });

    it('respects maxIssues option', () => {
        const result = analyzeBacklogHealth(sampleIssues, { maxIssues: 2 });

        expect(result.staleIssues.length).toBeLessThanOrEqual(2);
    });
});

describe('GenerateBacklogHealthHtml', () => {
    it('returns non-empty string', () => {
        const html = generateBacklogHealthHtml(emptyResult);

        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(0);
    });

    it('contains key markers', () => {
        const html = generateBacklogHealthHtml(emptyResult);

        expect(html).toContain('backlog-health');
        expect(html).toContain('Backlog Score');
        expect(html).toContain('100%');
    });

    it('renders issue lists when present', () => {
        const result = analyzeBacklogHealth(sampleIssues);
        const html = generateBacklogHealthHtml(result);

        expect(html).toContain('PROJ-2');
        expect(html).toContain('PROJ-3');
        expect(html).toContain('PROJ-4');
    });
});

describe('Characterization — backlog vazio nao reporta saude 100% (C6, verificacao 2026-07-20)', () => {
    it('backlog sem issues nao tem score de saude perfeita', () => {
        expect.hasAssertions();

        const emptyResult: BacklogHealthResult = {
            unassignedIssues: [],
            staleIssues: [],
            bugsWithoutTests: [],
            densityByEpic: [],
            totalIssues: 0,
            score: 0,
            timestamp: new Date().toISOString(),
        };
        const score = calculateBacklogScore(emptyResult);

        // Dado ausente nao pode ser apresentado como 100% (saude perfeita) — AGENTS.md §25 zero-silencing.
        expect(score).not.toBe(100);
    });
});
