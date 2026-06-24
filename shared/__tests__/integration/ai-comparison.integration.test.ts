import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiComparisonRecord } from '../../ai-comparison.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: AI Comparison Dashboard (FT-24)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-24a: generateAiComparisonHtml', () => {
        it('returns complete HTML document with data', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const records: AiComparisonRecord[] = [
                {
                    testTitle: 'Login Test',
                    generatedBy: 'ai',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.1,
                    promptVersion: 'v1',
                },
                {
                    testTitle: 'API Test',
                    generatedBy: 'manual',
                    accepted: true,
                    passed: true,
                    duration: 200,
                    flakiness: 0.3,
                    promptVersion: 'v1',
                },
            ];
            const result = compareAiVsManual(records);

            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

            const html = generateAiComparisonHtml(result, 'FT-24 Test');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
            expect(html).toContain('FT-24 Test');
            expect(html).toContain('Comparison Overview');
            expect(html).toContain('AI Advantage');
            expect(html).toContain('AI Pass Rate');
            expect(html).toContain('Manual Pass Rate');
        });

        it('shows no data message for empty records', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const result = compareAiVsManual([]);
            const html = generateAiComparisonHtml(result);

            expect(html).toContain('No comparison data available.');
            expect(html).not.toContain('Comparison Overview');
        });

        it('uses custom title', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const result = compareAiVsManual([]);
            const html = generateAiComparisonHtml(result, 'Sprint 11 Analysis');

            expect(html).toContain('Sprint 11 Analysis');
            expect(html).not.toContain('AI vs Manual Test Comparison');
        });
    });

    describe('FT-24b: edge cases', () => {
        it('handles all AI records', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const records: AiComparisonRecord[] = [
                {
                    testTitle: 't1',
                    generatedBy: 'ai',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.1,
                    promptVersion: 'v1',
                },
                {
                    testTitle: 't2',
                    generatedBy: 'ai',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.2,
                    promptVersion: 'v1',
                },
                {
                    testTitle: 't3',
                    generatedBy: 'ai',
                    accepted: false,
                    passed: false,
                    duration: 100,
                    flakiness: 0.3,
                    promptVersion: 'v2',
                },
            ];
            const result = compareAiVsManual(records);

            expect(result.aiTotal).toBe(3);
            expect(result.manualTotal).toBe(0);
            expect(result.manualPassRate).toBe(0);
            expect(result.manualFlakinessAvg).toBe(0);

            const html = generateAiComparisonHtml(result);

            expect(html).toContain('N/A');
        });

        it('handles all manual records', async () => {
            const { compareAiVsManual } = await import('../../ai-comparison.js');
            const records: AiComparisonRecord[] = [
                {
                    testTitle: 't1',
                    generatedBy: 'manual',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.1,
                    promptVersion: '',
                },
                {
                    testTitle: 't2',
                    generatedBy: 'manual',
                    accepted: true,
                    passed: false,
                    duration: 200,
                    flakiness: 0.2,
                    promptVersion: '',
                },
            ];
            const result = compareAiVsManual(records);

            expect(result.manualTotal).toBe(2);
            expect(result.aiTotal).toBe(0);
            expect(result.aiPassRate).toBe(0);
            expect(result.aiAdvantage).toBe('none');
        });

        it('handles 100 records without error', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const records: AiComparisonRecord[] = [];
            for (let i = 0; i < 100; i++) {
                records.push({
                    testTitle: `test-${i}`,
                    generatedBy: i % 2 === 0 ? 'ai' : 'manual',
                    accepted: i % 3 !== 0,
                    passed: i % 4 !== 0,
                    duration: Math.floor(Math.random() * 1000),
                    flakiness: Math.random() * 0.5,
                    promptVersion: `v${(i % 3) + 1}`,
                });
            }
            const result = compareAiVsManual(records);

            expect(result.aiTotal + result.manualTotal).toBe(100);

            const html = generateAiComparisonHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
        });
    });

    describe('FT-24c: HTML structural validation', () => {
        it('contains proper HTML structure', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const records: AiComparisonRecord[] = [
                {
                    testTitle: 't1',
                    generatedBy: 'ai',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.1,
                    promptVersion: 'v1',
                },
                {
                    testTitle: 't2',
                    generatedBy: 'manual',
                    accepted: true,
                    passed: true,
                    duration: 200,
                    flakiness: 0.2,
                    promptVersion: '',
                },
            ];
            const result = compareAiVsManual(records);
            const html = generateAiComparisonHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html');
            expect(html).toContain('</html>');
            expect(html).toContain('<head>');
            expect(html).toContain('</head>');
            expect(html).toContain('<body>');
            expect(html).toContain('</body>');
            expect(html).toContain('--color-surface-page');
            expect(html).toContain('prefers-color-scheme');
            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('data-component="badge"');
        });
    });

    describe('FT-24d: null handling', () => {
        it('handles null records without crashing', async () => {
            const { compareAiVsManual } = await import('../../ai-comparison.js');
            const result = compareAiVsManual(null);

            expect(result.aiTotal).toBe(0);
            expect(result.manualTotal).toBe(0);
        });

        it('handles undefined records without crashing', async () => {
            const { compareAiVsManual } = await import('../../ai-comparison.js');
            const result = compareAiVsManual(undefined);

            expect(result.aiTotal).toBe(0);
            expect(result.manualTotal).toBe(0);
        });

        it('handles null result in generateAiComparisonHtml without crashing', async () => {
            const { generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const html = generateAiComparisonHtml(null);

            expect(html).toContain('Error generating dashboard');
        });
    });

    describe('FT-24e: error fallback', () => {
        it('returns error page when buildHtmlPage throws', async () => {
            const { compareAiVsManual, generateAiComparisonHtml } = await import('../../ai-comparison.js');
            const htmlFactory = await import('../../html-factory.js');
            const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
                throw new Error('mock crash');
            });
            const records: AiComparisonRecord[] = [
                {
                    testTitle: 't1',
                    generatedBy: 'ai',
                    accepted: true,
                    passed: true,
                    duration: 100,
                    flakiness: 0.1,
                    promptVersion: 'v1',
                },
            ];
            const result = compareAiVsManual(records);
            const html = generateAiComparisonHtml(result);

            expect(html).toContain('Error generating dashboard');

            spy.mockRestore();
        });
    });
});
