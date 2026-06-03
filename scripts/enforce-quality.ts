/**
 * Quality enforcement script — CI gate that prevents reintroduction of
 * eliminated patterns (casts, non-null assertions, etc.).
 *
 * Usage: npx ts-node scripts/enforce-quality.ts
 * Exit code 0 if all checks pass, 1 + details if any fail.
 *
 * Each check is independently runnable and reports per-file violations.
 * Add new checks by adding entries to the `checks` array.
 */

import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';

interface CheckResult {
    name: string;
    passed: boolean;
    violations: Array<{ file: string; line: number; content: string }>;
}

// ---------- helpers ----------

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

function checkNoPattern(name: string, pattern: RegExp, files: string[], excludePattern?: RegExp): CheckResult {
    const violations: CheckResult['violations'] = [];
    for (const file of files) {
        if (excludePattern && excludePattern.test(file)) continue;
        const matches = grepLines(file, pattern);
        violations.push(...matches.map((m) => ({ file, ...m })));
    }
    return { name, passed: violations.length === 0, violations };
}

// ---------- checks ----------

const checks: CheckResult[] = [];

// 1. No throw 'string' in .ts files
checks.push(
    checkNoPattern(
        "throw 'string' (use throw new Error)",
        /throw\s+'/,
        allTsFiles().filter((f) => !f.startsWith('scripts/')),
    ),
);

// 2. No .only() in test files
checks.push(
    checkNoPattern(
        '.only() in test files',
        /\.only\(/,
        allTsFiles().filter((f) => f.endsWith('.test.ts')),
    ),
);

// 3. No as unknown as in test files
checks.push(
    checkNoPattern(
        'as unknown as in test files',
        /as\s+unknown\s+as/,
        allTsFiles().filter((f) => f.endsWith('.test.ts')),
    ),
);

// 4. No as any in test files (excluding eslint directives)
checks.push(
    checkNoPattern(
        'as any in test files (excluding eslint disables)',
        /as\s+any\b/,
        allTsFiles().filter((f) => f.endsWith('.test.ts')),
        /eslint-disable/,
    ),
);

// 5. No throw "string" in .ts files
checks.push(
    checkNoPattern(
        'throw "string" (use throw new Error)',
        /throw\s+"/,
        allTsFiles().filter((f) => !f.startsWith('scripts/')),
    ),
);

// 6. Check that noImplicitOverride is active in tsconfig
const tsconfigPath = 'tsconfig.json';
let noImplicitOverrideActive = false;
if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    noImplicitOverrideActive = tsconfig.compilerOptions?.noImplicitOverride === true;
}
checks.push({
    name: 'noImplicitOverride active in tsconfig',
    passed: noImplicitOverrideActive,
    violations: noImplicitOverrideActive
        ? []
        : [{ file: tsconfigPath, line: 1, content: 'noImplicitOverride must be true in compilerOptions' }],
});

// 7. No jest.fn<unknown, ...> in test files (first type arg is literally unknown)
checks.push(
    checkNoPattern(
        'jest.fn<unknown, ...> in test files',
        /jest\.fn<\s*unknown\s*[,>]/,
        allTsFiles().filter((f) => f.endsWith('.test.ts')),
    ),
);

// 8. No jest.fn<..., unknown[]> in test files (second type arg is literally unknown[])
checks.push(
    checkNoPattern(
        'jest.fn<..., unknown[]> in test files',
        /jest\.fn<[^)]*,\s*unknown\s*\[/,
        allTsFiles().filter((f) => f.endsWith('.test.ts')),
    ),
);

// 10. All artifact validators exist and export create* functions
// This check ensures the artifact validation framework is intact
checks.push(
    (() => {
        const violations: CheckResult['violations'] = [];
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
                violations.push({
                    file: req.file,
                    line: 1,
                    content: `MISSING FILE: ${req.file} is required for artifact validation framework`,
                });
                continue;
            }
            const content = readFileSync(req.file, 'utf-8');
            if (
                !content.includes('export ' + req.export) &&
                !content.includes('export function ' + req.export) &&
                !content.includes('export class ' + req.export) &&
                !content.includes('export async function ' + req.export)
            ) {
                violations.push({
                    file: req.file,
                    line: 1,
                    content: `Missing export: ${req.export} not found in ${req.file}`,
                });
            }
        }
        return { name: 'artifact validation framework exports intact', passed: violations.length === 0, violations };
    })(),
);

