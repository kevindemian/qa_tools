/**
 * Fase 2 — jest.mocked() Migration (completion).
 *
 * Replaces all remaining `as jest.Mock` / `as jest.Mocked<Type>` / `as jest.MockedFunction<typeof fn>`
 * patterns with `jest.mocked()`.
 *
 * Skipped intentionally (Fase 3): object literals cast to `jest.Mocked<AxiosInstance>` — will be handled
 * by `createMockAxiosInstance()` factory.
 *
 * Usage: npx tsx scripts/transform-fase2.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const TEST_FILES = globSync('**/*.test.ts', {
    ignore: ['node_modules/**', '**/__mocks__/**'],
});

let totalFiles = 0;
let totalChanges = 0;

for (const file of TEST_FILES) {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Step 1: expr as jest.Mock<Type, Args>  →  jest.mocked(expr)  (preserve surrounding parens if any)
    // Handle: expr as jest.Mock (no generics)
    const step1Before = content;
    content = content.replace(/(\w+(?:\.\w+)*)\s+as jest\.Mock\b(?:<[^>]+>)?/g, (match, expr) => {
        // Skip if already wrapped in jest.mocked()
        const lineStart = Math.max(0, content.indexOf(match) - 20);
        const prefix = content.slice(lineStart, content.indexOf(match));
        if (prefix.includes('jest.mocked(')) return match;
        return `jest.mocked(${expr.trim()})`;
    });
    // Fix double-wrapping: jest.mocked(jest.mocked( → jest.mocked(
    content = content.replace(/jest\.mocked\(jest\.mocked\(/g, 'jest.mocked(');

    const step1After = content;
    if (step1Before !== step1After) {
        const diff = step1After.split('\n').length - step1Before.split('\n').length;
        totalChanges += Math.abs(diff) || 1;
    }

    // Step 2: (expr as jest.Mock)  →  jest.mocked(expr)  (parenthesized form, from original script)
    content = content.replace(
        /\((\w+(?:\.\w+)*)\s+as jest\.Mock\b(?:<[^>]+>)?\s*\)/g,
        (_, expr: string) => `jest.mocked(${expr.trim()})`,
    );

    // Step 3: expr as jest.Mocked<Type>  →  jest.mocked(expr)  (NO AxiosInstance)
    content = content.replace(
        /(\w+(?:\.\w+)*)\s+as jest\.Mocked<((?!AxiosInstance)[^>]+)>/g,
        (_, expr: string) => `jest.mocked(${expr.trim()})`,
    );

    // Step 4: new Class(args) as jest.Mocked<Class>  →  jest.mocked(new Class(args))
    content = content.replace(
        /new\s+(\w+)\(([^)]*)\)\s+as jest\.Mocked<(?:\w+)>/g,
        (_, cls: string, args: string) => `jest.mocked(new ${cls}(${args}))`,
    );

    // Step 5: expr as jest.MockedFunction<typeof fn>  →  jest.mocked(fn)
    content = content.replace(
        /(\w+(?:\.\w+)*)\s+as jest\.MockedFunction<typeof\s+(\w+)>/g,
        (_, _expr: string, fn: string) => `jest.mocked(${fn})`,
    );

    // Step 6: expr as unknown as jest.Mock  →  jest.mocked(expr)
    // But NOT expr as unknown as jest.Mocked<AxiosInstance> (will be factory in Fase 3)
    content = content.replace(
        /(\w+(?:\.\w+)*)\s+as unknown as jest\.Mock\b(?:<[^>]+>)?/g,
        (_, expr: string) => `jest.mocked(${expr.trim()})`,
    );

    // Step 7: expr as unknown as jest.Mocked<Type>  →  jest.mocked(expr)  (NO AxiosInstance)
    content = content.replace(
        /(\w+(?:\.\w+)*)\s+as unknown as jest\.Mocked<((?!AxiosInstance)[^>]+)>/g,
        (_, expr: string) => `jest.mocked(${expr.trim()})`,
    );

    // Step 8: fs as jest.Mocked<typeof fs>  →  jest.mocked(fs)
    content = content.replace(/(\w+)\s+as jest\.Mocked<typeof\s+\1>/g, (_, name: string) => `jest.mocked(${name})`);

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        totalFiles++;
        const changeCount = countChanges(original, content);
        totalChanges += changeCount;
        console.log(`✏️  ${file} – ${changeCount} change(s)`);
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
