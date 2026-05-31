import type { JsonObject } from '../shared/types';
import { handleError } from '../shared/git-provider-error';
import type { AxiosInstance } from 'axios';

export async function apiGet(
    client: AxiosInstance,
    url: string,
    opts?: { operation?: string; returnNull?: boolean; params?: JsonObject },
) {
    try {
        const args = opts?.params ? [{ params: opts.params }] : [];
        const response = await client.get(url, ...args);
        return response.data;
    } catch (err) {
        return handleError(err, { context: opts?.operation || url, returnNull: opts?.returnNull });
    }
}

export async function apiPost(client: AxiosInstance, url: string, body?: unknown, opts?: { operation?: string }) {
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.post(url, ...args);
        return response.data;
    } catch (err) {
        return handleError(err, { context: opts?.operation || url });
    }
}

export async function apiPatch(client: AxiosInstance, url: string, body?: unknown, opts?: { operation?: string }) {
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.patch(url, ...args);
        return response.data;
    } catch (err) {
        return handleError(err, { context: opts?.operation || url });
    }
}

export function formatDiffResponse(
    entries: Array<Record<string, unknown>> | undefined | null,
    patchField: string,
    nameField: string,
    truncationLimit = 15000,
): string {
    if (!entries || !Array.isArray(entries)) return '';
    const lines: string[] = [];
    for (const entry of entries) {
        const patch = entry[patchField];
        const name = entry[nameField];
        if (patch && typeof patch === 'string') {
            lines.push('--- a/' + (typeof name === 'string' ? name : ''));
            lines.push('+++ b/' + (typeof name === 'string' ? name : ''));
            lines.push(patch);
        }
    }
    const full = lines.join('\n');
    return full.length > truncationLimit ? full.slice(0, truncationLimit) + '\n... (truncated)' : full;
}
