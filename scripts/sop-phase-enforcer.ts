#!/usr/bin/env tsx
/**
 * sop-phase-enforcer.ts — SOP Phase Enforcement Gate
 *
 * Uso:
 *   npx tsx scripts/sop-phase-enforcer.ts status --feature FT-xx
 *   npx tsx scripts/sop-phase-enforcer.ts pre <phase> --feature FT-xx
 *   npx tsx scripts/sop-phase-enforcer.ts post <phase> --feature FT-xx [--test-pattern glob]
 *
 * Exit codes:
 *   0 — valido
 *   1 — falha de validacao
 *   2 — erro de uso
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PROGRESS_FILE = 'FUNCTIONAL-AUDIT-PROGRESS.md';

const PHASES = [
    { id: '0', label: 'Preparacao' },
    { id: '0.1', label: 'Deep Read & Pre-scan' },
    { id: '1', label: 'File Mapping' },
    { id: '2', label: 'T1-T20 Audit' },
    { id: '3', label: 'D1-D7 Audit' },
    { id: '4', label: 'Gap Registry' },
    { id: '4.5', label: 'Consistency Check' },
    { id: '5', label: 'RED Tests' },
    { id: '6', label: 'GREEN Fixes' },
    { id: '7', label: 'Integration' },
    { id: '8', label: 'Refactoring' },
    { id: '8.5', label: 'Self-review' },
    { id: '9', label: 'Final Validation' },
    { id: '10', label: 'Progress Update' },
    { id: '11', label: 'Quality Gate' },
] as const;

const CHECKPOINT_MARKERS: Record<string, string> = {
    '0': 'Phase 0 complete',
    '0.1': 'Phase 0.1 complete',
    '1': 'Phase 1 complete',
    '2': 'Phase 2 complete',
    '3': 'Phase 3 complete',
    '4': 'Phase 4 complete',
    '4.5': 'Phase 4.5 complete',
    '5': 'Phase 5 complete',
    '6': 'Phase 6 complete',
    '7': 'Phase 7 complete',
    '8': 'Phase 8 complete',
    '8.5': 'Phase 8.5 complete',
    '9': 'Phase 9 complete',
    '10': 'Phase 10 complete',
    '11': 'Phase 11 complete',
};

interface CliArgs {
    mode: 'status' | 'pre' | 'post';
    phaseArg: string | null;
    feature: string;
    testPattern: string | null;
}

function err(msg: string): void {
    process.stderr.write('[SOP-ENFORCER] ❌ ' + msg + '\n');
}
function ok(msg: string): void {
    process.stdout.write('[SOP-ENFORCER] ✅ ' + msg + '\n');
}
function info(msg: string): void {
    process.stdout.write('[SOP-ENFORCER] ℹ️  ' + msg + '\n');
}
function warn(msg: string): void {
    process.stdout.write('[SOP-ENFORCER] ⚠️  ' + msg + '\n');
}

function getArg(arr: string[], i: number): string {
    const v = arr[i];
    if (v === undefined) process.exit(2);
    return v;
}

function readProgress(): string {
    try {
        return readFileSync(PROGRESS_FILE, 'utf-8');
    } catch {
        err('Nao foi possivel ler ' + PROGRESS_FILE);
        process.exit(1);
    }
}

function checkpointMarker(phaseId: string, feature: string): string {
    const m = CHECKPOINT_MARKERS[phaseId];
    if (m === undefined) process.exit(2);
    return '<!-- CHECKPOINT: ' + m + ' for ' + feature + ' -->';
}

function findCheckpoints(text: string, feature: string): string[] {
    return PHASES.filter((p) => {
        const m = CHECKPOINT_MARKERS[p.id];
        return m !== undefined && text.includes('<!-- CHECKPOINT: ' + m + ' for ' + feature + ' -->');
    }).map((p) => p.id);
}

function getPhaseById(id: string) {
    const p = PHASES.find((x) => x.id === id);
    if (p === undefined) {
        err('Fase desconhecida: "' + id + '". Valores: ' + PHASES.map((x) => x.id).join(', '));
        process.exit(1);
    }
    return p;
}

/* ────────── CLI parsing ────────── */

function parseCli(argv: string[]): CliArgs {
    let feature = '';
    let testPattern: string | null = null;
    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const a = getArg(argv, i);
        if (a === '--feature' && i + 1 < argv.length) {
            feature = getArg(argv, ++i);
        } else if (a === '--test-pattern' && i + 1 < argv.length) {
            testPattern = getArg(argv, ++i);
        } else if (a.startsWith('--')) {
            err('Flag desconhecida: ' + a);
            process.exit(2);
        } else {
            positional.push(a);
        }
    }

    if (positional.length === 0) {
        err('Modo obrigatorio: status | pre <phase> | post <phase>');
        process.exit(2);
    }

    const mode = positional[0] as CliArgs['mode'];
    if (!['status', 'pre', 'post'].includes(mode)) {
        err('Modo invalido: "' + mode + '". Use: status, pre, post');
        process.exit(2);
    }

    if ((mode === 'pre' || mode === 'post') && positional.length < 2) {
        err('Modo "' + mode + '" requer numero da fase');
        process.exit(2);
    }

    const phaseArg = mode === 'pre' || mode === 'post' ? getArg(positional, 1) : null;

    if (feature.length === 0) {
        err('--feature FT-xx e obrigatorio');
        process.exit(2);
    }

    return { mode, phaseArg, feature, testPattern };
}

