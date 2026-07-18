/**
 * run-semgrep.ts — Executa Semgrep com as regras do repo (Camada B do plano de
 * enforcement de tratamento de erro). Usa a versão fixa em .semgrep/version.
 *
 * O Semgrep nao e distribuido via npm; a versao e fixada em .semgrep/version e
 * instalada no CI via `pip install semgrep==<versao>`. Tanto no CI quanto local
 * o binario `semgrep` fica no PATH do ambiente Python ativo (setup-python no CI,
 * ~/.local/bin/semgrep local). Sobrescreva o caminho via SEMGREP_BIN se preciso.
 *
 * `python -m semgrep` foi descontinuado no Semgrep 1.38.0 — invocamos `semgrep`.
 *
 * Uso: npx tsx scripts/run-semgrep.ts [--diff] [--json]
 *   --diff : roda so nos arquivos do diff (basis: git) — catraca por PR
 *   --json : saida JSON (para o CI consumir)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_PATH = resolve(ROOT, '.semgrep/version');
const RULES_PATH = resolve(ROOT, '.semgrep/suppression.yaml');

/** Exit codes do Semgrep: 0=limpo, 1=achados (supressoes), >=2=erro do tool. */
const SEMGREP_EXIT_FINDINGS = 1;

/** Resolve o binario `semgrep`. Prioridade: SEMGREP_BIN > diretorios do PATH.
 *  Nao usa `python -m semgrep` (descontinuado em 1.38.0). Falha explicita se
 *  nao encontrar — nunca mascara ausencia do tool como "sem achados". */
function resolveSemgrepBin(env: NodeJS.ProcessEnv = process.env): string {
    const override = env['SEMGREP_BIN'];
    if (override) {
        if (!existsSync(override)) {
            throw new Error(`[run-semgrep] SEMGREP_BIN aponta para caminho inexistente: ${override}`);
        }
        return override;
    }
    const pathEnv = env['PATH'] ?? '';
    for (const dir of pathEnv.split(':').filter(Boolean)) {
        const candidate = join(dir, 'semgrep');
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(
        '[run-semgrep] binario `semgrep` nao encontrado no PATH. ' +
            'Instale com `pip install semgrep==<versao>` ou defina SEMGREP_BIN.',
    );
}

function getSemgrepVersion(versionPath: string = VERSION_PATH): string {
    try {
        return readFileSync(versionPath, 'utf8').trim();
    } catch {
        return 'unknown';
    }
}

/** Constroi os argumentos do `semgrep scan` (puro). */
function buildSemgrepArgs(opts: { diffMode: boolean; jsonMode: boolean }): string[] {
    const cmdArgs = ['scan', '--config', RULES_PATH, '--error', '--severity', 'ERROR'];
    if (opts.jsonMode) cmdArgs.push('--json');
    if (opts.diffMode) {
        // Semgrep 1.168.0 removed the standalone `--diff` flag; diff scanning is
        // triggered by `--baseline-commit <ref>` against the working tree.
        cmdArgs.push('--baseline-commit', 'origin/dev');
    } else {
        // Scan do repo inteiro: exclui testes (catraca por diff cobre testes novos/modificados).
        cmdArgs.push(ROOT, '--exclude', '*.test.ts');
    }
    return cmdArgs;
}

interface ExitDecision {
    exitCode: number;
    message: string;
}

/**
 * Distingue (§25) "achou supressoes" (exit 1) de "erro do proprio tool" (>=2 ou
 * indefinido). Decisao pura: nunca mascara ausencia/crash do tool como scan limpo.
 */
function classifySemgrepExit(status: number | undefined): ExitDecision {
    if (status === SEMGREP_EXIT_FINDINGS) {
        return {
            exitCode: SEMGREP_EXIT_FINDINGS,
            message: '[run-semgrep] FATAL: Semgrep encontrou supressoes (exit 1). Corrija a causa raiz.\n',
        };
    }
    return {
        exitCode: status ?? 2,
        message:
            `[run-semgrep] FATAL: Semgrep falhou ao executar (exit ${status ?? '?'}) — NAO e resultado de scan. ` +
            'Verifique instalacao do tool, regras e baseline.\n',
    };
}

function main(): void {
    const args = process.argv.slice(2);
    const diffMode = args.includes('--diff');
    const jsonMode = args.includes('--json');
    const fixedVersion = getSemgrepVersion();

    const cmd = resolveSemgrepBin();
    const cmdArgs = buildSemgrepArgs({ diffMode, jsonMode });

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
        const decision = classifySemgrepExit(e.status);
        process.stderr.write(decision.message);
        process.exit(decision.exitCode);
    }
}

export { resolveSemgrepBin, getSemgrepVersion, buildSemgrepArgs, classifySemgrepExit, ROOT, RULES_PATH };
export type { ExitDecision };

if (!process.env['VITEST'] && process.argv[1]?.includes('run-semgrep')) {
    main();
}
