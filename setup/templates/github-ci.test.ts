import { generateCIWorkflow, generateQaPostProcessAction } from './github-ci.js';
import { ACTION_VERSIONS } from '../../shared/test-utils/constants.js';
import type { SetupContext } from '../context.js';

const MOCK_CTX_BASIC: SetupContext = {
    projectName: 'test-proj',
    framework: 'cypress',
    ctrfReportPath: 'cypress/reports/ctrf-report.json',
    ctrfSource: 'cli-flag',
    nodeVersion: '20',
    installCmd: 'npm ci',
    testCmd: 'npx cypress run --reporter ctrf',
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

const MOCK_CTX_FULL: SetupContext = {
    ...MOCK_CTX_BASIC,
    features: {
        qualityGate: true,
        flakinessDashboard: true,
        aiFailureAnalysis: true,
        prePushHook: true,
        prReport: true,
        prReportPublishTarget: 'github-actions',
    },
};

describe('GenerateCIWorkflow', () => {
    it('returns YAML string with workflow name', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_BASIC);

        expect(yaml).toContain('name: CI');
        expect(yaml).toContain('push');
        expect(yaml).toContain('pull_request');
    });

    it('includes test steps', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_BASIC);

        expect(yaml).toContain('npm ci');
        expect(yaml).toContain('npx cypress run');
    });

    it('adds post-processing job via reusable workflow when prReport enabled', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_FULL);

        expect(yaml).toContain('post-process:');
        expect(yaml).toContain('./.github/workflows/qa-post-process.yml');
    });

    it('does not add post-processing when prReport disabled', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_BASIC);

        expect(yaml).not.toContain('post-process:');
    });

    it('includes upload-artifact step when prReport enabled', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_FULL);

        expect(yaml).toContain(ACTION_VERSIONS.UPLOAD_ARTIFACT);
        expect(yaml).toContain('ctrf-report');
    });

    it('includes setup-node with correct version', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_BASIC);

        expect(yaml).toContain('node-version: "20"');
    });

    it('generates minimal workflow when prReport enabled but all sub-features disabled', () => {
        const ctx: SetupContext = {
            ...MOCK_CTX_BASIC,
            features: {
                ...MOCK_CTX_BASIC.features,
                prReport: true,
            },
        };
        const yaml = generateCIWorkflow(ctx);

        expect(yaml).toContain('post-process:');
        expect(yaml).toContain('./.github/workflows/qa-post-process.yml');
        // Sub-features are consumed by the runtime (pr-report-core), not by the template
        expect(yaml).not.toContain('--no-ai');
        expect(yaml).not.toContain('--no-quality');
    });
});

describe('GenerateQaPostProcessAction', () => {
    it('returns composite action YAML', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).toContain('name: QA Tools Post-Process');
        expect(yaml).toContain('using: composite');
        expect(yaml).toContain('shared/pr-report-core.ts');
        expect(yaml).toContain('GITHUB_TOKEN');
    });

    it('includes ctrf-path input with default', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).toContain('ctrf-path');
        expect(yaml).toContain('reports/ctrf-report.json');
    });

    it('includes project-name input (required)', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).toContain('project-name');
        expect(yaml).toContain('required: true');
    });

    it('passes --project ${{ inputs.project-name }} in run command', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).toContain('--project ${{ inputs.project-name }}');
    });
});

describe('GenerateCIWorkflow — with: project-name', () => {
    it('includes with: block with project-name when prReport enabled', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_FULL);

        expect(yaml).toContain('project-name: test-proj');
    });

    it('does not include project-name when prReport disabled', () => {
        const yaml = generateCIWorkflow(MOCK_CTX_BASIC);

        expect(yaml).not.toContain('project-name:');
    });
});

describe('GenerateQaPostProcessAction — HTML upload', () => {
    it('does NOT include upload-artifact (invalid in composite action)', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).not.toContain('actions/upload-artifact');
        expect(yaml).not.toContain('Upload PR Report HTML');
        expect(yaml).not.toContain('pr-report-html');
    });

    it('has no if: always in composite action (only run step)', () => {
        const yaml = generateQaPostProcessAction();

        expect(yaml).not.toContain('if: always()');
    });
});
