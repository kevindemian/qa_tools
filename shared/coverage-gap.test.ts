import { analyzeCoverageGaps } from './coverage-gap';

jest.mock('./logger', () => ({
    rootLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock('./metrics', () => ({
    loadMetrics: jest.fn(),
}));

const mockSearch = jest.fn();
const mockJiraResource = {
    getJiraResource: jest.fn(),
    postJiraResource: jest.fn(),
    putJiraResource: jest.fn(),
    searchJiraIssues: mockSearch,
    getTransitionsForIssue: jest.fn(),
    transitionIssue: jest.fn(),
};

function makeIssue(key: string, overrides?: Record<string, unknown>): { key: string; fields: Record<string, unknown> } {
    return {
        key,
        fields: {
            summary: 'Issue ' + key,
            issuetype: { name: 'Story' },
            status: { name: 'To Do' },
            priority: { name: 'Medium' },
            ...overrides,
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({ issues: [], total: 0 });
    require('./metrics').loadMetrics.mockReturnValue({ runs: [], coverageHistory: [] });
});

describe('analyzeCoverageGaps', () => {
    it('returns metrics for uncovered issues', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1'), makeIssue('PROJ-2')], total: 2 })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(2);
        expect(result.totals.covered).toBe(0);
        expect(result.totals.gap).toBe(2);
        expect(result.totals.rawCoveragePct).toBe(0);
    });

    it('detects linked tests via issuelinks', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('PROJ-1', {
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                        ],
                    }),
                    makeIssue('PROJ-2'),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.covered).toBe(1);
        expect(result.items[0]!.hasTest).toBe(true);
        expect(result.items[0]!.linkedTestKeys).toContain('TEST-1');
    });

    it('calculates weighted coverage by priority', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 3 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('PROJ-1', {
                        priority: { name: 'Blocker' },
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                        ],
                    }),
                    makeIssue('PROJ-2', { priority: { name: 'Trivial' } }),
                    makeIssue('PROJ-3', {
                        priority: { name: 'High' },
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-2' }, outwardIssue: { key: 'PROJ-3' } },
                        ],
                    }),
                ],
                total: 3,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.items[0]!.coverageWeight).toBe(5);
        expect(result.items[1]!.coverageWeight).toBe(0.5);
        expect(result.items[2]!.coverageWeight).toBe(3);
        expect(result.totals.weightedCoveragePct).toBeGreaterThan(0);
    });

    it('handles >5000 issues by fetching recent/active only', async () => {
        const manyIssues = Array.from({ length: 30 }, (_, i) => makeIssue('PROJ-' + (i + 1)));
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 6000 })
            .mockResolvedValueOnce({ issues: manyIssues, total: 30 })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ', { maxIssues: 5000 });
        expect(result.items.length).toBe(30);
    });

    it('builds epic rollup with correct counts', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 3 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('EPIC-1', { issuetype: { name: 'Epic' }, summary: 'My Epic' }),
                    makeIssue('PROJ-1', {
                        customfield_10014: { key: 'EPIC-1' },
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                        ],
                    }),
                    makeIssue('PROJ-2', { customfield_10014: { key: 'EPIC-1' } }),
                ],
                total: 3,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.byEpic['EPIC-1']!.total).toBe(2);
        expect(result.byEpic['EPIC-1']!.covered).toBe(1);
        expect(result.byEpic['EPIC-1']!.rawPct).toBe(50);
    });

    it('quality gate passes when all epics meet threshold', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('EPIC-1', { issuetype: { name: 'Epic' } }),
                    makeIssue('PROJ-1', {
                        customfield_10014: { key: 'EPIC-1' },
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                        ],
                    }),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ', { minCoveragePct: 50 });
        expect(result.gateConfig.failingEpics).toEqual([]);
        expect(result.byEpic['EPIC-1']!.gatePass).toBe(true);
    });

    it('quality gate fails when epics below threshold', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('EPIC-1', { issuetype: { name: 'Epic' } }),
                    makeIssue('PROJ-1', { customfield_10014: { key: 'EPIC-1' } }),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ', { minCoveragePct: 50 });
        expect(result.gateConfig.failingEpics).toContain('EPIC-1');
        expect(result.byEpic['EPIC-1']!.gatePass).toBe(false);
    });

    it('builds hierarchy tree with epics and children', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 3 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('EPIC-1', { issuetype: { name: 'Epic' }, summary: 'Big Epic' }),
                    makeIssue('STORY-1', { customfield_10014: { key: 'EPIC-1' }, issuetype: { name: 'Story' } }),
                    makeIssue('TASK-1', {
                        customfield_10014: { key: 'EPIC-1' },
                        issuetype: { name: 'Task' },
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'TASK-1' } },
                        ],
                    }),
                ],
                total: 3,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.hierarchy.length).toBe(1);
        expect(result.hierarchy[0]!.key).toBe('EPIC-1');
        expect(result.hierarchy[0]!.children.length).toBe(2);
        expect(result.hierarchy[0]!.totalIssues).toBe(2);
        expect(result.hierarchy[0]!.coveredIssues).toBe(1);
    });

    it('returns empty result for empty project', async () => {
        mockSearch.mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(0);
        expect(result.items).toEqual([]);
    });

    it('returns 100% coverage when all issues have tests', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('PROJ-1', {
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' }, outwardIssue: { key: 'PROJ-1' } },
                        ],
                    }),
                    makeIssue('PROJ-2', {
                        issuelinks: [
                            { type: { name: 'Test' }, inwardIssue: { key: 'TEST-2' }, outwardIssue: { key: 'PROJ-2' } },
                        ],
                    }),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.rawCoveragePct).toBe(100);
    });

    it('returns 0% coverage when no issues have tests', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1'), makeIssue('PROJ-2')], total: 2 })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.rawCoveragePct).toBe(0);
    });

    it('handles searchJiraIssues throwing an error', async () => {
        mockSearch.mockRejectedValueOnce(new Error('API timeout'));
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(0);
        expect(result.items).toEqual([]);
    });

    it('correctly identifies issue types', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 3 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('PROJ-1', { issuetype: { name: 'Bug' } }),
                    makeIssue('PROJ-2', { issuetype: { name: 'Epic' } }),
                    makeIssue('PROJ-3', { issuetype: { name: 'Task' } }),
                ],
                total: 3,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.items[0]!.type).toBe('Bug');
        expect(result.items[1]!.type).toBe('Epic');
        expect(result.items[2]!.type).toBe('Task');
    });

    it('loads trends from metrics store', async () => {
        require('./metrics').loadMetrics.mockReturnValue({
            runs: [],
            coverageHistory: [
                {
                    timestamp: '2026-01-01T00:00:00Z',
                    project: 'PROJ',
                    totalIssues: 10,
                    mappedIssues: 5,
                    coveragePct: 50,
                },
            ],
        });
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 1 })
            .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.trends).toHaveLength(1);
        expect(result.trends[0]!.coveragePct).toBe(50);
    });

    it('handles fetchLinkedTestsBatch error (lines 84-85)', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 1 })
            .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
            .mockRejectedValueOnce(new Error('Linked tests fetch failed'));
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(1);
        expect(result.items[0]!.linkedTestKeys).toEqual([]);
    });

    it('handles fetchLinkedTestsBatch empty response (line 68)', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 1 })
            .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
            .mockResolvedValueOnce({ total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.items[0]!.linkedTestKeys).toEqual([]);
    });

    it('handles collectAllPages with empty issues batch (line 43)', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 0 })
            .mockResolvedValueOnce({ issues: [], total: 0 })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(0);
    });

    it('handles linked tests with issuelinks on issue (lines 70-83)', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 2 })
            .mockResolvedValueOnce({
                issues: [
                    makeIssue('PROJ-1', {
                        issuelinks: [{ type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' } }],
                    }),
                    makeIssue('PROJ-2', {
                        issuelinks: [
                            { type: { name: 'Test' }, outwardIssue: { key: 'TEST-2' }, inwardIssue: { key: 'PROJ-2' } },
                        ],
                    }),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({ issues: [], total: 0 });
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.covered).toBe(2);
    });

    it('handles collectAllPages catch error (lines 53-54)', async () => {
        mockSearch
            .mockResolvedValueOnce({ issues: [], total: 1 })
            .mockRejectedValueOnce(new Error('collect pages error'));
        const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');
        expect(result.totals.totalIssues).toBe(0);
    });
});
