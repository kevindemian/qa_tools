jest.mock('child_process');
jest.mock('fs', () => {
    const actual = jest.requireActual<typeof import('fs')>('fs');
    return { ...actual, existsSync: jest.fn(), readFileSync: jest.fn() };
});
jest.mock('./logger', () => ({
    rootLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import type { PathLike } from 'fs';
import { nonNull } from './test-utils';
import { analyzeTestImpact, generateTestSelectionJson } from './test-impact';

const mockExecFileSync = jest.mocked(execFileSync);
const mockExistsSync = jest.mocked(existsSync);
const mockReadFileSync = jest.mocked(readFileSync);

function mockPackageJson(hasJest: boolean): void {
    mockExistsSync.mockImplementation((p: PathLike) => typeof p === 'string' && p.includes('package.json'));
    mockReadFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('package.json')) {
            return JSON.stringify({
                devDependencies: hasJest ? { jest: '^29.0.0' } : {},
            });
        }
        return '';
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('analyzeTestImpact', () => {
    describe('Tier 1 — jest --findRelatedTests', () => {
        it('returns high confidence when jest finds tests', () => {
            mockPackageJson(true);
            mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                if (args?.includes('--listTests')) {
                    return '/path/to/login.test.ts\n/path/to/auth.test.ts';
                }
                return '';
            });

            const result = analyzeTestImpact('src/login.ts\nsrc/auth.ts');

            expect(result.confidence).toBe('high');
            expect(result.impactedTests).toHaveLength(2);
            expect(nonNull(result.impactedTests[0]).matchMode).toBe('jest_find_related');
            expect(result.changedFiles).toEqual(['src/login.ts', 'src/auth.ts']);
        });

        it('generates suggested command when jest is available', () => {
            mockPackageJson(true);
            mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                if (args?.includes('--listTests')) {
                    return '/path/to/login.test.ts\n/path/to/auth.test.ts';
                }
                return '';
            });

            const result = analyzeTestImpact('src/login.ts');
            expect(result.suggestedCommand).toBe('npx jest --findRelatedTests src/login.ts');
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

    describe('all 3 tiers combined', () => {
        it('deduplicates tests across tiers with priority mapping > jest > keyword', () => {
            mockPackageJson(true);
            mockExistsSync.mockImplementation((p: PathLike) => {
                if (typeof p === 'string' && p.includes('package.json')) return true;
                if (typeof p === 'string' && p.includes('test-mapping.json')) return true;
                return false;
            });
            mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                if (args?.includes('--listTests')) {
                    return '/path/to/login.test.ts\n/path/to/auth.test.ts';
                }
                return '';
            });
            mockReadFileSync.mockImplementation((p) => {
                if (typeof p === 'string' && p.includes('package.json')) {
                    return JSON.stringify({ devDependencies: { jest: '^29.0.0' } });
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

            const result = analyzeTestImpact('src/login.ts\nsrc/auth.ts\nsrc/profile.ts', {
                mappingPath: 'config/test-mapping.json',
                testTitles: ['Login test', 'Auth test', 'Profile page', 'Extra test'],
            });

            // Mapping: PROJ-42 (login), PROJ-50 (profile)
            // Jest: login, auth
            // Keyword: login (via login segment), auth (via auth segment), profile (via profile segment), extra (not matched)
            // Dedup: mapping takes priority for login & profile,
            //        jest for auth,
            //        keyword for anything not in mapping/jest
            const titles = result.impactedTests.map((t) => t.title);
            expect(titles).toContain('Login test');
            expect(titles).toContain('Profile page');
            expect(titles).toContain('auth');
            expect(titles).toContain('Auth test');

            const loginTest = result.impactedTests.find((t) => t.title === 'Login test');
            expect(nonNull(loginTest).matchMode).toBe('mapping');
            expect(nonNull(loginTest).testKey).toBe('PROJ-42');

            const authTest = result.impactedTests.find((t) => t.title === 'auth');
            expect(nonNull(authTest).matchMode).toBe('jest_find_related');
        });
    });

    describe('edge cases', () => {
        it('returns empty impact for empty diff', () => {
            const result = analyzeTestImpact('');
            expect(result.changedFiles).toEqual([]);
            expect(result.impactedTests).toEqual([]);
            expect(result.confidence).toBe('low');
        });

        it('handles error when git diff fails', () => {
            mockExistsSync.mockReturnValue(false);
            mockExecFileSync.mockImplementation(() => {
                throw new Error('fatal: not a git repository');
            });

            const result = analyzeTestImpact();
            expect(result.changedFiles).toEqual([]);
            expect(result.confidence).toBe('low');
        });

        it('returns no tests when nothing matches', () => {
            mockPackageJson(false);
            const result = analyzeTestImpact('src/unrelated.ts');
            expect(result.impactedTests).toEqual([]);
            expect(result.confidence).toBe('low');
        });

        it('handles malformed package.json gracefully', () => {
            mockExistsSync.mockImplementation((p: PathLike) => {
                if (typeof p === 'string' && p.includes('package.json')) return true;
                return false;
            });
            mockReadFileSync.mockImplementation(() => {
                throw new Error('parse error');
            });

            const result = analyzeTestImpact('src/login.ts');
            expect(result.impactedTests).toEqual([]);
            expect(result.confidence).toBe('low');
        });
    });

    describe('git diff parsing', () => {
        it('runs git diff when no diff argument provided', () => {
            mockPackageJson(false);
            mockExecFileSync.mockReturnValue('src/file1.ts\nsrc/file2.ts\n');

            const result = analyzeTestImpact();
            expect(result.changedFiles).toEqual(['src/file1.ts', 'src/file2.ts']);
        });
    });

    describe('confidence labeling', () => {
        it('sets high when jest found tests', () => {
            mockPackageJson(true);
            mockExecFileSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
                if (args?.includes('--listTests')) return 'test.test.ts';
                return '';
            });
            const result = analyzeTestImpact('src/file.ts');
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

describe('generateTestSelectionJson', () => {
    it('returns serialisable JSON from a TestImpactResult', () => {
        const result = {
            changedFiles: ['src/login.ts'],
            impactedTests: [
                {
                    title: 'Login test',
                    testKey: 'PROJ-42',
                    reason: 'Jest --findRelatedTests: login.test.ts',
                    matchMode: 'jest_find_related' as const,
                    filePattern: 'login.test.ts',
                },
            ],
            unaffected: { total: 0, skippedDueTo: [] },
            suggestedCommand: 'npx jest --findRelatedTests src/login.ts',
            confidence: 'high' as const,
        };

        const json = generateTestSelectionJson(result);
        expect(json.changedFiles).toEqual(['src/login.ts']);
        expect(json.impactedTests).toHaveLength(1);
        expect(nonNull(json.impactedTests[0]).title).toBe('Login test');
        expect(nonNull(json.impactedTests[0]).testKey).toBe('PROJ-42');
        expect(nonNull(json.impactedTests[0]).matchMode).toBe('jest_find_related');
        expect(json.suggestedCommand).toBe('npx jest --findRelatedTests src/login.ts');
        expect(json.confidence).toBe('high');
        expect(json.conservative).toBe(false);
        expect(json.smokeTests).toEqual([]);
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
        expect(json.conservative).toBe(true);
        expect(json.smokeTests).toEqual(['smoke-health', 'smoke-auth']);
    });

    it('handles empty impact gracefully', () => {
        const result = {
            changedFiles: [],
            impactedTests: [],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low' as const,
        };
        const json = generateTestSelectionJson(result);
        expect(json.changedFiles).toEqual([]);
        expect(json.impactedTests).toEqual([]);
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
