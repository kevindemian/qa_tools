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
