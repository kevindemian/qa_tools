import { generateGitLabCI } from '../../templates/gitlab-ci.js';
import type { SetupContext } from '../../context.js';

const MOCK_CTX_BASIC: SetupContext = {
    projectName: 'test-proj',
    framework: 'vitest',
    testReportPath: 'reports/ctrf-report.json',
    artifactName: 'test-report',
    testReportSource: 'cli-flag',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx vitest run --reporter ctrf',
    gitProvider: 'gitlab',
    repoOwner: 'myorg',
    repoName: 'test-proj',
    workflowDir: '.gitlab-ci.yml',
    features: {
        qualityGate: false,
        flakinessDashboard: false,
        aiFailureAnalysis: false,
        prePushHook: false,
        prReport: false,
        prReportPublishTarget: 'github-actions',
    },
};

const MOCK_CTX_WITH_FEATURES: SetupContext = {
    ...MOCK_CTX_BASIC,
    features: {
        qualityGate: true,
        flakinessDashboard: true,
        aiFailureAnalysis: true,
        prePushHook: false,
        prReport: true,
        prReportPublishTarget: 'github-actions',
    },
};

describe('GenerateGitLabCI', () => {
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
        expect(yaml).toContain('npx vitest run --reporter ctrf');
    });

    it('includes artifact paths', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);

        expect(yaml).toContain('reports/ctrf-report.json');
    });

    it('adds post-processing step when prReport enabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        expect(yaml).toContain('shared/pr-report-core.ts');
    });

    it('does not add post-processing when prReport disabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_BASIC);

        expect(yaml).not.toContain('shared/pr-report-core.ts');
    });

    it('includes --no-ai flag when aiFailureAnalysis disabled', () => {
        const ctx = {
            ...MOCK_CTX_WITH_FEATURES,
            features: { ...MOCK_CTX_WITH_FEATURES.features, aiFailureAnalysis: false },
        };
        const yaml = generateGitLabCI(ctx);

        expect(yaml).toContain('--no-ai');
    });

    it('includes --no-flaky flag when flakinessDashboard disabled', () => {
        const ctx = {
            ...MOCK_CTX_WITH_FEATURES,
            features: { ...MOCK_CTX_WITH_FEATURES.features, flakinessDashboard: false },
        };
        const yaml = generateGitLabCI(ctx);

        expect(yaml).toContain('--no-flaky');
    });

    it('includes --no-quality flag when qualityGate disabled', () => {
        const ctx = {
            ...MOCK_CTX_WITH_FEATURES,
            features: { ...MOCK_CTX_WITH_FEATURES.features, qualityGate: false },
        };
        const yaml = generateGitLabCI(ctx);

        expect(yaml).toContain('--no-quality');
    });

    it('does not include --ctrf flag (removed in Phase 3)', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        expect(yaml).not.toContain('--ctrf');
    });

    it('omits --no-ai when aiFailureAnalysis enabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        expect(yaml).not.toContain('--no-ai');
    });

    it('omits --no-flaky when flakinessDashboard enabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        expect(yaml).not.toContain('--no-flaky');
    });

    it('omits --no-quality when qualityGate enabled', () => {
        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        expect(yaml).not.toContain('--no-quality');
    });
});