// 11. No LLM artifact type without a corresponding validator
checks.push(
    (() => {
        const violations: CheckResult['violations'] = [];
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
    })(),
);

// 12. All dashboard modules exist and export required functions (Sprint 10 + Sprint 11 + Sprint 12)
checks.push(
    (() => {
        const violations: CheckResult['violations'] = [];
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
    })(),
);

// 13. Quality gate module exists
checks.push(
    (() => {
        const violations: CheckResult['violations'] = [];
        const files = ['shared/quality-gate.ts', 'scripts/quality-gate.ts'];
        for (const f of files) {
            if (!existsSync(f)) {
                violations.push({ file: f, line: 1, content: `MISSING FILE: ${f}` });
            }
        }
        return { name: 'quality gate module files exist', passed: violations.length === 0, violations };
    })(),
);

// 9. No non-null assertions (!) in .ts files (postfix operator, not negation)
// Known false-positive exclusions: markdown/image syntax, GraphQL schemas,
// uppercase string content like 'ATRASADA!', comment text like 'NO!'.
checks.push(
    checkNoPattern(
        'non-null assertion (!) in .ts files',
        /(?:\)|\]|\w+)\s*!\s*(?:\.|\[|;|,|\)|$|(?:\s+as\b))/,
        allTsFiles().filter((f) => !f.startsWith('scripts/')),
        /markdown\.ts$|markdown-lexer\.ts$|xray-history\.ts$|xray-client\.ts$|case02\.ts$|pipeline-handler\.test\.ts$/,
    ),
);

// 14. Auto-integridade — every commit must update the integrity hash
// Hash is computed on file content EXCLUDING the HASH line itself.
checks.push(
    (() => {
        const violations: CheckResult['violations'] = [];
        const selfContent = readFileSync('scripts/enforce-quality.ts', 'utf-8');
        const contentWithoutHash = selfContent.replace(/\/\* HASH:[0-9a-f]{64} \*\//, '');
        const currentHash = require('crypto').createHash('sha256').update(contentWithoutHash, 'utf-8').digest('hex');
        /* HASH:a9e8bfc14063901adb9b97f85beebf3a56c48b1e64eeeb15e5b573ff77f2869f */
        const match = selfContent.match(/\/\* HASH:([0-9a-f]{64}) \*\//);
        if (!match) {
            violations.push({
                file: 'scripts/enforce-quality.ts',
                line: 1,
                content: 'Missing HASH comment in enforce-quality.ts',
            });
        } else if (match[1] !== currentHash) {
            violations.push({
                file: 'scripts/enforce-quality.ts',
                line: 1,
                content: `Hash mismatch: expected ${match[1]}, got ${currentHash}. Regenerate HASH after intentional changes.`,
            });
        }
        return { name: 'enforce-quality auto-integrity', passed: violations.length === 0, violations };
    })(),
);

// 15. Checks count must match expected minimum (guards against accidental removal)
// +1: this check hasn't been pushed yet, so checks.length excludes it
checks.push({
    name: `enforce-quality has at least 15 checks`,
    passed: checks.length + 1 >= 15,
    violations:
        checks.length + 1 >= 15
            ? []
            : [
                  {
                      file: 'scripts/enforce-quality.ts',
                      line: 1,
                      content: `Expected >= 15 checks, found ${checks.length + 1}`,
                  },
              ],
});

// ---------- output ----------

let allPassed = true;
for (const check of checks) {
    if (check.passed) {
        console.log(`  ✅ ${check.name}`);
    } else {
        allPassed = false;
        console.log(`  ❌ ${check.name} — ${check.violations.length} violation(s)`);
        for (const v of check.violations.slice(0, 10)) {
            console.log(`       ${v.file}:${v.line}  ${v.content.slice(0, 100)}`);
        }
        if (check.violations.length > 10) {
            console.log(`       ... and ${check.violations.length - 10} more`);
        }
    }
}

console.log('');
if (allPassed) {
    console.log('✅ All quality checks passed.');
    process.exit(0);
} else {
    console.log('❌ Some quality checks failed. Fix violations before committing.');
    process.exit(1);
}
