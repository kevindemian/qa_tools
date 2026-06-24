/**
 * Property-Based Tests — Quality Gate (FT-10)
 *
 * Dimensão 5 — Métricas:
 * - formatQualityGateJson: valid JSON round-trip
 * - formatQualityGateText: invariantes de formatação
 * - runQualityGate (pure path): overall sempre pass/fail, score em [0,100]
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatQualityGateJson, formatQualityGateText } from '../quality-gate.js';
import type { QualityGateResult } from '../quality-gate.js';

/* ── Arbitraries ─────────────────────────────────────────────── */

const PassFailArb = fc.constantFrom('pass' as const, 'fail' as const);

const GateCheckArb: fc.Arbitrary<QualityGateResult['checks'][0]> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    status: PassFailArb,
    score: fc.nat({ max: 100 }),
    threshold: fc.nat({ max: 100 }),
    details: fc.string({ minLength: 0, maxLength: 50 }),
});

const QualityGateResultArb: fc.Arbitrary<QualityGateResult> = fc.record({
    overall: PassFailArb,
    checks: fc.array(GateCheckArb, { minLength: 0, maxLength: 10 }),
    score: fc.nat({ max: 100 }),
});

/* ── Integration-style PBT with real metrics ─────────────────── */
// Skipping runQualityGate PBT — requires filesystem + module reset per iteration.
// Integration tests in quality-gate.integration.test.ts cover that path.

/* ── Properties — formatQualityGateJson ──────────────────────── */

describe('FormatQualityGateJson — property-based', () => {
    it('produces valid JSON and round-trips', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const json = formatQualityGateJson(result);
                const parsed: unknown = JSON.parse(json);

                expect(parsed).toHaveProperty('overall', result.overall);
                expect(parsed).toHaveProperty('score', result.score);
            }),
            { numRuns: 100 },
        );
    });
});

/* ── Properties — formatQualityGateText ──────────────────────── */

describe('FormatQualityGateText — property-based', () => {
    it('always contains Quality Gate header', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const text = formatQualityGateText(result);

                expect(text).toContain('Quality Gate');
            }),
            { numRuns: 100 },
        );
    });

    it('overall PASS/FAIL appears in output', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const text = formatQualityGateText(result);
                if (result.overall === 'pass') {
                    expect(text).toContain('PASS');
                } else {
                    expect(text).toContain('FAIL');
                }
            }),
            { numRuns: 100 },
        );
    });

    it('lists all check names in output', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const text = formatQualityGateText(result);
                for (const check of result.checks) {
                    expect(text).toContain(check.name);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('includes check score for each check', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const text = formatQualityGateText(result);
                for (const check of result.checks) {
                    expect(text).toContain(String(check.score));
                }
            }),
            { numRuns: 100 },
        );
    });

    it('score appears in output', () => {expect.hasAssertions();

        fc.assert(
            fc.property(QualityGateResultArb, (result) => {
                const text = formatQualityGateText(result);

                expect(text).toContain(String(result.score));
            }),
            { numRuns: 100 },
        );
    });
});
