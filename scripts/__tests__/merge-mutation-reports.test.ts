import { describe, it, expect } from 'vitest';
import type { MutationTestResult } from 'mutation-testing-report-schema';
import { mergeMutationReports, computeGateDecision } from '../merge-mutation-reports.js';

function makeReport(fileNames: string[]): MutationTestResult {
    return {
        schemaVersion: '1.0',
        // Stryker adiciona `break` ao report real; o tipo schema (3.7.3) só expõe high/low.
        thresholds: { high: 80, low: 60, break: 60 } as MutationTestResult['thresholds'],
        files: Object.fromEntries(
            fileNames.map((name) => [
                name,
                {
                    language: 'typescript',
                    source: 'export const x = 1;',
                    mutants: [
                        {
                            id: `${name}@1:1`,
                            mutatorName: 'NumberLiteral',
                            status: 'Killed',
                            location: {
                                start: { line: 1, column: 1 },
                                end: { line: 1, column: 2 },
                            },
                        },
                    ],
                },
            ]),
        ),
    };
}

function setStatus(report: MutationTestResult, fileName: string, status: 'Survived' | 'CompileError'): void {
    const entry = Object.entries(report.files).find(([name]) => name === fileName);
    const mutant = entry?.[1]?.mutants[0];
    if (!mutant) {
        throw new Error(`Fixture invariant broken: file "${fileName}" has no mutants.`);
    }
    mutant.status = status;
}

describe('Merge mutation reports', () => {
    it('merges disjoint file dictionaries preserving every file', () => {
        expect.hasAssertions();

        const merged = mergeMutationReports([makeReport(['a.ts', 'b.ts']), makeReport(['c.ts'])]);

        expect(Object.keys(merged.files).sort((a, b) => a.localeCompare(b))).toStrictEqual(['a.ts', 'b.ts', 'c.ts']);
        expect(merged.schemaVersion).toBe('1.0');
    });

    it('rejects overlapping files across reports (no silent override)', () => {
        expect.hasAssertions();

        expect(() => mergeMutationReports([makeReport(['a.ts']), makeReport(['a.ts'])])).toThrow(/duplicate/i);
    });

    it('rejects incompatible schema versions across reports', () => {
        expect.hasAssertions();

        const v2 = makeReport(['a.ts']);
        v2.schemaVersion = '2.0';

        expect(() => mergeMutationReports([makeReport(['b.ts']), v2])).toThrow(/schema/i);
    });
});

describe('Compute gate decision (equivalência com gate do Stryker — §10)', () => {
    it('calcula a mesma mutationScore do Stryker (totalDetected / totalValid)', () => {
        expect.hasAssertions();

        const killed = makeReport(['a.ts', 'b.ts', 'c.ts']);
        const survived = makeReport(['d.ts']);
        setStatus(survived, 'd.ts', 'Survived');

        const decision = computeGateDecision(mergeMutationReports([killed, survived]), 60);

        expect(decision.mutationScore).toBe(75);
        expect(decision.totalDetected).toBe(3);
        expect(decision.totalValid).toBe(4);
        expect(decision.survived).toBe(1);
        expect(decision.passed).toBeTruthy();
    });

    it('reprova quando o score combinado fica abaixo do break (gate agregado)', () => {
        expect.hasAssertions();

        const killed = makeReport(['a.ts']);
        const survived = makeReport(['b.ts', 'c.ts', 'd.ts']);
        setStatus(survived, 'b.ts', 'Survived');
        setStatus(survived, 'c.ts', 'Survived');
        setStatus(survived, 'd.ts', 'Survived');

        const decision = computeGateDecision(mergeMutationReports([killed, survived]), 60);

        expect(decision.mutationScore).toBe(25);
        expect(decision.passed).toBeFalsy();
    });

    it('aprovada exatamente no break (score >= break)', () => {
        expect.hasAssertions();

        const killed = makeReport(['a.ts', 'b.ts', 'c.ts']);
        const survived = makeReport(['d.ts']);
        setStatus(survived, 'd.ts', 'Survived');

        const decision = computeGateDecision(mergeMutationReports([killed, survived]), 75);

        expect(decision.mutationScore).toBe(75);
        expect(decision.passed).toBeTruthy();
    });

    it('falha explicitamente quando não há mutantes válidos (NaN — Rule 24/25, sem pass silencioso)', () => {
        expect.hasAssertions();

        const allErrors = makeReport(['a.ts']);
        setStatus(allErrors, 'a.ts', 'CompileError');

        const decision = computeGateDecision(mergeMutationReports([allErrors]), 60);

        expect(Number.isNaN(decision.mutationScore)).toBeTruthy();
        expect(decision.passed).toBeFalsy();
        expect(decision.reason).toMatch(/sem mutantes válidos|NaN/i);
    });

    it('falha explicitamente quando o merge não contém nenhum arquivo (dado ausente — Rule 25)', () => {
        expect.hasAssertions();

        const empty = makeReport([]);

        const decision = computeGateDecision(mergeMutationReports([empty]), 60);

        expect(decision.passed).toBeFalsy();
        expect(decision.reason).toMatch(/No mutation data to gate/i);
    });
});
