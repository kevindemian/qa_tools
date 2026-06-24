/**
 * Tests for ai-comparison — AI Test Effectiveness Comparison.
 */

import { compareAiVsManual, generateAiComparisonHtml } from './ai-comparison.js';
import type { AiComparisonRecord, AiComparisonResult } from './ai-comparison.js';
import * as htmlFactory from './html-factory.js';

function makeRecord(overrides: Partial<AiComparisonRecord> & { generatedBy: 'ai' | 'manual' }): AiComparisonRecord {
    return {
        testTitle: 'test',
        accepted: true,
        passed: true,
        duration: 100,
        flakiness: 0,
        promptVersion: 'v1',
        ...overrides,
    };
}

describe('compareAiVsManual', () => {
    it('returns zeroed result for empty array', () => {
        const result = compareAiVsManual([]);

        expect(result.aiTotal).toBe(0);
        expect(result.aiPassRate).toBe(0);
        expect(result.aiFlakinessAvg).toBe(0);
        expect(result.aiAcceptanceRate).toBe(0);
        expect(result.manualTotal).toBe(0);
        expect(result.manualPassRate).toBe(0);
        expect(result.manualFlakinessAvg).toBe(0);
        expect(result.manualAcceptanceRate).toBe(1);
        expect(result.aiAdvantage).toBe('none');
        expect(result.byVersion).toEqual([]);
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('computes stats for AI-only records', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.1, accepted: true }),
            makeRecord({ generatedBy: 'ai', passed: false, flakiness: 0.3, accepted: false }),
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.05, accepted: true }),
        ];
        const result = compareAiVsManual(records);

        expect(result.aiTotal).toBe(3);
        expect(result.aiPassRate).toBe(67);
        expect(result.aiFlakinessAvg).toBeCloseTo(0.15, 5);
        expect(result.aiAcceptanceRate).toBeCloseTo(2 / 3, 5);
        expect(result.manualTotal).toBe(0);
        expect(result.manualPassRate).toBe(0);
        expect(result.manualFlakinessAvg).toBe(0);
        expect(result.manualAcceptanceRate).toBe(1);
        expect(result.aiAdvantage).toBe('none');
    });

    it('computes stats for manual-only records', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.2 }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.1 }),
        ];
        const result = compareAiVsManual(records);

        expect(result.aiTotal).toBe(0);
        expect(result.manualTotal).toBe(2);
        expect(result.manualPassRate).toBe(100);
        expect(result.manualFlakinessAvg).toBeCloseTo(0.15, 5);
        expect(result.manualAcceptanceRate).toBe(1);
        expect(result.aiAdvantage).toBe('none');
    });

    it('determines aiAdvantage as pass_rate when AI pass rate is higher', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.3, accepted: true }),
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.3, accepted: true }),
            makeRecord({ generatedBy: 'manual', passed: false, flakiness: 0.1 }),
            makeRecord({ generatedBy: 'manual', passed: false, flakiness: 0.1 }),
        ];
        const result = compareAiVsManual(records);

        expect(result.aiPassRate).toBe(100);
        expect(result.manualPassRate).toBe(0);
        expect(result.aiAdvantage).toBe('pass_rate');
    });

    it('determines aiAdvantage as flakiness when AI flakiness is lower and pass rate not higher', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.05, accepted: true }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.5 }),
        ];
        const result = compareAiVsManual(records);

        expect(result.aiPassRate).toBe(100);
        expect(result.manualPassRate).toBe(100);
        expect(result.aiFlakinessAvg).toBeCloseTo(0.05, 5);
        expect(result.manualFlakinessAvg).toBeCloseTo(0.5, 5);
        expect(result.aiAdvantage).toBe('flakiness');
    });

    it('determines aiAdvantage as none when AI is worse in both metrics', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: false, flakiness: 0.5, accepted: true }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.05 }),
        ];
        const result = compareAiVsManual(records);

        expect(result.aiPassRate).toBe(0);
        expect(result.manualPassRate).toBe(100);
        expect(result.aiFlakinessAvg).toBeCloseTo(0.5, 5);
        expect(result.manualFlakinessAvg).toBeCloseTo(0.05, 5);
        expect(result.aiAdvantage).toBe('none');
    });

    it('groups AI records by prompt version', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', promptVersion: 'v1', passed: true }),
            makeRecord({ generatedBy: 'ai', promptVersion: 'v1', passed: false }),
            makeRecord({ generatedBy: 'ai', promptVersion: 'v2', passed: true }),
            makeRecord({ generatedBy: 'ai', promptVersion: 'v2', passed: true }),
            makeRecord({ generatedBy: 'manual', promptVersion: '', passed: true }),
        ];
        const result = compareAiVsManual(records);

        expect(result.byVersion).toHaveLength(2);
        expect(result.byVersion).toContainEqual({ version: 'v1', count: 2, passRate: 50 });
        expect(result.byVersion).toContainEqual({ version: 'v2', count: 2, passRate: 100 });
    });

    it('uses "unknown" for AI records without promptVersion', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', promptVersion: '', passed: true }),
            makeRecord({ generatedBy: 'ai', promptVersion: '', passed: false }),
            makeRecord({ generatedBy: 'manual', promptVersion: '', passed: true }),
        ];
        const result = compareAiVsManual(records);

        expect(result.byVersion).toHaveLength(1);
        expect(result.byVersion[0]).toEqual({ version: 'unknown', count: 2, passRate: 50 });
    });

    it('handles all-pass and all-fail edge cases', () => {
        const allPass: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0, accepted: true }),
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0, accepted: true }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0 }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0 }),
        ];
        const r1 = compareAiVsManual(allPass);

        expect(r1.aiPassRate).toBe(100);
        expect(r1.manualPassRate).toBe(100);
        expect(r1.aiAdvantage).toBe('none');

        const allFail: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: false, flakiness: 0.9, accepted: false }),
            makeRecord({ generatedBy: 'manual', passed: false, flakiness: 0.8 }),
        ];
        const r2 = compareAiVsManual(allFail);

        expect(r2.aiPassRate).toBe(0);
        expect(r2.manualPassRate).toBe(0);
        expect(r2.aiAdvantage).toBe('none');
    });

    it('returns correct timestamp format', () => {
        const result = compareAiVsManual([]);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe('generateAiComparisonHtml', () => {
    function sampleResult(overrides?: Partial<AiComparisonResult>): AiComparisonResult {
        return {
            aiTotal: 4,
            aiPassRate: 75,
            aiFlakinessAvg: 0.125,
            aiAcceptanceRate: 0.75,
            manualTotal: 3,
            manualPassRate: 67,
            manualFlakinessAvg: 0.3,
            manualAcceptanceRate: 1,
            aiAdvantage: 'pass_rate',
            byVersion: [
                { version: 'v1', count: 2, passRate: 100 },
                { version: 'v2', count: 2, passRate: 50 },
            ],
            timestamp: '2026-06-03T12:00:00.000Z',
            ...overrides,
        };
    }

    it('generates full HTML page structure', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="en">');
        expect(html).toContain('<head>');
        expect(html).toContain('</head>');
        expect(html).toContain('<body>');
        expect(html).toContain('</body>');
        expect(html).toContain('</html>');
    });

    it('includes title in h1', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('AI vs Manual Test Comparison');
    });

    it('uses custom title', () => {
        const html = generateAiComparisonHtml(sampleResult(), 'Sprint 11 AI Analysis');

        expect(html).toContain('Sprint 11 AI Analysis');
        expect(html).not.toContain('AI vs Manual Test Comparison');
    });

    it('shows no-data message when both groups empty', () => {
        const result = sampleResult({ aiTotal: 0, manualTotal: 0, byVersion: [] });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('No comparison data available.');
        expect(html).not.toContain('Comparison Overview');
        expect(html).not.toContain('AI Advantage');
        expect(html).not.toContain('Version Breakdown');
    });

    it('renders MetricCard components for comparison', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('AI Pass Rate');
        expect(html).toContain('Manual Pass Rate');
        expect(html).toContain('AI Avg Flakiness');
        expect(html).toContain('Manual Avg Flakiness');
        expect(html).toContain('AI Acceptance');
        expect(html).toContain('Manual Acceptance');
        expect(html).toContain('75%');
        expect(html).toContain('67%');
    });

    it('renders AI advantage section with Badge', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('AI Advantage');
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('Pass Rate');
    });

    it('shows flakiness advantage variant', () => {
        const result = sampleResult({ aiAdvantage: 'flakiness' });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('less flaky');
        expect(html).toContain('data-component="badge"');
    });

    it('shows none advantage variant', () => {
        const result = sampleResult({ aiAdvantage: 'none', aiPassRate: 50, manualPassRate: 60 });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('no clear advantage');
        expect(html).toContain('data-component="badge"');
    });

    it('shows N/A when one group is missing', () => {
        const result = sampleResult({ aiTotal: 0, aiAdvantage: 'none' });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('N/A');
        expect(html).toContain('Both AI and manual test data required');
    });

    it('renders version breakdown table', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('Version Breakdown');
        expect(html).toContain('data-component="data-table"');
        expect(html).toContain('v1');
        expect(html).toContain('v2');
        expect(html).toContain('100%');
        expect(html).toContain('50%');
    });

    it('omits version table when byVersion is empty', () => {
        const result = sampleResult({ byVersion: [] });
        const html = generateAiComparisonHtml(result);

        expect(html).not.toContain('Version Breakdown');
    });

    it('includes theme script and CSS variables', () => {
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('escapes HTML in version names', () => {
        const result = sampleResult({
            byVersion: [{ version: '<script>evil</script>', count: 1, passRate: 100 }],
        });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
        expect(html).not.toContain('<script>evil</script>');
    });

    it('handles error by returning error page', () => {
        const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
            throw new Error('mock build failure');
        });
        const html = generateAiComparisonHtml(sampleResult());

        expect(html).toContain('Error generating dashboard');

        spy.mockRestore();
    });

    it('formats flakiness values with 3 decimal places', () => {
        const result = sampleResult({ aiFlakinessAvg: 0.1, manualFlakinessAvg: 0.2346 });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('0.100');
        expect(html).toContain('0.235');
    });

    it('formats acceptance rate with 2 decimal places', () => {
        const result = sampleResult({ aiAcceptanceRate: 0.6667 });
        const html = generateAiComparisonHtml(result);

        expect(html).toContain('0.67');
    });
});
