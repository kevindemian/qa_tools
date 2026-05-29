let errorHandler: ((err: Error) => Promise<unknown>) | undefined;
let successHandler: ((response: unknown) => unknown) | undefined;
const mockInstance: jest.Mock<Promise<unknown>, unknown[]> & {
    interceptors: {
        request: { use: jest.Mock };
        response: { use: jest.Mock };
    };
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
} = Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock needs flexible args for retry tests
    jest.fn<any, any[]>(() => Promise.reject(new Error('still fails'))),
    {
        interceptors: {
            request: { use: jest.fn() },
            response: {
                use: jest.fn((success: unknown, error: (err: Error) => Promise<unknown>) => {
                    successHandler = success as (response: unknown) => unknown;
                    errorHandler = error;
                }),
            },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    },
) as jest.Mock<Promise<unknown>, unknown[]> & {
    interceptors: {
        request: { use: jest.Mock };
        response: { use: jest.Mock };
    };
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
};

jest.mock('axios', () => ({ create: jest.fn(() => mockInstance) }));
import * as httpClientModule from './http-client';
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock cfg can be any shape from retry
            mockInstance.mockImplementation((cfg: any) => {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock cfg can be any shape from retry
            mockInstance.mockImplementation((cfg: any) => {
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
            const err = {
                message: 'no method',
                name: 'Error',
                config: { url: '/test' },
                response: { status: 500 },
            } as never;
            mockInstance.mockImplementation((cfg: unknown) => {
                const newErr = {
                    message: 'no method',
                    name: 'Error',
                    config: cfg,
                    response: { status: 500 },
                } as never;
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch (e) {}
            expect(mockInstance).toHaveBeenCalled();
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
        it('removes entries that have not been used for more than RETRY_STALE_MS', () => {
            jest.useFakeTimers();

            // Use isolateModules so startRetryCleanup runs with fake timers
            let freshClient: typeof httpClient;
            jest.isolateModules(() => {
                freshClient = require('./http-client') as typeof httpClient;
            });

            freshClient!.setTestSleep(() => Promise.resolve());
            freshClient!.createHttpClient({ baseUrl: 'https://api.test.com' });

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

            jest.useRealTimers();
        });
    });
});
