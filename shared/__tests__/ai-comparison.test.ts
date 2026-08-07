/**
 * Tests for ai-comparison — AI Test Effectiveness Comparison.
 */

import { compareAiVsManual } from '../data-hub/compute/ai-comparison.js';
import type { AiComparisonRecord } from '../data-hub/compute/ai-comparison.js';

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

describe('CompareAiVsManual', () => {
    it('returns zeroed result for empty array', () => {
        const result = compareAiVsManual([]);

        expect(result).toMatchObject({
            aiTotal: 0,
            aiPassRate: 0,
            aiFlakinessAvg: 0,
            aiAcceptanceRate: 0,
            manualTotal: 0,
            manualPassRate: 0,
            manualFlakinessAvg: 0,
            manualAcceptanceRate: 0,
            aiAdvantage: 'none',
            byVersion: [],
        });
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
        expect(result.manualAcceptanceRate).toBe(0);
    });

    it('computes manualAcceptanceRate from actual manual accepted flags (not hardcoded)', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.2, accepted: true }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.1, accepted: false }),
            makeRecord({ generatedBy: 'manual', passed: true, flakiness: 0.1, accepted: false }),
        ];
        const result = compareAiVsManual(records);

        expect(result.manualTotal).toBe(3);
        expect(result.manualAcceptanceRate).toBeCloseTo(1 / 3, 5);
        expect(result.manualAcceptanceRate).not.toBe(1);
    });

    it('computes AI-only advantage as none when no manual records', () => {
        const records: AiComparisonRecord[] = [
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.1, accepted: true }),
            makeRecord({ generatedBy: 'ai', passed: false, flakiness: 0.3, accepted: false }),
            makeRecord({ generatedBy: 'ai', passed: true, flakiness: 0.05, accepted: true }),
        ];
        const result = compareAiVsManual(records);

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
        expect(result.byVersion[0]).toStrictEqual({ version: 'unknown', count: 2, passRate: 50 });
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
