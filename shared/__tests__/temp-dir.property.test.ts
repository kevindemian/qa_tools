/**
 * Property-Based Tests — Temp Dir (FT-06)
 *
 * Verifies invariants of path resolution and file-writing functions.
 * Properties defined from domain logic, not current implementation.
 */
import * as fc from 'fast-check';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-tempdir-'));

vi.mock('../config.js', () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'QA_TOOLS_REPORTS_DIR') return path.join(BASE_DIR, 'reports');
            if (key === 'QA_TOOLS_TEMP_DIR') return path.join(BASE_DIR, 'temp');
            if (key === 'QA_TOOLS_LOGS_DIR') return path.join(BASE_DIR, 'logs');
            if (key === 'LOG_DIR') return undefined;
            return undefined;
        }),
    },
}));

/** Valid filenames — no path separators, no null bytes, no empty */
const FilenameArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !s.includes('/') && !s.includes('\0') && !s.includes('\\'));
const CategoryArb = fc.constantFrom('previews', 'vars', 'cache');
const ContentArb = fc.string({ minLength: 0, maxLength: 200 });

describe('PBT: Temp Dir', () => {
    describe('Path resolution invariants', () => {
        it('reportsDir always returns an absolute path', async () => {
            const { reportsDir } = await import('../temp-dir.js');
            const dir = reportsDir();

            expect(dir).toBeTruthy();
            expect(path.isAbsolute(dir)).toBeTruthy();
        });

        it('logsDir always returns an absolute path', async () => {
            const { logsDir } = await import('../temp-dir.js');
            const dir = logsDir();

            expect(dir).toBeTruthy();
            expect(path.isAbsolute(dir)).toBeTruthy();
        });

        it('tempDirPath always returns an absolute path', async () => {
            const { tempDirPath } = await import('../temp-dir.js');
            const dir = tempDirPath();

            expect(dir).toBeTruthy();
            expect(path.isAbsolute(dir)).toBeTruthy();
        });
    });

    describe('WriteReport invariants', () => {
        it('returns absolute path ending with original filename for any valid filename', async () => {
            const { writeReport } = await import('../temp-dir.js');
            fc.assert(
                fc.property(FilenameArb, ContentArb, (filename, content) => {
                    const result = writeReport(filename, content);

                    expect(path.isAbsolute(result)).toBeTruthy();
                    expect(result.endsWith(filename)).toBeTruthy();
                }),
                { numRuns: 50 },
            );
        });
    });

    describe('WriteEphemeral invariants', () => {
        it('returns path containing category for any valid category and filename', async () => {
            const { writeEphemeral } = await import('../temp-dir.js');
            fc.assert(
                fc.property(CategoryArb, FilenameArb, ContentArb, (category, filename, content) => {
                    const result = writeEphemeral(category, filename, content);

                    expect(path.isAbsolute(result)).toBeTruthy();
                    expect(result).toContain(path.join(category, filename));
                }),
                { numRuns: 50 },
            );
        });
    });
});