/* ────────── Verificacoes ────────── */

function verifyGitClean(): boolean {
    try {
        const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf-8', timeout: 30_000 }).trim();
        if (status.length !== 0) {
            warn('Working directory has uncommitted changes:\n' + status);
        }
        return true;
    } catch {
        warn('Nao foi possivel verificar git status');
        return true;
    }
}

function verifyTsc(): boolean {
    info('Rodando tsc --noEmit...');
    try {
        execFileSync('npx', ['tsc', '--noEmit'], { encoding: 'utf-8', timeout: 120_000, stdio: 'pipe' });
        return true;
    } catch {
        process.stderr.write('  L-- TSC FALHOU\n');
        return false;
    }
}

function verifyTests(testPattern: string | null): boolean {
    const args = testPattern !== null ? ['run', '--', testPattern] : ['run'];
    info('Rodando vitest run' + (testPattern !== null ? ' -- ' + testPattern : '') + '...');
    try {
        execFileSync('npx', ['vitest', ...args], { encoding: 'utf-8', timeout: 180_000, stdio: 'pipe' });
        return true;
    } catch (e) {
        process.stderr.write('  L-- TESTES FALHARAM\n');
        const ex = e as { stdout?: string; stderr?: string };
        const output = (ex.stdout ?? '') + '\n' + (ex.stderr ?? '');
        const lines = output
            .split('\n')
            .filter((l) => /FAIL|×/.test(l))
            .slice(-20);
        if (lines.length > 0) process.stderr.write('  L-- Falhas:\n' + lines.join('\n') + '\n');
        return false;
    }
}

/* ────────── Modes ────────── */

function modeStatus(feature: string): void {
    const text = readProgress();
    const completed = new Set(findCheckpoints(text, feature));

    process.stdout.write('[SOP-ENFORCER] ====== Status -- ' + feature + ' ======\n');
    for (const p of PHASES) {
        const done = completed.has(p.id);
        process.stdout.write(
            '  ' + (done ? '✅' : '🔜') + ' Phase ' + p.id + ': ' + p.label + (done ? '' : ' (pending)') + '\n',
        );
    }

    const next = PHASES.find((p) => !completed.has(p.id));
    if (next !== undefined) {
        process.stdout.write('\nProxima: Phase ' + next.id + ' -- ' + next.label + '\n');
        process.stdout.write('Checkpoint: ' + checkpointMarker(next.id, feature) + '\n');
    } else {
        process.stdout.write('\n' + feature + ' -- TODAS AS FASES CONCLUIDAS\n');
    }
}

function modePre(phaseId: string, feature: string): void {
    const phase = getPhaseById(phaseId);
    const text = readProgress();
    const completed = new Set(findCheckpoints(text, feature));
    const index = PHASES.indexOf(phase);

    info('Validando pre-condicoes para Phase ' + phaseId + ' ("' + phase.label + '") -- ' + feature);

    if (index > 0) {
        const prevPhase = PHASES[index - 1];
        if (prevPhase === undefined || !completed.has(prevPhase.id)) {
            const prevId = prevPhase?.id ?? '?';
            const prevLabel = prevPhase?.label ?? '?';
            err('Phase ' + prevId + ' ("' + prevLabel + '") nao checkpointada');
            process.exit(1);
        }
        ok('Checkpoint anterior (Phase ' + prevPhase.id + ') presente');
    }

    ok('Pre-condicoes OK -- pode executar Phase ' + phaseId + ' ("' + phase.label + '")');
    info('Apos concluir, escreva o checkpoint e execute post ' + phaseId);
}

function modePost(phaseId: string, feature: string, testPattern: string | null): void {
    const phase = getPhaseById(phaseId);
    const text = readProgress();
    const marker = checkpointMarker(phaseId, feature);

    process.stdout.write(
        '[SOP-ENFORCER] === Pos-verificacao Phase ' + phaseId + ' ("' + phase.label + '") -- ' + feature + ' ===\n',
    );

    info('Verificando checkpoint...');
    if (!text.includes(marker)) {
        err('Checkpoint nao encontrado:\n  Esperado: ' + marker);
        process.exit(1);
    }
    ok('Checkpoint presente');

    info('Verificando diff...');
    verifyGitClean();

    const tscOk = verifyTsc();
    if (!tscOk) {
        err('TSC falhou');
        process.exit(1);
    }

    const testOk = verifyTests(testPattern);
    if (!testOk) {
        err('Testes falharam');
        process.exit(1);
    }

    ok('Phase ' + phaseId + ' ("' + phase.label + '") -- POS-VERIFICACAO APROVADA');
}

function main(): void {
    const args = parseCli(process.argv.slice(2));

    switch (args.mode) {
        case 'status':
            modeStatus(args.feature);
            break;
        case 'pre':
            modePre(args.phaseArg as string, args.feature);
            break;
        case 'post':
            modePost(args.phaseArg as string, args.feature, args.testPattern);
            break;
    }
}

main();
