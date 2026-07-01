/**
 * Integration tests — Coverage Source (FT-11)
 *
 * Validates the layered coverage resolution:
 * - Istanbul coverage/coverage-summary.json reading
 * - CTRF coverage fallback
 * - Priority: Istanbul > CTRF > none
 * - Edge cases: missing file, invalid JSON, empty total
 *
 * Uses real filesystem in isolated temp directories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let TEST_DIR: string;

describe('Integration: Coverage Source', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-coverage-'));
    });

    afterEach(() => {
        if (TEST_DIR) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    describe('FT-11a: readIstanbulCoverage', () => {
        it('reads valid Istanbul coverage file', async () => {
            expect.hasAssertions();

            const { readIstanbulCoverage } = await import('../../coverage-source.js');
            const coveragePath = path.join(TEST_DIR, 'coverage-summary.json');
            fs.writeFileSync(
                path.resolve(path.resolve(coveragePath)),
                JSON.stringify({
                    total: {
                        lines: { total: 1000, covered: 850, pct: 85 },
                        statements: { total: 1000, covered: 840, pct: 84 },
                        functions: { total: 200, covered: 180, pct: 90 },
                        branches: { total: 500, covered: 400, pct: 80 },
                    },
                }),
            );

            const result = readIstanbulCoverage(coveragePath);

            expect(result?.coveragePct).toBe(85);
            expect(result?.source).toBe('istanbul');
            expect(result?.detail).toContain('85.0%');
        });

        it('returns undefined when file does not exist', async () => {
            expect.hasAssertions();

            const { readIstanbulCoverage } = await import('../../coverage-source.js');
            const result = readIstanbulCoverage(path.join(TEST_DIR, 'nonexistent.json'));

            expect(result).toBeUndefined();
        });

        it('returns undefined on invalid JSON', async () => {
            expect.hasAssertions();

            const { readIstanbulCoverage } = await import('../../coverage-source.js');
            const coveragePath = path.join(TEST_DIR, 'bad.json');
            fs.writeFileSync(path.resolve(coveragePath), 'not json');
            const result = readIstanbulCoverage(coveragePath);

            expect(result).toBeUndefined();
        });

        it('returns undefined when total is missing', async () => {
            expect.hasAssertions();

            const { readIstanbulCoverage } = await import('../../coverage-source.js');
            const coveragePath = path.join(TEST_DIR, 'no-total.json');
            fs.writeFileSync(path.resolve(coveragePath), JSON.stringify({ total: undefined }));
            const result = readIstanbulCoverage(coveragePath);

            expect(result).toBeUndefined();
        });
    });

    describe('FT-11b: resolveCoverage priority', () => {
        it('prefers Istanbul over CTRF', async () => {
            expect.hasAssertions();

            const { resolveCoverage } = await import('../../coverage-source.js');
            const coveragePath = path.join(TEST_DIR, 'coverage-summary.json');
            fs.writeFileSync(
                path.resolve(path.resolve(coveragePath)),
                JSON.stringify({
                    total: { lines: { total: 100, covered: 90, pct: 90 } },
                }),
            );

            const result = resolveCoverage({ istanbulPath: coveragePath, ctrfCoverage: 75 });

            expect(result?.source).toBe('istanbul');
            expect(result?.coveragePct).toBe(90);
        });

        it('falls back to CTRF when Istanbul unavailable', async () => {
            expect.hasAssertions();

            const { resolveCoverage } = await import('../../coverage-source.js');
            const result = resolveCoverage({
                istanbulPath: path.join(TEST_DIR, 'nonexistent.json'),
                ctrfCoverage: 75.5,
            });

            expect(result?.source).toBe('ctrf');
            expect(result?.coveragePct).toBe(75.5);
        });

        it('returns undefined when no source available', async () => {
            expect.hasAssertions();

            const { resolveCoverage } = await import('../../coverage-source.js');
            const result = resolveCoverage({
                istanbulPath: path.join(TEST_DIR, 'nonexistent.json'),
            });

            expect(result).toBeUndefined();
        });
    });
});
