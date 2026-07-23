/**
 * FASE: TESTES — robustez Fase 1 (C5): dado indisponível vira `unknown`, nunca `fail` forçado.
 *
 * Sem mock de lógica interna: `calculateHealthScore` exercitado com fixture real de DataHub
 * (via factory) onde uma métrica é intencionalmente não-finita (NaN = ausente/outage).
 *
 * Invariante (AGENTS.md §24/§25 + decisão do usuário): uma dimensão faltante NÃO deve ser
 * coerida a 0 nem forçar o quality gate a `fail`. Ela deve ser `available:false`,
 * `status:'unknown'`, e o gate agregado `unknown`.
 */
import { describe, expect, it } from 'vitest';

import { calculateHealthScore, evaluateQualityGate } from '../quality/health-score.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';
import type { ComputedMetrics } from '../types/data-hub.js';

function createHub(overrides: Partial<ComputedMetrics>): ReturnType<typeof makeDataHubMock> {
    return makeDataHubMock({
        computed: {
            passRate: 95,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            coverage: 90,
            executionRate: 100,
            flakyPercentage: 0,
            testPassRate: 95,
            testCounts: { passed: 95, failed: 5, skipped: 0, total: 100 },
            framework: 'vitest',
            ...overrides,
        },
    });
}

describe('Fase1: dimensão faltante => unknown (não fail forçado)', () => {
    it('coverage não-finito => dimensão indisponível, status unknown, gate unknown', () => {
        expect.hasAssertions();

        const hub = createHub({ coverage: Number.NaN });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.coverage.available).toBeFalsy();
        expect(result.dimensions.coverage.status).toBe('unknown');
        expect(result.qualityGate).toBe('unknown');
    });

    it('evaluateQualityGate com métrica não-finita => unknown', () => {
        expect.hasAssertions();
        expect(evaluateQualityGate(95, 0, Number.NaN, 100, 2)).toBe('unknown');
        expect(evaluateQualityGate(Number.NaN, 0, 90, 100, 2)).toBe('unknown');
    });

    it('dado presente porém abaixo do limiar AINDA falha (não mascarado por unknown)', () => {
        expect.hasAssertions();

        const hub = createHub({
            passRate: 50,
            coverage: 42,
            executionRate: 100,
            suiteSpeedP95: 500,
            flakyPercentage: 0,
        });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.passRate.available).toBeTruthy();
        expect(result.qualityGate).toBe('fail');
    });

    it('composite renormaliza sobre dimensões disponíveis (ausente não arrasta a 0)', () => {
        expect.hasAssertions();

        const hub = createHub({ coverage: Number.NaN });
        const result = calculateHealthScore({ dataHub: hub });

        // passRate 95, executionRate 100, suiteSpeed 500, flaky 0 => todas ~100; coverage excluída.
        // overall deve refletir ~100, não um valor baixo fabricado por cobertura ausente.
        expect(result.overall).toBeGreaterThan(70);
        expect(result.dimensions.coverage.available).toBeFalsy();
    });

    it('todas as dimensões disponíveis => gate pass quando dentro dos limiares', () => {
        expect.hasAssertions();

        const hub = createHub({
            passRate: 95,
            coverage: 90,
            executionRate: 100,
            suiteSpeedP95: 500,
            flakyPercentage: 0,
        });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.qualityGate).toBe('pass');
        expect(result.dimensions.coverage.available).toBeTruthy();
    });
});
