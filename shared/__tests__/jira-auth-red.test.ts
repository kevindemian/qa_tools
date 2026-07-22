/**
 * RED tests for BUG 1: isAtlassianCloudGateway doesn't detect *.atlassian.net
 *
 * These tests verify the bug exists and that isAtlassianCloud works correctly.
 */
import { describe, it, expect } from 'vitest';
import { isAtlassianCloudGateway, isAtlassianCloud } from '../jira/jira-auth.js';

describe('BUG 1: isAtlassianCloudGateway misses *.atlassian.net', () => {
    it('RED: isAtlassianCloudGateway returns false for *.atlassian.net (the bug)', () => {
        // This test documents the bug - isAtlassianCloudGateway should NOT detect *.atlassian.net
        // because it's specifically for the gateway pattern
        expect(isAtlassianCloudGateway('https://example.atlassian.net/rest/api/2')).toBe(false);
    });

    it('GREEN: isAtlassianCloud detects gateway URLs', () => {
        expect(
            isAtlassianCloud('https://api.atlassian.com/ex/jira/a50cba0f-47dc-432a-a135-a2146d44b907/rest/api/2'),
        ).toBe(true);
    });

    it('GREEN: isAtlassianCloud detects *.atlassian.net URLs', () => {
        expect(isAtlassianCloud('https://example.atlassian.net/rest/api/2')).toBe(true);
    });

    it('GREEN: isAtlassianCloud detects any *.atlassian.net subdomain', () => {
        expect(isAtlassianCloud('https://mycompany.atlassian.net/rest/api/3')).toBe(true);
        expect(isAtlassianCloud('https://jira.atlassian.net')).toBe(true);
    });

    it('GREEN: isAtlassianCloud returns false for non-Cloud URLs', () => {
        expect(isAtlassianCloud('https://jira.corp.cloud.int/rest/api/2')).toBe(false);
        expect(isAtlassianCloud('https://localhost:8080/rest/api/2')).toBe(false);
    });

    it('GREEN: isAtlassianCloud handles invalid URLs gracefully', () => {
        expect(isAtlassianCloud('not-a-url')).toBe(false);
        expect(isAtlassianCloud('')).toBe(false);
    });
});
