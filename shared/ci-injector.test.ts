/**
 * Tests for CI injector — ci.yml injection + reusable workflow generation.
 *
 * Coverage targets:
 * - injectPostProcessJob: idempotency, injection correctness, edge cases
 * - generatePostProcessWorkflowYaml: output structure, overrides
 * - extractFirstJobName: extraction accuracy, fallback
 * - Contract: deployed qa-post-process.yml must match generator output
 * - Contract: ci-injector and setup wizard generators must produce equivalent YAML
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { generatePostProcessWorkflowYaml, extractFirstJobName, injectPostProcessJob } from './ci-injector.js';
import { generateQaPostProcessWorkflow } from '../setup/templates/qa-post-process-workflow.js';
import { ACTION_VERSIONS } from './test-utils/constants.js';
import type { SetupContext } from '../setup/context.js';
/* ── Fixtures ──────────────────────────────────────────────────────────── */

const SIMPLE_CI_YML =
    [
        'name: CI',
        '',
        'on: [push]',
        '',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        `      - uses: ${ACTION_VERSIONS.CHECKOUT}`,
        '      - run: npm ci',
        '      - run: npm test',
    ].join('\n') + '\n';

const CI_WITH_MULTIPLE_JOBS =
    [
        'name: CI',
        '',
        'on: [push]',
        '',
        'jobs:',
        '  lint:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run lint',
        '  build:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run build',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm test',
    ].join('\n') + '\n';

const CI_ALREADY_HAS_POST_PROCESS =
    [
        'name: CI',
        '',
        'on: [push]',
        '',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm test',
        '  post-process:',
        '    if: always()',
        '    needs: [test]',
        '    uses: ./.github/workflows/qa-post-process.yml',
    ].join('\n') + '\n';

const NO_JOBS_CI_YML = 'name: CI\n\non: [push]\n';
const EMPTY_STRING = '';

/* ── generatePostProcessWorkflowYaml ──────────────────────────────────── */

describe('GeneratePostProcessWorkflowYaml', () => {
    it('returns a valid YAML string', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'my-project' });

        expect(yaml).toBeTypeOf('string');
        expect(yaml.length).toBeGreaterThan(100);
        expect(yaml).toContain('name: QA Post-Process');
        expect(yaml).toContain('workflow_call:');
        expect(yaml).toContain('post-process:');
    });

    it('includes the project name in inputs', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'my-project' });

        expect(yaml).toContain('project-name:');
    });

    it('uses defaults for test report path, node version, install command', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });

        expect(yaml).toContain('reports/');
        expect(yaml).toContain('node-version: 22');
        expect(yaml).toContain('npm ci');
    });

    it('accepts custom test report path', () => {
        const yaml = generatePostProcessWorkflowYaml({
            projectName: 'p',
            testReportPath: 'custom/test-results/',
        });

        expect(yaml).toContain('custom/test-results/');
    });

    it('accepts custom node version', () => {
        const yaml = generatePostProcessWorkflowYaml({
            projectName: 'p',
            nodeVersion: '20',
        });

        expect(yaml).toContain('node-version: 20');
    });

    it('accepts custom install command', () => {
        const yaml = generatePostProcessWorkflowYaml({
            projectName: 'p',
            installCmd: 'pnpm install --frozen-lockfile',
        });

        expect(yaml).toContain('pnpm install --frozen-lockfile');
    });

    it('includes test-report-path and artifact-name inputs', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });

        expect(yaml).toContain('test-report-path:');
        expect(yaml).toContain('artifact-name:');
    });

    it('includes artifact upload step', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });

        expect(yaml).toContain(ACTION_VERSIONS.UPLOAD_ARTIFACT);
        expect(yaml).toContain('pr-report-html');
    });

    it('references shared/pr-report-core.ts in run command', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });

        expect(yaml).toContain('shared/pr-report-core.ts');
        expect(yaml).toContain('--project ${{ inputs.project-name }}');
    });
});

/* ── extractFirstJobName ───────────────────────────────────────────────── */

describe('ExtractFirstJobName', () => {
    it('extracts first job name from simple ci.yml', () => {
        expect(extractFirstJobName(SIMPLE_CI_YML)).toBe('test');
    });

    it('extracts first job from multi-job ci.yml', () => {
        expect(extractFirstJobName(CI_WITH_MULTIPLE_JOBS)).toBe('lint');
    });

    it('returns default when no jobs section exists', () => {
        expect(extractFirstJobName(NO_JOBS_CI_YML)).toBe('test');
    });

    it('returns default for empty string', () => {
        expect(extractFirstJobName(EMPTY_STRING)).toBe('test');
    });

    it('extracts name even with unusual job name', () => {
        const yml = 'name: CI\n\njobs:\n  qa-tools:\n    runs-on: ubuntu-latest\n';

        expect(extractFirstJobName(yml)).toBe('qa-tools');
    });
});

/* ── injectPostProcessJob ──────────────────────────────────────────────── */

