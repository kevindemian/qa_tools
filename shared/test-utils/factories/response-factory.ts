import { jest } from '@jest/globals';
import type { AxiosInstance } from 'axios';

export function createMockResponse<T>(data: T): { data: T } {
    return { data };
}

export function createMockAxiosInstance(overrides?: Record<string, unknown>): jest.Mocked<AxiosInstance> {
    const base = {
        defaults: {} as never,
        interceptors: {
            request: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
            response: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
        },
        request: jest.fn(),
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        head: jest.fn(),
        options: jest.fn(),
        getUri: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;
    return { ...base, ...overrides } as unknown as jest.Mocked<AxiosInstance>;
}
