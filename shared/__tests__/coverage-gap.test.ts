import { analyzeCoverageGaps } from '../report/coverage-gap.js';
import { getDataHub } from '../data-hub/global-hub.js';
import { nonNull } from '../test-utils.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../data-hub/global-hub.js', () => ({
    getDataHub: vi.fn().mockReturnValue({
        computed: { metricsRuns: [] },
        raw: { coverageHistory: [] },
    }),
}));

const mockGetDataHub = vi.mocked(getDataHub);
const mockSearch = vi.fn();
const mockJiraResource = {
    getJiraResource: vi.fn(),
    postJiraResource: vi.fn(),
    putJiraResource: vi.fn(),
    deleteJiraResource: vi.fn(),
    searchJiraIssues: mockSearch,
    getTransitionsForIssue: vi.fn(),
    transitionIssue: vi.fn(),
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

describe('Coverage Gap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearch.mockReset();
        mockSearch.mockResolvedValue({ issues: [], total: 0 });
        mockGetDataHub.mockReturnValue({
            computed: { metricsRuns: [] },
            raw: { coverageHistory: [] },
        } as never);
    });

    describe('AnalyzeCoverageGaps', () => {
        it('returns metrics for uncovered issues', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1'), makeIssue('PROJ-2')], total: 2 })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.totalIssues).toBe(2);
            expect(result.totals.covered).toBe(0);
            expect(result.totals.gap).toBe(2);
            expect(result.totals.rawCoveragePct).toBe(0);
        });

        it('detects linked tests via issuelinks', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('PROJ-1', {
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'PROJ-1' },
                                },
                            ],
                        }),
                        makeIssue('PROJ-2'),
                    ],
                    total: 2,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.covered).toBe(1);
            expect(nonNull(result.items[0]).hasTest).toBeTruthy();
            expect(nonNull(result.items[0]).linkedTestKeys).toContain('TEST-1');
        });

        it('calculates weighted coverage by priority', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('PROJ-1', {
                            priority: { name: 'Blocker' },
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'PROJ-1' },
                                },
                            ],
                        }),
                        makeIssue('PROJ-2', { priority: { name: 'Trivial' } }),
                        makeIssue('PROJ-3', {
                            priority: { name: 'High' },
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-2' },
                                    outwardIssue: { key: 'PROJ-3' },
                                },
                            ],
                        }),
                    ],
                    total: 3,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(nonNull(result.items[0]).coverageWeight).toBe(5);
            expect(nonNull(result.items[1]).coverageWeight).toBe(0.5);
            expect(nonNull(result.items[2]).coverageWeight).toBe(3);
            expect(result.totals.weightedCoveragePct).toBeGreaterThan(0);
        });

        it('fetches all issues regardless of maxIssues (C2 swap removido)', async () => {
            expect.hasAssertions();

            const manyIssues = Array.from({ length: 30 }, (_, i) => makeIssue('PROJ-' + (i + 1)));
            mockSearch
                .mockResolvedValueOnce({ issues: manyIssues, total: 30 })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ', { maxIssues: 5000 });

            expect(result.items).toHaveLength(30);
        });

        it('builds epic rollup with correct counts', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('EPIC-1', { issuetype: { name: 'Epic' }, summary: 'My Epic' }),
                        makeIssue('PROJ-1', {
                            customfield_10014: { key: 'EPIC-1' },
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'PROJ-1' },
                                },
                            ],
                        }),
                        makeIssue('PROJ-2', { customfield_10014: { key: 'EPIC-1' } }),
                    ],
                    total: 3,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(nonNull(result.byEpic['EPIC-1']).total).toBe(2);
            expect(nonNull(result.byEpic['EPIC-1']).covered).toBe(1);
            expect(nonNull(result.byEpic['EPIC-1']).rawPct).toBe(50);
        });

        it('quality gate passes when all epics meet threshold', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('EPIC-1', { issuetype: { name: 'Epic' } }),
                        makeIssue('PROJ-1', {
                            customfield_10014: { key: 'EPIC-1' },
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'PROJ-1' },
                                },
                            ],
                        }),
                    ],
                    total: 2,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ', { minCoveragePct: 50 });

            expect(result.gateConfig.failingEpics).toStrictEqual([]);
            expect(nonNull(result.byEpic['EPIC-1']).gatePass).toBeTruthy();
        });

        it('quality gate fails when epics below threshold', async () => {
            expect.hasAssertions();

            mockSearch
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
            expect(nonNull(result.byEpic['EPIC-1']).gatePass).toBeFalsy();
        });

        it('builds hierarchy tree with epics and children', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('EPIC-1', { issuetype: { name: 'Epic' }, summary: 'Big Epic' }),
                        makeIssue('STORY-1', { customfield_10014: { key: 'EPIC-1' }, issuetype: { name: 'Story' } }),
                        makeIssue('TASK-1', {
                            customfield_10014: { key: 'EPIC-1' },
                            issuetype: { name: 'Task' },
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'TASK-1' },
                                },
                            ],
                        }),
                    ],
                    total: 3,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.hierarchy).toHaveLength(1);
            expect(nonNull(result.hierarchy[0]).key).toBe('EPIC-1');
            expect(nonNull(result.hierarchy[0]).children).toHaveLength(2);
            expect(nonNull(result.hierarchy[0]).totalIssues).toBe(2);
            expect(nonNull(result.hierarchy[0]).coveredIssues).toBe(1);
        });

        it('returns empty result for empty project', async () => {
            expect.hasAssertions();

            mockSearch.mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.totalIssues).toBe(0);
            expect(result.items).toStrictEqual([]);
        });

        it('returns 100% coverage when all issues have tests', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('PROJ-1', {
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-1' },
                                    outwardIssue: { key: 'PROJ-1' },
                                },
                            ],
                        }),
                        makeIssue('PROJ-2', {
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    inwardIssue: { key: 'TEST-2' },
                                    outwardIssue: { key: 'PROJ-2' },
                                },
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
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1'), makeIssue('PROJ-2')], total: 2 })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.rawCoveragePct).toBe(0);
        });

        it('propaga erro de searchJiraIssues para o caller (C3)', async () => {
            expect.hasAssertions();

            mockSearch.mockRejectedValueOnce(new Error('API timeout'));

            await expect(analyzeCoverageGaps(mockJiraResource, 'PROJ')).rejects.toThrow('API timeout');
        });

        it('correctly identifies issue types', async () => {
            expect.hasAssertions();

            mockSearch
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

            expect(nonNull(result.items[0]).type).toBe('Bug');
            expect(nonNull(result.items[1]).type).toBe('Epic');
            expect(nonNull(result.items[2]).type).toBe('Task');
        });

        it('loads trends from metrics store', async () => {
            expect.hasAssertions();

            mockGetDataHub.mockReturnValue({
                computed: { metricsRuns: [] },
                raw: {
                    coverageHistory: [
                        {
                            timestamp: '2026-01-01T00:00:00Z',
                            project: 'PROJ',
                            totalIssues: 10,
                            mappedIssues: 5,
                            coveragePct: 50,
                        },
                    ],
                },
            } as never);
            mockSearch
                .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.trends).toHaveLength(1);
            expect(nonNull(result.trends[0]).coveragePct).toBe(50);
        });

        it('handles fetchLinkedTestsBatch error (C4 com erro logado)', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
                .mockRejectedValueOnce(new Error('Linked tests fetch failed'));
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.totalIssues).toBe(1);
            expect(nonNull(result.items[0]).linkedTestKeys).toStrictEqual([]);
        });

        it('handles fetchLinkedTestsBatch empty response', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 })
                .mockResolvedValueOnce({ total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(nonNull(result.items[0]).linkedTestKeys).toStrictEqual([]);
        });

        it('handles fetchAllIssues returning empty issues', async () => {
            expect.hasAssertions();

            mockSearch.mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.totalIssues).toBe(0);
        });

        it('handles linked tests with issuelinks on issue', async () => {
            expect.hasAssertions();

            mockSearch
                .mockResolvedValueOnce({
                    issues: [
                        makeIssue('PROJ-1', {
                            issuelinks: [{ type: { name: 'Test' }, inwardIssue: { key: 'TEST-1' } }],
                        }),
                        makeIssue('PROJ-2', {
                            issuelinks: [
                                {
                                    type: { name: 'Test' },
                                    outwardIssue: { key: 'TEST-2' },
                                    inwardIssue: { key: 'PROJ-2' },
                                },
                            ],
                        }),
                    ],
                    total: 2,
                })
                .mockResolvedValueOnce({ issues: [], total: 0 });
            const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

            expect(result.totals.covered).toBe(2);
        });

        it('propaga erro de fetchAllIssues (C3)', async () => {
            expect.hasAssertions();

            mockSearch.mockRejectedValueOnce(new Error('collect pages error'));

            await expect(analyzeCoverageGaps(mockJiraResource, 'PROJ')).rejects.toThrow('collect pages error');
        });

        describe('Linked-test batch matching (fetchLinkedTestsBatch → collectTestLinksForIssue)', () => {
            it('casa Test com link outward apontando para a issue conhecida', async () => {
                expect.hasAssertions();

                mockSearch
                    .mockResolvedValueOnce({ issues: [makeIssue('PROJ-1'), makeIssue('PROJ-2')], total: 2 })
                    .mockResolvedValueOnce({
                        issues: [
                            {
                                key: 'TEST-9',
                                fields: {
                                    issuelinks: [{ inwardIssue: { key: 'TEST-9' }, outwardIssue: { key: 'PROJ-1' } }],
                                },
                            },
                        ],
                        total: 1,
                    });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                const proj1 = result.items.find((i) => i.issueKey === 'PROJ-1');

                expect(proj1?.hasTest).toBeTruthy();
                expect(proj1?.linkedTestKeys).toContain('TEST-9');
            });

            it('resolve direção inward: quando outwardIssue é o próprio Test, usa inwardIssue', async () => {
                expect.hasAssertions();

                mockSearch.mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 }).mockResolvedValueOnce({
                    issues: [
                        {
                            key: 'TEST-7',
                            fields: {
                                issuelinks: [{ inwardIssue: { key: 'PROJ-1' }, outwardIssue: { key: 'TEST-7' } }],
                            },
                        },
                    ],
                    total: 1,
                });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                expect(result.items.find((i) => i.issueKey === 'PROJ-1')?.linkedTestKeys).toContain('TEST-7');
            });

            it('ignora links do Test que apontam para issues fora do conjunto conhecido', async () => {
                expect.hasAssertions();

                mockSearch.mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 }).mockResolvedValueOnce({
                    issues: [
                        {
                            key: 'TEST-5',
                            fields: {
                                issuelinks: [{ inwardIssue: { key: 'TEST-5' }, outwardIssue: { key: 'UNKNOWN-99' } }],
                            },
                        },
                    ],
                    total: 1,
                });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                expect(result.items.find((i) => i.issueKey === 'PROJ-1')?.hasTest).toBeFalsy();
            });

            it('ignora Test cujo campo issuelinks não é um array', async () => {
                expect.hasAssertions();

                mockSearch.mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 }).mockResolvedValueOnce({
                    issues: [{ key: 'TEST-3', fields: { issuelinks: 'not-an-array' } }],
                    total: 1,
                });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                expect(result.items.find((i) => i.issueKey === 'PROJ-1')?.hasTest).toBeFalsy();
            });

            it('acumula múltiplos Tests vinculados à mesma issue sem duplicar', async () => {
                expect.hasAssertions();

                mockSearch.mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 }).mockResolvedValueOnce({
                    issues: [
                        {
                            key: 'TEST-A',
                            fields: {
                                issuelinks: [{ inwardIssue: { key: 'TEST-A' }, outwardIssue: { key: 'PROJ-1' } }],
                            },
                        },
                        {
                            key: 'TEST-B',
                            fields: {
                                issuelinks: [{ inwardIssue: { key: 'TEST-B' }, outwardIssue: { key: 'PROJ-1' } }],
                            },
                        },
                    ],
                    total: 2,
                });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                const proj1 = result.items.find((i) => i.issueKey === 'PROJ-1');

                expect(proj1?.linkedTestKeys).toContain('TEST-A');
                expect(proj1?.linkedTestKeys).toContain('TEST-B');
            });

            it('ignora link sem chave resolvível (inwardIssue e outwardIssue ausentes)', async () => {
                expect.hasAssertions();

                mockSearch.mockResolvedValueOnce({ issues: [makeIssue('PROJ-1')], total: 1 }).mockResolvedValueOnce({
                    issues: [{ key: 'TEST-Z', fields: { issuelinks: [{ type: { name: 'Test' } }] } }],
                    total: 1,
                });
                const result = await analyzeCoverageGaps(mockJiraResource, 'PROJ');

                expect(result.items.find((i) => i.issueKey === 'PROJ-1')?.hasTest).toBeFalsy();
            });
        });
    });
});
