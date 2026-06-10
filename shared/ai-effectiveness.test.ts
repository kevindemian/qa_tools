/**
 * Tests for ai-effectiveness — AI Generation Effectiveness Dashboard.
 */

import { computeAiEffectiveness, generateAiEffectivenessHtml } from './ai-effectiveness.js';
import * as htmlFactory from './html-factory.js';

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

describe('computeAiEffectiveness', () => {
    it('returns zeroed result for empty store', () => {
        const store: AiFeedbackStore = { records: [] };
        const result = computeAiEffectiveness(store);
        expect(result.acceptanceRate).toBe(0);
        expect(result.totalRecords).toBe(0);
        expect(result.totalGenerated).toBe(0);
        expect(result.totalModified).toBe(0);
        expect(result.totalDeleted).toBe(0);
        expect(result.topPromptVersion).toBe('');
        expect(result.byVersion).toEqual([]);
        expect(result.trend).toEqual([]);
        expect(result.timestamp).toBeTruthy();
    });

    it('computes acceptance rate for a single version with mixed acceptance', () => {
        const store: AiFeedbackStore = {
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-01T11:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
                { timestamp: '2026-06-01T12:00:00Z', promptVersion: 'v1', testTitle: 't3', accepted: true },
                {
                    timestamp: '2026-06-01T13:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't4',
                    accepted: false,
                    modificationReason: 'deleted',
                },
            ],
        };
        const result = computeAiEffectiveness(store);
        expect(result.acceptanceRate).toBe(50);
        expect(result.totalRecords).toBe(4);
        expect(result.totalGenerated).toBe(4);
        expect(result.totalModified).toBe(1);
        expect(result.totalDeleted).toBe(1);
        expect(result.topPromptVersion).toBe('v1');
        expect(result.byVersion).toHaveLength(1);
        expect(result.byVersion[0]).toEqual({ version: 'v1', count: 4, acceptanceRate: 50 });
    });

    it('handles multiple versions', () => {
        const store: AiFeedbackStore = {
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-01T11:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
                { timestamp: '2026-06-01T12:00:00Z', promptVersion: 'v2', testTitle: 't3', accepted: true },
                { timestamp: '2026-06-01T13:00:00Z', promptVersion: 'v2', testTitle: 't4', accepted: true },
                {
                    timestamp: '2026-06-01T14:00:00Z',
                    promptVersion: 'v2',
                    testTitle: 't5',
                    accepted: false,
                    modificationReason: 'deleted',
                },
                { timestamp: '2026-06-01T15:00:00Z', promptVersion: 'v3', testTitle: 't6', accepted: true },
            ],
        };
        const result = computeAiEffectiveness(store);
        expect(result.totalRecords).toBe(6);
        expect(result.acceptanceRate).toBe(67);
        expect(result.topPromptVersion).toBe('v2');
        expect(result.byVersion).toHaveLength(3);
        expect(result.byVersion).toContainEqual({ version: 'v1', count: 2, acceptanceRate: 50 });
        expect(result.byVersion).toContainEqual({ version: 'v2', count: 3, acceptanceRate: 67 });
        expect(result.byVersion).toContainEqual({ version: 'v3', count: 1, acceptanceRate: 100 });
    });

    it('builds daily trend sorted by date', () => {
        const store: AiFeedbackStore = {
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-01T11:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
                { timestamp: '2026-06-02T10:00:00Z', promptVersion: 'v1', testTitle: 't3', accepted: true },
                { timestamp: '2026-06-02T11:00:00Z', promptVersion: 'v1', testTitle: 't4', accepted: true },
                {
                    timestamp: '2026-06-03T10:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't5',
                    accepted: false,
                    modificationReason: 'deleted',
                },
            ],
        };
        const result = computeAiEffectiveness(store);
        expect(result.trend).toHaveLength(3);
        expect(result.trend[0]?.date).toBe('2026-06-01');
        expect(result.trend[0]?.generated).toBe(2);
        expect(result.trend[0]?.acceptanceRate).toBe(50);
        expect(result.trend[1]?.date).toBe('2026-06-02');
        expect(result.trend[1]?.generated).toBe(2);
        expect(result.trend[1]?.acceptanceRate).toBe(100);
        expect(result.trend[2]?.date).toBe('2026-06-03');
        expect(result.trend[2]?.generated).toBe(1);
        expect(result.trend[2]?.acceptanceRate).toBe(0);
    });

    it('handles all accepted records', () => {
        const store: AiFeedbackStore = {
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                { timestamp: '2026-06-01T11:00:00Z', promptVersion: 'v1', testTitle: 't2', accepted: true },
            ],
        };
        const result = computeAiEffectiveness(store);
        expect(result.acceptanceRate).toBe(100);
        expect(result.totalModified).toBe(0);
        expect(result.totalDeleted).toBe(0);
    });

    it('handles no accepted records', () => {
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
});

describe('generateAiEffectivenessHtml', () => {
    it('generates HTML with acceptance rate metric', () => {
        const result = computeAiEffectiveness({
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-01T11:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
            ],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('50%');
        expect(html).toContain('AI Effectiveness Dashboard');
        expect(html).toContain('2 total records');
    });

    it('shows version breakdown table', () => {
        const result = computeAiEffectiveness({
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v2', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-01T11:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
            ],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('By Prompt Version');
        expect(html).toContain('v1');
        expect(html).toContain('v2');
        expect(html).toContain('Version');
        expect(html).toContain('Records');
    });

    it('shows daily trend table', () => {
        const result = computeAiEffectiveness({
            records: [
                { timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true },
                {
                    timestamp: '2026-06-02T10:00:00Z',
                    promptVersion: 'v1',
                    testTitle: 't2',
                    accepted: false,
                    modificationReason: 'modified',
                },
            ],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('Daily Trend');
        expect(html).toContain('2026-06-01');
        expect(html).toContain('2026-06-02');
    });

    it('shows empty message when no data', () => {
        const result = computeAiEffectiveness({ records: [] });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('No AI generation data available');
        expect(html).not.toContain('By Prompt Version');
        expect(html).not.toContain('Daily Trend');
    });

    it('uses custom title', () => {
        const result = computeAiEffectiveness({
            records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
        });
        const html = generateAiEffectivenessHtml(result, 'My AI Report');
        expect(html).toContain('My AI Report');
        expect(html).not.toContain('AI Effectiveness Dashboard');
    });

    it('includes theme script and CSS variables', () => {
        const result = computeAiEffectiveness({
            records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('escapes HTML in version names', () => {
        const result = computeAiEffectiveness({
            records: [
                {
                    timestamp: '2026-06-01T10:00:00Z',
                    promptVersion: '<script>evil</script>',
                    testTitle: 't1',
                    accepted: true,
                },
            ],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
        expect(html).not.toContain('<script>evil</script>');
    });

    it('handles error by returning error page', () => {
        const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
            throw new Error('mock build failure');
        });
        const result = computeAiEffectiveness({
            records: [{ timestamp: '2026-06-01T10:00:00Z', promptVersion: 'v1', testTitle: 't1', accepted: true }],
        });
        const html = generateAiEffectivenessHtml(result);
        expect(html).toContain('Error generating dashboard');
        spy.mockRestore();
    });
});
