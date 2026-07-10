import { describe, it, expect } from 'vitest';
import {
    FlatTestSchema,
    MetricsRunSchema,
    CoverageSnapshotSchema,
    FailureClassificationSchema,
    MetricsStoreSchema,
    PipelineRunSchema,
    parseMetricsRun,
    parseMetricsStore,
    parsePipelineRun,
} from '../schemas.js';

describe('Schemas', () => {
    describe('FlatTestSchema', () => {
        it('accepts valid flat test', () => {
            const result = FlatTestSchema.safeParse({
                title: 'should pass',
                state: 'passed',
                duration: 100,
            });

            expect(result.success).toBeTruthy();
        });

        it('rejects invalid state', () => {
            const result = FlatTestSchema.safeParse({
                title: 'test',
                state: 'invalid',
                duration: 100,
            });

            expect(result.success).toBeFalsy();
        });

        it('allows extra fields via .loose()', () => {
            const result = FlatTestSchema.safeParse({
                title: 'test',
                state: 'passed',
                duration: 100,
                customField: 'value',
            });

            expect(result.success).toBeTruthy();
        });
    });

    describe('MetricsRunSchema', () => {
        it('accepts valid metrics run', () => {
            const result = MetricsRunSchema.safeParse({
                timestamp: '2024-01-01T00:00:00Z',
                project: 'test-project',
                total: 10,
                passed: 8,
                failed: 1,
                skipped: 1,
                duration: 5000,
                tests: [],
            });

            expect(result.success).toBeTruthy();
        });

        it('rejects negative numbers', () => {
            const result = MetricsRunSchema.safeParse({
                timestamp: '2024-01-01T00:00:00Z',
                project: 'test',
                total: -1,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                tests: [],
            });

            expect(result.success).toBeFalsy();
        });
    });

    describe('CoverageSnapshotSchema', () => {
        it('accepts valid coverage snapshot', () => {
            const result = CoverageSnapshotSchema.safeParse({
                timestamp: '2024-01-01T00:00:00Z',
                project: 'test',
                totalIssues: 100,
                mappedIssues: 80,
                coveragePct: 80,
            });

            expect(result.success).toBeTruthy();
        });

        it('rejects coverage > 100', () => {
            const result = CoverageSnapshotSchema.safeParse({
                timestamp: '2024-01-01T00:00:00Z',
                project: 'test',
                totalIssues: 100,
                mappedIssues: 100,
                coveragePct: 101,
            });

            expect(result.success).toBeFalsy();
        });
    });

    describe('FailureClassificationSchema', () => {
        it('accepts valid failure classification', () => {
            const result = FailureClassificationSchema.safeParse({
                timestamp: '2024-01-01T00:00:00Z',
                testTitle: 'failed test',
                category: 'flaky',
                project: 'test',
            });

            expect(result.success).toBeTruthy();
        });
    });

    describe('MetricsStoreSchema', () => {
        it('accepts valid metrics store', () => {
            const result = MetricsStoreSchema.safeParse({
                runs: [],
            });

            expect(result.success).toBeTruthy();
        });

        it('accepts store with coverage history', () => {
            const result = MetricsStoreSchema.safeParse({
                runs: [],
                coverageHistory: [
                    {
                        timestamp: '2024-01-01T00:00:00Z',
                        project: 'test',
                        totalIssues: 100,
                        mappedIssues: 80,
                        coveragePct: 80,
                    },
                ],
            });

            expect(result.success).toBeTruthy();
        });
    });

    describe('PipelineRunSchema', () => {
        it('accepts valid pipeline run', () => {
            const result = PipelineRunSchema.safeParse({
                id: 123,
                status: 'completed',
                conclusion: 'success',
                web_url: 'https://github.com/test/run/123',
                created_at: '2024-01-01T00:00:00Z',
            });

            expect(result.success).toBeTruthy();
        });

        it('accepts minimal pipeline run (all optional)', () => {
            const result = PipelineRunSchema.safeParse({});

            expect(result.success).toBeTruthy();
        });

        it('allows extra fields via .loose()', () => {
            const result = PipelineRunSchema.safeParse({
                id: 1,
                customField: 'value',
            });

            expect(result.success).toBeTruthy();
        });
    });

    describe('ParseMetricsRun', () => {
        it('returns MetricsRun for valid data', () => {
            const result = parseMetricsRun({
                timestamp: '2024-01-01T00:00:00Z',
                project: 'test',
                total: 10,
                passed: 8,
                failed: 1,
                skipped: 1,
                duration: 5000,
                tests: [],
            });

            expect(result).not.toBeNull();
            expect(result?.project).toBe('test');
        });

        it('returns null for invalid data', () => {
            const result = parseMetricsRun({ invalid: true });

            expect(result).toBeNull();
        });
    });

    describe('ParseMetricsStore', () => {
        it('returns MetricsStore for valid data', () => {
            const result = parseMetricsStore({ runs: [] });

            expect(result).not.toBeNull();
            expect(result?.runs).toStrictEqual([]);
        });

        it('returns null for invalid data', () => {
            const result = parseMetricsStore({ runs: 'not-array' });

            expect(result).toBeNull();
        });
    });

    describe('ParsePipelineRun', () => {
        it('returns PipelineRun for valid data', () => {
            const result = parsePipelineRun({ id: 123, status: 'completed' });

            expect(result).not.toBeNull();
            expect(result?.id).toBe(123);
        });

        it('returns null for invalid data', () => {
            const result = parsePipelineRun(42);

            expect(result).toBeNull();
        });
    });
});
