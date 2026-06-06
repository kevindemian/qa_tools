import type Config from '../../../shared/config-accessor.js';
import type { Mock } from 'vitest';

export type MockConfigStatic = {
    get: Mock;
    set: Mock;
    reset: Mock;
    load: Mock;
    getDefault: Mock<() => Config>;
    setAutoConfirm: Mock;
    getAllPrefixed: Mock;
    validateRequiredEnv: Mock;
    create: Mock<() => Config>;
};

type MockConfigInstance = {
    get: Mock;
    setAutoConfirm: Mock;
    getAllPrefixed: Mock;
};

export function createMockConfigInstance(overrides?: Partial<MockConfigInstance>): Config {
    const base = {
        get: vi.fn(),
        setAutoConfirm: vi.fn(),
        getAllPrefixed: vi.fn(() => ({})),
    } as unknown as Config;
    return { ...base, ...(overrides as Partial<MockConfigInstance>) } as unknown as Config;
}

export function createMockConfig(overrides?: Partial<MockConfigStatic>): MockConfigStatic {
    const base: MockConfigStatic = {
        get: vi.fn(),
        set: vi.fn(),
        reset: vi.fn(),
        load: vi.fn(),
        setAutoConfirm: vi.fn(),
        getAllPrefixed: vi.fn(() => ({})),
        validateRequiredEnv: vi.fn(),
        create: vi.fn(() => createMockConfigInstance()),
        getDefault: vi.fn(() => createMockConfigInstance()),
    };
    return { ...base, ...overrides };
}
