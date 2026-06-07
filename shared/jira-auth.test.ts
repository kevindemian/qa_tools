import { createJiraAuthHeader } from './jira-auth.js';

describe('createJiraAuthHeader', () => {
    const SERVER_TOKEN = 'pat-12345';
    const CLOUD_CRED = 'user@example.com:APITOKEN123';
    const CLOUD_BASE64 = Buffer.from(CLOUD_CRED).toString('base64');

    describe('server mode', () => {
        it('returns Bearer auth header', async () => {
            const result = createJiraAuthHeader(SERVER_TOKEN, 'server');
            expect(result).toEqual({ Authorization: `Bearer ${SERVER_TOKEN}` });
        });

        it('preserves the token as-is in the header', async () => {
            const result = createJiraAuthHeader(SERVER_TOKEN, 'server');
            expect(result.Authorization).toBe(`Bearer ${SERVER_TOKEN}`);
        });
    });

    describe('cloud mode', () => {
        it('returns Basic auth header with base64-encoded credentials', async () => {
            const result = createJiraAuthHeader(CLOUD_CRED, 'cloud');
            expect(result).toEqual({ Authorization: `Basic ${CLOUD_BASE64}` });
        });

        it('produces a valid base64 string', async () => {
            const result = createJiraAuthHeader(CLOUD_CRED, 'cloud');
            const decoded = Buffer.from(result.Authorization.slice(6), 'base64').toString('utf-8');
            expect(decoded).toBe(CLOUD_CRED);
        });
    });

    describe('default behavior', () => {
        it('defaults to server mode when called without mode', async () => {
            const result = createJiraAuthHeader(SERVER_TOKEN);
            expect(result).toEqual({ Authorization: `Bearer ${SERVER_TOKEN}` });
        });

        it('produces distinct headers for server vs cloud with same token', async () => {
            const serverHeader = createJiraAuthHeader(CLOUD_CRED, 'server');
            const cloudHeader = createJiraAuthHeader(CLOUD_CRED, 'cloud');
            expect(serverHeader.Authorization).not.toBe(cloudHeader.Authorization);
        });
    });
});
