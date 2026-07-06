import { describe, it, expect } from 'vitest';
import { classifyFailures } from '../../extractors/failure-classifier.js';

describe('classifyFailures', () => {
    it('R1: Check Runs annotations → retorna failures', () => {
        const annotations = [
            {
                path: 'src/test.ts',
                start_line: 10,
                end_line: 10,
                message: 'Expected true, got false',
                annotation_level: 'failure',
            },
            {
                path: 'src/app.ts',
                start_line: 20,
                end_line: 20,
                message: 'Cannot read property',
                annotation_level: 'failure',
            },
        ];
        const result = classifyFailures({ checkRunAnnotations: annotations });
        expect(result).not.toBeNull();
        expect(result!.length).toBe(2);
        expect(result![0]!.message).toBe('Expected true, got false');
    });

    it('R2: GitHub steps com conclusão failed → retorna failures', () => {
        const steps = [
            { name: 'Build', conclusion: 'success', number: 1 },
            { name: 'Test', conclusion: 'failure', number: 2 },
        ];
        const result = classifyFailures({ githubSteps: steps });
        expect(result).not.toBeNull();
        expect(result!.length).toBe(1);
        expect(result![0]!.stepName).toBe('Test');
    });

    it('R3: GitLab failure_reason → retorna failures', () => {
        const result = classifyFailures({ gitlabFailureReason: 'script_failure' });
        expect(result).not.toBeNull();
        expect(result!.length).toBe(1);
        expect(result![0]!.reason).toBe('script_failure');
    });

    it('R4: Regex no log → retorna failures', () => {
        const log = 'Error: Connection refused\n  at Socket._onTimeout (net.js:100)\nFailure: Build failed';
        const result = classifyFailures({ logText: log });
        expect(result).not.toBeNull();
        expect(result!.length).toBeGreaterThanOrEqual(1);
        expect(result!.some((f) => f.message!.includes('Connection refused'))).toBe(true);
    });

    it('R5: Sem dados → retorna array vazio', () => {
        const result = classifyFailures({});
        expect(result).toEqual([]);
    });

    it('R6: Prioridade: GitLab > GitHub steps > Check Runs > Regex', () => {
        const result = classifyFailures({
            gitlabFailureReason: 'script_failure',
            githubSteps: [{ name: 'Test', conclusion: 'failure', number: 1 }],
            checkRunAnnotations: [
                { path: 'x.ts', start_line: 1, end_line: 1, message: 'err', annotation_level: 'failure' },
            ],
        });
        expect(result![0]!.reason).toBe('script_failure');
    });
});
