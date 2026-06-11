import { createGitHubSmokeManager } from './smoke-shared.js';
import { rootLogger } from '../shared/logger.js';

async function testGetBranch(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const mainBranch = await gh.getBranch('main');
    if (mainBranch?.name === 'main') {
        rootLogger.info('  OK: getBranch(main) = ' + mainBranch.name);
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: getBranch(main) returned ' + JSON.stringify(mainBranch));
        counters.failed++;
    }

    const missing = await gh.getBranch('__nonexistent_branch_xyz__');
    if (missing === null) {
        rootLogger.info('  OK: getBranch(nonexistent) = null');
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: getBranch(nonexistent) = ' + JSON.stringify(missing));
        counters.failed++;
    }
}

async function testGetDiff(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const diff = await gh.getDiff('main', 'dev');
    if (typeof diff === 'string') {
        rootLogger.info('  OK: getDiff(main, dev) = ' + diff.length + ' chars' + (diff ? ' (non-empty)' : ' (empty)'));
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: getDiff returned ' + typeof diff);
        counters.failed++;
    }
}

async function testListOperations(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const runs = await gh.getRecentPipelines(5);
    if (Array.isArray(runs)) {
        rootLogger.info('  OK: getRecentPipelines(5) = ' + runs.length + ' runs');
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: getRecentPipelines returned non-array');
        counters.failed++;
    }

    const vars = await gh.getCICDVariables();
    if (Array.isArray(vars)) {
        rootLogger.info('  OK: getCICDVariables() = ' + vars.length + ' variables');
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: getCICDVariables returned non-array');
        counters.failed++;
    }

    const prs = await gh.searchMergeRequests('', '', 'open');
    if (Array.isArray(prs)) {
        rootLogger.info('  OK: searchMergeRequests(open) = ' + prs.length + ' PRs');
        counters.passed++;
    } else {
        rootLogger.error('  FAIL: searchMergeRequests returned non-array');
        counters.failed++;
    }
}

async function runAllApiTests(
    gh: ReturnType<typeof createGitHubSmokeManager>,
): Promise<{ passed: number; failed: number }> {
    const counters = { passed: 0, failed: 0 };

    await testGetBranch(gh, counters);
    await testGetDiff(gh, counters);
    await testListOperations(gh, counters);

    return counters;
}

function printSmokeResults(passed: number, failed: number): void {
    rootLogger.info('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed > 0) process.exitCode = 1;
}

async function main() {
    rootLogger.info('=== Camada 1: Read-Only GitHub Smoke Test ===\n');

    const gh = createGitHubSmokeManager();
    const { passed, failed } = await runAllApiTests(gh);
    printSmokeResults(passed, failed);
}

main().catch((err) => {
    rootLogger.error('Unhandled error:', err);
    process.exitCode = 1;
});
