/**
 * CI Data Hub — repositório central de métricas do CI/CD.
 *
 * Busca dados das APIs do GitHub/GitLab, calcula métricas derivadas uma única vez,
 * e serve como ÚNICA fonte de dados para todos os scores, dashboards e relatórios do projeto.
 *
 * Usa a infraestrutura de GitProvider existente (GitHubManager / GitLabManager).
 * Quando CI não disponível, fornece fallback para MetricsStore local.
 *
 * Métricas derivadas seguem padrões normativos:
 * - passRate: DORA State of DevOps (success / total)
 * - avgDuration: Média aritmética com saturação [0, 86400] (24h max)
 * - suiteSpeedP95: Percentil 95 (Google SRE Best Practice)
 * - topFailingJobs: Taxa de falha por job (ISTQB)
 * - branchBreakdown: Pass rate por branch
 * - flakyTests: Testes com status oscilante (Industry Best Practice)
 */
import type { PipelineRun, PipelineJob, ArtifactInfo } from './types/ci-cd.js';
import type { GitProvider } from './types/ci-cd.js';
import type { DataHub } from './types/data-hub.js';
import { rootLogger } from './logger.js';

/* ── Interface pública ──────────────────────────────────────────────────── */

export interface CiDataHub {
    /** Pipeline runs brutos do CI. */
    runs: PipelineRun[];
    /** Jobs por run (runId → jobs). */
    jobs: Map<number, PipelineJob[]>;
    /** Failure reasons extraídos dos logs (jobId → reasons). */
    failureReasons: Map<number, string[]>;
    /** Artifacts por run (runId → artifacts). */
    artifacts: Map<number, ArtifactInfo[]>;

    /**
     * Taxa de pass = runs com conclusion=success / total runs com conclusion definido.
     * @unit percentage (0-100)
     * @reference DORA State of DevOps 2025
     */
    passRate: number;
    /**
     * Duração média das runs em segundos.
     * Saturado em [0, 86400] para evitar outliers extremos.
     * @unit seconds
     * @reference ISO/IEC 25023:2016
     */
    avgDuration: number;
    /**
     * P95 das durações dos jobs de teste em milissegundos.
     * @unit milliseconds
     * @reference Google SRE Best Practice
     */
    suiteSpeedP95: number;
    /**
     * Top 10 jobs com maior taxa de falha.
     * @unit failure rate per job (0-100%)
     * @reference ISTQB CTFL
     */
    topFailingJobs: Array<{ name: string; failureRate: number; count: number }>;
    /** Pass rate por branch. */
    branchBreakdown: Record<string, { passRate: number; count: number }>;
    /** Razões de falha mais comuns (top 10). */
    topFailureReasons: Array<{ pattern: string; count: number }>;
    /**
     * Testes flaky detectados (title → flaky rate).
     * Um teste é flaky se aparece com status diferente em runs diferentes.
     * @unit failure rate (0-100%)
     * @reference Industry Best Practice
     */
    flakyTests: Array<{ title: string; rate: number; runs: number }>;

    /** Metadados. */
    lastFetched: Date;
    provider: 'github' | 'gitlab';
    repo: string;
    /** Número de runs analisadas. */
    recentRunsCount: number;
}

/* ── Factory ────────────────────────────────────────────────────────────── */

export interface CiDataHubOptions {
    /** Número de runs recentes a buscar. Default: 30. */
    recentRunsCount?: number;
}

/**
 * Cria um CiDataHub vazio (fallback quando API falha).
 */
function createEmptyHub(provider: 'github' | 'gitlab', repo: string): CiDataHub {
    return {
        runs: [],
        jobs: new Map(),
        failureReasons: new Map(),
        artifacts: new Map(),
        passRate: 0,
        avgDuration: 0,
        suiteSpeedP95: 0,
        topFailingJobs: [],
        branchBreakdown: {},
        topFailureReasons: [],
        flakyTests: [],
        lastFetched: new Date(),
        provider,
        repo,
        recentRunsCount: 0,
    };
}

