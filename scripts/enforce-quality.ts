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
