/**
 * GitLab CI template generator.
 *
 * Generates a `.gitlab-ci.yml` file with:
 * 1. Install + test steps
 * 2. Optional PR Report post-processing via pr-report-core.ts
 */
import { WorkflowBuilder, type JobConfig } from '../builder/workflow-builder.js';
import type { SetupContext } from '../context.js';

export function generateGitLabCI(ctx: SetupContext): string {
    const builder = new WorkflowBuilder('gitlab', ctx.projectName);
    builder.setStages(['test']);

    const scriptLines = [ctx.installCmd, ctx.testCmd];

    if (ctx.features.prReport) {
        const flags = [
            ctx.features.aiFailureAnalysis ? '' : '--no-ai',
            ctx.features.flakinessDashboard ? '' : '--no-flaky',
            ctx.features.qualityGate ? '' : '--no-quality',
            '--ctrf ' + ctx.ctrfReportPath,
        ]
            .filter(Boolean)
            .join(' ');
        scriptLines.push('npx tsx shared/pr-report-core.ts ' + flags);
    }

    const job: JobConfig = {
        stage: 'test',
        image: 'node:' + ctx.nodeVersion,
        script: scriptLines,
        artifacts: {
            paths: [ctx.ctrfReportPath],
            reports: {
                junit: ['reports/junit.xml'],
            },
        },
    };

    builder.addJob('qa-tools', job);
    return builder.toString();
}
