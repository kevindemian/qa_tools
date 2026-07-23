/**
 * RED tests for BUG 5: Cloud pagination without nextPageToken support
 *
 * These tests verify the pagination bug and that nextPageToken is handled correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import { searchJiraIssuesCore } from '../jira-resource-version.js';
import type { JiraResourceLike } from '../jira-resource-types.js';
import { rootLogger } from '../../shared/logger.js';

function createMockResource(
    searchResponses: Array<{ issues: Array<{ key: string; fields: { summary: string } }>; nextPageToken?: string }>,
    isCloud = true,
): JiraResourceLike {
    let callCount = 0;
    return {
        baseUrl: isCloud ? 'https://example.atlassian.net/rest/api/3' : 'https://jira.example.com/rest/api/2',
        jiraMode: isCloud ? 'cloud' : 'server',
        postToApiRoot: isCloud
            ? vi.fn().mockImplementation(() => {
                  const response = searchResponses[callCount] ?? { issues: [] };
                  callCount++;
                  return response;
              })
            : undefined,
        getJiraResource: vi.fn(),
    } as unknown as JiraResourceLike;
}

describe('BUG 5: Cloud pagination infinite loop without nextPageToken', () => {
    it('red: current code loops infinitely when nextpagetoken is not handled', async () => {
        expect.hasAssertions();

        // Mock returns same data with nextPageToken but current code ignores it
        // Use maxResults=1 so pagination continues (1 issue < 1 maxResults would stop)
        const mockResource = createMockResource([
            { issues: [{ key: 'TEST-1', fields: { summary: 'Test 1' } }], nextPageToken: 'token1' },
            { issues: [{ key: 'TEST-2', fields: { summary: 'Test 2' } }], nextPageToken: 'token2' },
            { issues: [{ key: 'TEST-3', fields: { summary: 'Test 3' } }] }, // No nextPageToken = end
        ]);

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 1);

        // With the fix, we should get all 3 issues

        expect(result.issues).toHaveLength(3);
        expect(result.issues.map((i) => i.key)).toStrictEqual(['TEST-1', 'TEST-2', 'TEST-3']);
    });

    it('green: handles empty results gracefully', async () => {
        expect.hasAssertions();

        const mockResource = createMockResource([{ issues: [] }]);

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = EMPTY', 1);

        expect(result.issues).toHaveLength(0);
    });

    it('green: handles single page results', async () => {
        expect.hasAssertions();

        const mockResource = createMockResource([{ issues: [{ key: 'TEST-1', fields: { summary: 'Test 1' } }] }]);

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 1);

        expect(result.issues).toHaveLength(1);

        const firstIssue = result.issues[0];

        expect(firstIssue?.key ?? '').toBe('TEST-1');
    });

    it('green: stops when nextpagetoken is undefined', async () => {
        expect.hasAssertions();

        const mockResource = createMockResource([
            { issues: [{ key: 'TEST-1', fields: { summary: 'Test 1' } }], nextPageToken: 'token1' },
            { issues: [{ key: 'TEST-2', fields: { summary: 'Test 2' } }] },
        ]);

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 1);

        expect(result.issues).toHaveLength(2);
    });
});
