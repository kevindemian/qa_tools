/** Base class for Git provider clients (GitHub/GitLab) — shared API call + error handling. */
import type { JsonObject } from '../shared/types';
import { handleError } from '../shared/git-provider-error';
import type { createHttpClient } from '../shared/http-client';

type HttpClient = ReturnType<typeof createHttpClient>;

export abstract class GitProviderBase {
    protected abstract client: HttpClient;

    protected async _get(url: string, opts?: { operation?: string; returnNull?: boolean; params?: JsonObject }) {
        try {
            const args = opts?.params ? [{ params: opts.params }] : [];
            const response = await this.client.get(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url, returnNull: opts?.returnNull });
        }
    }

    protected async _post(url: string, body?: unknown, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.post(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
    }
}
