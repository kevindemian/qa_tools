/**
 * Property-Based Tests — Coverage Source (FT-11)
 *
 * Dimensão 5 — Métricas:
 * - readIstanbulCoverage: pct sempre em [0,100], source='istanbul'
 * - resolveCoverage: priority (istanbul > ctrf > none)
 * - detail consistency: prefix matches source metric
 */
import * as fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readIstanbulCoverage, resolveCoverage } from '../coverage-source.js';

/* ── Helpers ─────────────────────────────────────────────────── */

let TEST_DIR: string;

function randomPct(): fc.Arbitrary<number> {
    return fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true });
}

interface IstanbulFixture {
    total?: {
        lines?: { total: number; covered: number; pct: number };
        statements?: { total: number; covered: number; pct: number };
        functions?: { total: number; covered: number; pct: number };
        branches?: { total: number; covered: number; pct: number };
    };
}

const istanbulFixtureArb: fc.Arbitrary<IstanbulFixture> = fc
    .tuple(fc.boolean(), fc.boolean(), randomPct(), randomPct())
    .map(([hasLines, hasStatements, linesPct, stmtsPct]) => {
        const total: IstanbulFixture['total'] = {};
        if (hasLines) {
            const covered = Math.round(linesPct);
            total.lines = { total: 100, covered, pct: covered };
        }
        if (hasStatements) {
            const covered = Math.round(stmtsPct);
            total.statements = { total: 100, covered, pct: covered };
        }
        return Object.keys(total).length > 0 ? { total } : {};
    });

function writeFixture(fixture: unknown, name = 'coverage-summary.json'): string {
    const coveragePath = path.join(TEST_DIR, name);
    fs.writeFileSync(coveragePath, JSON.stringify(fixture));
    return coveragePath;
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('ReadIstanbulCoverage — property-based', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-istanbul-'));
    });

    afterEach(() => {
        if (TEST_DIR) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('source is always istanbul when data exists', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(istanbulFixtureArb, (fixture) => {
                const coveragePath = writeFixture(fixture);
                const result = readIstanbulCoverage(coveragePath);

                expect(result === undefined || result.source === 'istanbul').toBeTruthy();
            }),
            { numRuns: 50 },
        );
    });

    it('coveragePct is always in [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(istanbulFixtureArb, (fixture) => {
                const coveragePath = writeFixture(fixture);
                const result = readIstanbulCoverage(coveragePath);

                expect(result === undefined || (result.coveragePct >= 0 && result.coveragePct <= 100)).toBeTruthy();
            }),
            { numRuns: 50 },
        );
    });

    it('prefers lines pct over statements pct', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(randomPct(), randomPct(), (linesPct, stmtsPct) => {
                const coveredLines = Math.round(linesPct);
                const coveredStmts = Math.round(stmtsPct);
                const fixture = {
                    total: {
                        lines: { total: 100, covered: coveredLines, pct: coveredLines },
                        statements: { total: 100, covered: coveredStmts, pct: coveredStmts },
                    },
                };
                const coveragePath = writeFixture(fixture);
                const result = readIstanbulCoverage(coveragePath);

                expect(result?.coveragePct).toBe(coveredLines);
            }),
            { numRuns: 50 },
        );
    });

    it('falls back to statements when lines missing', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(randomPct(), (stmtsPct) => {
                const covered = Math.round(stmtsPct);
                const fixture = {
                    total: {
                        statements: { total: 100, covered, pct: covered },
                    },
                };
                const coveragePath = writeFixture(fixture);
                const result = readIstanbulCoverage(coveragePath);

                expect(result?.coveragePct).toBe(covered);
            }),
            { numRuns: 50 },
        );
    });

    it('detail prefix matches metric source', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), randomPct(), randomPct(), (useLines, linesPct, stmtsPct) => {
                const coveredLines = Math.round(linesPct);
                const coveredStmts = Math.round(stmtsPct);
                const fixture = useLines
                    ? { total: { lines: { total: 100, covered: coveredLines, pct: coveredLines } } }
                    : { total: { statements: { total: 100, covered: coveredStmts, pct: coveredStmts } } };
                const coveragePath = writeFixture(fixture);
                const result = readIstanbulCoverage(coveragePath);
                const expectedDetail = useLines ? /^lines / : /^statements /;

                expect(result?.detail).toMatch(expectedDetail);
            }),
            { numRuns: 50 },
        );
    });
});

describe('ResolveCoverage — property-based', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-resolve-'));
    });

    afterEach(() => {
        if (TEST_DIR) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('istanbul takes priority over ctrf', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(randomPct(), randomPct(), (istanbulPct, ctrfPct) => {
                const covered = Math.round(istanbulPct);
                const fixture = {
                    total: { lines: { total: 100, covered, pct: covered } },
                };
                const coveragePath = writeFixture(fixture);
                const result = resolveCoverage({ istanbulPath: coveragePath, ctrfCoverage: ctrfPct });

                expect(result?.source).toBe('istanbul');
                expect(result?.coveragePct).toBe(covered);
            }),
            { numRuns: 50 },
        );
    });

    it('ctrf is used when istanbul unavailable', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(randomPct(), (ctrfPct) => {
                const result = resolveCoverage({
                    istanbulPath: path.join(TEST_DIR, 'nonexistent.json'),
                    ctrfCoverage: ctrfPct,
                });

                expect(result?.source).toBe('ctrf');
                expect(result?.coveragePct).toBe(ctrfPct);
            }),
            { numRuns: 50 },
        );
    });

    it('returns undefined when no source available', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), fc.boolean(), (hasIstanbul, hasCtrf) => {
                const options: { istanbulPath?: string; ctrfCoverage?: number } = {};
                if (hasIstanbul) options.istanbulPath = path.join(TEST_DIR, 'nonexistent.json');
                if (hasCtrf) options.ctrfCoverage = -1;
                const result = resolveCoverage(Object.keys(options).length > 0 ? options : undefined);

                expect(result).toBeUndefined();
            }),
            { numRuns: 50 },
        );
    });
});
