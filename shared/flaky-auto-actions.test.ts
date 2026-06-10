import { executeFlakyActions, calculateFlakinessWithWindow } from './flaky-auto-actions.js';
import type { Mock } from 'vitest';
import type { MetricsStore } from './metrics.js';
import type { FlatTest } from './result_parser.js';
import type { SearchIssuesResponse, JiraResourceLike } from './types.js';
import { nonNull } from './test-utils.js';

interface MockJira {
    searchJiraIssues: Mock;
    postJiraResource: Mock;
    getTransitionsForIssue: Mock;
    transitionIssue: Mock;
    getJiraResource: Mock;
    putJiraResource: Mock;
}

function mockJiraResource(captured: { calls: unknown[] }): MockJira {
    const bugStore = new Map<string, { key: string }>();

    return {
        searchJiraIssues: vi.fn().mockImplementation(async (jql: string): Promise<SearchIssuesResponse> => {
            captured.calls.push({ method: 'searchJiraIssues', jql });
            const match = jql.match(/\[Flaky\].*?"?([^"]+)"?/);
            if (!match) return await Promise.resolve({ issues: [], total: 0 });
            const existing: Array<{ key: string; fields: Record<string, unknown> }> = [];
            for (const [key] of bugStore) {
                existing.push({ key, fields: { summary: '[Flaky] ' + match[1], status: { name: 'Open' } } });
            }
            return await Promise.resolve({ issues: existing, total: existing.length });
        }),
        postJiraResource: vi.fn().mockImplementation((_url: string, data: unknown) => {
            captured.calls.push({ method: 'postJiraResource', data });
            const key = 'FLAKY-' + (bugStore.size + 1);
            bugStore.set(key, { key });
            return { key, ...(data as Record<string, unknown>) };
        }),
        getTransitionsForIssue: vi.fn().mockImplementation(() => {
            captured.calls.push({ method: 'getTransitionsForIssue' });
            return { Done: '41', Closed: '31' };
        }),
        transitionIssue: vi.fn().mockImplementation(() => {
            captured.calls.push({ method: 'transitionIssue' });
        }),
        getJiraResource: vi.fn().mockResolvedValue({}),
        putJiraResource: vi.fn().mockResolvedValue(null),
    };
}

function makeStore(
    runs: Array<{
        timestamp: string;
        project: string;
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        tests: FlatTest[];
    }>,
): MetricsStore {
    return { runs };
}

function flakyRun(
    title: string,
    state: 'passed' | 'failed',
): {
    timestamp: string;
    project: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    tests: FlatTest[];
} {
    return {
        timestamp: '2026-01-01T00:00:00.000Z',
        project: 'p',
        total: 1,
        passed: state === 'passed' ? 1 : 0,
        failed: state === 'failed' ? 1 : 0,
        skipped: 0,
        duration: 100,
        tests: [{ title, state, duration: 100 }],
    };
}

function asMockJira(m: MockJira): JiraResourceLike {
    return m;
}

describe('calculateFlakinessWithWindow', () => {
    it('respects window size', () => {
        const tests: FlatTest[] = Array.from({ length: 30 }, (_, i) => ({
            title: 'FlakyTest',
            state: i % 2 === 0 ? 'failed' : 'passed',
            duration: 100,
        }));
        const runs = Array.from({ length: 30 }, (_, i) => ({
            timestamp: '2026-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z',
            project: 'p',
            total: 1,
            passed: i % 2,
            failed: i % 2 === 0 ? 1 : 0,
            skipped: 0,
            duration: 0,
            tests: [nonNull(tests[i])],
        }));
        const store = makeStore(runs);

        const allWindow = calculateFlakinessWithWindow(store, { windowSize: 30, minRuns: 5 });
        expect(allWindow.length).toBeGreaterThan(0);

        const smallWindow = calculateFlakinessWithWindow(store, { windowSize: 2, minRuns: 2 });
        if (smallWindow.length > 0) {
            expect(nonNull(smallWindow[0]).totalRuns).toBeLessThanOrEqual(2);
        }
    });

    it('filters by minRuns', () => {
        const minRunsTests: FlatTest[] = Array.from({ length: 3 }, (_, i) => ({
            title: 'MinRunTest',
            state: i % 2 === 0 ? 'failed' : 'passed',
            duration: 100,
        }));
        const runs = Array.from({ length: 3 }, (_, i) => ({
            timestamp: '2026-01-0' + (i + 1) + 'T00:00:00.000Z',
            project: 'p',
            total: 1,
            passed: i % 2,
            failed: i % 2 === 0 ? 1 : 0,
            skipped: 0,
            duration: 0,
            tests: [nonNull(minRunsTests[i])],
        }));
        const store = makeStore(runs);

        const withMin10 = calculateFlakinessWithWindow(store, { minRuns: 10 });
        expect(withMin10).toHaveLength(0);

        const withMin2 = calculateFlakinessWithWindow(store, { minRuns: 2 });
        expect(withMin2.length).toBeGreaterThan(0);
    });

    it('counts skipped tests', () => {
        const tests: FlatTest[] = [
            { title: 'Skippy', state: 'passed', duration: 100 },
            { title: 'Skippy', state: 'failed', duration: 100 },
            { title: 'Skippy', state: 'skipped', duration: 0 },
        ];
        const store = makeStore([
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'p',
                total: 3,
                passed: 1,
                failed: 1,
                skipped: 1,
                duration: 200,
                tests,
            },
        ]);
        const result = calculateFlakinessWithWindow(store, { minRuns: 1 });
        expect(result).toHaveLength(1);
        expect(nonNull(result[0]).skipCount).toBe(1);
        expect(nonNull(result[0]).passCount).toBe(1);
        expect(nonNull(result[0]).failCount).toBe(1);
    });
});

