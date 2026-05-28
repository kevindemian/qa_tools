import { WorkflowBuilder, type JobConfig, type StepConfig } from '../builder/workflow-builder';
import type { SetupContext } from '../context';

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
            postStepEnv.GITHUB_TOKEN = '${{ secrets.GITHUB_TOKEN }}';
        }
        const postCmd = `npx tsx git_triggers/main.ts --batch --project ${ctx.projectName} --branch \${{ github.ref_name }}`;
        testSteps.push({
            name: 'QA Tools Post-Processing',
            if: 'always()',
            run: postCmd,
            env: Object.keys(postStepEnv).length > 0 ? postStepEnv : undefined,
        });
    }

    const job: JobConfig = {
        runsOn: 'ubuntu-latest',
        steps: testSteps,
    };

    builder.addJob('qa-tools', job);
    return builder.toString();
}
