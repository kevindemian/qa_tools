import { describe, it, expect } from 'vitest';
import { generateQaPostProcessWorkflow } from './qa-post-process-workflow.js';
import type { SetupContext } from '../context.js';

const MOCK_CTX: SetupContext = {
    projectName: 'test-proj',
    framework: 'vitest',
    ctrfReportPath: 'reports/ctrf-report.json',
    ctrfSource: 'config-file',
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

    it('accepts project-name and ctrf-path inputs', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('project-name:');
        expect(yaml).toContain('required: true');
        expect(yaml).toContain('ctrf-path:');
        expect(yaml).toContain('default: reports/ctrf-report.json');
    });

    it('includes shell guard for missing CTRF file', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('if [ ! -f "${{ inputs.ctrf-path }}" ]; then');
        expect(yaml).toContain('::warning::CTRF report not found');
        expect(yaml).toContain('exit 0');
    });

    it('runs pr-report-core.ts with correct arguments', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('shared/pr-report-core.ts');
        expect(yaml).toContain('--ctrf ${{ inputs.ctrf-path }}');
        expect(yaml).toContain('--project ${{ inputs.project-name }}');
    });

    it('downloads CTRF artifact with correct name', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('actions/download-artifact@v8');
        expect(yaml).toContain('name: ctrf-report');
        expect(yaml).toContain('path: reports/');
    });

    it('uploads PR report HTML artifact', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('actions/upload-artifact@v7');
        expect(yaml).toContain('name: pr-report-html');
        expect(yaml).toContain('path: reports/pr-report.html');
        expect(yaml).toContain('if-no-files-found: warn');
    });

    it('uses modern action versions (not pinned SHAs)', () => {
        const yaml = generateQaPostProcessWorkflow(MOCK_CTX);

        expect(yaml).toContain('actions/checkout@v5');
        expect(yaml).toContain('actions/setup-node@v6');
        expect(yaml).toContain('actions/download-artifact@v8');
        expect(yaml).toContain('actions/upload-artifact@v7');
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
