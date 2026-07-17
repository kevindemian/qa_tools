/**
 * ci-status.ts — Monitor de CI do GitHub Actions via API REST.
 *
 * Usa o HTTP client do projeto (shared/http-client), que roteia por TLS/proxy
 * configurados (shared/tls, shared/proxy-config). Isso alcanca api.github.com
 * em ambientes onde curl/gh direto falham (503 atras de proxy corporativo).
 *
 * Requer GITHUB_TOKEN no ambiente (.env.local). Repo via GITHUB_REPOSITORY
 * (default: kevindemian/qa_tools).
 *
 * Uso:
 *   npx tsx scripts/ci-status.ts [--branch <ref>] [--logs]
 *     --branch <ref> : branch para consultar runs (default: dev)
 *     --logs         : busca e imprime logs dos jobs que falharam no run mais recente
 */

import { ensureDotenv } from '../shared/env-loader.js';
import { createHttpClient } from '../shared/http-client.js';
import { rootLogger } from '../shared/logger.js';

interface WorkflowRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    head_branch: string;
    html_url: string;
}

interface Job {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
}

function parseArgs(argv: string[]): { branch: string; logs: boolean } {
    let branch = 'dev';
    let logs = false;
    const queue = [...argv];
    while (queue.length > 0) {
        const arg = queue.shift();
        if (arg === '--branch') {
            const next = queue.shift();
            if (!next) throw new Error('--branch requer um valor');
            branch = next;
        } else if (arg === '--logs') {
            logs = true;
        }
    }
    return { branch, logs };
}

type Outcome =
    | { kind: 'no-runs' }
    | { kind: 'in-progress'; run: WorkflowRun }
    | { kind: 'success'; run: WorkflowRun }
    | { kind: 'concluded-no-failure'; run: WorkflowRun }
    | { kind: 'failed'; run: WorkflowRun; failedJobs: Job[] };

/**
 * Classifica o estado de um conjunto de runs/jobs em uma decisao pura.
 * `jobs` so e consultado quando o run mais recente esta `completed`.
 */
function classifyOutcome(runs: WorkflowRun[], jobs: Job[]): Outcome {
    const latest = runs[0];
    if (!latest) return { kind: 'no-runs' };
    if (latest.status !== 'completed') return { kind: 'in-progress', run: latest };
    if (latest.conclusion === 'success') return { kind: 'success', run: latest };
    const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
    if (failedJobs.length === 0) return { kind: 'concluded-no-failure', run: latest };
    return { kind: 'failed', run: latest, failedJobs };
}

/** Linha de log formatada para o run mais recente (pura). */
function formatRunLine(run: WorkflowRun): string {
    return `[ci-status] run #${run.id} "${run.name}" | status=${run.status} conclusion=${run.conclusion ?? '?'} | ${run.html_url}`;
}

/** Linha de log formatada por job (pura). */
function formatJobLine(job: Job): string {
    return `  ${job.name} | conclusion=${job.conclusion ?? '?'}`;
}

interface ReportLine {
    level: 'info' | 'error';
    text: string;
}

interface Report {
    lines: ReportLine[];
    exitCode: number;
    /** Jobs cujos logs devem ser buscados (apenas quando `logs` e failed). */
    fetchLogsFor: Job[];
}

/**
 * Decisao pura de relatorio a partir de um Outcome ja classificado.
 * Nao faz IO: retorna as linhas a logar, o exit code e quais jobs precisam de logs.
 */
