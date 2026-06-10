#!/usr/bin/env node
import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
let cnt = 0;
for (const item of data) {
    for (const m of item.messages) {
        if (m.ruleId === '@typescript-eslint/unbound-method') {
            const lines = (item.source || '').split('\n');
            const line = lines[m.line - 1] || '';
            console.log(`${item.filePath}:${m.line}:${m.column}`);
            console.log(`  msg: ${m.message}`);
            console.log(`  code: ${line.trim()}`);
            console.log();
            if (++cnt >= 10) {
                console.log(`... ${data.length} items total`);
                process.exit(0);
            }
        }
    }
}
