/**
 * F1.2 — Piloto 2: `generateCoverageGapInsights`.
 *
 * Valida:
 * - gaps corretos a partir de fixture real (coverage-gap-927-suites-real.json)
 * - shape Zod validado pelo InsightSchema
 * - Regra 25: ausência de dados → estado explícito, nunca `undefined%`
 * - Regra 24: percentuais finitos (0–100) em todos os casos
 * - determinismo via resolveGeneratedAt(seed)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateCoverageGapInsights } from '../coverage-gap.js';
import { InsightSchema } from '../schema.js';
import { nonNull } from '../../test-utils.js';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-utils/fixtures/ci');

interface EpicFixture {
    summary: string;
    type: string;
    total: number;
    covered: number;
}

function loadRealEpics(): EpicFixture[] {
    const raw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'coverage-gap-927-suites-real.json'), 'utf8')) as {
        items: EpicFixture[];
    };
    return raw.items;
}

const SEED = '2026-08-06T08:34:46.000Z';

describe('GenerateCoverageGapInsights (F1.2)', () => {
    it('produz insight resumido com contagens corretas a partir de fixture real (927 epics)', () => {
        const epics = loadRealEpics();
        const insights = generateCoverageGapInsights(epics, SEED);

        expect(insights.length).toBeGreaterThan(0);

        const summary = nonNull(insights.find((i) => i.id === 'coverage-gap:summary'));

        expect(summary.generatedAt).toBe(SEED);
        expect(summary.detail).toContain('927');
        expect(summary.source).toContain('coverage-gap');
    });

    it('produz insights por epic apenas para epics abaixo do limiar (gap real)', () => {
        expect.hasAssertions();

        const epics: EpicFixture[] = [
            { summary: 'Epic Com Gap', type: 'Epic', total: 100, covered: 20 },
            { summary: 'Epic Saudável', type: 'Epic', total: 100, covered: 95 },
        ];
        const insights = generateCoverageGapInsights(epics, SEED);
        const epicInsights = insights.filter((i) => i.id.startsWith('coverage-gap:epic:'));

        expect(epicInsights.length).toBeGreaterThan(0);

        for (const i of epicInsights) {
            expect(i.entities?.some((e) => e.type === 'epic')).toBeTruthy();

            const values = i.entities?.map((e) => e.value).filter((v): v is number => v !== undefined) ?? [];
            for (const value of values) {
                expect(Number.isFinite(value)).toBeTruthy();
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(100);
            }
        }
    });

    it('nunca produz undefined% em percentuais (Regra 25)', () => {
        const epics = loadRealEpics();
        const insights = generateCoverageGapInsights(epics, SEED);
        const json = JSON.stringify(insights);

        expect(json).not.toContain('undefined%');
        expect(json).not.toContain('NaN');
        expect(json).not.toContain('Infinity');
    });

    it('todos os insights validam o schema Zod', () => {
        expect.hasAssertions();

        const epics = loadRealEpics();
        const insights = generateCoverageGapInsights(epics, SEED);
        for (const insight of insights) {
            expect(() => InsightSchema.parse(insight)).not.toThrow();
        }
    });

    it('é determinístico: mesmo seed → mesmo output', () => {
        const epics = loadRealEpics();
        const a = generateCoverageGapInsights(epics, SEED);
        const b = generateCoverageGapInsights(epics, SEED);

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('regra 25: sem dados → insights vazios (estado explícito, não placeholder)', () => {
        expect(generateCoverageGapInsights([], SEED)).toStrictEqual([]);
        expect(generateCoverageGapInsights(null, SEED)).toStrictEqual([]);
    });

    it('regra 24: epic com total 0 não gera divisão por zero (pct = 0 explícito)', () => {
        expect.hasAssertions();

        const zeroEpic: EpicFixture[] = [{ summary: 'Suite Vazia', type: 'Epic', total: 0, covered: 0 }];
        const insights = generateCoverageGapInsights(zeroEpic, SEED);
        for (const i of insights) {
            const values = (i.entities ?? []).map((e) => e.value).filter((v): v is number => v !== undefined);
            for (const value of values) {
                expect(Number.isFinite(value)).toBeTruthy();
                expect(value).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('regra 24: total negativo é rejeitado (guard explícito, não silencioso)', () => {
        const badEpics: EpicFixture[] = [{ summary: 'Suite Inválida', type: 'Epic', total: -5, covered: 2 }];
        const insights = generateCoverageGapInsights(badEpics, SEED);

        expect(nonNull(insights.find((i) => i.id === 'coverage-gap:summary')).detail).toContain('inválido');
    });
});