function buildReport(outcome: Outcome, logs: boolean): Report {
    switch (outcome.kind) {
        case 'no-runs':
            return { lines: [], exitCode: 0, fetchLogsFor: [] };
        case 'in-progress':
            return {
                lines: [
                    { level: 'info', text: formatRunLine(outcome.run) },
                    { level: 'info', text: '[ci-status] run ainda em andamento.' },
                ],
                exitCode: 0,
                fetchLogsFor: [],
            };
        case 'success':
            return {
                lines: [
                    { level: 'info', text: formatRunLine(outcome.run) },
                    { level: 'info', text: '[ci-status] CI verde.' },
                ],
                exitCode: 0,
                fetchLogsFor: [],
            };
        case 'concluded-no-failure':
            return {
                lines: [
                    { level: 'info', text: formatRunLine(outcome.run) },
                    {
                        level: 'error',
                        text: `[ci-status] run concluiu como ${outcome.run.conclusion} sem job "failure" identificavel.`,
                    },
                ],
                exitCode: 1,
                fetchLogsFor: [],
            };
        case 'failed': {
            const lines: ReportLine[] = [{ level: 'info', text: formatRunLine(outcome.run) }];
            for (const j of outcome.failedJobs) {
                lines.push({ level: 'error', text: `[ci-status] FALHOU: ${j.name} — ${j.html_url}` });
            }
            if (!logs) {
                lines.push({
                    level: 'info',
                    text: '[ci-status] use --logs para imprimir os logs dos jobs que falharam.',
                });
            }
            return { lines, exitCode: 1, fetchLogsFor: logs ? outcome.failedJobs : [] };
        }
    }
}

/** Minimal HTTP boundary consumed by the orchestrator (the only mockable seam). */
interface CiHttpClient {
    get<T>(url: string, opts?: { responseType?: 'text' }): Promise<{ data: T }>;
}

/** Emite as linhas de um Report via logger (IO isolada). */
function emitReport(report: Report, log: Pick<typeof rootLogger, 'info' | 'error'>): void {
    for (const line of report.lines) {
        if (line.level === 'error') log.error(line.text);
        else log.info(line.text);
    }
}

/**
 * Orquestra a consulta ao CI usando o cliente HTTP injetado (fronteira externa).
 * Toda a decisao vem das funcoes puras (classifyOutcome/buildReport); esta funcao
 * apenas encadeia IO. Retorna o exit code — nao chama process.exit (testavel).
 */
async function runCiStatus(
    client: CiHttpClient,
    repo: string,
    branch: string,
    logs: boolean,
    log: Pick<typeof rootLogger, 'info' | 'error'>,
): Promise<number> {
    const runsResp = await client.get<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`,
    );
    const runs = runsResp.data.workflow_runs;

    const latest = runs[0];
    if (!latest) {
        log.info(`[ci-status] nenhum run encontrado em ${branch}.`);
        return 0;
    }

    let jobs: Job[] = [];
    if (latest.status === 'completed') {
        const jobsResp = await client.get<{ jobs: Job[] }>(`/repos/${repo}/actions/runs/${latest.id}/jobs`);
        jobs = jobsResp.data.jobs;
        for (const j of jobs) log.info(formatJobLine(j));
    }

    const outcome = classifyOutcome(runs, jobs);
    const report = buildReport(outcome, logs);
    emitReport(report, log);

    for (const j of report.fetchLogsFor) {
        log.info(`\n========== LOGS: ${j.name} (job ${j.id}) ==========`);
        const logResp = await client.get<string>(`/repos/${repo}/actions/jobs/${j.id}/logs`, {
            responseType: 'text',
        });
        process.stdout.write(logResp.data);
    }

    return report.exitCode;
}

async function main(): Promise<void> {
    ensureDotenv();
    const token = process.env['GITHUB_TOKEN'];
    if (!token) {
        rootLogger.error('[ci-status] GITHUB_TOKEN nao definido no ambiente.');
        process.exit(1);
    }
    const repo = process.env['GITHUB_REPOSITORY'] || 'kevindemian/qa_tools';
    const { branch, logs } = parseArgs(process.argv.slice(2));

    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        maxRetries: 3,
        timeout: 60000,
    });

    const exitCode = await runCiStatus(client, repo, branch, logs, rootLogger);
    if (exitCode !== 0) process.exit(exitCode);
}

export { parseArgs, classifyOutcome, buildReport, formatRunLine, formatJobLine, emitReport, runCiStatus };
export type { WorkflowRun, Job, Outcome, Report, ReportLine, CiHttpClient };

if (!process.env['VITEST'] && process.argv[1]?.includes('ci-status')) {
    main().catch((err) => {
        rootLogger.error(`[ci-status] erro: ${String(err)}`);
        process.exit(1);
    });
}
