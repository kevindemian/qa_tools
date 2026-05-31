import { jest } from '@jest/globals';

type MockLogger = {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
    writeFileOnly: jest.Mock;
    filePath?: string;
};

export function createMockRootLogger(filePath?: string): MockLogger {
    return {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        writeFileOnly: jest.fn(),
        filePath,
    };
}

export function createConsoleSpies() {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    return { log, error, warn };
}

export function restoreConsoleSpies(spies: ReturnType<typeof createConsoleSpies>): void {
    spies.log.mockRestore();
    spies.error.mockRestore();
    spies.warn.mockRestore();
}

/** Create a mock CommandContext with standard default fields for handler tests.
 * Each call produces fresh `jest.fn()` instances, so tests are isolated.
 * When `overrides.ctx` is provided, it is shallow-merged into the default ctx
 * rather than replacing it entirely.
 * @param overrides - Top-level fields to override. `ctx` is deep-merged.
 * @returns A `Record<string, unknown>` compatible with `CommandContext` */
export function makeMockCommandContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const ctx = {
        project_name: 'TEST',
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        sessionCounters: [],
        isBusy: false,
        results: [],
    };
    const mergedOverrides = { ...overrides };
    if (overrides.ctx && typeof overrides.ctx === 'object' && !Array.isArray(overrides.ctx)) {
        mergedOverrides.ctx = { ...ctx, ...(overrides.ctx as Record<string, unknown>) };
    }
    return {
        jiraResource: {},
        jiraResourceXray: {},
        linkManager: {},
        linkManagerXray: {},
        csvResource: {},
        ctx,
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: 'https://jira.test.com',
        sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) },
        ...mergedOverrides,
    };
}

export function withEnv(env: Record<string, string | undefined>): () => void {
    const prev: Record<string, string | undefined> = {};
    for (const key of Object.keys(env)) {
        prev[key] = process.env[key];
        if (env[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = env[key];
        }
    }
    return () => {
        for (const key of Object.keys(env)) {
            if (prev[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = prev[key];
            }
        }
    };
}
