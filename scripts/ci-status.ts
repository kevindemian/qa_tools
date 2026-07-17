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

ensureDotenv();

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

async function main(): Promise<void> {
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

    const runsResp = await client.get<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`,
    );
    const runs = runsResp.data.workflow_runs;
    if (runs.length === 0) {
        rootLogger.info(`[ci-status] nenhum run encontrado em ${branch}.`);
        return;
    }

    const latest = runs[0];
    if (!latest) {
        rootLogger.info(`[ci-status] nenhum run encontrado em ${branch}.`);
        return;
    }
    rootLogger.info(
        `[ci-status] run #${latest.id} "${latest.name}" | status=${latest.status} conclusion=${latest.conclusion ?? '?'} | ${latest.html_url}`,
    );

    if (latest.status !== 'completed') {
        rootLogger.info('[ci-status] run ainda em andamento.');
        return;
    }

    const jobsResp = await client.get<{ jobs: Job[] }>(`/repos/${repo}/actions/runs/${latest.id}/jobs`);
    const failed = jobsResp.data.jobs.filter((j) => j.conclusion === 'failure');

    for (const j of jobsResp.data.jobs) {
        rootLogger.info(`  ${j.name} | conclusion=${j.conclusion ?? '?'}`);
    }

    if (latest.conclusion === 'success') {
        rootLogger.info('[ci-status] CI verde.');
        return;
    }

    if (failed.length === 0) {
        rootLogger.error(`[ci-status] run concluiu como ${latest.conclusion} sem job "failure" identificavel.`);
        process.exit(1);
    }

    for (const j of failed) {
        rootLogger.error(`[ci-status] FALHOU: ${j.name} — ${j.html_url}`);
    }

    if (logs) {
        for (const j of failed) {
            rootLogger.info(`\n========== LOGS: ${j.name} (job ${j.id}) ==========`);
            const logResp = await client.get<string>(`/repos/${repo}/actions/jobs/${j.id}/logs`, {
                responseType: 'text',
            });
            process.stdout.write(logResp.data);
        }
    } else {
        rootLogger.info('[ci-status] use --logs para imprimir os logs dos jobs que falharam.');
    }

    process.exit(1);
}

main().catch((err) => {
    rootLogger.error(`[ci-status] erro: ${String(err)}`);
    process.exit(1);
});
