/**
 * Property-Based Tests — Test Impact (FT-35)
 *
 * Invariants:
 * - analyzeTestImpact: confidence follows tier ordering
 * - No duplicate test keys or titles in impactedTests
 * - Empty diff → empty result + low confidence
 * - generateTestSelectionJson output is serializable and round-trips
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { analyzeTestImpact, generateTestSelectionJson } from '../test-impact.js';
import type { ImpactedTest, TestImpactResult } from '../types/coverage.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('child_process', () => ({
    default: { execFileSync: vi.fn() },
    execFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
    default: { existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn().mockReturnValue('') },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
}));

import { execFileSync } from 'child_process';
const mockedExecFileSync = vi.mocked(execFileSync);

/* ── Arbitraries ─────────────────────────────────────────────── */

const changedFileArb: fc.Arbitrary<string> = fc.constantFrom(
    'src/login.ts',
    'src/auth.ts',
    'src/payment.ts',
    'src/profile.ts',
    'src/dashboard.ts',
    'src/api/handler.ts',
);

const changedFilesArb: fc.Arbitrary<string[]> = fc.uniqueArray(changedFileArb, { minLength: 0, maxLength: 5 });

const testTitleArb: fc.Arbitrary<string> = fc.constantFrom(
    'Login test',
    'Auth test',
    'Payment test',
    'Profile test',
    'Dashboard test',
    'API test',
);

const nonMatchingTitleArb: fc.Arbitrary<string> = fc.constantFrom(
    'XYZZYX test',
    'QWERTY flow',
    'FOOBAR check',
    'BAZQUX validation',
);

const testTitlesArb: fc.Arbitrary<string[]> = fc.uniqueArray(testTitleArb, { minLength: 0, maxLength: 4 });

/* ── Tests ───────────────────────────────────────────────────── */

describe('AnalyzeTestImpact — property-based', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('confidence is low when nothing matches and jest unavailable', () => {
        fc.assert(
            fc.property(changedFilesArb, nonMatchingTitleArb, (files, title) => {
                vi.clearAllMocks();
                mockedExecFileSync.mockReturnValue('');

                const diff = files.join('\n');
                const result = analyzeTestImpact(diff, { testTitles: [title] });

                expect(result.confidence).toBe('low');
                expect(result.impactedTests).toEqual([]);
            }),
            { numRuns: 100 },
        );
    });

    it('empty diff returns empty result with low confidence', () => {
        fc.assert(
            fc.property(fc.constant(undefined), () => {
                const result = analyzeTestImpact('');

                expect(result.changedFiles).toEqual([]);
                expect(result.impactedTests).toEqual([]);
                expect(result.confidence).toBe('low');
            }),
            { numRuns: 10 },
        );
    });

    it('impactedTests has no duplicate test keys', () => {
        fc.assert(
            fc.property(changedFilesArb, testTitlesArb, (files, titles) => {
                vi.clearAllMocks();
                mockedExecFileSync.mockReturnValue('');

                const diff = files.join('\n');
                const result = analyzeTestImpact(diff, { testTitles: titles });

                const keys = result.impactedTests.map((t) => t.testKey ?? t.title);
                const uniqueKeys = new Set(keys);

                expect(keys).toHaveLength(uniqueKeys.size);
            }),
            { numRuns: 100 },
        );
    });

    it('changedFiles preserves order and content of diff', () => {
        fc.assert(
            fc.property(changedFilesArb, (files) => {
                vi.clearAllMocks();
                mockedExecFileSync.mockReturnValue('');

                const diff = files.join('\n');
                const result = analyzeTestImpact(diff);

                expect(result.changedFiles).toEqual(files);
            }),
            { numRuns: 100 },
        );
    });

    it('confidence is never undefined or invalid', () => {
        fc.assert(
            fc.property(changedFilesArb, testTitlesArb, (files, titles) => {
                vi.clearAllMocks();
                mockedExecFileSync.mockReturnValue('');

                const diff = files.join('\n');
                const result = analyzeTestImpact(diff, { testTitles: titles });

                expect(['high', 'medium', 'low']).toContain(result.confidence);
            }),
            { numRuns: 100 },
        );
    });
});

describe('GenerateTestSelectionJson — property-based', () => {
    it('round-trips through JSON serialization', () => {
        fc.assert(
            fc.property(
                fc.array(changedFileArb, { minLength: 0, maxLength: 5 }),
                fc.boolean(),
                fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
                (files, conservative, smokeTests) => {
                    const result: TestImpactResult = {
                        changedFiles: files,
                        impactedTests:
                            files.length > 0
                                ? files.map((f, i) => ({
                                      title: `Test ${i}`,
                                      reason: `changed: ${f}`,
                                      matchMode: 'keyword',
                                      filePattern: f,
                                  }))
                                : [],
                        unaffected: { total: 0, skippedDueTo: [] },
                        confidence: files.length > 0 ? 'high' : 'low',
                    };

                    const json = generateTestSelectionJson(result, { conservative, smokeTests });

                    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
                    expect(json.conservative).toBe(conservative);
                    expect(json.smokeTests).toEqual(smokeTests);
                    expect(json.generatedAt).toBeTruthy();
                },
            ),
            { numRuns: 50 },
        );
    });

    it('preserves all impactedTest fields through serialization', () => {
        fc.assert(
            fc.property(changedFileArb, (file) => {
                const test: ImpactedTest = {
                    title: `Test for ${file}`,
                    testKey: 'KEY-001',
                    reason: `mapping: ${file}`,
                    matchMode: 'mapping',
                    filePattern: file,
                };
                const result: TestImpactResult = {
                    changedFiles: [file],
                    impactedTests: [test],
                    unaffected: { total: 0, skippedDueTo: [] },
                    confidence: 'high',
                };

                const json = generateTestSelectionJson(result);
                const parsed = json.impactedTests[0];

                expect(parsed?.title).toBe(test.title);
                expect(parsed?.testKey).toBe(test.testKey);
                expect(parsed?.reason).toBe(test.reason);
                expect(parsed?.matchMode).toBe(test.matchMode);
                expect(parsed?.filePattern).toBe(test.filePattern);
            }),
            { numRuns: 50 },
        );
    });
});
