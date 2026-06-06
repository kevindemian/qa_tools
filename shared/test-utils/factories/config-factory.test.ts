import { createMockConfig } from './config-factory.js';

describe('createMockConfig', () => {
    it('returns static methods as vi.fn()', async () => {
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

    it('provides a working instance via getDefault()', async () => {
        const mock = createMockConfig();
        const instance = mock.getDefault();
        expect(typeof instance.get).toBe('function');
        expect(typeof instance.setAutoConfirm).toBe('function');
        expect(typeof instance.getAllPrefixed).toBe('function');
    });

    it('getDefault() returns a new instance each call', async () => {
        const mock = createMockConfig();
        const a = mock.getDefault();
        const b = mock.getDefault();
        expect(a).not.toBe(b);
    });

    it('merges overrides correctly', async () => {
        const customGet = vi.fn(() => 'custom-value');
        const mock = createMockConfig({ get: customGet });
        expect(mock.get).toBe(customGet);
    });

    it('each call produces independent vi.fn() instances', async () => {
        const a = createMockConfig();
        const b = createMockConfig();
        expect(a.get).not.toBe(b.get);
    });
});
