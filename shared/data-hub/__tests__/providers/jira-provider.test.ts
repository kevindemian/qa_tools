/**
 * Unit tests for Jira Data Provider.
 *
 * Tests the adapter that converts JiraResourceLike to DataProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraDataProvider } from '../../providers/jira-provider.js';
import type { JiraResourceLike } from '../../../types/jira.js';

/* ── Mock JiraResourceLike ─────────────────────────────────────────────── */

function createMockJira(): { mock: JiraResourceLike; searchMock: ReturnType<typeof vi.fn> } {
    const searchMock = vi.fn();
    return {
        mock: {
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            searchJiraIssues: searchMock,
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
        },
        searchMock,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('JiraDataProvider', () => {
    let mockJira: JiraResourceLike;
    let provider: JiraDataProvider;
    let searchJiraIssuesMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        const created = createMockJira();
        mockJira = created.mock;
        searchJiraIssuesMock = created.searchMock;
        provider = new JiraDataProvider(mockJira, 'TEST');
    });

    it('has correct name and source', () => {
        expect.hasAssertions();
        expect(provider.name).toBe('jira');
        expect(provider.source).toBe('jira');
    });

    it('fetches issues from Jira and maps to RawJiraIssue', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test issue',
                        status: { name: 'Done' },
                        issuetype: { name: 'Bug' },
                        labels: ['critical'],
                    },
                },
                {
                    key: 'TEST-2',
                    fields: {
                        summary: 'Another issue',
                        status: { name: 'In Progress' },
                        issuetype: { name: 'Story' },
                        labels: [],
                    },
                },
            ],
            total: 2,
        });

        const result = await provider.fetchRawData({ repo: 'TEST', count: 10 });

        expect(result.jiraIssues).toHaveLength(2);

        const issues = result.jiraIssues;
        const firstIssue = issues?.[0];

        expect(firstIssue).toBeDefined();
        expect(firstIssue?.key).toBe('TEST-1');
        expect(firstIssue?.summary).toBe('Test issue');
        expect(firstIssue?.status).toBe('Done');
        expect(firstIssue?.type).toBe('Bug');
        expect(firstIssue?.labels).toStrictEqual(['critical']);

        expect(searchJiraIssuesMock).toHaveBeenCalledWith('project = "TEST" ORDER BY created DESC', 10);
    });

    it('returns empty jiraIssues when no issues found', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [],
            total: 0,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });

        expect(result.jiraIssues).toHaveLength(0);
    });

    it('returns empty runs and maps', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [],
            total: 0,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
        expect(result.artifacts.size).toBe(0);
        expect(result.failureReasons.size).toBe(0);
    });

    it('maps created field from fields.created', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test',
                        status: { name: 'Open' },
                        issuetype: { name: 'Bug' },
                        created: '2026-01-15T10:30:00.000+0000',
                    },
                },
            ],
            total: 1,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });
        const issues = result.jiraIssues;
        const issue = issues?.[0];

        expect(issue?.created).toBe('2026-01-15T10:30:00.000+0000');
    });

    it('maps updated field from fields.updated', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test',
                        status: { name: 'Open' },
                        issuetype: { name: 'Bug' },
                        updated: '2026-06-20T14:00:00.000+0000',
                    },
                },
            ],
            total: 1,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });
        const issues = result.jiraIssues;
        const issue = issues?.[0];

        expect(issue?.updated).toBe('2026-06-20T14:00:00.000+0000');
    });

    it('maps resolution field from fields.resolution.name', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test',
                        status: { name: 'Done' },
                        issuetype: { name: 'Bug' },
                        resolution: { name: 'Fixed' },
                    },
                },
            ],
            total: 1,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });
        const issues = result.jiraIssues;
        const issue = issues?.[0];

        expect(issue?.resolution).toBe('Fixed');
    });

    it('maps resolution as undefined when fields.resolution is absent', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test',
                        status: { name: 'Open' },
                        issuetype: { name: 'Bug' },
                    },
                },
            ],
            total: 1,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });
        const issues = result.jiraIssues;
        const issue = issues?.[0];

        expect(issue?.resolution).toBeUndefined();
    });

    it('defaults created/updated to empty string when fields are not strings', async () => {
        expect.hasAssertions();

        vi.mocked(mockJira).searchJiraIssues.mockResolvedValue({
            issues: [
                {
                    key: 'TEST-1',
                    fields: {
                        summary: 'Test',
                        status: { name: 'Open' },
                        issuetype: { name: 'Bug' },
                        created: 12345,
                        updated: null,
                    },
                },
            ],
            total: 1,
        });

        const result = await provider.fetchRawData({ repo: 'TEST' });
        const issues = result.jiraIssues;
        const issue = issues?.[0];

        expect(issue?.created).toBe('');
        expect(issue?.updated).toBe('');
    });
});
