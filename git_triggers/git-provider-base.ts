/** Base class for Git provider clients (GitHub/GitLab) — shared API call + error handling. */
import type { JsonObject, DirEntry } from '../shared/types.js';
import { handleError } from '../shared/git-provider-error.js';
import type { createHttpClient } from '../shared/http-client.js';

type HttpClient = ReturnType<typeof createHttpClient>;

export abstract class GitProviderBase {
    /** Default: timing not available. Override in GitHubManager. */
    getWorkflowRunTiming(_runId: number): Promise<{ run_duration_ms: number } | null> {
        return Promise.resolve(null);
    }
    /** Default: file contents not available. Override in provider-specific managers. */
    getFileContents(_path: string, _ref?: string): Promise<string | null> {
        return Promise.resolve(null);
    }
    /** Default: directory listing not available. Override in provider-specific managers. */
    listDirectory(_path: string, _ref?: string): Promise<DirEntry[] | null> {
        return Promise.resolve(null);
    }
    protected abstract client: HttpClient;

    protected async _get<T = JsonObject>(
        url: string,
        opts?: { operation?: string; returnNull?: boolean; params?: JsonObject },
    ): Promise<T | null> {
        try {
            const args = opts?.params ? [{ params: opts.params }] : [];
            const response = await this.client.get<T>(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, {
                context: opts?.operation || url,
                ...(opts?.returnNull ? { returnNull: true as const } : {}),
            });
        }
    }

    protected async _post<T = JsonObject>(url: string, body?: unknown, opts?: { operation?: string }): Promise<T> {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.post<T>(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
    }

    /** Format diff entries with --- a/ +++ b/ patch content. Truncates at truncationLimit. */
    protected _formatDiffResponse(
        entries: Array<Record<string, unknown>> | undefined | null,
        patchField: string,
        nameField: string,
        truncationLimit = 15000,
    ): string {
        if (!entries || !Array.isArray(entries)) return '';
        const lines: string[] = [];
        for (const entry of entries) {
            const entryMap = new Map(Object.entries(entry));
            const patch = entryMap.get(patchField);
            const name = entryMap.get(nameField);
            if (patch && typeof patch === 'string') {
                lines.push('--- a/' + (typeof name === 'string' ? name : ''));
                lines.push('+++ b/' + (typeof name === 'string' ? name : ''));
                lines.push(patch);
            }
        }
        const full = lines.join('\n');
        return full.length > truncationLimit ? full.slice(0, truncationLimit) + '\n... (truncated)' : full;
    }
}