/** Busca jobs, artifacts e failure reasons para cada run. */
async function fetchRunDetails(
    provider: GitProvider,
    runs: PipelineRun[],
): Promise<{
    jobsMap: Map<number, PipelineJob[]>;
    artifactsMap: Map<number, ArtifactInfo[]>;
    failureReasonsMap: Map<number, string[]>;
}> {
    const jobsMap = new Map<number, PipelineJob[]>();
    const artifactsMap = new Map<number, ArtifactInfo[]>();
    const failureReasonsMap = new Map<number, string[]>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;

        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        if (isNaN(runIdNum)) continue;

        try {
            const runJobs = await provider.getPipelineJobs(runIdNum);
            jobsMap.set(runIdNum, runJobs);

            try {
                const arts = await provider.listPipelineArtifacts(runIdNum);
                artifactsMap.set(runIdNum, arts);
            } catch {
                rootLogger.debug(`CiDataHub: artifacts não disponíveis para run ${runIdNum}`);
            }

            await fetchFailureReasons(provider, runJobs, failureReasonsMap);
        } catch (err) {
            rootLogger.debug(`CiDataHub: jobs não disponíveis para run ${runIdNum}: ${String(err)}`);
        }
    }

    return { jobsMap, artifactsMap, failureReasonsMap };
}

/** Busca failure reasons dos logs para jobs falhos. */
async function fetchFailureReasons(
    provider: GitProvider,
    jobs: PipelineJob[],
    failureReasonsMap: Map<number, string[]>,
): Promise<void> {
    for (const job of jobs) {
        if (job.status !== 'failure' && job.status !== 'cancelled') continue;
        try {
            const logText = await provider.downloadArtifact(job.id);
            const reasons = extractFailureReasons(logText.filename);
            if (reasons.length > 0) {
                const jobIdNum = typeof job.id === 'string' ? parseInt(job.id, 10) : job.id;
                if (!isNaN(jobIdNum)) {
                    failureReasonsMap.set(jobIdNum, reasons);
                }
            }
        } catch (err) {
            rootLogger.debug(`CiDataHub: logs não disponíveis para job ${String(job.id)}: ${String(err)}`);
        }
    }
}

/**
 * Cria um CiDataHub a partir de um GitProvider.
 *
 * Busca pipeline runs, jobs, artifacts e failure reasons,
 * depois calcula todas as métricas derivadas uma única vez.
 *
 * @param provider - GitProvider (GitHubManager ou GitLabManager)
 * @param repo - Nome do repositório (ex: 'owner/repo')
 * @param options - Opções (recentRunsCount)
 * @returns CiDataHub com dados brutos e métricas derivadas
 */
export async function createCiDataHub(
    provider: GitProvider,
    repo: string,
    options?: CiDataHubOptions,
): Promise<CiDataHub> {
    const recentRunsCount = options?.recentRunsCount;

    // 1. Buscar pipeline runs (com tratamento de erro)
    rootLogger.info(`CiDataHub: Buscando ${recentRunsCount ?? 'default'} runs recentes...`);
    let runs: PipelineRun[];
    try {
        runs = await provider.getRecentPipelines(recentRunsCount);
    } catch {
        rootLogger.warn('CiDataHub: Falha ao buscar runs, usando hub vazio.');
        return createEmptyHub(provider.provider, repo);
    }
    rootLogger.info(`CiDataHub: ${runs.length} runs obtidos. Buscando jobs e artifacts...`);

    // 2. Para cada run, buscar jobs, artifacts e failure reasons
    const { jobsMap, artifactsMap, failureReasonsMap } = await fetchRunDetails(provider, runs);
    rootLogger.info(`CiDataHub: Jobs obtidos para ${jobsMap.size} runs. Calculando métricas...`);

    // 3. Calcular métricas derivadas
    const passRate = calcPassRate(runs);
    const avgDuration = calcAvgDuration(runs);
    const suiteSpeedP95 = calcSuiteSpeedP95(jobsMap);
    const topFailingJobs = calcTopFailingJobs(runs, jobsMap);
    const branchBreakdown = calcBranchBreakdown(runs);
    const topFailureReasons = calcTopFailureReasons(failureReasonsMap);
    const flakyTests = calcFlakyTests(runs, jobsMap);
    rootLogger.info(`CiDataHub: Métricas calculadas. Pass rate: ${passRate}%, Avg duration: ${avgDuration}s`);

    return {
        runs,
        jobs: jobsMap,
        failureReasons: failureReasonsMap,
        artifacts: artifactsMap,
        passRate,
        avgDuration,
        suiteSpeedP95,
        topFailingJobs,
        branchBreakdown,
        topFailureReasons,
        flakyTests,
        lastFetched: new Date(),
        provider: provider.provider,
        repo,
        recentRunsCount: runs.length,
    };
}

/* ── Helper com cache ─────────────────────────────────────────────────── */

