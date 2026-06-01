/**
 * Transform all `.test.ts` files — Phase 1 (Fase 2):
 * `as jest.Mock` / `as jest.Mocked<T>` / `as jest.MockedFunction<T>` → `jest.mocked()`
 *
 * Usage: npx tsx scripts/transform-jest-mock.ts
 *
 * SAFETY:
 * - PAREN_CAST_RE: handles `(EXPR as jest.Mock)` — EXPR may contain `()` calls
 * - ASSIGN_CAST_RE: handles `SIMPLE_EXPR as jest.Mocked<Type>` — excludes `unknown`
 *   (which appears in `as unknown as jest.Mocked<Type>` patterns from Fase 3)
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const TEST_FILES = globSync('**/*.test.ts', {
    ignore: ['node_modules/**', '**/__mocks__/**'],
});

// (EXPR as jest.Mock)  →  jest.mocked(EXPR)
// EXPR may contain string literals like './foo' but no nested parens at top level.
function replaceParenCast(content: string): string {
    const re = /\(((?:[^()'"]|'[^']*'|"[^"]*")+)\s+as jest\.Mock\s*\)/g;
    return content.replace(re, (_, expr: string) => `jest.mocked(${expr.trim()})`);
}

// SIMPLE_EXPR as jest.Mocked<Type>   →   jest.mocked(SIMPLE_EXPR)
// SIMPLE_EXPR as jest.MockedFunction<Type>   →   jest.mocked(SIMPLE_EXPR)
// SIMPLE_EXPR must be a simple identifier/member chain (no spaces, no parens).
// Excludes the keyword "unknown" to avoid matching `} as unknown as jest.Mocked<T>`.
function replaceAssignCast(content: string): string {
    const re =
        /\b(?!(?:unknown|any|never|void|undefined|null|boolean|string|number)\b)(\w+(?:\.\w+)*)\s+as jest\.(?:Mocked|MockedFunction)<[^>]+>/g;
    return content.replace(re, (_, expr: string) => `jest.mocked(${expr.trim()})`);
}

let totalFiles = 0;
let totalChanges = 0;

for (const file of TEST_FILES) {
    let content = readFileSync(file, 'utf8');
    const original = content;

    content = replaceParenCast(content);
    content = replaceAssignCast(content);

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        const changes = countChanges(original, content);
        totalFiles++;
        totalChanges += changes;
        console.log(`✏️  ${file} – ${changes} change(s)`);
    }
}

function countChanges(original: string, modified: string): number {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    let changes = 0;
    for (let i = 0; i < Math.max(origLines.length, modLines.length); i++) {
        if (origLines[i] !== modLines[i]) changes++;
    }
    return changes;
}

console.log(`\n✅ Done. ${totalFiles} files modified, ${totalChanges} total changes.`);
