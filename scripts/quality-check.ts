#!/usr/bin/env tsx
/**
 * quality-check.ts — Consolidated quality gate
 *
 * Replaces: eslint CLI + check-unused-exports.sh + check-handlers + enforce-quality.ts
 * Single process, single AST parse, single heap. Try/catch everywhere.
 *
 * ## Exit codes
 * - 0: todas as verificações passam
 * - 1: alguma verificação falhou
 */

import path from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execFile } from 'node:child_process';
import { isBuiltin } from 'module';
import { globSync } from '../shared/deps.js';
import { gracefulExit } from '../shared/ui/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
    file: string;
    line: number;
    content: string;
}

interface CheckResult {
    name: string;
    passed: boolean;
    violations: Violation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function grepLines(file: string, pattern: RegExp): Array<{ line: number; content: string }> {
    const results: Array<{ line: number; content: string }> = [];
    try {
        const content = readFileSync(path.resolve(file), 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (pattern.test(line)) {
                results.push({ line: i + 1, content: line.trim() });
            }
        });
    } catch (err) {
        rootLogger.warn('quality-check: skip unreadable file: ' + String(err));
    }
    return results;
}

function allTsFiles(): string[] {
    // Normalize to forward slashes so path filters (startsWith('scripts/'),
    // f !== 'scripts/quality-check.test.ts') work on Windows too, where
    // globSync returns backslash-separated paths. Without this, the intended
    // exclusions silently fail and the script scans its own source/fixtures.
    return globSync('**/*.ts', { ignore: ['node_modules/**'] }).map((f) => f.replace(/\\/g, '/'));
}

export function checkNoPattern(
    name: string,
    pattern: RegExp,
    files: string[],
    excludePattern?: RegExp | ((line: string) => boolean),
): CheckResult {
    const violations: Violation[] = [];
    for (const file of files) {
        const matches = grepLines(file, pattern);
        for (const m of matches) {
            if (excludePattern) {
                const excluded =
                    typeof excludePattern === 'function' ? excludePattern(m.content) : excludePattern.test(m.content);
                if (excluded) continue;
            }
            violations.push({ file, ...m });
        }
    }
    return { name, passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface LintMessage {
    line: number;
    severity: number;
    message: string;
    ruleId: string | null;
}

interface LintResult {
    filePath: string;
    messages: LintMessage[];
}

function parseLintMessage(raw: unknown): LintMessage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    const line = m['line'];
    const severity = m['severity'];
    const message = m['message'];
    if (typeof line !== 'number' || typeof severity !== 'number' || typeof message !== 'string') return null;
    const ruleId = m['ruleId'];
    return {
        line,
        severity,
        message,
        ruleId: typeof ruleId === 'string' ? ruleId : null,
    };
}

function parseLintResult(raw: unknown): LintResult | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const filePath = r['filePath'];
    const messagesRaw = r['messages'];
    if (typeof filePath !== 'string' || !Array.isArray(messagesRaw)) return null;
    const messages: LintMessage[] = [];
    for (const msg of messagesRaw) {
        const parsed = parseLintMessage(msg);
        if (parsed) messages.push(parsed);
    }
    return { filePath, messages };
}

function parseLintResults(out: string): LintResult[] {
    const parsed: unknown = JSON.parse(out);
    if (!Array.isArray(parsed)) return [];
    const results: LintResult[] = [];
    for (const item of parsed) {
        const result = parseLintResult(item);
        if (result) results.push(result);
    }
    return results;
}

function processLintResults(out: string, violations: Violation[]): number {
    let warningCount = 0;
    try {
        const results = parseLintResults(out);
        for (const result of results) {
            for (const msg of result.messages) {
                if (msg.severity === 2) {
                    violations.push({
                        file: result.filePath,
                        line: msg.line,
                        content: `${msg.message} (${msg.ruleId})`,
                    });
                } else if (msg.severity === 1) {
                    warningCount++;
                }
            }
        }
    } catch (parseErr) {
        violations.push({ file: 'eslint-output', line: 1, content: `ESLint: invalid JSON: ${String(parseErr)}` });
    }
    return warningCount;
}

