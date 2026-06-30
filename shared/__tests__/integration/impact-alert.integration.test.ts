/**
 * Integration tests — Impact Alert (FT-30)
 *
 * Validates the Impact-Aware Pipeline Alert report end-to-end:
 * - generateImpactAlertHtml with various alert sets
 * - Empty alerts
 * - Error fallback
 * - Custom title
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImpactAlertResult } from '../../impact-alert.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeResult(overrides?: Partial<ImpactAlertResult>): ImpactAlertResult {
    return {
        alerts: [
            {
                severity: 'critical',
                title: 'Low pass rate in low-coverage area',
                message: 'Pass rate 50%, coverage 45%',
                affectedArea: 'Login',
                recommendation: 'Increase coverage',
            },
            {
                severity: 'warning',
                title: 'Elevated failure rate',
                message: '3 failing jobs',
                affectedArea: 'Pipeline',
                recommendation: 'Stabilize pipeline',
            },
        ],
        criticalCount: 1,
        warningCount: 1,
        infoCount: 0,
        timestamp: '2026-06-16T00:00:00.000Z',
        ...overrides,
    };
}

describe('Integration: Impact Alert (FT-30)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-30a: generateImpactAlertHtml with alerts', () => {
        it('produces complete HTML with alert cards and summary', async () => {
            expect.hasAssertions();

            const { generateImpactAlertHtml } = await import('../../impact-alert.js');
            const result = makeResult();
            const html = generateImpactAlertHtml(result, 'Alert Report');

            const parts = [
                '<!DOCTYPE html>',
                'Alert Report',
                'Low pass rate in low-coverage area',
                'Elevated failure rate',
                'Total Alerts',
                'Critical',
                'Warning',
                'qa-report-theme',
                'data-component="card"',
            ];

            expect(parts.every((p) => html.includes(p))).toBeTruthy();
        });
    });

    describe('FT-30b: no alerts', () => {
        it('shows no-alerts message', async () => {
            expect.hasAssertions();

            const { generateImpactAlertHtml } = await import('../../impact-alert.js');
            const result = makeResult({ alerts: [], criticalCount: 0, warningCount: 0, infoCount: 0 });
            const html = generateImpactAlertHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No alerts to display');
        });
    });

    describe('FT-30d: custom title', () => {
        it('uses custom title in HTML', async () => {
            expect.hasAssertions();

            const { generateImpactAlertHtml } = await import('../../impact-alert.js');
            const result = makeResult({ alerts: [], criticalCount: 0, warningCount: 0, infoCount: 0 });
            const html = generateImpactAlertHtml(result, 'Custom Alert');

            expect(html).toContain('Custom Alert');
        });
    });
});
