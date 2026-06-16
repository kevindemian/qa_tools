import { beforeEach, describe, expect, it, vi } from 'vitest';

interface AiFeedbackRecord {
    timestamp: string;
    promptVersion: string;
    testTitle: string;
    accepted: boolean;
    modificationReason?: string;
    user?: string;
}

interface AiFeedbackStore {
    records: AiFeedbackRecord[];
}

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: AI Effectiveness Dashboard (FT-23)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-23a: generateAiEffectivenessHtml', () => {
        it('returns complete HTML document with data', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const store: AiFeedbackStore = {
                records: [
                    { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 'Login Test', accepted: true },
                    {
                        timestamp: '2026-06-01T11:00:00Z',
                        promptVersion: 'v1',
                        testTitle: 'API Test',
                        accepted: false,
                        modificationReason: 'modified',
                    },
                ],
            };
            const result = computeAiEffectiveness(store);
            const html = generateAiEffectivenessHtml(result, 'FT-23 Test');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
            expect(html).toContain('FT-23 Test');
            expect(html).toContain('50%');
            expect(html).toContain('2 total records');
            expect(html).toContain('By Prompt Version');
        });

        it('shows no data message for empty store', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const result = computeAiEffectiveness({ records: [] });
            const html = generateAiEffectivenessHtml(result);
            expect(html).toContain('No AI generation data available');
            expect(html).not.toContain('By Prompt Version');
            expect(html).not.toContain('Daily Trend');
        });

        it('uses custom title', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const store: AiFeedbackStore = {
                records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
            };
            const result = computeAiEffectiveness(store);
            const html = generateAiEffectivenessHtml(result, 'Sprint 11 AI Report');
            expect(html).toContain('Sprint 11 AI Report');
            expect(html).not.toContain('AI Effectiveness Dashboard');
        });
    });
});
