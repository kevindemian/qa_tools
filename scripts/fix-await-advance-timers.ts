#!/usr/bin/env tsx
/**
 * fix-await-advance-timers.ts — Adds await to vi.advanceTimersByTimeAsync calls
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

let eslintOutput: string;
try {
    eslintOutput = execSync('npx eslint . --format json', {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000,
    });
} catch (e: unknown) {
    eslintOutput = (e as { stdout: string }).stdout;
}

const results = JSON.parse(eslintOutput);

const fileViolations = new Map<string, number[]>();
for (const result of results) {
    for (const msg of result.messages) {
        if (msg.ruleId !== 'vitest/no-restricted-vi-methods') continue;
        if (!fileViolations.has(result.filePath)) {
            fileViolations.set(result.filePath, []);
        }
        fileViolations.get(result.filePath)!.push(msg.line);
    }
}

console.log(`Files to fix: ${fileViolations.size}`);

let fixed = 0;
for (const [filePath, lines] of fileViolations) {
    let content = readFileSync(filePath, 'utf-8');
    const contentLines = content.split('\n');
    const linesSet = new Set(lines);

    for (let i = 0; i < contentLines.length; i++) {
        if (!linesSet.has(i + 1)) continue;
        const line = contentLines[i];

        // Add await before vi.advanceTimersByTimeAsync if not already there
        if (line.includes('vi.advanceTimersByTimeAsync') && !line.trimStart().startsWith('await')) {
            contentLines[i] = line.replace(/vi\.advanceTimersByTimeAsync/, 'await vi.advanceTimersByTimeAsync');
            fixed++;
        }
    }

    writeFileSync(filePath, contentLines.join('\n'));
}

console.log(`Applied ${fixed} await fixes`);
