import { createMockResponse, createMockAxiosInstance } from './response-factory.js';

describe('CreateMockResponse', () => {
    it('returns an object with data property', () => {
        const result = createMockResponse({ key: 'TEST-123' });

        expect(result).toStrictEqual({ data: { key: 'TEST-123' } });
    });

    it('preserves the data type', () => {
        const result = createMockResponse(42);

        expect(result.data).toBe(42);
    });

    it('works with string data', () => {
        const result = createMockResponse('hello');

        expect(result.data).toBe('hello');
    });

    it('works with array data', () => {
        const result = createMockResponse([1, 2, 3]);

        expect(result.data).toStrictEqual([1, 2, 3]);
    });

    it('works with null data', () => {
        const result = createMockResponse(null);

        expect(result.data).toBeNull();
    });

    it('works with undefined data', () => {
        const result = createMockResponse(undefined);

        expect(result.data).toBeUndefined();
    });
});

describe('CreateMockAxiosInstance', () => {
    it('returns a mock with all axios methods', () => {
        const mock = createMockAxiosInstance();

        expect(typeof mock.get).toBe('function');
        expect(typeof mock.post).toBe('function');
        expect(typeof mock.put).toBe('function');
        expect(typeof mock.patch).toBe('function');
        expect(typeof mock.delete).toBe('function');
        expect(typeof mock.head).toBe('function');
        expect(typeof mock.options).toBe('function');
        expect(typeof mock.request).toBe('function');
        expect(typeof mock.getUri).toBe('function');
        expect(mock.interceptors.request).toBeDefined();
        expect(mock.interceptors.response).toBeDefined();
        expect(typeof mock.interceptors.request.use).toBe('function');
    });

    it('merges overrides correctly', () => {
        const customGet = vi.fn();
        const mock = createMockAxiosInstance({ get: customGet });

        expect(mock['get']).toBe(customGet);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockAxiosInstance();
        const b = createMockAxiosInstance();

        expect(a['get']).not.toBe(b['get']);
    });
});
