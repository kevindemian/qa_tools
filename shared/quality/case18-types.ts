/** Types for case18 quality evaluation. */

/** LLM-generated test case output (matches case18 prompt schema). */
export interface GeneratedTestCase {
    title: string;
    steps: string[];
    expectedResult: string;
    preConditions?: Array<{ type: string; description?: string; summary?: string }>;
    coverage?: Array<{ criterionId: string; criterionText: string }>;
    evidence?: string[];
}

/** Single metric evaluation result. */
export interface MetricResult {
    score: number;
    weight: number;
    passed: string[];
    failed: string[];
    warnings: string[];
}

/** Deterministic layer result. */
export interface DeterministicResult {
    score: number;
    metrics: {
        coverage: MetricResult;
        stepConcreteness: MetricResult;
        preconditionSpecificity: MetricResult;
        bvaApplication: MetricResult;
        evidenceCitations: MetricResult;
        redundancy: MetricResult;
    };
    details: {
        totalTests: number;
        totalCriteria: number;
        citedCriteria: number;
        redundantPairs: Array<[number, number, number]>;
    };
}

/** Full evaluation result. */
export interface EvaluationResult {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    layers: {
        deterministic: DeterministicResult;
    };
    details: {
        passed: string[];
        failed: string[];
        warnings: string[];
    };
}
