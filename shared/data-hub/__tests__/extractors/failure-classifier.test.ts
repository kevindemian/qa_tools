import { describe, it, expect } from 'vitest';
import { classifyFailures, failureEntryToRecord } from '../../extractors/failure-classifier.js';
import type { FailureEntry } from '../../extractors/failure-classifier.js';

describe('ClassifyFailures', () => {
    it('r1: Check Runs annotations → retorna failures', () => {
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
        expect(result).toHaveLength(2);
        expect((result[0] as FailureEntry).message).toBe('Expected true, got false');
    });

    it('r2: GitHub steps com conclusão failed → retorna failures', () => {
        const steps = [
            { name: 'Build', conclusion: 'success', number: 1 },
            { name: 'Test', conclusion: 'failure', number: 2 },
        ];
        const result = classifyFailures({ githubSteps: steps });

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect((result[0] as FailureEntry).stepName).toBe('Test');
    });

    it('r3: GitLab failure_reason → retorna failures', () => {
        const result = classifyFailures({ gitlabFailureReason: 'script_failure' });

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect((result[0] as FailureEntry).reason).toBe('script_failure');
    });

    it('r4: Regex no log → retorna failures', () => {
        const log = 'Error: Connection refused\n  at Socket._onTimeout (net.js:100)\nFailure: Build failed';
        const result = classifyFailures({ logText: log });

        expect(result).not.toBeNull();
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.some((f) => (f.message as string).includes('Connection refused'))).toBeTruthy();
    });

    it('r5: Sem dados → retorna array vazio', () => {
        const result = classifyFailures({});

        expect(result).toStrictEqual([]);
    });

    it('r6: Prioridade: GitLab > GitHub steps > Check Runs > Regex', () => {
        const result = classifyFailures({
            gitlabFailureReason: 'script_failure',
            githubSteps: [{ name: 'Test', conclusion: 'failure', number: 1 }],
            checkRunAnnotations: [
                { path: 'x.ts', start_line: 1, end_line: 1, message: 'err', annotation_level: 'failure' },
            ],
        });

        expect((result[0] as FailureEntry).reason).toBe('script_failure');
    });

    it('r7-annotations: annotation estruturada carrega category/confidence/source', () => {
        const annotations = classifyFailures({
            checkRunAnnotations: [
                {
                    path: 'src/a.ts',
                    start_line: 10,
                    end_line: 10,
                    message: 'Expected true',
                    annotation_level: 'failure',
                },
            ],
        });

        expect(annotations).toHaveLength(1);
        expect(annotations[0]?.category).toStrictEqual(expect.any(String));
        expect(annotations[0]?.confidence).toBeCloseTo(0.8);
        expect(annotations[0]?.source).toBe('check-run-annotation');
    });

    it('r7-steps: github step carrega category/confidence/source', () => {
        const steps = classifyFailures({ githubSteps: [{ name: 'Test', conclusion: 'failure', number: 1 }] });

        expect(steps).toHaveLength(1);
        expect(steps[0]?.category).toStrictEqual(expect.any(String));
        expect(steps[0]?.confidence).toBeCloseTo(0.8);
        expect(steps[0]?.source).toBe('github-step');
    });

    it('r7-gitlab: gitlab reason carrega category/confidence/source', () => {
        const gitlab = classifyFailures({ gitlabFailureReason: 'script_failure' });

        expect(gitlab).toHaveLength(1);
        expect(gitlab[0]?.category).toStrictEqual(expect.any(String));
        expect(gitlab[0]?.confidence).toBeCloseTo(0.8);
        expect(gitlab[0]?.source).toBe('gitlab-reason');
    });

    it('r7-log: log regex carrega category/confidence/source', () => {
        const log = classifyFailures({ logText: 'Error: Connection refused at net.js:100' });

        expect(log).toHaveLength(1);
        expect(log[0]?.category).toStrictEqual(expect.any(String));
        expect(log[0]?.confidence).toBeCloseTo(0.6);
        expect(log[0]?.source).toBe('log-regex');
    });

    it('r8-warning: mapeia warning→broken preservando campos', () => {
        const warning = failureEntryToRecord({
            message: 'flaky env',
            file: 'src/a.ts',
            line: 12,
            level: 'warning',
            category: 'environment',
            confidence: 0.8,
            source: 'check-run-annotation',
        });

        expect(warning).toStrictEqual({
            name: 'flaky env',
            message: 'flaky env',
            file: 'src/a.ts',
            line: 12,
            status: 'broken',
            category: 'environment',
            confidence: 0.8,
            source: 'check-run-annotation',
        });
    });

    it('r8-failure: mapeia reason→failed com nome correto', () => {
        const failure = failureEntryToRecord({
            reason: 'script_failure',
            category: 'environment',
            confidence: 0.8,
            source: 'gitlab-reason',
        });

        expect(failure.status).toBe('failed');
        expect(failure.name).toBe('script_failure');
    });
});
