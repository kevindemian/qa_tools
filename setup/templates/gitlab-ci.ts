import { WorkflowBuilder, type JobConfig } from '../builder/workflow-builder.js';
import type { SetupContext } from '../context.js';

export function generateGitLabCI(ctx: SetupContext): string {
    const builder = new WorkflowBuilder('gitlab', ctx.projectName);
    builder.setStages(['test']);

    const job: JobConfig = {
        stage: 'test',
        image: 'node:' + ctx.nodeVersion,
        script: [ctx.installCmd, ctx.testCmd],
        artifacts: {
            paths: [ctx.ctrfReportPath],
            reports: {
                junit: ['reports/junit.xml'],
            },
        },
    };

    if (ctx.features.jiraIntegration || ctx.features.aiFailureAnalysis || ctx.features.flakinessDashboard) {
        if (job.script) {
            job.script.push(
                'npx tsx git_triggers/main.ts --batch --project ' + ctx.projectName + ' --branch $CI_COMMIT_BRANCH',
            );
        }
    }

    builder.addJob('qa-tools', job);
    return builder.toString();
}
