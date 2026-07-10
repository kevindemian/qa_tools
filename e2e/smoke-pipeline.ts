import type JiraClient from '../shared/jira-client.js';
import type JiraLinkManager from '../jira_management/jira_link_manager.js';
import { createGitHubSmokeManager } from './smoke-shared.js';
import { getDataHub, isDataHubInitialized } from '../shared/data-hub/global-hub.js';
import { calcFlakinessEntries } from '../shared/data-hub/compute/flakiness-entries.js';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard.js';
import { pollPipeline } from '../git_triggers/pipeline-handler.js';
import { collectTestResults } from '../git_triggers/test-results.js';
import { offerPipelineFailureAnalysis } from '../git_triggers/llm-pipeline.js';
import { rootLogger } from '../shared/logger.js';

const E2E_PIPELINE = process.env['E2E_PIPELINE'] === 'true';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        rootLogger.error('FAIL: ' + message);
        process.exitCode = 1;
    }
}

async function triggerAndFindRun(
    gh: ReturnType<typeof createGitHubSmokeManager>,
): Promise<{ runId: string; runStatus: string }> {
    rootLogger.info('Triggering CI workflow on main...');
    const result = await gh.triggerPipeline({ ref: 'main', variables: [] });
    assert(result, 'triggerPipeline returned undefined');
    assert(result.web_url, 'triggerPipeline result missing web_url');
    rootLogger.info('  Workflow dispatched: ' + result.web_url);

    const runs = await gh.getRecentPipelines(3);
    assert(runs, 'getRecentPipelines returned null/undefined');
    assert(runs.length > 0, 'No workflow runs found after trigger');
    const latestRun = runs[0];
    assert(latestRun, 'No workflow run found');
    assert(latestRun.id, 'Latest run missing id');
    const runId = String(latestRun.id);
    const runStatus = latestRun.status || 'unknown';
    assert(
        ['completed', 'success', 'in_progress', 'pending'].includes(runStatus),
        'Unexpected run status: ' + runStatus,
    );
    rootLogger.info('  Latest run ID: ' + runId + ' (status: ' + runStatus + ')');
    return { runId, runStatus };
}

async function pollIfNeeded(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    runId: string,
    runStatus: string,
): Promise<void> {
    if (runStatus === 'in_progress' || runStatus === 'pending') {
        rootLogger.info('Polling pipeline ' + runId + '...');
        const pollResult = await pollPipeline(gh, runId);
        assert(pollResult, 'pollPipeline returned undefined');
        assert(pollResult.status, 'pollPipeline result missing status');
        rootLogger.info('  Pipeline result: ' + pollResult.status + '\n');
    } else {
        rootLogger.info('  Run already completed, skipping poll.\n');
    }

    const artifacts = await gh.listPipelineArtifacts(runId);
    if (artifacts.length === 0) {
        rootLogger.info('  No artifacts found (expected — CI workflow does not upload artifacts yet).\n');
    } else {
        rootLogger.info('  Artifacts: ' + artifacts.length + '\n');
    }
}

async function collectAndReportResults(gh: ReturnType<typeof createGitHubSmokeManager>, runId: string): Promise<void> {
    const jiraResource = {} as JiraClient;
    const linkManager = {} as JiraLinkManager;
    const parsed = await collectTestResults({
        m: gh,
        pipelineId: runId,
        branch: 'main',
        projectName: 'qa_tools_e2e',
        currentProvider: 'github',
        pushHistory: () => {},
        jiraResource,
        linkManager,
        jiraBaseUrl: '',
    });
    if (!parsed) {
        rootLogger.info('  No test results collected (expected if no artifacts).\n');
        return;
    }

    assert(typeof parsed.tests.length === 'number', 'parsed.tests is not an array');
    assert(typeof parsed.stats.passed === 'number', 'parsed.stats.passed is not a number');
    assert(typeof parsed.stats.failed === 'number', 'parsed.stats.failed is not a number');
    assert(typeof parsed.stats.skipped === 'number', 'parsed.stats.skipped is not a number');
    assert(
        parsed.tests.length <= parsed.stats.passed + parsed.stats.failed + parsed.stats.skipped + 1,
        'stats mismatch: tests > passed+failed+skipped',
    );
    rootLogger.info(
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

    await offerPipelineFailureAnalysis(parsed);

    if (!isDataHubInitialized()) {
        rootLogger.info('  DataHub not initialized — skipping flakiness calculation');
        return;
    }
    const hub = getDataHub();
    const projectRuns = (hub.computed.metricsRuns ?? []).filter(
        (r: { project: string }) => r.project === 'qa_tools_e2e',
    );
    if (projectRuns.length >= 2) {
        const flaky = calcFlakinessEntries(projectRuns, 2);
        const html = generateFlakinessHtml(flaky, 'Flakiness — qa_tools_e2e');
        assert(html, 'generateFlakinessHtml returned empty');
        assert(html.length > 0, 'Flakiness dashboard HTML is empty');
        rootLogger.info('  Flakiness dashboard generated (' + html.length + ' chars)');
    } else {
        rootLogger.info('  Not enough runs for flakiness calculation (need >= 2, have ' + projectRuns.length + ')');
    }
}

function printPipelineSummary(): void {
    if (process.exitCode) {
        rootLogger.error('\nFAIL: Pipeline E2E smoke test completed with errors.');
    } else {
        rootLogger.info('OK: Pipeline E2E flow completed.');
    }
}

async function main() {
    rootLogger.info('=== Camada 3: Pipeline E2E Smoke Test ===\n');

    if (!E2E_PIPELINE) {
        rootLogger.info('SKIP: Set E2E_PIPELINE=true to run this test (triggers a real GitHub Actions run).');
        rootLogger.info(
            '  This test: triggers workflow → polls completion → downloads artifacts → generates dashboard.',
        );
        return;
    }

    const gh = createGitHubSmokeManager();
    const { runId, runStatus } = await triggerAndFindRun(gh);
    await pollIfNeeded(gh, runId, runStatus);
    await collectAndReportResults(gh, runId);
    printPipelineSummary();
}

main().catch((err) => {
    rootLogger.error('Unhandled error:', err);
    process.exitCode = 1;
});
