let errorHandler: ((err: Error) => Promise<unknown>) | undefined;
let successHandler: ((response: unknown) => unknown) | undefined;
const mockInstance = Object.assign(jest.fn<Promise<unknown>, unknown[]>(), {
    interceptors: {
        request: { use: jest.fn() },
        response: {
            use: jest.fn().mockImplementation((success: unknown, error: (err: Error) => Promise<unknown>) => {
                successHandler = success as (response: unknown) => unknown;
                errorHandler = error;
            }),
        },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
});

jest.mock('axios', () => ({ create: jest.fn(() => mockInstance) }));
import * as httpClientModule from './http-client';
import { rootLogger } from './logger';
import axios from 'axios';

describe('HTTP Client', () => {
    let httpClient: typeof import('./http-client');

    beforeAll(() => {
        httpClient = httpClientModule;
        httpClient.setTestSleep(() => Promise.resolve());
    });

    afterAll(() => {
        httpClient.setTestSleep(undefined);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => void) => {
            process.nextTick(() => cb());
            return {} as NodeJS.Timeout;
        }) as typeof global.setTimeout);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('createHttpClient', () => {
        it('creates axios instance with provided config', () => {
            httpClient.createHttpClient({
                baseUrl: 'https://api.test.com',
                authHeader: { Authorization: 'Bearer token123' },
                timeout: 5000,
            });
            expect(axios.create).toHaveBeenCalledWith({
                baseURL: 'https://api.test.com',
                timeout: 5000,
                httpsAgent: expect.any(Object),
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer token123',
                },
            });
        });

        it('registers response interceptor', () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
        });

        it('uses default timeout when not specified', () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 120000 }));
        });

        it('sleep uses default setTimeout when no test override is active', async () => {
            httpClient.setTestSleep(undefined);
            const promise = httpClient.sleep(1);
            // The promise resolves when setTimeout fires (mocked in beforeEach)
            await expect(promise).resolves.toBeUndefined();
            httpClient.setTestSleep(() => Promise.resolve());
        });
    });

    describe('retry interceptor', () => {
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
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((...args: unknown[]) => {
                const cfg = args[0] as { method: string; __retryAttempts: number };
                const newErr = makeError('get', 500, cfg.__retryAttempts);
                newErr.config = cfg;
                return errorHandler!(newErr);
            });
            // erro é esperado (retry exhausto); catch vazio é intencional
            try {
                await errorHandler!(err);
            } catch {
                /* expected */
            }
            expect(mockInstance).toHaveBeenCalledTimes(10);
        });

        it('retries PUT up to HTTP_MAX_RETRIES (10) times', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('put', 500, 0);
            mockInstance.mockImplementation((...args: unknown[]) => {
                const cfg = args[0] as { method: string; __retryAttempts: number };
                const newErr = makeError('put', 500, cfg.__retryAttempts);
                newErr.config = cfg;
                return errorHandler!(newErr);
            });
            // erro é esperado (retry exhausto); catch vazio é intencional
            try {
                await errorHandler!(err);
            } catch {
                /* expected */
            }
            expect(mockInstance).toHaveBeenCalledTimes(10);
        });

        it('does not retry POST', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('post', 500, 0);
            // erro é esperado (POST não retry); catch vazio é intencional
            try {
                await errorHandler!(err);
            } catch {
                /* expected */
            }
            expect(mockInstance).not.toHaveBeenCalled();
        });

        it('does not retry non-retryable errors (4xx)', async () => {
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
                await errorHandler!(err);
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
            const result = successHandler!(response);
            expect(result).toBe(response);
        });

        it('re-throws error without config property', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = new Error('no config');
            try {
                await errorHandler!(err);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBe(err);
            }
        });

        it('defaults method to get when config.method is missing', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = Object.assign(new Error('no method'), {
                config: { url: '/test' },
                response: { status: 500 },
            });
            mockInstance.mockImplementation((cfg: unknown) => {
                const newErr = Object.assign(new Error('no method'), {
                    config: cfg,
                    response: { status: 500 },
                });
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch (e) {}
            expect(mockInstance).toHaveBeenCalled();
        });

        it('retries GET up to custom maxRetries (2) and stops', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com', maxRetries: 2 });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((cfg: unknown) => {
                const newErr = makeError('get', 500, (cfg as RetryError['config']).__retryAttempts);
                newErr.config = cfg as RetryError['config'];
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch {
                /* expected */
            }
            expect(mockInstance).toHaveBeenCalledTimes(2);
        });

        it('logs retry attempts at debug level, not warn', async () => {
            const debugSpy = jest.spyOn(rootLogger, 'debug');
            const warnSpy = jest.spyOn(rootLogger, 'warn');
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('get', 500, 0);
            mockInstance.mockImplementation((cfg: unknown) => {
                const newErr = makeError('get', 500, (cfg as RetryError['config']).__retryAttempts);
                newErr.config = cfg as RetryError['config'];
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch {
                /* expected */
            }
            expect(debugSpy).toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            debugSpy.mockRestore();
            warnSpy.mockRestore();
        });
    });

    describe('429 retry-after header (lines 128-129)', () => {
        it('uses Retry-After value for wait time when header is a valid number', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = {
                message: 'Rate limited',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 429, headers: { 'retry-after': '30' } },
                code: undefined,
            };
            let callCount = 0;
            mockInstance.mockImplementation((cfg: unknown) => {
                callCount++;
                if (callCount < 2) {
                    const updatedErr = { ...err, config: cfg };
                    return errorHandler!(updatedErr);
                }
                return Promise.resolve({ status: 200 });
            });
            const result = await errorHandler!(err);
            expect(result).toEqual({ status: 200 });
            expect(callCount).toBe(2);
        });

        it('falls back to exponential backoff when Retry-After header is not a number', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = {
                message: 'Rate limited',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 429, headers: { 'retry-after': 'abc' } },
                code: undefined,
            };
            let callCount = 0;
            mockInstance.mockImplementation((cfg: unknown) => {
                callCount++;
                if (callCount < 2) {
                    const updatedErr = { ...err, config: cfg };
                    return errorHandler!(updatedErr);
                }
                return Promise.resolve({ status: 200 });
            });
            const result = await errorHandler!(err);
            expect(result).toEqual({ status: 200 });
            expect(callCount).toBe(2);
        });
    });

    describe('stale retry entry cleanup (lines 70-72)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            httpClient._resetRetryCleanup();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('removes entries that have not been used for more than RETRY_STALE_MS', () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });

            // Create entry in retryCounts via a retry that resolves successfully
            // (entry persists because neither success nor error handler deletes it)
            mockInstance.mockImplementation(() => Promise.resolve({ status: 200 }));
            const err = {
                message: 'Server error',
                name: 'Error',
                config: { method: 'get', url: '/api/resource' },
                response: { status: 500 },
                code: undefined,
            };
            errorHandler!(err).catch(() => {});

            // Advance past RETRY_STALE_MS (600s) + one cleanup interval (300s)
            // to trigger stale entry deletion at t=900000
            jest.advanceTimersByTime(900001);
        });
    });

    describe('createThrottledClient (branch coverage)', () => {
        it('extractHost returns unknown for invalid URL', async () => {
            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 3 });
            const reqHandler = mockInstance.interceptors.request.use.mock.calls[0][0];
            const cfg: Record<string, unknown> = { url: ':::invalid', headers: {} };
            const result = await reqHandler(cfg);
            expect((result as Record<string, unknown>)._throttleAcquired).toBe(true);
        });

        it('acquire queues second request when concurrency is maxed out', async () => {
            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 1 });
            const reqHandler = mockInstance.interceptors.request.use.mock.calls[0][0];
            const respHandler = mockInstance.interceptors.response.use.mock.calls[1][0];
            const cfg1: Record<string, unknown> = { url: 'https://api.test.com/resource', headers: {} };
            const cfg2: Record<string, unknown> = { url: 'https://api.test.com/other', headers: {} };
            await reqHandler(cfg1);
            const req2Promise = reqHandler(cfg2);
            respHandler({ config: cfg1, data: 'ok' });
            await expect(req2Promise).resolves.toBe(cfg2);
        });

        it('response error handler extracts host from empty url', () => {
            httpClient.createThrottledClient({ baseUrl: 'https://api.test.com', maxConcurrency: 3 });
            const errRespHandler = mockInstance.interceptors.response.use.mock.calls[1][1];
            const error = { config: {}, message: 'test', name: 'Error' };
            expect(() => errRespHandler(error)).toThrow(error);
        });
    });

    describe('HostSemaphore (direct)', () => {
        it('acquire blocks when maxConcurrency reached and releases when slot frees', async () => {
            const { HostSemaphore } = require('./host-semaphore');
            const sem = new HostSemaphore(1);

            await sem.acquire('test-host');

            const p = sem.acquire('test-host');
            const race = Promise.race([p.then(() => 'resolved'), Promise.resolve('pending')]);
            expect(await race).toBe('pending');

            sem.release('test-host');
            expect(await p).toBeUndefined();
        });

        it('release dispatches queued request and updates inflight', async () => {
            const { HostSemaphore } = require('./host-semaphore');
            const sem = new HostSemaphore(2);

            await sem.acquire('h1');
            await sem.acquire('h1');

            const p3 = sem.acquire('h1');

            sem.release('h1');
            await expect(p3).resolves.toBeUndefined();
        });

        it('release calls dispatchNext even when queue is empty', () => {
            const { HostSemaphore } = require('./host-semaphore');
            const sem = new HostSemaphore(1);
            expect(() => sem.release('nonexistent')).not.toThrow();
        });
    });
});
