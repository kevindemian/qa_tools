import { generatePrePushHook } from './pre-push-hook.js';
import type { SetupContext } from '../context.js';

const MOCK_CTX: SetupContext = {
    projectName: 'test-proj',
    framework: 'jest',
    ctrfReportPath: 'reports/ctrf-report.json',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx jest',
    gitProvider: 'github',
    repoOwner: 'myorg',
    repoName: 'test-proj',
    workflowDir: '.github/workflows',
    features: {
        jiraIntegration: false,
        flakinessDashboard: false,
        aiFailureAnalysis: false,
        prePushHook: false,
    },
};

describe('generatePrePushHook', () => {
    it('returns shell script with project name', async () => {
        const script = generatePrePushHook(MOCK_CTX);
        expect(script).toContain('#!/bin/sh');
        expect(script).toContain('test-proj');
    });

    it('includes batch mode call', async () => {
        const script = generatePrePushHook(MOCK_CTX);
        expect(script).toContain('git_triggers/main.ts');
        expect(script).toContain('--batch');
    });

    it('includes exit code check', async () => {
        const script = generatePrePushHook(MOCK_CTX);
        expect(script).toContain('EXIT_CODE');
        expect(script).toContain('exit 1');
    });

    it('includes skip message', async () => {
        const script = generatePrePushHook(MOCK_CTX);
        expect(script).toContain('git push --no-verify');
    });
});
