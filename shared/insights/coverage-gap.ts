/**
 * Piloto 2 — Coverage Gap Insights.
 *
 * Extrai observações de coverage gap a partir da análise de cobertura.
 * A agregação SSOT vive em `shared/data-hub/compute/coverage-gap.ts`
 * (`computeCoverageGap`) / `shared/primitives/coverage-utils.js`.
 *
 * Este módulo recebe um resumo agregável (epics com total/covered) e produz
 * `Insight[]` validáveis por `InsightSchema`.
 *
 * Regra 25: ausência de dados → `[]` (estado explícito). Nunca `undefined%`.
 * Regra 24: divisão por zero/valores negativos → guards explícitos, nunca
 * percentual inválido silencioso.
 *
 * @module insights/coverage-gap
 */
import { resolveGeneratedAt } from '../date-utils.js';
import type { Insight, InsightEntity, InsightSeverity } from './types.js';

/** Entrada agregável de cobertura por epic (subconjunto de CoverageGapItem/EpicCoverage). */
export interface CoverageGapEpicInput {
    summary: string;
    type?: string;
    total: number;
    covered: number;
}

const MIN_GAP_THRESHOLD = 50;

function severityForCoverage(pct: number): InsightSeverity {
    if (!Number.isFinite(pct)) return 'critical';
    if (pct < 30) return 'critical';
    if (pct < 50) return 'high';
    if (pct < 70) return 'medium';
    if (pct < 90) return 'low';
    return 'info';
}

/**
 * Calcular percentual de cobertura com guards explícitos (Regra 24).
 * Retorna undefined quando o total é inválido (não-finito/negativo) — o caller
 * converte em estado explícito, nunca em `undefined%` renderizado.
 */
function coveragePct(total: number, covered: number): number | undefined {
    if (!Number.isFinite(total) || !Number.isFinite(covered) || total < 0 || covered < 0 || covered > total) {
        return undefined;
    }
    if (total === 0) return 0;
    return (covered / total) * 100;
}

/**
 * Gerar insights de coverage gap a partir de epics com contagens de cobertura.
 *
 * @param epics - EpicFixture[] agregadas (summary, total, covered) — dados reais.
 * @param seed  - Timestamp determinístico (resolveGeneratedAt).
 * @returns Insight[] — vazio quando sem dados; resumo + insights por epic com gap.
 */
export function generateCoverageGapInsights(
    epics: CoverageGapEpicInput[] | null | undefined,
    seed?: string,
): Insight[] {
    const generatedAt = resolveGeneratedAt(seed);
    if (!epics || epics.length === 0) {
        return [];
    }

    let invalidCount = 0;
    const validEpics: Array<CoverageGapEpicInput & { pct: number | undefined }> = [];

    for (const epic of epics) {
        const pct = coveragePct(epic.total, epic.covered);
        if (pct === undefined) {
            invalidCount += 1;
        }
        validEpics.push({ ...epic, pct });
    }

    const totalIssues = validEpics.reduce((s, e) => s + (Number.isFinite(e.total) && e.total > 0 ? e.total : 0), 0);
    const coveredIssues = validEpics.reduce(
        (s, e) => s + (Number.isFinite(e.covered) && e.covered > 0 ? e.covered : 0),
        0,
    );
    const overallPct = coveragePct(totalIssues, coveredIssues) ?? 0;

    const gapped = validEpics.filter((e) => e.pct !== undefined && e.pct < MIN_GAP_THRESHOLD);

    const insights: Insight[] = [];
    const summaryEntities: InsightEntity[] = [
        { name: 'total-issues', type: 'coverage', value: totalIssues },
        { name: 'covered-issues', type: 'coverage', value: coveredIssues },
        { name: 'coverage-pct', type: 'coverage-pct', value: overallPct },
        { name: 'gapped-epics', type: 'coverage', value: gapped.length },
    ];

    const invalidNote = invalidCount > 0 ? ` ${invalidCount} epic(s) com dados inválidos ignorados.` : '';
    insights.push({
        id: 'coverage-gap:summary',
        severity: severityForCoverage(overallPct),
        category: 'coverage-gap',
        summary: `Cobertura geral ${overallPct.toFixed(1)}% (${coveredIssues}/${totalIssues} issues cobertas)`,
        detail: `${validEpics.length} epic(s) analisados; ${gapped.length} abaixo de ${MIN_GAP_THRESHOLD}%.${invalidNote}`,
        source: 'coverage-gap:compute',
        entities: summaryEntities,
        generatedAt,
    });

    for (const epic of gapped) {
        const pct = epic.pct as number;
        insights.push({
            id: `coverage-gap:epic:${epic.summary}`,
            severity: severityForCoverage(pct),
            category: 'coverage-gap',
            summary: `Epic "${epic.summary}" com ${pct.toFixed(1)}% de cobertura (${epic.covered}/${epic.total})`,
            detail: `Abaixo do limiar de ${MIN_GAP_THRESHOLD}%. Requer testes vinculados para reduzir o gap.`,
            source: 'coverage-gap:compute',
            entities: [
                { name: epic.summary, type: 'epic' },
                { name: 'coverage-pct', type: 'coverage-pct', value: pct },
            ],
            generatedAt,
        });
    }

    return insights;
}
