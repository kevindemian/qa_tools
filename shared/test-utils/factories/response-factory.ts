import type { AxiosInstance } from 'axios';
import type { Mocked } from 'vitest';

export function createMockResponse<T>(data: T): { data: T } {
    return { data };
}

export function createMockAxiosInstance(overrides?: Record<string, unknown>): Mocked<AxiosInstance> {
    const base = {
        defaults: {} as never,
        interceptors: {
            request: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
            response: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
        },
        request: vi.fn(),
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
        options: vi.fn(),
        getUri: vi.fn(),
    } as unknown as Mocked<AxiosInstance>;
    return { ...base, ...overrides } as unknown as Mocked<AxiosInstance>;
}
