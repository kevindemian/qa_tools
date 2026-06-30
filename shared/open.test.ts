vi.mock('child_process', () => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('os', () => ({
    platform: vi.fn<(...args: []) => () => string>(),
}));
vi.mock('fs', () => ({
    readFileSync: vi.fn<(...args: [string, string?]) => (path: string, encoding?: string) => string>(),
    writeFileSync: vi.fn<(...args: [string, string]) => (path: string, data: string) => void>(),
    mkdirSync: vi.fn<(...args: [string]) => (path: string) => string | undefined>(),
}));
const mockConfigGet: Mock<(...args: [string]) => string | undefined> = vi.hoisted(() =>
    vi.fn((key: string) => Reflect.get(process.env, key) || undefined),
);
vi.mock('./config', () => ({
    default: { get: mockConfigGet },
}));

import { spawn, spawnSync, execFileSync } from 'child_process';
import type { Mock } from 'vitest';
import { platform } from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import {
    openWithOsOrFallback,
    openWithFallback,
    getWinTempDir,
    getDocsOutputDir,
    getOsOpenCommand,
    __resetWslCache,
} from './open.js';

const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);
const mockExecFileSync = vi.mocked(execFileSync);
const mockPlatform = vi.mocked(platform);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

void mockSpawnSync;

function makeMockChild() {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const _stdio: [null, null, null, null, null] = [null, null, null, null, null];
    return {
        stdin: null,
        stdout: null,
        stderr: null,
        stdio: _stdio,
        killed: false,
        connected: false,
        exitCode: null,
        signalCode: null,
        spawnargs: [] as string[],
        spawnfile: '',
        kill: vi.fn(),
        send: vi.fn(),
        disconnect: vi.fn(),
        ref: vi.fn(),
        unref: vi.fn(),
        on(event: string, handler: (...args: unknown[]) => void) {
            Reflect.set(handlers, event, handler);
            return this;
        },
        once() {
            return this;
        },
        emit: vi.fn(),
        addListener() {
            return this;
        },
        removeListener() {
            return this;
        },
        removeAllListeners() {
            return this;
        },
        listeners: vi.fn(),
        listenerCount: vi.fn(),
        eventNames: vi.fn(),
        rawListeners: vi.fn(),
        prependListener() {
            return this;
        },
        prependOnceListener() {
            return this;
        },
        off() {
            return this;
        },
        getMaxListeners: vi.fn(),
        setMaxListeners: vi.fn(),
        [Symbol.dispose]() {
            /* noop */
        },
        trigger(event: string, ...args: unknown[]) {
            const fn = Reflect.get(handlers, event);
            fn(...args);
        },
    };
}

type MockChild = ReturnType<typeof makeMockChild>;
let defaultChild: MockChild;

function commonBeforeEach(): void {
    vi.resetAllMocks();
    mockPlatform.mockReturnValue('linux');
    mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic (mock)');
    defaultChild = makeMockChild();
    mockSpawn.mockReturnValue(defaultChild);
}

describe('OpenWithOsOrFallback', () => {
    beforeEach(commonBeforeEach);

    it('calls fallback on spawn error', async () => {
        expect.hasAssertions();

        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);
        const fallback = vi.fn();
        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('error');
        const result = await promise;

        expect(result).toBeFalsy();
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('calls fallback on non-zero exit code', async () => {
        expect.hasAssertions();

        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);
        const fallback = vi.fn();
        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 1);
        const result = await promise;

        expect(result).toBeFalsy();
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('returns true on successful open (exit 0)', async () => {
        expect.hasAssertions();

        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);
        const fallback = vi.fn();
        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 0);
        const result = await promise;

        expect(result).toBeTruthy();
        expect(fallback).not.toHaveBeenCalled();
    });

    it('calls fallback when no handler is attached', async () => {
        expect.hasAssertions();

        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);
        const fallback = vi.fn();
        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('error');
        const result = await promise;

        expect(result).toBeFalsy();
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('calls fallback when getOsOpenCommand returns null', async () => {
        expect.hasAssertions();

        mockPlatform.mockReturnValue('aix');
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const fallback = vi.fn();
        const result = await openWithOsOrFallback('/some/file', fallback);

        expect(result).toBeFalsy();
        expect(fallback).toHaveBeenCalledTimes(1);
    });
});

