import {
    getCoverageWeight,
    normalizeType,
    extractEpicKey,
    extractLinkedTestKeys,
    buildCoverageItems,
    calculateTotals,
    checkQualityGate,
    loadEpicSummaries,
} from './coverage-gap-utils';
import type { CoverageGapItem, EpicCoverage } from './coverage-gap';

describe('getCoverageWeight', () => {
    it('returns correct weight for known priorities', () => {
        expect(getCoverageWeight('Blocker')).toBe(5);
        expect(getCoverageWeight('High')).toBe(3);
        expect(getCoverageWeight('Medium')).toBe(2);
        expect(getCoverageWeight('Low')).toBe(1);
        expect(getCoverageWeight('Trivial')).toBe(0.5);
    });
    it('defaults to 2 for unknown priorities', () => {
        expect(getCoverageWeight('Unknown')).toBe(2);
        expect(getCoverageWeight('')).toBe(2);
    });
});

describe('normalizeType', () => {
    it('maps known types correctly', () => {
        expect(normalizeType('Story')).toBe('Story');
        expect(normalizeType('Bug')).toBe('Bug');
        expect(normalizeType('Epic')).toBe('Epic');
        expect(normalizeType('Task')).toBe('Task');
    });
    it('maps unknown types to Task', () => {
        expect(normalizeType('Sub-task')).toBe('Task');
        expect(normalizeType('')).toBe('Task');
    });
    it('is case-insensitive', () => {
        expect(normalizeType('story')).toBe('Story');
        expect(normalizeType('BUG')).toBe('Bug');
    });
});

describe('extractEpicKey', () => {
    it('extracts from customfield_10014 object', () => {
        expect(extractEpicKey({ customfield_10014: { key: 'EPIC-1' } })).toBe('EPIC-1');
    });
    it('extracts from customfield_10014 string', () => {
        expect(extractEpicKey({ customfield_10014: 'EPIC-1' })).toBe('EPIC-1');
    });
    it('extracts from epic field', () => {
        expect(extractEpicKey({ epic: { key: 'EPIC-2' } })).toBe('EPIC-2');
    });
    it('returns undefined when no epic field exists', () => {
        expect(extractEpicKey({})).toBeUndefined();
    });
});

describe('extractLinkedTestKeys', () => {
    it('extracts linked test keys from issuelinks', () => {
        const fields = {
            issuelinks: [
                { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                { type: { name: 'Test' }, inwardIssue: { key: 'TEST-2' }, outwardIssue: { key: 'PROJ-2' } },
            ],
        };
        const keys = extractLinkedTestKeys(fields);
        expect(keys).toContain('TEST-1');
        expect(keys).toContain('TEST-2');
    });
    it('ignores non-Test link types', () => {
        const fields = {
            issuelinks: [{ type: { name: 'Blocks' }, inwardIssue: { key: 'BUG-1' }, outwardIssue: { key: 'PROJ-1' } }],
        };
        expect(extractLinkedTestKeys(fields)).toEqual([]);
    });
    it('returns empty array when no issuelinks', () => {
        expect(extractLinkedTestKeys({})).toEqual([]);
    });
});

describe('buildCoverageItems', () => {
    it('builds items with correct hasTest flag', () => {
        const issues = [
            {
                key: 'PROJ-1',
                fields: {
                    summary: 'Test',
                    issuetype: { name: 'Story' },
                    status: { name: 'Open' },
                    priority: { name: 'High' },
                },
            },
            {
                key: 'PROJ-2',
                fields: {
                    summary: 'Test 2',
                    issuetype: { name: 'Bug' },
                    status: { name: 'Done' },
                    priority: { name: 'Blocker' },
                    issuelinks: [
                        { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-2' } },
                    ],
                },
            },
        ];
        const testLinkMap = new Map<string, string[]>();
        const epicsMap = new Map<string, string>();
        const items = buildCoverageItems(issues, testLinkMap, epicsMap);
        expect(items).toHaveLength(2);
        expect(items[0]!.hasTest).toBe(false);
        expect(items[0]!.type).toBe('Story');
        expect(items[0]!.priority).toBe('High');
        expect(items[1]!.hasTest).toBe(true);
        expect(items[1]!.type).toBe('Bug');
        expect(items[1]!.coverageWeight).toBe(5);
    });
});

describe('calculateTotals', () => {
    it('computes totals correctly', () => {
        const items = [
            { issueKey: 'P-1', hasTest: true, coverageWeight: 5 } as CoverageGapItem,
            { issueKey: 'P-2', hasTest: false, coverageWeight: 2 } as CoverageGapItem,
            { issueKey: 'P-3', hasTest: true, coverageWeight: 3 } as CoverageGapItem,
        ];
        const t = calculateTotals(items);
        expect(t.totalIssues).toBe(3);
        expect(t.covered).toBe(2);
        expect(t.gap).toBe(1);
        expect(t.weightedCoveragePct).toBe(80);
        expect(t.rawCoveragePct).toBe(67);
    });
    it('handles empty items', () => {
        const t = calculateTotals([]);
        expect(t.totalIssues).toBe(0);
        expect(t.rawCoveragePct).toBe(0);
    });
});

describe('checkQualityGate', () => {
    function makeEpic(rawPct: number): EpicCoverage {
        return { epicSummary: '', total: 0, covered: 0, weightedPct: 0, rawPct, gatePass: true, issues: [] };
    }
    it('returns failing epics below threshold', () => {
        const byEpic: Record<string, EpicCoverage> = {
            'EPIC-1': makeEpic(30),
            'EPIC-2': makeEpic(80),
        };
        const result = checkQualityGate(byEpic, 50);
        expect(result.failingEpics).toContain('EPIC-1');
        expect(result.failingEpics).not.toContain('EPIC-2');
    });
    it('skips __no_epic__ key', () => {
        const byEpic: Record<string, EpicCoverage> = { __no_epic__: makeEpic(10) };
        const result = checkQualityGate(byEpic, 50);
        expect(result.failingEpics).toEqual([]);
    });
});

describe('loadEpicSummaries', () => {
    it('extracts epic summaries', () => {
        const issues = [
            { key: 'EPIC-1', fields: { issuetype: { name: 'Epic' }, summary: 'Big Epic' } },
            { key: 'STORY-1', fields: { issuetype: { name: 'Story' }, summary: 'A story' } },
        ];
        const map = loadEpicSummaries(issues);
        expect(map.get('EPIC-1')).toBe('Big Epic');
        expect(map.has('STORY-1')).toBe(false);
    });
});
