import { describe, expect, it } from 'vitest';
import { computeDiffComparison } from '../pr-report-core.js';
import type { DiffComparison } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

const passed: FlatTest = { title: 'test-1', state: 'passed', duration: 100 };
const failed: FlatTest = { title: 'test-1', state: 'failed', duration: 200, error: 'error' };
const skipped: FlatTest = { title: 'test-1', state: 'skipped', duration: 0 };

function getResult(current: FlatTest[], previous: FlatTest[]): DiffComparison {
    const result = computeDiffComparison(current, previous);
    if (result === undefined) throw new Error('Expected DiffComparison result but got undefined');
    return result;
}

describe('computeDiffComparison', () => {
    it('returns undefined when previous is empty', () => {
        const result = computeDiffComparison([passed], []);

        expect(result).toBeUndefined();
    });

    it('returns undefined when both runs are identical', () => {
        const result = computeDiffComparison([passed, failed], [passed, failed]);

        expect(result).toBeUndefined();
    });

    it('detects new failures', () => {
        const result = getResult([failed], [passed]);

        expect(result.newFailures).toHaveLength(1);
        expect(result.newFailures[0]?.title).toBe('test-1');
        expect(result.newPasses).toHaveLength(0);
    });

    it('detects new passes (fixes)', () => {
        const result = getResult([passed], [failed]);

        expect(result.newPasses).toHaveLength(1);
        expect(result.newPasses[0]?.title).toBe('test-1');
        expect(result.newFailures).toHaveLength(0);
    });

    it('detects flaky tests (state changed between runs)', () => {
        const result = getResult([failed], [passed]);

        expect(result.flaky).toHaveLength(1);
    });

    it('ignores tests only in current run (no previous)', () => {
        const existing: FlatTest = { title: 'existing', state: 'passed', duration: 50 };
        const brandNew: FlatTest = { title: 'brand new', state: 'passed', duration: 50 };
        const result = computeDiffComparison([existing, brandNew], [existing]);

        expect(result).toBeUndefined();
    });

    it('ignores tests only in previous run (not in current)', () => {
        const existing: FlatTest = { title: 'existing', state: 'passed', duration: 50 };
        const removed: FlatTest = { title: 'removed test', state: 'passed', duration: 50 };
        const result = computeDiffComparison([existing], [existing, removed]);

        expect(result).toBeUndefined();
    });

    it('treats skipped as not-failed for comparison', () => {
        const result = getResult([skipped], [failed]);

        expect(result.newPasses).toHaveLength(1);
        expect(result.newPasses[0]?.title).toBe('test-1');
        expect(result.newFailures).toHaveLength(0);
    });

    it('combines newFailures, newPasses, and flaky in single result', () => {
        const current = [
            { title: 'test-A', state: 'failed' as const, duration: 100 },
            { title: 'test-B', state: 'passed' as const, duration: 100 },
            { title: 'test-C', state: 'failed' as const, duration: 100 },
        ];
        const previous = [
            { title: 'test-A', state: 'passed' as const, duration: 100 },
            { title: 'test-B', state: 'failed' as const, duration: 100 },
            { title: 'test-C', state: 'failed' as const, duration: 100 },
        ];
        const result = getResult(current, previous);

        expect(result.newFailures).toHaveLength(1);
        expect(result.newFailures[0]?.title).toBe('test-A');
        expect(result.newPasses).toHaveLength(1);
        expect(result.newPasses[0]?.title).toBe('test-B');
        expect(result.flaky).toHaveLength(2);
    });

    it('handles empty current test list', () => {
        const result = computeDiffComparison([], [passed]);

        expect(result).toBeUndefined();
    });
});
