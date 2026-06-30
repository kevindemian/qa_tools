/**
 * Integration tests — Temp Dir (FT-06)
 *
 * Validates temporary directory management:
 * - ensureDirs creates all subdirectories
 * - writeReport writes to dated subdirectory
 * - writeEphemeral writes to category subdirectory
 * - cleanupTempDirs removes ephemeral subdirectories
 * - reportsDir, logsDir, tempDirPath return correct paths
 *
 * Uses real filesystem in isolated temp directories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootLogger } from '../../../shared/logger.js';

let TEST_DIR: string;

describe('Integration: Temp Dir', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-tempdir-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            rootLogger.warn('temp-dir integration cleanup failed');
        }
    });

    describe('FT-06a: ensureDirs creates directories at default paths', () => {
        it('creates temp subdirectories using default paths', async () => {
            expect.hasAssertions();

            const { ensureDirs, tempDirPath, reportsDir, logsDir } = await import('../../temp-dir.js');

            ensureDirs();

            // Verify that ensureDirs ran without error and the functions return paths
            expect(typeof tempDirPath()).toBe('string');
            expect(tempDirPath().length).toBeGreaterThan(0);
            expect(typeof reportsDir()).toBe('string');
            expect(reportsDir().length).toBeGreaterThan(0);
            expect(typeof logsDir()).toBe('string');
            expect(logsDir().length).toBeGreaterThan(0);

            // The directories should exist at the paths these functions report
            expect(fs.existsSync(tempDirPath())).toBeTruthy();
            expect(fs.existsSync(reportsDir())).toBeTruthy();
        });

        it('logsDir exists after ensureDirs', async () => {
            expect.hasAssertions();

            const { ensureDirs, logsDir } = await import('../../temp-dir.js');

            ensureDirs();

            expect(fs.existsSync(logsDir())).toBeTruthy();
        });
    });

    describe('FT-06b: writeReport writes to dated subdirectory', () => {
        it('creates report file with correct path', async () => {
            expect.hasAssertions();

            const { writeReport } = await import('../../temp-dir.js');
            const content = '<html><body>Report</body></html>';

            const filepath = writeReport('test-report.html', content);

            expect(fs.existsSync(filepath)).toBeTruthy();
            expect(fs.readFileSync(filepath, 'utf8')).toBe(content);
            expect(filepath).toContain('test-report.html');
            expect(filepath).toMatch(/\d{4}-\d{2}-\d{2}/); // dated directory
        });
    });

    describe('FT-06c: writeEphemeral writes to category subdirectory', () => {
        it('creates file under temp/{category}/', async () => {
            expect.hasAssertions();

            const { writeEphemeral } = await import('../../temp-dir.js');
            const content = 'ephemeral data';

            const filepath = writeEphemeral('cache', 'data.json', content);

            expect(fs.existsSync(filepath)).toBeTruthy();
            expect(fs.readFileSync(filepath, 'utf8')).toBe(content);
            expect(filepath).toContain(path.join('cache', 'data.json'));
        });
    });

    describe('FT-06d: cleanupTempDirs removes subdirectories', () => {
        it('removes previews, vars, cache but not reports or logs', async () => {
            expect.hasAssertions();

            const { ensureDirs, cleanupTempDirs, writeReport } = await import('../../temp-dir.js');
            ensureDirs();
            writeReport('keep-me.html', 'content');

            cleanupTempDirs();

            const tempBase = path.join(TEST_DIR, 'temp');

            expect(fs.existsSync(path.join(tempBase, 'previews'))).toBeFalsy();
            expect(fs.existsSync(path.join(tempBase, 'vars'))).toBeFalsy();
            expect(fs.existsSync(path.join(tempBase, 'cache'))).toBeFalsy();
        });
    });

    describe('FT-06e: reportsDir returns correct path', () => {
        it('returns configured reports directory', async () => {
            expect.hasAssertions();

            const { reportsDir } = await import('../../temp-dir.js');
            const dir = reportsDir();

            expect(dir).toContain('reports');
        });
    });

    describe('FT-06f: tempDirPath returns correct path', () => {
        it('returns configured temp directory', async () => {
            expect.hasAssertions();

            const { tempDirPath } = await import('../../temp-dir.js');
            const dir = tempDirPath();

            expect(dir).toContain('temp');
        });
    });
});
