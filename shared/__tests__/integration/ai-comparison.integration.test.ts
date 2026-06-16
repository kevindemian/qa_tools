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
});
