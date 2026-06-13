/**
 * GitHub Actions CI pipeline template generator.
 *
 * Generates a `.github/workflows/qa.yml` file that:
 * 1. Checks out code and installs dependencies
 * 2. Runs tests (with CTRF reporter if configured)
 * 3. Uploads the CTRF report as a CI artifact
 * 4. Runs QA Tools post-processing (PR report via pr-report.ts)
 *
 * For within-CI post-processing on GitHub Actions, we use scripts/pr-report.ts
 * directly (which reads CTRF from the filesystem in the same job) rather than
 * git_triggers/main.ts --batch (which is designed for local/interactive use and
 * would trigger a new workflow via API, causing an infinite loop).
 */
import { WorkflowBuilder, type JobConfig, type StepConfig } from '../builder/workflow-builder.js';
import type { SetupContext } from '../context.js';

export function generateGitHubActions(ctx: SetupContext): string {
    const builder = new WorkflowBuilder('github', ctx.projectName);
    builder.setWorkflowName('QA Pipeline');
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

    if (ctx.features.jiraIntegration || ctx.features.aiFailureAnalysis || ctx.features.flakinessDashboard) {
        const postStepEnv: Record<string, string> = {};
        if (ctx.gitProvider === 'github') {
            postStepEnv['GITHUB_TOKEN'] = '${{ secrets.GITHUB_TOKEN }}';
        }
        const postCmd = [
            'npx tsx scripts/pr-report.ts',
            ctx.features.aiFailureAnalysis ? '' : '--no-ai',
            ctx.features.flakinessDashboard ? '' : '--no-flaky',
            ctx.features.jiraIntegration ? '' : '--no-quality',
            `--ctrf ${ctx.ctrfReportPath}`,
        ]
            .filter(Boolean)
            .join(' ');
        testSteps.push({
            name: 'QA Tools Post-Processing',
            if: 'always()',
            run: postCmd,
            ...(Object.keys(postStepEnv).length > 0 ? { env: postStepEnv } : {}),
        });
    }

    const job: JobConfig = {
        runsOn: 'ubuntu-latest',
        steps: testSteps,
    };

    builder.addJob('qa-tools', job);
    return builder.toString();
}
