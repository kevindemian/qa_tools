import { describe, it, expect } from 'vitest';
import { createJiraAuthHeader, isAtlassianCloudGateway } from '../jira-auth.js';

describe('CreateJiraAuthHeader', () => {
    it('server mode defaults to Bearer (PAT)', () => {
        const h = createJiraAuthHeader('pat-123', 'server');

        expect(h.Authorization).toBe('Bearer pat-123');
    });

    it('cloud mode defaults to Basic (email:apiToken)', () => {
        const h = createJiraAuthHeader('user@x.com:token', 'cloud');

        expect(h.Authorization).toMatch(/^Basic /);

        const decoded = Buffer.from(h.Authorization.slice(6), 'base64').toString('utf-8');

        expect(decoded).toBe('user@x.com:token');
    });

    it('scheme "bearer" forces Bearer regardless of mode', () => {
        const h = createJiraAuthHeader('svc-token', 'cloud', 'bearer');

        expect(h.Authorization).toBe('Bearer svc-token');
    });

    it('scheme "basic" forces Basic regardless of mode', () => {
        const h = createJiraAuthHeader('pat-123', 'server', 'basic');

        expect(h.Authorization).toMatch(/^Basic /);
    });

    it('gateway (Bearer) token is not base64-encoded', () => {
        const h = createJiraAuthHeader('raw-service-token', 'cloud', 'bearer');

        expect(h.Authorization).toBe('Bearer raw-service-token');
    });
});

describe('IsAtlassianCloudGateway', () => {
    it('detects the api.atlassian.com/ex/jira/<cloudId> gateway', () => {
        expect(
            isAtlassianCloudGateway(
                'https://api.atlassian.com/ex/jira/a50cba0f-47dc-432a-a135-a2146d44b907/rest/api/2',
            ),
        ).toBeTruthy();
    });

    it('returns false for a corporate Cloud hostname', () => {
        expect(isAtlassianCloudGateway('https://jira.corp.cloud.int/rest/api/2')).toBeFalsy();
    });

    it('returns false for a standard atlassian.net site', () => {
        expect(isAtlassianCloudGateway('https://example.atlassian.net/rest/api/2')).toBeFalsy();
    });

    it('returns false for invalid URL', () => {
        expect(isAtlassianCloudGateway('not-a-url')).toBeFalsy();
    });
});
