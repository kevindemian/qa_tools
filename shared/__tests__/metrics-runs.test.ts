/**
 * RED tests for convertToMetricsRuns — verifies the Map-key-to-array-index bug fix.
 *
 * These tests would FAIL before the fix (project always '', timestamp wrong)
 * and PASS after the fix (correct project and timestamp from runs array).
 */
import { describe, it, expect } from 'vitest';
import { convertToMetricsRuns } from '../data-hub/compute/metrics-runs.js';
import type { ArtifactParseResult } from '../data-hub/artifact-parser.js';
import type { PipelineRun } from '../types/ci-cd.js';

function makeArtifact(overrides: Partial<ArtifactParseResult['data']['stats']> = {}): ArtifactParseResult {
    return {
        fileName: 'test-results.xml',
        format: 'junit',
        data: {
            stats: {
                passed: 10,
                failed: 2,
                skipped: 1,
                duration: 5000,
                ...overrides,
            },
            tests: [],
        },
    } as unknown as ArtifactParseResult;
}

function makeRun(id: number, overrides: Partial<PipelineRun> = {}): PipelineRun {
    return {
        id,
        head_branch: `feature-${id}`,
        created_at: `2026-07-22T10:00:0${id % 10}Z`,
        ...overrides,
    };
}

describe('convertToMetricsRuns', () => {
    describe('BUG FIX: project field must come from runs array, not be empty', () => {
        it('sets project from matching run when runs array is provided', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [12345, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [makeRun(12345, { head_branch: 'main' })];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result).toHaveLength(1);
            expect(result[0]!.project).toBe('main');
        });

        it('sets correct project for multiple runs with different IDs', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [100, [makeArtifact({ passed: 5 })]],
                [200, [makeArtifact({ passed: 8 })]],
                [300, [makeArtifact({ passed: 3 })]],
            ]);
            const runs: PipelineRun[] = [
                makeRun(100, { head_branch: 'feature-a' }),
                makeRun(200, { head_branch: 'feature-b' }),
                makeRun(300, { head_branch: 'main' }),
            ];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            const projects = result.map((r) => r.project).sort();
            expect(projects).toEqual(['feature-a', 'feature-b', 'main']);
        });

        it('handles large CI run IDs (e.g., 12345) correctly — the original bug', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [12345, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [makeRun(12345, { head_branch: 'develop' })];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result[0]!.project).toBe('develop');
        });

        it('returns empty project when run ID not found in runs array', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [99999, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [makeRun(100, { head_branch: 'main' })];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result[0]!.project).toBe('');
        });

        it('returns empty project when runs array is not provided', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [12345, [makeArtifact()]],
            ]);

            const result = convertToMetricsRuns(parsedArtifacts);

            expect(result[0]!.project).toBe('');
        });
    });

    describe('BUG FIX: timestamp must come from runs array', () => {
        it('uses created_at from matching run', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [12345, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [
                makeRun(12345, { created_at: '2026-07-20T08:30:00Z' }),
            ];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result[0]!.timestamp).toBe('2026-07-20T08:30:00Z');
        });

        it('uses current time when run not found (fallback)', () => {
            const before = Date.now();
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [99999, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            const after = Date.now();
            const ts = new Date(result[0]!.timestamp).getTime();
            expect(ts).toBeGreaterThanOrEqual(before);
            expect(ts).toBeLessThanOrEqual(after);
        });
    });

    describe('aggregation', () => {
        it('sums stats across multiple artifacts in same run', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [100, [makeArtifact({ passed: 5, failed: 1 }), makeArtifact({ passed: 3, failed: 2 })]],
            ]);
            const runs: PipelineRun[] = [makeRun(100, { head_branch: 'main' })];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result[0]!.passed).toBe(8);
            expect(result[0]!.failed).toBe(3);
            expect(result[0]!.total).toBe(13);
        });

        it('sorts by timestamp descending (newest first)', () => {
            const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
                [1, [makeArtifact()]],
                [2, [makeArtifact()]],
                [3, [makeArtifact()]],
            ]);
            const runs: PipelineRun[] = [
                makeRun(1, { created_at: '2026-07-20T10:00:00Z' }),
                makeRun(2, { created_at: '2026-07-22T10:00:00Z' }),
                makeRun(3, { created_at: '2026-07-21T10:00:00Z' }),
            ];

            const result = convertToMetricsRuns(parsedArtifacts, runs);

            expect(result[0]!.timestamp).toBe('2026-07-22T10:00:00Z');
            expect(result[1]!.timestamp).toBe('2026-07-21T10:00:00Z');
            expect(result[2]!.timestamp).toBe('2026-07-20T10:00:00Z');
        });
    });
});
