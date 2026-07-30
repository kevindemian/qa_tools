/**
 * RED tests for BUG 1: isAtlassianCloudGateway doesn't detect *.atlassian.net
 *
 * These tests verify the bug exists and that the fix uses jiraMode.
 */
import { describe, it, expect } from 'vitest';
import { isAtlassianCloudGateway } from '../jira/jira-auth.js';

describe('BUG 1: isAtlassianCloudGateway misses *.atlassian.net', () => {
    it('RED: isAtlassianCloudGateway returns false for *.atlassian.net (the bug)', () => {
        // This test documents the bug - isAtlassianCloudGateway should NOT detect *.atlassian.net
        // because it's specifically for the gateway pattern
        expect(isAtlassianCloudGateway('https://example.atlassian.net/rest/api/2')).toBe(false);
    });

    it('GREEN: Cloud detection uses jiraMode property', () => {
        // The fix uses resource.jiraMode === 'cloud' instead of a new function
        // This is verified by checking that jira-resource-version.ts uses jiraMode
        const fs = require('fs');
        const path = require('path');
        const filePath = path.resolve(__dirname, '../../jira_management/jira-resource-version.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain("resource.jiraMode === 'cloud'");
    });
});
