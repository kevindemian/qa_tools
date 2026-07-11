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
 * Usa createDataHub() factory com retry + persistence injection.
 * Consumidor resiliente (dashboards/metrics): em caso de ausência de dados
 * (Camada 7), retorna um hub vazio (warning) em vez de propagar erro — o
 * relatório de PR (pr-report-core main) relança o erro explicitamente.
 */
export async function getOrFetchDataHub(provider: GitProvider, repo: string): Promise<DataHub | undefined> {
    const { createDataHub } = await import('./data-hub/factory.js');
    try {
        const result = await createDataHub(provider, repo, { allowEmpty: true });
        return result.hub;
    } catch (err) {
        rootLogger.warn(`getOrFetchDataHub failed: ${String(err)}`);
        return undefined;
    }
}
