import { rootLogger } from './logger.js';
import type { UserStoryFixture } from './prompts/__fixtures__/index.js';

const MAX_PARTITION_TYPES = 3;

export interface BenchmarkMetrics {
    criteriaCoverage: number;
    partitionCoverage: number;
    boundaryCoverage: number;
    totalTests: number;
    coveredCriteriaCount: number;
    totalCriteria: number;
}

interface TestCaseShape {
    title?: string;
    steps?: string[];
    expectedResult?: string;
    preConditions?: unknown[];
    coverage?: Array<{ criterionId: string; criterionText: string }>;
}

function countCoveredCriteria(tests: TestCaseShape[], expectedCriteria: string[]): number {
    let covered = 0;
    for (const criterion of expectedCriteria) {
        const hasCoverage = tests.some((test) => {
            if (test.coverage) {
                const hasMatch = test.coverage.some(
                    (c) =>
                        c.criterionText.toLowerCase().includes(criterion.toLowerCase()) ||
                        criterion.toLowerCase().includes(c.criterionText.toLowerCase()),
                );
                if (hasMatch) return true;
            }
            if (test.title) {
                if (test.title.toLowerCase().includes(criterion.toLowerCase())) return true;
            }
            const stepsText = (test.steps || []).join(' ').toLowerCase();
            if (stepsText.includes(criterion.toLowerCase())) return true;
            return false;
        });
        if (hasCoverage) covered++;
    }
    return covered;
}

function countCoveredPartitions(tests: TestCaseShape[], min: number, max: number): number {
    let partitions = 0;
    const stepsTexts = tests.map((t) => (t.steps || []).join(' ').toLowerCase());
    const allText = stepsTexts.join(' ');
    const belowMinRe = new RegExp('\\b' + (min - 1) + '\\b', 'i');
    const aboveMaxRe = new RegExp('\\b' + (max + 1) + '\\b', 'i');
    const validRe = new RegExp('\\b(?:' + (min + 1) + '|' + min + '|' + max + '|' + (max - 1) + ')\\b', 'i');
    if (validRe.test(allText)) partitions++;
    if (belowMinRe.test(allText) || /below|less than|under/i.test(allText)) partitions++;
    if (aboveMaxRe.test(allText) || /above|greater than|over|exceed/i.test(allText)) partitions++;
    return Math.min(partitions, MAX_PARTITION_TYPES);
}

function countCoveredBoundaries(tests: TestCaseShape[], min: number, max: number): number {
    let boundaries = 0;
    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');
    const boundariesToCheck = [min, max, min - 1, max + 1];
    for (const b of boundariesToCheck) {
        const re = new RegExp('\\b' + b + '\\b');
        if (re.test(allText)) boundaries++;
    }
    return boundaries;
}

export function computeCoverageMetrics(body: string, fixture: UserStoryFixture): BenchmarkMetrics {
    try {
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) {
            return {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: fixture.coverage.expectedCriteria.length,
            };
        }
        const tests: TestCaseShape[] = parsed.filter(
            (item): item is TestCaseShape => typeof item === 'object' && item !== null && !Array.isArray(item),
        );
        const totalCriteria = fixture.coverage.expectedCriteria.length;
        const coveredCriteriaCount =
            fixture.coverage.expectedCriteria.length > 0
                ? countCoveredCriteria(tests, fixture.coverage.expectedCriteria)
                : 0;
        const criteriaCoverage = totalCriteria > 0 ? coveredCriteriaCount / totalCriteria : 0;
        let partitionCoverage = 0;
        let boundaryCoverage = 0;
        const ranges = fixture.coverage.numericRanges;
        if (ranges.length > 0) {
            let totalPartitions = 0;
            let coveredPartitions = 0;
            let totalBoundaries = 0;
            let coveredBoundaries = 0;
            for (const range of ranges) {
                totalPartitions += 3;
                coveredPartitions += countCoveredPartitions(tests, range.min, range.max);
                totalBoundaries += 4;
                coveredBoundaries += countCoveredBoundaries(tests, range.min, range.max);
            }
            partitionCoverage = totalPartitions > 0 ? coveredPartitions / totalPartitions : 0;
            boundaryCoverage = totalBoundaries > 0 ? coveredBoundaries / totalBoundaries : 0;
        }
        return {
            criteriaCoverage,
            partitionCoverage,
            boundaryCoverage,
            totalTests: tests.length,
            coveredCriteriaCount,
            totalCriteria,
        };
    } catch (err) {
        rootLogger.warn(`Failed to compute benchmark metrics: ${err instanceof Error ? err.message : String(err)}`);
        return {
            criteriaCoverage: 0,
            partitionCoverage: 0,
            boundaryCoverage: 0,
            totalTests: 0,
            coveredCriteriaCount: 0,
            totalCriteria: fixture.coverage.expectedCriteria.length,
        };
    }
}
