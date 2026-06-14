/**
 * GitHub Actions CI pipeline template generator.
 *
 * Generates a complete `.github/workflows/ci.yml` file that:
 * 1. Checks out code and installs dependencies
 * 2. Runs tests (with CTRF reporter if configured)
 * 3. Uploads the CTRF report as a CI artifact
 * 4. Runs QA Tools post-processing (PR report via pr-report-core.ts)
 *
 * For within-CI post-processing on GitHub Actions, we use shared/pr-report-core.ts
 * directly (which reads CTRF from the filesystem in the same job) rather than
 * git_triggers/main.ts --batch (which is designed for local/interactive use and
 * would trigger a new workflow via API, causing an infinite loop).
 *
 * When the CI already exists (ci.yml), the wizard uses the composite action
 * (qa-action.ts) instead and injects a uses: step into the existing workflow.
 */
import { WorkflowBuilder, type JobConfig, type StepConfig } from '../builder/workflow-builder.js';
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
        '    - name: Upload PR Report HTML',
        '      uses: actions/upload-artifact@v4',
        '      if: always()',
        '      with:',
        '        name: pr-report-html',
        '        path: reports/pr-report.html',
        '        if-no-files-found: warn',
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

    const checkoutStep: StepConfig = { uses: 'actions/checkout@v4' };
    const setupNodeStep: StepConfig = {
        uses: 'actions/setup-node@v4',
        with: { 'node-version': ctx.nodeVersion },
    };
    const installStep: StepConfig = { name: 'Install dependencies', run: ctx.installCmd };
    const testStep: StepConfig = { name: 'Run tests', run: ctx.testCmd };
    const uploadStep: StepConfig = {
        name: 'Upload CTRF report',
        uses: 'actions/upload-artifact@v4',
        with: {
            name: 'ctrf-report',
            path: ctx.ctrfReportPath,
            'if-no-files-found': 'warn',
        },
    };

    const testSteps: StepConfig[] = [checkoutStep, setupNodeStep, installStep, testStep, uploadStep];

    if (ctx.features.prReport) {
        testSteps.push({
            name: 'QA Tools Post-Processing',
            if: 'always()',
            uses: './.github/actions/qa-post-process',
            with: {
                'project-name': ctx.projectName,
            },
        });
    }

    const job: JobConfig = {
        runsOn: 'ubuntu-latest',
        steps: testSteps,
    };

    builder.addJob('qa-tools', job);
    return builder.toString();
}
