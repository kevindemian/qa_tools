/**
 * GitHub Actions CI pipeline template generator.
 *
 * Generates two files:
 * - `.github/workflows/ci.yml` — the main CI workflow (test job only)
 * - `.github/workflows/qa-post-process.yml` — reusable workflow for post-processing
 *
 * The post-processing job is extracted to a separate reusable workflow to:
 * 1. Decouple CI from metrics collection (SRP)
 * 2. Prevent the metrics bot commit from triggering CI auto-cancellation
 * 3. Keep ci.yml focused on testing only
 */
import { WorkflowBuilder, type JobConfig, type StepConfig } from '../builder/workflow-builder.js';
import { ACTION_VERSIONS } from '../../shared/test-utils/constants.js';
import type { SetupContext } from '../context.js';

function generateQaPostProcessActionYaml(): string {
    return [
        'name: QA Tools Post-Process',
        'description: Run QA Tools post-processing on test results and upload artifacts',
        'inputs:',
        '  ctrf-path:',
        '    description: Path to CTRF report JSON',
        '    required: false',
        '    default: reports/ctrf-report.json',
        '  project-name:',
        '    description: Project name for feature config lookup',
        '    required: true',
        'runs:',
        '  using: composite',
        '  steps:',
        '    - name: Run QA Tools Post-Processing',
        '      shell: bash',
        '      working-directory: ${{ github.workspace }}',
        '      run: npx tsx shared/pr-report-core.ts --ctrf ${{ inputs.ctrf-path }} --project ${{ inputs.project-name }}',
        '      env:',
        '        GITHUB_TOKEN: ${{ github.token }}',
    ].join('\n');
}

export function generateQaPostProcessAction(): string {
    return generateQaPostProcessActionYaml();
}

/**
 * Generate a complete CI workflow for a GitHub project.
 * Used when no ci.yml exists yet.
 */
export function generateCIWorkflow(ctx: SetupContext): string {
    const builder = new WorkflowBuilder('github', ctx.projectName);
    builder.setWorkflowName('CI');
    builder.setOn(['push', 'pull_request', 'workflow_dispatch']);

    const checkoutStep: StepConfig = { uses: ACTION_VERSIONS.CHECKOUT };
    const setupNodeStep: StepConfig = {
        uses: ACTION_VERSIONS.SETUP_NODE,
        with: { 'node-version': ctx.nodeVersion },
    };
    const installStep: StepConfig = { name: 'Install dependencies', run: ctx.installCmd };
    const testStep: StepConfig = { name: 'Run tests', run: ctx.testCmd };
    const testSteps: StepConfig[] = [checkoutStep, setupNodeStep, installStep, testStep];

    if (ctx.features.prReport) {
        testSteps.push({
            name: 'Upload CTRF report',
            uses: ACTION_VERSIONS.UPLOAD_ARTIFACT,
            with: {
                name: 'ctrf-report',
                path: ctx.ctrfReportPath,
                'if-no-files-found': 'warn',
            },
        });
    }

    const testJob: JobConfig = {
        runsOn: 'ubuntu-latest',
        steps: testSteps,
    };

    builder.addJob('qa-tools', testJob);

    if (ctx.features.prReport) {
        const postProcessJob: JobConfig = {
            if: 'always()',
            needs: ['qa-tools'],
            uses: './.github/workflows/qa-post-process.yml',
            with: {
                'project-name': ctx.projectName,
            },
        };
        builder.addJob('post-process', postProcessJob);
    }

    return builder.toString();
}
