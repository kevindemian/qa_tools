/**
 * Live connectivity smoke for Jira Cloud.
 *
 * Runs ONLY when JIRA_LIVE_TEST=1 is set. In that mode it explicitly loads the
 * real credentials from .env.local (overriding the hermetic .env.test that vitest
 * normally uses), so it exercises the actual API. Skipped otherwise, so CI uses
 * the hermetic suite and is unaffected.
 *
 * Verifies the full path end-to-end against the real API:
 *   - JIRA_BASE_URL points at a Jira Cloud site: either the Atlassian Cloud
 *     Gateway `api.atlassian.com/ex/jira/<cloudId>` OR a direct
 *     `*.atlassian.net` / `*.atlassian.com` site.
 *   - auth is honored. The VALIDATED path for API-token auth is Cloud Basic
 *     `Basic base64(email:apiToken)`. The Cloud Gateway `/ex/jira/<cloudId>`
 *     REQUIRES an OAuth 2.0 (3LO) access token and REJECTS API tokens with 401
 *     ("Client must be authenticated"), so it is NOT usable with an API token.
 *   - egress proxy (HTTPS_PROXY / QA_PROXY_URL) is honored.
 *
 * Run (user environment, behind corporate proxy):
 *   HTTPS_PROXY=http://127.0.0.1:9000 JIRA_LIVE_TEST=1 npx vitest run e2e/live-jira-cloud --no-coverage
 *
 * NOTE: behind Zscaler the TLS-intercepting CA must be trusted — `shared/tls.ts`
 * appends `shared_docker/zscaler.crt` to Node's CA bundle. Without it requests
 * fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
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

describe('Live Jira Cloud connectivity (Basic auth + proxy)', () => {
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
        'base URL targets a Jira Cloud site',
        () => {
            expect.assertions(1);

            const baseUrl = Config.get('jiraBaseUrl');

            // Cloud Gateway (OAuth 3LO) OR direct Cloud site (API-token Basic).
            expect(baseUrl).toMatch(/\/ex\/jira\/|atlassian\.(net|com)/);
        },
        60000,
    );

    it.runIf(runLive)(
        'authenticates via Cloud Basic and reaches the API through the proxy',
        async () => {
            expect.assertions(2);

            const me = await client.getJiraResource<{ accountId?: string; self?: string }>('myself');

            expect(me).toBeTruthy();
            expect(me.accountId ?? me.self).toBeTruthy();
        },
        60000,
    );
});
