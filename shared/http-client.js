const axios = require('axios');
const { createAgent } = require('./tls');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
      return response;
    },
    async error => {
      const cfg = error.config;
      if (!cfg || cfg.__retryAttempts == null) {
        cfg.__retryAttempts = 0;
      }
      const method = (cfg.method || 'get').toLowerCase();
      const maxRetries = (method === 'get' || method === 'put') ? 5 : 0;
      const isRetryable = !error.response
        || error.response.status >= 500
        || error.response.status === 429
        || error.code === 'ECONNRESET'
        || error.code === 'ETIMEDOUT'
        || error.code === 'ECONNABORTED';
      if (cfg.__retryAttempts < maxRetries && isRetryable) {
        cfg.__retryAttempts++;
        const baseWait = Math.min(2000 * Math.pow(2, cfg.__retryAttempts - 1), 30000);
        const jitter = Math.random() * 1000;
        await sleep(baseWait + jitter);
        return instance(cfg);
      }
      throw error;
    }
  );

  return instance;
}

module.exports = { createHttpClient };
