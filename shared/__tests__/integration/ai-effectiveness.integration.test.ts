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
            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

    describe('FT-23b: edge cases', () => {
        it('handles all accepted records', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const store: AiFeedbackStore = {
                records: [
                    { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                    { timestamp: '2026-06-01T11:00:00Z', promptVersion: 'v1', testTitle: 't2', accepted: true },
                    { timestamp: '2026-06-02T10:00:00Z', promptVersion: 'v2', testTitle: 't3', accepted: true },
                ],
            };
            const result = computeAiEffectiveness(store);
            expect(result.acceptanceRate).toBe(100);
            expect(result.totalModified).toBe(0);
            expect(result.totalDeleted).toBe(0);
            const html = generateAiEffectivenessHtml(result);
            expect(html).toContain('100%');
        });

        it('handles all rejected records', async () => {
            const { computeAiEffectiveness } = await import('../../ai-effectiveness.js');
            const store: AiFeedbackStore = {
                records: [
                    {
                        timestamp: '2026-06-01T10:00:00Z',
                        promptVersion: 'v1',
                        testTitle: 't1',
                        accepted: false,
                        modificationReason: 'modified',
                    },
                    {
                        timestamp: '2026-06-01T11:00:00Z',
                        promptVersion: 'v1',
                        testTitle: 't2',
                        accepted: false,
                        modificationReason: 'deleted',
                    },
                ],
            };
            const result = computeAiEffectiveness(store);
            expect(result.acceptanceRate).toBe(0);
            expect(result.totalModified).toBe(1);
            expect(result.totalDeleted).toBe(1);
        });

        it('handles 100 records without error', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const records: AiFeedbackRecord[] = [];
            for (let i = 0; i < 100; i++) {
                records.push({
                    timestamp: `2026-06-${String(Math.min((i % 30) + 1, 30)).padStart(2, '0')}T10:00:00Z`,
                    promptVersion: `v${(i % 5) + 1}`,
                    testTitle: `test-${i}`,
                    accepted: i % 3 !== 0,
                });
            }
            const store: AiFeedbackStore = { records };
            const result = computeAiEffectiveness(store);
            expect(result.totalRecords).toBe(100);
            expect(result.byVersion).toHaveLength(5);
            const html = generateAiEffectivenessHtml(result);
            expect(html).toContain('<!DOCTYPE html>');
        });
    });

    describe('FT-23c: HTML structural validation', () => {
        it('contains proper HTML structure', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const store: AiFeedbackStore = {
                records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
            };
            const result = computeAiEffectiveness(store);
            const html = generateAiEffectivenessHtml(result);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html');
            expect(html).toContain('</html>');
            expect(html).toContain('<head>');
            expect(html).toContain('</head>');
            expect(html).toContain('<body>');
            expect(html).toContain('</body>');
            expect(html).toContain('--color-surface-page');
            expect(html).toContain('prefers-color-scheme');
        });
    });

    describe('FT-23d: null handling', () => {
        it('handles null store without crashing (returning empty result)', async () => {
            const { computeAiEffectiveness } = await import('../../ai-effectiveness.js');
            const result = computeAiEffectiveness(null);
            expect(result.acceptanceRate).toBe(0);
            expect(result.totalRecords).toBe(0);
            expect(result.totalGenerated).toBe(0);
        });

        it('handles undefined store without crashing', async () => {
            const { computeAiEffectiveness } = await import('../../ai-effectiveness.js');
            const result = computeAiEffectiveness(undefined);
            expect(result.acceptanceRate).toBe(0);
            expect(result.totalRecords).toBe(0);
        });

        it('handles null result in generateAiEffectivenessHtml without crashing', async () => {
            const { generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const html = generateAiEffectivenessHtml(null);
            expect(html).toContain('Error generating dashboard');
        });
    });

    describe('FT-23e: error fallback', () => {
        it('returns error page when buildHtmlPage throws', async () => {
            const { computeAiEffectiveness, generateAiEffectivenessHtml } = await import('../../ai-effectiveness.js');
            const htmlFactory = await import('../../html-factory.js');
            const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
                throw new Error('mock crash');
            });
            const store: AiFeedbackStore = {
                records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
            };
            const result = computeAiEffectiveness(store);
            const html = generateAiEffectivenessHtml(result);
            expect(html).toContain('Error generating dashboard');
            spy.mockRestore();
        });
    });
});
