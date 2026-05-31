jest.mock('child_process');
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return { ...actual, readFileSync: jest.fn() };
});

jest.mock('./config', () => {
    const mockCfg = {
        get: jest.fn((key: string) => process.env[key] || undefined),
    };
    return mockCfg;
});

import { spawn, spawnSync, execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { openWithOsOrFallback, openWithFallback, getWinTempDir, getDocsOutputDir } from './open';

const mockSpawn = spawn as jest.Mock;
const mockSpawnSync = spawnSync as jest.Mock;
const mockExecFileSync = execFileSync as jest.Mock;

void mockSpawnSync;
const mockReadFileSync = readFileSync as jest.Mock;

function makeMockChild() {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    return {
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            handlers[event] = handler;
        }),
        unref: jest.fn(),
        trigger(event: string, ...args: unknown[]) {
            const fn = handlers[event] as (...args: unknown[]) => void;
            fn(...args);
        },
    };
}

let defaultChild: ReturnType<typeof makeMockChild>;

describe('openWithOsOrFallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic (mock)');
        defaultChild = makeMockChild();
        mockSpawn.mockReturnValue(defaultChild);
    });

    it('calls fallback on spawn error', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('error');

        const result = await promise;
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('calls fallback on non-zero exit code', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 1);

        const result = await promise;
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('returns true on successful open (exit 0)', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 0);

        const result = await promise;
        expect(result).toBe(true);
        expect(fallback).not.toHaveBeenCalled();
    });

    it('calls fallback when no handler is attached (spawn returns undefined)', async () => {
        mockSpawn.mockReturnValueOnce(undefined);
        const fallback = jest.fn();
        const result = await openWithOsOrFallback('/some/file', fallback);
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('calls fallback when getOsOpenCommand returns null', async () => {
        jest.isolateModules(() => {
            jest.doMock('os', () => ({ platform: jest.fn(() => 'aix') }));
            jest.doMock('fs', () => ({
                ...jest.requireActual('fs'),
                readFileSync: jest.fn().mockReturnValue('Linux version 5.15.0-generic'),
            }));
            const { openWithOsOrFallback: openFn } = require('./open');
            const fallback = jest.fn();
            const result = openFn('/some/file', fallback);
            return result.then((r: boolean) => {
                expect(r).toBe(false);
                expect(fallback).toHaveBeenCalledTimes(1);
            });
        });
    });
});

