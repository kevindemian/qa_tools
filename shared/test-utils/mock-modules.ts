/**
 * Reusable Mock Module Factories
 *
 * Factories for creating mock objects used in vi.mock() calls.
 * All factories support overrides for flexibility.
 *
 * @module mock-modules
 */

import { vi, type Mock } from 'vitest';
import type { JsonObject } from '../types/common.js';

/**
 * Mock Logger Module
 * Creates a mock object compatible with vi.mock('../shared/logger', ...)
 *
 * @returns Object with Logger constructor and rootLogger
 */
export function mockLoggerModule() {
    return {
        Logger: vi.fn().mockImplementation(function () {
            return { error: vi.fn(), warn: vi.fn() };
        }),
        rootLogger: { error: vi.fn(), warn: vi.fn() },
    };
}

/**
 * Mock Prompt Module Type
 * Defines the shape of the mock prompt module
 */
export type MockPromptModule = {
    print: Mock;
    success: Mock;
    warn: Mock;
    info: Mock;
    title: Mock;
    prompt: Mock;
    confirm: Mock;
    printError: Mock;
    error: Mock;
    withSpinner: Mock;
    extractErrorMessage: Mock;
    smartPrompt: Mock;
    ask: Mock;
};

/**
 * Mock Prompt Module (full with overrides)
 * Creates a mock object compatible with vi.mock('../shared/prompt', ...)
 *
 * @param overrides - Partial overrides to apply to the default mock
 * @returns Object with all prompt functions
 */
export function mockPromptModule(overrides?: Partial<MockPromptModule>): MockPromptModule {
    const defaults: MockPromptModule = {
        print: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        title: vi.fn(),
        prompt: vi.fn(),
        confirm: vi.fn(),
        printError: vi.fn(),
        error: vi.fn(),
        withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
        extractErrorMessage: vi.fn((err: Error) => err.message || 'Erro desconhecido'),
        smartPrompt: vi.fn(),
        ask: vi.fn(),
    };
    return { ...defaults, ...overrides };
}

/**
 * Mock Prompt Module (minimal — only extractErrorMessage)
 * Creates a minimal mock object for tests that only need extractErrorMessage
 *
 * @returns Object with info and extractErrorMessage functions
 */
export function mockPromptModuleMinimal() {
    return {
        info: vi.fn(),
        extractErrorMessage: vi.fn((err: Error) => err.message || 'Erro desconhecido'),
    };
}

/**
 * Mock GitProviderError
 * Creates a mock object compatible with vi.mock('../shared/git-provider-error', ...)
 *
 * @returns Object with handleError function
 */
export function mockGitProviderError() {
    return {
        handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
            if (opts?.returnNull) return null;
            throw err;
        }),
    };
}

/**
 * Mock HttpClient Module
 * Creates a mock object compatible with vi.mock('../shared/http-client', ...)
 *
 * @returns Object with HttpClient constructor
 */
export function mockHttpClientModule() {
    return {
        HttpClient: vi.fn().mockImplementation(() => ({})),
    };
}

/**
 * Mock Session State Module
 * Creates a mock object compatible with vi.mock('../shared/session-state', ...)
 *
 * @param overrides - Partial overrides to apply to the default mock
 * @returns Object with session state functions
 */
export function mockSessionStateModule(overrides?: Partial<{ currentProjectName: string; currentProvider: string }>) {
    return {
        pushHistory: vi.fn(),
        printSessionSummary: vi.fn(),
        createManagerForProject: vi.fn(),
        setCurrentProjectName: vi.fn(),
        setProjectId: vi.fn(),
        setManager: vi.fn(),
        getProjects: vi.fn(() => ({})),
        currentProjectName: '',
        currentProvider: 'gitlab',
        ...overrides,
    };
}

/**
 * Mock State Module
 * Creates a mock object compatible with vi.mock('../shared/state', ...)
 *
 * @returns Object with load and update functions
 */
export function mockStateModule() {
    return {
        load: vi.fn(() => ({})),
        update: vi.fn((fn: (s: JsonObject) => void) => {
            const s: JsonObject = {};
            fn(s);
            return s;
        }),
    };
}

/**
 * Mock Config Module
 * Creates a mock object compatible with vi.mock('../shared/config', ...)
 *
 * @param overrides - Partial overrides to apply to the default mock
 * @returns Object with __esModule flag and default export
 */
export function mockConfigModule(overrides?: Partial<{ jiraProject: string }>) {
    return {
        __esModule: true,
        default: {
            jiraProject: 'TEST',
            get: vi.fn((key: string) => Reflect.get(process.env, key) || undefined),
            ...overrides,
        },
    };
}
