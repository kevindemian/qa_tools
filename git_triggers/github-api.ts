import type { JsonObject } from '../shared/types.js';
import { handleError } from '../shared/git-provider-error.js';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from '../shared/circuit-breaker.js';
import type { AxiosInstance } from '../shared/deps.js';

export async function apiGet<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    opts?: { operation?: string; returnNull?: boolean; params?: JsonObject },
): Promise<T | null> {
    checkCircuitBreaker('github-api');
    try {
        const args = opts?.params ? [{ params: opts.params }] : [];
        const response = await client.get<T>(url, ...args);
        recordCircuitSuccess('github-api');
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('github-api');
        return handleError(err, {
            context: opts?.operation || url,
            ...(opts?.returnNull ? { returnNull: true as const } : {}),
        });
    }
}

export async function apiPost<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    body?: unknown,
    opts?: { operation?: string },
): Promise<T> {
    checkCircuitBreaker('github-api');
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.post<T>(url, ...args);
        recordCircuitSuccess('github-api');
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('github-api');
        return handleError(err, { context: opts?.operation || url });
    }
}

export async function apiPatch<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    body?: unknown,
    opts?: { operation?: string },
): Promise<T> {
    checkCircuitBreaker('github-api');
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.patch<T>(url, ...args);
        recordCircuitSuccess('github-api');
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('github-api');
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
