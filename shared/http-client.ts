import axios from 'axios';
import { createAgent } from './tls';
import { rootLogger } from './logger';

export interface HttpClientConfig {
    baseUrl: string;
    authHeader?: Record<string, string>;
    timeout?: number;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
const HTTP_MAX_RETRIES = 5;
const RETRY_BASE_WAIT_MS = 2000;
const RETRY_MAX_WAIT_MS = 30000;
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
                response?: { status: number };
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
                const baseWait = Math.min(RETRY_BASE_WAIT_MS * Math.pow(2, attempts - 1), RETRY_MAX_WAIT_MS);
                const jitter = Math.random() * RETRY_JITTER_MS;
                rootLogger.warn(
                    `Retry ${attempts}/${maxRetries} para ${cfg.url} (espera ${Math.round(baseWait + jitter)}ms)`,
                );
                await sleep(baseWait + jitter);
                return instance(cfg);
            }
            deleteRetryKey(key);
            throw error;
        },
    );
}

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
