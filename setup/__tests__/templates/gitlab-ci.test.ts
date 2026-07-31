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

const MOCK_CTX_NO_AI: SetupContext = {
    ...MOCK_CTX_WITH_FEATURES,
    features: { ...MOCK_CTX_WITH_FEATURES.features, aiFailureAnalysis: false },
};

const MOCK_CTX_NO_FLAKY: SetupContext = {
    ...MOCK_CTX_WITH_FEATURES,
    features: { ...MOCK_CTX_WITH_FEATURES.features, flakinessDashboard: false },
};

const MOCK_CTX_NO_QUALITY: SetupContext = {
    ...MOCK_CTX_WITH_FEATURES,
    features: { ...MOCK_CTX_WITH_FEATURES.features, qualityGate: false },
};

describe('GenerateGitLabCI', () => {
    it.each([
        { label: 'returns YAML string with stage test', ctx: MOCK_CTX_BASIC, expected: ['test'], absent: [] },
        { label: 'includes node image with correct version', ctx: MOCK_CTX_BASIC, expected: ['node:20'], absent: [] },
        {
            label: 'includes install and test commands',
            ctx: MOCK_CTX_BASIC,
            expected: ['npm ci', 'npx vitest run --reporter ctrf'],
            absent: [],
        },
        { label: 'includes artifact paths', ctx: MOCK_CTX_BASIC, expected: ['reports/ctrf-report.json'], absent: [] },
        {
            label: 'adds post-processing step when prReport enabled',
            ctx: MOCK_CTX_WITH_FEATURES,
            expected: ['git_triggers/main.ts pr-report'],
            absent: [],
        },
        {
            label: 'passes --project with the client project name (not hardcoded)',
            ctx: MOCK_CTX_WITH_FEATURES,
            expected: ['pr-report --project test-proj'],
            absent: ['pr-report --project qa_tools'],
        },
        {
            label: 'does not add post-processing when prReport disabled',
            ctx: MOCK_CTX_BASIC,
            expected: [],
            absent: ['shared/pr-report-core.ts'],
        },
        {
            label: 'includes --no-ai flag when aiFailureAnalysis disabled',
            ctx: MOCK_CTX_NO_AI,
            expected: ['--no-ai'],
            absent: [],
        },
        {
            label: 'includes --no-flaky flag when flakinessDashboard disabled',
            ctx: MOCK_CTX_NO_FLAKY,
            expected: ['--no-flaky'],
            absent: [],
        },
        {
            label: 'includes --no-quality flag when qualityGate disabled',
            ctx: MOCK_CTX_NO_QUALITY,
            expected: ['--no-quality'],
            absent: [],
        },
    ])('$label', ({ ctx, expected, absent }) => {
        expect.hasAssertions();

        const yaml = generateGitLabCI(ctx);

        for (const token of expected) {
            expect(yaml).toContain(token);
        }
        for (const token of absent) {
            expect(yaml).not.toContain(token);
        }
    });

    it.each([
        { label: 'does not include --ctrf flag (removed in Phase 3)', absent: ['--ctrf'] },
        { label: 'omits --no-ai when aiFailureAnalysis enabled', absent: ['--no-ai'] },
        { label: 'omits --no-flaky when flakinessDashboard enabled', absent: ['--no-flaky'] },
        { label: 'omits --no-quality when qualityGate enabled', absent: ['--no-quality'] },
    ])('$label', ({ absent }) => {
        expect.hasAssertions();

        const yaml = generateGitLabCI(MOCK_CTX_WITH_FEATURES);

        for (const token of absent) {
            expect(yaml).not.toContain(token);
        }
    });
});
