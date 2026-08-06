/**
 * stryker.config.mjs — Config canônica do Stryker (Estratégia B).
 *
 * Fonte única de config de mutation testing (substitui stryker.conf.json).
 * Formato `.mjs` é obrigatório porque `thresholds.break` NÃO é opção de CLI do
 * Stryker (só config file) e JSON não lê environment — o ConfigReader importa
 * `.mjs` dinamicamente (config-reader.js importModule), permitindo config
 * env-driven por job sem duplicação de config (Rule 6).
 *
 * Workers do CI (matrix de buckets) rodam com `STRYKER_BREAK=0` (nunca falham
 * sozinhos) e `STRYKER_REPORT_FILE=reports/mutation/mutation-report-<bucket>.json`;
 * o gate agregado real (`scripts/merge-mutation-reports.ts --break 60`) aplica o
 * limite no score combinado, recalculado com calculateMetrics (equivalência §10).
 *
 * Env vars:
 *   STRYKER_ACTIVE       'true'  → vitest.config.ts desativa vitest-affected (determinismo)
 *   STRYKER_BREAK        default 60  → gate individual do job (CI workers: 0)
 *   STRYKER_REPORT_FILE  default reports/mutation/mutation-report.json
 */

const rawBreak = process.env.STRYKER_BREAK ?? '60';
const breakValue = Number(rawBreak);
if (!Number.isFinite(breakValue) || breakValue < 0) {
    throw new Error(`Invalid STRYKER_BREAK "${rawBreak}": must be a finite number >= 0 (Rule 24 — no silent default).`);
}

export default {
    $schema: 'https://stryker-mutator.io/schema/stryker-schema.json',
    testRunner: 'vitest',
    coverageAnalysis: 'perTest',
    mutate: ['shared/', 'jira_management/', 'git_triggers/'],
    thresholds: { high: 80, low: 60, break: breakValue },
    reporters: ['json', 'clear-text'],
    jsonReporter: { fileName: process.env.STRYKER_REPORT_FILE ?? 'reports/mutation/mutation-report.json' },
    incremental: false,
    concurrency: 4,
    timeoutMS: 600000,
    dryRunTimeoutMinutes: 30,
    vitest: { related: false, configFile: 'vitest.config.ts' },
    tsconfigFile: 'tsconfig.json',
    disableTypeChecks: false,
    checkers: ['typescript'],
    appendPlugins: ['@stryker-mutator/typescript-checker'],
    typescriptChecker: { prioritizePerformanceOverAccuracy: false },
    ignorePatterns: [
        'scripts/quality-check.ts',
        'scripts/validation-hook.ts',
        'scripts/audit-mock-boundaries.ts',
        'scripts/__tests__/quality-check.test.ts',
        'scripts/__tests__/validation-hook*.test.ts',
    ],
};
