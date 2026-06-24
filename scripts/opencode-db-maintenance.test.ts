/**
 * Tests for opencode-db-maintenance.ts
 *
 * Mocks child_process.execFileSync and fs methods to avoid
 * requiring a real SQLite database or sqlite3 CLI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockStatSync = vi.fn();

vi.unmock('../shared/deps.js');

vi.mock('node:child_process', () => ({
    execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    copyFileSync: mockCopyFileSync,
    statSync: mockStatSync,
    default: {
        existsSync: mockExistsSync,
        mkdirSync: mockMkdirSync,
        copyFileSync: mockCopyFileSync,
        statSync: mockStatSync,
    },
}));

let DB_PATH: string;
async function loadModule() {
    const mod = await import('./opencode-db-maintenance.js');
    DB_PATH = mod.DB_PATH;
    return mod;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockCopyFileSync.mockReturnValue(undefined);
    mockStatSync.mockReturnValue({ dev: 1, isFile: () => true });
    mockExecFileSync.mockImplementation((bin: string, args: string[], _opts?: unknown) => {
        if (bin === 'stat') {
            return '65536\n';
        }
        if (bin === 'sqlite3') {
            const sqlCmd = args[1];
            if (sqlCmd === 'PRAGMA journal_mode=WAL;') {
                return 'wal\n';
            }
            if (sqlCmd === 'PRAGMA integrity_check;') {
                return 'ok\n';
            }
            if (sqlCmd === 'PRAGMA wal_checkpoint(TRUNCATE);') {
                return '0,0,0\n';
            }
            if (sqlCmd === 'PRAGMA quick_check;') {
                return 'ok\n';
            }
            if (sqlCmd === 'REINDEX;') {
                return '';
            }
            if (sqlCmd === 'VACUUM;') {
                return '';
            }
            if (sqlCmd === 'PRAGMA journal_mode=DELETE;') {
                return 'delete\n';
            }
            return '';
        }
        return '';
    });
});

describe('DB constants', () => {
    it('dB_DIR is derived from homedir and ends with share/opencode', async () => {expect.hasAssertions();

        const { DB_DIR: dir } = await loadModule();

        expect(dir).toContain('share/opencode');
        expect(dir).not.toBe('');
    });

    it('dB_TIMEOUT_MS defaults to 300000 (5min) for large databases', async () => {expect.hasAssertions();

        const { DB_TIMEOUT_MS } = await loadModule();

        expect(DB_TIMEOUT_MS).toBe(300_000);
    });

    it('dB_TIMEOUT_MS may be overridden by OPENCODE_DB_TIMEOUT_MS env var', async () => {expect.hasAssertions();

        const origEnv = process.env['OPENCODE_DB_TIMEOUT_MS'];
        process.env['OPENCODE_DB_TIMEOUT_MS'] = '60000';
        vi.resetModules();
        const { DB_TIMEOUT_MS } = await import('./opencode-db-maintenance.js');

        expect(DB_TIMEOUT_MS).toBe(60_000);

        delete process.env['OPENCODE_DB_TIMEOUT_MS'];
        if (origEnv !== undefined) {
            process.env['OPENCODE_DB_TIMEOUT_MS'] = origEnv;
        }
        vi.resetModules();
    });
});

describe('EnsureDbDir', () => {
    it('creates directory recursively and returns true on success', async () => {expect.hasAssertions();

        mockMkdirSync.mockReturnValue(undefined);
        const { ensureDbDir, DB_DIR: dir } = await loadModule();
        const result = ensureDbDir();

        expect(result).toBeTruthy();
        expect(mockMkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
    });

    it('returns false when mkdir throws', async () => {expect.hasAssertions();

        mockMkdirSync.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const { ensureDbDir } = await loadModule();
        const result = ensureDbDir();

        expect(result).toBeFalsy();
    });
});

describe('ModeCheckOnly', () => {
    it('returns PASS when integrity and WAL checkpoint succeed', async () => {expect.hasAssertions();

        const { modeCheckOnly } = await loadModule();
        const result = modeCheckOnly(DB_PATH);

        expect(result.mode).toBe('check-only');
        expect(result.integrityCheck).toBe('ok');
        expect(result.walCheckpoint).toContain('0,0,0');
        expect(result.errors).toHaveLength(0);
        expect(result.dbSizeBytes).toBe(65536);
    });

    it('reports integrity check errors', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('database disk image is malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeCheckOnly } = await loadModule();
        const result = modeCheckOnly(DB_PATH);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.integrityCheck).toContain('ERROR');
    });

    it('reports WAL checkpoint errors', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('wal_checkpoint')) {
                throw new Error('checkpoint error');
            }
            if (bin === 'stat') return '65536\n';
            return 'ok\n';
        });
        const { modeCheckOnly } = await loadModule();
        const result = modeCheckOnly(DB_PATH);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.walCheckpoint).toContain('ERROR');
    });
});

describe('ModeRepair', () => {
    it('does nothing when integrity already passes', async () => {expect.hasAssertions();

        const { modeRepair } = await loadModule();
        const result = modeRepair(DB_PATH);

        expect(result.mode).toBe('repair');
        expect(result.repaired).toBeFalsy();
        expect(result.errors).toHaveLength(0);
    });

    it('repairs via REINDEX when integrity fails and recovers', async () => {expect.hasAssertions();

        let callCount = 0;
        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                callCount++;
                if (callCount === 1) throw new Error('malformed');
                return 'ok\n';
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeRepair } = await loadModule();
        const result = modeRepair(DB_PATH);

        expect(result.repaired).toBeTruthy();
        expect(result.errors).toHaveLength(0);
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'sqlite3',
            [expect.stringContaining('opencode.db'), 'PRAGMA journal_mode=DELETE;'],
            expect.any(Object),
        );
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'sqlite3',
            [expect.stringContaining('opencode.db'), 'REINDEX;'],
            expect.any(Object),
        );
    });

    it('reports when reindex fails to repair', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeRepair } = await loadModule();
        const result = modeRepair(DB_PATH);

        expect(result.repaired).toBeFalsy();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('ModeVacuum', () => {
    it('vacuums when integrity passes', async () => {expect.hasAssertions();

        const { modeVacuum } = await loadModule();
        const result = modeVacuum(DB_PATH);

        expect(result.mode).toBe('vacuum');
        expect(result.vacuumed).toBeTruthy();
        expect(result.errors).toHaveLength(0);
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'sqlite3',
            [expect.stringContaining('opencode.db'), 'VACUUM;'],
            expect.any(Object),
        );
    });

    it('skips vacuum when integrity fails', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeVacuum } = await loadModule();
        const result = modeVacuum(DB_PATH);

        expect(result.vacuumed).toBeFalsy();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('GetDbSizeBytes', () => {
    it('returns file size when stat succeeds', async () => {expect.hasAssertions();

        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();

        expect(size).toBe(65536);
    });

    it('returns 0 when stat fails', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'stat') throw new Error('ENOENT');
            return '';
        });
        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();

        expect(size).toBe(0);
    });

    it('returns 0 when database file does not exist', async () => {expect.hasAssertions();

        mockExistsSync.mockReturnValue(false);
        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();

        expect(size).toBe(0);
        expect(mockExecFileSync).not.toHaveBeenCalledWith('stat', expect.anything(), expect.anything());
    });
});

describe('BackupDb', () => {
    it('copies database to .pre-run path and returns it', async () => {expect.hasAssertions();

        const { backupDb } = await loadModule();
        mockCopyFileSync.mockReturnValue(undefined);
        const result = backupDb('/tmp/test.db');

        expect(result).toBe('/tmp/test.db.pre-run');
        expect(mockCopyFileSync).toHaveBeenCalledWith('/tmp/test.db', '/tmp/test.db.pre-run');
    });

    it('returns null when copy fails', async () => {expect.hasAssertions();

        const { backupDb } = await loadModule();
        mockCopyFileSync.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const result = backupDb('/tmp/test.db');

        expect(result).toBeNull();
    });
});

describe('EnsureWalMode', () => {
    it('returns WAL journal mode string on success', async () => {expect.hasAssertions();

        const { ensureWalMode } = await loadModule();
        const result = ensureWalMode();

        expect(result).toBe('wal');
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'sqlite3',
            [expect.stringContaining('opencode.db'), 'PRAGMA journal_mode=WAL;'],
            expect.any(Object),
        );
    });

    it('returns null when sqlite3 throws', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') throw new Error('ENOENT');
            return '';
        });
        const { ensureWalMode } = await loadModule();
        const result = ensureWalMode();

        expect(result).toBeNull();
    });
});

describe('CheckMountDevice', () => {
    it('returns warning when DB and ~/.local are on the same device', async () => {expect.hasAssertions();

        mockStatSync.mockReturnValue({ dev: 1, isFile: () => true });
        const { checkMountDevice } = await loadModule();
        const result = checkMountDevice('/home/user/.local/share/opencode/opencode.db');

        expect(result).toContain('AVISO');
        expect(result).toContain('mesmo device');
    });

    it('returns null when DB and ~/.local are on different devices', async () => {expect.hasAssertions();

        mockStatSync
            .mockReturnValueOnce({ dev: 1, isFile: () => true })
            .mockReturnValueOnce({ dev: 2, isFile: () => true });
        const { checkMountDevice } = await loadModule();
        const result = checkMountDevice('/home/user/.local/share/opencode/opencode.db');

        expect(result).toBeNull();
    });

    it('returns null when stat fails', async () => {expect.hasAssertions();

        mockStatSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });
        const { checkMountDevice } = await loadModule();
        const result = checkMountDevice('/home/user/.local/share/opencode/opencode.db');

        expect(result).toBeNull();
    });
});

describe('PrintResult', () => {
    it('prints PASS when no errors', async () => {expect.hasAssertions();

        const { printResult } = await loadModule();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        printResult({
            mode: 'check-only',
            dbPath: DB_PATH,
            dbSizeBytes: 1024,
            integrityCheck: 'ok',
            walCheckpoint: '0,0,0',
            repaired: false,
            vacuumed: false,
            errors: [],
        });

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PASS'));

        consoleSpy.mockRestore();
    });

    it('prints FAIL with error details when errors exist', async () => {expect.hasAssertions();

        const { printResult } = await loadModule();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        printResult({
            mode: 'repair',
            dbPath: DB_PATH,
            dbSizeBytes: 0,
            integrityCheck: 'ERROR: malformed',
            walCheckpoint: '0,0,0',
            repaired: false,
            vacuumed: false,
            errors: ['REINDEX failed to repair integrity'],
        });

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('REINDEX failed'));

        consoleSpy.mockRestore();
    });
});

describe('CheckSqlite3', () => {
    it('returns true when sqlite3 --version succeeds', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') return '3.40.0\n';
            return '';
        });
        const { checkSqlite3 } = await import('./opencode-db-maintenance.js');

        expect(checkSqlite3()).toBeTruthy();
    });

    it('returns false when sqlite3 throws', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') throw new Error('ENOENT');
            return '';
        });
        const { checkSqlite3 } = await import('./opencode-db-maintenance.js');

        expect(checkSqlite3()).toBeFalsy();
    });
});

describe('Main', () => {
    beforeEach(async () => {
        const mod = await import('./opencode-db-maintenance.js');
        DB_PATH = mod.DB_PATH;
        mockExistsSync.mockReturnValue(true);
        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[0] === '--version') return '3.40.0\n';
            if (bin === 'stat') return '65536\n';
            if (bin === 'sqlite3') {
                const sqlCmd = args[1];
                if (sqlCmd?.includes('integrity_check')) return 'ok\n';
                if (sqlCmd?.includes('wal_checkpoint')) return '0,0,0\n';
                return '';
            }
            return '';
        });
    });

    it('returns 3 when sqlite3 not available', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') throw new Error('ENOENT');
            return '';
        });
        const { main } = await import('./opencode-db-maintenance.js');
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(3);

        consoleSpy.mockRestore();
    });

    it('returns 0 when database not found — first run, creates directory', async () => {expect.hasAssertions();

        mockExistsSync.mockReturnValue(false);
        const { main } = await import('./opencode-db-maintenance.js');
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(0);
        expect(mockMkdirSync).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('creating directory'));

        consoleSpy.mockRestore();
    });

    it('returns 1 when database not found but mkdir fails', async () => {expect.hasAssertions();

        mockExistsSync.mockReturnValue(false);
        mockMkdirSync.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const { main } = await import('./opencode-db-maintenance.js');
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(1);

        consoleSpy.mockRestore();
    });

    it('returns 0 for check-only mode and prints result', async () => {expect.hasAssertions();

        const { main } = await loadModule();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(0);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PASS'));

        consoleSpy.mockRestore();
    });

    it('returns 1 when integrity check fails', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[0] === '--version') return '3.40.0\n';
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { main } = await loadModule();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(1);

        consoleSpy.mockRestore();
    });

    it('returns 0 with --repair flag', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[0] === '--version') return '3.40.0\n';
            if (bin === 'stat') return '65536\n';
            return 'ok\n';
        });
        const { main } = await loadModule();
        const origArgv = process.argv;
        Object.defineProperty(process, 'argv', { value: ['node', 'script', '--repair'], configurable: true });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(0);

        consoleSpy.mockRestore();
        Object.defineProperty(process, 'argv', { value: origArgv, configurable: true });
    });

    it('returns 0 with --vacuum flag', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[0] === '--version') return '3.40.0\n';
            if (bin === 'stat') return '65536\n';
            return 'ok\n';
        });
        const { main } = await loadModule();
        const origArgv = process.argv;
        Object.defineProperty(process, 'argv', { value: ['node', 'script', '--vacuum'], configurable: true });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();

        expect(result).toBe(0);

        consoleSpy.mockRestore();
        Object.defineProperty(process, 'argv', { value: origArgv, configurable: true });
    });
});

describe('ModeVacuum WAL error', () => {
    it('reports WAL checkpoint error during vacuum', async () => {expect.hasAssertions();

        let callCount = 0;
        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('wal_checkpoint')) {
                callCount++;
                if (callCount >= 1) throw new Error('checkpoint failed');
            }
            if (bin === 'stat') return '65536\n';
            if (bin === 'sqlite3') return 'ok\n';
            return '';
        });
        const { modeVacuum } = await loadModule();
        const result = modeVacuum(DB_PATH);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.walCheckpoint).toContain('ERROR');
    });
});

describe('RunAsScript', () => {
    it('calls main and exits with its return code', async () => {expect.hasAssertions();

        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') return '3.40.0\n';
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { runAsScript } = await loadModule();
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        runAsScript();

        expect(exitSpy).toHaveBeenCalledWith(0);

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
