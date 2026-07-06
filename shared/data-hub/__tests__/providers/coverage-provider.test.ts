/**
 * Unit tests for Coverage Data Provider.
 *
 * Tests the adapter that reads Istanbul/CTRF coverage files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoverageDataProvider } from '../../providers/coverage-provider.js';
import * as fsp from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const MOCK_SUMMARY = {
    total: {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 24, skipped: 0, pct: 80 },
        statements: { total: 100, covered: 80, skipped: 0, pct: 80 },
    },
    'src/foo.ts': {
        lines: { total: 50, covered: 45, skipped: 0, pct: 90 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 15, covered: 14, skipped: 0, pct: 93.33 },
        statements: { total: 50, covered: 45, skipped: 0, pct: 90 },
    },
    'src/bar.ts': {
        lines: { total: 50, covered: 35, skipped: 0, pct: 70 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 15, covered: 10, skipped: 0, pct: 66.67 },
        statements: { total: 50, covered: 35, skipped: 0, pct: 70 },
    },
};

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('CoverageDataProvider', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = resolve(join(tmpdir(), `coverage-test-${Date.now()}`));
        if (!tmpDir.startsWith(resolve(tmpdir()))) {
            throw new Error('Path traversal detected in tmpDir');
        }
        await Reflect.apply(fsp.mkdir, undefined, [tmpDir, { recursive: true }]);
    });

    afterEach(async () => {
        try {
            const summaryPath = resolve(join(tmpDir, 'coverage-summary.json'));
            if (summaryPath.startsWith(resolve(tmpdir()))) {
                await Reflect.apply(fsp.unlink, undefined, [summaryPath]);
            }
        } catch {
            // ignore
        }
    });

    it('has correct name and source', () => {
        expect.hasAssertions();

        const provider = new CoverageDataProvider(join(tmpDir, 'coverage.json'));

        expect(provider.name).toBe('coverage');
        expect(provider.source).toBe('coverage');
    });

    it('reads coverage data from Istanbul JSON', async () => {
        expect.hasAssertions();

        const filePath = resolve(join(tmpDir, 'coverage-summary.json'));
        if (!filePath.startsWith(resolve(tmpdir()))) {
            throw new Error('Path traversal detected');
        }
        await Reflect.apply(fsp.writeFile, undefined, [filePath, JSON.stringify(MOCK_SUMMARY)]);
        const provider = new CoverageDataProvider(filePath);

        const result = await provider.fetchRawData({ repo: 'test' });

        expect(result.coverage).toBeDefined();

        const coverage = result.coverage;

        expect(coverage?.total).toBe(100);
        expect(coverage?.covered).toBe(80);
        expect(coverage?.percentage).toBe(80);
        expect(Object.keys(coverage?.files ?? {})).toHaveLength(2);
    });

    it('returns undefined coverage for missing file', async () => {
        expect.hasAssertions();

        const provider = new CoverageDataProvider('/nonexistent/coverage.json');

        const result = await provider.fetchRawData({ repo: 'test' });

        expect(result.coverage).toBeUndefined();
    });

    it('returns empty runs and maps', async () => {
        expect.hasAssertions();

        const filePath = resolve(join(tmpDir, 'coverage-summary.json'));
        if (!filePath.startsWith(resolve(tmpdir()))) {
            throw new Error('Path traversal detected');
        }
        await Reflect.apply(fsp.writeFile, undefined, [filePath, JSON.stringify(MOCK_SUMMARY)]);
        const provider = new CoverageDataProvider(filePath);

        const result = await provider.fetchRawData({ repo: 'test' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
        expect(result.artifacts.size).toBe(0);
        expect(result.failureReasons.size).toBe(0);
    });
});