const ESLINT_SOURCE_DIRS = [
    'scripts/',
    'shared/validation/',
    'shared/ui/',
    'shared/types/',
    'shared/quality/',
    'shared/report/',
    'shared/data-hub/',
    'shared/ci/',
    'shared/infra/',
    'shared/invariants/',
    'shared/jira/',
    'shared/llm/',
    'shared/primitives/',
    'shared/prompts/',
    'shared/test-utils/',
    'git_triggers/',
    'jira_management/',
    'e2e/',
];

function runEslintBatchAsync(dirs: string[]): Promise<{ out: string | null; error: string | null }> {
    const eslintBin = path.resolve('node_modules/eslint/bin/eslint.js');
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [eslintBin, '--no-cache', '--format', 'json', ...dirs],
            { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000, cwd: process.cwd() },
            (err, stdout) => {
                if (err && !stdout) {
                    resolve({ out: null, error: err.message });
                } else {
                    resolve({ out: stdout || null, error: null });
                }
            },
        );
    });
}

export async function checkEslintBaseline(): Promise<{ result: CheckResult; warningCount: number }> {
    const violations: Violation[] = [];
    let warningCount = 0;

    const mid = Math.ceil(ESLINT_SOURCE_DIRS.length / 2);
    const batch1 = ESLINT_SOURCE_DIRS.slice(0, mid);
    const batch2 = ESLINT_SOURCE_DIRS.slice(mid);

    const [batch1Result, batch2Result] = await Promise.all([runEslintBatchAsync(batch1), runEslintBatchAsync(batch2)]);

    for (const { out, error } of [batch1Result, batch2Result]) {
        if (error) {
            violations.push({ file: 'eslint-batch', line: 1, content: `ESLint: ${error}` });
        } else if (out) {
            warningCount += processLintResults(out, violations);
        }
    }

    return {
        result: { name: 'eslint (zero violations)', passed: violations.length === 0, violations },
        warningCount,
    };
}

