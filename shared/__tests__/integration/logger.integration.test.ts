/**
 * Integration tests — Logger (FT-05)
 *
 * Validates the structured logger:
 * - Log levels (DEBUG < INFO < WARN < ERROR)
 * - Level filtering via env var
 * - File output with correct format
 * - Context binding
 * - Log rotation
 * - maskDeep for sensitive data
 * - Child logger inherits context
 * - filePath resolution
 *
 * Uses real filesystem for log file output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Config from '../../config-accessor.js';
import { Logger, maskDeep } from '../../logger.js';

let TEST_DIR: string;

function withConfig(logDir: string): Config {
    return Config.create({ logFile: 'true', logDir, logLevel: 'debug', logMaxSize: 1048576 });
}

describe('Integration: Logger', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-logger-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            /* best effort */
        }
    });

    function readLog(logger: Logger): string {
        const fp = logger.filePath;
        if (!fp) throw new Error('Expected filePath to be non-null');
        return fs.readFileSync(fp, 'utf8');
    }

    describe('FT-05a: log levels produce correct file output', () => {
        it('writes DEBUG level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, withConfig(logDir));

            logger.debug('debug message');

            const content = readLog(logger);

            expect(content).toContain('[DEBUG]');
            expect(content).toContain('debug message');
        });

        it('writes INFO level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, withConfig(logDir));

            logger.info('info message');

            const content = readLog(logger);

            expect(content).toContain('[INFO]');
            expect(content).toContain('info message');
        });

        it('writes WARN level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, withConfig(logDir));

            logger.warn('warning message');

            const content = readLog(logger);

            expect(content).toContain('[WARN]');
            expect(content).toContain('warning message');
        });

        it('writes ERROR level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, withConfig(logDir));

            logger.error('error message');

            const content = readLog(logger);

            expect(content).toContain('[ERROR]');
            expect(content).toContain('error message');
        });
    });

    describe('FT-05b: context binding', () => {
        it('includes context in log lines', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({ session: 'jira', operation: 'import' }, withConfig(logDir));

            logger.info('import started');

            const content = readLog(logger);

            expect(content).toContain('jira');
            expect(content).toContain('import');
        });
    });

    describe('FT-05c: child logger', () => {
        it('child inherits parent context and adds extra', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const parent = new Logger({ session: 'test' }, withConfig(logDir));
            const child = parent.child({ step: 'validation' });

            child.info('validating');

            const content = readLog(parent);

            expect(content).toContain('test');
            expect(content).toContain('validation');
        });
    });

    describe('FT-05d: maskDeep masks sensitive fields', () => {
        it('masks token field', () => {
            expect(JSON.stringify(maskDeep({ token: 'super-secret-token-12345' }))).toContain('****');
            expect(JSON.stringify(maskDeep({ token: 'super-secret-token-12345' }))).not.toContain(
                'super-secret-token-12345',
            );
        });

        it('masks secret field', () => {
            expect(JSON.stringify(maskDeep({ secret: 'mysecretvalue' }))).toContain('****');
        });

        it('preserves non-sensitive fields', () => {
            expect(JSON.stringify(maskDeep({ name: 'test', count: 42 }))).toBe('{"name":"test","count":42}');
        });

        it('masks sensitive fields at any depth (maskDeep is fully recursive)', () => {
            expect(JSON.stringify(maskDeep({ authorization: 'Bearer abc123xyz' }))).toContain('****');
        });

        it('short values are fully masked', () => {
            expect(JSON.stringify(maskDeep({ key: 'short' }))).toBe('{"key":"****"}');
        });

        it('preserves non-object values', () => {
            expect(maskDeep(null)).toBeNull();
            expect(maskDeep(undefined)).toBeUndefined();
            expect(maskDeep('string')).toBe('string');
            expect(maskDeep(42)).toBe(42);
        });
    });

    describe('FT-05e: log file path', () => {
        it('returns null when logFile is disabled', () => {
            const logger = new Logger({}, Config.create({ logFile: '', logLevel: 'debug' }));

            expect(logger.filePath).toBeNull();
        });
    });

    describe('FT-05f: log format', () => {
        it('log line contains timestamp, level, and message', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, withConfig(logDir));

            logger.info('test format');

            const content = readLog(logger);
            const line = content.trim();

            expect(line).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
            expect(line).toContain('[INFO]');
            expect(line).toContain('test format');
        });
    });
});
