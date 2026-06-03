/** HTTP client with automatic retry (GET/PUT), exponential backoff + jitter, and TLS config.
 * Uses axios under the hood. */
import axios from 'axios';
import { createAgent } from './tls';
import { rootLogger } from './logger';
import { extractHost, HostSemaphore } from './host-semaphore';

/** Configuration for {@link createHttpClient}. */
export interface HttpClientConfig {
    /** Base URL for all requests (e.g. `https://api.github.com`). */
    baseUrl: string;
    /** Optional HTTP header to include on every request (e.g. `Authorization: Bearer ...`). */
    authHeader?: Record<string, string>;
    /** Request timeout in ms (default: 120000). */
    timeout?: number;
    /** Maximum retry attempts for GET/PUT on 5xx/429/network errors (default: 10).
     *  Set lower for non-critical requests like status badges. */
    maxRetries?: number;
}

/** Número máximo de tentativas para GET/PUT.
 * @production Jira Data Center atrás de Cloudflare limita ~2-3 req/min com cooldown 30-60s (429).
 *   10 tentativas com backoff até 120s garantem cobertura do cooldown.
 *   NÃO reduzir sem revalidar contra produção. */
const HTTP_MAX_RETRIES = 10;
/** Número máximo de auto-retries silenciosos para erros de rede (ECONNRESET, ECONNREFUSED, etc).
 *  São tentativas extras antes do retry normal — não interferem no contador principal. */
const AUTO_RETRY_MAX = 2;

/** Retorna `true` para erros de rede que devem ser reinseridos automaticamente sem prompt.
 *  Cobre falhas transitórias de conectividade. */
function shouldAutoRetry(errorCode: string | undefined): boolean {
    if (!errorCode) return false;
    return ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(errorCode);
}
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
const RETRY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_STALE_MS = 10 * 60 * 1000;

interface RetryEntry {
    count: number;
    lastUsed: number;
}

function retryKey(cfg: { method?: string; url?: string }): string {
    return `${(cfg.method || 'get').toLowerCase()}:${cfg.url || ''}`;
}

class HttpClientInternals {
    _sleepImpl: (ms: number) => Promise<void>;
    readonly retryCounts = new Map<string, RetryEntry>();
    _retryCleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this._sleepImpl = this._defaultSleep.bind(this);
    }

    private _defaultSleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    setTestSleep(fn: ((ms: number) => Promise<void>) | undefined): void {
        this._sleepImpl = fn ?? this._defaultSleep.bind(this);
    }

    sleep(ms: number): Promise<void> {
        return this._sleepImpl(ms);
    }

    startRetryCleanup(): void {
        if (this._retryCleanupTimer !== null) return;
        this._retryCleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.retryCounts) {
                if (now - entry.lastUsed > RETRY_STALE_MS) this.retryCounts.delete(key);
            }
        }, RETRY_CLEANUP_INTERVAL_MS);
        if (
            this._retryCleanupTimer &&
            typeof this._retryCleanupTimer === 'object' &&
            'unref' in this._retryCleanupTimer
        ) {
            this._retryCleanupTimer.unref();
        }
    }

    getRetryCount(key: string): number {
        const entry = this.retryCounts.get(key);
        return entry ? entry.count : 0;
    }

    setRetryCount(key: string, count: number): void {
        this.retryCounts.set(key, { count, lastUsed: Date.now() });
    }

    deleteRetryKey(key: string): void {
        this.retryCounts.delete(key);
    }

    resetRetryCleanup(): void {
        if (this._retryCleanupTimer !== null) {
            clearInterval(this._retryCleanupTimer);
            this._retryCleanupTimer = null;
        }
    }
}

const _internals = new HttpClientInternals();

_internals.startRetryCleanup();

export function setTestSleep(fn: ((ms: number) => Promise<void>) | undefined): void {
    _internals.setTestSleep(fn);
}

export function sleep(ms: number): Promise<void> {
    return _internals.sleep(ms);
}

export function _resetRetryCleanup(): void {
    _internals.resetRetryCleanup();
}

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

