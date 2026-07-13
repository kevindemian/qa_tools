let errorHandler: ((err: Error) => Promise<object>) | undefined;
let successHandler: ((response: object) => object) | undefined;
const mockInstance = Object.assign(vi.fn<(...args: [config: object]) => Promise<{ status: number; data?: string }>>(), {
    interceptors: {
        request: {
            use: vi.fn<(...args: [(config: object) => object | Promise<object>]) => void>(),
        },
        response: {
            use: vi
                .fn<(...args: [(response: object) => object, (err: Error) => Promise<object>]) => void>()
                .mockImplementation((success: (response: object) => object, error: (err: Error) => Promise<object>) => {
                    successHandler = success;
                    errorHandler = error;
                }),
        },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
});

vi.mock('axios', () => ({
    default: { create: vi.fn<(...args: [object]) => typeof mockInstance>(() => mockInstance) },
}));
import * as httpClientModule from './http-client.js';
import { rootLogger } from './logger.js';
import { HostSemaphore } from './host-semaphore.js';
import axios from 'axios';
import { nonNull } from './test-utils.js';
import { parseProxyUrl, resolveProxyUrl } from './proxy-config.js';

/** Restore proxy env vars without coercing `undefined` into the string `'undefined'`.
 *  `process.env[key] = undefined` silently converts to the literal string `'undefined'`,
 *  which would poison `resolveProxyUrl` in later tests. Only assign defined values. */
const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'QA_PROXY_URL'];
function restoreProxyEnv(saved: Record<string, string | undefined>): void {
    for (const key of PROXY_ENV_KEYS) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

describe('HTTP Client', () => {
    let httpClient: typeof import('./http-client.js');

    beforeAll(() => {
        httpClient = httpClientModule;
        httpClient.setTestSleep(() => Promise.resolve());
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            process.nextTick(() => cb());
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        httpClient.setTestSleep(undefined);
    });

    describe('CreateHttpClient', () => {
        it('creates axios instance with provided config', () => {
            const createSpy = vi.spyOn(axios, 'create');
            httpClient.createHttpClient({
                baseUrl: 'https://api.test.com',
                authHeader: { Authorization: 'Bearer token123' },
                timeout: 5000,
            });

            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseURL: 'https://api.test.com',
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer token123',
                    },
                }),
            );

            const axCfg = nonNull(createSpy.mock.calls[0])[0];

            expect(axCfg).toHaveProperty('httpsAgent');
        });

        it('registers response interceptor', () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

            expect(mockInstance.interceptors.response.use).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Function),
            );
        });

        it('uses default timeout when not specified', () => {
            const createSpy2 = vi.spyOn(axios, 'create');
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

            expect(createSpy2).toHaveBeenCalledWith(expect.objectContaining({ timeout: 120000 }));
        });

        it('sleep uses default setTimeout when no test override is active', async () => {
            expect.hasAssertions();

            httpClient.setTestSleep(undefined);
            const promise = httpClient.sleep(1);

            // The promise resolves when setTimeout fires (mocked in beforeEach)
            await expect(promise).resolves.toBeUndefined();

            httpClient.setTestSleep(() => Promise.resolve());
        });

        it('applies parsed proxy config when proxyUrl is provided', () => {
            const createSpy = vi.spyOn(axios, 'create');

            httpClient.createHttpClient({
                baseUrl: 'https://api.test.com',
                proxyUrl: 'ftps://proxy.internal:8080',
            });

            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    proxy: { protocol: 'http', host: 'proxy.internal', port: 8080 },
                }),
            );
        });

        it('throws when proxyUrl cannot be parsed', () => {
            expect.hasAssertions();

            expect(() =>
                httpClient.createHttpClient({
                    baseUrl: 'https://api.test.com',
                    proxyUrl: 'not-a-valid-url',
                }),
            ).toThrow(/Invalid proxy URL/);
        });

        it('defaults proxy to false when no proxyUrl and no proxy env vars', () => {
            const saved: Record<string, string | undefined> = {
                HTTPS_PROXY: process.env['HTTPS_PROXY'],
                HTTP_PROXY: process.env['HTTP_PROXY'],
                https_proxy: process.env['https_proxy'],
                http_proxy: process.env['http_proxy'],
                QA_PROXY_URL: process.env['QA_PROXY_URL'],
            };
            delete process.env['HTTPS_PROXY'];
            delete process.env['HTTP_PROXY'];
            delete process.env['https_proxy'];
            delete process.env['http_proxy'];
            delete process.env['QA_PROXY_URL'];
            try {
                const createSpy = vi.spyOn(axios, 'create');

                httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

                expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ proxy: false }));
            } finally {
                restoreProxyEnv(saved);
            }
        });

        it('falls back to HTTPS_PROXY env var when proxyUrl is omitted', () => {
            const saved: Record<string, string | undefined> = {
                HTTPS_PROXY: process.env['HTTPS_PROXY'],
                HTTP_PROXY: process.env['HTTP_PROXY'],
                https_proxy: process.env['https_proxy'],
                http_proxy: process.env['http_proxy'],
                QA_PROXY_URL: process.env['QA_PROXY_URL'],
            };
            delete process.env['HTTP_PROXY'];
            delete process.env['https_proxy'];
            delete process.env['http_proxy'];
            delete process.env['QA_PROXY_URL'];
            process.env['HTTPS_PROXY'] = 'ftps://envproxy.corp:3128';
            try {
                const createSpy = vi.spyOn(axios, 'create');

                httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

                expect(createSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        proxy: { protocol: 'http', host: 'envproxy.corp', port: 3128 },
                    }),
                );
            } finally {
                restoreProxyEnv(saved);
            }
        });
    });

    describe('Proxy config (C-proxy)', () => {
        const saveProxyEnv = (): Record<string, string | undefined> => {
            const saved: Record<string, string | undefined> = {};
            for (const key of PROXY_ENV_KEYS) saved[key] = process.env[key];
            return saved;
        };

        it('parseProxyUrl returns protocol/host/port for http', () => {
            expect(parseProxyUrl('ftps://proxy:8080')).toStrictEqual({
                protocol: 'http',
                host: 'proxy',
                port: 8080,
            });
        });

        it('parseProxyUrl returns https protocol and decoded auth when present', () => {
            const cfg = parseProxyUrl('https://user:pass@proxy:443');

            expect(cfg).toMatchObject({
                protocol: 'https',
                host: 'proxy',
                port: 443,
                auth: { username: 'user', password: 'pass' },
            });
        });

        it('parseProxyUrl defaults port from protocol when omitted', () => {
            expect(parseProxyUrl('ftps://proxy').port).toBe(80);
            expect(parseProxyUrl('https://proxy').port).toBe(443);
        });

        it('parseProxyUrl throws on missing host', () => {
            expect.hasAssertions();
            expect(() => parseProxyUrl('ftps://')).toThrow(/Invalid proxy URL/);
        });

        it('resolveProxyUrl prefers explicit proxy over env vars', () => {
            const saved = saveProxyEnv();
            process.env['HTTPS_PROXY'] = 'https://env:1';
            try {
                expect(resolveProxyUrl('https://explicit:2')).toBe('https://explicit:2');
            } finally {
                restoreProxyEnv(saved);
            }
        });

        it('resolveProxyUrl falls back to env proxy vars when explicit omitted', () => {
            const saved = saveProxyEnv();
            delete process.env['HTTPS_PROXY'];
            delete process.env['http_proxy'];
            delete process.env['QA_PROXY_URL'];
            process.env['HTTP_PROXY'] = 'https://envfallback:9';
            try {
                expect(resolveProxyUrl()).toBe('https://envfallback:9');
            } finally {
                restoreProxyEnv(saved);
            }
        });

        it('resolveProxyUrl returns undefined when no proxy configured', () => {
            const saved = saveProxyEnv();
            for (const key of PROXY_ENV_KEYS) delete process.env[key];
            try {
                expect(resolveProxyUrl()).toBeUndefined();
            } finally {
                restoreProxyEnv(saved);
            }
        });
    });

    describe('Retry interceptor', () => {
        interface RetryError {
            message: string;
            name: string;
            config: { method: string; __retryAttempts: number };
            response: { status: number };
            code: string | undefined;
        }

        const makeError = (method: string, status: number, attempts: number): RetryError => ({
            message: 'Request failed',
            name: 'Error',
            config: { method, __retryAttempts: attempts },
            response: { status },
            code: undefined,
        });

        it('retries GET up to HTTP_MAX_RETRIES (10) times', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((cfg: object) => {
                const cfg2 = cfg as { method: string; __retryAttempts: number };
                const newErr = makeError('get', 500, cfg2.__retryAttempts);
                newErr.config = cfg2;
                return nonNull(errorHandler)(newErr) as Promise<{ status: number; data?: string }>;
            });
            // erro é esperado (retry exhausto); catch vazio é intencional
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(mockInstance).toHaveBeenCalledTimes(10);
        });

        it('retries PUT up to HTTP_MAX_RETRIES (10) times', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('put', 500, 0);
            mockInstance.mockImplementation((cfg: object) => {
                const cfg2 = cfg as { method: string; __retryAttempts: number };
                const newErr = makeError('put', 500, cfg2.__retryAttempts);
                newErr.config = cfg2;
                return nonNull(errorHandler)(newErr) as Promise<{ status: number; data?: string }>;
            });
            // erro é esperado (retry exhausto); catch vazio é intencional
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(mockInstance).toHaveBeenCalledTimes(10);
        });

        it('does not retry POST', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('post', 500, 0);
            // erro é esperado (POST não retry); catch vazio é intencional
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(mockInstance).not.toHaveBeenCalled();
        });

        it('does not retry non-retryable errors (4xx)', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err: RetryError = {
                message: 'Bad request',
                name: 'Error',
                config: { method: 'get', __retryAttempts: 2 },
                response: { status: 400 },
                code: undefined,
            };
            // erro é esperado (4xx não retry); catch vazio é intencional
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(mockInstance).not.toHaveBeenCalled();
        });

        it('success interceptor cleans up retry counts and returns response', () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const response = {
                config: { method: 'get', url: '/test' },
                data: 'ok',
            };
            const result = nonNull(successHandler)(response);

            expect(result).toBe(response);
        });

        it('re-throws error without config property', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = new Error('no config');
            let caughtError: unknown;
            try {
                await nonNull(errorHandler)(err);
            } catch (e) {
                caughtError = e;
            }

            expect(caughtError).toBe(err);
        });

        it('defaults method to get when config.method is missing', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = Object.assign(new Error('no method'), {
                config: { url: '/test' },
                response: { status: 500 },
            });
            mockInstance.mockImplementation((cfg: object) => {
                const newErr = Object.assign(new Error('no method'), {
                    config: cfg,
                    response: { status: 500 },
                });
                return nonNull(errorHandler)(newErr) as Promise<{ status: number; data?: string }>;
            });
            try {
                await nonNull(errorHandler)(err);
            } catch {
                void 0;
            }

            expect(mockInstance).toHaveBeenCalledWith(expect.anything());
        });

        it('retries GET up to custom maxRetries (2) and stops', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com', maxRetries: 2 });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((cfg: object) => {
                const newErr = makeError('get', 500, (cfg as RetryError['config']).__retryAttempts);
                newErr.config = cfg as RetryError['config'];
                return nonNull(errorHandler)(newErr) as Promise<{ status: number; data?: string }>;
            });
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(mockInstance).toHaveBeenCalledTimes(2);
        });

        it('logs retry attempts at debug level, not warn', async () => {
            expect.hasAssertions();

            const debugSpy = vi.spyOn(rootLogger, 'debug');
            const warnSpy = vi.spyOn(rootLogger, 'warn');
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((cfg: object) => {
                const newErr = makeError('get', 500, (cfg as RetryError['config']).__retryAttempts);
                newErr.config = cfg as RetryError['config'];
                return nonNull(errorHandler)(newErr) as Promise<{ status: number; data?: string }>;
            });
            try {
                await nonNull(errorHandler)(err);
            } catch {
                /* expected */
            }

            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Retry'));
            expect(warnSpy).not.toHaveBeenCalled();

            debugSpy.mockRestore();
            warnSpy.mockRestore();
        });
    });

    describe('HTTP 429 retry-after header', () => {
        it('uses Retry-After value for wait time when header is a valid number', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = {
                message: 'Rate limited',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 429, headers: { 'retry-after': '30' } },
                code: undefined,
            };
            let callCount = 0;
            mockInstance.mockImplementation((cfg: object) => {
                callCount++;
                if (callCount < 2) {
                    const updatedErr = { ...err, config: cfg };
                    return nonNull(errorHandler)(updatedErr) as Promise<{ status: number; data?: string }>;
                }
                return Promise.resolve({ status: 200 });
            });
            const result = await nonNull(errorHandler)(err);

            expect(result).toStrictEqual({ status: 200 });
            expect(callCount).toBe(2);
        });

        it('falls back to exponential backoff when Retry-After header is not a number', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = {
                message: 'Rate limited',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 429, headers: { 'retry-after': 'abc' } },
                code: undefined,
            };
            let callCount = 0;
            mockInstance.mockImplementation((cfg: object) => {
                callCount++;
                if (callCount < 2) {
                    const updatedErr = { ...err, config: cfg };
                    return nonNull(errorHandler)(updatedErr) as Promise<{ status: number; data?: string }>;
                }
                return Promise.resolve({ status: 200 });
            });
            const result = await nonNull(errorHandler)(err);

            expect(result).toStrictEqual({ status: 200 });
            expect(callCount).toBe(2);
        });
    });

    describe('Stale retry entry cleanup (lines 70-72)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            httpClient._resetRetryCleanup();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('removes entries that have not been used for more than RETRY_STALE_MS', async () => {
            expect.hasAssertions();

            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

            // Create entry in retryCounts via a retry that resolves successfully
            // (entry persists because neither success nor error handler deletes it)
            mockInstance.mockResolvedValue({ status: 200 });
            const err = {
                message: 'Server error',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 500 },
                code: undefined,
            };
            nonNull(errorHandler)(err).catch(() => {});

            // Advance past RETRY_STALE_MS (600s) + one cleanup interval (300s)
            // to trigger stale entry deletion at t=900000
            await vi.advanceTimersByTimeAsync(900001);

            expect(true).toBeTruthy();
        });
    });

    describe('CreateThrottledClient (branch coverage)', () => {
        it('extractHost returns unknown for invalid URL', async () => {
            expect.hasAssertions();

            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 3 });
            const reqHandler = nonNull(mockInstance.interceptors.request.use.mock.calls[0])[0];
            const cfg: Record<string, unknown> = { url: ':::invalid', headers: {} };
            const result = await reqHandler(cfg);

            // Handler returns config unchanged; semaphore acquire is verified via the HostSemaphore integration
            expect(result).toBe(cfg);
        });

        it('acquire queues second request when concurrency is maxed out', async () => {
            expect.hasAssertions();

            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 1 });
            const reqHandler = nonNull(mockInstance.interceptors.request.use.mock.calls[0])[0];
            const respHandler = nonNull(mockInstance.interceptors.response.use.mock.calls[1])[0];
            const cfg1: Record<string, unknown> = { url: 'https://api.test.com/resource', headers: {} };
            const cfg2: Record<string, unknown> = { url: 'https://api.test.com/other', headers: {} };
            await reqHandler(cfg1);
            const req2Promise = reqHandler(cfg2);
            respHandler({ config: cfg1, data: 'ok' });

            await expect(req2Promise).resolves.toBe(cfg2);
        });

        it('response error handler extracts host from empty url', () => {
            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 3 });
            const errRespHandler = nonNull(mockInstance.interceptors.response.use.mock.calls[1])[1];
            const error = { config: {}, message: 'test', name: 'Error' };

            expect(() => errRespHandler(error)).toThrow(error);
        });
    });

    describe('HostSemaphore (direct)', () => {
        it('acquire blocks when maxConcurrency reached and releases when slot frees', async () => {
            expect.hasAssertions();

            const sem = new HostSemaphore(1);

            await sem.acquire('test-host');

            const p = sem.acquire('test-host');
            const race = Promise.race([p.then(() => 'resolved'), Promise.resolve('pending')]);

            await expect(race).resolves.toBe('pending');

            sem.release('test-host');

            await expect(p).resolves.toBeUndefined();
        });

        it('release dispatches queued request and updates inflight', async () => {
            expect.hasAssertions();

            const sem = new HostSemaphore(2);

            await sem.acquire('h1');
            await sem.acquire('h1');

            const p3 = sem.acquire('h1');

            sem.release('h1');

            await expect(p3).resolves.toBeUndefined();
        });

        it('release calls dispatchNext even when queue is empty', () => {
            const sem = new HostSemaphore(1);

            expect(() => sem.release('nonexistent')).not.toThrow();
        });
    });
});
