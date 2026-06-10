#!/usr/bin/env node
/**
 * Fix @typescript-eslint/unbound-method errors by wrapping method references
 * with mockedSafe().
 *
 * Usage: npm run lint -- --format json 2>/dev/null | node scripts/fix-unbound-method.mjs
 *
 * Reads eslint JSON from stdin. For each unbound-method error:
 * 1. Wraps the expression with mockedSafe()
 * 2. Adds import for mockedSafe from shared/test-utils/mock-types.js
 *
 * Only applies to .test.ts files (production code needs different treatment).
 */

import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('/dev/stdin', 'utf8'));

const IMPORT_LINE = `import { mockedSafe } from '../shared/test-utils/mock-types.js';\n`;
const IMPORT_REGEX = /import.*mockedSafe.*from.*mock-types/;

const files = {};
for (const item of data) {
    for (const m of item.messages) {
        if (m.ruleId === '@typescript-eslint/unbound-method') {
            if (!files[item.filePath]) files[item.filePath] = [];
            files[item.filePath].push({ line: m.line, column: m.column, endLine: m.endLine, endColumn: m.endColumn });
        }
    }
}

for (const [filePath, errors] of Object.entries(files)) {
    let content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const err of errors) {
        const lineIdx = err.line - 1;
        const line = lines[lineIdx];
        const expr = line.slice(err.column - 1, err.endColumn - 1).trim();

        if (expr.startsWith('mockedSafe(')) {
            continue;
        }

        const safeExpr = `mockedSafe(${expr})`;
        lines[lineIdx] = line.slice(0, err.column - 1) + safeExpr + line.slice(err.endColumn - 1);
    }

    content = lines.join('\n');

    if (!IMPORT_REGEX.test(content)) {
        const importIdx = content.indexOf('import {');
        if (importIdx >= 0) {
            const newlineIdx = content.indexOf('\n', importIdx);
            content = content.slice(0, newlineIdx + 1) + IMPORT_LINE + content.slice(newlineIdx + 1);
        }
    }

    writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath} (${errors.length} occ)`);
}

console.log(
    `\nDone: ${Object.keys(files).length} files, ${Object.values(files).reduce((a, b) => a + b.length, 0)} occurrences`,
);
