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
