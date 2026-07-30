/**
 * RED tests for BUG 1: isAtlassianCloudGateway doesn't detect *.atlassian.net
 *
 * These tests verify the bug exists and that the fix uses jiraMode.
 */
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isAtlassianCloudGateway } from '../jira/jira-auth.js';

describe('BUG 1: isAtlassianCloudGateway misses *.atlassian.net', () => {
    it('red: isAtlassianCloudGateway returns false for *.atlassian.net (the bug)', () => {
        expect(isAtlassianCloudGateway('https://example.atlassian.net/rest/api/2')).toBeFalsy();
    });

    it('green: cloud detection uses jiraMode property', () => {
        const content = fs.readFileSync(
            new URL('../../jira_management/jira-resource-version.ts', import.meta.url),
            'utf-8',
        );

        expect(content).toContain("resource.jiraMode === 'cloud'");
    });
});
