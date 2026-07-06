import { describe, it, expect } from 'vitest';
import { extractCoverage } from '../../extractors/coverage-extractor.js';

describe('extractCoverage', () => {
    it('R1: CTRF com coverage → retorna RawCoverage', () => {
        const ctrf = {
            results: {
                summary: { passed: 10, failed: 0, skipped: 0 },
                coverage: { total: 200, covered: 171, percentage: 85.5 },
            },
        };
        const result = extractCoverage({ ctrf });
        expect(result).not.toBeNull();
        expect(result!.percentage).toBeCloseTo(85.5);
        expect(result!.total).toBe(200);
        expect(result!.covered).toBe(171);
    });

    it('R2: GitLab coverage string → retorna RawCoverage', () => {
        const result = extractCoverage({ gitlabCoverage: '85.5' });
        expect(result).not.toBeNull();
        expect(result!.percentage).toBeCloseTo(85.5);
    });

    it('R3: Regex no log → retorna RawCoverage', () => {
        const log = 'Coverage: 85.5% (171/200)';
        const result = extractCoverage({ logText: log });
        expect(result).not.toBeNull();
        expect(result!.percentage).toBeCloseTo(85.5);
        expect(result!.total).toBe(200);
        expect(result!.covered).toBe(171);
    });

    it('R4: JSON coverage → retorna RawCoverage', () => {
        const json = { total: 100, covered: 80, percentage: 80 };
        const result = extractCoverage({ jsonCoverage: json });
        expect(result).not.toBeNull();
        expect(result!.percentage).toBe(80);
        expect(result!.total).toBe(100);
        expect(result!.covered).toBe(80);
    });

    it('R5: Sem dados → retorna null', () => {
        const result = extractCoverage({});
        expect(result).toBeNull();
    });

    it('R6: GitHub step summary coverage → retorna RawCoverage', () => {
        const summary = 'Line Coverage: 72.4%';
        const result = extractCoverage({ checkRunSummary: summary });
        expect(result).not.toBeNull();
        expect(result!.percentage).toBeCloseTo(72.4);
    });

    it('R7: Prioridade: CTRF > GitLab > Regex > JSON > User', () => {
        const ctrf = {
            results: {
                summary: { passed: 1, failed: 0, skipped: 0 },
                coverage: { total: 100, covered: 95, percentage: 95 },
            },
        };
        const result = extractCoverage({
            ctrf,
            gitlabCoverage: '50.0',
            logText: 'Coverage: 30%',
        });
        expect(result!.percentage).toBeCloseTo(95);
    });
});
