#!/usr/bin/env node
/**
 * opencode-db-maintenance.ts — SQLite database maintenance for opencode
 *
 * Runs inside the container to maintain opencode's SQLite database at
 * ~/.local/share/opencode/opencode.db. Uses the system sqlite3 CLI.
 *
 * Modes:
 *   --check-only   PRAGMA integrity_check + WAL checkpoint (default)
 *   --repair       REINDEX + integrity_check + recovery if corrupted
 *   --vacuum       VACUUM + WAL checkpoint (reclaims space)
 *
 * Exit codes:
 *   0 — all checks passed / maintenance successful / no database (first run)
 *   1 — integrity check failed / maintenance error
 *   3 — sqlite3 CLI not available
 *
 * Usage:
 *   tsx scripts/opencode-db-maintenance.ts --check-only
 *   tsx scripts/opencode-db-maintenance.ts --repair
 *   tsx scripts/opencode-db-maintenance.ts --vacuum
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { rootLogger } from '../shared/logger.js';

const DB_DIR = resolve(homedir(), '.local', 'share', 'opencode');
const DB_PATH = resolve(DB_DIR, 'opencode.db');
const SQLITE_BIN = 'sqlite3';

/**
 * Timeout (ms) for each sqlite3 CLI call.
 * Default: 300s (5 minutes) — large databases (4GB+) need extended time
 * for integrity_check. Override via OPENCODE_DB_TIMEOUT_MS env var.
 */
const DB_TIMEOUT_MS = Number(process.env['OPENCODE_DB_TIMEOUT_MS']) || 300_000;

interface MaintenanceResult {
    mode: 'check-only' | 'repair' | 'vacuum';
    dbPath: string;
    dbSizeBytes: number;
    integrityCheck: string;
    walCheckpoint: string;
    repaired: boolean;
    vacuumed: boolean;
    errors: string[];
}

function getDbSizeBytes(): number {
    try {
        const stats = existsSync(DB_PATH)
            ? execFileSync('stat', ['--format=%s', DB_PATH], { encoding: 'utf-8' }).trim()
            : '0';
        return Number(stats);
    } catch (err) {
        rootLogger.debug(`[db-maintenance] Failed to get DB size: ${err instanceof Error ? err.message : String(err)}`);
        return 0;
    }
}

function runSqlite(...args: string[]): string {
    return execFileSync(SQLITE_BIN, [DB_PATH, ...args], {
        encoding: 'utf-8',
        timeout: DB_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
    }).trim();
}

function checkIntegrity(): string {
    return runSqlite('PRAGMA integrity_check;');
}

function checkpointWal(): string {
    return runSqlite('PRAGMA wal_checkpoint(TRUNCATE);');
}

function reindex(): string {
    return runSqlite('REINDEX;');
}

function vacuum(): string {
    return runSqlite('VACUUM;');
}

/**
 * Backup the database file before any maintenance operation.
 * Copies to {dbPath}.pre-run for crash recovery.
 * Returns the backup path on success, null on failure.
 */
