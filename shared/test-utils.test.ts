import {
    createConsoleSpies,
    nonNull,
    restoreConsoleSpies,
    withEnv,
    makeMockCommandContext,
    nullAs,
    undefinedAs,
} from './test-utils.js';

describe('NullAs', () => {
    it('returns null typed as T', () => {
        const v = nullAs<{ x: number }>();

        expect(v).toBeNull();
    });
});

describe('UndefinedAs', () => {
    it('returns undefined typed as T', () => {
        const v = undefinedAs<{ x: number }>();

        expect(v).toBeUndefined();
    });
});

describe('MakeMockCommandContext', () => {
    it('returns a context with all standard fields', () => {
        const ctx = makeMockCommandContext();

        const propTypes = ['jiraResource', 'jiraResourceXray', 'linkManager', 'linkManagerXray', 'csvResource'];

        expect(propTypes.every((p) => Object.prototype.hasOwnProperty.call(ctx, p))).toBeTruthy();
        expect(ctx.base_url).toBe('https://jira.test.com');
        expect(ctx).toHaveProperty('ctx');

        const fns = ['pushHistory', 'printSessionSummary'] as const;

        expect(fns.every((f) => typeof ctx[f] === 'function')).toBeTruthy();
        expect(typeof ctx.sessionLog).toBe('object');
    });

    it('returns correct type assignable to CommandContext', () => {
        const ctx = makeMockCommandContext();

        expect(ctx.base_url).toBe('https://jira.test.com');
    });

    it('creates fresh jest mock functions each call', () => {
        const a = makeMockCommandContext();
        const b = makeMockCommandContext();

        expect(a.pushHistory).not.toBe(b.pushHistory);
    });

    it('overrides top-level fields', () => {
        const ctx = makeMockCommandContext({ base_url: 'https://custom.test.com' });

        expect(ctx.base_url).toBe('https://custom.test.com');
    });

    it('shallow-merges ctx overrides with default ctx', () => {
        const ctx = makeMockCommandContext({ ctx: { project_name: 'OVERWRITE' } });

        expect(ctx.ctx.project_name).toBe('OVERWRITE');
    });

    it('ctx override replaces default field with same key', () => {
        const ctx = makeMockCommandContext({ ctx: { project_name: 'OVERRIDE' } });

        expect(ctx.ctx.project_name).toBe('OVERRIDE');
    });
});

describe('NonNull', () => {
    it('returns the value when non-null', () => {
        expect(nonNull(42)).toBe(42);
    });

    it('returns the value for empty string', () => {
        expect(nonNull('')).toBe('');
    });

    it('returns the value for zero', () => {
        expect(nonNull(0)).toBe(0);
    });

    it('throws for null', () => {
        expect(() => nonNull(null)).toThrow('Expected non-nullable value');
    });

    it('throws for undefined', () => {
        expect(() => nonNull(undefined)).toThrow('Expected non-nullable value');
    });

    it('uses custom error message', () => {
        expect(() => nonNull(null, 'my message')).toThrow('my message');
    });

    it('narrows the type for subsequent access', () => {
        const x: string | null = 'hello';
        const result = nonNull(x);

        expect(result).toHaveLength(5);
    });
});

describe('CreateConsoleSpies', () => {
    it('creates spy objects for log, error, warn', () => {
        const spies = createConsoleSpies();

        expect(spies).toHaveProperty('log');
        expect(spies).toHaveProperty('error');
        expect(spies).toHaveProperty('warn');
        expect(typeof spies.log).toBe('function');
        expect(typeof spies.error).toBe('function');
        expect(typeof spies.warn).toBe('function');

        spies.log.mockRestore();
        spies.error.mockRestore();
        spies.warn.mockRestore();
    });

    it('mocks console.log so it does not output', () => {
        const spies = createConsoleSpies();
        console.log('should not appear');

        expect(spies.log).toHaveBeenCalledWith('should not appear');

        restoreConsoleSpies(spies);
    });

    it('mocks console.error so it does not output', () => {
        const spies = createConsoleSpies();
        console.error('error msg');

        expect(spies.error).toHaveBeenCalledWith('error msg');

        restoreConsoleSpies(spies);
    });

    it('mocks console.warn so it does not output', () => {
        const spies = createConsoleSpies();
        console.warn('warn msg');

        expect(spies.warn).toHaveBeenCalledWith('warn msg');

        restoreConsoleSpies(spies);
    });
});

describe('RestoreConsoleSpies', () => {
    it('restores console methods', () => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const spies = createConsoleSpies();

        expect(console.log).not.toBe(originalLog);
        expect(console.error).not.toBe(originalError);
        expect(console.warn).not.toBe(originalWarn);

        restoreConsoleSpies(spies);

        expect(console.log).toBe(originalLog);
        expect(console.error).toBe(originalError);
        expect(console.warn).toBe(originalWarn);
    });
});

describe('WithEnv', () => {
    it('sets env vars and returns cleanup function', () => {
        const key = 'TEST_ENV_VAR_123';
        delete process.env[key];

        const cleanup = withEnv({ [key]: 'hello' });

        expect(process.env[key]).toBe('hello');

        cleanup();

        expect(process.env[key]).toBeUndefined();
    });

    it('with undefined value deletes the key', () => {
        const key = 'TEST_ENV_VAR_DELETE';
        process.env[key] = 'temp';

        const cleanup = withEnv({ [key]: undefined });

        expect(process.env[key]).toBeUndefined();

        cleanup();

        expect(process.env[key]).toBe('temp');

        delete process.env[key];
    });

    it('restores previous value on cleanup', () => {
        const key = 'TEST_ENV_VAR_PREV';
        process.env[key] = 'original';

        const cleanup = withEnv({ [key]: 'modified' });

        expect(process.env[key]).toBe('modified');

        cleanup();

        expect(process.env[key]).toBe('original');

        delete process.env[key];
    });
});

describe('Integration: createConsoleSpies + restoreConsoleSpies', () => {
    it('verifies console methods are mocked then restored', () => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const spies = createConsoleSpies();
        console.log('a');
        console.error('b');
        console.warn('c');

        expect(spies.log).toHaveBeenCalledWith('a');
        expect(spies.error).toHaveBeenCalledWith('b');
        expect(spies.warn).toHaveBeenCalledWith('c');

        restoreConsoleSpies(spies);

        expect(console.log).toBe(originalLog);
        expect(console.error).toBe(originalError);
        expect(console.warn).toBe(originalWarn);
    });
});