describe('getOsOpenCommand (platform detection)', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('os', () => ({ platform: jest.fn() }));
    });

    it('returns cmd.exe + wslpath for WSL (linux + Microsoft /proc/version)', () => {
        jest.doMock('fs', () => ({
            ...jest.requireActual('fs'),
            readFileSync: jest.fn().mockReturnValue('Linux version ... Microsoft ...'),
        }));
        jest.doMock('child_process', () => {
            const actual = jest.requireActual('child_process');
            return { ...actual, spawnSync: jest.fn().mockReturnValue({ stdout: 'C:\\Users\\file.html\n', status: 0 }) };
        });

        const os = require('os');
        os.platform.mockReturnValue('linux');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/home/user/file.html');
        expect(result).toEqual({
            cmd: 'cmd.exe',
            args: ['/c', 'start', '', 'C:\\Users\\file.html'],
        });
    });

    it('returns xdg-open for Linux (non-WSL)', () => {
        jest.doMock('fs', () => ({
            ...jest.requireActual('fs'),
            readFileSync: jest.fn().mockReturnValue('Linux version 5.15.0-generic'),
        }));

        const os = require('os');
        os.platform.mockReturnValue('linux');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/home/user/file.html');
        expect(result).toEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('returns open for macOS', () => {
        const os = require('os');
        os.platform.mockReturnValue('darwin');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/some/file');
        expect(result).toEqual({ cmd: 'open', args: ['/some/file'] });
    });

    it('returns cmd for Windows', () => {
        const os = require('os');
        os.platform.mockReturnValue('win32');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('C:\\file.html');
        expect(result).toEqual({ cmd: 'cmd', args: ['/c', 'start', '', 'C:\\file.html'] });
    });

    it('falls back to xdg-open for WSL when toWinPath returns null', () => {
        jest.doMock('fs', () => ({
            ...jest.requireActual('fs'),
            readFileSync: jest.fn().mockReturnValue('Linux version ... Microsoft ...'),
        }));
        jest.doMock('child_process', () => {
            const actual = jest.requireActual('child_process');
            return {
                ...actual,
                spawnSync: jest.fn().mockReturnValue({ stdout: '', error: new Error('ENOENT'), status: null }),
                execFileSync: jest.fn().mockImplementation(() => {
                    throw new Error('ENOENT');
                }),
            };
        });

        const os = require('os');
        os.platform.mockReturnValue('linux');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/home/user/file.html');
        expect(result).toEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });

    it('toWinPath fallback: copies file and converts via wslpath', () => {
        jest.isolateModules(() => {
            const spawnSyncMock = jest
                .fn()
                .mockImplementationOnce(() => ({ stdout: '', error: new Error('ENOENT'), status: null }))
                .mockImplementationOnce(() => ({
                    stdout: 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html\n',
                    status: 0,
                }));
            const execFileSyncMock = jest.fn().mockReturnValue('C:\\Users\\Test\\Temp\n');
            jest.doMock('child_process', () => {
                const actual = jest.requireActual('child_process');
                return { ...actual, spawnSync: spawnSyncMock, execFileSync: execFileSyncMock };
            });
            jest.doMock('fs', () => ({
                readFileSync: jest
                    .fn()
                    .mockReturnValueOnce('Linux version ... Microsoft ...')
                    .mockReturnValueOnce('file content'),
                writeFileSync: jest.fn(),
                mkdirSync: jest.fn(),
            }));

            const os = require('os');
            os.platform.mockReturnValue('linux');
            const { getOsOpenCommand } = require('./open');

            const result = getOsOpenCommand('/home/user/file.html');
            expect(result).toEqual({
                cmd: 'cmd.exe',
                args: ['/c', 'start', '', 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html'],
            });
        });
    });

    it('toWinPath fallback: returns null when writeFileSync throws', () => {
        jest.isolateModules(() => {
            const spawnSyncMock = jest
                .fn()
                .mockImplementationOnce(() => ({ stdout: '', error: new Error('ENOENT'), status: null }));
            const execFileSyncMock = jest.fn().mockReturnValue('C:\\Users\\Test\\Temp\n');
            jest.doMock('child_process', () => {
                const actual = jest.requireActual('child_process');
                return { ...actual, spawnSync: spawnSyncMock, execFileSync: execFileSyncMock };
            });
            jest.doMock('fs', () => ({
                readFileSync: jest
                    .fn()
                    .mockReturnValueOnce('Linux version ... Microsoft ...')
                    .mockReturnValueOnce('file content'),
                writeFileSync: jest.fn().mockImplementation(() => {
                    throw new Error('disk full');
                }),
                mkdirSync: jest.fn(),
            }));

            const os = require('os');
            os.platform.mockReturnValue('linux');
            const { getOsOpenCommand } = require('./open');

            const result = getOsOpenCommand('/home/user/file.html');
            expect(result).toEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
        });
    });

    it('toWinPath fallback: returns null when wslpath output is invalid', () => {
        jest.isolateModules(() => {
            const spawnSyncMock = jest
                .fn()
                .mockImplementationOnce(() => ({ stdout: '', error: new Error('ENOENT'), status: null }))
                .mockImplementationOnce(() => ({ stdout: '/unix/path\n', status: 0 }));
            const execFileSyncMock = jest.fn().mockReturnValue('C:\\Users\\Test\\Temp\n');
            jest.doMock('child_process', () => {
                const actual = jest.requireActual('child_process');
                return { ...actual, spawnSync: spawnSyncMock, execFileSync: execFileSyncMock };
            });
            jest.doMock('fs', () => ({
                readFileSync: jest
                    .fn()
                    .mockReturnValueOnce('Linux version ... Microsoft ...')
                    .mockReturnValueOnce('file content'),
                writeFileSync: jest.fn(),
                mkdirSync: jest.fn(),
            }));

            const os = require('os');
            os.platform.mockReturnValue('linux');
            const { getOsOpenCommand } = require('./open');

            const result = getOsOpenCommand('/home/user/file.html');
            expect(result).toEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
        });
    });

    it('toWinPath: falls through when first wslpath output is not a Windows path', () => {
        jest.isolateModules(() => {
            const spawnSyncMock = jest
                .fn()
                .mockImplementationOnce(() => ({ stdout: '/unix/path\n', status: 0 }))
                .mockImplementationOnce(() => ({
                    stdout: 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html\n',
                    status: 0,
                }));
            const execFileSyncMock = jest.fn().mockReturnValue('C:\\Users\\Test\\Temp\n');
            jest.doMock('child_process', () => {
                const actual = jest.requireActual('child_process');
                return { ...actual, spawnSync: spawnSyncMock, execFileSync: execFileSyncMock };
            });
            jest.doMock('fs', () => ({
                readFileSync: jest
                    .fn()
                    .mockReturnValueOnce('Linux version ... Microsoft ...')
                    .mockReturnValueOnce('file content'),
                writeFileSync: jest.fn(),
                mkdirSync: jest.fn(),
            }));

            const os = require('os');
            os.platform.mockReturnValue('linux');
            const { getOsOpenCommand } = require('./open');

            const result = getOsOpenCommand('/home/user/file.html');
            expect(result).toEqual({
                cmd: 'cmd.exe',
                args: ['/c', 'start', '', 'C:\\Users\\Test\\Temp\\qa_tools_docs\\file.html'],
            });
        });
    });

    it('returns null for unknown platform', () => {
        const os = require('os');
        os.platform.mockReturnValue('aix');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/path');
        expect(result).toBeNull();
    });

    it('does not throw when /proc/version is unreadable', () => {
        jest.doMock('fs', () => ({
            ...jest.requireActual('fs'),
            readFileSync: jest.fn().mockImplementation(() => {
                throw new Error('ENOENT');
            }),
        }));

        const os = require('os');
        os.platform.mockReturnValue('linux');
        const { getOsOpenCommand } = require('./open');

        const result = getOsOpenCommand('/home/user/file.html');
        expect(result).toEqual({ cmd: 'xdg-open', args: ['/home/user/file.html'] });
    });
});

describe('getWinTempDir', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns TEMP when set with Linux path', () => {
        const ORIG_TEMP = process.env.TEMP;
        process.env.TEMP = '/mnt/c/Users/Test/Temp';
        const result = getWinTempDir();
        process.env.TEMP = ORIG_TEMP;
        expect(result).toBe('/mnt/c/Users/Test/Temp');
    });

    it('returns TMP when TEMP not set and TMP has Linux path', () => {
        const ORIG_TEMP = process.env.TEMP;
        const ORIG_TMP = process.env.TMP;
        delete process.env.TEMP;
        process.env.TMP = '/mnt/c/Users/Test/Tmp';
        const result = getWinTempDir();
        process.env.TEMP = ORIG_TEMP;
        process.env.TMP = ORIG_TMP;
        expect(result).toBe('/mnt/c/Users/Test/Tmp');
    });

    it('converts cmd.exe TEMP output to WSL path on success', () => {
        const ORIG_TEMP = process.env.TEMP;
        const ORIG_TMP = process.env.TMP;
        delete process.env.TEMP;
        delete process.env.TMP;
        mockExecFileSync.mockReturnValue('C:\\Users\\Test\\AppData\\Local\\Temp\n');
        const result = getWinTempDir();
        process.env.TEMP = ORIG_TEMP;
        process.env.TMP = ORIG_TMP;
        expect(result).toBe('/mnt/c/Users/Test/AppData/Local/Temp');
    });

    it('returns null when TEMP/TMP empty and cmd.exe fails', () => {
        const ORIG_TEMP = process.env.TEMP;
        const ORIG_TMP = process.env.TMP;
        delete process.env.TEMP;
        delete process.env.TMP;
        mockExecFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const result = getWinTempDir();
        process.env.TEMP = ORIG_TEMP;
        process.env.TMP = ORIG_TMP;
        expect(result).toBeNull();
    });

    it('returns null when execFileSync returns empty string', () => {
        const ORIG_TEMP = process.env.TEMP;
        const ORIG_TMP = process.env.TMP;
        delete process.env.TEMP;
        delete process.env.TMP;
        mockExecFileSync.mockReturnValue('');
        const result = getWinTempDir();
        process.env.TEMP = ORIG_TEMP;
        process.env.TMP = ORIG_TMP;
        expect(result).toBeNull();
    });
});

