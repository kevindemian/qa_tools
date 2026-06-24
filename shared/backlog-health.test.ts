/**
 * Tests for backlog-health — backlog health analysis and HTML dashboard.
 */

import { nonNull } from './test-utils.js';
import {
    analyzeUnassignedIssues,
    analyzeStaleIssues,
    analyzeBugsWithoutTests,
    calculateBacklogScore,
    analyzeBacklogHealth,
    generateBacklogHealthHtml,
} from './backlog-health.js';
import type { BacklogHealthIssue, BacklogHealthResult } from './backlog-health.js';

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
    score: 100,
    timestamp: new Date().toISOString(),
};

describe('analyzeUnassignedIssues', () => {
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

describe('analyzeStaleIssues', () => {
    it('detects issues older than default 30 days', () => {
        const result = analyzeStaleIssues(sampleIssues);

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.key)).toEqual(['PROJ-3', 'PROJ-4']);
    });

    it('respects custom staleDays option', () => {
        const result = analyzeStaleIssues(sampleIssues, { staleDays: 7 });

        expect(result).toHaveLength(3);
    });

    it('handles empty input', () => {
        expect(analyzeStaleIssues([])).toHaveLength(0);
    });
});

describe('analyzeBugsWithoutTests', () => {
    it('filters Bug type with linkedTestCount === 0', () => {
        const result = analyzeBugsWithoutTests(sampleIssues);

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.key)).toEqual(['PROJ-2', 'PROJ-4']);
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

describe('calculateBacklogScore', () => {
    it('returns 100 for perfect result with no flagged issues', () => {
        expect(calculateBacklogScore(emptyResult)).toBe(100);
    });

    it('returns lower score for poor backlog health', () => {
        const poor: BacklogHealthResult = {
            unassignedIssues: [nonNull(sampleIssues[1])],
            staleIssues: [nonNull(sampleIssues[2]), nonNull(sampleIssues[3])],
            bugsWithoutTests: [nonNull(sampleIssues[1]), nonNull(sampleIssues[3])],
            densityByEpic: [{ epic: 'PROJ', bugCount: 3, testCount: 1 }],
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
});

describe('analyzeBacklogHealth', () => {
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

    it('handles empty input', () => {
        const result = analyzeBacklogHealth([]);

        expect(result.unassignedIssues).toHaveLength(0);
        expect(result.staleIssues).toHaveLength(0);
        expect(result.bugsWithoutTests).toHaveLength(0);
        expect(result.score).toBe(100);
    });

    it('respects maxIssues option', () => {
        const result = analyzeBacklogHealth(sampleIssues, { maxIssues: 2 });

        expect(result.staleIssues.length).toBeLessThanOrEqual(2);
    });
});

describe('generateBacklogHealthHtml', () => {
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
