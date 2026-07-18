/** Jira authentication strategy factory.
 *
 *  Encapsulates auth header generation for Jira Server and Cloud.
 *
 *  - server: `Authorization: Bearer <PAT>`
 *  - cloud:  `Authorization: Basic <base64(email:apiToken)>`
 *
 *  Following the same Strategy pattern established by XRAY_MODE
 *  (see `jira_management/xray-client.ts` `createStepImporter`).
 *
 *  Usage:
 *    createJiraAuthHeader(token, mode)
 *    // => { Authorization: 'Bearer <token>' }
 *    // or { Authorization: 'Basic <base64>' }
 */
import { rootLogger } from '../logger.js';

/** Valid Jira operation modes. */
export type JiraMode = 'server' | 'cloud';

/** Authentication header key-value pair. */
export interface AuthHeader extends Record<string, string> {
    Authorization: string;
}

/** Explicit auth scheme override.
 *  - `'auto'` (default): server→Bearer (PAT), cloud→Basic (email:apiToken).
 *  - `'bearer'`: always `Authorization: Bearer <token>`.
 *  - `'basic'`: always `Authorization: Basic <base64(token)>`.
 */
export type AuthScheme = 'auto' | 'bearer' | 'basic';

/** Returns true when the base URL targets the Atlassian Cloud **gateway**
 *  (`api.atlassian.com/ex/jira/<cloudId>/...`), which authenticates with a
 *  service-account `Bearer` token (NOT `email:apiToken` Basic). */
export function isAtlassianCloudGateway(baseUrl: string): boolean {
    try {
        const u = new URL(baseUrl);
        return u.hostname === 'api.atlassian.com' && u.pathname.includes('/ex/jira/');
    } catch {
        return false;
    }
}

/** Compute the Authorization header value based on Jira mode.
 *
 *  @param token - Personal Access Token (server) or email:apiToken (cloud), or a
 *                 service-account Bearer token when `scheme` is `'bearer'`.
 *  @param mode  - `'server'` (default) or `'cloud'`.
 *  @param scheme - Optional explicit scheme override (default `'auto'`).
 *  @returns     - `{ Authorization: '<scheme> <credentials>' }`.
 */
export function createJiraAuthHeader(
    token: string,
    mode: JiraMode = 'server',
    scheme: AuthScheme = 'auto',
): AuthHeader {
    if (scheme === 'bearer') {
        return { Authorization: `Bearer ${token}` };
    }
    if (scheme === 'basic') {
        const encoded = Buffer.from(token).toString('base64');
        return { Authorization: `Basic ${encoded}` };
    }
    if (mode === 'cloud') {
        const encoded = Buffer.from(token).toString('base64');
        rootLogger.debug('Jira Cloud mode: using Basic auth (email:apiToken base64)');
        return { Authorization: `Basic ${encoded}` };
    }
    rootLogger.debug('Jira Server mode: using Bearer auth (PAT)');
    return { Authorization: `Bearer ${token}` };
}