describe('getDocsOutputDir', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns temp/docs/ path on non-WSL', () => {
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getDocsOutputDir();
        expect(result).toMatch(/\/temp\/docs$/);
    });

    it('returns null on WSL when getWinTempDir fails', () => {
        jest.resetModules();
        jest.doMock('fs', () => {
            const actual = jest.requireActual('fs');
            return { ...actual, readFileSync: jest.fn().mockReturnValue('Linux version ... Microsoft ...') };
        });
        jest.doMock('child_process', () => {
            const actual = jest.requireActual('child_process');
            return {
                ...actual,
                execFileSync: jest.fn().mockImplementation(() => {
                    throw new Error('ENOENT');
                }),
            };
        });
        const { getDocsOutputDir: gdoDir } = require('./open');
        const ORIG_TEMP = process.env.TEMP;
        delete process.env.TEMP;
        const result = gdoDir();
        process.env.TEMP = ORIG_TEMP;
        expect(result).toBeNull();
    });

    it('returns WSL temp path when on WSL and getWinTempDir succeeds', () => {
        jest.resetModules();
        jest.doMock('fs', () => {
            const actual = jest.requireActual('fs');
            return { ...actual, readFileSync: jest.fn().mockReturnValue('Linux version ... Microsoft ...') };
        });
        jest.doMock('child_process', () => {
            const actual = jest.requireActual('child_process');
            return { ...actual, execFileSync: jest.fn().mockReturnValue('C:\\Users\\Test\\Temp\n') };
        });
        const { getDocsOutputDir: gdoDir } = require('./open');
        const ORIG_TEMP = process.env.TEMP;
        delete process.env.TEMP;
        const result = gdoDir();
        process.env.TEMP = ORIG_TEMP;
        expect(result).toMatch(/qa_tools_docs$/);
    });

    it('uses QA_TOOLS_TEMP_DIR when set', () => {
        const ORIG_DIR = process.env.QA_TOOLS_TEMP_DIR;
        process.env.QA_TOOLS_TEMP_DIR = '/custom/temp';
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic');
        const result = getDocsOutputDir();
        process.env.QA_TOOLS_TEMP_DIR = ORIG_DIR;
        expect(result).toMatch(/^\/custom\/temp\/docs$/);
    });
});

