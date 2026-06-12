import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRootLogger = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: mockRootLogger,
}));

vi.mock('../../shared/model-resolver', () => ({
    initModelResolver: vi.fn(),
    getRegistry: vi.fn(() => ({ providers: {} })),
}));

vi.mock('../../shared/model-discovery', () => ({
    discoverModels: vi.fn(),
}));

vi.mock('../../shared/state', () => ({
    updateTyped: vi.fn(),
}));

describe('smartwizard-discovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('module loads without error', async () => {
        const mod = await import('../smartwizard-discovery.js');
        expect(mod).toBeDefined();
    });
});
