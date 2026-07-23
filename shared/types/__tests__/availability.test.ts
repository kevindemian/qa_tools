/**
 * FASE: TESTES — fundamentos de disponibilidade (Fase 0).
 *
 * Testa os construtores/guards e o primitivo de renderização `formatAvailableScore`
 * sem nenhum mock: valores reais, comportamento de fronteira explícito.
 */
import { describe, expect, it } from 'vitest';

import {
    available,
    unavailable,
    isAvailable,
    formatAvailableScore,
    type Available,
    type QualityDimension,
} from '../availability.js';

describe('Available<T> — guards e construtores', () => {
    it('available() produz valor disponível e isAvailable() reconhece', () => {
        expect.hasAssertions();

        const a: Available<number> = available(42);

        expect(a.available).toBeTruthy();
        expect(isAvailable(a)).toBeTruthy();
        expect(a).toMatchObject({ available: true, value: 42 });
    });

    it('unavailable() produz valor indisponível e isAvailable() rejeita', () => {
        expect.hasAssertions();

        const a: Available<number> = unavailable('no data');

        expect(a.available).toBeFalsy();
        expect(isAvailable(a)).toBeFalsy();
    });

    it('unavailable sem razão ainda é tipado corretamente', () => {
        expect.hasAssertions();

        const a = unavailable<number>();

        expect(a.available).toBeFalsy();
        expect('reason' in a).toBeFalsy();
    });
});

describe('FormatAvailableScore — zero-silencing', () => {
    const statusFor = (score: number | null, av: boolean): QualityDimension['status'] => {
        if (!av) return 'unknown';
        if (score === null || score < 70) return 'fail';
        return 'pass';
    };
    const make = (score: number | null, av: boolean): QualityDimension => ({
        score,
        available: av,
        status: statusFor(score, av),
    });

    it('valor disponível e finito é formatado como número', () => {
        expect.hasAssertions();
        expect(formatAvailableScore(make(85, true))).toBe('85');
        expect(formatAvailableScore(make(0, true))).toBe('0');
    });

    it('indisponível NUNCA vira 0 — renderiza N/A', () => {
        expect.hasAssertions();
        expect(formatAvailableScore(make(null, false))).toBe('N/A');
        expect(formatAvailableScore(make(0, false))).toBe('N/A');
        expect(formatAvailableScore(make(NaN, true))).toBe('N/A');
    });
});
