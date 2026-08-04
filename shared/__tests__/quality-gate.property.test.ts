/**
 * Property-Based Tests — Quality Gate Markdown Builder (FT-10)
 *
 * Dimensão 5 — Métricas:
 * - `buildQualityGateSectionMd` (pr-report-core): invariantes de formatação markdown
 *
 * Nota: `formatQualityGateJson`/`formatQualityGateText` (quality-gate) foram
 * removidos como dead code (zero produtores em produção). A formatação markdown
 * do gate agora vive em `pr-report-core.buildQualityGateSectionMd` (SSOT) — é ela
 * que alimenta o PR comment e o check-run summary. O PBT foi repivotado para
 * esse builder (Rule 19.6: propriedades sobre lógica crítica de formatação).
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildQualityGateSectionMd } from '../pr-report-core.js';
import type { QualityGateResult } from '../quality/quality-gate.js';

/* ── Arbitraries ─────────────────────────────────────────────── */

const PassFailArb = fc.constantFrom('pass' as const, 'fail' as const);

const GateCheckArb: fc.Arbitrary<QualityGateResult['checks'][0]> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    status: PassFailArb,
    score: fc.integer({ min: 0, max: 100 }),
    threshold: fc.integer({ min: 0, max: 100 }),
    details: fc.string({ minLength: 0, maxLength: 50 }),
});

const QualityGateResultArb: fc.Arbitrary<QualityGateResult> = fc.record({
    overall: PassFailArb,
    checks: fc.array(GateCheckArb, { minLength: 0, maxLength: 10 }),
    score: fc.integer({ min: 0, max: 100 }),
});

/* ── Properties — buildQualityGateSectionMd ──────────────────── */

describe('BuildQualityGateSectionMd — property-based', () => {
    it('always contains the Quality Gate header', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const md = buildQualityGateSectionMd(result);

                expect(md).toContain('## Quality Gate:');
            }),
            { numRuns: 100 },
        );
    });

    it('reflects overall verdict word in output', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const md = buildQualityGateSectionMd(result);
                const expected = result.overall === 'pass' ? 'PASSED' : 'FAILED';

                expect(md).toContain(expected);
            }),
            { numRuns: 100 },
        );
    });

    it('lists every check name in the checks table', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const md = buildQualityGateSectionMd(result);
                for (const check of result.checks) {
                    expect(md).toContain(check.name.replace(/\|/g, '\\|'));
                }
            }),
            { numRuns: 100 },
        );
    });

    it('includes score for each check', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const md = buildQualityGateSectionMd(result);
                for (const check of result.checks) {
                    expect(md).toContain(String(check.score));
                }
            }),
            { numRuns: 100 },
        );
    });

    it('renders EIXO-C line when incomplete items exist, never silently', () => {
        expect.hasAssertions();

        const withIncomplete: fc.Arbitrary<QualityGateResult> = fc.record({
            overall: PassFailArb,
            checks: fc.array(GateCheckArb, { minLength: 0, maxLength: 10 }),
            score: fc.integer({ min: 0, max: 100 }),
            incompleteItems: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 5 }),
        });

        fc.assert(
            fc.property(withIncomplete, (result) => {
                const md = buildQualityGateSectionMd(result);

                expect(md).toContain('Dados ausentes (EIXO C)');
            }),
            { numRuns: 100 },
        );
    });

    it('never renders NaN for non-finite scores — N/A instead (Rule 24/25)', () => {
        expect.hasAssertions();

        const nonFiniteArb: fc.Arbitrary<QualityGateResult> = fc.record({
            overall: PassFailArb,
            checks: fc.array(GateCheckArb, { minLength: 0, maxLength: 10 }),
            score: fc.constantFrom(NaN, Infinity, -Infinity),
        });

        fc.assert(
            fc.property(nonFiniteArb, (result) => {
                const md = buildQualityGateSectionMd(result);

                expect(md).not.toContain('NaN');
                expect(md).toContain('N/A');
            }),
            { numRuns: 100 },
        );
    });

    it('escapes pipe characters in user-derived strings (no column injection)', () => {
        expect.hasAssertions();

        const escapingArb: fc.Arbitrary<QualityGateResult> = fc.record({
            overall: PassFailArb,
            checks: fc.array(
                fc.record({
                    name: fc.constantFrom('a|b', 'evil|col'),
                    status: PassFailArb,
                    score: fc.integer({ min: 0, max: 100 }),
                    threshold: fc.integer({ min: 0, max: 100 }),
                    details: fc.constantFrom(''),
                }),
                { minLength: 1, maxLength: 3 },
            ),
            score: fc.integer({ min: 0, max: 100 }),
        });

        fc.assert(
            fc.property(escapingArb, (result) => {
                const md = buildQualityGateSectionMd(result);
                for (const check of result.checks) {
                    expect(md).toContain(check.name.replace(/\|/g, '\\|'));
                }
            }),
            { numRuns: 100 },
        );
    });
});
