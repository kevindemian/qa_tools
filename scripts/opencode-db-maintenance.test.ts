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

vi.unmock('../shared/deps.js');

vi.mock('node:child_process', () => ({
    execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    default: { existsSync: mockExistsSync, mkdirSync: mockMkdirSync },
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
    mockExecFileSync.mockImplementation((bin: string, args: string[], _opts?: unknown) => {
        if (bin === 'stat') {
            return '65536\n';
        }
        if (bin === 'sqlite3') {
            const sqlCmd = args[1];
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

describe('DB_DIR constant', () => {
    it('is derived from homedir and ends with share/opencode', async () => {
        const { DB_DIR: dir } = await loadModule();
        expect(dir).toContain('share/opencode');
        expect(dir).not.toBe('');
    });
});

describe('ensureDbDir', () => {
    it('creates directory recursively and returns true on success', async () => {
        mockMkdirSync.mockReturnValue(undefined);
        const { ensureDbDir, DB_DIR: dir } = await loadModule();
        const result = ensureDbDir();
        expect(result).toBe(true);
        expect(mockMkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
    });

    it('returns false when mkdir throws', async () => {
        mockMkdirSync.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const { ensureDbDir } = await loadModule();
        const result = ensureDbDir();
        expect(result).toBe(false);
    });
});

describe('modeCheckOnly', () => {
    it('returns PASS when integrity and WAL checkpoint succeed', async () => {
        const { modeCheckOnly } = await loadModule();
        const result = modeCheckOnly(DB_PATH);
        expect(result.mode).toBe('check-only');
        expect(result.integrityCheck).toBe('ok');
        expect(result.walCheckpoint).toContain('0,0,0');
        expect(result.errors).toHaveLength(0);
        expect(result.dbSizeBytes).toBe(65536);
    });

    it('reports integrity check errors', async () => {
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

    it('reports WAL checkpoint errors', async () => {
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

describe('modeRepair', () => {
    it('does nothing when integrity already passes', async () => {
        const { modeRepair } = await loadModule();
        const result = modeRepair(DB_PATH);
        expect(result.mode).toBe('repair');
        expect(result.repaired).toBe(false);
        expect(result.errors).toHaveLength(0);
    });

    it('repairs via REINDEX when integrity fails and recovers', async () => {
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
        expect(result.repaired).toBe(true);
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

    it('reports when reindex fails to repair', async () => {
        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeRepair } = await loadModule();
        const result = modeRepair(DB_PATH);
        expect(result.repaired).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('modeVacuum', () => {
    it('vacuums when integrity passes', async () => {
        const { modeVacuum } = await loadModule();
        const result = modeVacuum(DB_PATH);
        expect(result.mode).toBe('vacuum');
        expect(result.vacuumed).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'sqlite3',
            [expect.stringContaining('opencode.db'), 'VACUUM;'],
            expect.any(Object),
        );
    });

    it('skips vacuum when integrity fails', async () => {
        mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
            if (bin === 'sqlite3' && args[1]?.includes('integrity_check')) {
                throw new Error('malformed');
            }
            if (bin === 'stat') return '65536\n';
            return '';
        });
        const { modeVacuum } = await loadModule();
        const result = modeVacuum(DB_PATH);
        expect(result.vacuumed).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('getDbSizeBytes', () => {
    it('returns file size when stat succeeds', async () => {
        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();
        expect(size).toBe(65536);
    });

    it('returns 0 when stat fails', async () => {
        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'stat') throw new Error('ENOENT');
            return '';
        });
        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();
        expect(size).toBe(0);
    });

    it('returns 0 when database file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);
        const { getDbSizeBytes } = await loadModule();
        const size = getDbSizeBytes();
        expect(size).toBe(0);
        expect(mockExecFileSync).not.toHaveBeenCalledWith('stat', expect.anything(), expect.anything());
    });
});

describe('printResult', () => {
    it('prints PASS when no errors', async () => {
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

    it('prints FAIL with error details when errors exist', async () => {
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

describe('checkSqlite3', () => {
    it('returns true when sqlite3 --version succeeds', async () => {
        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') return '3.40.0\n';
            return '';
        });
        const { checkSqlite3 } = await import('./opencode-db-maintenance.js');
        expect(checkSqlite3()).toBe(true);
    });

    it('returns false when sqlite3 throws', async () => {
        mockExecFileSync.mockImplementation((bin: string) => {
            if (bin === 'sqlite3') throw new Error('ENOENT');
            return '';
        });
        const { checkSqlite3 } = await import('./opencode-db-maintenance.js');
        expect(checkSqlite3()).toBe(false);
    });
});

describe('main', () => {
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

    it('returns 3 when sqlite3 not available', async () => {
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

    it('returns 0 when database not found — first run, creates directory', async () => {
        mockExistsSync.mockReturnValue(false);
        const { main } = await import('./opencode-db-maintenance.js');
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();
        expect(result).toBe(0);
        expect(mockMkdirSync).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('creating directory'));
        consoleSpy.mockRestore();
    });

    it('returns 1 when database not found but mkdir fails', async () => {
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

    it('returns 0 for check-only mode and prints result', async () => {
        const { main } = await loadModule();
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = main();
        expect(result).toBe(0);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PASS'));
        consoleSpy.mockRestore();
    });

    it('returns 1 when integrity check fails', async () => {
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

    it('returns 0 with --repair flag', async () => {
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

    it('returns 0 with --vacuum flag', async () => {
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

describe('modeVacuum WAL error', () => {
    it('reports WAL checkpoint error during vacuum', async () => {
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

describe('runAsScript', () => {
    it('calls main and exits with its return code', async () => {
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
