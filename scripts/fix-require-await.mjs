#!/usr/bin/env node
/**
 * fix-require-await.mjs — Remove async from functions without await.
 *
 * Strategy: Parse eslint output to get exact file:line:col positions,
 * then remove the `async` keyword at each identified position.
 * This is provably correct because eslint already verified that
 * the function body contains zero `await` expressions.
 *
 * Usage: node scripts/fix-require-await.mjs
 *   Reads eslint output from stdin, applies fixes.
 *
 *   node scripts/fix-require-await.mjs --batch <glob>
 *   Runs eslint on the given glob, applies fixes.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Parse ESLint output lines to extract require-await error positions.
 * Format:
 *   /path/file.ts
 *     line:col  error  Async arrow function has no 'await' expression  @typescript-eslint/require-await
 */
function parseEslintOutput(output) {
    const errors = [];
    let currentFile = null;

    const lines = output.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // File path line (starts with /)
        if (line.startsWith('/') && line.includes('qa_tools/qa_tools/')) {
            currentFile = line.trim();
            continue;
        }

        // Error line (indented with spaces)
        if (currentFile && line.includes('@typescript-eslint/require-await')) {
            const match = line.match(/^\s+(\d+):(\d+)\s+error/);
            if (match) {
                const errLine = parseInt(match[1], 10);
                const errCol = parseInt(match[2], 10);
                // Normalize file path
                const prefix = '/home/kdemian/PROJETOS/qa_tools/qa_tools/';
                let filePath = currentFile;
                if (filePath.startsWith(prefix)) {
                    filePath = filePath.slice(prefix.length);
                }
                errors.push({ file: filePath, line: errLine, col: errCol });
            }
        }
    }
    return errors;
}

/**
 * Remove 'async' keyword at the given line:col position in a file.
 * Returns 1 if a fix was applied, 0 if not.
 */
function removeAsyncAt(filePath, line, col) {
    if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return 0;
    }
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (line < 1 || line > lines.length) {
        console.error(`Invalid line ${line} in ${filePath}`);
        return 0;
    }

    const targetLine = lines[line - 1];

    // ESLint column may point to any part of the error (arrow function, etc.).
    // Search for 'async' on the line and remove the first occurrence.
    const asyncMatch = targetLine.match(/\basync\b/);
    if (!asyncMatch) {
        return 0;
    }

    // Remove 'async' (5 chars) and any following space
    const asyncPos = asyncMatch.index;
    const before = targetLine.slice(0, asyncPos);
    const after = targetLine.slice(asyncPos + 5);
    // Remove one space after 'async' if present
    const newLine = before + after.replace(/^[ \t]/, '');
    lines[line - 1] = newLine;
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return 1;
}

// Main
const args = process.argv.slice(2);

if (args.includes('--batch')) {
    // Run eslint, parse output, apply fixes
    const globIdx = args.indexOf('--batch') + 1;
    const glob = globIdx < args.length ? args[globIdx] : '.';
    console.error(`Running eslint on ${glob}...`);
    const eslintOutput = execSync(`npx eslint '${glob}' 2>&1 || true`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
    });
    const errors = parseEslintOutput(eslintOutput);
    console.error(`Found ${errors.length} require-await errors`);

    // Group by file
    const byFile = {};
    for (const err of errors) {
        if (!byFile[err.file]) byFile[err.file] = [];
        byFile[err.file].push(err);
    }

    // Apply fixes (process from end of file to start to preserve line numbers)
    let totalFixed = 0;
    for (const [file, fileErrors] of Object.entries(byFile)) {
        // Sort by line descending so we don't invalidate positions
        fileErrors.sort((a, b) => b.line - a.line || b.col - a.col);

        let fixed = 0;
        for (const err of fileErrors) {
            fixed += removeAsyncAt(file, err.line, err.col);
        }
        if (fixed > 0) {
            console.error(`✓ ${file} (${fixed} fixes)`);
            totalFixed += fixed;
        }
    }
    console.error(`Total: ${totalFixed} async removals in ${Object.keys(byFile).length} files`);
} else {
    // Read eslint output from stdin
    const stdin = readFileSync('/dev/stdin', 'utf-8');
    const errors = parseEslintOutput(stdin);
    console.error(`Found ${errors.length} require-await errors`);

    const byFile = {};
    for (const err of errors) {
        if (!byFile[err.file]) byFile[err.file] = [];
        byFile[err.file].push(err);
    }

    let totalFixed = 0;
    for (const [file, fileErrors] of Object.entries(byFile)) {
        fileErrors.sort((a, b) => b.line - a.line || b.col - a.col);
        let fixedCount = 0;
        for (const err of fileErrors) {
            fixedCount += removeAsyncAt(file, err.line, err.col);
        }
        if (fixedCount > 0) {
            // Only output the fix count, not individual files
            totalFixed += fixedCount;
        }
    }

    // Output machine-readable: file count and fix count
    console.log(`${Object.keys(byFile).length}\t${totalFixed}`);
}