function backupDb(dbPath: string): string | null {
    try {
        const backupPath = dbPath + '.pre-run';
        copyFileSync(dbPath, backupPath);
        return backupPath;
    } catch (err) {
        rootLogger.warn(`[db-maintenance] Backup failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

/**
 * Ensure the database uses WAL journal mode.
 * This is persistent in the database header and improves
 * concurrent read/write performance in container environments.
 * Silent if database does not exist yet (first run).
 */
function ensureWalMode(): string | null {
    try {
        return runSqlite('PRAGMA journal_mode=WAL;');
    } catch (err) {
        rootLogger.debug(
            `[db-maintenance] Failed to set WAL mode: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}

/**
 * Check if the database file is on the same device as the ~/.local directory.
 * If they share the same device, the tmpfs at ~/.local may be shadowing
 * the bind mount, meaning the DB is on volatile storage instead of persistent.
 *
 * Returns a warning message if overlap is detected, null if everything is fine
 * or if the check cannot be performed (e.g., database does not exist yet).
 */
function checkMountDevice(dbPath: string): string | null {
    try {
        const dbStat = statSync(dbPath);
        const localDir = resolve(dbPath, '..', '..', '..');
        const localStat = statSync(localDir);
        if (dbStat.dev === localStat.dev) {
            return (
                `AVISO: opencode.db (device ${dbStat.dev}) está no mesmo device de ~/.local ` +
                `(device ${localStat.dev}) — possível overlap de mounts. ` +
                `O banco pode estar em tmpfs volátil em vez de armazenamento persistente.`
            );
        }
        return null;
    } catch (err) {
        rootLogger.debug(
            `[db-maintenance] Mount device check failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}

function modeCheckOnly(dbPath: string): MaintenanceResult {
    const dbSizeBytes = getDbSizeBytes();
    const errors: string[] = [];

    // 1. Backup snapshot before any DB modification
    const backupPath = backupDb(dbPath);
    if (backupPath) {
        rootLogger.info(`[opencode-db-maintenance] backup=${backupPath}`);
    }

    // 2. Ensure WAL journal mode — persists in DB header, improves runtime concurrency
    const walMode = ensureWalMode();
    if (walMode) {
        rootLogger.info(`[opencode-db-maintenance] journal_mode=${walMode}`);
    }

    // 3. Device diagnostic — detect if DB is on same device as ~/.local (tmpfs overlap)
    const mountWarn = checkMountDevice(dbPath);
    if (mountWarn) {
        rootLogger.warn(`[opencode-db-maintenance] ${mountWarn}`);
    }

    let integrityCheck: string;
    let walCheckpoint: string;

    try {
        integrityCheck = checkIntegrity();
    } catch (err) {
        integrityCheck = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(integrityCheck);
    }

    try {
        walCheckpoint = checkpointWal();
    } catch (err) {
        walCheckpoint = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(walCheckpoint);
    }

    return {
        mode: 'check-only',
        dbPath,
        dbSizeBytes,
        integrityCheck,
        walCheckpoint,
        repaired: false,
        vacuumed: false,
        errors,
    };
}

function modeRepair(dbPath: string): MaintenanceResult {
    const dbSizeBytes = getDbSizeBytes();
    const errors: string[] = [];
    let repaired = false;

    let integrityCheck: string;

    try {
        integrityCheck = checkIntegrity();
    } catch (err) {
        integrityCheck = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }

    const needsRepair = !integrityCheck.includes('ok');

    if (needsRepair) {
        try {
            runSqlite('PRAGMA journal_mode=DELETE;');
            reindex();
            integrityCheck = checkIntegrity();
            repaired = integrityCheck.includes('ok');
            if (!repaired) {
                errors.push('REINDEX failed to repair integrity');
            }
        } catch (err) {
            errors.push(`Repair error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    let walCheckpoint: string;
    try {
        walCheckpoint = checkpointWal();
    } catch (err) {
        walCheckpoint = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(walCheckpoint);
    }

    return {
        mode: 'repair',
        dbPath,
        dbSizeBytes,
        integrityCheck,
        walCheckpoint,
        repaired,
        vacuumed: false,
        errors,
    };
}

function modeVacuum(dbPath: string): MaintenanceResult {
    const dbSizeBytes = getDbSizeBytes();
    const errors: string[] = [];

    let integrityCheck: string;
    try {
        integrityCheck = checkIntegrity();
    } catch (err) {
        integrityCheck = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(integrityCheck);
    }

    let vacuumed = false;
    if (integrityCheck.includes('ok')) {
        try {
            vacuum();
            vacuumed = true;
        } catch (err) {
            errors.push(`VACUUM error: ${err instanceof Error ? err.message : String(err)}`);
        }
    } else {
        errors.push('Cannot VACUUM: integrity check failed');
    }

    let walCheckpoint: string;
    try {
        walCheckpoint = checkpointWal();
    } catch (err) {
        walCheckpoint = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(walCheckpoint);
    }

    return {
        mode: 'vacuum',
        dbPath,
        dbSizeBytes,
        integrityCheck,
        walCheckpoint,
        repaired: false,
        vacuumed,
        errors,
    };
}

function printResult(result: MaintenanceResult): void {
    const status = result.errors.length === 0 ? 'PASS' : 'FAIL';
    rootLogger.info(`[opencode-db-maintenance] mode=${result.mode} status=${status} db=${result.dbPath}`);
    rootLogger.info(`  integrity_check: ${result.integrityCheck.split('\n')[0]}`);
    rootLogger.info(`  wal_checkpoint:  ${result.walCheckpoint.split('\n')[0]}`);
    rootLogger.info(`  db_size_bytes:   ${result.dbSizeBytes}`);
    rootLogger.info(`  repaired:        ${result.repaired}`);
    rootLogger.info(`  vacuumed:        ${result.vacuumed}`);
    if (result.errors.length > 0) {
        rootLogger.info(`  errors:          ${result.errors.length}`);
        for (const err of result.errors) {
            rootLogger.info(`    - ${err}`);
        }
    }
}

function checkSqlite3(): boolean {
    try {
        execFileSync(SQLITE_BIN, ['--version'], { encoding: 'utf-8', stdio: 'pipe', timeout: 5_000 });
        return true;
    } catch (err) {
        rootLogger.debug(`[db-maintenance] sqlite3 not available: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}

function ensureDbDir(): boolean {
    try {
        mkdirSync(DB_DIR, { recursive: true });
        return true;
    } catch (err) {
        rootLogger.warn(
            `[db-maintenance] Failed to create DB directory: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
    }
}

function main(): number {
    const args = process.argv.slice(2);
    const mode = args.includes('--repair') ? 'repair' : args.includes('--vacuum') ? 'vacuum' : 'check-only';

    if (!checkSqlite3()) {
        rootLogger.error(`[opencode-db-maintenance] ERROR: ${SQLITE_BIN} not found or not executable`);
        return 3;
    }

    if (!existsSync(DB_PATH)) {
        rootLogger.info(`[opencode-db-maintenance] Database not found at ${DB_PATH} — first run, creating directory`);
        const created = ensureDbDir();
        if (!created) {
            rootLogger.error(`[opencode-db-maintenance] ERROR: could not create directory ${DB_DIR}`);
            return 1;
        }
        rootLogger.info(
            `[opencode-db-maintenance] Directory ${DB_DIR} ready — database will be created by opencode on first use`,
        );
        return 0;
    }

    let result: MaintenanceResult;

    switch (mode) {
        case 'repair':
            result = modeRepair(DB_PATH);
            break;
        case 'vacuum':
            result = modeVacuum(DB_PATH);
            break;
        default:
            result = modeCheckOnly(DB_PATH);
            break;
    }

    printResult(result);

    if (result.errors.length > 0) {
        return 1;
    }

    return 0;
}

function runAsScript(): void {
    const exitCode = main();
    process.exit(exitCode);
}

if (
    process.argv[1] &&
    (process.argv[1].endsWith('opencode-db-maintenance.ts') || process.argv[1].endsWith('opencode-db-maintenance.js'))
) {
    runAsScript();
}

export {
    type MaintenanceResult,
    modeCheckOnly,
    modeRepair,
    modeVacuum,
    printResult,
    getDbSizeBytes,
    checkSqlite3,
    ensureDbDir,
    backupDb,
    ensureWalMode,
    checkMountDevice,
    DB_DIR,
    DB_PATH,
    DB_TIMEOUT_MS,
    SQLITE_BIN,
    main,
    runAsScript,
};
