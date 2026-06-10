#!/usr/bin/env node
import { readFileSync } from 'fs';
const raw = readFileSync('/dev/stdin', 'utf-8');
const d = JSON.parse(raw);
let fixable = 0,
    nonfixable = 0;
for (const f of d)
    for (const m of f.messages)
        if (m.ruleId === '@typescript-eslint/no-unnecessary-condition') {
            if (m.suggestions?.length) fixable++;
            else nonfixable++;
        }
console.log('fixable:', fixable, 'non-fixable:', nonfixable);
