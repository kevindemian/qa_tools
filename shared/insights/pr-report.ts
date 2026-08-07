/**
 * Piloto 3 — PR Report Insights.
 *
 * Reconstrução do PR Report como insight: pass rate por requisito
 * (oráculo: `passed/(passed+failed)`), sem multi-run corrompido, sem DOM
 * inflado, sem placeholders.
 *
 * Regra 25: ausência → `[]` (estado explícito). Nunca `0.0%` silencioso quando
 * há testes. Regra 24: pass rate finito 0–100; divisão por zero → 0 explícito;
 * estado inválido → rejeitado com warning estruturado.
 *
 * @module insights/pr-report
 */
import { rootLogger } from '../logger.js';
import { resolveGeneratedAt } from '../date-utils.js';
import type { Insight, InsightEntity, InsightSeverity } from './types.js';
import type { FlatTest } from '../result_parser.js';

const VALID_STATES = new Set(['passed', 'failed', 'skipped']);

function severityForPassRate(passRate: number): InsightSeverity {
    if (!Number.isFinite(passRate)) return 'critical';
    if (passRate < 60) return 'critical';
    if (passRate < 80) return 'high';
    if (passRate < 95) return 'medium';
    if (passRate < 100) return 'low';
    return 'info';
}

/**
 * Gerar insights de PR Report a partir de testes reais.
 *
 * @param tests - FlatTest[] (dado real do pr-report).
 * @param seed  - Timestamp determinístico (resolveGeneratedAt).
 * @returns Insight[] — vazio quando sem testes (Regra 25).
 */
export function generatePrReportInsights(tests: FlatTest[] | null | undefined, seed?: string): Insight[] {
    const generatedAt = resolveGeneratedAt(seed);
    if (!tests || tests.length === 0) {
        return [];
    }

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let invalid = 0;

    for (const test of tests) {
        if (!VALID_STATES.has(test.state)) {
            invalid += 1;
            rootLogger.warn(
                `pr-report-insights: estado inválido "${String(test.state)}" no teste "${test.title}" — excluído da contagem`,
            );
            continue;
        }
        if (test.state === 'passed') passed += 1;
        else if (test.state === 'failed') failed += 1;
        else skipped += 1;
    }

    const considered = passed + failed;
    const passRate = considered > 0 ? (passed / considered) * 100 : 0;
    const total = tests.length;

    const entities: InsightEntity[] = [
        { name: 'passed', type: 'test-count', value: passed },
        { name: 'failed', type: 'test-count', value: failed },
        { name: 'skipped', type: 'test-count', value: skipped },
        { name: 'pass-rate', type: 'pass-rate', value: passRate },
    ];

    const invalidNote = invalid > 0 ? ` ${invalid} teste(s) com estado inválido ignorados.` : '';

    return [
        {
            id: 'pr-report:summary',
            severity: severityForPassRate(passRate),
            category: 'pr-report',
            summary: `Pass rate ${passRate.toFixed(1)}% (${passed}/${considered})`,
            detail: `${total} teste(s) no run: ${passed} passed, ${failed} failed, ${skipped} skipped.${invalidNote}`,
            source: 'pr-report:core',
            entities,
            generatedAt,
        },
    ];
}
