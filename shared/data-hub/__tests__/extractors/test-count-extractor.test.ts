import { describe, it, expect } from 'vitest';
import { extractTestCounts } from '../../extractors/test-count-extractor.js';
import type { ArtifactParseResult } from '../../artifact-parser.js';

function makeArtifact(passed: number, failed: number, skipped: number, total: number): ArtifactParseResult {
    return {
        fileName: 'test.json',
        format: 'ctrf',
        data: {
            tests: [],
            stats: { passed, failed, skipped, total, duration: 0 },
        },
    };
}

describe('ExtractTestCounts', () => {
    it('r1: empty input → all zeros', () => {
        expect.hasAssertions();
        const result = extractTestCounts({});
        expect(result).toStrictEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
    });

    it('r2: undefined parsedArtifacts → all zeros', () => {
        expect.hasAssertions();
        const result = extractTestCounts({ parsedArtifacts: undefined });
        expect(result).toStrictEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
    });

    it('r3: single artifact → counts match', () => {
        expect.hasAssertions();
        const map = new Map<number, ArtifactParseResult[]>([[1, [makeArtifact(10, 2, 1, 13)]]]);
        const result = extractTestCounts({ parsedArtifacts: map });
        expect(result).toStrictEqual({ passed: 10, failed: 2, skipped: 1, total: 13 });
    });

    it('r4: multiple artifacts → counts aggregated', () => {
        expect.hasAssertions();
        const map = new Map<number, ArtifactParseResult[]>([
            [1, [makeArtifact(5, 1, 0, 6), makeArtifact(3, 2, 1, 6)]],
            [2, [makeArtifact(10, 0, 0, 10)]],
        ]);
        const result = extractTestCounts({ parsedArtifacts: map });
        expect(result).toStrictEqual({ passed: 18, failed: 3, skipped: 1, total: 22 });
    });

    it('r5: empty map → all zeros', () => {
        expect.hasAssertions();
        const result = extractTestCounts({ parsedArtifacts: new Map() });
        expect(result).toStrictEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
    });

    it('r6: all counts non-negative', () => {
        expect.hasAssertions();
        const map = new Map<number, ArtifactParseResult[]>([[1, [makeArtifact(0, 0, 0, 0)]]]);
        const result = extractTestCounts({ parsedArtifacts: map });
        expect(result.passed).toBeGreaterThanOrEqual(0);
        expect(result.failed).toBeGreaterThanOrEqual(0);
        expect(result.skipped).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeGreaterThanOrEqual(0);
    });
});
