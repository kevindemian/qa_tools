/**
 * GitLab CI template generator.
 *
 * Generates a `.gitlab-ci.yml` file with:
 * 1. Install + test steps
 * 2. Optional PR Report post-processing via git_triggers/main.ts pr-report
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
        ]
            .filter(Boolean)
            .join(' ');
        scriptLines.push(
            'npx tsx git_triggers/main.ts pr-report --project ' + ctx.projectName + (flags ? ' ' + flags : ''),
        );
    }

    const job: JobConfig = {
        stage: 'test',
        image: 'node:' + ctx.nodeVersion,
        script: scriptLines,
        artifacts: {
            paths: [ctx.testReportPath],
            reports: {
                junit: ['reports/junit.xml'],
            },
        },
    };

    builder.addJob('qa-tools', job);
    return builder.toString();
}
