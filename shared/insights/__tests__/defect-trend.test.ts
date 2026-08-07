/**
 * F1.1 — Piloto 1: `generateDefectTrendInsights`.
 *
 * Valida:
 * - agregação conferida contra dados REAIS (fixture failure-classifications-1554-real.json)
 * - shape Zod validado pelo InsightSchema
 * - determinismo via resolveGeneratedAt(seed)
 * - Regra 25: ausência → estado explícito (sem 0.0%/placeholder silencioso)
 * - Regra 24: NaN/Infinity nunca entram nos insights
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateDefectTrendInsights } from '../defect-trend.js';
import { InsightSchema } from '../schema.js';
import { nonNull } from '../../test-utils.js';
import type { FailureClassification } from '../../types/data-hub.js';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-utils/fixtures/ci');

function loadRealFailures(): FailureClassification[] {
    const raw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'failure-classifications-1554-real.json'), 'utf8')) as {
        records: FailureClassification[];
    };
    return raw.records;
}

const SEED = '2026-06-03T09:45:13.497Z';

describe('GenerateDefectTrendInsights (F1.1)', () => {
    it('produz insights com contagens corretas a partir de fixture real (1554 records)', () => {
        const records = loadRealFailures();
        const insights = generateDefectTrendInsights(records, SEED);

        expect(insights.length).toBeGreaterThan(0);

        const summary = nonNull(insights.find((i) => i.id === 'defect-trend:summary'));

        expect(summary.detail).toContain('1554');
        expect(summary.generatedAt).toBe(SEED);
        expect(summary.source).toContain('datahub:defect-aggregation');
    });

    it('produz um insight por top category com value finito (Regra 24)', () => {
        expect.hasAssertions();

        const records = loadRealFailures();
        const insights = generateDefectTrendInsights(records, SEED);
        const categoryInsights = insights.filter((i) => i.id.startsWith('defect-trend:category:'));

        expect(categoryInsights.length).toBeGreaterThan(0);

        for (const i of categoryInsights) {
            expect(Number.isFinite(i.entities?.[0]?.value)).toBeTruthy();
            expect(i.entities?.[0]?.name).toBeTruthy();
        }
    });

    it('todos os insights validam o schema Zod', () => {
        expect.hasAssertions();

        const records = loadRealFailures();
        const insights = generateDefectTrendInsights(records, SEED);
        for (const insight of insights) {
            expect(() => InsightSchema.parse(insight)).not.toThrow();
        }
    });

    it('é determinístico: mesmo seed → mesmo output', () => {
        const records = loadRealFailures();
        const a = generateDefectTrendInsights(records, SEED);
        const b = generateDefectTrendInsights(records, SEED);

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('regra 25: sem records → insights vazios (estado explícito, não placeholder)', () => {
        const insights = generateDefectTrendInsights(null, SEED);

        expect(insights).toStrictEqual([]);

        const insightsEmpty = generateDefectTrendInsights([], SEED);

        expect(insightsEmpty).toStrictEqual([]);
    });

    it('regra 25: record com timestamp inválido não é descartado silenciosamente', () => {
        const bad: FailureClassification[] = [
            { timestamp: 'not-a-date', testTitle: 'x', category: 'REGRESSION', project: 'p' },
        ];
        const insights = generateDefectTrendInsights(bad, SEED);

        expect(insights.length).toBeGreaterThan(0);
        expect(nonNull(insights.find((i) => i.id === 'defect-trend:summary')).detail).toContain('1');
    });

    it('regra 24: categoria com contagem não-finite nunca gera insight inválido', () => {
        expect.hasAssertions();

        const records = loadRealFailures();
        const insights = generateDefectTrendInsights(records, SEED);
        for (const i of insights) {
            const values = (i.entities ?? []).map((e) => e.value).filter((v): v is number => v !== undefined);
            for (const value of values) {
                expect(Number.isFinite(value)).toBeTruthy();
            }
        }
    });
});
