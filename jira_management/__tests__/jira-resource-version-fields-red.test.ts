/**
 * RED tests for BUG 11: API /rest/api/3/search/jql doesn't return key/fields
 *
 * These tests verify that the Cloud API returns issues with key and fields.summary
 * when fields: ['summary'] is included in the POST body.
 */
import { describe, it, expect, vi } from 'vitest';
import { searchJiraIssuesCore } from '../jira-resource-version.js';
import type { JiraResourceLike } from '../jira-resource-types.js';
import { rootLogger } from '../../shared/logger.js';

describe('BUG 11: Cloud API missing fields[] in POST body', () => {
    it('red: cloud api returns issues with key and fields.summary', async () => {
        expect.hasAssertions();

        let capturedBody: Record<string, unknown> = {};
        const mockResource: JiraResourceLike = {
            baseUrl: 'https://example.atlassian.net/rest/api/3',
            jiraMode: 'cloud',
            postToApiRoot: vi.fn().mockImplementation((_url: string, body: Record<string, unknown>) => {
                capturedBody = body;
                return {
                    issues: [{ key: 'TEST-1', fields: { summary: 'Test Issue' } }],
                    isLast: true,
                };
            }),
            getJiraResource: vi.fn(),
        } as unknown as JiraResourceLike;

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 10);

        // Verify the POST body includes fields: ['summary']
        expect(capturedBody['fields']).toStrictEqual(['summary']);

        // Verify the result has key and fields.summary
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.key).toBe('TEST-1');
        expect((result.issues[0] as { fields: Record<string, unknown> }).fields['summary']).toBe('Test Issue');
    });

    it('green: handles missing fields gracefully', async () => {
        expect.hasAssertions();

        const mockResource: JiraResourceLike = {
            baseUrl: 'https://example.atlassian.net/rest/api/3',
            jiraMode: 'cloud',
            postToApiRoot: vi.fn().mockResolvedValue({
                issues: [{ key: 'TEST-1', fields: {} }],
                isLast: true,
            }),
            getJiraResource: vi.fn(),
        } as unknown as JiraResourceLike;

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 10);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.key).toBe('TEST-1');
    });

    it('green: handles null fields gracefully', async () => {
        expect.hasAssertions();

        const mockResource: JiraResourceLike = {
            baseUrl: 'https://example.atlassian.net/rest/api/3',
            jiraMode: 'cloud',
            postToApiRoot: vi.fn().mockResolvedValue({
                issues: [{ key: 'TEST-1', fields: null }],
                isLast: true,
            }),
            getJiraResource: vi.fn(),
        } as unknown as JiraResourceLike;

        const result = await searchJiraIssuesCore(mockResource, rootLogger, 'project = TEST', 10);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.key).toBe('TEST-1');
    });
});
