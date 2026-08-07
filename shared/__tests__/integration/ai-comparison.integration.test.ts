import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import type { AiComparisonRecord } from '../../data-hub/compute/ai-comparison.js';

describe('Integration: AI Comparison Compute (FT-24)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-24b: edge cases', () => {
        it('handles all AI records', async () => {
            expect.hasAssertions();

            const { compareAiVsManual } = await import('../../data-hub/compute/ai-comparison.js');
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
        });

        it('handles all manual records', async () => {
            expect.hasAssertions();

            const { compareAiVsManual } = await import('../../data-hub/compute/ai-comparison.js');
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
            expect.hasAssertions();

            const { compareAiVsManual } = await import('../../data-hub/compute/ai-comparison.js');
            const records: AiComparisonRecord[] = [];
            for (let i = 0; i < 100; i++) {
                records.push({
                    testTitle: `test-${i}`,
                    generatedBy: i % 2 === 0 ? 'ai' : 'manual',
                    accepted: i % 3 !== 0,
                    passed: i % 4 !== 0,
                    duration: crypto.randomInt(1000),
                    flakiness: crypto.randomInt(50) / 100,
                    promptVersion: `v${(i % 3) + 1}`,
                });
            }
            const result = compareAiVsManual(records);

            expect(result.aiTotal + result.manualTotal).toBe(100);
        });
    });

    describe('FT-24d: null handling', () => {
        it('handles null records without crashing', async () => {
            expect.hasAssertions();

            const { compareAiVsManual } = await import('../../data-hub/compute/ai-comparison.js');
            const result = compareAiVsManual(null);

            expect(result.aiTotal).toBe(0);
            expect(result.manualTotal).toBe(0);
        });

        it('handles undefined records without crashing', async () => {
            expect.hasAssertions();

            const { compareAiVsManual } = await import('../../data-hub/compute/ai-comparison.js');
            const result = compareAiVsManual(undefined);

            expect(result.aiTotal).toBe(0);
            expect(result.manualTotal).toBe(0);
        });
    });
});
