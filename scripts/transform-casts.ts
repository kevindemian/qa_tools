/**
 * Fase 2 + Step 1 of Fase 3 — bulk transforms.
 *
 * Config.set() fix (196 occ):  (Config as unknown as { set: ... }).set(k,v)  →  Config.set(k,v)
 * jest.mocked() migration (409 occ):  (expr as jest.Mock)  →  jest.mocked(expr)
 *
 * After running, fix ALL TSC errors. No workarounds.
 *
 * Usage: npx tsx scripts/transform-casts.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const TEST_FILES = globSync('**/*.test.ts', {
    ignore: ['node_modules/**', '**/__mocks__/**'],
});

function countChanges(original: string, modified: string): number {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    let changes = 0;
    for (let i = 0; i < Math.max(origLines.length, modLines.length); i++) {
        if (origLines[i] !== modLines[i]) changes++;
    }
    return changes;
}

let totalFiles = 0;
let totalChanges = 0;

for (const file of TEST_FILES) {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Step 1: Config.set() — cast is redundant
    content = content.replace(
        /\(Config\s+as unknown as\s*\{\s*set:\s*\([^)]+\)\s*=>\s*(?:void|unknown)\s*\}\s*\)\.set\(/g,
        'Config.set(',
    );

    // Step 2: (expr as jest.Mock)  →  jest.mocked(expr)
    content = content.replace(
        /\((\w+(?:\.\w+)*)\s+as jest\.Mock\s*\)/g,
        (_, expr: string) => `jest.mocked(${expr.trim()})`,
    );

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        const changes = countChanges(original, content);
        totalFiles++;
        totalChanges += changes;
        if (changes > 2) console.log(`✏️  ${file} – ${changes} change(s)`);
    }
}

console.log(`\n✅ Done. ${totalFiles} files modified, ${totalChanges} total changes.`);
