#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from '../shared/deps.js';

const counts = { assertions: 0, files: 0 };

const testFiles = globSync('scripts/**/*.test.ts', {
    ignore: ['node_modules/**', 'scripts/fix-lint-errors.ts', 'scripts/fix-assertions.ts'],
});

const immutable = ['scripts/quality-check.test.ts', 'scripts/qa.test.ts'];

process.stderr.write('Test files: ' + testFiles.length + '\n');

for (const f of testFiles) {
    if (immutable.includes(f)) {
        process.stderr.write('  SKIP (immutable): ' + f + '\n');
        continue;
    }
    const src = readFileSync(f, 'utf-8');
    const lines = src.split('\n');
    const newLines: string[] = [];
    let changes = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        newLines.push(line);

        const trimmed = line.trim();
        const endsWithBrace = trimmed.endsWith('{') && !trimmed.includes('//');
        const isTestBlock = /^\s*(it|test)\s*\(/.test(trimmed);

        if (isTestBlock && endsWithBrace) {
            const nextLine = lines[i + 1] ?? '';
            if (/^\s*expect\.(?:hasAssertions|assertions)\(/.test(nextLine)) continue;
            const indent = nextLine.match(/^(\s*)/)?.[1] ?? '    ';
            newLines.push('');
            newLines.push(indent + 'expect.hasAssertions();');
            changes++;
        } else if (isTestBlock && line.includes('=>')) {
            const braceIdx = line.indexOf('{');
            if (braceIdx === -1) {
                const nextLine = lines[i + 1] ?? '';
                if (nextLine.trim() === '{') {
                    const after = lines[i + 2] ?? '';
                    if (/^\s*expect\.(?:hasAssertions|assertions)\(/.test(after)) continue;
                    const indent = after.match(/^(\s*)/)?.[1] ?? '    ';
                    newLines.push(indent + 'expect.hasAssertions();');
                    changes++;
                }
            }
        }
    }

    if (changes > 0) {
        const result = newLines.join('\n');
        writeFileSync(f, result, 'utf-8');
        counts.files++;
        counts.assertions += changes;
        process.stderr.write('  fixed: ' + f + ' (+' + changes + ' assertions)\n');
    }
}

process.stderr.write('Done. Files: ' + counts.files + ', assertions added: ' + counts.assertions + '\n');
