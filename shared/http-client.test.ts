let errorHandler: ((err: Error) => Promise<never>) | undefined;
let successHandler: ((response: unknown) => unknown) | undefined;
const mockInstance: jest.Mock<Promise<never>, unknown[]> & {
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
                use: jest.fn((success: unknown, error: (err: Error) => Promise<never>) => {
                    successHandler = success as (response: unknown) => unknown;
                    errorHandler = error;
                }),
            },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    },
) as jest.Mock<Promise<never>, unknown[]> & {
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
            const client = httpClient.createHttpClient({
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

        it('retries GET up to 5 times', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('get', 500, 0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock cfg can be any shape from retry
            mockInstance.mockImplementation((cfg: any) => {
                const newErr = makeError('get', 500, cfg.__retryAttempts);
                newErr.config = cfg;
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch (e) {}
            expect(mockInstance).toHaveBeenCalledTimes(5);
        });

        it('retries PUT up to 5 times', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('put', 500, 0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock cfg can be any shape from retry
            mockInstance.mockImplementation((cfg: any) => {
                const newErr = makeError('put', 500, cfg.__retryAttempts);
                newErr.config = cfg;
                return errorHandler!(newErr);
            });
            try {
                await errorHandler!(err);
            } catch (e) {}
            expect(mockInstance).toHaveBeenCalledTimes(5);
        });

        it('does not retry POST', async () => {
            httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
            const err = makeError('post', 500, 0);
            try {
                await errorHandler!(err);
            } catch (e) {}
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
            try {
                await errorHandler!(err);
            } catch (e) {}
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
});