describe('GetOsOpenCommand (platform detection)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        __resetWslCache();
    });

    it('returns cmd.exe + wslpath for WSL (linux + Microsoft /proc/version)', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValue('Linux version ... Microsoft ...');
        mockSpawnSync.mockReturnValue({ stdout: 'C:\\Users\\file.html\n', status: 0 } as never);
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({
            cmd: 'cmd.exe',
            args: ['/c', 'start', '', 'C:\\Users\\file.html'],
        });
    });

    it('returns xdg-open for Linux (non-WSL)', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('returns open for macOS', () => {
        mockPlatform.mockReturnValue('darwin');
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getOsOpenCommand('/some/file');

        expect(result).toStrictEqual({ cmd: 'open', args: ['/some/file'] });
    });

    it('returns cmd for Windows', () => {
        mockPlatform.mockReturnValue('win32');
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getOsOpenCommand('C:\\file.html');

        expect(result).toStrictEqual({ cmd: 'cmd', args: ['/c', 'start', '', 'C:\\file.html'] });
    });

    it('falls back to xdg-open for WSL when toWinPath returns null', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValue('Linux version ... Microsoft ...');
        mockSpawnSync.mockReturnValue({ stdout: '', error: new Error('ENOENT'), status: null } as never);
        mockExecFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('toWinPath fallback: copies file and converts via wslpath', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValueOnce('Linux version ... Microsoft ...').mockReturnValueOnce('file content');
        mockWriteFileSync.mockReturnValue();
        mockMkdirSync.mockReturnValue(undefined);
        mockSpawnSync
            .mockReturnValueOnce({ stdout: '', error: new Error('ENOENT'), status: null } as never)
            .mockReturnValueOnce({
                stdout: 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html\n',
                status: 0,
            } as never);
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\Temp\n');
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({
            cmd: 'cmd.exe',
            args: ['/c', 'start', '', 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html'],
        });
    });

    it('toWinPath fallback: returns null when writeFileSync throws', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValueOnce('Linux version ... Microsoft ...').mockReturnValueOnce('file content');
        mockWriteFileSync.mockImplementation(() => {
            throw new Error('disk full');
        });
        mockMkdirSync.mockReturnValue(undefined);
        mockSpawnSync.mockReturnValueOnce({
            stdout: '',
            error: new Error('ENOENT'),
            status: null,
        } as never);
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\Temp\n');
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('toWinPath fallback: returns null when wslpath output is invalid', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValueOnce('Linux version ... Microsoft ...').mockReturnValueOnce('file content');
        mockWriteFileSync.mockReturnValue();
        mockMkdirSync.mockReturnValue(undefined);
        mockSpawnSync
            .mockReturnValueOnce({ stdout: '', error: new Error('ENOENT'), status: null } as never)
            .mockReturnValueOnce({ stdout: '/unix/path\n', status: 0 } as never);
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\Temp\n');
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('toWinPath: falls through when first wslpath output is not a Windows path', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockReturnValueOnce('Linux version ... Microsoft ...').mockReturnValueOnce('file content');
        mockWriteFileSync.mockReturnValue();
        mockMkdirSync.mockReturnValue(undefined);
        mockSpawnSync.mockReturnValueOnce({ stdout: '/unix/path\n', status: 0 } as never).mockReturnValueOnce({
            stdout: 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html\n',
            status: 0,
        } as never);
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\Temp\n');
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({
            cmd: 'cmd.exe',
            args: ['/c', 'start', '', 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html'],
        });
    });

    it('returns null for unknown platform', () => {
        mockPlatform.mockReturnValue('aix');
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getOsOpenCommand('/path');

        expect(result).toBeNull();
    });

    it('does not throw when /proc/version is unreadable', () => {
        mockPlatform.mockReturnValue('linux');
        mockReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = getOsOpenCommand('/home/user/file.html');

        expect(result).toStrictEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });
});

describe('GetWinTempDir', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns TEMP when set with Linux path', () => {
        const origTemp = process.env['TEMP'];
        process.env['TEMP'] = '/mnt/c/Users/Test/Temp';
        const result = getWinTempDir();
        process.env['TEMP'] = origTemp;

        expect(result).toBe('/mnt/c/Users/Test/Temp');
    });

    it('returns TMP when TEMP not set and TMP has Linux path', () => {
        const origTemp = process.env['TEMP'];
        const origTmp = process.env['TMP'];
        delete process.env['TEMP'];
        process.env['TMP'] = '/mnt/c/Users/Test/Tmp';
        const result = getWinTempDir();
        process.env['TEMP'] = origTemp;
        process.env['TMP'] = origTmp;

        expect(result).toBe('/mnt/c/Users/Test/Tmp');
    });

    it('converts cmd.exe TEMP output to WSL path on success', () => {
        const origTemp = process.env['TEMP'];
        const origTmp = process.env['TMP'];
        delete process.env['TEMP'];
        delete process.env['TMP'];
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\AppData\\Local\\Temp\n');
        const result = getWinTempDir();
        process.env['TEMP'] = origTemp;
        process.env['TMP'] = origTmp;

        expect(result).toBe('/mnt/c/Users/Test/AppData/Local/Temp');
    });

    it('returns null when TEMP/TMP empty and cmd.exe fails', () => {
        const origTemp = process.env['TEMP'];
        const origTmp = process.env['TMP'];
        delete process.env['TEMP'];
        delete process.env['TMP'];
        mockExecFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = getWinTempDir();
        process.env['TEMP'] = origTemp;
        process.env['TMP'] = origTmp;

        expect(result).toBeNull();
    });

    it('returns null when execFileSync returns empty string', () => {
        const origTemp = process.env['TEMP'];
        const origTmp = process.env['TMP'];
        delete process.env['TEMP'];
        delete process.env['TMP'];
        mockExecFileSync.mockReturnValue('');
        const result = getWinTempDir();
        process.env['TEMP'] = origTemp;
        process.env['TMP'] = origTmp;

        expect(result).toBeNull();
    });
});

