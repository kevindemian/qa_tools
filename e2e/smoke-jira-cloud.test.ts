/**
 * Smoke test for JIRA_MODE=cloud — only runs when the env var is set.
 * Verifies that Jira Cloud auth (Basic base64) flows correctly through
 * the config schema, auth factory, JiraClient, and entry points.
 *
 * Run: JIRA_MODE=cloud npx jest e2e/smoke-jira-cloud --no-coverage
 */

import Config from '../shared/config';
import { createJiraAuthHeader } from '../shared/jira-auth';
import type JiraClientType from '../shared/jira-client';
import { CONFIG_SCHEMA } from '../shared/config-schema';

const runSmoke = process.env.JIRA_MODE === 'cloud';

const mockCreateHttpClient = jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
}));

jest.mock('../shared/http-client', () => ({
    createHttpClient: mockCreateHttpClient,
}));

jest.mock('../shared/prompt', () => {
    const actual = jest.requireActual<typeof import('../shared/prompt')>('../shared/prompt');
    return {
        ...actual,
        prompt: jest.fn().mockReturnValue(''),
        confirm: jest.fn().mockReturnValue(true),
        ask: jest.fn().mockResolvedValue(''),
        askConfirm: jest.fn().mockResolvedValue(true),
    };
});

if (!runSmoke) {
    describe.skip('smoke-jira-cloud', () => {
        it('skipped — set JIRA_MODE=cloud to run', () => {});
    });
} else {
    const JiraClient: typeof JiraClientType = (
        jest.requireActual('../shared/jira-client') as { default: typeof JiraClientType }
    ).default;

    describe('smoke-jira-cloud', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('Config.get("jiraMode") returns "cloud"', () => {
            expect(Config.get('jiraMode')).toBe('cloud');
        });

        it('createJiraAuthHeader produces Basic auth for cloud mode', () => {
            const cred = 'user@example.com:APITOKEN123';
            const header = createJiraAuthHeader(cred, 'cloud');
            expect(header.Authorization).toMatch(/^Basic /);
            const decoded = Buffer.from(header.Authorization.slice(6), 'base64').toString('utf-8');
            expect(decoded).toBe(cred);
        });

        it('JiraClient uses Basic auth when mode is cloud', () => {
            const client = new JiraClient(
                'user@example.com:APITOKEN123',
                'https://example.atlassian.net/rest/api/2',
                'cloud',
            );
            expect(client.jiraMode).toBe('cloud');
            expect(mockCreateHttpClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    authHeader: { Authorization: expect.stringMatching(/^Basic /) },
                }),
            );
        });

        it('JiraClient defaults to server mode without mode param', () => {
            const client = new JiraClient('pat-123', 'https://jira.example.com/rest/api/2');
            expect(client.jiraMode).toBe('server');
        });

        it('config-schema defaults jiraMode to server', () => {
            const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraMode');
            expect(f?.defaultVal).toBe('server');
            expect(f?.description).toMatch(/server.*cloud/i);
        });
    });
}
