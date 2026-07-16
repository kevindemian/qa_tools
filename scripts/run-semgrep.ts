/**
 * run-semgrep.ts — Executa Semgrep com as regras do repo (Camada B do plano de
 * enforcement de tratamento de erro). Usa a versão fixa em .semgrep/version.
 *
 * O Semgrep nao e distribuido via npm; a versao e fixada em .semgrep/version e
 * instalada no CI via `pip install semgrep==<versao>`. Localmente espera-se
 * `semgrep` no PATH (ex.: ~/.local/bin/semgrep).
 *
 * Uso: npx tsx scripts/run-semgrep.ts [--diff] [--json]
 *   --diff : roda so nos arquivos do diff (basis: git) — catraca por PR
 *   --json : saida JSON (para o CI consumir)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON3_BIN = '/usr/bin/python3';
const VERSION_PATH = resolve(ROOT, '.semgrep/version');
const RULES_PATH = resolve(ROOT, '.semgrep/suppression.yaml');

function getSemgrepVersion(): string {
    try {
        return readFileSync(VERSION_PATH, 'utf8').trim();
    } catch {
        return 'unknown';
    }
}

function main(): void {
    const args = process.argv.slice(2);
    const diffMode = args.includes('--diff');
    const jsonMode = args.includes('--json');
    const fixedVersion = getSemgrepVersion();

    const cmd = PYTHON3_BIN;
    const cmdArgs = ['-m', 'semgrep', 'scan', '--config', RULES_PATH, '--error', '--severity', 'ERROR'];
    if (jsonMode) cmdArgs.push('--json');
    if (diffMode) {
        cmdArgs.push('--baseline-commit', 'origin/dev', '--diff');
    } else {
        // Scan do repo inteiro: exclui testes (catraca por diff cobre testes novos/modificados).
        cmdArgs.push(ROOT, '--exclude', '*.test.ts');
    }

    process.stderr.write(`[run-semgrep] Semgrep fixo no repo: ${fixedVersion}\n`);
    process.stderr.write(`[run-semgrep] regras: ${RULES_PATH}\n`);
    process.stderr.write(`[run-semgrep] modo: ${diffMode ? 'diff (PR)' : 'repo inteiro'}\n`);

    try {
        const out = execFileSync(cmd, cmdArgs, {
            encoding: 'utf8',
            maxBuffer: 1 << 28,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        process.stdout.write(out);
        process.stderr.write('[run-semgrep] OK — nenhuma supressao semantica detectada.\n');
        process.exit(0);
    } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        if (typeof e.stdout === 'string') process.stdout.write(e.stdout);
        if (typeof e.stderr === 'string') process.stderr.write(e.stderr);
        process.stderr.write(
            `[run-semgrep] FATAL: Semgrep encontrou supressoes (exit ${e.status ?? '?'}). Corrija a causa raiz.\n`,
        );
        process.exit(e.status ?? 1);
    }
}

main();
