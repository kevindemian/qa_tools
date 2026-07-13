/**
 * Live connectivity smoke for Jira Cloud via the Atlassian Cloud Gateway.
 *
 * Runs ONLY when JIRA_LIVE_TEST=1 is set. In that mode it explicitly loads the
 * real credentials from .env.local (overriding the hermetic .env.test that vitest
 * normally uses), so it exercises the actual API. Skipped otherwise, so CI uses
 * the hermetic suite and is unaffected.
 *
 * Verifies the full path end-to-end against the real API:
 *   - JIRA_BASE_URL points at the gateway (api.atlassian.com/ex/jira/<cloudId>)
 *   - auth header is `Bearer <JIRA_PERSONAL_TOKEN>` (gateway service-account)
 *   - egress proxy (QA_PROXY_URL) is honored
 *
 * Run (user environment, behind corporate proxy):
 *   JIRA_LIVE_TEST=1 npx vitest run e2e/live-jira-cloud --no-coverage
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import Config from '../shared/config.js';
import JiraClient from '../shared/jira-client.js';
import type { JiraMode } from '../shared/jira-auth.js';

const runLive = process.env['JIRA_LIVE_TEST'] === '1';

if (runLive) {
    loadDotenv({ path: resolve(import.meta.dirname, '..', '.env.local'), override: true });
}

describe('Live Jira Cloud (gateway + Bearer + proxy)', () => {
    let client: JiraClient;

    beforeAll(() => {
        if (!runLive) return;

        const baseUrl = Config.get('jiraBaseUrl');
        const token = Config.get('jiraPersonalToken');
        const mode = Config.get('jiraMode');
        const jiraMode: JiraMode = mode === 'cloud' ? 'cloud' : 'server';

        client = new JiraClient(token, baseUrl + '/rest/api/2', jiraMode);
    });

    it.runIf(runLive)(
        'base URL targets the Atlassian Cloud gateway',
        () => {
            expect.assertions(2);

            const baseUrl = Config.get('jiraBaseUrl');

            expect(baseUrl).toContain('/ex/jira/');
            expect(baseUrl).toContain('api.atlassian.com');
        },
        60000,
    );

    it.runIf(runLive)(
        'authenticates via gateway Bearer and reaches the API through the proxy',
        async () => {
            expect.assertions(2);

            const me = await client.getJiraResource<{ accountId?: string; self?: string }>('myself');

            expect(me).toBeTruthy();
            expect(me.accountId ?? me.self).toBeTruthy();
        },
        60000,
    );
});
