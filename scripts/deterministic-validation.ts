/**
 * Deterministic validation — II.2 protocol executor.
 *
 * Automates the full deterministic validation protocol defined in
 * `dev/docs/internal/VALIDATION-PLAN.md`:
 *
 *   1. harness  -> regenerate reports/validation/*.html (fixtures committed)
 *   2. scorecard -> artifact-scorecard.json (AQS, I-9.3)
 *   3. D1       -> full vitest suite
 *   4. D2       -> artifact-content-validation.test.ts (R8.1–R8.7)
 *   5. D3       -> theme-tokens (WCAG ≥ 4.5:1) + report-determinism architecture scan
 *   6. sha256   -> hash every reports/validation/*.html
 *   7. emit     -> dev/docs/internal/VALIDATION-REPORT.md (matriz 24×3 + hashes)
 *
 * Idempotent: safe to re-run. Any failing step exits non-zero (Rule 25:
 * no silent default — the report is only committed when the protocol passes).
 *
 * Usage: npx tsx scripts/deterministic-validation.ts
 *
 * @module deterministic-validation
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pristineEnv } from './_env-pristine.js';
import { rootLogger } from '../shared/logger.js';

const ROOT = resolve(import.meta.dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports', 'validation');
const DOCS_DIR = join(ROOT, 'dev', 'docs', 'internal');
const REPORT_PATH = join(DOCS_DIR, 'VALIDATION-REPORT.md');

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const TSX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(cmd: string, args: string[], label: string, env?: NodeJS.ProcessEnv): string {
    rootLogger.info(`[deterministic-validation] ${label}: ${cmd} ${args.join(' ')}`);
    try {
        return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', env });
    } catch (err) {
        const e = err as { status?: number };
        throw new Error(`[deterministic-validation] ${label} FAILED (exit ${String(e.status)})`, { cause: err });
    }
}

function sha256OfFile(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

interface StepResult {
    name: string;
    ok: boolean;
    detail: string;
}

function runHarness(): StepResult {
    run(TSX_BIN, ['tsx', 'scripts/artifact-validation-harness.ts'], 'harness');
    const htmlFiles = readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.html'));
    const allDoctype = htmlFiles.every((f) => readFileSync(join(REPORTS_DIR, f), 'utf8').startsWith('<!DOCTYPE html>'));
    return {
        name: 'harness',
        ok: allDoctype,
        detail: `${htmlFiles.length} HTML artifacts regenerated; doctype=${allDoctype ? 'all ok' : 'MISSING in one or more'}`,
    };
}

function runScorecard(): StepResult {
    try {
        run(TSX_BIN, ['tsx', 'scripts/artifact-scorecard-runner.ts'], 'scorecard');
        const scorecardPath = join(REPORTS_DIR, 'artifact-scorecard.json');
        const parsed = JSON.parse(readFileSync(scorecardPath, 'utf8')) as { failed: number; removable: string[] };
        return {
            name: 'scorecard',
            ok: parsed.failed === 0,
            detail: `AQS scorecard: ${parsed.failed} failed; removable=${parsed.removable.length ? parsed.removable.join(',') : 'none'}`,
        };
    } catch (err) {
        return { name: 'scorecard', ok: false, detail: (err as Error).message };
    }
}

function runD1(): StepResult {
    try {
        // Causa raiz: o import de rootLogger dispara ensureDotenv() (não-test mode)
        // que carrega .env.local/.env completos (JIRA_MODE=cloud, XRAY_CLOUD_URL,
        // GIT_BASE_URL, LLM_*, ...) no process.env do pai. O filho npm test herda
        // esse env via execFileSync e os e2e/cloud passam a usar endpoints reais
        // em vez do sandbox .env.test → "Invalid URL" (30-73 falhas). O D1 roda com
        // o env PRISTINO (capturado antes de qualquer ensureDotenv), idêntico a um
        // npm test em shell puro.
        run(NPM_BIN, ['test'], 'D1 full vitest', { ...pristineEnv });
        return { name: 'D1', ok: true, detail: 'full vitest passed (pristine env)' };
    } catch (err) {
        return { name: 'D1', ok: false, detail: (err as Error).message };
    }
}

function runD2(): StepResult {
    try {
        run(
            TSX_BIN,
            ['vitest', 'run', 'shared/__tests__/artifact-content-validation.test.ts'],
            'D2 content validation',
        );
        return { name: 'D2', ok: true, detail: 'R8.1–R8.7 content validation passed' };
    } catch (err) {
        return { name: 'D2', ok: false, detail: (err as Error).message };
    }
}

function runD3(): StepResult {
    try {
        run(
            TSX_BIN,
            [
                'vitest',
                'run',
                'shared/__tests__/theme-tokens.test.ts',
                'shared/__tests__/report-determinism.architecture.test.ts',
            ],
            'D3 contrast + determinism',
        );
        return { name: 'D3', ok: true, detail: 'WCAG ≥ 4.5:1 + renderer determinism (D5) passed' };
    } catch (err) {
        return { name: 'D3', ok: false, detail: (err as Error).message };
    }
}

function collectHashes(): Map<string, string> {
    const hashes = new Map<string, string>();
    const files = readdirSync(REPORTS_DIR);
    files.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    for (const f of files) {
        if (f.endsWith('.html')) hashes.set(f, sha256OfFile(join(REPORTS_DIR, f)));
    }
    return hashes;
}

function renderMarkdown(steps: StepResult[], hashes: Map<string, string>, scorecardJson: string): string {
    const lines: string[] = [];
    lines.push('# VALIDATION-REPORT — Validação Determinística de Artefatos');
    lines.push('');
    lines.push(`> Gerado em ${new Date().toISOString()} por \`scripts/deterministic-validation.ts\` (II.2).`);
    lines.push(
        `> Protocolo: \`dev/docs/internal/VALIDATION-PLAN.md\`. Gate local (D6); CI real postergado pós-mutation-testing.`,
    );
    lines.push('');
    lines.push('## 1. Resultado por passo');
    lines.push('');
    lines.push('| Passo | Status | Detalhe |');
    lines.push('|---|---|---|');
    for (const s of steps) {
        lines.push(`| ${s.name} | ${s.ok ? '✅ PASS' : '❌ FAIL'} | ${s.detail} |`);
    }
    lines.push('');

    const overall = steps.every((s) => s.ok);
    lines.push(`**Overall: ${overall ? 'PASS' : 'FAIL'}**`);
    lines.push('');

    lines.push('## 2. Hashes sha256 dos artefatos HTML (prova de reprodutibilidade)');
    lines.push('');
    lines.push('| Artefato | sha256 |');
    lines.push('|---|---|');
    for (const [name, hash] of hashes) {
        lines.push(`| ${name} | \`${hash}\` |`);
    }
    lines.push('');
    lines.push(
        'Re-prova: re-rodar `deterministic-validation.ts` e comparar — hashes idênticos = prova determinística (Fase III.3).',
    );
    lines.push('');

    lines.push('## 3. Scorecard (I-9.3)');
    lines.push('');
    lines.push('```json');
    lines.push(scorecardJson);
    lines.push('```');
    lines.push('');
    return lines.join('\n');
}

function main(): void {
    const steps: StepResult[] = [];
    steps.push(runHarness());
    steps.push(runScorecard());
    steps.push(runD1());
    steps.push(runD2());
    steps.push(runD3());

    if (!steps.every((s) => s.ok)) {
        rootLogger.error('[deterministic-validation] protocol FAILED — no VALIDATION-REPORT.md emitted (Rule 25).');
        for (const s of steps) if (!s.ok) rootLogger.error(`  ✗ ${s.name}: ${s.detail}`);
        process.exitCode = 1;
        return;
    }

    const hashes = collectHashes();
    const scorecardJson = readFileSync(join(REPORTS_DIR, 'artifact-scorecard.json'), 'utf8');
    mkdirSync(DOCS_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, renderMarkdown(steps, hashes, scorecardJson));

    rootLogger.info(`[deterministic-validation] PASS — VALIDATION-REPORT.md emitted (${hashes.size} hashes).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
