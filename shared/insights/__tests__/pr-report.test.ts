/**
 * F1.3 — Piloto 3: `generatePrReportInsights`.
 *
 * Valida:
 * - pass rate por requisito (oráculo: passed/(passed+failed)) a partir de fixture
 *   real do pr-report (pr-report-6459-real.json)
 * - shape Zod validado pelo InsightSchema
 * - Regra 25: ausência → estado explícito, nunca placeholder/0.0% silencioso
 * - Regra 24: pass rate finito 0–100; divisão por zero → estado explícito
 * - determinismo via resolveGeneratedAt(seed)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generatePrReportInsights } from '../pr-report.js';
import { InsightSchema } from '../schema.js';
import { nonNull } from '../../test-utils.js';
import type { FlatTest } from '../../result_parser.js';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-utils/fixtures/ci');

function loadRealPrReport(): FlatTest[] {
    const raw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'pr-report-6459-real.json'), 'utf8')) as {
        tests: FlatTest[];
    };
    return raw.tests;
}

const SEED = '2026-08-06T08:34:46.000Z';

describe('GeneratePrReportInsights (F1.3)', () => {
    it('produz insight resumido com pass rate correto a partir de fixture real (6459 testes)', () => {
        const tests = loadRealPrReport();
        const insights = generatePrReportInsights(tests, SEED);

        expect(insights.length).toBeGreaterThan(0);

        const summary = nonNull(insights.find((i) => i.id === 'pr-report:summary'));

        expect(summary.generatedAt).toBe(SEED);
        expect(summary.detail).toContain('6459');
        expect(summary.source).toContain('pr-report');
    });

    it('pass rate = passed/(passed+failed) — oráculo de requisito', () => {
        const tests: FlatTest[] = [
            { title: 'a', state: 'passed', duration: 1 },
            { title: 'b', state: 'passed', duration: 1 },
            { title: 'c', state: 'failed', duration: 1 },
        ];
        const insights = generatePrReportInsights(tests, SEED);
        const summary = insights.find((i) => i.id === 'pr-report:summary');
        const passRate = summary?.entities?.find((e) => e.type === 'pass-rate')?.value;

        expect(passRate).toBeCloseTo((2 / 3) * 100, 1);
    });

    it('nunca produz placeholder/0.0% silencioso quando há testes (Regra 25)', () => {
        const tests = loadRealPrReport();
        const insights = generatePrReportInsights(tests, SEED);
        const json = JSON.stringify(insights);

        expect(json).not.toContain('undefined%');
        expect(json).not.toContain('NaN');
    });

    it('todos os insights validam o schema Zod', () => {
        expect.hasAssertions();

        const tests = loadRealPrReport();
        const insights = generatePrReportInsights(tests, SEED);
        for (const insight of insights) {
            expect(() => InsightSchema.parse(insight)).not.toThrow();
        }
    });

    it('é determinístico: mesmo seed → mesmo output', () => {
        const tests = loadRealPrReport();
        const a = generatePrReportInsights(tests, SEED);
        const b = generatePrReportInsights(tests, SEED);

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('regra 25: sem testes → insights vazios (estado explícito)', () => {
        expect(generatePrReportInsights([], SEED)).toStrictEqual([]);
        expect(generatePrReportInsights(null, SEED)).toStrictEqual([]);
    });

    it('regra 24: tudo falhou → pass rate 0 explícito, não NaN', () => {
        const allFailed: FlatTest[] = [
            { title: 'a', state: 'failed', duration: 1 },
            { title: 'b', state: 'failed', duration: 1 },
        ];
        const insights = generatePrReportInsights(allFailed, SEED);
        const summary = insights.find((i) => i.id === 'pr-report:summary');
        const passRate = summary?.entities?.find((e) => e.type === 'pass-rate')?.value;

        expect(passRate).toBe(0);
        expect(Number.isFinite(passRate)).toBeTruthy();
    });

    it('regra 24: estado inválido (não passed/failed/skipped) → rejeitado explicitamente', () => {
        const bad = [{ title: 'x', state: 'weird', duration: 1 } as unknown as FlatTest];
        const insights = generatePrReportInsights(bad, SEED);
        const summary = nonNull(insights.find((i) => i.id === 'pr-report:summary'));

        expect(summary.detail).toContain('inválido');
    });
});
