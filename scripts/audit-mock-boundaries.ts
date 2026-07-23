#!/usr/bin/env tsx
/**
 * Audit mock boundaries: detects mocks of internal logic (prohibited)
 * vs mocks of external infrastructure (permitted).
 *
 * Rules:
 * - PROHIBITED: vi.mock() of local classes, functions, helpers, utilities,
 *   or project modules developed/modified in this codebase
 * - PERMITTED: vi.mock() of external services (HTTP, filesystem, readline,
 *   network modules, third-party APIs)
 *
 * Anti-mock theater: internal business logic must run real code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from '../shared/deps.js';
import { gracefulExit } from '../shared/ui/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Paths considered "external infrastructure" — mocking these is permitted
const EXTERNAL_PATTERNS = [
    /node:/,
    /^fs$/,
    /^node:fs/,
    /^readline/,
    /^node:readline/,
    /^readline-sync/,
    /^child_process/,
    /^node:child_process/,
    /^os$/,
    /^node:os/,
    /^path$/,
    /^node:path/,
    /^http$/,
    /^https$/,
    /^node:http/,
    /^node:https/,
    /^net$/,
    /^node:net/,
    /^tls$/,
    /^node:tls/,
    /^dns$/,
    /^node:dns/,
    /^stream$/,
    /^node:stream/,
    /^events$/,
    /^node:events/,
    /^util$/,
    /^node:util/,
    /^crypto$/,
    /^node:crypto/,
    /^zlib$/,
    /^node:zlib/,
    /^url$/,
    /^node:url/,
    /^assert$/,
    /^node:assert/,
    /^worker_threads/,
    /^node:worker_threads/,
    // Third-party packages
    /^nock/,
    /^axios/,
    /^chalk/,
    /^dotenv/,
    /^readline-sync/,
    /^figlet/,
    /^cli-progress/,
    /^cli-table3/,
    /^csv-parser/,
    /^adm-zip/,
    /^yaml/,
    /^zod/,
    /^open$/,
    /^xdg-open/,
];

interface Violation {
    file: string;
    line: number;
    mockedPath: string;
    content: string;
}

function isExternalModule(mockedPath: string): boolean {
    return EXTERNAL_PATTERNS.some((p) => p.test(mockedPath));
}

function detectInternalMocks(filePath: string, content: string): Violation[] {
    const violations: Violation[] = [];
    const lines = content.split('\n');

    // Match vi.mock('...', ...) patterns
    const mockPattern = /vi\.mock\s*\(\s*['"`]([^'"`]+)['"`]/;

    for (let i = 0; i < lines.length; i++) {
        const line: string | undefined = lines[i];
        if (line === undefined) continue;

        const match = mockPattern.exec(line);
        if (match) {
            const mockedPath = match[1] ?? '';
            if (!isExternalModule(mockedPath)) {
                violations.push({
                    file: filePath,
                    line: i + 1,
                    mockedPath,
                    content: line.trim().slice(0, 120),
                });
            }
        }
    }

    return violations;
}

function main(): void {
    const testFiles = globSync('**/*.test.ts', {
        ignore: ['node_modules/**', '.stryker-tmp/**', 'scripts/__tests__/**'],
    })
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => fs.existsSync(path.resolve(f)))
        .map((f) => path.resolve(f));

    const allViolations: Violation[] = [];

    for (const filePath of testFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const violations = detectInternalMocks(path.relative(ROOT, filePath), content);
            allViolations.push(...violations);
        } catch (err) {
            rootLogger.warn(`audit-mock-boundaries: skip unreadable file ${filePath}: ${String(err)}`);
        }
    }

    if (allViolations.length > 0) {
        for (const v of allViolations) {
            rootLogger.error(`[audit-mock-boundaries] ${v.file}:${v.line} — mock de módulo interno "${v.mockedPath}":`);
            rootLogger.error(`  ${v.content}`);
        }
        rootLogger.error(
            `[audit-mock-boundaries] ${allViolations.length} violação(oes) encontrada(s). ` +
                'Mocks de lógica interna são proibidos. Use apenas mocks de fronteira externa (HTTP, filesystem, readline, APIs).',
        );
        gracefulExit(ExitCode.ERROR);
    }

    rootLogger.info('[audit-mock-boundaries] OK — nenhum mock de lógica interna detectado.');
    gracefulExit(ExitCode.OK);
}

main();