function _setupResponseInterceptor(instance: ReturnType<typeof axios.create>, maxRetries: number): void {
    instance.interceptors.response.use(
        (response) => {
            const key = retryKey(response.config);
            _internals.deleteRetryKey(key);
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
            let attempts = _internals.getRetryCount(key);
            const method = (cfg.method || 'get').toLowerCase();
            const effectiveMaxRetries = method === 'get' || method === 'put' ? maxRetries : 0;
            const isRetryable =
                !axiosErr.response ||
                axiosErr.response.status >= 500 ||
                axiosErr.response.status === 429 ||
                axiosErr.code === 'ECONNRESET' ||
                axiosErr.code === 'ETIMEDOUT' ||
                axiosErr.code === 'ECONNABORTED';

            if (shouldAutoRetry(axiosErr.code) && attempts < AUTO_RETRY_MAX) {
                attempts++;
                _internals.setRetryCount(key, attempts);
                rootLogger.debug(
                    `Auto-retry ${attempts}/${AUTO_RETRY_MAX} para ${cfg.url} (erro de rede: ${axiosErr.code})`,
                );
                await _internals.sleep(1000);
                return instance(cfg);
            }

            if (attempts < effectiveMaxRetries && isRetryable) {
                attempts++;
                _internals.setRetryCount(key, attempts);
                const delayMs = _calculateRetryDelay(axiosErr.response, attempts);
                const retryAfter =
                    axiosErr.response?.status === 429 ? axiosErr.response?.headers?.['retry-after'] : undefined;
                rootLogger.debug(
                    `Retry ${attempts}/${effectiveMaxRetries} para ${cfg.url} (espera ${Math.round(delayMs)}ms)` +
                        (retryAfter ? ' — Retry-After: ' + String(retryAfter) + 's' : ''),
                );
                await _internals.sleep(delayMs);
                return instance(cfg);
            }
            _internals.deleteRetryKey(key);
            throw error;
        },
    );
}

/** Create an axios-based HTTP client with retry logic, TLS config, and JSON content type.
 * Retries GET/PUT on 5xx, 429, ECONNRESET, ETIMEDOUT (up to configurable attempts with exponential backoff).
 * @param config — Base URL, optional auth header, timeout, and max retries. */
export function createHttpClient({
    baseUrl,
    authHeader,
    timeout = DEFAULT_HTTP_TIMEOUT_MS,
    maxRetries,
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

    _setupResponseInterceptor(instance, maxRetries ?? HTTP_MAX_RETRIES);

    return instance;
}

// ─── Throttle / Concurrency control (F5: A3) ─────────────────────────────────

/** Configuration for {@link createThrottledClient}. */
export interface ThrottledClientConfig extends HttpClientConfig {
    /** Maximum concurrent requests (default: 3). */
    maxConcurrency?: number;
}

/** Create an HTTP client with concurrency limiting per-host.
 * Combines the retry/backoff from {@link createHttpClient} with a semaphore that
 * limits concurrent in-flight requests to the same host.
 *
 * Uses a `WeakMap` keyed on the axios request config to track which requests have
 * already acquired a throttle slot (avoids double-acquire on retries), eliminating
 * the need for property injection on the config object.
 *
 * @param config — Base config plus optional {@link ThrottledClientConfig.maxConcurrency}.
 * @default maxConcurrency = 3
 *
 * @example
 * const client = createThrottledClient({ baseUrl: 'https://api.github.com', authHeader: { Authorization: 'Bearer token' }, maxConcurrency: 5 });
 * const { data } = await client.get('/repos/owner/repo/actions/runs');
 */
const _throttled = new WeakMap<object, true>();

export function createThrottledClient(config: ThrottledClientConfig): axios.AxiosInstance {
    const maxConcurrency = config.maxConcurrency ?? 3;
    const semaphore = new HostSemaphore(maxConcurrency);
    const instance = createHttpClient(config);

    instance.interceptors.request.use(async (cfg) => {
        if (_throttled.has(cfg)) return cfg;
        const host = extractHost(cfg.url || '');
        rootLogger.debug(`Throttle: waiting for slot on ${host} (concurrency ${maxConcurrency})`);
        await semaphore.acquire(host);
        _throttled.set(cfg, true);
        return cfg;
    });

    instance.interceptors.response.use(
        (response) => {
            const host = extractHost(response.config.url || '');
            semaphore.release(host);
            return response;
        },
        (error) => {
            const host = extractHost((error as { config?: { url?: string } })?.config?.url || '');
            semaphore.release(host);
            throw error;
        },
    );

    return instance;
}
