/**
 * Tests for CI injector — ci.yml injection + reusable workflow generation.
 *
 * Coverage targets:
 * - injectPostProcessJob: idempotency, injection correctness, edge cases
 * - generatePostProcessWorkflowYaml: output structure, overrides
 * - extractFirstJobName: extraction accuracy, fallback
 */
import { describe, it, expect } from 'vitest';
import { generatePostProcessWorkflowYaml, extractFirstJobName, injectPostProcessJob } from './ci-injector.js';
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
        '      - uses: actions/checkout@v4',
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

describe('generatePostProcessWorkflowYaml', () => {
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

    it('uses defaults for CTRF path, node version, install command', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });
        expect(yaml).toContain('reports/ctrf-report.json');
        expect(yaml).toContain('node-version: 22');
        expect(yaml).toContain('npm ci');
    });

    it('accepts custom CTRF path', () => {
        const yaml = generatePostProcessWorkflowYaml({
            projectName: 'p',
            ctrfPath: 'custom/ctrf.json',
        });
        expect(yaml).toContain('custom/ctrf.json');
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

    it('includes the CTRF existence check shell guard', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });
        expect(yaml).toContain('if [ ! -f "${{ inputs.ctrf-path }}" ]; then');
        expect(yaml).toContain('::warning::CTRF report not found');
    });

    it('includes artifact upload step', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });
        expect(yaml).toContain('actions/upload-artifact@v4');
        expect(yaml).toContain('pr-report-html');
    });

    it('references shared/pr-report-core.ts in run command', () => {
        const yaml = generatePostProcessWorkflowYaml({ projectName: 'p' });
        expect(yaml).toContain('shared/pr-report-core.ts');
        expect(yaml).toContain('--project ${{ inputs.project-name }}');
    });
});

/* ── extractFirstJobName ───────────────────────────────────────────────── */

describe('extractFirstJobName', () => {
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

describe('injectPostProcessJob', () => {
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
        expect(result).toContain('actions/checkout@v4');
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
