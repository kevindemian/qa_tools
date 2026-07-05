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
import type { GitProvider } from './types/ci-cd.js';
import type { DataHub } from './types/data-hub.js';
import { rootLogger } from './logger.js';

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
