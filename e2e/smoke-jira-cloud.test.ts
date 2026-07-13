/**
 * Smoke test for JIRA_MODE=cloud — only runs when the env var is set.
 * Verifies that Jira Cloud auth (Basic base64) flows correctly through
 * the config schema, auth factory, JiraClient, and entry points.
 *
 * Run: JIRA_MODE=cloud npx vitest run e2e/smoke-jira-cloud --no-coverage
 */

import Config from '../shared/config.js';
import { createJiraAuthHeader, isAtlassianCloudGateway } from '../shared/jira-auth.js';
import type JiraClientType from '../shared/jira-client.js';
import { CONFIG_SCHEMA } from '../shared/config-schema.js';
import { resolveProxyUrl } from '../shared/proxy-config.js';

const mockCreateHttpClient = vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('../shared/http-client', () => ({
    createHttpClient: mockCreateHttpClient,
}));

vi.mock('../shared/prompt', async () => {
    const actual = await vi.importActual<typeof import('../shared/prompt.js')>('../shared/prompt');
    return {
        ...actual,
        prompt: vi.fn().mockReturnValue(''),
        confirm: vi.fn().mockReturnValue(true),
        ask: vi.fn().mockResolvedValue(''),
        askConfirm: vi.fn().mockResolvedValue(true),
    };
});

let JiraClient: typeof JiraClientType;

describe('Smoke Jira Cloud', () => {
    beforeAll(async () => {
        JiraClient = (await vi.importActual<typeof import('../shared/jira-client.js')>('../shared/jira-client'))
            .default;
    });

    describe('Smoke-jira-cloud', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('config.get("jiraMode") returns "cloud"', () => {
            expect(Config.get('jiraMode')).toBe('cloud');
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')(
            'createJiraAuthHeader produces Basic auth for cloud mode',
            () => {
                const cred = 'user@example.com:APITOKEN123';
                const header = createJiraAuthHeader(cred, 'cloud');

                expect(header.Authorization).toMatch(/^Basic /);

                const decoded = Buffer.from(header.Authorization.slice(6), 'base64').toString('utf-8');

                expect(decoded).toBe(cred);
            },
        );

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('jiraClient uses Basic auth when mode is cloud', () => {
            const client = new JiraClient(
                'user@example.com:APITOKEN123',
                'https://example.atlassian.net/rest/api/2',
                'cloud',
            );

            expect(client.jiraMode).toBe('cloud');
            expect(mockCreateHttpClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    authHeader: { Authorization: expect.stringMatching(/^Basic /) as string },
                }),
            );
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('jiraClient defaults to server mode without mode param', () => {
            const client = new JiraClient('pat-123', 'https://jira.example.com/rest/api/2');

            expect(client.jiraMode).toBe('server');
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('config-schema defaults jiraMode to server', () => {
            const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraMode');

            expect(f?.defaultVal).toBe('server');
            expect(f?.description).toMatch(/server.*cloud/i);
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('detects Atlassian Cloud gateway URL', () => {
            expect(isAtlassianCloudGateway('https://api.atlassian.com/ex/jira/abc123/rest/api/2')).toBeTruthy();
            expect(isAtlassianCloudGateway('https://example.atlassian.net/rest/api/2')).toBeFalsy();
            expect(isAtlassianCloudGateway('https://jira.corp.cloud.int/rest/api/2')).toBeFalsy();
        });

        it.runIf(process.env['JIRA_MODE'] === 'cloud')(
            'createJiraAuthHeader produces Bearer auth for gateway service-account scheme',
            () => {
                const header = createJiraAuthHeader('svc-account-token', 'cloud', 'bearer');

                expect(header.Authorization).toMatch(/^Bearer /);
                expect(header.Authorization).toBe('Bearer svc-account-token');
            },
        );

        it.runIf(process.env['JIRA_MODE'] === 'cloud')('resolves egress proxy from HTTPS_PROXY config', () => {
            const saved: Record<string, string | undefined> = {
                QA_PROXY_URL: process.env['QA_PROXY_URL'],
                HTTPS_PROXY: process.env['HTTPS_PROXY'],
                HTTP_PROXY: process.env['HTTP_PROXY'],
                https_proxy: process.env['https_proxy'],
                http_proxy: process.env['http_proxy'],
            };
            process.env['HTTPS_PROXY'] = 'https://corp-proxy.internal:8080';
            delete process.env['HTTP_PROXY'];
            delete process.env['https_proxy'];
            delete process.env['http_proxy'];
            delete process.env['QA_PROXY_URL'];
            try {
                expect(resolveProxyUrl()).toBe('https://corp-proxy.internal:8080');
            } finally {
                for (const key of Object.keys(saved)) {
                    const value = saved[key];
                    if (value === undefined) delete process.env[key];
                    else process.env[key] = value;
                }
            }
        });
    });
});
