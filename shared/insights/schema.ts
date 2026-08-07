/**
 * Camada de Insights — schema Zod de validação.
 *
 * Valida o contrato `Insight` (Regra 25: ausência → falha explícita, nunca
 * silêncio). Regra 24: rejeita NaN/Infinity/null em campos numéricos com
 * mensagem explícita.
 *
 * @module insights/schema
 */
import { z } from 'zod';

const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const InsightEntitySchema = z
    .object({
        name: z.string().min(1, 'InsightEntity.name não pode ser vazio'),
        type: z.string().min(1, 'InsightEntity.type não pode ser vazio'),
        value: z
            .number('InsightEntity.value deve ser número finito')
            .refine(Number.isFinite, 'InsightEntity.value deve ser finito (NaN/Infinity rejeitado) — Regra 24')
            .optional(),
    })
    .strict();

export const InsightSchema = z
    .object({
        id: z.string().min(1, 'Insight.id não pode ser vazio'),
        severity: z.enum(
            ['critical', 'high', 'medium', 'low', 'info'],
            'Insight.severity inválida (esperado critical|high|medium|low|info)',
        ),
        category: z.enum(
            ['defect-trend', 'coverage-gap', 'pr-report'],
            'Insight.category inválida (esperado defect-trend|coverage-gap|pr-report)',
        ),
        summary: z
            .string()
            .min(1, 'Insight.summary não pode ser vazio')
            .refine((s) => s.trim().length > 0, 'Insight.summary não pode ser apenas espaços — Regra 25'),
        detail: z.string().min(1, 'Insight.detail não pode ser vazio'),
        source: z.string().min(1, 'Insight.source não pode ser vazio'),
        entities: z.array(InsightEntitySchema).default([]),
        generatedAt: z
            .string()
            .min(1, 'Insight.generatedAt não pode ser vazio')
            .refine(
                (s) => isoInstantPattern.test(s),
                'Insight.generatedAt deve ser ISO-8601 UTC (ex.: 2026-06-03T09:45:13.497Z)',
            ),
    })
    .strict();
