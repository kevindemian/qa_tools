#!/usr/bin/env node
/**
 * Fix vitest/require-top-level-describe by wrapping bare hooks + describes
 * in a parent describe block.
 *
 * Strategy: Find first bare hook, wrap everything from there to EOF in a
 * parent describe('FileName', () => { ... });
 * Imports, vi.mock(), and top-level const declarations stay outside.
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const ROOT = '/home/kdemian/PROJETOS/qa_tools/qa_tools';

// Read pre-saved ESLint JSON
const eslintData = JSON.parse(readFileSync('/tmp/eslint-output.json', 'utf8'));
const violatingFiles = eslintData
    .filter(f => f.messages.some(m => m.ruleId === 'vitest/require-top-level-describe'))
    .map(f => f.filePath);

console.log(`Found ${violatingFiles.length} files to fix\n`);

const HOOK_RE = /^(beforeEach|afterEach|beforeAll|afterAll)\s*\(/;

function findFirstTopLevelHook(lines) {
    let depth = 0;
    let inImport = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Track multi-line imports
        if (trimmed.startsWith('import ') && !trimmed.includes(' from ')) {
            inImport = true;
        }
        if (inImport) {
            if (trimmed.includes(" from '") || trimmed.includes(' from "') || trimmed === '}') {
                inImport = false;
            }
            continue;
        }

        // Skip single-line imports
        if (trimmed.startsWith('import ') && (trimmed.includes(" from '") || trimmed.includes(' from "'))) {
            continue;
        }

        // Check for hook BEFORE counting braces on this line
        if (depth === 0 && HOOK_RE.test(trimmed)) {
            return i;
        }

        for (const ch of line) {
            if (ch === '{') depth++;
            if (ch === '}') depth--;
        }
        if (depth < 0) depth = 0;
    }
    return -1;
}

function deriveDescribeName(filePath) {
    const name = basename(filePath)
        .replace(/\.test\.ts$/, '')
        .replace(/\.integration\.test\.ts$/, '')
        .replace(/\.property\.test\.ts$/, '')
        .replace(/\.main\.test\.ts$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    return name;
}

function fixFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const hookLine = findFirstTopLevelHook(lines);
    if (hookLine === -1) return false;

    // Find the start of the preamble (imports + vi.mock + const declarations)
    // We wrap from the hook line to the end
    const preamble = lines.slice(0, hookLine);
    const body = lines.slice(hookLine);

    // Remove trailing blank lines from preamble
    while (preamble.length > 0 && preamble[preamble.length - 1].trim() === '') {
        preamble.pop();
    }

    const describeName = deriveDescribeName(filePath);

    // Build the wrapped content
    const result = [
        ...preamble,
        '',
        `describe('${describeName}', () => {`,
        ...body.map(l => l === '' ? '' : '    ' + l),
        '});',
        '',
    ];

    writeFileSync(filePath, result.join('\n'));
    return true;
}

let fixed = 0;
let failed = 0;
for (const file of violatingFiles) {
    try {
        if (fixFile(file)) {
            fixed++;
            console.log(`✓ ${file.replace(ROOT + '/', '')}`);
        } else {
            failed++;
            console.log(`✗ No hook found: ${file.replace(ROOT + '/', '')}`);
        }
    } catch (err) {
        failed++;
        console.error(`✗ Error: ${file.replace(ROOT + '/', '')} — ${err.message}`);
    }
}

console.log(`\nFixed: ${fixed}, Failed: ${failed}`);
