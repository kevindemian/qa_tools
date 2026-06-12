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
    loadTypedState: vi.fn(() => ({
        _llmConfigAttempts: 0,
        _llmConfigLastAttempt: undefined,
    })),
}));

describe('smartwizard-discovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('module loads without error', async () => {
        // Prevent process.exit from being called during module import
        vi.spyOn(process, 'exit').mockImplementation((() => {
            // no-op
        }) as typeof process.exit);

        const mod = await import('../smartwizard-discovery.js');
        expect(mod).toBeDefined();

        vi.restoreAllMocks();
    });
});