let _cachedHub: CiDataHub | undefined;
let _cachedRepo: string | undefined;

/**
 * Obtém CiDataHub com cache por sessão.
 * Evita múltiplas chamadas à API quando vários consumers pedem os mesmos dados.
 * Em caso de falha, retorna undefined (fallback para MetricsStore).
 */
export async function getOrFetchCiDataHub(provider: GitProvider, repo: string): Promise<CiDataHub | undefined> {
    if (_cachedHub && _cachedRepo === repo) return _cachedHub;
    try {
        _cachedHub = await createCiDataHub(provider, repo);
        _cachedRepo = repo;
        return _cachedHub;
    } catch (err) {
        rootLogger.warn(`getOrFetchCiDataHub failed: ${String(err)}`);
        return undefined;
    }
}

/* ── Helper com cache (novo tipo DataHub) ──────────────────────────────── */

/**
 * Obtém DataHub (novo tipo) com cache por sessão.
 * Wrapper que usa getCachedHub/setCachedHub de cache.ts (com TTL).
 * Em caso de falha, retorna undefined (fallback para MetricsStore).
 */
export async function getOrFetchDataHub(provider: GitProvider, repo: string): Promise<DataHub | undefined> {
    const { getCachedHub, setCachedHub } = await import('./data-hub/cache.js');
    const cached = getCachedHub(repo);
    if (cached != null) return cached;
    try {
        const { DataHubImpl } = await import('./data-hub/hub.js');

        let dataProvider;
        if (provider.provider === 'gitlab') {
            const { GitLabDataProvider } = await import('./data-hub/providers/gitlab-provider.js');
            dataProvider = new GitLabDataProvider(provider);
        } else {
            const { GitHubDataProvider } = await import('./data-hub/providers/github-provider.js');
            dataProvider = new GitHubDataProvider(provider);
        }

        const hub = await DataHubImpl.create([dataProvider], { repo });
        setCachedHub(repo, hub);
        return hub;
    } catch (err) {
        rootLogger.warn(`getOrFetchDataHub failed: ${String(err)}`);
        return undefined;
    }
}

/* ── Funções de cálculo (puras) ────────────────────────────────────────── */

/** Calcula pass rate = success / total (runs com conclusion definido). */
function calcPassRate(runs: PipelineRun[]): number {
    const withConclusion = runs.filter((r) => r.conclusion != null);
    if (withConclusion.length === 0) return 0;
    const passed = withConclusion.filter((r) => r.conclusion === 'success').length;
    return Math.round((passed / withConclusion.length) * 100 * 100) / 100;
}

/** Calcula duração média das runs em segundos. Saturado em [0, 86400] (24h max). */
function calcAvgDuration(runs: PipelineRun[]): number {
    const durations: number[] = [];
    for (const run of runs) {
        if (run.run_started_at && run.updated_at) {
            const start = new Date(run.run_started_at).getTime();
            const end = new Date(run.updated_at).getTime();
            if (!isNaN(start) && !isNaN(end) && end > start) {
                durations.push((end - start) / 1000);
            }
        }
    }
    if (durations.length === 0) return 0;
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    // Saturação: max 24h (86400s) para evitar outliers extremos
    return Math.min(86400, Math.round(avg * 100) / 100);
}

/** Calcula P95 das durações dos jobs de teste em milissegundos.
 *  Outliers são tratados via percentil — P95 ignora os 5% mais altos naturalmente. */
function calcSuiteSpeedP95(jobsMap: Map<number, PipelineJob[]>): number {
    const durations: number[] = [];
    for (const jobs of jobsMap.values()) {
        for (const job of jobs) {
            if (job.duration != null && job.duration > 0) {
                durations.push(job.duration * 1000); // converter para ms
            }
        }
    }
    if (durations.length === 0) return 0;
    durations.sort((a, b) => a - b);
    // P95: percentil naturalmente ignora outliers extremos (5% mais altos)
    const idx = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return durations[idx] ?? 0;
}

