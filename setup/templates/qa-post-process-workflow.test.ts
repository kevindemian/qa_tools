import { describe, it, expect } from 'vitest';
import { generateQaPostProcessWorkflow } from './qa-post-process-workflow.js';
import { ACTION_VERSIONS } from '../../shared/test-utils/constants.js';
import type { SetupContext } from '../context.js';

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

    it('defines a reusable workflow with workflow_call trigger', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('name: QA Post-Process');
        expect(yaml).toContain('workflow_call:');
    });

    it('accepts project-name, test-report-path, and artifact-name inputs', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('project-name:');
        expect(yaml).toContain('required: true');
        expect(yaml).toContain('test-report-path:');
        expect(yaml).toContain('artifact-name:');
        expect(yaml).toContain('default: reports/');
    });

    it('runs pr-report-entry.ts with correct arguments', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('git_triggers/pr-report-entry.ts');
        expect(yaml).toContain('--project ${{ inputs.project-name }}');
    });

    it('uploads PR report HTML artifact', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain(ACTION_VERSIONS.UPLOAD_ARTIFACT);
        expect(yaml).toContain('name: pr-report-html');
        expect(yaml).toContain('path: reports/pr-report.html');
        expect(yaml).toContain('if-no-files-found: warn');
    });

    it('uses modern action versions (not pinned SHAs)', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain(ACTION_VERSIONS.CHECKOUT);
        expect(yaml).toContain(ACTION_VERSIONS.SETUP_NODE);
        expect(yaml).toContain(ACTION_VERSIONS.UPLOAD_ARTIFACT);
    });

    it('uses node version and install command from context', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('node-version: 22');
        expect(yaml).toContain('run: npm ci');
    });

    it('passes GITHUB_TOKEN to post-processing step', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('GITHUB_TOKEN: ${{ github.token }}');
    });

    it('post-processing step runs with if: always()', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('if: always()');
    });
});
