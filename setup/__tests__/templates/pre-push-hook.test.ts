import { generatePrePushHook } from '../../templates/pre-push-hook.js';
import type { SetupContext } from '../../context.js';

const MOCK_CTX: SetupContext = {
    projectName: 'test-proj',
    framework: 'vitest',
    testReportPath: 'reports/ctrf-report.json',
    artifactName: 'test-report',
    testReportSource: 'cli-flag',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx vitest run',
    gitProvider: 'github',
    repoOwner: 'myorg',
    repoName: 'test-proj',
    workflowDir: '.github/workflows',
    features: {
        qualityGate: false,
        flakinessDashboard: false,
        aiFailureAnalysis: false,
        prePushHook: false,
        prReport: false,
        prReportPublishTarget: 'github-actions',
    },
};

describe('GeneratePrePushHook', () => {
    it.each([
        { label: 'shell script with project name', expected: ['#!/bin/sh', 'test-proj'] },
        { label: 'batch mode call', expected: ['git_triggers/main.ts', '--batch'] },
        { label: 'exit code check', expected: ['EXIT_CODE', 'exit 1'] },
        { label: 'skip message', expected: ['git push --no-verify'] },
    ])('includes $label', ({ expected }) => {
        expect.hasAssertions();

        const script = generatePrePushHook(MOCK_CTX);

        for (const token of expected) {
            expect(script).toContain(token);
        }
    });
});