describe('InjectPostProcessJob', () => {
    it('injects post-process job when not present', () => {
        const result = injectPostProcessJob(SIMPLE_CI_YML, 'my-project');

        expect(result).toContain('post-process:');
        expect(result).toContain('if: always()');
        expect(result).toContain('needs: [test]');
        expect(result).toContain('qa-post-process.yml');
        expect(result).toContain('project-name: my-project');
    });

    it('preserves all existing content', () => {
        const result = injectPostProcessJob(SIMPLE_CI_YML, 'my-project');

        expect(result).toContain('name: CI');
        expect(result).toContain('on: [push]');
        expect(result).toContain('test:');
        expect(result).toContain(ACTION_VERSIONS.CHECKOUT);
    });

    it('is idempotent — does not inject when post-process already exists', () => {
        const result = injectPostProcessJob(CI_ALREADY_HAS_POST_PROCESS, 'my-project');

        expect(result).toBe(CI_ALREADY_HAS_POST_PROCESS);
    });

    it('uses first job name for needs: in multi-job setup', () => {
        const result = injectPostProcessJob(CI_WITH_MULTIPLE_JOBS, 'p');

        expect(result).toContain('needs: [lint]');
    });

    it('handles empty content gracefully', () => {
        const result = injectPostProcessJob('', 'p');

        expect(result).toBeTypeOf('string');
        expect(result).toContain('post-process:');
    });

    it('handles content without jobs section', () => {
        const result = injectPostProcessJob(NO_JOBS_CI_YML, 'p');

        expect(result).toContain('post-process:');
        expect(result).toContain('needs: [test]');
    });
});

/* ── Contract: deployed file = generator output ─────────────────────── */

describe('Contract: deployed qa-post-process.yml matches generator', () => {
    const ROOT = path.resolve(import.meta.dirname, '..');

    it('deployed file is identical to generatePostProcessWorkflowYaml output', () => {
        expect.hasAssertions();

        const deployedPath = path.join(ROOT, '.github', 'workflows', 'qa-post-process.yml');
        const deployed = fs.readFileSync(deployedPath, 'utf8').trim();
        const generated = generatePostProcessWorkflowYaml({ projectName: 'qa_tools' }).trim();

        expect(deployed).toBe(generated);
    });

    it('deployed file contains test-report-path and artifact-name inputs', () => {
        expect.hasAssertions();

        const deployedPath = path.join(ROOT, '.github', 'workflows', 'qa-post-process.yml');
        const deployed = fs.readFileSync(deployedPath, 'utf8');

        expect(deployed).toContain('test-report-path:');
        expect(deployed).toContain('artifact-name:');
    });

    it('deployed file does NOT contain manual steps (no drift)', () => {
        expect.hasAssertions();

        const deployedPath = path.join(ROOT, '.github', 'workflows', 'qa-post-process.yml');
        const deployed = fs.readFileSync(deployedPath, 'utf8');

        expect(deployed).not.toContain('Verify CTRF');
        expect(deployed).not.toContain('continue-on-error');
        expect(deployed).not.toContain('ls -la');
    });

    it('ci.yml upload artifact name is test-report', () => {
        expect.hasAssertions();

        const ciPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');
        const ciYaml = fs.readFileSync(ciPath, 'utf8');

        expect(ciYaml).toContain('name: test-report');
    });
});

/* ── Contract: two generators produce equivalent YAML ───────────────── */

describe('Contract: ci-injector and setup wizard generators are equivalent', () => {
    function makeCtx(overrides: Partial<SetupContext> = {}): SetupContext {
        return {
            projectName: 'test-project',
            framework: 'vitest',
            testReportPath: 'reports/ctrf-report.json',
            artifactName: 'test-report',
            testReportSource: 'config-file',
            nodeVersion: '22',
            installCmd: 'npm ci',
            testCmd: 'npx vitest run',
            gitProvider: 'github',
            repoOwner: 'owner',
            repoName: 'repo',
            workflowDir: '.github/workflows',
            features: {
                qualityGate: false,
                flakinessDashboard: false,
                aiFailureAnalysis: false,
                prePushHook: false,
                prReport: true,
                prReportPublishTarget: 'github-actions',
            },
            ...overrides,
        };
    }

    it('produce identical output for default options', () => {
        expect.hasAssertions();

        const fromInjector = generatePostProcessWorkflowYaml({ projectName: 'test-project' });
        const fromWizard = generateQaPostProcessWorkflow(makeCtx());

        expect(fromInjector).toBe(fromWizard);
    });

    it('both include test-report-path and artifact-name inputs', () => {
        expect.hasAssertions();

        const fromInjector = generatePostProcessWorkflowYaml({ projectName: 'p' });
        const fromWizard = generateQaPostProcessWorkflow(makeCtx({ projectName: 'p' }));

        expect(fromInjector).toContain('test-report-path:');
        expect(fromWizard).toContain('test-report-path:');
        expect(fromInjector).toContain('artifact-name:');
        expect(fromWizard).toContain('artifact-name:');
    });

    it('both use modern action versions (not pinned SHAs)', () => {
        expect.hasAssertions();

        const fromInjector = generatePostProcessWorkflowYaml({ projectName: 'p' });
        const fromWizard = generateQaPostProcessWorkflow(makeCtx({ projectName: 'p' }));

        for (const yaml of [fromInjector, fromWizard]) {
            expect(yaml).toContain(ACTION_VERSIONS.CHECKOUT);
            expect(yaml).toContain(ACTION_VERSIONS.SETUP_NODE);
            expect(yaml).toContain(ACTION_VERSIONS.UPLOAD_ARTIFACT);
        }
    });
});
