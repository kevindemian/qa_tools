#!/usr/bin/env node
/**
 * Codemod: add .js extension to all relative imports in .ts files.
 * Required before switching "type" to "module".
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const TS_FILES = globSync('**/*.ts', { ignore: ['node_modules/**', 'dist/**', '.git/**'] });

const IMPORT_RE =
    /((?:from|import)\s+['"])((?:\.\.?\/)[^'"]*?)(['"])|(import\s*\(\s*['"])((?:\.\.?\/)[^'"]*?)(['"]\s*\))/g;

let totalChanges = 0;

for (const file of TS_FILES) {
    const original = readFileSync(file, 'utf-8');
    const updated = original.replace(IMPORT_RE, (match, prefix1, path1, quote1, prefix2, path2, suffix2) => {
        const path = path1 || path2;
        if (!path) return match;
        if (/\.\w+$/.test(path) || path.endsWith('/')) return match;
        totalChanges++;
        if (path1) return `${prefix1}${path1}.js${quote1}`;
        return `${prefix2}${path2}.js${suffix2}`;
    });

    if (original !== updated) {
        writeFileSync(file, updated, 'utf-8');
        console.log(`✓ ${file}`);
    }
}

console.log(`\nTotal: ${totalChanges} imports modified`);
