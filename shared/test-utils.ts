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
