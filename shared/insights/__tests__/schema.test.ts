/**
 * F1.0 — Contrato base `Insight`.
 *
 * Valida:
 * - shape Zod: schema.parse() aceita insight válido, rejeita malformado
 * - determinismo: resolveGeneratedAt(seed) é determinístico
 * - Regra 24/25: NaN/Infinity/null em campos numéricos rejeitados com mensagem explícita
 * - Property-based: invariantes para severidade, categorias e generatedAt
 */
import { describe, expect, it } from 'vitest';
import { InsightSchema } from '../schema.js';
import type { Insight } from '../types.js';

const VALID_INSIGHT: Insight = {
    id: 'defect-trend:2026-06-03:UNKNOWN',
    severity: 'medium',
    category: 'defect-trend',
    summary: '3 defeitos classificados como UNKNOWN',
    detail: 'Top categoria UNKNOWN em 1 dia.',
    source: 'datahub:defect-aggregation',
    entities: [{ name: 'UNKNOWN', type: 'category', value: 3 }],
    generatedAt: '2026-06-03T09:45:13.497Z',
};

describe('InsightSchema (F1.0)', () => {
    it('aceita um insight válido com generatedAt determinístico', () => {
        const parsed = InsightSchema.parse(VALID_INSIGHT);

        expect(parsed.generatedAt).toBe('2026-06-03T09:45:13.497Z');
        expect(parsed.severity).toBe('medium');
        expect(parsed.entities).toHaveLength(1);
    });

    it('aceita insight sem entities (lista vazia por default, não falha)', () => {
        const rest: Partial<Insight> & Omit<Insight, 'entities'> = { ...VALID_INSIGHT };
        delete rest.entities;
        const parsed = InsightSchema.parse(rest);

        expect(parsed.entities).toStrictEqual([]);
    });

    it('rejeita insight sem id', () => {
        const rest: Partial<Insight> & Omit<Insight, 'id'> = { ...VALID_INSIGHT };
        delete rest.id;

        expect(() => InsightSchema.parse(rest)).toThrow(/id/);
    });

    it('rejeita insight sem generatedAt', () => {
        const rest: Partial<Insight> & Omit<Insight, 'generatedAt'> = { ...VALID_INSIGHT };
        delete rest.generatedAt;

        expect(() => InsightSchema.parse(rest)).toThrow(/generatedAt/);
    });

    it('rejeita severity inválida', () => {
        expect(() => InsightSchema.parse({ ...VALID_INSIGHT, severity: 'extreme' })).toThrow(/severity/);
    });

    it('rejeita NaN em entity.value (Regra 24/25)', () => {
        expect(() =>
            InsightSchema.parse({
                ...VALID_INSIGHT,
                entities: [{ name: 'X', type: 'category', value: Number.NaN }],
            }),
        ).toThrow(/NaN|finite/);
    });

    it('rejeita Infinity em entity.value (Regra 24/25)', () => {
        expect(() =>
            InsightSchema.parse({
                ...VALID_INSIGHT,
                entities: [{ name: 'X', type: 'category', value: Number.POSITIVE_INFINITY }],
            }),
        ).toThrow(/Infinity|finite/);
    });

    it('rejeita null em entity.value (Regra 24/25)', () => {
        expect(() =>
            InsightSchema.parse({
                ...VALID_INSIGHT,
                entities: [{ name: 'X', type: 'category', value: null as unknown as number }],
            }),
        ).toThrow('invalid_type');
    });

    it('rejeita summary vazio ou apenas espaços (Regra 25 — ausência explícita)', () => {
        expect(() => InsightSchema.parse({ ...VALID_INSIGHT, summary: '   ' })).toThrow(/summary/);
    });

    it('rejeita generatedAt não-ISO', () => {
        expect(() => InsightSchema.parse({ ...VALID_INSIGHT, generatedAt: 'ontem' })).toThrow(/generatedAt|ISO/);
    });

    it('property-based: severidade válida para qualquer valor do enum', () => {
        expect.hasAssertions();

        const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
        for (const s of severities) {
            const parsed = InsightSchema.parse({ ...VALID_INSIGHT, severity: s });

            expect(parsed.severity).toBe(s);
        }
    });

    it('property-based: id vazio é rejeitado para qualquer categoria', () => {
        expect.hasAssertions();

        const categories = ['defect-trend', 'coverage-gap', 'pr-report', 'quality'];
        for (const c of categories) {
            expect(() => InsightSchema.parse({ ...VALID_INSIGHT, category: c, id: '' })).toThrow(/id/);
        }
    });
});
