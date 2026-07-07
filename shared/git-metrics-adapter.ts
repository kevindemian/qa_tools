/**
 * Git Metrics Adapter — transforms git history into MetricsRun[] and
 * FailureClassification[] so the quality gate, health score, and dashboards
 * can operate on real project data even when no pipeline metrics exist.
 *
 * Mapping:
 *   Each day with commits → one MetricsRun
 *   Each commit           → one FlatTest
 *   Normal commits        → state = 'passed'
 *   Revert commits        → state = 'failed'
 *   Merge commits         → state = 'skipped'
 *   Revert commits        → FailureClassification with category 'REVERT'
 *
 * @module git-metrics-adapter
 */

import { execFileSync } from 'child_process';
import { rootLogger } from './logger.js';

const GIT_BIN = '/usr/bin/git';
import type { MetricsRun, FailureClassification } from './types/data-hub.js';
import type { FlatTest } from './result_parser.js';

export interface GitCommitEntry {
    hash: string;
    date: string;
    subject: string;
    author: string;
    parents: string[];
}

export interface GitMetricsAdapterOptions {
    maxDays?: number;
    projectName?: string;
    repoPath?: string;
    branch?: string;
}

const REVERT_PATTERN = /^(Revert|revert)\b/;

/**
 * Git log format usando NUL byte como delimitador entre campos.
 *
 * Razo: `%s` (subject) pode conter `|` — o pipe tradicional quebra o parse.
 * NUL byte (0x00) é o único caractere que o git garante nunca aparecer
 * nos campos de saída. Testado com grep -r '\\x00' em mensagens de commit,
 * nomes de autor, hashes e datas — zero ocorrências.
 *
 * Bug corrigido: https://git-scm.com/docs/git-log#_pretty_formats
 * Campo `%s` é free-text e permite qualquer caractere exceto NUL.
 *
 * Formato: hash\0date\0subject\0author\0parents\n
 */
let lastGitLogError: string | undefined = undefined;

export function getLastGitLogError(): string | undefined {
    return lastGitLogError;
}

export function clearGitLogError(): void {
    lastGitLogError = undefined;
}

const GIT_LOG_FORMAT = '--format=%H%x00%aI%x00%s%x00%an%x00%P';
const GIT_LOG_ARGS = ['--reverse'];

export function parseGitLogOutput(output: string): GitCommitEntry[] {
    const lines = output.split('\n').filter(Boolean);
    const entries: GitCommitEntry[] = [];
    for (const [i, line] of lines.entries()) {
        if (!line) continue;
        const parts = line.split('\0');
        if (parts.length < 5) {
            rootLogger.warn('Git metrics adapter: malformed log line ' + (i + 1) + ', skipping');
            continue;
        }
        const hash = parts[0] ?? '';
        const date = parts[1] ?? '';
        const subject = parts[2] ?? '';
        const author = parts[3] ?? '';
        const parentField = parts[4] ?? '';
        const parents = parentField ? parentField.split(' ').filter(Boolean) : [];
        entries.push({ hash, date, subject, author, parents });
    }
    return entries;
}

function isRevert(subject: string): boolean {
    return REVERT_PATTERN.test(subject);
}

function isMerge(parents: string[]): boolean {
    return parents.length > 1;
}

/**
 * Extrai a data no formato YYYY-MM-DD da representação UTC de um timestamp ISO.
 *
 * Usa UTC consistente (`toISOString` converte para UTC) para garantir que
 * o agrupamento por dia seja estável independentemente do fuso horário do autor.
 *
 * Retorna string vazia se o timestamp for inválido.
 */
function extractDate(isoTimestamp: string): string {
    const parsed = new Date(isoTimestamp);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function buildGitLogArgs(options?: GitMetricsAdapterOptions): string[] {
    const ref = options?.branch ? [options.branch] : ['--all'];
    return ['log', ...ref, GIT_LOG_FORMAT, ...GIT_LOG_ARGS];
}

export function fetchGitLog(options?: GitMetricsAdapterOptions): GitCommitEntry[] {
    clearGitLogError();
    try {
        const repoPath = options?.repoPath ?? process.cwd();
        const args = buildGitLogArgs(options);
        const output = execFileSync(GIT_BIN, args, {
            cwd: repoPath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 15000,
        });
        return parseGitLogOutput(output);
    } catch (err) {
        const message = String(err);
        lastGitLogError = message;
        rootLogger.warn('Git metrics adapter: failed to fetch git log — ' + message);
        return [];
    }
}

function filterCommits(commits: GitCommitEntry[], options?: GitMetricsAdapterOptions): GitCommitEntry[] {
    let filtered = [...commits];
    if (options?.maxDays && options.maxDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - options.maxDays);
        filtered = filtered.filter((c) => {
            const date = new Date(c.date);
            return !isNaN(date.getTime()) && date >= cutoff;
        });
    }
    return filtered;
}

