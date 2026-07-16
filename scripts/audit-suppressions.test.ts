import { describe, it, expect } from 'vitest';
import { thresholdForCount, computeExpectedThreshold, THRESHOLD_TABLE } from './audit-suppressions.js';

describe('Audit-suppressions threshold mapping (C1)', () => {
    it('mapeia contador para teto conforme tabela hardcoded', () => {
        expect(thresholdForCount(306)).toBe(50);
        expect(thresholdForCount(250)).toBe(50);
        expect(thresholdForCount(200)).toBe(60);
        expect(thresholdForCount(150)).toBe(60);
        expect(thresholdForCount(120)).toBe(70);
        expect(thresholdForCount(50)).toBe(70);
        expect(thresholdForCount(0)).toBe(75);
    });

    it('tabela hardcoded nao pode ser alterada (imutabilidade)', () => {
        expect(THRESHOLD_TABLE).toStrictEqual([
            [306, 50],
            [200, 60],
            [120, 70],
            [0, 75],
        ]);
    });

    it('sem trava temporal: teto segue o contador', () => {
        const recent = new Date().toISOString().slice(0, 10);

        expect(computeExpectedThreshold(306, recent)).toBe(50);
        expect(computeExpectedThreshold(0, recent)).toBe(75);
    });

    it('trava temporal de 90d: sobe o teto mesmo com contador alto', () => {
        const old = '2000-01-01';

        expect(computeExpectedThreshold(306, old)).toBe(75);
        expect(computeExpectedThreshold(200, old)).toBe(75);
    });
});
