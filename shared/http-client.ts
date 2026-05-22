import axios from 'axios';
import { createAgent } from './tls';
import { rootLogger } from './logger';

export interface HttpClientConfig {
  baseUrl: string;
  authHeader?: Record<string, string>;
  timeout?: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryKey(cfg: { method?: string; url?: string }): string {
  return `${(cfg.method || 'get').toLowerCase()}:${cfg.url || ''}`;
}

const retryCounts = new Map<string, number>();

export function createHttpClient({ baseUrl, authHeader, timeout = 120000 }: HttpClientConfig) {
  const instance = axios.create({
    baseURL: baseUrl,
    timeout,
    httpsAgent: createAgent(),
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader || {}),
    },
  });

  instance.interceptors.response.use(
    response => {
      const key = retryKey(response.config);
      retryCounts.delete(key);
      return response;
    },
    async (error: unknown) => {
      const axiosErr = error as { config?: { method?: string; url?: string }; response?: { status: number }; code?: string };
      const cfg = axiosErr.config;
      if (!cfg) throw error;
      const key = retryKey(cfg);
      let attempts = retryCounts.get(key) || 0;
      const method = (cfg.method || 'get').toLowerCase();
      const maxRetries = (method === 'get' || method === 'put') ? 5 : 0;
      const isRetryable = !axiosErr.response
        || axiosErr.response.status >= 500
        || axiosErr.response.status === 429
        || axiosErr.code === 'ECONNRESET'
        || axiosErr.code === 'ETIMEDOUT'
        || axiosErr.code === 'ECONNABORTED';
      if (attempts < maxRetries && isRetryable) {
        attempts++;
        retryCounts.set(key, attempts);
        const baseWait = Math.min(2000 * Math.pow(2, attempts - 1), 30000);
        const jitter = Math.random() * 1000;
        rootLogger.warn(`Retry ${attempts}/${maxRetries} para ${cfg.url} (espera ${Math.round(baseWait + jitter)}ms)`);
        await sleep(baseWait + jitter);
        return instance(cfg);
      }
      retryCounts.delete(key);
      throw error;
    }
  );

  return instance;
}
