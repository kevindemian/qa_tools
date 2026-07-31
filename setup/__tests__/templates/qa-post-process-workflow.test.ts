import { describe, it, expect } from 'vitest';
import { generateQaPostProcessWorkflow } from '../../templates/qa-post-process-workflow.js';
import { ACTION_VERSIONS } from '../../../shared/test-utils/constants.js';
import type { SetupContext } from '../../context.js';

const MOCK_CTX: SetupContext = {
    projectName: 'test-proj',
    framework: 'vitest',
    testReportPath: 'reports/ctrf-report.json',
    artifactName: 'test-report',
    testReportSource: 'config-file',
    nodeVersion: '22',
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
        prReport: true,
        prReportPublishTarget: 'github-actions',
    },
};

describe('GenerateQaPostProcessWorkflow', () => {
    it('returns a valid YAML string', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toBeTypeOf('string');
        expect(yaml.length).toBeGreaterThan(100);
    });

    it.each([
        {
            label: 'reusable workflow with workflow_call trigger',
            expected: ['name: QA Post-Process', 'workflow_call:'],
        },
        {
            label: 'project-name, test-report-path, and artifact-name inputs',
            expected: ['project-name:', 'required: true', 'test-report-path:', 'artifact-name:', 'default: reports/'],
        },
        {
            label: 'git_triggers/main.ts pr-report with correct arguments',
            expected: ['git_triggers/main.ts pr-report', '--project ${{ inputs.project-name }}'],
        },
        {
            label: 'PR report HTML artifact upload',
            expected: [
                ACTION_VERSIONS.UPLOAD_ARTIFACT,
                'name: pr-report-html',
                'path: reports/pr-report.html',
                'if-no-files-found: warn',
            ],
        },
        {
            label: 'modern action versions (not pinned SHAs)',
            expected: [ACTION_VERSIONS.CHECKOUT, ACTION_VERSIONS.SETUP_NODE, ACTION_VERSIONS.UPLOAD_ARTIFACT],
        },
        {
            label: 'node version and install command from context',
            expected: ['node-version: 22', 'run: npm ci'],
        },
        { label: 'GITHUB_TOKEN to post-processing step', expected: ['GITHUB_TOKEN: ${{ github.token }}'] },
        { label: 'post-processing step with if: always()', expected: ['if: always()'] },
    ])('$label', ({ expected }) => {
        expect.hasAssertions();

        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        for (const token of expected) {
            expect(yaml).toContain(token);
        }
    });
});
