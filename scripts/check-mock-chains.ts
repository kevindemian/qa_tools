#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from '../shared/deps.js';
import { gracefulExit } from '../shared/ui/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

interface Violation {
    file: string;
    line: number;
    chainLength: number;
    content: string;
}

function detectMockChains(filePath: string, content: string): Violation[] {
    const violations: Violation[] = [];
    const lines = content.split('\n');
    let currentChain: { line: number; text: string }[] = [];
    const CHAIN_PATTERN = /\.mockResolvedValueOnce\s*\(/;

    for (let i = 0; i < lines.length; i++) {
        const line: string | undefined = lines[i];
        if (line === undefined) continue;

        if (CHAIN_PATTERN.test(line)) {
            currentChain.push({ line: i + 1, text: line });
        } else {
            if (currentChain.length > 2) {
                flushChain(currentChain, filePath, violations);
            }
            currentChain = [];
        }
    }

    if (currentChain.length > 2) {
        flushChain(currentChain, filePath, violations);
    }

    return violations;
}

function flushChain(chain: { line: number; text: string }[], filePath: string, violations: Violation[]): void {
    const hasPaginationComment = chain.some((c) => /pagina(ção|tion)|pagination|page/i.test(c.text));
    if (hasPaginationComment) return;

    const first = chain[0];
    if (!first) return;

    violations.push({
        file: filePath,
        line: first.line,
        chainLength: chain.length,
        content: chain.map((c) => `  ${c.line}: ${c.text.slice(0, 100)}`).join('\n'),
    });
}

function main(): void {
    const testFiles = globSync('**/*.test.ts', { ignore: ['node_modules/**', '.stryker-tmp/**'] })
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => fs.existsSync(path.resolve(f)))
        .map((f) => path.resolve(f));

    const allViolations: Violation[] = [];

    for (const filePath of testFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const violations = detectMockChains(path.relative(ROOT, filePath), content);
            allViolations.push(...violations);
        } catch (err) {
            rootLogger.warn(`check-mock-chains: skip unreadable file ${filePath}: ${String(err)}`);
        }
    }

    if (allViolations.length > 0) {
        for (const v of allViolations) {
            rootLogger.error(
                `[check-mock-chains] ${v.file}:${v.line} — cadeia de ${v.chainLength} mockResolvedValueOnce sem comentário de paginação:`,
            );
            rootLogger.error(v.content);
        }
        rootLogger.error(
            `[check-mock-chains] ${allViolations.length} violação(oes) encontrada(s). Adicione '// pagination' na cadeia ou refatore para loop.`,
        );
        gracefulExit(ExitCode.ERROR);
    }

    rootLogger.info('[check-mock-chains] OK — nenhuma cadeia de mock > 2 sem pagination.');
    gracefulExit(ExitCode.OK);
}

main();
