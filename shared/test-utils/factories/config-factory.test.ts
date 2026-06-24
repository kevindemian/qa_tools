import { createMockConfig, createMockConfigInstance } from './config-factory.js';

describe('CreateMockConfig', () => {
    it('returns static methods as vi.fn()', () => {
        const mock = createMockConfig();

        expect(typeof mock.get).toBe('function');
        expect(typeof mock.set).toBe('function');
        expect(typeof mock.reset).toBe('function');
        expect(typeof mock.load).toBe('function');
        expect(typeof mock.getDefault).toBe('function');
        expect(typeof mock.create).toBe('function');
        expect(typeof mock.setAutoConfirm).toBe('function');
        expect(typeof mock.getAllPrefixed).toBe('function');
        expect(typeof mock.validateRequiredEnv).toBe('function');
    });

    it('provides a working instance via getDefault()', () => {
        const mock = createMockConfig();
        const instance = mock.getDefault();

        expect(typeof instance.get).toBe('function');
        expect(typeof instance.setAutoConfirm).toBe('function');
        expect(typeof instance.getAllPrefixed).toBe('function');
    });

    it('getDefault() returns a new instance each call', () => {
        const mock = createMockConfig();
        const a = mock.getDefault();
        const b = mock.getDefault();

        expect(a).not.toBe(b);
    });

    it('merges overrides correctly', () => {
        const customGet = vi.fn(() => 'custom-value');
        const mock = createMockConfig({ get: customGet });

        expect(mock.get).toBe(customGet);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockConfig();
        const b = createMockConfig();

        expect(a.get).not.toBe(b.get);
    });

    it('createMockConfigInstance returns a mock with all fields', () => {
        const instance = createMockConfigInstance();

        expect(typeof instance.get).toBe('function');
        expect(typeof instance.setAutoConfirm).toBe('function');
        expect(typeof instance.getAllPrefixed).toBe('function');
    });

    it('createMockConfigInstance getAllPrefixed returns empty object when called', () => {
        const instance = createMockConfigInstance();

        expect(instance.getAllPrefixed('test')).toEqual({});
    });

    it('createMockConfigInstance merges overrides', () => {
        const customGet = vi.fn(() => 'custom');
        const instance = createMockConfigInstance({ get: customGet });

        expect(instance.get('test')).toBe('custom');
    });

    it('mock.create calls createMockConfigInstance and returns a config', () => {
        const mock = createMockConfig();
        const instance = mock.create();

        expect(typeof instance.get).toBe('function');
        expect(typeof instance.setAutoConfirm).toBe('function');
    });

    it('mock.create returns independent instances each call', () => {
        const mock = createMockConfig();
        const a = mock.create();
        const b = mock.create();

        expect(a).not.toBe(b);
    });
});
