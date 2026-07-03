#!/usr/bin/env tsx
import path from 'path';
import { readFileSync, existsSync } from 'fs';

const safeGet = (obj: object, key: string | number): unknown =>
    Object.prototype.hasOwnProperty.call(obj, key) ? Reflect.get(obj, key) : undefined;

interface Warning {
    file: string;
    line: number;
    rule: string;
    message: string;
}

function isMarkdownSkip(line: string, isMarkdown: boolean, inCodeFence: boolean): boolean {
    if (!isMarkdown) return false;
    if (inCodeFence) return true;
    return /^\s*[-*]\s/.test(line);
}

function scanFile(filePath: string): Warning[] {
    if (!existsSync(path.resolve(filePath))) return [];
    const warnings: Warning[] = [];
    const content = readFileSync(path.resolve(filePath), 'utf-8');
    const lines = content.split('\n');

    const isMarkdown = filePath.endsWith('.md');
    let inCodeFence = false;

    const scanners: Array<{ rule: string; test: (line: string, _idx: number) => string | null }> = [
        {
            rule: 'no-hardcoded-token',
            test: (line, _idx) => {
                const tokenRe = /(?:token|secret|key|password|api_key|apikey)\s*[=:]\s*['"][^'"]+['"]/i;
                const m = tokenRe.exec(line);
                if (
                    m &&
                    !line.trimStart().startsWith('//') &&
                    !line.trimStart().startsWith('#') &&
                    !line.includes('process.env')
                ) {
                    return `Possible hardcoded credential: ${m[0].substring(0, 50)}`;
                }
                return null;
            },
        },
        {
            rule: 'no-insecure-protocol',
            test: (line, _idx) => {
                if (/https?:\/\/localhost/i.test(line)) return null;
                if (/\bhttp:\/\/(?!localhost)/i.test(line)) {
                    return 'Insecure HTTP protocol detected';
                }
                return null;
            },
        },
        {
            rule: 'no-bypass-comment',
            test: (line, _idx) => {
                const bypassRe = /\b(?:eslint-disable|ts-ignore|ts-expect-error|noqa|NOLINT)\b/;
                if (bypassRe.test(line) && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('#')) {
                    return `Safety bypass comment: ${line.trim().substring(0, 60)}`;
                }
                return null;
            },
        },
        {
            rule: 'no-exec-in-config',
            test: (line, _idx) => {
                if (
                    /exec\s*\(|execSync\s*\(/.test(line) &&
                    (filePath.endsWith('.mjs') ||
                        filePath.endsWith('.js') ||
                        filePath.endsWith('.toml') ||
                        filePath.endsWith('.yml'))
                ) {
                    return `Dynamic exec in config file`;
                }
                return null;
            },
        },
        {
            rule: 'no-wildcard-permission',
            test: (line, _idx) => {
                if (filePath.endsWith('eslint.config.mjs') && line.includes('"*"') && line.includes('allow')) {
                    return 'Wildcard allow rule in eslint config';
                }
                return null;
            },
        },
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = (safeGet(lines, i) ?? '') as string;

        if (isMarkdown && /^```/.test(line.trim())) {
            inCodeFence = !inCodeFence;
            continue;
        }
        if (isMarkdownSkip(line, isMarkdown, inCodeFence)) continue;

        for (const scanner of scanners) {
            const msg = scanner.test(line, i);
            if (msg) {
                warnings.push({ file: filePath, line: i + 1, rule: scanner.rule, message: msg });
            }
        }
    }

    return warnings;
}

const args = process.argv.slice(2);
let filePath = '';
let quiet = false;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
    const arg = safeGet(args, i) as string | undefined;
    if (arg === '--file' && i + 1 < args.length) {
        filePath = (safeGet(args, ++i) ?? '') as string;
    } else if (arg === '--quiet') {
        quiet = true;
    } else if (arg === '--json') {
        jsonOutput = true;
    }
}

if (!filePath) {
    process.stderr.write('Usage: rule-vigilant.ts --file <path> [--quiet] [--json]\n');
    process.exit(1);
}

const warnings = scanFile(filePath);

if (jsonOutput) {
    process.stdout.write(JSON.stringify(warnings) + '\n');
} else if (warnings.length > 0 && !quiet) {
    for (const w of warnings) {
        process.stdout.write(`  [${w.rule}] ${w.file}:${w.line}  ${w.message}\n`);
    }
}

process.exit(warnings.length > 0 ? 1 : 0);
