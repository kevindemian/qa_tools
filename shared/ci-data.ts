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
import type { DataHub, RawData } from './types/data-hub.js';
import { rootLogger } from './logger.js';

/* ── Helper com cache (novo tipo DataHub) ──────────────────────────────── */

/**
 * Latest run timestamp in `raw.runs` (Gap 4 incremental anchor).
 * Returns undefined when there are no runs or none have a valid `created_at`.
 * Guards against malformed/invalid dates (AGENTS §24 — no silent NaN).
 */
export function latestRunTimestamp(raw: RawData): Date | undefined {
    let latest: Date | undefined;
    for (const run of raw.runs) {
        const created = run.created_at != null ? new Date(run.created_at) : undefined;
        if (created == null || Number.isNaN(created.getTime())) continue;
        if (latest == null || created.getTime() > latest.getTime()) latest = created;
    }
    return latest;
}

/**
 * Obtém DataHub (novo tipo) com cache por sessão.
 * Usa createDataHub() factory com retry + persistence injection.
 * Consumidor resiliente (dashboards/metrics): em caso de ausência de dados
 * (Camada 7), retorna um hub vazio (warning) em vez de propagar erro — o
 * relatório de PR (pr-report-core main) relança o erro explicitamente.
 *
 * Gap 4 (G4.5): quando `existing` é fornecido, faz fetch incremental — busca
 * apenas runs desde o último run conhecido e faz merge in-place no hub existente,
 * evitando refetch completo (economia de API/quota). Sem `existing`, fetch completo.
 */
export async function getOrFetchDataHub(
    provider: GitProvider,
    repo: string,
    existing?: DataHub,
): Promise<DataHub | undefined> {
    const { createDataHub } = await import('./data-hub/factory.js');
    try {
        const since = existing ? latestRunTimestamp(existing.raw) : undefined;
        const result = await createDataHub(provider, repo, { allowEmpty: true, ...(since ? { since } : {}) });
        const fetched = result.hub;
        // Gap 4: when refreshing an existing hub, merge new runs in-place and keep
        // the same instance (preserving cached data when no new runs arrive).
        if (existing) {
            if (fetched.raw.runs.length > 0) existing.mergeIncremental(fetched.raw);
            return existing;
        }
        return fetched;
    } catch (err) {
        rootLogger.warn(`getOrFetchDataHub failed: ${String(err)}`);
        return undefined;
    }
}
