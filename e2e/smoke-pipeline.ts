import type { GitProvider } from '../shared/types';
import { createGitHubSmokeManager } from './smoke-shared';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import { pollPipeline } from '../git_triggers/pipeline-handler';
import { collectTestResults } from '../git_triggers/test-results';
import { offerPipelineFailureAnalysis } from '../git_triggers/llm-pipeline';

const E2E_PIPELINE = process.env.E2E_PIPELINE === 'true';

async function main() {
    console.log('=== Camada 3: Pipeline E2E Smoke Test ===\n');

    if (!E2E_PIPELINE) {
        console.log('SKIP: Set E2E_PIPELINE=true to run this test (triggers a real GitHub Actions run).');
        console.log('  This test: triggers workflow → polls completion → downloads artifacts → generates dashboard.');
        return;
    }

    const gh = createGitHubSmokeManager();

    // 1. Trigger pipeline
    console.log('Triggering CI workflow on main...');
    const result = await gh.triggerPipeline({ ref: 'main', variables: [] });
    if (!result) {
        console.error('FAIL: triggerPipeline returned undefined');
        process.exitCode = 1;
        return;
    }
    console.log('  Workflow dispatched: ' + (result.web_url || 'N/A'));

    // The trigger returns { id: workflow_id, web_url }.
    // We need the actual run ID for polling.
    // Get the most recent run matching the workflow
    const runs = await gh.getRecentPipelines(3);
    const latestRun = runs?.[0];
    if (!latestRun || !latestRun.id) {
        console.error('FAIL: No workflow runs found after trigger');
        process.exitCode = 1;
        return;
    }
    const runId = String(latestRun.id);
    console.log('  Latest run ID: ' + runId + ' (status: ' + (latestRun.status || 'unknown') + ')');

    // 2. Poll pipeline (only if it's in_progress/pending)
    if (latestRun.status === 'completed' || latestRun.status === 'success') {
        console.log('  Run already completed, skipping poll.\n');
    } else {
        console.log('Polling pipeline ' + runId + '...');
        const pollResult = await pollPipeline(gh as unknown as GitProvider, runId);
        console.log('  Pipeline result: ' + pollResult.status + '\n');
    }

    // 3. List artifacts
    const artifacts = await gh.listPipelineArtifacts(runId);
    if (!artifacts || artifacts.length === 0) {
        console.log('  No artifacts found (expected — CI workflow does not upload artifacts yet).\n');
    } else {
        console.log('  Artifacts: ' + artifacts.length + '\n');
    }

    // 4. Collect test results (skips gracefully if no artifacts)
    const parsed = await collectTestResults(
        gh as unknown as GitProvider,
        runId,
        'main',
        'qa_tools_e2e',
        'github',
        () => {},
    );
    if (parsed) {
        console.log(
            '  Parsed ' +
                parsed.tests.length +
                ' tests (' +
                parsed.stats.passed +
                ' passed, ' +
                parsed.stats.failed +
                ' failed, ' +
                parsed.stats.skipped +
                ' skipped)\n',
        );

        // 5. Offer LLM failure analysis
        await offerPipelineFailureAnalysis(parsed);

        // 6. Generate flakiness dashboard (if metrics file has enough data)
        const metrics = loadMetrics();
        const projectRuns = metrics.runs.filter((r: { project: string }) => r.project === 'qa_tools_e2e');
        if (projectRuns.length >= 2) {
            const flaky = calculateFlakiness({ runs: projectRuns }, 2);
            const html = generateFlakinessHtml(flaky, 'Flakiness — qa_tools_e2e');
            console.log('  Flakiness dashboard generated (' + html.length + ' chars)');
        } else {
            console.log('  Not enough runs for flakiness calculation (need >= 2, have ' + projectRuns.length + ')');
        }
    } else {
        console.log('  No test results collected (expected if no artifacts).\n');
    }

    console.log('OK: Pipeline E2E flow completed.');
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
});
