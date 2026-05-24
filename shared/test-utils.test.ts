import { createConsoleSpies, restoreConsoleSpies, withEnv } from './test-utils';

describe('createConsoleSpies', () => {
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

describe('restoreConsoleSpies', () => {
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

describe('withEnv', () => {
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

describe('integration: createConsoleSpies + restoreConsoleSpies', () => {
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
