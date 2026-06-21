import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, type PathOrFileDescriptor } from 'fs';

vi.mock('fs', async () => {
    const actual: typeof import('fs') = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        readFileSync: vi.fn(),
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
    };
});

vi.mock('../shared/deps.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../shared/deps.js')>();
    return {
        ...actual,
        globSync: vi.fn((_p: string) => [
            'test.ts',
            'test.test.ts',
            'jira_management/commands/case01.ts',
            'jira_management/commands/case02.ts',
        ]),
    };
});

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

const ASU_PREFIX = '\u0061s unknown as';

describe('Quality-check unit tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('CheckNoPattern', () => {
        it('returns passed when no pattern matches', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('ok line\n');
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts']);

            expect(result.passed).toBeTruthy();
        });

        it('returns violations when pattern matches', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('xyz found here\n');
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts']);

            expect(result.passed).toBeFalsy();
            expect(result.violations).toHaveLength(1);
        });

        it('skips files matching excludePattern', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                if (path === 'skip.ts') return 'xyz found with skip pattern\n';
                return 'no match here\n';
            });
            const { checkNoPattern } = await import('./quality-check.js');
            const result = checkNoPattern('test', /xyz/, ['test.ts', 'skip.ts'], /skip/);

            expect(result.passed).toBeTruthy();
        });
    });

    describe('CheckEslintBaseline', () => {
        it('passes when no eslint violations', async () => {
            expect.hasAssertions();

            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: [],
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();

            expect(r.passed).toBeTruthy();
        });

        it('fails on any eslint violation', async () => {
            expect.hasAssertions();

            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: [{ ruleId: 'no-console', severity: 2, message: 'x', line: 1 }],
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();

            expect(r.passed).toBeFalsy();
            expect(r.violations).toHaveLength(1);
        });

        it('fails on unbound-method violations (no baseline)', async () => {
            expect.hasAssertions();

            mockLintResults.mockResolvedValue([
                {
                    filePath: 't.ts',
                    messages: Array.from({ length: 3 }, () => ({
                        ruleId: '@typescript-eslint/unbound-method',
                        severity: 2,
                        message: 'x',
                        line: 1,
                    })),
                },
            ]);
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();

            expect(r.passed).toBeFalsy();
            expect(r.violations).toHaveLength(3);
        });

        it('handles lintFiles error', async () => {
            expect.hasAssertions();

            mockLintResults.mockRejectedValue(new Error('lint failed'));
            const { checkEslintBaseline } = await import('./quality-check.js');
            const r = await checkEslintBaseline();

            expect(r.passed).toBeFalsy();
        });
    });

    describe('CheckHandlerConsistency', () => {
        it('detects handler registered but no menu entry', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                if (path === 'jira_management/menu-data.ts') return "id: '1'\n";
                if (path === 'jira_management/commands/index.ts') return "'99': {\n";
                return '';
            });
            vi.mocked(readdirSync).mockReturnValue([]);
            const { checkHandlerConsistency } = await import('./quality-check.js');
            const r = checkHandlerConsistency();

            expect(r.passed).toBeFalsy();
        });

        it('handles read error', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error('read fail');
            });
            const { checkHandlerConsistency } = await import('./quality-check.js');
            const r = checkHandlerConsistency();

            expect(r.passed).toBeFalsy();
        });
    });

    describe('Enforce-quality checks', () => {
        it('checkThrowString detects throw literals', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue("throw 'error'\n");
            const { checkThrowString } = await import('./quality-check.js');
            const r = checkThrowString();

            expect(r.passed).toBeFalsy();
        });

        it('checkOnlyInTests flags exclusive tests', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('content without pattern\n');
            const { checkOnlyInTests } = await import('./quality-check.js');
            const r = checkOnlyInTests();

            expect(r.name).toBe('exclusive test in test files');
            expect('passed' in r).toBeTruthy();
            expect(Array.isArray(r.violations)).toBeTruthy();
        });

        it('checkAsUnknownAs has correct structure', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('clean content\n');
            const { checkAsUnknownAs } = await import('./quality-check.js');
            const r = checkAsUnknownAs();

            expect(r.name).toContain(ASU_PREFIX);
            expect('passed' in r).toBeTruthy();
        });

        it('checkAsUnknownAs detects undocumented cast', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue(`const x = foo() ${ASU_PREFIX} Bar;\n`);
            const { checkAsUnknownAs } = await import('./quality-check.js');
            const r = checkAsUnknownAs();

            expect(r.passed).toBeFalsy();
            expect(r.violations).toHaveLength(1);
            expect(r.violations[0]?.content).toContain(ASU_PREFIX);
        });

        it('checkAsUnknownAs excludes documented structural cast', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue(
                `const x = foo() ${ASU_PREFIX} Bar; // structural: Bar has private fields\n`,
            );
            const { checkAsUnknownAs } = await import('./quality-check.js');
            const r = checkAsUnknownAs();

            expect(r.passed).toBeTruthy();
            expect(r.violations).toHaveLength(0);
        });

        it('checkAsAny has correct structure', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('clean content\n');
            const { checkAsAny } = await import('./quality-check.js');
            const r = checkAsAny();

            expect(r.name).toContain('as-any');
            expect('passed' in r).toBeTruthy();
        });

        it('checkThrowDoubleQuote detects throw "', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('throw "err"\n');
            const { checkThrowDoubleQuote } = await import('./quality-check.js');
            const r = checkThrowDoubleQuote();

            expect(r.passed).toBeFalsy();
        });

        it('checkNoImplicitOverride passes when true', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ compilerOptions: { noImplicitOverride: true } }));
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();

            expect(r.passed).toBeTruthy();
        });

        it('checkNoImplicitOverride fails when false', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ compilerOptions: { noImplicitOverride: false } }));
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();

            expect(r.passed).toBeFalsy();
        });

        it('checkNoImplicitOverride handles parse error', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('invalid json');
            const { checkNoImplicitOverride } = await import('./quality-check.js');
            const r = checkNoImplicitOverride();

            expect(r.passed).toBeFalsy();
        });

        it('checkArtifactValidators passes when all exports exist', async () => {
            expect.hasAssertions();

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

            expect(r.passed).toBeTruthy();
        });

        it('checkArtifactValidators fails when export missing', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export function foo\n');
            const { checkArtifactValidators } = await import('./quality-check.js');
            const r = checkArtifactValidators();

            expect(r.passed).toBeFalsy();
        });

        it('checkArtifactValidatorsExist fails when file missing', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(false);
            const { checkArtifactValidatorsExist } = await import('./quality-check.js');
            const r = checkArtifactValidatorsExist();

            expect(r.passed).toBeFalsy();
        });

        it('checkDashboardExports passes when all export functions exist', async () => {
            expect.hasAssertions();

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

            expect(r.passed).toBeTruthy();
        });

        it('checkDashboardExports fails when file missing', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(false);
            const { checkDashboardExports } = await import('./quality-check.js');
            const r = checkDashboardExports();

            expect(r.passed).toBeFalsy();
        });

        it('checkQualityGateFiles passes when both exist', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(true);
            const { checkQualityGateFiles } = await import('./quality-check.js');
            const r = checkQualityGateFiles();

            expect(r.passed).toBeTruthy();
        });

        it('checkQualityGateFiles fails when missing', async () => {
            expect.hasAssertions();

            vi.mocked(existsSync).mockReturnValue(false);
            const { checkQualityGateFiles } = await import('./quality-check.js');
            const r = checkQualityGateFiles();

            expect(r.passed).toBeFalsy();
        });

        it('checkNonNullAssertion detects pattern', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('x!\n');
            const { checkNonNullAssertion } = await import('./quality-check.js');
            const r = checkNonNullAssertion();

            expect(r.passed).toBeFalsy();
        });

        it('checkDepWall detects external imports', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) => {
                const p = String(path);
                if (p.includes('git_triggers') || p.includes('jira_management')) {
                    return "import { x } from 'lodash';\n";
                }
                return '';
            });
            const { checkDepWall } = await import('./quality-check.js');
            const r = checkDepWall();

            expect(r.passed).toBeFalsy();
        });

        it('checkIfTrueFalse detects pattern', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('if (true) {\n');
            const { checkIfTrueFalse } = await import('./quality-check.js');
            const r = checkIfTrueFalse();

            expect(r.passed).toBeFalsy();
        });

        it('checkIntegrity detects hash mismatch', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue(
                'some content\n/* HASH:1111111111111111111111111111111111111111111111111111111111111111 */\n',
            );
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();

            expect(r.passed).toBeFalsy();
        });

        it('checkIntegrity detects missing hash', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('no hash here\n');
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();

            expect(r.passed).toBeFalsy();
        });

        it('checkIntegrity handles read error', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error('read fail');
            });
            const { checkIntegrity } = await import('./quality-check.js');
            const r = checkIntegrity();

            expect(r.passed).toBeFalsy();
        });

        it('checkViFnUnknown detects jest.fn<unknown', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('jest.fn<unknown, any>()\n');
            const { checkViFnUnknown } = await import('./quality-check.js');
            const r = checkViFnUnknown();

            expect(r.passed).toBeFalsy();
        });

        it('checkViFnUnknownArray detects jest.fn<..., unknown[]', async () => {
            expect.hasAssertions();

            vi.mocked(readFileSync).mockReturnValue('jest.fn<any, unknown[]>()->void\n');
            const { checkViFnUnknownArray } = await import('./quality-check.js');
            const r = checkViFnUnknownArray();

            expect(r.passed).toBeFalsy();
        });
    });

    describe('Main() integration', () => {
        it('calls all checks and reports results', async () => {
            expect.hasAssertions();

            mockLintResults.mockResolvedValue([]);
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

            await expect(main()).resolves.toBeUndefined();
        });
    });
});
