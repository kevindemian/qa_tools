/**
 * Unit tests — JiraDataProvider deep extraction (PM-1).
 * Verifies that mapIssue extracts the full issue shape, not just the summary.
 */
import { describe, it, expect, vi } from 'vitest';
import { JiraDataProvider } from '../providers/jira-provider.js';
import type { JiraResourceLike, SearchIssuesResponse } from '../../types/jira.js';

function createMockJira(): JiraResourceLike {
    const response: SearchIssuesResponse = {
        total: 1,
        issues: [
            {
                key: 'CALC-10',
                fields: {
                    summary: 'Deep issue',
                    status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
                    priority: { name: 'High' },
                    issuetype: { name: 'Bug' },
                    labels: ['qa', 'x'],
                    created: '2026-01-01T00:00:00Z',
                    updated: '2026-02-01T00:00:00Z',
                    resolution: { name: 'Done' },
                    resolutiondate: '2026-02-02T00:00:00Z',
                    assignee: { displayName: 'Alice' },
                    reporter: { displayName: 'Bob' },
                    components: [{ name: 'Backend' }, { name: 'API' }],
                    fixVersions: [{ name: 'v1.0' }],
                    sprint: [{ name: 'Sprint 5' }],
                    customfield_10002: 5,
                    parent: { key: 'CALC-1' },
                },
            },
        ],
    };
    return {
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn(),
        putJiraResource: vi.fn(),
        searchJiraIssues: vi
            .fn((_jql: string, _maxResults?: number) => Promise.resolve(response))
            .mockResolvedValue(response),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
    };
}

describe('JiraDataProvider — deep extraction', () => {
    it('maps scalar identity fields from JiraIssue', async () => {
        expect.hasAssertions();

        const provider = new JiraDataProvider(createMockJira(), 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });
        const issue = raw.jiraIssues?.[0];

        expect(issue?.key).toBe('CALC-10');
        expect(issue?.priority).toBe('High');
        expect(issue?.assignee).toBe('Alice');
        expect(issue?.reporter).toBe('Bob');
        expect(issue?.parentKey).toBe('CALC-1');
    });

    it('maps scalar metric fields from JiraIssue', async () => {
        expect.hasAssertions();

        const provider = new JiraDataProvider(createMockJira(), 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });
        const issue = raw.jiraIssues?.[0];

        expect(issue?.sprint).toBe('Sprint 5');
        expect(issue?.storyPoints).toBe(5);
        expect(issue?.statusCategory).toBe('In Progress');
        expect(issue?.resolution).toBe('Done');
        expect(issue?.resolutionDate).toBe('2026-02-02T00:00:00Z');
    });

    it('maps collection fields from JiraIssue', async () => {
        expect.hasAssertions();

        const provider = new JiraDataProvider(createMockJira(), 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });
        const issue = raw.jiraIssues?.[0];

        expect(issue?.components).toStrictEqual(['Backend', 'API']);
        expect(issue?.fixVersions).toStrictEqual(['v1.0']);
    });

    it('returns empty array when search yields no issues', async () => {
        expect.hasAssertions();

        const mock = createMockJira();
        (mock.searchJiraIssues as ReturnType<typeof vi.fn>).mockResolvedValue({ total: 0, issues: [] });
        const provider = new JiraDataProvider(mock, 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });

        expect(raw.jiraIssues).toStrictEqual([]);
    });
});
