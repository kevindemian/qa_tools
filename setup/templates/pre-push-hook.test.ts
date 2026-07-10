import { generatePrePushHook } from './pre-push-hook.js';
import type { SetupContext } from '../context.js';

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
    it('returns shell script with project name', () => {
        const script = generatePrePushHook(MOCK_CTX);

        expect(script).toContain('#!/bin/sh');
        expect(script).toContain('test-proj');
    });

    it('includes batch mode call', () => {
        const script = generatePrePushHook(MOCK_CTX);

        expect(script).toContain('git_triggers/main.ts');
        expect(script).toContain('--batch');
    });

    it('includes exit code check', () => {
        const script = generatePrePushHook(MOCK_CTX);

        expect(script).toContain('EXIT_CODE');
        expect(script).toContain('exit 1');
    });

    it('includes skip message', () => {
        const script = generatePrePushHook(MOCK_CTX);

        expect(script).toContain('git push --no-verify');
    });
});
