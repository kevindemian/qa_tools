import {
    createConsoleSpies,
    nonNull,
    restoreConsoleSpies,
    withEnv,
    makeMockCommandContext,
    nullAs,
    undefinedAs,
} from './test-utils.js';

describe('nullAs', () => {
    it('returns null typed as T', async () => {
        const v = nullAs<{ x: number }>();
        expect(v).toBeNull();
    });
});

describe('undefinedAs', () => {
    it('returns undefined typed as T', async () => {
        const v = undefinedAs<{ x: number }>();
        expect(v).toBeUndefined();
    });
});

describe('makeMockCommandContext', () => {
    it('returns a context with all standard fields', async () => {
        const ctx = makeMockCommandContext();
        expect(ctx).toHaveProperty('jiraResource');
        expect(ctx).toHaveProperty('jiraResourceXray');
        expect(ctx).toHaveProperty('linkManager');
        expect(ctx).toHaveProperty('linkManagerXray');
        expect(ctx).toHaveProperty('csvResource');
        expect(ctx.base_url).toBe('https://jira.test.com');
        expect(ctx).toHaveProperty('ctx');
        expect(typeof ctx.pushHistory).toBe('function');
        expect(typeof ctx.printSessionSummary).toBe('function');
        expect(typeof ctx.sessionLog).toBe('object');
    });

    it('returns correct type assignable to CommandContext', async () => {
        const ctx = makeMockCommandContext();
        expect(ctx.base_url).toBe('https://jira.test.com');
    });

    it('creates fresh jest mock functions each call', async () => {
        const a = makeMockCommandContext();
        const b = makeMockCommandContext();
        expect(a.pushHistory).not.toBe(b.pushHistory);
    });

    it('overrides top-level fields', async () => {
        const ctx = makeMockCommandContext({ base_url: 'https://custom.test.com' });
        expect(ctx.base_url).toBe('https://custom.test.com');
    });

    it('shallow-merges ctx overrides with default ctx', async () => {
        const ctx = makeMockCommandContext({ ctx: { project_name: 'OVERWRITE' } });
        expect(ctx.ctx.project_name).toBe('OVERWRITE');
    });

    it('ctx override replaces default field with same key', async () => {
        const ctx = makeMockCommandContext({ ctx: { project_name: 'OVERRIDE' } });
        expect(ctx.ctx.project_name).toBe('OVERRIDE');
    });
});

describe('nonNull', () => {
    it('returns the value when non-null', async () => {
        expect(nonNull(42)).toBe(42);
    });

    it('returns the value for empty string', async () => {
        expect(nonNull('')).toBe('');
    });

    it('returns the value for zero', async () => {
        expect(nonNull(0)).toBe(0);
    });

    it('throws for null', async () => {
        expect(() => nonNull(null)).toThrow('Expected non-nullable value');
    });

    it('throws for undefined', async () => {
        expect(() => nonNull(undefined)).toThrow('Expected non-nullable value');
    });

    it('uses custom error message', async () => {
        expect(() => nonNull(null, 'my message')).toThrow('my message');
    });

    it('narrows the type for subsequent access', async () => {
        const x: string | null = 'hello';
        const result = nonNull(x);
        expect(result.length).toBe(5);
    });
});

describe('createConsoleSpies', () => {
    it('creates spy objects for log, error, warn', async () => {
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

    it('mocks console.log so it does not output', async () => {
        const spies = createConsoleSpies();
        console.log('should not appear');
        expect(spies.log).toHaveBeenCalledWith('should not appear');
        restoreConsoleSpies(spies);
    });

    it('mocks console.error so it does not output', async () => {
        const spies = createConsoleSpies();
        console.error('error msg');
        expect(spies.error).toHaveBeenCalledWith('error msg');
        restoreConsoleSpies(spies);
    });

    it('mocks console.warn so it does not output', async () => {
        const spies = createConsoleSpies();
        console.warn('warn msg');
        expect(spies.warn).toHaveBeenCalledWith('warn msg');
        restoreConsoleSpies(spies);
    });
});

describe('restoreConsoleSpies', () => {
    it('restores console methods', async () => {
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

describe('withEnv', () => {
    it('sets env vars and returns cleanup function', async () => {
        const key = 'TEST_ENV_VAR_123';
        delete process.env[key];

        const cleanup = withEnv({ [key]: 'hello' });
        expect(process.env[key]).toBe('hello');

        cleanup();
        expect(process.env[key]).toBeUndefined();
    });

    it('with undefined value deletes the key', async () => {
        const key = 'TEST_ENV_VAR_DELETE';
        process.env[key] = 'temp';

        const cleanup = withEnv({ [key]: undefined });
        expect(process.env[key]).toBeUndefined();

        cleanup();
        expect(process.env[key]).toBe('temp');
        delete process.env[key];
    });

    it('restores previous value on cleanup', async () => {
        const key = 'TEST_ENV_VAR_PREV';
        process.env[key] = 'original';

        const cleanup = withEnv({ [key]: 'modified' });
        expect(process.env[key]).toBe('modified');

        cleanup();
        expect(process.env[key]).toBe('original');
        delete process.env[key];
    });
});

describe('integration: createConsoleSpies + restoreConsoleSpies', () => {
    it('verifies console methods are mocked then restored', async () => {
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