/**
 * Mapeia um commit para FlatTest.
 *
 * Regras de estado (por ordem de precedência):
 * 1. Revert → 'failed' (Revert tem prioridade sobre Merge)
 * 2. Merge (parents.length > 1) → 'skipped'
 * 3. Normal → 'passed'
 *
 * Revert tem prioridade sobre Merge porque um revert de merge é semanticamente
 * uma falha (desfaz uma integração), não um skip. Se a ordem fosse invertida,
 * `Revert "Merge branch feature"` seria marcado como 'skipped' em vez de 'failed'.
 */
function buildFlatTest(commit: GitCommitEntry): FlatTest {
    const isRevertCommit = isRevert(commit.subject);
    const isMergeCommit = !isRevertCommit && isMerge(commit.parents);

    let state: FlatTest['state'] = 'passed';
    if (isRevertCommit) state = 'failed';
    else if (isMergeCommit) state = 'skipped';

    return {
        title: commit.subject,
        state,
        duration: 0,
        ...(isRevertCommit ? { error: 'Commit was reverted' } : {}),
    };
}

function buildDayRuns(dayCommits: GitCommitEntry[], projectName: string): MetricsRun {
    const tests: FlatTest[] = [];
    let totalDuration = 0;
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let prevCommitTime: number | null = null;

    for (const commit of dayCommits) {
        const test = buildFlatTest(commit);
        const commitTime = new Date(commit.date).getTime();

        if (!isNaN(commitTime) && prevCommitTime !== null) {
            const diffSec = Math.round((commitTime - prevCommitTime) / 1000);
            test.duration = Math.max(0, diffSec);
        }

        totalDuration += test.duration;

        if (test.state === 'passed') passedCount++;
        else if (test.state === 'failed') failedCount++;
        else skippedCount++;

        tests.push(test);
        prevCommitTime = commitTime;
    }

    const firstDate = dayCommits[0]?.date;
    return {
        timestamp: (firstDate != null ? firstDate.slice(0, 10) : '') + 'T00:00:00.000Z',
        project: projectName,
        total: tests.length,
        passed: passedCount,
        failed: failedCount,
        skipped: skippedCount,
        duration: totalDuration,
        tests,
    };
}

export function generateGitMetricsRuns(options?: GitMetricsAdapterOptions): MetricsRun[] {
    clearGitLogError();
    const allCommits = fetchGitLog(options);
    if (allCommits.length === 0) return [];

    const filtered = filterCommits(allCommits, options);
    if (filtered.length === 0) return [];

    const projectName = options?.projectName ?? 'git';

    const dayBuckets = new Map<string, GitCommitEntry[]>();
    for (const commit of filtered) {
        const day = extractDate(commit.date);
        if (!day) continue;
        const bucket = dayBuckets.get(day) ?? [];
        bucket.push(commit);
        dayBuckets.set(day, bucket);
    }

    const runs: MetricsRun[] = [];
    for (const day of dayBuckets.keys()) {
        const dayCommits = dayBuckets.get(day);
        if (dayCommits) {
            runs.push(buildDayRuns(dayCommits, projectName));
        }
    }

    return runs;
}

export function generateGitFailureClassifications(options?: GitMetricsAdapterOptions): FailureClassification[] {
    clearGitLogError();
    const allCommits = fetchGitLog(options);
    if (allCommits.length === 0) return [];

    const filtered = filterCommits(allCommits, options);
    const classifications: FailureClassification[] = [];

    for (const commit of filtered) {
        if (isRevert(commit.subject)) {
            const utcDate = extractDate(commit.date);
            classifications.push({
                timestamp: utcDate || commit.date,
                testTitle: commit.subject,
                category: 'REVERT',
                project: options?.projectName ?? 'git',
            });
        }
    }

    return classifications;
}
