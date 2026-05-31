import { generateGitLabCI } from './gitlab-ci';
import type { SetupContext } from '../context';

const MOCK_CTX_BASIC: SetupContext = {
    projectName: 'test-proj',
    framework: 'jest',
    ctrfReportPath: 'reports/ctrf-report.json',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx jest --reporter ctrf',
    gitProvider: 'gitlab',
    repoOwner: 'myorg',
    repoName: 'test-proj',
    workflowDir: '.gitlab-ci.yml',
    features: {
        jiraIntegration: false,
        flakinessDashboard: false,
        aiFailureAnalysis: false,
        prePushHook: false,
    },
};

const MOCK_CTX_WITH_FEATURES: SetupContext = {
    ...MOCK_CTX_BASIC,
    features: {
        jiraIntegration: true,
        flakinessDashboard: true,
        aiFailureAnalysis: true,
        prePushHook: false,
    },
};

describe('generateGitLabCI', () => {
    it('returns YAML string with stage test', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);
        expect(yaml).toContain('test');
    });

    it('includes node image with correct version', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);
        expect(yaml).toContain('node:20');
    });

    it('includes install and test commands', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);
        expect(yaml).toContain('npm ci');
        expect(yaml).toContain('npx jest --reporter ctrf');
    });

    it('includes artifact paths', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);
        expect(yaml).toContain('reports/ctrf-report.json');
    });

    it('adds post-processing step when features enabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);
        expect(yaml).toContain('git_triggers/main.ts');
    });

    it('does not add post-processing when no features', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);
        expect(yaml).not.toContain('git_triggers/main.ts');
    });
});
