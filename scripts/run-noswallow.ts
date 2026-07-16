import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ESLint } from 'eslint';
import fs from 'node:fs';
import { rootLogger } from '../shared/logger.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Binary absoluto e fixo (nao derivado de PATH gravavel) — exige o caminho
// explicito para satisfazer sonarjs/no-os-command-from-path. Sobrescreva via
// GIT_BIN apenas em ambientes onde o git nao esta em /usr/bin/git.
const GIT_BIN = process.env['GIT_BIN'] || '/usr/bin/git';

function diffFiles(): string[] {
    const collected = new Set<string>();
    const tryDiff = (args: string[]): void => {
        try {
            const out = execFileSync(GIT_BIN, args, { cwd: ROOT, encoding: 'utf8' });
            for (const s of out.split('\n')) {
                const t = s.trim();
                if (t) collected.add(t);
            }
        } catch (err) {
            rootLogger.warn(`run-noswallow: falha ao obter diff [${args.join(' ')}]: ${String(err)}`);
        }
    };
    const base = process.env['GITHUB_BASE_REF'] || 'dev';
    tryDiff(['diff', '--name-only', `origin/${base}...HEAD`]);
    tryDiff(['diff', '--name-only', 'HEAD']);
    tryDiff(['diff', '--cached', '--name-only']);
    return [...collected]
        .filter((s) => s.endsWith('.ts') && !s.endsWith('.test.ts') && fs.existsSync(path.join(ROOT, s)))
        .map((s) => path.join(ROOT, s));
}

async function main(): Promise<void> {
    const files = diffFiles();
    if (files.length === 0) {
        rootLogger.info('[no-swallow] nenhum arquivo .ts de producao no diff; pulando.');
        return;
    }

    const eslint = new ESLint({
        overrideConfigFile: path.join(ROOT, 'eslint.config.mjs'),
        overrideConfig: {
            rules: {
                'local-no-swallow/no-swallow': 'error',
            },
        },
        errorOnUnmatchedPattern: false,
    });

    const results = await eslint.lintFiles(files);
    const violations = results.flatMap((r) =>
        r.messages
            .filter((m) => m.ruleId === 'local-no-swallow/no-swallow')
            .map((m) => `  ${path.relative(ROOT, r.filePath)}:${m.line} ${m.message}`),
    );

    if (violations.length > 0) {
        rootLogger.error(
            `[no-swallow] ${violations.length} supressao(oes) de erro detectada(s) em arquivos do diff:\n${violations.join('\n')}`,
        );
        process.exit(1);
    }
    rootLogger.info('[no-swallow] OK — nenhuma supressao de erro em arquivos do diff.');
}

main().catch((err) => {
    rootLogger.error(`[no-swallow] erro interno: ${String(err)}`);
    process.exit(1);
});
