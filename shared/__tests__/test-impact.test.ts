const {
    mockExecFileSync: _mockExecFileSync,
    mockExistsSync: _mockExistsSync,
    mockReadFileSync: _mockReadFileSync,
} = vi.hoisted(() => ({
    mockExecFileSync: vi.fn<(typeof import('child_process'))['execFileSync']>(),
    mockExistsSync: vi.fn<(typeof import('fs'))['existsSync']>(),
    mockReadFileSync: vi.fn<(typeof import('fs'))['readFileSync']>(),
}));

vi.mock('child_process', () => ({
    default: { execFileSync: _mockExecFileSync },
    execFileSync: _mockExecFileSync,
}));

vi.mock('fs', () => ({
    default: { existsSync: _mockExistsSync, readFileSync: _mockReadFileSync },
    existsSync: _mockExistsSync,
    readFileSync: _mockReadFileSync,
}));

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import type { PathLike } from 'fs';
import { nonNull } from '../test-utils.js';
import { analyzeTestImpact, generateTestSelectionJson } from '../quality/test-impact.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function mockPackageJson(hasVitest: boolean): void {
    mockExistsSync.mockImplementation((p: PathLike) => typeof p === 'string' && p.includes('package.json'));
    mockReadFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('package.json')) {
            return JSON.stringify({
                devDependencies: hasVitest ? { vitest: '^1.0.0' } : {},
            });
        }
        return '';
    });
}

