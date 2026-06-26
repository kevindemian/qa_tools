/**
 * Fase 2 — vi.mocked() Migration (completion).
 *
 * Replaces all remaining `as Mock` / `as Mocked<Type>` / `as Mocked<typeof fn>`
 * patterns with `vi.mocked()`.
 *
 * Skipped intentionally (Fase 3): object literals cast to `Mocked<AxiosInstance>` — will be handled
 * by `createMockAxiosInstance()` factory.
 *
 * Usage: npx tsx scripts/transform-fase2.ts
 */
import { readFileSync, writeFileSync } from 'fs';

import { globSync } from '../shared/deps.js';

const TEST_FILES = globSync('**/*.test.ts', {
    ignore: ['node_modules/**', '**/__mocks__/**'],
});

let totalFiles = 0;
let totalChanges = 0;

for (const file of TEST_FILES) {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Step 1: expr as Mock<(...args: Args) => Type>  →  vi.mocked(expr)  (preserve surrounding parens if any)
    // Handle: expr as Mock (no generics)
    const step1Before = content;
    content = content.replace(/(\w[\w.]*)\s+as jest\.Mock\b[^>]*/g, (match, expr: string) => {
        // Skip if already wrapped in vi.mocked()
        const lineStart = Math.max(0, content.indexOf(match) - 20);
        const prefix = content.slice(lineStart, content.indexOf(match));
        if (prefix.includes('vi.mocked(')) return match;
        return `vi.mocked(${expr.trim()})`;
    });
    // Fix double-wrapping: vi.mocked(vi.mocked( → vi.mocked(
    content = content.replace(/jest\.mocked\(jest\.mocked\(/g, 'vi.mocked(');

    const step1After = content;
    if (step1Before !== step1After) {
        const diff = step1After.split('\n').length - step1Before.split('\n').length;
        totalChanges += Math.abs(diff) || 1;
    }

    // Step 2: (expr as Mock)  →  vi.mocked(expr)  (parenthesized form, from original script)
    content = content.replace(
        /\((\w[\w.]*)\s+as jest\.Mock\b[^>]*\)/g,
        (_, expr: string) => `vi.mocked(${expr.trim()})`,
    );

    // Step 3: expr as Mocked<Type>  →  vi.mocked(expr)  (NO AxiosInstance)
    content = content.replace(
        /(\w[\w.]*)\s+as jest\.Mocked<[^>]+>/g,
        (match, expr: string) => {
            if (match.includes('AxiosInstance')) return match;
            return `vi.mocked(${expr.trim()})`;
        },
    );

    // Step 4: new Class(args) as Mocked<Class>  →  vi.mocked(new Class(args))
    content = content.replace(
        /new\s+(\w+)\(([^)]*)\)\s+as jest\.Mocked<(?:\w+)>/g,
        (_, cls: string, args: string) => `vi.mocked(new ${cls}(${args}))`,
    );

    // Step 5: expr as Mocked<typeof fn>  →  vi.mocked(fn)
    content = content.replace(
        /(\w[\w.]*)\s+as jest\.MockedFunction<typeof\s+(\w+)>/g,
        (_, _expr: string, fn: string) => `vi.mocked(${fn})`,
    );

    // Step 6: expr as unknown as Mock  →  vi.mocked(expr)
    // But NOT expr as unknown as Mocked<AxiosInstance> (will be factory in Fase 3)
    content = content.replace(
        /(\w[\w.]*)\s+as unknown as jest\.Mock\b[^>]*/g,
        (_, expr: string) => `vi.mocked(${expr.trim()})`,
    );

    // Step 7: expr as unknown as Mocked<Type>  →  vi.mocked(expr)  (NO AxiosInstance)
    content = content.replace(
        /(\w[\w.]*)\s+as unknown as jest\.Mocked<[^>]+>/g,
        (match, expr: string) => {
            if (match.includes('AxiosInstance')) return match;
            return `vi.mocked(${expr.trim()})`;
        },
    );

    // Step 8: fs as Mocked<typeof fs>  →  vi.mocked(fs)
    content = content.replace(/(\w+)\s+as jest\.Mocked<typeof\s+\1>/g, (_, name: string) => `vi.mocked(${name})`);

    if (content !== original) {
        writeFileSync(file, content, 'utf8');
        totalFiles++;
        const changeCount = countChanges(original, content);
        totalChanges += changeCount;
        process.stdout.write(`✏️  ${file} – ${changeCount} change(s)\n`);
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

process.stdout.write(`\nDone. ${totalFiles} files modified, ${totalChanges} total changes.\n`);
