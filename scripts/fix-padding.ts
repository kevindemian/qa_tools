#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from '../shared/deps.js';

const testFiles = globSync('scripts/**/*.test.ts', {
    ignore: ['node_modules/**'],
});

const immutable = ['scripts/quality-check.test.ts', 'scripts/qa.test.ts'];
let count = 0;

for (const f of testFiles) {
    if (immutable.includes(f)) continue;
    const src = readFileSync(f, 'utf-8');
    const lines = src.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const isAssertion = /^\s*expect\.(?:hasAssertions|assertions)\(/.test(line);

        if (isAssertion) {
            const lastInResult = result.length > 0 ? (result[result.length - 1] ?? '') : '';
            if (lastInResult.trim() !== '') result.push('');
            result.push(line);
            result.push('');
            count++;
        } else {
            result.push(line);
        }
    }

    const final = result.join('\n');
    if (final !== src) {
        writeFileSync(f, final, 'utf-8');
        process.stderr.write('  fixed: ' + f + '\n');
    }
}

process.stderr.write('Done. Lines fixed: ' + count + '\n');