describe('Test Impact', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('AnalyzeTestImpact', () => {
        describe('Tier 1 — vitest list --changed', () => {
            it('returns high confidence when vitest finds tests', () => {
                mockPackageJson(true);
                mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                    if (args?.includes('HEAD~1')) {
                        return 'src/login.ts\nsrc/auth.ts\n';
                    }
                    if (args?.includes('list')) {
                        return 'login.test.ts\nauth.test.ts\n';
                    }
                    return '';
                });

                const result = analyzeTestImpact();

                expect(result.confidence).toBe('high');
                expect(result.impactedTests).toHaveLength(2);
                expect(nonNull(result.impactedTests[0]).matchMode).toBe('vitest_find_related');
                expect(result.changedFiles).toStrictEqual(['src/login.ts', 'src/auth.ts']);
            });

            it('generates suggested command when vitest is available', () => {
                mockPackageJson(true);
                mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                    if (args?.includes('HEAD~1')) {
                        return 'src/login.ts\n';
                    }
                    if (args?.includes('list')) {
                        return 'login.test.ts\n';
                    }
                    return '';
                });

                const result = analyzeTestImpact();

                expect(result.suggestedCommand).toBe('npx vitest related --run');
            });
        });

        describe('Tier 2 — keyword matching', () => {
            it('finds tests via keyword matching with custom test titles', () => {
                mockPackageJson(false);
                const result = analyzeTestImpact('src/login.ts', {
                    testTitles: ['Login test', 'Logout test'],
                });

                expect(result.impactedTests).toHaveLength(1);
                expect(nonNull(result.impactedTests[0]).title).toBe('Login test');
                expect(nonNull(result.impactedTests[0]).matchMode).toBe('keyword');
                expect(result.confidence).toBe('medium');
            });
        });

        describe('Tier 3 — explicit mapping', () => {
            it('returns high confidence from mapping file', () => {
                mockPackageJson(false);
                mockExistsSync.mockImplementation((p: PathLike) => {
                    if (typeof p === 'string' && p.includes('package.json')) return true;
                    if (typeof p === 'string' && p.includes('test-mapping.json')) return true;
                    return false;
                });
                mockReadFileSync.mockImplementation((p) => {
                    if (typeof p === 'string' && p.includes('package.json')) {
                        return JSON.stringify({ devDependencies: {} });
                    }
                    if (typeof p === 'string' && p.includes('test-mapping.json')) {
                        return JSON.stringify([
                            {
                                files: ['src/login.ts'],
                                testKeys: ['PROJ-42'],
                                testTitles: ['Login com SSO'],
                                testFiles: ['login.test.ts'],
                            },
                        ]);
                    }
                    return '';
                });

                const result = analyzeTestImpact('src/login.ts', {
                    mappingPath: 'config/test-mapping.json',
                });

                expect(result.impactedTests).toHaveLength(1);
                expect(nonNull(result.impactedTests[0]).testKey).toBe('PROJ-42');
                expect(nonNull(result.impactedTests[0]).title).toBe('Login com SSO');
                expect(nonNull(result.impactedTests[0]).matchMode).toBe('mapping');
                expect(result.confidence).toBe('high');
            });
        });

        describe('All 3 tiers combined', () => {
            it('deduplicates tests across tiers with priority mapping > vitest > keyword', () => {
                mockPackageJson(true);
                mockExistsSync.mockImplementation((p: PathLike) => {
                    if (typeof p === 'string' && p.includes('package.json')) return true;
                    if (typeof p === 'string' && p.includes('test-mapping.json')) return true;
                    return false;
                });
                mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                    if (args?.includes('HEAD~1')) {
                        return 'src/login.ts\nsrc/auth.ts\nsrc/profile.ts\n';
                    }
                    if (args?.includes('list')) {
                        return 'login.test.ts\nauth.test.ts\n';
                    }
                    return '';
                });
                mockReadFileSync.mockImplementation((p) => {
                    if (typeof p === 'string' && p.includes('package.json')) {
                        return JSON.stringify({ devDependencies: { vitest: '^1.0.0' } });
                    }
                    if (typeof p === 'string' && p.includes('test-mapping.json')) {
                        return JSON.stringify([
                            {
                                files: ['src/login.ts'],
                                testKeys: ['PROJ-42'],
                                testTitles: ['Login test'],
                                testFiles: ['login.test.ts'],
                            },
                            {
                                files: ['src/profile.ts'],
                                testKeys: ['PROJ-50'],
                                testTitles: ['Profile page'],
                                testFiles: ['profile.test.ts'],
                            },
                        ]);
                    }
                    return '';
                });

                const result = analyzeTestImpact(undefined, {
                    mappingPath: 'config/test-mapping.json',
                    testTitles: ['Login test', 'Auth test', 'Profile page', 'Extra test'],
                });

                // Mapping: PROJ-42 (login), PROJ-50 (profile)
                // Vitest: login, auth
                // Keyword: login (via login segment), auth (via auth segment), profile (via profile segment), extra (not matched)
                // Dedup: mapping takes priority for login & profile,
                //        vitest for auth (key=auth is distinct from key=Auth test),
                //        keyword for anything not in mapping/vitest
                const titles = result.impactedTests.map((t) => t.title);

                expect(titles).toContain('Login test');
                expect(titles).toContain('Profile page');
                expect(titles).toContain('auth');
                expect(titles).toContain('Auth test');

                const loginTest = result.impactedTests.find((t) => t.title === 'Login test');

                expect(nonNull(loginTest).matchMode).toBe('mapping');
                expect(nonNull(loginTest).testKey).toBe('PROJ-42');

                const authTest = result.impactedTests.find((t) => t.title === 'auth');

                expect(nonNull(authTest).matchMode).toBe('vitest_find_related');
            });
        });

        describe('Edge cases', () => {
            it('returns empty impact for empty diff', () => {
                const result = analyzeTestImpact('');

                expect(result.changedFiles).toStrictEqual([]);
                expect(result.impactedTests).toStrictEqual([]);
                expect(result.confidence).toBe('low');
            });

            it('handles error when git diff fails', () => {
                mockExistsSync.mockReturnValue(false);
                mockExecFileSync.mockImplementation(() => {
                    throw new Error('fatal: not a git repository');
                });

                const result = analyzeTestImpact();

                expect(result.changedFiles).toStrictEqual([]);
                expect(result.confidence).toBe('low');
            });

            it('returns no tests when nothing matches', () => {
                mockPackageJson(false);
                const result = analyzeTestImpact('src/unrelated.ts');

                expect(result.impactedTests).toStrictEqual([]);
                expect(result.confidence).toBe('low');
            });

            it('handles malformed package.json gracefully', () => {
                mockExistsSync.mockImplementation((p: PathLike) => {
                    return typeof p === 'string' && p.includes('package.json');
                });
                mockReadFileSync.mockImplementation(() => {
                    throw new Error('parse error');
                });

                const result = analyzeTestImpact('src/login.ts');

                expect(result.impactedTests).toStrictEqual([]);
                expect(result.confidence).toBe('low');
            });
        });

        describe('Git diff parsing', () => {
            it('runs git diff when no diff argument provided', () => {
                mockPackageJson(false);
                mockExecFileSync.mockReturnValue('src/file1.ts\nsrc/file2.ts\n');

                const result = analyzeTestImpact();

                expect(result.changedFiles).toStrictEqual(['src/file1.ts', 'src/file2.ts']);
            });
        });

        describe('Confidence labeling', () => {
            it('sets high when vitest found tests', () => {
                mockPackageJson(true);
                mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                    if (args?.includes('HEAD~1')) return 'src/file.ts\n';
                    if (args?.includes('list')) return 'test.test.ts\n';
                    return '';
                });
                const result = analyzeTestImpact();

                expect(result.confidence).toBe('high');
            });

            it('sets high when mapping found tests', () => {
                mockPackageJson(false);
                mockExistsSync.mockImplementation((p: PathLike) => {
                    if (typeof p === 'string' && p.includes('package.json')) return true;
                    if (typeof p === 'string' && p.includes('mapping.json')) return true;
                    return false;
                });
                mockReadFileSync.mockImplementation((p) => {
                    if (typeof p === 'string' && p.includes('package.json')) {
                        return JSON.stringify({ devDependencies: {} });
                    }
                    if (typeof p === 'string' && p.includes('mapping.json')) {
                        return JSON.stringify([
                            {
                                files: ['src/file.ts'],
                                testKeys: ['PROJ-1'],
                                testTitles: ['Test'],
                                testFiles: ['test.test.ts'],
                            },
                        ]);
                    }
                    return '';
                });
                const result = analyzeTestImpact('src/file.ts', {
                    mappingPath: 'data/mapping.json',
                });

                expect(result.confidence).toBe('high');
            });

            it('sets medium for keyword-only matches', () => {
                mockPackageJson(false);
                const result = analyzeTestImpact('src/login.ts', {
                    testTitles: ['Login test'],
                });

                expect(result.confidence).toBe('medium');
            });

            it('sets low when no tests found', () => {
                mockPackageJson(false);
                const result = analyzeTestImpact('src/unknown.ts');

                expect(result.confidence).toBe('low');
            });
        });
    });

    describe('GenerateTestSelectionJson', () => {
        it('returns serialisable JSON from a TestImpactResult', () => {
            const result = {
                changedFiles: ['src/login.ts'],
                impactedTests: [
                    {
                        title: 'Login test',
                        testKey: 'PROJ-42',
                        reason: 'Vitest related: login.test.ts',
                        matchMode: 'vitest_find_related' as const,
                        filePattern: 'login.test.ts',
                    },
                ],
                unaffected: { total: 0, skippedDueTo: [] },
                suggestedCommand: 'npx vitest related --run src/login.ts',
                confidence: 'high' as const,
            };

            const json = generateTestSelectionJson(result);

            expect(json.changedFiles).toStrictEqual(['src/login.ts']);
            expect(json.impactedTests).toHaveLength(1);
            expect(nonNull(json.impactedTests[0]).title).toBe('Login test');
            expect(nonNull(json.impactedTests[0]).testKey).toBe('PROJ-42');
            expect(nonNull(json.impactedTests[0]).matchMode).toBe('vitest_find_related');
            expect(json.suggestedCommand).toBe('npx vitest related --run src/login.ts');
            expect(json.confidence).toBe('high');
            expect(json.conservative).toBeFalsy();
        });

        it('includes smokeTests and generatedAt', () => {
            const result = {
                changedFiles: ['src/login.ts'],
                impactedTests: [
                    {
                        title: 'Login test',
                        testKey: 'PROJ-42',
                        reason: 'Vitest related: login.test.ts',
                        matchMode: 'vitest_find_related' as const,
                        filePattern: 'login.test.ts',
                    },
                ],
                unaffected: { total: 0, skippedDueTo: [] },
                suggestedCommand: 'npx vitest related --run src/login.ts',
                confidence: 'high' as const,
            };

            const json = generateTestSelectionJson(result);

            expect(json.smokeTests).toStrictEqual([]);
            expect(json.generatedAt).toBeTruthy();
        });

        it('sets conservative and smokeTests when options provided', () => {
            const result = {
                changedFiles: ['src/api.ts'],
                impactedTests: [],
                unaffected: { total: 0, skippedDueTo: [] },
                confidence: 'low' as const,
            };

            const json = generateTestSelectionJson(result, {
                conservative: true,
                smokeTests: ['smoke-health', 'smoke-auth'],
            });

            expect(json.conservative).toBeTruthy();
            expect(json.smokeTests).toStrictEqual(['smoke-health', 'smoke-auth']);
        });

        it('handles empty impact gracefully', () => {
            const result = {
                changedFiles: [],
                impactedTests: [],
                unaffected: { total: 0, skippedDueTo: [] },
                confidence: 'low' as const,
            };
            const json = generateTestSelectionJson(result);

            expect(json.changedFiles).toStrictEqual([]);
            expect(json.impactedTests).toStrictEqual([]);
            expect(json.confidence).toBe('low');
        });

        it('includes confidence and metadata fields', () => {
            const result = {
                changedFiles: ['src/a.ts'],
                impactedTests: [
                    { title: 'Test A', reason: 'mapping', matchMode: 'mapping' as const, filePattern: 'src/a.ts' },
                ],
                unaffected: { total: 0, skippedDueTo: [] },
                confidence: 'high' as const,
            };
            const json = generateTestSelectionJson(result);

            expect(json.confidence).toBe('high');
            expect(nonNull(json.impactedTests[0]).filePattern).toBe('src/a.ts');
            expect(nonNull(json.impactedTests[0]).matchMode).toBe('mapping');
        });
    });
});
