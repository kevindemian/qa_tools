import type { AxiosInstance } from '../shared/deps.js';
import type { JsonObject } from '../shared/types.js';
import { classifyGitError } from '../shared/errors.js';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from '../shared/infra/circuit-breaker.js';

export function projectPath(owner: string, repo: string): string {
    return '/projects/' + encodeURIComponent(owner ? owner + '/' + repo : repo);
}

export async function apiGet<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    opts?: { operation?: string; params?: JsonObject },
): Promise<T | null> {
    checkCircuitBreaker('gitlab-api');
    try {
        const args = opts?.params ? [{ params: opts.params }] : [];
        const response = await client.get<T>(url, ...args);
        recordCircuitSuccess('gitlab-api');
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('gitlab-api');
        throw classifyGitError(err, { operation: opts?.operation || url });
    }
}

export async function apiPost<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    body?: unknown,
    opts?: { operation?: string },
): Promise<T> {
    checkCircuitBreaker('gitlab-api');
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.post<T>(url, ...args);
        recordCircuitSuccess('gitlab-api');
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('gitlab-api');
        throw classifyGitError(err, { operation: opts?.operation || url });
    }
}

export async function apiPut<T = JsonObject>(
    client: AxiosInstance,
    url: string,
    body?: unknown,
    opts?: { operation?: string },
): Promise<T | null> {
    checkCircuitBreaker('gitlab-api');
    try {
        const args = body !== undefined ? [body] : [];
        const response = await client.put<T>(url, ...args);
        recordCircuitSuccess('gitlab-api');
        return response.status === 204 ? null : response.data;
    } catch (err) {
        const axiosErr = err as { response?: unknown; code?: string };
        if (!axiosErr.response) recordCircuitFailure('gitlab-api');
        throw classifyGitError(err, { operation: opts?.operation || url });
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
