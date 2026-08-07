/**
 * Piloto 1 — Defect Trend Insights.
 *
 * Extrai a lógica de agregação do defect-trend renderer para a camada de
 * insights. A agregação SSOT vive em `shared/data-hub/compute/defect-aggregation.ts`
 * (`aggregateDefectTrends`); este módulo converte o resultado em `Insight[]`
 * validáveis por `InsightSchema`.
 *
 * Regra 25: ausência de records → `[]` (estado explícito, nunca placeholder).
 * Regra 24: contagens finitas via `aggregateDefectTrends` (SSOT já saneado).
 *
 * @module insights/defect-trend
 */
import { resolveGeneratedAt } from '../date-utils.js';
import { aggregateDefectTrends } from '../data-hub/compute/defect-aggregation.js';
import type { Insight, InsightEntity, InsightSeverity } from './types.js';
import type { FailureClassification } from '../types/data-hub.js';

const SEVERITY_BY_COUNT: Array<{ min: number; severity: InsightSeverity }> = [
    { min: 50, severity: 'critical' },
    { min: 20, severity: 'high' },
    { min: 5, severity: 'medium' },
    { min: 1, severity: 'low' },
];

function severityForCount(count: number): InsightSeverity {
    if (!Number.isFinite(count) || count <= 0) return 'info';
    for (const tier of SEVERITY_BY_COUNT) {
        if (count >= tier.min) return tier.severity;
    }
    return 'info';
}

/**
 * Gerar insights de Defect Trend a partir de failure classifications reais.
 *
 * @param records - FailureClassification[] do DataHub (raw.failureClassifications).
 * @param seed    - Timestamp determinístico (resolveGeneratedAt).
 * @returns Insight[] — vazio quando não há records (Regra 25), nunca placeholder.
 */
export function generateDefectTrendInsights(
    records: FailureClassification[] | null | undefined,
    seed?: string,
): Insight[] {
    const generatedAt = resolveGeneratedAt(seed);
    const result = aggregateDefectTrends(records);

    if (result.totalRecords === 0) {
        return [];
    }

    const insights: Insight[] = [];
    const periodText =
        result.period.from && result.period.to ? `${result.period.from} a ${result.period.to}` : 'período indefinido';

    const topCategory = result.topCategories[0];
    const topText = topCategory ? `${topCategory.category} (${topCategory.count})` : 'sem categoria';

    const summaryEntities: InsightEntity[] = result.topCategories.slice(0, 5).map((c) => ({
        name: c.category,
        type: 'category',
        value: c.count,
    }));

    insights.push({
        id: 'defect-trend:summary',
        severity: severityForCount(result.totalRecords),
        category: 'defect-trend',
        summary: `${result.totalRecords} defeitos classificados em ${periodText}`,
        detail: `Top categoria: ${topText}. ${result.trends.length} data(s) no período.`,
        source: 'datahub:defect-aggregation',
        entities: summaryEntities,
        generatedAt,
    });

    for (const cat of result.topCategories) {
        insights.push({
            id: `defect-trend:category:${cat.category}`,
            severity: severityForCount(cat.count),
            category: 'defect-trend',
            summary: `${cat.count} defeito(s) em ${cat.category}`,
            detail: `Categoria ${cat.category} responde por ${cat.count} do total de ${result.totalRecords} defeitos.`,
            source: 'datahub:defect-aggregation',
            entities: [{ name: cat.category, type: 'category', value: cat.count }],
            generatedAt,
        });
    }

    return insights;
}
