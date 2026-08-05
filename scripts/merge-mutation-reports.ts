/**
 * merge-mutation-reports.ts — Agregador do gate de mutation testing (Estratégia B).
 *
 * Cada worker do CI (matrix de buckets) roda o Stryker em escopo próprio com
 * `--thresholds.break 0` (nunca falha sozinho) e publica
 * `reports/mutation/mutation-report-<bucket>.json`. Este script:
 *
 * 1. Lê todos os reports (paths passados como argumentos)
 * 2. Merge não-destrutivo dos `files` (buckets disjuntos por prefixo de
 *    diretório; colisão = erro, nunca override silencioso — Rule 25)
 * 3. Recalcula a métrica CANÔNICA do Stryker (`calculateMetrics` de
 *    mutation-testing-metrics — a MESMA usada no `determineExitCode` do
 *    Stryker core, versão pinada 3.7.3 = equivalência §10)
 * 4. Aplica o gate agregado `break: 60` no score COMBINADO (equivalência
 *    score-splitted vs score-único: totalDetected/totalValid são aditivos)
 * 5. Falha explicitamente em: score NaN (sem mutantes válidos), merge sem
 *    dados, colisão de arquivos, schemaVersion divergente (Rule 24/25)
 *
 * Uso: npx tsx scripts/merge-mutation-reports.ts --break 60 [--output path] <report1.json> [report2.json ...]
 * Exit code 0 = gate passou; 1 = gate reprovou; 2 = erro de execução.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { calculateMetrics } from 'mutation-testing-metrics';
import type { MutationTestResult } from 'mutation-testing-report-schema';

export interface GateDecision {
    passed: boolean;
    mutationScore: number;
    totalDetected: number;
    totalValid: number;
    killed: number;
    survived: number;
    noCoverage: number;
    reason: string;
}

export function mergeMutationReports(reports: MutationTestResult[]): MutationTestResult {
    const mergedFiles: MutationTestResult['files'] = {};
    let schemaVersion: string | undefined;

    for (const report of reports) {
        if (schemaVersion === undefined) {
            schemaVersion = report.schemaVersion;
        } else if (report.schemaVersion !== schemaVersion) {
            throw new Error(
                `Incompatible schema versions across reports: "${schemaVersion}" vs "${report.schemaVersion}"`,
            );
        }
        for (const [name, file] of Object.entries(report.files)) {
            if (mergedFiles[name] !== undefined) {
                throw new Error(`Duplicate file across reports (overlap would hide a defect): ${name}`);
            }
            mergedFiles[name] = file;
        }
    }

    return {
        schemaVersion: schemaVersion ?? '1.0',
        thresholds: reports[0]?.thresholds ?? ({ high: 80, low: 60, break: 60 } as MutationTestResult['thresholds']),
        files: mergedFiles,
    };
}

export function computeGateDecision(report: MutationTestResult, breakThreshold: number): GateDecision {
    const fileCount = Object.keys(report.files).length;
    if (fileCount === 0) {
        return {
            passed: false,
            mutationScore: Number.NaN,
            totalDetected: 0,
            totalValid: 0,
            killed: 0,
            survived: 0,
            noCoverage: 0,
            reason: 'No mutation data to gate: merged report contains no files (Rule 25 — no silent pass).',
        };
    }

    const metrics = calculateMetrics(report.files).metrics;
    const score = metrics.mutationScore;
    if (!Number.isFinite(score)) {
        return {
            passed: false,
            mutationScore: Number.NaN,
            totalDetected: metrics.totalDetected,
            totalValid: metrics.totalValid,
            killed: metrics.killed,
            survived: metrics.survived,
            noCoverage: metrics.noCoverage,
            reason: 'Mutation score is NaN (no valid mutants to score). Gate cannot pass on missing data (Rule 24/25).',
        };
    }

    const passed = score >= breakThreshold;
    return {
        passed,
        mutationScore: score,
        totalDetected: metrics.totalDetected,
        totalValid: metrics.totalValid,
        killed: metrics.killed,
        survived: metrics.survived,
        noCoverage: metrics.noCoverage,
        reason: passed
            ? `Mutation score ${score.toFixed(2)}% >= break ${breakThreshold}% (gate passed).`
            : `Mutation score ${score.toFixed(2)}% < break ${breakThreshold}% (gate FAILED).`,
    };
}

function parseArgs(argv: string[]): { breakThreshold: number; output: string | undefined; reports: string[] } {
    let breakThreshold = 60;
    let output: string | undefined;
    const reports: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === undefined) {
            break;
        }
        if (arg === '--break') {
            const value = Number(argv[index + 1]);
            if (!Number.isFinite(value) || value < 0) {
                throw new Error(`Invalid --break threshold: ${argv[index + 1]} (must be a finite number >= 0)`);
            }
            breakThreshold = value;
            index += 1;
            continue;
        }
        if (arg === '--output') {
            output = argv[index + 1];
            index += 1;
            continue;
        }
        reports.push(arg);
    }

    if (reports.length === 0) {
        throw new Error('No mutation report files provided.');
    }
    return { breakThreshold, output, reports };
}

function main(): void {
    const { breakThreshold, output, reports: reportPaths } = parseArgs(process.argv.slice(2));
    const reports = reportPaths.map((path) => {
        try {
            return JSON.parse(readFileSync(path, 'utf8')) as MutationTestResult;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read mutation report "${path}": ${message}`, { cause: error });
        }
    });

    const merged = mergeMutationReports(reports);
    const decision = computeGateDecision(merged, breakThreshold);

    if (output) {
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    }

    const scoreText = Number.isFinite(decision.mutationScore) ? `${decision.mutationScore.toFixed(2)}%` : 'NaN';
    const summary =
        `Mutation gate (${reports.length} bucket report(s)): ` +
        `score=${scoreText} ` +
        `killed=${decision.killed} survived=${decision.survived} noCoverage=${decision.noCoverage} ` +
        `detected=${decision.totalDetected}/${decision.totalValid} valid. ${decision.reason}`;

    if (decision.passed) {
        process.stdout.write(`${summary}\n`);
        process.exit(0);
    }
    process.stderr.write(`FAIL: ${summary}\n`);
    process.exit(1);
}

const isMainImport = process.argv[1]?.replace(/\\/g, '/').endsWith('/merge-mutation-reports.ts');
if (isMainImport) {
    try {
        main();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`ERROR: ${message}\n`);
        process.exit(2);
    }
}
