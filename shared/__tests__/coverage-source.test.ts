import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readIstanbulCoverage, resolveCoverage } from '../coverage-source.js';

const TEST_DIR = path.resolve('coverage-test-fixtures');
const TEST_PATH = path.join(TEST_DIR, 'coverage-summary.json');

function writeIstanbulFixture(data: unknown): void {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(TEST_PATH, JSON.stringify(data, null, 2), 'utf8');
}

describe('readIstanbulCoverage', () => {
    afterEach(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('returns coverage percentage from lines metric', () => {
        writeIstanbulFixture({
            total: {
                lines: { total: 100, covered: 80, pct: 80.0 },
                statements: { total: 100, covered: 80, pct: 80.0 },
                functions: { total: 50, covered: 40, pct: 80.0 },
                branches: { total: 40, covered: 30, pct: 75.0 },
            },
        });
        const result = readIstanbulCoverage(TEST_PATH);
        expect(result?.coveragePct).toBe(80.0);
        expect(result?.source).toBe('istanbul');
        expect(result?.detail).toContain('80.0%');
    });

    it('falls back to statements when lines is missing', () => {
        writeIstanbulFixture({
            total: {
                statements: { total: 50, covered: 25, pct: 50.0 },
            },
        });
        const result = readIstanbulCoverage(TEST_PATH);
        expect(result?.coveragePct).toBe(50.0);
        expect(result?.source).toBe('istanbul');
    });

    it('returns undefined when total is missing', () => {
        writeIstanbulFixture({});
        const result = readIstanbulCoverage(TEST_PATH);
        expect(result).toBeUndefined();
    });

    it('returns undefined when file does not exist', () => {
        const result = readIstanbulCoverage('/nonexistent/path.json');
        expect(result).toBeUndefined();
    });

    it('returns undefined when pct is missing', () => {
        writeIstanbulFixture({
            total: {
                lines: { total: 100, covered: 80 },
            },
        });
        const result = readIstanbulCoverage(TEST_PATH);
        expect(result).toBeUndefined();
    });

    it('handles malformed JSON gracefully', () => {
        fs.mkdirSync(TEST_DIR, { recursive: true });
        fs.writeFileSync(TEST_PATH, 'not valid json', 'utf8');
        const result = readIstanbulCoverage(TEST_PATH);
        expect(result).toBeUndefined();
    });

    it('accepts custom path', () => {
        const customPath = path.resolve('custom-coverage.json');
        try {
            fs.writeFileSync(
                customPath,
                JSON.stringify({ total: { lines: { total: 10, covered: 9, pct: 90.0 } } }),
                'utf8',
            );
            const result = readIstanbulCoverage(customPath);
            expect(result?.coveragePct).toBe(90.0);
        } finally {
            fs.rmSync(customPath, { force: true });
        }
    });
});

describe('resolveCoverage', () => {
    afterEach(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('prefers istanbul over ctrf when both available', () => {
        writeIstanbulFixture({
            total: {
                lines: { total: 100, covered: 85, pct: 85.0 },
            },
        });
        const result = resolveCoverage({ istanbulPath: TEST_PATH, ctrfCoverage: 70 });
        expect(result?.source).toBe('istanbul');
        expect(result?.coveragePct).toBe(85.0);
    });

    it('falls back to ctrf when istanbul not available', () => {
        const result = resolveCoverage({ ctrfCoverage: 65.5 });
        expect(result?.source).toBe('ctrf');
        expect(result?.coveragePct).toBe(65.5);
    });

    it('returns undefined when no source has data', () => {
        const result = resolveCoverage();
        expect(result).toBeUndefined();
    });

    it('returns undefined when ctrf coverage is negative', () => {
        const result = resolveCoverage({ ctrfCoverage: -1 });
        expect(result).toBeUndefined();
    });
});