describe('executeFlakyActions', () => {
    let captured: { calls: unknown[] };
    let jira: MockJira;

    beforeEach(() => {
        captured = { calls: [] };
        jira = mockJiraResource(captured);
    });

    it('creates bug for flaky test above threshold', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('LoginTest', i % 2 === 0 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
        });
        expect(actions.filter((a) => a.action === 'create_bug')).toHaveLength(1);
        expect(nonNull(actions[0]).jiraBugKey).toBeTruthy();
    });

    it('does nothing for flaky test below threshold', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('StableTest', i < 2 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            threshold: 0.5,
            autoCreateBug: true,
            minTotalRuns: 5,
        });
        expect(actions.filter((a) => a.action === 'create_bug')).toHaveLength(0);
    });

    it('skips when bug already exists (dedup)', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('DupTest', i % 2 === 0 ? 'failed' : 'passed'));
        await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
        });
        const secondRun = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
        });
        expect(secondRun.filter((a) => a.action === 'none')).toHaveLength(1);
    });

    it('does not create bug when autoCreateBug is false', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('FlagTest', i % 2 === 0 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: false,
            minTotalRuns: 5,
        });
        expect(actions.filter((a) => a.action === 'create_bug')).toHaveLength(0);
        expect(actions.filter((a) => a.action === 'flag_in_report')).toHaveLength(1);
    });

    it('skips tests with insufficient runs', async () => {
        const runs = Array.from({ length: 3 }, (_, i) => flakyRun('ShortTest', i % 2 === 0 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 10,
        });
        expect(actions).toHaveLength(0);
    });

    it('reenables previously flaky test now below threshold', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('HealedTest', i % 2 === 0 ? 'failed' : 'passed'));
        await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
            threshold: 0.1,
        });
        const stableRuns = Array.from({ length: 15 }, () => flakyRun('HealedTest', 'passed'));
        const secondActions = await executeFlakyActions(makeStore(stableRuns), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
            threshold: 0.1,
        });
        expect(secondActions.filter((a) => a.action === 'reenable')).toHaveLength(1);
    });

    it('throws on Jira API failure when creating a bug', async () => {
        const errJira = mockJiraResource(captured);
        errJira.postJiraResource = vi.fn().mockRejectedValue(new Error('API timeout'));
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('ErrTest', i % 2 === 0 ? 'failed' : 'passed'));
        await expect(
            executeFlakyActions(makeStore(runs), asMockJira(errJira), 'PROJ', {
                autoCreateBug: true,
                minTotalRuns: 5,
            }),
        ).rejects.toThrow('API timeout');
    });

    it('creates bug with correct payload format', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('FmtTest', i % 2 === 0 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
        });
        expect(actions).toHaveLength(1);
        expect(nonNull(actions[0]).action).toBe('create_bug');
        expect(nonNull(actions[0]).jiraBugKey).toBe('FLAKY-1');
        expect(nonNull(actions[0]).flakyRate).toBeGreaterThan(0);
        expect(nonNull(actions[0]).totalRuns).toBe(15);

        const postCall = captured.calls.find(
            (c: unknown) => (c as { method: string }).method === 'postJiraResource',
        ) as
            | {
                  method: string;
                  data: {
                      fields: {
                          project: { key: string };
                          summary: string;
                          issuetype: { name: string };
                          labels: string[];
                          priority: { name: string };
                      };
                  };
              }
            | undefined;
        expect(postCall).toBeTruthy();
        expect(nonNull(postCall).data.fields.project.key).toBe('PROJ');
        expect(nonNull(postCall).data.fields.summary).toContain('[Flaky]');
        expect(nonNull(postCall).data.fields.issuetype.name).toBe('Bug');
        expect(nonNull(postCall).data.fields.labels).toContain('flaky');
        expect(nonNull(postCall).data.fields.labels).toContain('auto-generated');
        expect(nonNull(postCall).data.fields.priority.name).toBe('Medium');
    });

    it('handles search failure gracefully when checking for re-enable', async () => {
        jira.searchJiraIssues = vi.fn().mockRejectedValue(new Error('Jira search failed'));
        const runs = Array.from({ length: 15 }, () => flakyRun('SearchFail', 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            threshold: 0.5,
            minTotalRuns: 5,
        });
        expect(actions).toHaveLength(0);
    });

    it('handles search failure gracefully during dedup check', async () => {
        jira.searchJiraIssues = vi.fn().mockRejectedValue(new Error('Jira search failed'));
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('DedupFail', i % 2 === 0 ? 'failed' : 'passed'));
        const actions = await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            threshold: 0.1,
            autoCreateBug: false,
            minTotalRuns: 5,
        });
        expect(actions).toHaveLength(1);
        expect(nonNull(actions[0]).action).toBe('flag_in_report');
    });

    it('throws when reenableTest fails due to transition fetch error', async () => {
        const runs = Array.from({ length: 15 }, (_, i) => flakyRun('ReenableFail', i % 2 === 0 ? 'failed' : 'passed'));
        await executeFlakyActions(makeStore(runs), asMockJira(jira), 'PROJ', {
            autoCreateBug: true,
            minTotalRuns: 5,
            threshold: 0.1,
        });
        jira.getTransitionsForIssue = vi.fn().mockRejectedValue(new Error('Transition error'));
        const stableRuns = Array.from({ length: 15 }, () => flakyRun('ReenableFail', 'passed'));
        await expect(
            executeFlakyActions(makeStore(stableRuns), asMockJira(jira), 'PROJ', {
                autoCreateBug: true,
                minTotalRuns: 5,
                threshold: 0.1,
            }),
        ).rejects.toThrow('Transition error');
    });
});
