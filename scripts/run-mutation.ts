/**
 * run-mutation.ts — Executa Stryker (mutation testing, Camada C do plano).
 *
 * O Stryker usa a versao fixa em package.json (devDependencies). O teto de
 * mutation score e gerenciado por scripts/audit-suppressions.ts (tabela
 * hardcoded C1 + trava de 90d) e escrito em stryker.conf.json.
 *
 * Uso: npx tsx scripts/run-mutation.ts [--diff]
 *   --diff : muta so os arquivos do diff (catraca por PR, incremental)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { minimatch } from 'minimatch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GIT_BIN = process.env['GIT_BIN'] || '/usr/bin/git';
const TSX_BIN = resolve(ROOT, 'node_modules', '.bin', 'tsx');
const STRYKER_BIN = resolve(ROOT, 'node_modules', '.bin', 'stryker');
const STRYKER_PATH = resolve(ROOT, 'stryker.conf.json');

interface StrykerIgnoreConfig {
    ignorePatterns?: string[];
}

function strykerIgnorePatterns(): string[] {
    try {
        const cfg = JSON.parse(readFileSync(STRYKER_PATH, 'utf8')) as StrykerIgnoreConfig;
        return cfg.ignorePatterns ?? [];
    } catch (err) {
        throw new Error(
            `[run-mutation] falha ao ler ignorePatterns de ${STRYKER_PATH}: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
        );
    }
}

function readEventBaseHead(): { base: string; head: string } | null {
    const path = process.env['GITHUB_EVENT_PATH'];
    if (path && existsSync(path)) {
        try {
            const ev = JSON.parse(readFileSync(path, 'utf8')) as {
                pull_request?: { base?: { sha?: string }; head?: { sha?: string } };
                before?: string;
                after?: string;
            };
            const pr = ev.pull_request;
            const prBase = pr && pr.base && pr.base.sha;
            const prHead = pr && pr.head && pr.head.sha;
            if (prBase && prHead) {
                return { base: prBase, head: prHead };
            }
            if (ev.before && ev.after) return { base: ev.before, head: ev.after };
        } catch (err) {
            process.stderr.write(
                `[run-mutation] nao foi possivel ler GITHUB_EVENT_PATH (${String(err)}); usando fallback de ref.\n`,
            );
        }
    }
    const base = process.env['BASE_SHA'];
    const head = process.env['HEAD_SHA'];
    if (base && head) return { base, head };
    return null;
}

function diffFiles(): string[] {
    // Diferença real do evento: só o que o PR/push entregou, nunca o repo inteiro.
    const event = readEventBaseHead();
    let range: string;
    if (event) {
        range = `${event.base}...${event.head}`;
    } else if (process.env['GITHUB_EVENT_NAME'] === 'push') {
        range = 'HEAD~1...HEAD';
    } else {
        const base = process.env['GITHUB_BASE_REF'] || 'dev';
        range = `origin/${base}...HEAD`;
    }

    let out: string;
    try {
        out = execFileSync(GIT_BIN, ['diff', '--name-only', '--diff-filter=d', range], {
            cwd: ROOT,
            encoding: 'utf8',
        });
    } catch (err) {
        const e = err as { status?: number };
        throw new Error(
            `[run-mutation] git diff contra ${range} falhou (exit ${e.status ?? '?'}). ` +
                `Garanta que o ref base esta disponivel (fetch-depth: 0 no CI).`,
            { cause: err },
        );
    }
    const ignores = strykerIgnorePatterns();
    const files = out
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.endsWith('.ts') && !s.endsWith('.test.ts'))
        .filter((s) => !ignores.some((p) => minimatch(s, p, { dot: true })));

    // Guard (AGENTS §24): diff massivo indica base errada — mutar centenas de
    // arquivos travaria o Stryker (roda a suíte completa por mutante). Aborta
    // explicitamente em vez de produzir um run inviável/silenzioso.
    const MAX_DIFF_FILES = 50;
    if (files.length > MAX_DIFF_FILES) {
        process.stderr.write(
            `[run-mutation] AVISO: diff retornou ${files.length} arquivos (>${MAX_DIFF_FILES}). ` +
                `Base provavelmente incorreta. Abortando para evitar Stryker inviavel.\n`,
        );
        process.exit(1);
    }
    return files;
}

function main(): void {
    const args = process.argv.slice(2);
    const diffMode = args.includes('--diff');

    // Garante que o teto esta sincronizado com o contador de supressoes antes de rodar.
    try {
        execFileSync(TSX_BIN, [resolve(ROOT, 'scripts/audit-suppressions.ts')], {
            stdio: 'inherit',
            cwd: ROOT,
        });
    } catch {
        process.stderr.write(
            '[run-mutation] FATAL: audit-suppressions.ts falhou — teto invalido ou contorno detectado.\n',
        );
        process.exit(1);
    }

    if (!readFileSync(STRYKER_PATH, 'utf8').includes('break')) {
        process.stderr.write('[run-mutation] FATAL: stryker.conf.json sem thresholds.break.\n');
        process.exit(1);
    }

    const cmdArgs = ['run', STRYKER_PATH];
    if (diffMode) {
        const files = diffFiles();
        if (files.length === 0) {
            process.stderr.write('[run-mutation] nenhum arquivo .ts de producao no diff; pulando.\n');
            process.exit(0);
        }
        cmdArgs.push('--mutate', files.join(','));
    }

    process.stderr.write(`[run-mutation] Stryker ${diffMode ? '(incremental/diff)' : '(repo inteiro)'}\n`);
    try {
        execFileSync(STRYKER_BIN, cmdArgs, { stdio: 'inherit', cwd: ROOT });
        process.exit(0);
    } catch (err) {
        const e = err as { status?: number };
        process.stderr.write(`[run-mutation] FATAL: mutation score abaixo do teto (exit ${e.status ?? '?'}).\n`);
        process.exit(e.status ?? 1);
    }
}

main();
