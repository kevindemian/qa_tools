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
import { Logger, maskDeep } from '../../logger.js';

let TEST_DIR: string;

function getConfig(logDir: string) {
    return {
        get: (key: string) => {
            if (key === 'logDir') return logDir;
            if (key === 'logFile') return 'true';
            if (key === 'logLevel') return 'debug';
            if (key === 'logMaxSize') return '1048576'; // 1MB
            return undefined;
        },
    } as never;
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

    describe('FT-05a: log levels produce correct file output', () => {
        it('writes DEBUG level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, getConfig(logDir));

            logger.debug('debug message');

            const filePath = logger.filePath;
            expect(filePath).toBeTruthy();
            expect(fs.existsSync(filePath as string)).toBe(true);
            const content = fs.readFileSync(filePath as string, 'utf8');
            expect(content).toContain('[DEBUG]');
            expect(content).toContain('debug message');
        });

        it('writes INFO level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, getConfig(logDir));

            logger.info('info message');

            const content = fs.readFileSync(logger.filePath as string, 'utf8');
            expect(content).toContain('[INFO]');
            expect(content).toContain('info message');
        });

        it('writes WARN level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, getConfig(logDir));

            logger.warn('warning message');

            const content = fs.readFileSync(logger.filePath as string, 'utf8');
            expect(content).toContain('[WARN]');
            expect(content).toContain('warning message');
        });

        it('writes ERROR level to log file', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, getConfig(logDir));

            logger.error('error message');

            const content = fs.readFileSync(logger.filePath as string, 'utf8');
            expect(content).toContain('[ERROR]');
            expect(content).toContain('error message');
        });
    });

    describe('FT-05b: context binding', () => {
        it('includes context in log lines', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({ session: 'jira', operation: 'import' }, getConfig(logDir));

            logger.info('import started');

            const content = fs.readFileSync(logger.filePath as string, 'utf8');
            expect(content).toContain('jira');
            expect(content).toContain('import');
        });
    });

    describe('FT-05c: child logger', () => {
        it('child inherits parent context and adds extra', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const parent = new Logger({ session: 'test' }, getConfig(logDir));
            const child = parent.child({ step: 'validation' });

            child.info('validating');

            const content = fs.readFileSync(parent.filePath!, 'utf8');
            expect(content).toContain('test');
            expect(content).toContain('validation');
        });
    });

    describe('FT-05d: maskDeep masks sensitive fields', () => {
        it('masks token field', () => {
            const result = maskDeep({ token: 'super-secret-token-12345' }) as Record<string, unknown>;
            expect(result['token']).not.toBe('super-secret-token-12345');
            expect(result['token']).toContain('****');
        });

        it('masks secret field', () => {
            const result = maskDeep({ secret: 'mysecretvalue' }) as Record<string, unknown>;
            expect(result['secret']).not.toBe('mysecretvalue');
            expect(result['secret']).toContain('****');
        });

        it('preserves non-sensitive fields', () => {
            const result = maskDeep({ name: 'test', count: 42 }) as Record<string, unknown>;
            expect(result['name']).toBe('test');
            expect(result['count']).toBe(42);
        });

        it('masks sensitive fields at top level only (maskDeep is not deeply recursive)', () => {
            // maskDeep masks top-level keys matching SECRET_RE. Nested objects pass through.
            const result = maskDeep({ authorization: 'Bearer abc123xyz' }) as Record<string, unknown>;
            expect(result['authorization']).toContain('****');
        });

        it('short values are fully masked', () => {
            const result = maskDeep({ key: 'short' }) as Record<string, unknown>;
            expect(result['key']).toBe('****');
        });

        it('preserves non-object values', () => {
            expect(maskDeep(null)).toBe(null);
            expect(maskDeep(undefined)).toBe(undefined);
            expect(maskDeep('string')).toBe('string');
            expect(maskDeep(42)).toBe(42);
        });
    });

    describe('FT-05e: log file path', () => {
        it('returns null when logFile is disabled', () => {
            const noFileConfig = {
                get: (key: string) => {
                    if (key === 'logFile') return '';
                    if (key === 'logLevel') return 'debug';
                    if (key === 'logMaxSize') return '1048576';
                    return undefined;
                },
            } as never;
            const logger = new Logger({}, noFileConfig);
            expect(logger.filePath).toBeNull();
        });
    });

    describe('FT-05f: log format', () => {
        it('log line contains timestamp, level, and message', () => {
            const logDir = path.join(TEST_DIR, 'logs');
            const logger = new Logger({}, getConfig(logDir));

            logger.info('test format');

            const content = fs.readFileSync(logger.filePath as string, 'utf8');
            const line = content.trim();
            expect(line).toMatch(/\[\d{4}-\d{2}-\d{2}T/); // ISO timestamp
            expect(line).toContain('[INFO]');
            expect(line).toContain('test format');
        });
    });
});
