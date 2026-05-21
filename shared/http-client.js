const axios = require('axios');
const { createAgent } = require('./tls');
const { rootLogger } = require('./logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryKey(cfg) {
  return `${(cfg.method || 'get').toLowerCase()}:${cfg.url || ''}`;
}

const retryCounts = new Map();

function createHttpClient({ baseUrl, authHeader, timeout = 120000 }) {
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
    async error => {
      const cfg = error.config;
      if (!cfg) throw error;
      const key = retryKey(cfg);
      let attempts = retryCounts.get(key) || 0;
      const method = (cfg.method || 'get').toLowerCase();
      const maxRetries = (method === 'get' || method === 'put') ? 5 : 0;
      const isRetryable = !error.response
        || error.response.status >= 500
        || error.response.status === 429
        || error.code === 'ECONNRESET'
        || error.code === 'ETIMEDOUT'
        || error.code === 'ECONNABORTED';
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

module.exports = { createHttpClient, sleep };
