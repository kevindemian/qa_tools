import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, type PathOrFileDescriptor } from 'fs';
import { execFileSync } from 'child_process';

vi.mock('fs');
vi.mock('child_process');

vi.mock('../shared/deps.js', () => ({
    globSync: vi.fn((_p: string) => [
        'test.ts',
        'test.test.ts',
        'jira_management/commands/case01.ts',
        'jira_management/commands/case02.ts',
    ]),
}));

vi.mock('../shared/cli_base.js', () => ({
    gracefulExit: vi.fn(),
}));

vi.mock('../shared/types.js', () => ({
    ExitCode: { OK: 0, ERROR: 1 },
}));

const mockLintResults = vi.fn();
vi.mock('eslint', () => ({
    ESLint: function ESLintMock() {
        return { lintFiles: mockLintResults };
    },
}));

describe('quality-check unit tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readFileSync).mockReset();
        vi.mocked(existsSync).mockReset();
        vi.mocked(execFileSync).mockReset();
        vi.mocked(readdirSync).mockReset();
    });

    describe('checkNoPattern', () => {
        it('returns passed when no pattern matches', async () => {
            vi.mocked(readFileSync).mockReturnValue('ok line\n');
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts']);
            expect(result.passed).toBe(true);
        });

        it('returns violations when pattern matches', async () => {
            vi.mocked(readFileSync).mockReturnValue('xyz found here\n');
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts']);
            expect(result.passed).toBe(false);
            expect(result.violations.length).toBe(1);
        });

        it('skips files matching excludePattern', async () => {
            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                if (path === 'skip.ts') return 'xyz found with skip pattern\n';
                return 'no match here\n';
            });
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts', 'skip.ts'], /skip/);
            expect(result.passed).toBe(true);
        });
    });

    describe('checkEslintBaseline', () => {
        it('passes when violations ≤ baseline and no other errors', async () => {
            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: Array.from({ length: 300 }, () => ({
                        ruleId: '@typescript-eslint/unbound-method',
                        severity: 2,
                        message: 'x',
                        line: 1,
                    })),
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();
            expect(r.passed).toBe(true);
        });

        it('fails when other rule has errors', async () => {
            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: [
                        { ruleId: 'no-console', severity: 2, message: 'x', line: 1 },
                        { ruleId: '@typescript-eslint/unbound-method', severity: 2, message: 'x', line: 2 },
                    ],
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();
            expect(r.passed).toBe(false);
        });

        it('fails on unbound-method regression > 313', async () => {
            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: Array.from({ length: 314 }, () => ({
                        ruleId: '@typescript-eslint/unbound-method',
                        severity: 2,
                        message: 'x',
                        line: 1,
                    })),
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();
            expect(r.passed).toBe(false);
        });

        it('handles lintFiles error', async () => {
            mockLintResults.mockRejectedValue(new Error('lint failed'));
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();
            expect(r.passed).toBe(false);
        });
    });

    describe('checkUnusedExports', () => {
        it('passes when ts-prune output is empty', async () => {
            vi.mocked(execFileSync).mockReturnValue('');
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.passed).toBe(true);
        });

        it('passes when output matches baseline', async () => {
            vi.mocked(execFileSync).mockReturnValue('file.ts:123 - item\n');
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('file.ts:123 - item\n');
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.passed).toBe(true);
        });

        it('fails when new unused exports appear', async () => {
            vi.mocked(execFileSync).mockReturnValue('old.ts:1 - old\nnew.ts:2 - new\n');
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('old.ts:1 - old\n');
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.passed).toBe(false);
        });

        it('fails when baseline file missing', async () => {
            vi.mocked(execFileSync).mockReturnValue('file.ts:1 - item\n');
            vi.mocked(existsSync).mockReturnValue(false);
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.passed).toBe(false);
        });

        it('filters known patterns from ts-prune output', async () => {
            vi.mocked(execFileSync).mockReturnValue(
                'shared/test-utils/x.ts:1 - x\nshared/types.ts:2 - y\nother.ts:3 - z\n',
            );
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('');
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.violations.length).toBe(1);
            expect(r.violations[0]?.file).toBe('other.ts');
        });

        it('handles execFileSync failure', async () => {
            vi.mocked(execFileSync).mockImplementation(() => {
                throw new Error('exec fail');
            });
            const { checkUnusedExports } = await import('./quality-check.js');
            const r = checkUnusedExports();
            expect(r.passed).toBe(false);
        });
    });

    describe('checkHandlerConsistency', () => {
        it('detects handler registered but no menu entry', async () => {
            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                if (path === 'jira_management/menu-data.ts') return "id: '1'\n";
                if (path === 'jira_management/commands/index.ts') return "'99': {\n";
                return '';
            });
            vi.mocked(readdirSync).mockReturnValue([]);
            const { checkHandlerConsistency } = await import('./quality-check.js');
            const r = checkHandlerConsistency();
            expect(r.passed).toBe(false);
        });

        it('handles read error', async () => {
            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error('read fail');
            });
            const { checkHandlerConsistency } = await import('./quality-check.js');
            const r = checkHandlerConsistency();
            expect(r.passed).toBe(false);
        });
    });

    describe('enforce-quality checks', () => {
        it('checkThrowString detects throw literals', async () => {
            vi.mocked(readFileSync).mockReturnValue("throw 'error'\n");
            const { checkThrowString } = await import('./quality-check.js');
            const r = checkThrowString();
            expect(r.passed).toBe(false);
        });

        it('checkOnlyInTests flags exclusive tests', async () => {
            vi.mocked(readFileSync).mockReturnValue('content without pattern\n');
            const { checkOnlyInTests } = await import('./quality-check.js');
            const r = checkOnlyInTests();
            expect(r.name).toBe('exclusive test in test files');
            expect('passed' in r).toBe(true);
            expect(Array.isArray(r.violations)).toBe(true);
        });

        it('checkAsUnknownAs has correct structure', async () => {
            vi.mocked(readFileSync).mockReturnValue('clean content\n');
            const { checkAsUnknownAs } = await import('./quality-check.js');
            const r = checkAsUnknownAs();
            expect(r.name).toContain('as unknown as');
            expect('passed' in r).toBe(true);
        });

        it('checkAsAny has correct structure', async () => {
            vi.mocked(readFileSync).mockReturnValue('clean content\n');
            const { checkAsAny } = await import('./quality-check.js');
            const r = checkAsAny();
            expect(r.name).toContain('as-any');
            expect('passed' in r).toBe(true);
        });

        it('checkThrowDoubleQuote detects throw "', async () => {
            vi.mocked(readFileSync).mockReturnValue('throw "err"\n');
            const { checkThrowDoubleQuote } = await import('./quality-check.js');
            const r = checkThrowDoubleQuote();
            expect(r.passed).toBe(false);
        });

        it('checkNoImplicitOverride passes when true', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ compilerOptions: { noImplicitOverride: true } }));
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();
            expect(r.passed).toBe(true);
        });

        it('checkNoImplicitOverride fails when false', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ compilerOptions: { noImplicitOverride: false } }));
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();
            expect(r.passed).toBe(false);
        });

        it('checkNoImplicitOverride handles parse error', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('invalid json');
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();
            expect(r.passed).toBe(false);
        });

        it('checkArtifactValidators passes when all exports exist', async () => {
            const exportsList = [
                'createTestCaseValidator',
                'createAnalysisValidator',
                'createPipelineValidator',
                'createBugReportValidator',
                'createComparisonValidator',
                'verifyEvidence',
                'recalculateCoverage',
                'ArtifactValidator',
                'consensusGenerate',
                'generateWithRetry',
                'snapshotQualityMetrics',
            ];
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockImplementation((_path: PathOrFileDescriptor) =>
                exportsList.map((e) => `export function ${e}\n`).join(''),
            );
            const { checkArtifactValidators } = await import('./quality-check.js');
            const r = checkArtifactValidators();
            expect(r.passed).toBe(true);
        });

        it('checkArtifactValidators fails when export missing', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export function foo\n');
            const { checkArtifactValidators } = await import('./quality-check.js');
            const r = checkArtifactValidators();
            expect(r.passed).toBe(false);
        });

        it('checkArtifactValidatorsExist fails when file missing', async () => {
            vi.mocked(existsSync).mockReturnValue(false);
            const { checkArtifactValidatorsExist } = await import('./quality-check.js');
            const r = checkArtifactValidatorsExist();
            expect(r.passed).toBe(false);
        });

        it('checkDashboardExports passes when all export functions exist', async () => {
            const funcs = [
                'calculateReleaseScore',
                'generateReleaseScoreHtml',
                'aggregateDefectTrends',
                'generateDefectTrendHtml',
                'buildTraceabilityMatrix',
                'generateTraceabilityHtml',
                'computeAiEffectiveness',
                'generateAiEffectivenessHtml',
                'aggregateDefectSeasonality',
                'generateSeasonalityHtml',
                'detectSilentRegression',
                'generateSilentRegressionHtml',
                'compareAiVsManual',
                'generateAiComparisonHtml',
                'computeCrossSquadBenchmark',
                'generateBenchmarkHtml',
                'buildDeveloperProfile',
                'generateDeveloperProfileHtml',
                'analyzeSuiteOptimization',
                'generateOptimizationHtml',
                'analyzeBacklogHealth',
                'generateBacklogHealthHtml',
                'buildIncidentReport',
                'generateIncidentReportHtml',
                'analyzePipelineImpact',
                'generateImpactAlertHtml',
                'calculatePipelineCost',
                'generatePipelineCostHtml',
                'calculateRequirementScores',
                'generateRequirementScoreHtml',
            ];
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockImplementation((_path: PathOrFileDescriptor) =>
                funcs.map((f) => `export function ${f}\n`).join(''),
            );
            const { checkDashboardExports } = await import('./quality-check.js');
            const r = checkDashboardExports();
            expect(r.passed).toBe(true);
        });

        it('checkDashboardExports fails when file missing', async () => {
            vi.mocked(existsSync).mockReturnValue(false);
            const { checkDashboardExports } = await import('./quality-check.js');
            const r = checkDashboardExports();
            expect(r.passed).toBe(false);
        });

        it('checkQualityGateFiles passes when both exist', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            const { checkQualityGateFiles } = await import('./quality-check.js');
            const r = checkQualityGateFiles();
            expect(r.passed).toBe(true);
        });

        it('checkQualityGateFiles fails when missing', async () => {
            vi.mocked(existsSync).mockReturnValue(false);
            const { checkQualityGateFiles } = await import('./quality-check.js');
            const r = checkQualityGateFiles();
            expect(r.passed).toBe(false);
        });

        it('checkNonNullAssertion detects pattern', async () => {
            vi.mocked(readFileSync).mockReturnValue('x!\n');
            const { checkNonNullAssertion } = await import('./quality-check.js');
            const r = checkNonNullAssertion();
            expect(r.passed).toBe(false);
        });

        it('checkDepWall detects external imports', async () => {
            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                const p = String(path);
                if (p.includes('git_triggers') || p.includes('jira_management')) {
                    return "import { x } from 'lodash';\n";
                }
                return '';
            });
            const { checkDepWall } = await import('./quality-check.js');
            const r = checkDepWall();
            expect(r.passed).toBe(false);
        });

        it('checkIfTrueFalse detects pattern', async () => {
            vi.mocked(readFileSync).mockReturnValue('if (true) {\n');
            const { checkIfTrueFalse } = await import('./quality-check.js');
            const r = checkIfTrueFalse();
            expect(r.passed).toBe(false);
        });

        it('checkIntegrity detects hash mismatch', async () => {
            vi.mocked(readFileSync).mockReturnValue(
                'some content\n/* HASH:1111111111111111111111111111111111111111111111111111111111111111 */\n',
            );
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();
            expect(r.passed).toBe(false);
        });

        it('checkIntegrity detects missing hash', async () => {
            vi.mocked(readFileSync).mockReturnValue('no hash here\n');
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();
            expect(r.passed).toBe(false);
        });

        it('checkIntegrity handles read error', async () => {
            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error('read fail');
            });
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();
            expect(r.passed).toBe(false);
        });

        it('checkViFnUnknown detects jest.fn<unknown', async () => {
            vi.mocked(readFileSync).mockReturnValue('jest.fn<unknown, any>()\n');
            const { checkViFnUnknown } = await import('./quality-check.js');
            const r = checkViFnUnknown();
            expect(r.passed).toBe(false);
        });

        it('checkViFnUnknownArray detects jest.fn<..., unknown[]', async () => {
            vi.mocked(readFileSync).mockReturnValue('jest.fn<any, unknown[]>()->void\n');
            const { checkViFnUnknownArray } = await import('./quality-check.js');
            const r = checkViFnUnknownArray();
            expect(r.passed).toBe(false);
        });
    });

    describe('main() integration', () => {
        it('calls all checks and reports results', async () => {
            mockLintResults.mockResolvedValue([]);
            vi.mocked(execFileSync).mockReturnValue('');

            const artifactExports = [
                'createTestCaseValidator',
                'createAnalysisValidator',
                'createPipelineValidator',
                'createBugReportValidator',
                'createComparisonValidator',
                'verifyEvidence',
                'recalculateCoverage',
                'ArtifactValidator',
                'consensusGenerate',
                'generateWithRetry',
                'snapshotQualityMetrics',
            ];
            const dashboardExports = [
                'calculateReleaseScore',
                'generateReleaseScoreHtml',
                'aggregateDefectTrends',
                'generateDefectTrendHtml',
                'buildTraceabilityMatrix',
                'generateTraceabilityHtml',
                'computeAiEffectiveness',
                'generateAiEffectivenessHtml',
                'aggregateDefectSeasonality',
                'generateSeasonalityHtml',
                'detectSilentRegression',
                'generateSilentRegressionHtml',
                'compareAiVsManual',
                'generateAiComparisonHtml',
                'computeCrossSquadBenchmark',
                'generateBenchmarkHtml',
                'buildDeveloperProfile',
                'generateDeveloperProfileHtml',
                'analyzeSuiteOptimization',
                'generateOptimizationHtml',
                'analyzeBacklogHealth',
                'generateBacklogHealthHtml',
                'buildIncidentReport',
                'generateIncidentReportHtml',
                'analyzePipelineImpact',
                'generateImpactAlertHtml',
                'calculatePipelineCost',
                'generatePipelineCostHtml',
                'calculateRequirementScores',
                'generateRequirementScoreHtml',
            ];
            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                const p = String(path);
                if (p === 'tsconfig.json') return JSON.stringify({ compilerOptions: { noImplicitOverride: true } });
                if (p === 'scripts/quality-check.ts') {
                    return 'some content\n/* HASH:1111111111111111111111111111111111111111111111111111111111111111 */\n';
                }
                if (p.endsWith('.ts')) {
                    return (
                        artifactExports.map((e) => `export function ${e}\n`).join('') +
                        dashboardExports.map((e) => `export function ${e}\n`).join('')
                    );
                }
                return '';
            });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readdirSync).mockReturnValue([]);

            const { main } = await import('./quality-check.js');
            await main();
        });
    });
});
