import type { GitProvider } from '../shared/types';
import { createGitHubSmokeManager } from './smoke-shared';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import { pollPipeline } from '../git_triggers/pipeline-handler';
import { collectTestResults } from '../git_triggers/test-results';
import { offerPipelineFailureAnalysis } from '../git_triggers/llm-pipeline';

const E2E_PIPELINE = process.env.E2E_PIPELINE === 'true';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        console.error('FAIL: ' + message);
        process.exitCode = 1;
    }
}

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
    assert(result, 'triggerPipeline returned undefined');
    assert(result.web_url, 'triggerPipeline result missing web_url');
    console.log('  Workflow dispatched: ' + result.web_url);

    // 2. Find the triggered run
    const runs = await gh.getRecentPipelines(3);
    assert(runs, 'getRecentPipelines returned null/undefined');
    assert(runs!.length > 0, 'No workflow runs found after trigger');
    const latestRun = runs![0];
    assert(latestRun, 'No workflow run found');
    assert(latestRun.id, 'Latest run missing id');
    const runId = String(latestRun.id);
    const runStatus = latestRun.status || 'unknown';
    assert(
        ['completed', 'success', 'in_progress', 'pending'].includes(runStatus),
        'Unexpected run status: ' + runStatus,
    );
    console.log('  Latest run ID: ' + runId + ' (status: ' + runStatus + ')');

    // 3. Poll pipeline (only if it's in_progress/pending)
    if (runStatus === 'in_progress' || runStatus === 'pending') {
        console.log('Polling pipeline ' + runId + '...');
        const pollResult = await pollPipeline(gh as unknown as GitProvider, runId);
        assert(pollResult, 'pollPipeline returned undefined');
        assert(pollResult.status, 'pollPipeline result missing status');
        console.log('  Pipeline result: ' + pollResult.status + '\n');
    } else {
        console.log('  Run already completed, skipping poll.\n');
    }

    // 4. List artifacts (optional: CI may not upload yet)
    const artifacts = await gh.listPipelineArtifacts(runId);
    if (!artifacts || artifacts.length === 0) {
        console.log('  No artifacts found (expected — CI workflow does not upload artifacts yet).\n');
    } else {
        console.log('  Artifacts: ' + artifacts.length + '\n');
    }

    // 5. Collect test results (skips gracefully if no artifacts)
    const parsed = await collectTestResults(
        gh as unknown as GitProvider,
        runId,
        'main',
        'qa_tools_e2e',
        'github',
        () => {},
    );
    if (parsed) {
        assert(typeof parsed.tests.length === 'number', 'parsed.tests is not an array');
        assert(typeof parsed.stats.passed === 'number', 'parsed.stats.passed is not a number');
        assert(typeof parsed.stats.failed === 'number', 'parsed.stats.failed is not a number');
        assert(typeof parsed.stats.skipped === 'number', 'parsed.stats.skipped is not a number');
        assert(
            parsed.tests.length <= parsed.stats.passed + parsed.stats.failed + parsed.stats.skipped + 1,
            'stats mismatch: tests > passed+failed+skipped',
        );
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

        // 6. Offer LLM failure analysis
        await offerPipelineFailureAnalysis(parsed);

        // 7. Generate flakiness dashboard (if metrics file has enough data)
        const metrics = loadMetrics();
        assert(metrics, 'loadMetrics returned undefined');
        const projectRuns = metrics.runs.filter((r: { project: string }) => r.project === 'qa_tools_e2e');
        if (projectRuns.length >= 2) {
            const flaky = calculateFlakiness({ runs: projectRuns }, 2);
            const html = generateFlakinessHtml(flaky, 'Flakiness — qa_tools_e2e');
            assert(html, 'generateFlakinessHtml returned empty');
            assert(html.length > 0, 'Flakiness dashboard HTML is empty');
            console.log('  Flakiness dashboard generated (' + html.length + ' chars)');
        } else {
            console.log('  Not enough runs for flakiness calculation (need >= 2, have ' + projectRuns.length + ')');
        }
    } else {
        console.log('  No test results collected (expected if no artifacts).\n');
    }

    if (process.exitCode) {
        console.error('\nFAIL: Pipeline E2E smoke test completed with errors.');
    } else {
        console.log('OK: Pipeline E2E flow completed.');
    }
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
});
