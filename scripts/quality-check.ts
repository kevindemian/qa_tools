#!/usr/bin/env tsx
/**
 * quality-check.ts — Consolidated quality gate
 *
 * Replaces: eslint CLI + check-unused-exports.sh + check-handlers + enforce-quality.ts
 * Single process, single AST parse, single heap. Try/catch everywhere.
 *
 * ## Exit codes
 * - 0: todas as verificações passam
 * - 1: alguma verificação falhou
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { isBuiltin } from 'module';
import { globSync } from '../shared/deps.js';
import { gracefulExit } from '../shared/cli_base.js';
import { ExitCode } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
    file: string;
    line: number;
    content: string;
}

interface CheckResult {
    name: string;
    passed: boolean;
    violations: Violation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function grepLines(file: string, pattern: RegExp): Array<{ line: number; content: string }> {
    const results: Array<{ line: number; content: string }> = [];
    try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (pattern.test(line)) {
                results.push({ line: i + 1, content: line.trim() });
            }
        });
    } catch {
        // skip unreadable
    }
    return results;
}

function allTsFiles(): string[] {
    return globSync('**/*.ts', { ignore: ['node_modules/**'] });
}

export function checkNoPattern(name: string, pattern: RegExp, files: string[], excludePattern?: RegExp): CheckResult {
    const violations: Violation[] = [];
    for (const file of files) {
        const matches = grepLines(file, pattern);
        for (const m of matches) {
            if (excludePattern && excludePattern.test(m.content)) continue;
            violations.push({ file, ...m });
        }
    }
    return { name, passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export async function checkEslintBaseline(): Promise<CheckResult> {
    const violations: Violation[] = [];
    try {
        const { ESLint } = await import('eslint');

        const eslint = new ESLint({
            overrideConfigFile: 'eslint.config.mjs',
            fix: false,
            cache: false,
        });

        const results = await eslint.lintFiles(['.']);

        for (const result of results) {
            const file = result.filePath;
            for (const msg of result.messages) {
                if (msg.severity >= 1) {
                    violations.push({
                        file,
                        line: msg.line,
                        content: `${msg.message} (${msg.ruleId})`,
                    });
                }
            }
        }

        if (violations.length > 0) {
            return { name: 'eslint (zero violations)', passed: false, violations };
        }

        return { name: 'eslint (zero violations)', passed: true, violations };
    } catch (err) {
        violations.push({
            file: 'scripts/quality-check.ts',
            line: 1,
            content: `ESLint check failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        return { name: 'eslint (zero violations)', passed: false, violations };
    }
}

export function checkHandlerConsistency(): CheckResult {
    const violations: Violation[] = [];
    try {
        const menuSource = readFileSync('jira_management/menu-data.ts', 'utf-8');
        const indexSource = readFileSync('jira_management/commands/index.ts', 'utf-8');

        const registered = new Set<string>();
        for (const m of indexSource.matchAll(/'(\d+|d)'\s*:\s*\{/g)) {
            registered.add(m[1] ?? '');
        }
        for (const m of indexSource.matchAll(/(?:\b)(d)\s*:\s*\{/g)) {
            registered.add(m[1] ?? '');
        }

        const menuIds = new Set<string>();
        for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'/g)) {
            menuIds.add(m[1] ?? '');
        }

        const aliasTargets = new Set<string>();
        for (const m of menuSource.matchAll(/['"]([\w-]+)['"]:\s*['"]([\w\d/]+)['"]/g)) {
            if (m[2]) aliasTargets.add(m[2]);
        }

        const categoryIds = new Set<string>();
        for (const m of menuSource.matchAll(/['"](reports|tests|bugreport|analytics|releases|config)['"]/g)) {
            categoryIds.add(m[1] ?? '');
        }

        const allowedExceptions = new Set(['0', 'docs', '/menu', '/help']);

        for (const id of registered) {
            if (!menuIds.has(id) && !aliasTargets.has(id) && !categoryIds.has(id) && !allowedExceptions.has(id)) {
                violations.push({
                    file: 'jira_management/commands/index.ts',
                    line: 1,
                    content: `Handler '${id}' registered but has no SUB_MENUS entry or ALIAS`,
                });
            }
        }

        for (const id of menuIds) {
            if (id === '0') continue;
            if (!registered.has(id)) {
                violations.push({
                    file: 'jira_management/menu-data.ts',
                    line: 1,
                    content: `SUB_MENUS entry '${id}' has no registered handler`,
                });
            }
        }

        /* Files → handlers */
        const caseFiles = readdirSync('jira_management/commands')
            .filter((f) => /^case\d{2}\.ts$/.test(f))
            .sort();

        for (const f of caseFiles) {
            const id = f.replace('case', '').replace('.ts', '').replace(/^0/, '');
            if (!indexSource.includes(`'${id}':`)) {
                violations.push({
                    file: `jira_management/commands/${f}`,
                    line: 1,
                    content: `Handler file exists but is not registered in commands/index.ts`,
                });
            }
        }

        return { name: '3-way handler ↔ menu ↔ alias consistency', passed: violations.length === 0, violations };
    } catch (err) {
        violations.push({
            file: 'scripts/quality-check.ts',
            line: 1,
            content: `Handler check failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        return { name: '3-way handler ↔ menu ↔ alias consistency', passed: false, violations };
    }
}

// ---------------------------------------------------------------------------
// Enforce-quality checks (1-18)
// ---------------------------------------------------------------------------

export function checkThrowString(): CheckResult {
    const files = allTsFiles().filter((f) => !f.startsWith('scripts/'));
    return checkNoPattern("throw 'string' (use throw new Error)", /throw\s+'/, files);
}

export function checkOnlyInTests(): CheckResult {
    return checkNoPattern(
        'exclusive test in test files',
        /\.only\(/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

/**
 * Checks for `as unknown as` casts in test files.
 *
 * Excludes lines with a `// structural:` comment documenting WHY the cast
 * is necessary (e.g., TypeScript classes with private fields are nominally
 * typed — no object literal can satisfy them without the cast).
 *
 * This makes the rule more sophisticated: a documented structural cast is
 * accepted, but undocumented `as unknown as` is still flagged. The developer
 * MUST explain why the cast is structurally necessary.
 */
export function checkAsUnknownAs(): CheckResult {
    return checkNoPattern(
        'as unknown as in test files',
        /as\s+unknown\s+as/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
        /\/\/\s*structural:/,
    );
}

export function checkAsAny(): CheckResult {
    return checkNoPattern(
        'as-any cast in test files',
        /as\s+any\b/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

export function checkThrowDoubleQuote(): CheckResult {
    const files = allTsFiles().filter((f) => !f.startsWith('scripts/'));
    return checkNoPattern('throw "string" (use throw new Error)', /throw\s+"/, files);
}

export function checkNoImplicitOverride(): CheckResult {
    const violations: Violation[] = [];
    try {
        const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8')) as {
            compilerOptions?: { noImplicitOverride?: boolean };
        };
        if (tsconfig.compilerOptions?.noImplicitOverride !== true) {
            violations.push({
                file: 'tsconfig.json',
                line: 1,
                content: 'noImplicitOverride must be true in compilerOptions',
            });
        }
    } catch {
        violations.push({ file: 'tsconfig.json', line: 1, content: 'Could not parse tsconfig.json' });
    }
    return { name: 'noImplicitOverride active in tsconfig', passed: violations.length === 0, violations };
}

export function checkViFnUnknown(): CheckResult {
    return checkNoPattern(
        'vi.fn<(...args: ...) => unknown> in test files',
        /jest\.fn<\s*unknown\s*[,>]/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

export function checkViFnUnknownArray(): CheckResult {
    return checkNoPattern(
        'vi.fn<(...args: unknown[]) => ...> in test files',
        /jest\.fn<[^)]*,\s*unknown\s*\[/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

export function checkArtifactValidators(): CheckResult {
    const violations: Violation[] = [];
    const requiredExports: Array<{ file: string; export: string }> = [
        { file: 'shared/test-case-validator.ts', export: 'createTestCaseValidator' },
        { file: 'shared/analysis-validator.ts', export: 'createAnalysisValidator' },
        { file: 'shared/pipeline-validator.ts', export: 'createPipelineValidator' },
        { file: 'shared/bug-report-validator.ts', export: 'createBugReportValidator' },
        { file: 'shared/comparison-validator.ts', export: 'createComparisonValidator' },
        { file: 'shared/evidence-validator.ts', export: 'verifyEvidence' },
        { file: 'shared/coverage-verifier.ts', export: 'recalculateCoverage' },
        { file: 'shared/artifact-validator.ts', export: 'ArtifactValidator' },
        { file: 'shared/llm-self-consistency.ts', export: 'consensusGenerate' },
        { file: 'shared/targeted-retry.ts', export: 'generateWithRetry' },
        { file: 'shared/quality-metrics.ts', export: 'snapshotQualityMetrics' },
    ];
    for (const req of requiredExports) {
        if (!existsSync(req.file)) {
            violations.push({ file: req.file, line: 1, content: `MISSING FILE: ${req.file}` });
            continue;
        }
        const content = readFileSync(req.file, 'utf-8');
        const reexportPattern = new RegExp(`export\\s*\\{[^}]*\\b${req.export}\\b`);
        if (
            !content.includes('export ' + req.export) &&
            !content.includes('export function ' + req.export) &&
            !content.includes('export class ' + req.export) &&
            !content.includes('export async function ' + req.export) &&
            !reexportPattern.test(content)
        ) {
            violations.push({ file: req.file, line: 1, content: `Missing export: ${req.export}` });
        }
    }
    return { name: 'artifact validation framework exports intact', passed: violations.length === 0, violations };
}

export function checkArtifactValidatorsExist(): CheckResult {
    const violations: Violation[] = [];
    const validators = [
        'shared/test-case-validator.ts',
        'shared/analysis-validator.ts',
        'shared/pipeline-validator.ts',
        'shared/bug-report-validator.ts',
        'shared/comparison-validator.ts',
    ];
    for (const vf of validators) {
        if (!existsSync(vf)) {
            violations.push({ file: vf, line: 1, content: `Missing validator: ${vf}` });
        }
    }
    return { name: 'all artifact types have validators', passed: violations.length === 0, violations };
}

export function checkDashboardExports(): CheckResult {
    const violations: Violation[] = [];
    const dashboards: Array<{ file: string; export_: string }> = [
        { file: 'shared/release-score.ts', export_: 'calculateReleaseScore' },
        { file: 'shared/release-score.ts', export_: 'generateReleaseScoreHtml' },
        { file: 'shared/defect-trend.ts', export_: 'aggregateDefectTrends' },
        { file: 'shared/defect-trend.ts', export_: 'generateDefectTrendHtml' },
        { file: 'shared/traceability-matrix.ts', export_: 'buildTraceabilityMatrix' },
        { file: 'shared/traceability-matrix.ts', export_: 'generateTraceabilityHtml' },
        { file: 'shared/ai-effectiveness.ts', export_: 'computeAiEffectiveness' },
        { file: 'shared/ai-effectiveness.ts', export_: 'generateAiEffectivenessHtml' },
        { file: 'shared/defect-seasonality.ts', export_: 'aggregateDefectSeasonality' },
        { file: 'shared/defect-seasonality.ts', export_: 'generateSeasonalityHtml' },
        { file: 'shared/silent-regression.ts', export_: 'detectSilentRegression' },
        { file: 'shared/silent-regression.ts', export_: 'generateSilentRegressionHtml' },
        { file: 'shared/ai-comparison.ts', export_: 'compareAiVsManual' },
        { file: 'shared/ai-comparison.ts', export_: 'generateAiComparisonHtml' },
        { file: 'shared/cross-squad-benchmark.ts', export_: 'computeCrossSquadBenchmark' },
        { file: 'shared/cross-squad-benchmark.ts', export_: 'generateBenchmarkHtml' },
        { file: 'shared/developer-profile.ts', export_: 'buildDeveloperProfile' },
        { file: 'shared/developer-profile.ts', export_: 'generateDeveloperProfileHtml' },
        { file: 'shared/suite-optimization.ts', export_: 'analyzeSuiteOptimization' },
        { file: 'shared/suite-optimization.ts', export_: 'generateOptimizationHtml' },
        { file: 'shared/backlog-health.ts', export_: 'analyzeBacklogHealth' },
        { file: 'shared/backlog-health.ts', export_: 'generateBacklogHealthHtml' },
        { file: 'shared/incident-report.ts', export_: 'buildIncidentReport' },
        { file: 'shared/incident-report.ts', export_: 'generateIncidentReportHtml' },
        { file: 'shared/impact-alert.ts', export_: 'analyzePipelineImpact' },
        { file: 'shared/impact-alert.ts', export_: 'generateImpactAlertHtml' },
        { file: 'shared/pipeline-cost.ts', export_: 'calculatePipelineCost' },
        { file: 'shared/pipeline-cost.ts', export_: 'generatePipelineCostHtml' },
        { file: 'shared/requirement-score.ts', export_: 'calculateRequirementScores' },
        { file: 'shared/requirement-score.ts', export_: 'generateRequirementScoreHtml' },
    ];
    for (const d of dashboards) {
        if (!existsSync(d.file)) {
            violations.push({ file: d.file, line: 1, content: `MISSING FILE: ${d.file}` });
            continue;
        }
        const content = readFileSync(d.file, 'utf-8');
        if (!content.includes('export function ' + d.export_)) {
            violations.push({ file: d.file, line: 1, content: `Missing export: ${d.export_} not found` });
        }
    }
    return { name: 'all dashboard modules have required exports', passed: violations.length === 0, violations };
}

export function checkQualityGateFiles(): CheckResult {
    const violations: Violation[] = [];
    const files = ['shared/quality-gate.ts', 'scripts/quality-gate.ts'];
    for (const f of files) {
        if (!existsSync(f)) {
            violations.push({ file: f, line: 1, content: `MISSING FILE: ${f}` });
        }
    }
    return { name: 'quality gate module files exist', passed: violations.length === 0, violations };
}

// markdown.ts/markdown-lexer.ts: `!` is markdown image syntax, not non-null assertion
// xray-history.ts/xray-client.ts: GraphQL return types have known non-null fields
// case02.ts: structured test assertions
// pipeline-handler.test.ts: test assertions
export function checkNonNullAssertion(): CheckResult {
    const files = allTsFiles()
        .filter((f) => !f.startsWith('scripts/'))
        .filter(
            (f) =>
                !/markdown\.ts$|markdown-lexer\.ts$|xray-history\.ts$|xray-client\.ts$|case02\.ts$|pipeline-handler\.test\.ts$/.test(
                    f,
                ),
        );
    return checkNoPattern(
        'non-null assertion (!) in .ts files',
        /(?:\)|\]|\w+)\s*!\s*(?:\.|\[|;|,|\)|$|(?:\s+as\b))/,
        files,
    );
}

export function checkDepWall(): CheckResult {
    const violations: Violation[] = [];
    const dirs = ['git_triggers', 'jira_management'];
    const extPkgImport = /from\s+['"](?!\.)(?!\/)(?!node:)([a-z@][^'"]*)/;
    const requirePkg = /require\s*\(\s*['"]([a-z@][^'"]*)['"]\s*\)/;
    for (const dir of dirs) {
        const files = globSync(`${dir}/**/*.ts`, { ignore: ['node_modules/**'] });
        for (const file of files) {
            for (const { line, content } of grepLines(file, extPkgImport)) {
                const m = content.match(extPkgImport);
                const pkg = m?.[1];
                if (pkg && pkg !== 'vitest' && !isBuiltin(pkg)) {
                    violations.push({
                        file,
                        line,
                        content: `Direct external import '${pkg}' — must go through shared/deps.ts (DepWal)`,
                    });
                }
            }
            for (const { line, content } of grepLines(file, requirePkg)) {
                const m = content.match(requirePkg);
                const pkg = m?.[1];
                if (pkg && pkg !== 'vitest' && !isBuiltin(pkg)) {
                    violations.push({
                        file,
                        line,
                        content: `Direct external import '${pkg}' — must go through shared/deps.ts (DepWal)`,
                    });
                }
            }
        }
    }
    return {
        name: 'DepWall: direct external imports forbidden outside shared/',
        passed: violations.length === 0,
        violations,
    };
}

export function checkIfTrueFalse(): CheckResult {
    return checkNoPattern(
        'if(true)/if(false) condition replacement (auto-fix guard)',
        /if\s*\(\s*(?:true|false)\s*\)\s*(?:\{|return|break|continue|throw|;)/,
        allTsFiles().filter((f) => f !== 'scripts/quality-check.test.ts'),
    );
}

// ---------------------------------------------------------------------------
// Auto-integrity
// ---------------------------------------------------------------------------

export function checkIntegrity(): CheckResult {
    const violations: Violation[] = [];
    try {
        const selfContent = readFileSync('scripts/quality-check.ts', 'utf-8');
        const contentWithoutHash = selfContent.replace(/\/\* HASH:[0-9a-f]{64} \*\//g, '');
        const currentHash = createHash('sha256').update(contentWithoutHash, 'utf-8').digest('hex');
        /* HASH:a253cbb11190ce72d83559d63cd8475bb3d050ff2a7f8100d3848baf4f4f4c9e */
        const match = selfContent.match(/\/\* HASH:([0-9a-f]{64}) \*\//);
        if (!match) {
            violations.push({ file: 'scripts/quality-check.ts', line: 1, content: 'Missing HASH comment' });
        } else if (match[1] !== currentHash) {
            violations.push({
                file: 'scripts/quality-check.ts',
                line: 1,
                content: `Hash mismatch. Regenerate after intentional changes.`,
            });
        }
    } catch (err) {
        violations.push({
            file: 'scripts/quality-check.ts',
            line: 1,
            content: `Integrity check failed: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
    return { name: 'quality-check auto-integrity', passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
    const checks: CheckResult[] = [];

    checks.push(await checkEslintBaseline());
    checks.push(checkHandlerConsistency());

    /* enforce-quality checks */
    checks.push(checkThrowString());
    checks.push(checkOnlyInTests());
    checks.push(checkAsUnknownAs());
    checks.push(checkAsAny());
    checks.push(checkThrowDoubleQuote());
    checks.push(checkNoImplicitOverride());
    checks.push(checkViFnUnknown());
    checks.push(checkViFnUnknownArray());
    checks.push(checkArtifactValidators());
    checks.push(checkArtifactValidatorsExist());
    checks.push(checkDashboardExports());
    checks.push(checkQualityGateFiles());
    checks.push(checkNonNullAssertion());
    checks.push(checkDepWall());
    checks.push(checkIfTrueFalse());
    checks.push(checkIntegrity());

    /* Guard: check count */
    const minChecks = 17;
    if (checks.length < minChecks) {
        checks.push({
            name: `quality-check has at least ${minChecks} checks`,
            passed: false,
            violations: [
                {
                    file: 'scripts/quality-check.ts',
                    line: 1,
                    content: `Expected >= ${minChecks} checks, found ${checks.length}`,
                },
            ],
        });
    }

    /* Report */
    let allPassed = true;
    for (const check of checks) {
        if (check.passed) {
            process.stdout.write(`  ✅ ${check.name}\n`);
        } else {
            allPassed = false;
            process.stdout.write(`  ❌ ${check.name} — ${check.violations.length} violation(s)\n`);
            for (const v of check.violations.slice(0, 10)) {
                process.stdout.write(`       ${v.file}:${v.line}  ${v.content.slice(0, 100)}\n`);
            }
            if (check.violations.length > 10) {
                process.stdout.write(`       ... and ${check.violations.length - 10} more\n`);
            }
        }
    }

    process.stdout.write('\n');
    if (allPassed) {
        process.stdout.write('✅ All quality checks passed.\n');
        gracefulExit(ExitCode.OK);
    } else {
        process.stdout.write('❌ Some quality checks failed. Fix violations before committing.\n');
        gracefulExit(ExitCode.ERROR);
    }
}

main().catch((err: unknown) => {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    gracefulExit(ExitCode.ERROR);
});
