/** HTTP client with automatic retry (GET/PUT), exponential backoff + jitter, and TLS config.
 * Uses axios under the hood. */
import axios from 'axios';
import { createAgent } from './tls';
import { rootLogger } from './logger';

/** Configuration for {@link createHttpClient}. */
export interface HttpClientConfig {
    /** Base URL for all requests (e.g. `https://api.github.com`). */
    baseUrl: string;
    /** Optional HTTP header to include on every request (e.g. `Authorization: Bearer ...`). */
    authHeader?: Record<string, string>;
    /** Request timeout in ms (default: 120000). */
    timeout?: number;
}

/** Default sleep implementation using setTimeout.
 * Override via {@link setTestSleep} for tests to avoid real waits. */
function _defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sleep implementation — points to {@link _defaultSleep} in production.
 * Tests can replace this to resolve instantly. */
let _sleepImpl: (ms: number) => Promise<void> = _defaultSleep;

/** Override the sleep function for testing. Pass `undefined` to restore default. */
export function setTestSleep(fn: ((ms: number) => Promise<void>) | undefined): void {
    _sleepImpl = fn ?? _defaultSleep;
}

/** Promise-based delay. Used internally for retry backoff. */
export function sleep(ms: number): Promise<void> {
    return _sleepImpl(ms);
}

function retryKey(cfg: { method?: string; url?: string }): string {
    return `${(cfg.method || 'get').toLowerCase()}:${cfg.url || ''}`;
}

interface RetryEntry {
    count: number;
    lastUsed: number;
}

const retryCounts = new Map<string, RetryEntry>();

const RETRY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_STALE_MS = 10 * 60 * 1000;
/** Número máximo de tentativas para GET/PUT.
 * @production Jira Data Center atrás de Cloudflare limita ~2-3 req/min com cooldown 30-60s (429).
 *   10 tentativas com backoff até 120s garantem cobertura do cooldown.
 *   NÃO reduzir sem revalidar contra produção. */
const HTTP_MAX_RETRIES = 10;
/** Base inicial do exponential backoff (ms).
 * @production 2s base * 2^n garante espera progressiva até ~120s.
 *   NÃO alterar sem revalidar contra rate limit de produção. */
const RETRY_BASE_WAIT_MS = 2000;
/** Tempo máximo de espera entre retries (ms).
 * @production 120s cobre o cooldown de 30-60s do Jira Data Center + Cloudflare.
 *   NÃO reduzir sem revalidar contra produção. */
const RETRY_MAX_WAIT_MS = 120000;
const RETRY_JITTER_MS = 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 120000;
let _retryCleanupTimer: ReturnType<typeof setInterval> | null = null;

function startRetryCleanup(): void {
    if (_retryCleanupTimer !== null) return;
    _retryCleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of retryCounts) {
            if (now - entry.lastUsed > RETRY_STALE_MS) retryCounts.delete(key);
        }
    }, RETRY_CLEANUP_INTERVAL_MS);
    if (_retryCleanupTimer && typeof _retryCleanupTimer === 'object' && 'unref' in _retryCleanupTimer) {
        _retryCleanupTimer.unref();
    }
}

function getRetryCount(key: string): number {
    const entry = retryCounts.get(key);
    return entry ? entry.count : 0;
}

function setRetryCount(key: string, count: number): void {
    retryCounts.set(key, { count, lastUsed: Date.now() });
}

function deleteRetryKey(key: string): void {
    retryCounts.delete(key);
}

startRetryCleanup();

function _calculateRetryDelay(
    errorResponse: { status?: number; headers?: Record<string, string> } | undefined,
    attempt: number,
): number {
    const retryAfter = errorResponse?.status === 429 ? errorResponse?.headers?.['retry-after'] : undefined;
    let waitMs: number;
    if (retryAfter) {
        const parsed = parseInt(String(retryAfter), 10);
        waitMs = isNaN(parsed) ? RETRY_BASE_WAIT_MS * Math.pow(2, attempt - 1) : parsed * 1000;
    } else {
        waitMs = Math.min(RETRY_BASE_WAIT_MS * Math.pow(2, attempt - 1), RETRY_MAX_WAIT_MS);
    }
    const jitter = Math.random() * RETRY_JITTER_MS;
    return waitMs + jitter;
}

function _setupResponseInterceptor(instance: ReturnType<typeof axios.create>): void {
    instance.interceptors.response.use(
        (response) => {
            const key = retryKey(response.config);
            deleteRetryKey(key);
            return response;
        },
        async (error: unknown) => {
            const axiosErr = error as {
                config?: { method?: string; url?: string };
                response?: { status: number; headers?: Record<string, string> };
                code?: string;
            };
            const cfg = axiosErr.config;
            if (!cfg) throw error;
            const key = retryKey(cfg);
            let attempts = getRetryCount(key);
            const method = (cfg.method || 'get').toLowerCase();
            const maxRetries = method === 'get' || method === 'put' ? HTTP_MAX_RETRIES : 0;
            const isRetryable =
                !axiosErr.response ||
                axiosErr.response.status >= 500 ||
                axiosErr.response.status === 429 ||
                axiosErr.code === 'ECONNRESET' ||
                axiosErr.code === 'ETIMEDOUT' ||
                axiosErr.code === 'ECONNABORTED';
            if (attempts < maxRetries && isRetryable) {
                attempts++;
                setRetryCount(key, attempts);
                const delayMs = _calculateRetryDelay(axiosErr.response, attempts);
                const retryAfter =
                    axiosErr.response?.status === 429 ? axiosErr.response?.headers?.['retry-after'] : undefined;
                rootLogger.warn(
                    `Retry ${attempts}/${maxRetries} para ${cfg.url} (espera ${Math.round(delayMs)}ms)` +
                        (retryAfter ? ' — Retry-After: ' + String(retryAfter) + 's' : ''),
                );
                await sleep(delayMs);
                return instance(cfg);
            }
            deleteRetryKey(key);
            throw error;
        },
    );
}

/** Create an axios-based HTTP client with retry logic, TLS config, and JSON content type.
 * Retries GET/PUT on 5xx, 429, ECONNRESET, ETIMEDOUT (up to 5 attempts with exponential backoff).
 * @param config — Base URL, optional auth header, and timeout. */
export function createHttpClient({
    baseUrl,
    authHeader,
    timeout = DEFAULT_HTTP_TIMEOUT_MS,
}: HttpClientConfig): axios.AxiosInstance {
    const instance = axios.create({
        baseURL: baseUrl,
        timeout,
        httpsAgent: createAgent(),
        headers: {
            'Content-Type': 'application/json',
            ...(authHeader || {}),
        },
    });

    _setupResponseInterceptor(instance);

    return instance;
}