describe('openWithFallback', () => {
    /** Counter of spawned children. Each child auto-triggers exit on next tick. */
    function makeAutoSpawn(exitCodes: number[]) {
        let idx = 0;
        mockSpawn.mockImplementation(() => {
            const code = exitCodes[idx++];
            const child = makeMockChild();
            // Intentional: simulate async child process exit on next tick
            setTimeout(() => child.trigger('exit', code), 0);
            return child;
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic (mock)');
        defaultChild = makeMockChild();
        mockSpawn.mockReturnValue(defaultChild);
    });

    it('logs browser success on exit 0', async () => {
        const logInfo = jest.fn();
        makeAutoSpawn([0]);

        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith('Relatório aberto no navegador');
    });

    it('opens directory when browser fails', async () => {
        const logInfo = jest.fn();
        makeAutoSpawn([1, 0]);

        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith(
            'Relatório salvo. Navegador indisponível, pasta aberta no gerenciador de arquivos.',
        );
    });

    it('logs file path when both browser and directory fail', async () => {
        const logInfo = jest.fn();
        makeAutoSpawn([1, 1]);

        await openWithFallback('/tmp/report.html', 'Relatório', logInfo);

        expect(logInfo).toHaveBeenCalledWith('Relatório salvo em: /tmp/report.html');
    });
});
