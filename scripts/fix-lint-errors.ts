#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from '../shared/deps.js';

const counts = { valid: 0, strict: 0, files: 0 };

const allFiles = globSync('scripts/**/*.ts', {
    ignore: ['node_modules/**', 'scripts/fix-lint-errors.ts'],
});

const immutable = [
    'scripts/quality-check.test.ts',
    'scripts/quality-check.ts',
    'scripts/qa.test.ts',
    'scripts/rule-vigilant.ts',
    'scripts/validation-compositor.ts',
];

process.stdout.write('Files: ' + allFiles.length + '\n');

for (const f of allFiles) {
    if (immutable.includes(f)) {
        process.stderr.write('  SKIP (immutable): ' + f + '\n');
        continue;
    }
    const src = readFileSync(f, 'utf-8');
    const hasValidIssue = /describe\(\s*['"`][a-z]/.test(src);
    const hasStrictIssue = src.includes('toEqual(');

    if (!hasValidIssue && !hasStrictIssue) continue;

    let result = src;

    if (hasValidIssue) {
        const quoteRe = new RegExp('describe\\(\\s*([\'"`])([a-z])', 'g');
        result = result.replace(quoteRe, (_m: string, q: string, first: string) => {
            return 'describe(' + q + first.toUpperCase();
        });
        counts.valid++;
    }

    if (hasStrictIssue && f.endsWith('.test.ts')) {
        result = result.replace(/\btoEqual\(/g, 'toStrictEqual(');
        counts.strict++;
    }

    if (result !== src) {
        writeFileSync(f, result, 'utf-8');
        counts.files++;
        process.stderr.write('  fixed: ' + f + '\n');
    }
}

process.stderr.write(
    'Done. Files: ' +
        counts.files +
        ', valid-title: ' +
        counts.valid +
        ', prefer-strict-equal: ' +
        counts.strict +
        '\n',
);
