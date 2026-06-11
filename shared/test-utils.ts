import type { Logger } from './logger.js';
import type { Mock } from 'vitest';
import { createMockContext } from './test-utils/factories/context-factory.js';

type MockLogger = {
    info: Mock;
    error: Mock;
    warn: Mock;
    debug: Mock;
    writeFileOnly: Mock;
    filePath?: string | undefined;
};

/** Helper for null-handling tests: pass `null` where T is expected.
 *  Centralises the `null as unknown as T` pattern in one place.
 *  Exported for use in test files that need to verify null-safety. */
export function nullAs<T>(): T {
    return null as unknown as T;
}

/** Helper for undefined-handling tests: pass `undefined` where T is expected.
 *  Centralises the `undefined as unknown as T` pattern in one place.
 *  Exported for use in test files that need to verify undefined-safety. */
export function undefinedAs<T>(): T {
    return undefined as unknown as T;
}

/** Create a minimal Logger-compatible mock with all Logger public fields.
 *  Every method is a vi.fn(); properties are set to null/empty defaults. */
export function createMockLogger(): Logger {
    return {
        context: {},
        _logDir: null,
        _filePathCached: null,
        _fileError: false,
        _bytesWritten: 0,
        _maxLogSize: 0,
        _config: null,
        filePath: null,
        _ensureDir: vi.fn(),
        _rotateIfNeeded: vi.fn(),
        _writeConsole: vi.fn(),
        _writeFile: vi.fn(),
        _write: vi.fn(),
        child: vi.fn(),
        writeFileOnly: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

export function createMockRootLogger(filePath?: string): MockLogger {
    return {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        writeFileOnly: vi.fn(),
        filePath,
    };
}

export function createConsoleSpies() {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    return { log, error, warn };
}

export function restoreConsoleSpies(spies: ReturnType<typeof createConsoleSpies>): void {
    spies.log.mockRestore();
    spies.error.mockRestore();
    spies.warn.mockRestore();
}

/** Create a mock CommandContext with standard default fields for handler tests.
 *  Each call produces fresh `vi.fn()` instances, so tests are isolated.
 *  Delegates to `createMockContext()` for type-safe defaults, then merges
 *  overrides using `Record<string, unknown>` to preserve loose-override
 *  compatibility (e.g. partial mocks, extra fields on ctx).
 *  @param overrides - Top-level fields to override. `ctx` is deep-merged.
 *  @returns A `Mocked<CommandContext>` compatible with handler signatures. */
export function makeMockCommandContext(overrides: Record<string, unknown> = {}): ReturnType<typeof createMockContext> {
    const ctx = {
        project_name: 'TEST',
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        sessionCounters: [],
        isBusy: false,
        results: [],
    };
    const mergedOverrides = { ...overrides };
    if (overrides['ctx'] && typeof overrides['ctx'] === 'object' && !Array.isArray(overrides['ctx'])) {
        mergedOverrides['ctx'] = { ...ctx, ...(overrides['ctx'] as Record<string, unknown>) };
    }
    return { ...createMockContext(), ...mergedOverrides };
}

/** Assert that a value is non-nullable at runtime, with a type-safe return.
 *  Replaces `x!` in tests with a verifiable check: `nonNull(x).property`.
 *  @throws if `value` is `null` or `undefined`. */
export function nonNull<T>(value: T, msg?: string): NonNullable<T> {
    if (value == null) throw new Error(msg ?? `Expected non-nullable value, got ${String(value)}`);
    return value;
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