function parseRegisteredHandlers(indexSource: string): Set<string> {
    const registered = new Set<string>();
    for (const m of indexSource.matchAll(/'(\d+|d)'\s*:\s*\{/g)) {
        registered.add(m[1] ?? '');
    }
    for (const m of indexSource.matchAll(/(?:\b)(d)\s*:\s*\{/g)) {
        registered.add(m[1] ?? '');
    }
    return registered;
}

function parseMenuData(menuSource: string): {
    menuIds: Set<string>;
    aliasTargets: Set<string>;
    categoryIds: Set<string>;
} {
    const menuIds = new Set<string>();
    for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'/g)) {
        menuIds.add(m[1] ?? '');
    }

    const aliasTargets = new Set<string>();
    for (const m of menuSource.matchAll(/['"]([\w-]+)['"]:\s*['"]([\w/]+)['"]/g)) {
        if (m[2]) aliasTargets.add(m[2]);
    }

    const categoryIds = new Set<string>();
    for (const m of menuSource.matchAll(/['"](reports|tests|bugreport|analytics|releases|config)['"]/g)) {
        categoryIds.add(m[1] ?? '');
    }

    return { menuIds, aliasTargets, categoryIds };
}

function checkRegisteredWithoutMenu(
    registered: Set<string>,
    menuIds: Set<string>,
    aliasTargets: Set<string>,
    categoryIds: Set<string>,
): Violation[] {
    const violations: Violation[] = [];
    const allowedExceptions = new Set(['0', 'docs', '/menu', '/help']);
    for (const id of registered) {
        if (!menuIds.has(id) && !aliasTargets.has(id) && !categoryIds.has(id) && !allowedExceptions.has(id)) {
            violations.push({
                file: 'jira_management/commands/index.ts',
                line: 1,
                content: `Handler '${id}' registered but has no SUB_MENUS entry or ALIAS`,
            });
        }
    }
    return violations;
}

function checkMenuWithoutHandler(registered: Set<string>, menuIds: Set<string>): Violation[] {
    const violations: Violation[] = [];
    for (const id of menuIds) {
        if (id === '0') continue;
        if (!registered.has(id)) {
            violations.push({
                file: 'jira_management/menu-data.ts',
                line: 1,
                content: `SUB_MENUS entry '${id}' has no registered handler`,
            });
        }
    }
    return violations;
}

function checkCaseFiles(indexSource: string): Violation[] {
    const violations: Violation[] = [];
    const caseFiles = readdirSync('jira_management/commands')
        .filter((f) => /^case\d{2}\.ts$/.test(f))
        .sort((a, b) => a.localeCompare(b));

    for (const f of caseFiles) {
        const id = f.replace('case', '').replace('.ts', '').replace(/^0/, '');
        if (!indexSource.includes(`'${id}':`)) {
            violations.push({
                file: `jira_management/commands/${f}`,
                line: 1,
                content: `Handler file exists but is not registered in commands/index.ts`,
            });
        }
    }
    return violations;
}

export function checkHandlerConsistency(): CheckResult {
    const violations: Violation[] = [];
    try {
        const menuSource = readFileSync('jira_management/menu-data.ts', 'utf-8');
        const indexSource = readFileSync('jira_management/commands/index.ts', 'utf-8');

        const registered = parseRegisteredHandlers(indexSource);
        const { menuIds, aliasTargets, categoryIds } = parseMenuData(menuSource);

        violations.push(
            ...checkRegisteredWithoutMenu(registered, menuIds, aliasTargets, categoryIds),
            ...checkMenuWithoutHandler(registered, menuIds),
            ...checkCaseFiles(indexSource),
        );

        return { name: '3-way handler ↔ menu ↔ alias consistency', passed: violations.length === 0, violations };
    } catch (err) {
        violations.push({
            file: 'scripts/quality-check.ts',
            line: 1,
            content: `Handler check failed: ${String(err)}`,
        });
        return { name: '3-way handler ↔ menu ↔ alias consistency', passed: false, violations };
    }
}

// ---------------------------------------------------------------------------
// Enforce-quality checks (1-18)
// ---------------------------------------------------------------------------

export function checkThrowString(): CheckResult {
    const files = allTsFiles().filter((f) => !f.startsWith('scripts/'));
    return checkNoPattern("throw 'string' (use throw new Error)", /throw\s+'/, files);
}

export function checkThrowDoubleQuote(): CheckResult {
    const files = allTsFiles().filter((f) => !f.startsWith('scripts/'));
    return checkNoPattern('throw "string" (use throw new Error)', /throw\s+"/, files);
}

export function checkViFnUnknown(): CheckResult {
    return checkNoPattern(
        'vi.fn<(...args: ...) => unknown> in test files',
        /vi\.fn<\s*unknown\s*[,>]/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

export function checkViFnUnknownArray(): CheckResult {
    return checkNoPattern(
        'vi.fn<(...args: unknown[]) => ...> in test files',
        /vi\.fn<[^)]*,\s*unknown\s*\[/,
        allTsFiles().filter((f) => f.endsWith('.test.ts') && f !== 'scripts/quality-check.test.ts'),
    );
}

export function checkArtifactValidators(): CheckResult {
    const violations: Violation[] = [];
    const requiredExports: Array<{ file: string; export: string }> = [
        { file: 'shared/validation/test-case-validator.ts', export: 'createTestCaseValidator' },
        { file: 'shared/validation/analysis-validator.ts', export: 'createAnalysisValidator' },
        { file: 'shared/validation/pipeline-validator.ts', export: 'createPipelineValidator' },
        { file: 'shared/validation/bug-report-validator.ts', export: 'createBugReportValidator' },
        { file: 'shared/validation/comparison-validator.ts', export: 'createComparisonValidator' },
        { file: 'shared/validation/evidence-validator.ts', export: 'verifyEvidence' },
        { file: 'shared/validation/coverage-verifier.ts', export: 'recalculateCoverage' },
        { file: 'shared/validation/artifact-validator.ts', export: 'ArtifactValidator' },
        { file: 'shared/llm/llm-self-consistency.ts', export: 'consensusGenerate' },
        { file: 'shared/quality/targeted-retry.ts', export: 'generateWithRetry' },
        { file: 'shared/quality/quality-metrics.ts', export: 'snapshotQualityMetrics' },
    ];
    for (const req of requiredExports) {
        if (!existsSync(path.resolve(req.file))) {
            violations.push({ file: req.file, line: 1, content: `MISSING FILE: ${req.file}` });
            continue;
        }
        const content = readFileSync(path.resolve(req.file), 'utf-8');
        const hasDirectExport =
            content.includes('export ' + req.export) ||
            content.includes('export function ' + req.export) ||
            content.includes('export class ' + req.export) ||
            content.includes('export async function ' + req.export);
        const hasReexport = content.includes('export {') && content.includes(req.export);
        if (!hasDirectExport && !hasReexport) {
            violations.push({ file: req.file, line: 1, content: `Missing export: ${req.export}` });
        }
    }
    return { name: 'artifact validation framework exports intact', passed: violations.length === 0, violations };
}

export function checkArtifactValidatorsExist(): CheckResult {
    const violations: Violation[] = [];
    const validators = [
        'shared/validation/test-case-validator.ts',
        'shared/validation/analysis-validator.ts',
        'shared/validation/pipeline-validator.ts',
        'shared/validation/bug-report-validator.ts',
        'shared/validation/comparison-validator.ts',
    ];
    for (const vf of validators) {
        if (!existsSync(path.resolve(vf))) {
            violations.push({ file: vf, line: 1, content: `Missing validator: ${vf}` });
        }
    }
    return { name: 'all artifact types have validators', passed: violations.length === 0, violations };
}

export function checkDashboardExports(): CheckResult {
    const violations: Violation[] = [];
    const dashboards: Array<{ file: string; export_: string }> = [
        { file: 'shared/data-hub/compute/release-score.ts', export_: 'calcReleaseScore' },
        { file: 'shared/quality/defect-trend.ts', export_: 'aggregateDefectTrends' },
        { file: 'shared/quality/defect-trend.ts', export_: 'generateDefectTrendHtml' },
        { file: 'shared/report/traceability-matrix.ts', export_: 'buildTraceabilityMatrix' },
        { file: 'shared/report/traceability-matrix.ts', export_: 'generateTraceabilityHtml' },
        { file: 'shared/report/ai-effectiveness.ts', export_: 'computeAiEffectiveness' },
        { file: 'shared/report/ai-effectiveness.ts', export_: 'generateAiEffectivenessHtml' },
        { file: 'shared/quality/defect-seasonality.ts', export_: 'aggregateDefectSeasonality' },
        { file: 'shared/quality/defect-seasonality.ts', export_: 'generateSeasonalityHtml' },
        { file: 'shared/quality/silent-regression.ts', export_: 'detectSilentRegression' },
        { file: 'shared/quality/silent-regression.ts', export_: 'generateSilentRegressionHtml' },
        { file: 'shared/report/ai-comparison.ts', export_: 'compareAiVsManual' },
        { file: 'shared/report/ai-comparison.ts', export_: 'generateAiComparisonHtml' },
        { file: 'shared/quality/cross-squad-benchmark.ts', export_: 'computeCrossSquadBenchmark' },
        { file: 'shared/quality/cross-squad-benchmark.ts', export_: 'generateBenchmarkHtml' },
        { file: 'shared/quality/developer-profile.ts', export_: 'buildDeveloperProfile' },
        { file: 'shared/quality/developer-profile.ts', export_: 'generateDeveloperProfileHtml' },
        { file: 'shared/quality/suite-optimization.ts', export_: 'analyzeSuiteOptimization' },
        { file: 'shared/quality/suite-optimization.ts', export_: 'generateOptimizationHtml' },
        { file: 'shared/report/backlog-health.ts', export_: 'analyzeBacklogHealth' },
        { file: 'shared/report/backlog-health.ts', export_: 'generateBacklogHealthHtml' },
        { file: 'shared/report/incident-report.ts', export_: 'buildIncidentReport' },
        { file: 'shared/report/incident-report.ts', export_: 'generateIncidentReportHtml' },
        { file: 'shared/report/impact-alert.ts', export_: 'analyzePipelineImpact' },
        { file: 'shared/report/impact-alert.ts', export_: 'generateImpactAlertHtml' },
        { file: 'shared/data-hub/compute/pipeline-cost.ts', export_: 'calcPipelineCost' },
        { file: 'shared/quality/requirement-score.ts', export_: 'calculateRequirementScores' },
        { file: 'shared/quality/requirement-score.ts', export_: 'generateRequirementScoreHtml' },
    ];
    for (const d of dashboards) {
        if (!existsSync(path.resolve(d.file))) {
            violations.push({ file: d.file, line: 1, content: `MISSING FILE: ${d.file}` });
            continue;
        }
        const content = readFileSync(path.resolve(d.file), 'utf-8');
        if (!content.includes('export function ' + d.export_)) {
            violations.push({ file: d.file, line: 1, content: `Missing export: ${d.export_} not found` });
        }
    }
    return { name: 'all dashboard modules have required exports', passed: violations.length === 0, violations };
}

export function checkQualityGateFiles(): CheckResult {
    const violations: Violation[] = [];
    const files = ['shared/quality/quality-gate.ts'];
    for (const f of files) {
        if (!existsSync(path.resolve(f))) {
            violations.push({ file: f, line: 1, content: `MISSING FILE: ${f}` });
        }
    }
    return { name: 'quality gate module files exist', passed: violations.length === 0, violations };
}

// markdown.ts/markdown-lexer.ts: `!` is markdown image syntax, not non-null assertion
// xray-history.ts/xray-client.ts/xray-cloud-client.ts: GraphQL types have known non-null fields
// case02.ts: structured test assertions
// pipeline-handler.test.ts: test assertions
function buildTemplateLineSet(lines: string[]): Set<number> {
    const templateLines = new Set<number>();
    let inTemplate = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        for (const ch of line) {
            if (ch === '`') inTemplate = !inTemplate;
        }
        if (inTemplate) templateLines.add(i + 1);
    }
    return templateLines;
}

function isExcludedNonNullLine(c: string): boolean {
    if (typeof c !== 'string' || c.length === 0) return true;
    const commentIdx = c.indexOf('//');
    if (commentIdx >= 0 && c.indexOf('!', commentIdx) >= 0) return true;
    for (const quote of ['"', "'"] as const) {
        const open = c.indexOf(quote);
        if (open >= 0 && c.indexOf('!', open) >= 0 && c.indexOf(quote, open + 1) > open) return true;
    }
    return false;
}

export function checkNonNullAssertion(): CheckResult {
    const files = allTsFiles()
        .filter((f) => !f.startsWith('scripts/'))
        .filter(
            (f) =>
                !/markdown\.ts$|markdown-lexer\.ts$|xray-history\.ts$|xray-client\.ts$|xray-cloud-client\.ts$|case02\.ts$|pipeline-handler\.test\.ts$/.test(
                    f,
                ),
        );
    const pattern = /[\w)\]]!(?:[.,)\];[]|\s+as\b|\s*$)/;
    const violations: Violation[] = [];
    for (const file of files) {
        const matches = grepLines(file, pattern);
        if (matches.length === 0) continue;
        const content = readFileSync(file, 'utf-8').split('\n');
        const templateLines = buildTemplateLineSet(content);
        for (const m of matches) {
            if (templateLines.has(m.line)) continue;
            if (isExcludedNonNullLine(m.content)) continue;
            violations.push({ file, ...m });
        }
    }
    return { name: 'non-null assertion (!) in .ts files', passed: violations.length === 0, violations };
}

function collectDepWallViolations(file: string, pattern: RegExp): Violation[] {
    const violations: Violation[] = [];
    for (const { line, content } of grepLines(file, pattern)) {
        const m = pattern.exec(content);
        const pkg = m?.[1];
        if (pkg && pkg !== 'vitest' && !isBuiltin(pkg)) {
            violations.push({
                file,
                line,
                content: `Direct external import '${pkg}' — must go through shared/deps.ts (DepWal)`,
            });
        }
    }
    return violations;
}

export function checkDepWall(): CheckResult {
    const violations: Violation[] = [];
    const dirs = ['git_triggers', 'jira_management'];
    const extPkgImport = /from\s+['"](?!\.)(?!\/)(?!node:)([a-z@][^'"]*)/;
    const requirePkg = /require\s*\(\s*['"]([a-z@][^'"]*)['"]\s*\)/;
    for (const dir of dirs) {
        const files = globSync(`${dir}/**/*.ts`, { ignore: ['node_modules/**'] });
        for (const file of files) {
            violations.push(
                ...collectDepWallViolations(file, extPkgImport),
                ...collectDepWallViolations(file, requirePkg),
            );
        }
    }
    return {
        name: 'DepWall: direct external imports forbidden outside shared/',
        passed: violations.length === 0,
        violations,
    };
}

export function checkIfTrueFalse(): CheckResult {
    return checkNoPattern(
        'if(true)/if(false) condition replacement (auto-fix guard)',
        /if\s*\(\s*(?:true|false)\s*\)\s*(?:\{|return|break|continue|throw|;)/,
        allTsFiles().filter(
            (f) => f !== 'scripts/quality-check.test.ts' && f !== 'scripts/__tests__/quality-check.test.ts',
        ),
    );
}

// ---------------------------------------------------------------------------
// Auto-integrity
// ---------------------------------------------------------------------------

export function checkIntegrity(): CheckResult {
    const violations: Violation[] = [];
    try {
        const selfContent = readFileSync('scripts/quality-check.ts', 'utf-8');
        const contentWithoutHash = selfContent.replace(/\/\* HASH:[0-9a-f]{64} \*\//g, '');
        const currentHash = createHash('sha256').update(contentWithoutHash, 'utf-8').digest('hex');
        /* HASH:b79f4eecbe0fcb9b151fb7fe55dfca91ede20d01ffdc36f394417bf3e31742dc */
        const match = /\/\* HASH:([0-9a-f]{64}) \*\//.exec(selfContent);
        if (!match) {
            violations.push({ file: 'scripts/quality-check.ts', line: 1, content: 'Missing HASH comment' });
        } else if (match[1] !== currentHash) {
            violations.push({
                file: 'scripts/quality-check.ts',
                line: 1,
                content: `Hash mismatch. Regenerate after intentional changes.`,
            });
        }
    } catch (err) {
        violations.push({
            file: 'scripts/quality-check.ts',
            line: 1,
            content: `Integrity check failed: ${String(err)}`,
        });
    }
    return { name: 'quality-check auto-integrity', passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Lint warning ratchet
// ---------------------------------------------------------------------------

const RATCHET_FILE = path.resolve('.quality_ratchet.json');

interface RatchetData {
    version?: number;
    checks?: Record<string, { threshold: number; description: string }>;
}

function readRatchetThreshold(checkKey: string): number {
    try {
        const raw = readFileSync(RATCHET_FILE, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const data = parsed as RatchetData;
        const n = data.checks?.[checkKey]?.threshold;
        return typeof n === 'number' && n >= 0 ? n : Infinity;
    } catch {
        return Infinity;
    }
}

function writeRatchetThreshold(checkKey: string, count: number, description: string): void {
    let data: RatchetData = { version: 1, checks: {} };
    try {
        data = JSON.parse(readFileSync(RATCHET_FILE, 'utf-8')) as RatchetData;
    } catch {
        rootLogger.warn('quality-check: ratchet file not found, creating new one');
    }
    if (!data.checks) data.checks = {};
    data.checks[checkKey] = { threshold: count, description };
    writeFileSync(RATCHET_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function checkLintWarningRatchet(warningCount: number): CheckResult {
    const violations: Violation[] = [];
    const current = warningCount;
    const threshold = readRatchetThreshold('lint-warnings');

    if (current > threshold) {
        violations.push({
            file: '.quality_ratchet.json',
            line: 1,
            content: `REGRESSÃO: ${current} warnings ESLint (threshold: ${threshold}). Reduza warnings antes de commitar.`,
        });
    } else if (current < threshold) {
        writeRatchetThreshold(
            'lint-warnings',
            current,
            'warnings ESLint (security/detect-*, vitest/*, sonarjs/*, etc.)',
        );
    }

    return {
        name: `lint-warnings ratchet (${current} <= ${threshold})`,
        passed: violations.length === 0,
        violations,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
    const checks: CheckResult[] = [];
    const isCI = process.env['CI'] === 'true';

    if (isCI) {
        const { result: eslintResult, warningCount } = await checkEslintBaseline();
        checks.push(eslintResult);
        checks.push(checkLintWarningRatchet(warningCount));
    }
    checks.push(checkHandlerConsistency());

    /* enforce-quality checks */
    checks.push(checkThrowString());
    checks.push(checkThrowDoubleQuote());
    checks.push(checkViFnUnknown());
    checks.push(checkViFnUnknownArray());
    checks.push(checkArtifactValidators());
    checks.push(checkArtifactValidatorsExist());
    checks.push(checkDashboardExports());
    checks.push(checkQualityGateFiles());
    checks.push(checkNonNullAssertion());
    checks.push(checkDepWall());
    checks.push(checkIfTrueFalse());
    checks.push(checkIntegrity());

    /* Guard: check count */
    const minChecks = 13;
    if (checks.length < minChecks) {
        checks.push({
            name: `quality-check has at least ${minChecks} checks`,
            passed: false,
            violations: [
                {
                    file: 'scripts/quality-check.ts',
                    line: 1,
                    content: `Expected >= ${minChecks} checks, found ${checks.length}`,
                },
            ],
        });
    }

    /* Report */
    let allPassed = true;
    for (const check of checks) {
        if (check.passed) {
            process.stdout.write(`  ✅ ${check.name}\n`);
        } else {
            allPassed = false;
            process.stdout.write(`  ❌ ${check.name} — ${check.violations.length} violation(s)\n`);
            for (const v of check.violations.slice(0, 10)) {
                process.stdout.write(`       ${v.file}:${v.line}  ${v.content.slice(0, 100)}\n`);
            }
            if (check.violations.length > 10) {
                process.stdout.write(`       ... and ${check.violations.length - 10} more\n`);
            }
        }
    }

    process.stdout.write('\n');
    if (allPassed) {
        process.stdout.write('✅ All quality checks passed.\n');
        gracefulExit(ExitCode.OK);
    } else {
        process.stdout.write('❌ Some quality checks failed. Fix violations before committing.\n');
        gracefulExit(ExitCode.ERROR);
    }
}

const isMainImport = process.argv[1]?.replace(/\\/g, '/').endsWith('/quality-check.ts');
if (isMainImport) {
    main().catch((err) => {
        process.stderr.write(String(err));
        gracefulExit(ExitCode.ERROR);
    });
}
