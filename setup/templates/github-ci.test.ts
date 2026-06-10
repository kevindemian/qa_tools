import { generateGitHubActions } from './github-ci.js';
import type { SetupContext } from '../context.js';

const MOCK_CTX_BASIC: SetupContext = {
    projectName: 'test-proj',
    framework: 'cypress',
    ctrfReportPath: 'cypress/reports/ctrf-report.json',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx cypress run --reporter ctrf',
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

const MOCK_CTX_FULL: SetupContext = {
    ...MOCK_CTX_BASIC,
    features: {
        jiraIntegration: true,
        flakinessDashboard: true,
        aiFailureAnalysis: true,
        prePushHook: true,
    },
};

describe('generateGitHubActions', () => {
    it('returns YAML string with workflow name', () => {
        const yaml = generateGitHubActions(MOCK_CTX_BASIC);
        expect(yaml).toContain('QA Pipeline');
        expect(yaml).toContain('push');
        expect(yaml).toContain('pull_request');
    });

    it('includes test steps', () => {
        const yaml = generateGitHubActions(MOCK_CTX_BASIC);
        expect(yaml).toContain('npm ci');
        expect(yaml).toContain('npx cypress run');
    });

    it('adds post-processing step when features enabled', () => {
        const yaml = generateGitHubActions(MOCK_CTX_FULL);
        expect(yaml).toContain('QA Tools Post-Processing');
        expect(yaml).toContain('git_triggers/main.ts');
    });

    it('does not add post-processing when no features', () => {
        const yaml = generateGitHubActions(MOCK_CTX_BASIC);
        expect(yaml).not.toContain('QA Tools Post-Processing');
    });

    it('includes upload-artifact step', () => {
        const yaml = generateGitHubActions(MOCK_CTX_BASIC);
        expect(yaml).toContain('actions/upload-artifact@v4');
        expect(yaml).toContain('cypress/reports/ctrf-report.json');
    });

    it('includes setup-node with correct version', () => {
        const yaml = generateGitHubActions(MOCK_CTX_BASIC);
        expect(yaml).toContain('node-version: "20"');
    });
});
