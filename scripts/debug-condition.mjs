#!/usr/bin/env node
import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('/tmp/eslint-errors3.json', 'utf8'));
console.log('Files:', d.length);
let total = 0,
    withFix = 0;
for (const f of d) {
    for (const m of f.messages) {
        if (m.ruleId === '@typescript-eslint/no-unnecessary-condition') {
            total++;
            if (m.suggestions?.length) withFix++;
            if (m.suggestions?.[0]?.fix) {
                console.log(f.filePath, m.line, m.column, 'has fix');
            } else {
                console.log(f.filePath, m.line, m.column, 'NO fix');
            }
        }
    }
}
console.log('Total:', total, 'With fix:', withFix);
