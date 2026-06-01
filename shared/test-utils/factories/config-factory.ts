import { jest } from '@jest/globals';
import type Config from '../../../shared/config-accessor';

export type MockConfigStatic = {
    get: jest.Mock;
    set: jest.Mock;
    reset: jest.Mock;
    load: jest.Mock;
    getDefault: jest.Mock<() => Config>;
    setAutoConfirm: jest.Mock;
    getAllPrefixed: jest.Mock;
    validateRequiredEnv: jest.Mock;
    create: jest.Mock<() => Config>;
};

type MockConfigInstance = {
    get: jest.Mock;
    setAutoConfirm: jest.Mock;
    getAllPrefixed: jest.Mock;
};

export function createMockConfigInstance(overrides?: Partial<MockConfigInstance>): Config {
    const base = {
        get: jest.fn(),
        setAutoConfirm: jest.fn(),
        getAllPrefixed: jest.fn(() => ({})),
    } as unknown as Config;
    return { ...base, ...(overrides as Partial<MockConfigInstance>) } as unknown as Config;
}

export function createMockConfig(overrides?: Partial<MockConfigStatic>): MockConfigStatic {
    const base: MockConfigStatic = {
        get: jest.fn(),
        set: jest.fn(),
        reset: jest.fn(),
        load: jest.fn(),
        setAutoConfirm: jest.fn(),
        getAllPrefixed: jest.fn(() => ({})),
        validateRequiredEnv: jest.fn(),
        create: jest.fn(() => createMockConfigInstance()),
        getDefault: jest.fn(() => createMockConfigInstance()),
    };
    return { ...base, ...overrides };
}
