/**
 * Integration tests — Test Impact (FT-35)
 *
 * Validates the three-tier test impact analysis end-to-end:
 * - Tier 1: jest --findRelatedTests
 * - Tier 2: keyword matching
 * - Tier 3: explicit mapping
 * - Combined dedup with priority
 * - Edge cases: empty diff, no matches
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileTestMapping } from '../../types/bugs.js';
import type { TestImpactResult } from '../../types/coverage.js';

const { mockExecFileSync, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
    mockExecFileSync: vi.fn<(typeof import('child_process'))['execFileSync']>(),
    mockExistsSync: vi.fn<(typeof import('fs'))['existsSync']>(),
    mockReadFileSync: vi.fn<(typeof import('fs'))['readFileSync']>(),
}));

vi.mock('child_process', () => ({
    default: { execFileSync: mockExecFileSync },
    execFileSync: mockExecFileSync,
}));

vi.mock('fs', () => ({
    default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { analyzeTestImpact, generateTestSelectionJson } from '../../test-impact.js';

const MOCK_MAPPING: FileTestMapping[] = [
    {
        files: ['src/login.ts'],
        testKeys: ['LOGIN-001'],
        testTitles: ['Login flow'],
        testFiles: ['login.test.ts'],
    },
    {
        files: ['src/payment.ts'],
        testKeys: ['PAY-001', 'PAY-002'],
        testTitles: ['Payment processing', 'Payment refund'],
        testFiles: ['payment.test.ts'],
    },
];

const MOCK_MAPPING_PATH = 'config/test-mapping.json';

function mockFsWithMapping(): void {
    mockExistsSync.mockImplementation(
        (p) => typeof p === 'string' && (p.includes('package.json') || p === MOCK_MAPPING_PATH),
    );
    mockReadFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('package.json')) {
            return JSON.stringify({ devDependencies: { jest: '^29.0.0' } });
        }
        if (typeof p === 'string' && p === MOCK_MAPPING_PATH) {
            return JSON.stringify(MOCK_MAPPING);
        }
        return '';
    });
}

function mockFsAllFalse(): void {
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
}

describe('Integration: Test Impact (FT-35)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FT-35a: analyzeTestImpact with mapping tier', () => {
        it('returns high confidence when mapping matches changed files', () => {
            mockFsWithMapping();
            mockExecFileSync.mockReturnValue('');

            const result = analyzeTestImpact('src/login.ts', {
                mappingPath: MOCK_MAPPING_PATH,
            });

            expect(result.confidence).toBe('high');
            expect(result.changedFiles).toStrictEqual(['src/login.ts']);

            const loginTest = result.impactedTests.find((t) => t.testKey === 'LOGIN-001');

            expect(loginTest).toBeDefined();

            if (loginTest) {
                expect(loginTest.matchMode).toBe('mapping');
            }
        });

        it('finds keyword matches when no mapping or jest available', () => {
            mockFsAllFalse();
            mockExecFileSync.mockReturnValue('');

            const result = analyzeTestImpact('src/login.ts', {
                testTitles: ['Login test', 'Payment test'],
            });

            expect(result.confidence).toBe('medium');
            expect(result.impactedTests.length).toBeGreaterThanOrEqual(1);
            expect(result.impactedTests.every((t) => t.matchMode === 'keyword')).toBeTruthy();
        });

        it('returns low confidence when nothing matches', () => {
            mockFsAllFalse();
            mockExecFileSync.mockReturnValue('');

            const result = analyzeTestImpact('src/unrelated.ts', {
                testTitles: ['Login test'],
            });

            expect(result.confidence).toBe('low');
            expect(result.impactedTests).toStrictEqual([]);
        });

        it('returns empty result for empty diff', () => {
            const result = analyzeTestImpact('');

            expect(result.changedFiles).toStrictEqual([]);
            expect(result.impactedTests).toStrictEqual([]);
            expect(result.confidence).toBe('low');
        });
    });

    describe('FT-35b: generateTestSelectionJson', () => {
        it('produces serialisable output from analysis result', () => {
            const result: TestImpactResult = {
                changedFiles: ['src/login.ts'],
                impactedTests: [
                    {
                        title: 'Login test',
                        testKey: 'LOGIN-001',
                        reason: 'mapping match: src/login.ts',
                        matchMode: 'mapping',
                        filePattern: 'src/login.ts',
                    },
                ],
                unaffected: { total: 0, skippedDueTo: [] },
                suggestedCommand: 'npx jest --findRelatedTests src/login.ts',
                confidence: 'high',
            };

            const json = generateTestSelectionJson(result);

            expect(json.changedFiles).toStrictEqual(['src/login.ts']);
            expect(json.impactedTests).toHaveLength(1);
            expect(json.impactedTests[0]?.title).toBe('Login test');
            expect(json.impactedTests[0]?.testKey).toBe('LOGIN-001');
            expect(json.confidence).toBe('high');
            expect(json.conservative).toBeFalsy();
            expect(json.generatedAt).toBeTruthy();
            expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json);
        });
    });

    describe('FT-35c: dedup prioritizes mapping over jest over keyword', () => {
        it('deduplicates across tiers with correct priority', () => {
            mockFsWithMapping();
            mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                if (args?.includes('--listTests')) {
                    return '/path/to/login.test.ts\n/path/to/auth.test.ts';
                }
                return '';
            });

            const result = analyzeTestImpact('src/login.ts\nsrc/auth.ts', {
                mappingPath: MOCK_MAPPING_PATH,
                testTitles: ['Login test', 'Auth test'],
            });

            expect(result.confidence).toBe('high');

            const loginTest = result.impactedTests.find((t) => t.testKey === 'LOGIN-001');

            expect(loginTest).toBeDefined();

            if (loginTest) {
                expect(loginTest.matchMode).toBe('mapping');
            }

            const loginMappingEntry = result.impactedTests.find((t) => t.testKey === 'LOGIN-001');

            expect(loginMappingEntry).toBeDefined();

            if (loginMappingEntry) {
                expect(loginMappingEntry.matchMode).toBe('mapping');
            }

            const loginTestEntries = result.impactedTests.filter((t) => t.title === 'Login test');

            expect(loginTestEntries).toHaveLength(1);
            expect(loginTestEntries[0]?.matchMode).toBe('keyword');
        });
    });
});
