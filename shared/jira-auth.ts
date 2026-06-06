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
import { rootLogger } from './logger.js';

/** Valid Jira operation modes. */
export type JiraMode = 'server' | 'cloud';

/** Authentication header key-value pair. */
export interface AuthHeader extends Record<string, string> {
    Authorization: string;
}

/** Compute the Authorization header value based on Jira mode.
 *
 *  @param token - Personal Access Token (server) or email:apiToken (cloud).
 *  @param mode  - `'server'` (default) or `'cloud'`.
 *  @returns     - `{ Authorization: '<scheme> <credentials>' }`.
 *  @throws      - If mode is invalid.
 */
export function createJiraAuthHeader(token: string, mode: string): AuthHeader {
    if (mode === 'cloud') {
        const encoded = Buffer.from(token).toString('base64');
        rootLogger.debug('Jira Cloud mode: using Basic auth (email:apiToken base64)');
        return { Authorization: `Basic ${encoded}` };
    }
    rootLogger.debug('Jira Server mode: using Bearer auth (PAT)');
    return { Authorization: `Bearer ${token}` };
}