/** Calcula top 10 jobs com maior taxa de falha. */
function calcTopFailingJobs(
    runs: PipelineRun[],
    jobsMap: Map<number, PipelineJob[]>,
): Array<{ name: string; failureRate: number; count: number }> {
    const jobStats = new Map<string, { total: number; failed: number }>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const jobs = jobsMap.get(runIdNum);
        if (!jobs) continue;

        for (const job of jobs) {
            const stats = jobStats.get(job.name) ?? { total: 0, failed: 0 };
            stats.total++;
            if (job.status === 'failure') stats.failed++;
            jobStats.set(job.name, stats);
        }
    }

    const result: Array<{ name: string; failureRate: number; count: number }> = [];
    for (const [name, stats] of jobStats) {
        if (stats.total > 0) {
            result.push({
                name,
                failureRate: Math.round((stats.failed / stats.total) * 100 * 100) / 100,
                count: stats.failed,
            });
        }
    }
    result.sort((a, b) => b.failureRate - a.failureRate);
    return result.slice(0, 10);
}

/** Calcula pass rate por branch. */
function calcBranchBreakdown(runs: PipelineRun[]): Record<string, { passRate: number; count: number }> {
    const branchStats = new Map<string, { total: number; passed: number }>();

    for (const run of runs) {
        const branch = run.head_branch ?? run.ref ?? 'unknown';
        const stats = branchStats.get(branch) ?? { total: 0, passed: 0 };
        stats.total++;
        if (run.conclusion === 'success') stats.passed++;
        branchStats.set(branch, stats);
    }

    const result: Record<string, { passRate: number; count: number }> = {};
    for (const [branch, stats] of branchStats) {
        result[branch] = {
            passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100 * 100) / 100 : 0,
            count: stats.total,
        };
    }
    return result;
}

/** Calcula top 10 razões de falha. */
function calcTopFailureReasons(failureReasonsMap: Map<number, string[]>): Array<{ pattern: string; count: number }> {
    const reasonCounts = new Map<string, number>();

    for (const reasons of failureReasonsMap.values()) {
        for (const reason of reasons) {
            reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
        }
    }

    const result: Array<{ pattern: string; count: number }> = [];
    for (const [pattern, count] of reasonCounts) {
        result.push({ pattern, count });
    }
    result.sort((a, b) => b.count - a.count);
    return result.slice(0, 10);
}

/** Extrai razões de falha de um log de job (regex simples). */
function extractFailureReasons(logText: string): string[] {
    const patterns = [
        /Error[:\s]+(.{10,100})/gi,
        /Failure[:\s]+(.{10,100})/gi,
        /Timeout[:\s]+(.{10,100})/gi,
        /Exception[:\s]+(.{10,100})/gi,
        /FATAL[:\s]+(.{10,100})/gi,
        /OOMKilled/gi,
    ];

    const reasons: string[] = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(logText)) !== null) {
            const reason = match[0].slice(0, 100);
            if (!reasons.includes(reason)) {
                reasons.push(reason);
            }
        }
    }
    return reasons.slice(0, 5); // máximo 5 razões por job
}

/** Calcula testes flaky detectados entre runs. */
function calcFlakyTests(
    runs: PipelineRun[],
    jobsMap: Map<number, PipelineJob[]>,
): Array<{ title: string; rate: number; runs: number }> {
    const jobHistory = buildJobHistory(runs, jobsMap);
    return detectFlakyJobs(jobHistory);
}

/** Constrói histórico de status por job name. */
function buildJobHistory(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): Map<string, Map<number, string>> {
    const jobHistory = new Map<string, Map<number, string>>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const jobs = jobsMap.get(runIdNum);
        if (!jobs) continue;

        for (const job of jobs) {
            if (!jobHistory.has(job.name)) {
                jobHistory.set(job.name, new Map());
            }
            const history = jobHistory.get(job.name) ?? new Map<number, string>();
            history.set(runIdNum, job.status);
            jobHistory.set(job.name, history);
        }
    }

    return jobHistory;
}

/** Detecta jobs que aparecem com status diferente em runs diferentes. */
function detectFlakyJobs(
    jobHistory: Map<string, Map<number, string>>,
): Array<{ title: string; rate: number; runs: number }> {
    const flaky: Array<{ title: string; rate: number; runs: number }> = [];
    for (const [name, statusByRun] of jobHistory) {
        const statuses = Array.from(statusByRun.values());
        if (statuses.length < 2) continue;
        const hasSuccess = statuses.includes('success');
        const hasFailure = statuses.includes('failure');
        if (hasSuccess && hasFailure) {
            const failCount = statuses.filter((s) => s === 'failure').length;
            flaky.push({
                title: name,
                rate: Math.round((failCount / statuses.length) * 100 * 100) / 100,
                runs: statuses.length,
            });
        }
    }

    flaky.sort((a, b) => b.rate - a.rate);
    return flaky;
}
