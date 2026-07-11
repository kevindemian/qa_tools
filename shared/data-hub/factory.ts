/**
 * DataHub Factory — centralized creation with persistence injection and retry.
 *
 * Single entry point for creating DataHub instances in production.
 * Handles: persistence creation, retry with exponential backoff, caching.
 *
 * Consumers call `createDataHub(provider, repo)` instead of `DataHubImpl.create()` directly.
 */
import type { GitProvider } from '../types/ci-cd.js';
import type { DataHub, DataHubPersistence } from '../types/data-hub.js';
import { rootLogger } from '../logger.js';
import { formatErr } from '../errors.js';
// `createDataHubPersistence` is an internal data-hub factory (see persistence.ts).
// It is consumed ONLY within `shared/data-hub/` (here, by `createDataHub`).
import { createDataHubPersistence } from './persistence.js';

export interface CreateDataHubOptions {
    /** Maximum retry attempts for transient failures. Default: 3. */
    maxRetries?: number;
    /** Base delay in ms for exponential backoff. Default: 1000. */
    baseDelay?: number;
    /** Pre-created persistence instance. If not provided, auto-creates. */
    persistence?: DataHubPersistence;
}

export interface CreateDataHubResult {
    hub: DataHub;
    status: 'ok' | 'warning';
    warning?: { code: string; message: string };
}

/**
 * Create a DataHub with persistence injected and retry logic.
 *
 * This is the ONLY production entry point for DataHub creation.
 * It centralizes: persistence creation, retry, caching, error handling.
 *
 * @param provider - Git provider (GitHub/GitLab)
 * @param repo - Repository name
 * @param options - Optional retry and persistence configuration
 * @returns DataHubResult with hub and status
 * @throws Error after maxRetries exhausted with no fallback
 */
export async function createDataHub(
    provider: GitProvider,
    repo: string,
    options?: CreateDataHubOptions,
): Promise<CreateDataHubResult> {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelay = options?.baseDelay ?? 1000;

    const { getCachedHub, setCachedHub } = await import('./cache.js');
    const cached = getCachedHub(repo);
    if (cached) {
        return { hub: cached, status: 'ok' };
    }

    const persistence = options?.persistence ?? createDataHubPersistence(repo);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const { DataHubImpl } = await import('./hub.js');

            let dataProvider;
            if (provider.provider === 'gitlab') {
                const { GitLabDataProvider } = await import('./providers/gitlab-provider.js');
                dataProvider = new GitLabDataProvider(provider);
            } else {
                const { GitHubDataProvider } = await import('./providers/github-provider.js');
                dataProvider = new GitHubDataProvider(provider);
            }

            const result = await DataHubImpl.create([dataProvider], { repo }, persistence);
            setCachedHub(repo, result.hub);
            return result;
        } catch (err) {
            const isLastAttempt = attempt === maxRetries - 1;
            rootLogger.warn(`createDataHub attempt ${attempt + 1}/${maxRetries} failed: ${formatErr(err)}`);
            if (!isLastAttempt) {
                const delay = baseDelay * Math.pow(2, attempt);
                await sleep(delay);
            }
        }
    }

    throw new Error(`DataHub creation failed after ${maxRetries} attempts for repo "${repo}"`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