describe('GetDocsOutputDir', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockConfigGet.mockImplementation((key: string) => Reflect.get(process.env, key) || undefined);
        __resetWslCache();
    });

    it('returns temp/docs/ path on non-WSL', () => {
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getDocsOutputDir();

        expect(result).toMatch(/\/temp\/docs$/);
    });

    it('returns null on WSL when getWinTempDir fails', () => {
        mockReadFileSync.mockReturnValue('Linux version ... Microsoft ...');
        mockExecFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const origTemp = process.env['TEMP'];
        delete process.env['TEMP'];
        const result = getDocsOutputDir();
        process.env['TEMP'] = origTemp;

        expect(result).toBeNull();
    });

    it('returns WSL temp path when on WSL and getWinTempDir succeeds', () => {
        mockReadFileSync.mockReturnValue('Linux version ... Microsoft ...');
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\Temp\n');
        const origTemp = process.env['TEMP'];
        delete process.env['TEMP'];
        const result = getDocsOutputDir();
        process.env['TEMP'] = origTemp;

        expect(result).toMatch(/qa_tools_docs$/);
    });

    it('uses QA_TOOLS_TEMP_DIR when set', () => {
        const origDir = process.env['QA_TOOLS_TEMP_DIR'];
        process.env['QA_TOOLS_TEMP_DIR'] = '/custom/temp';
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getDocsOutputDir();
        process.env['QA_TOOLS_TEMP_DIR'] = origDir;

        expect(result).toMatch(/^\/custom\/temp\/docs$/);
    });
});

describe('OpenWithFallback', () => {
    function makeAutoSpawn(exitCodes: number[]) {
        let idx = 0;
        mockSpawn.mockImplementation(() => {
            const code = exitCodes[idx++];
            const child = makeMockChild();
            setTimeout(() => child.trigger('exit', code), 0);
            return child;
        });
    }

    beforeEach(commonBeforeEach);

    it('logs browser success on exit 0', async () => {
        expect.hasAssertions();

        const logInfo = vi.fn();
        makeAutoSpawn([0]);
        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith('Relatório aberto no navegador');
    });

    it('opens directory when browser fails', async () => {
        expect.hasAssertions();

        const logInfo = vi.fn();
        makeAutoSpawn([1, 0]);
        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith(
            'Relatório salvo. Navegador indisponível, pasta aberta no gerenciador de arquivos.',
        );
    });

    it('logs file path when both browser and directory fail', async () => {
        expect.hasAssertions();

        const logInfo = vi.fn();
        makeAutoSpawn([1, 1]);
        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith('Relatório salvo em: /tmp/report.html');
    });
});
