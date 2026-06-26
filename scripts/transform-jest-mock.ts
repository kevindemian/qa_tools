/**
 * Transform all `.test.ts` files — Phase 1 (Fase 2):
 * `as Mock` / `as Mocked<T>` / `as Mocked<T>` → `vi.mocked()`
 *
 * Usage: npx tsx scripts/transform-jest-mock.ts
 *
 * SAFETY:
 * - PAREN_CAST_RE: handles `(EXPR as Mock)` — EXPR may contain `()` calls
 * - ASSIGN_CAST_RE: handles `SIMPLE_EXPR as Mocked<Type>` — excludes `unknown`
 *   (which appears in `as unknown as Mocked<Type>` patterns from Fase 3)
 */
import { readFileSync, writeFileSync } from 'fs';

import { globSync } from '../shared/deps.js';
import { rootLogger } from '../shared/logger.js';

const TEST_FILES = globSync('**/*.test.ts', {
    ignore: ['node_modules/**', '**/__mocks__/**'],
});

// (EXPR as Mock)  →  vi.mocked(EXPR)
// EXPR may contain string literals like './foo' but no nested parens at top level.
function replaceParenCast(content: string): string {
    return content.replace(/\([^()]+\)\s+as jest\.Mock\s*\)/g, (match) => {
        const inner = match.slice(1, match.lastIndexOf(') as jest.Mock'));
        return `vi.mocked(${inner.trim()})`;
    });
}

// SIMPLE_EXPR as Mocked<Type>   →   vi.mocked(SIMPLE_EXPR)
// SIMPLE_EXPR as Mocked<Type>   →   vi.mocked(SIMPLE_EXPR)
// SIMPLE_EXPR must be a simple identifier/member chain (no spaces, no parens).
// Excludes the keyword "unknown" to avoid matching `} as unknown as Mocked<T>`.
function replaceAssignCast(content: string): string {
    const reserved = new Set(['unknown', 'any', 'never', 'void', 'undefined', 'null', 'boolean', 'string', 'number']);
    return content.replace(/(\w[\w.]*)\s+as jest\.(?:Mocked|MockedFunction)<[^>]+>/g, (match, expr: string) => {
        const first = expr.split('.')[0] ?? '';
        if (reserved.has(first)) return match;
        return `vi.mocked(${expr.trim()})`;
    });
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
        rootLogger.info(`✏️  ${file} – ${changes} change(s)`);
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

rootLogger.info(`\n✅ Done. ${totalFiles} files modified, ${totalChanges} total changes.`);
