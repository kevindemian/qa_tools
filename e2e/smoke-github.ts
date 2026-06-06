import { createGitHubSmokeManager } from './smoke-shared.js';

async function testGetBranch(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const mainBranch = await gh.getBranch('main');
    if (mainBranch?.name === 'main') {
        console.log('  OK: getBranch(main) = ' + mainBranch.name);
        counters.passed++;
    } else {
        console.error('  FAIL: getBranch(main) returned ' + JSON.stringify(mainBranch));
        counters.failed++;
    }

    const missing = await gh.getBranch('__nonexistent_branch_xyz__');
    if (missing === null) {
        console.log('  OK: getBranch(nonexistent) = null');
        counters.passed++;
    } else {
        console.error('  FAIL: getBranch(nonexistent) = ' + JSON.stringify(missing));
        counters.failed++;
    }
}

async function testGetDiff(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const diff = await gh.getDiff('main', 'dev');
    if (typeof diff === 'string') {
        console.log('  OK: getDiff(main, dev) = ' + diff.length + ' chars' + (diff ? ' (non-empty)' : ' (empty)'));
        counters.passed++;
    } else {
        console.error('  FAIL: getDiff returned ' + typeof diff);
        counters.failed++;
    }
}

async function testListOperations(
    gh: ReturnType<typeof createGitHubSmokeManager>,
    counters: { passed: number; failed: number },
): Promise<void> {
    const runs = await gh.getRecentPipelines(5);
    if (Array.isArray(runs)) {
        console.log('  OK: getRecentPipelines(5) = ' + runs.length + ' runs');
        counters.passed++;
    } else {
        console.error('  FAIL: getRecentPipelines returned non-array');
        counters.failed++;
    }

    const vars = await gh.getCICDVariables();
    if (Array.isArray(vars)) {
        console.log('  OK: getCICDVariables() = ' + vars.length + ' variables');
        counters.passed++;
    } else {
        console.error('  FAIL: getCICDVariables returned non-array');
        counters.failed++;
    }

    const prs = await gh.searchMergeRequests('', '', 'open');
    if (Array.isArray(prs)) {
        console.log('  OK: searchMergeRequests(open) = ' + prs.length + ' PRs');
        counters.passed++;
    } else {
        console.error('  FAIL: searchMergeRequests returned non-array');
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
    console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed > 0) process.exitCode = 1;
}

async function main() {
    console.log('=== Camada 1: Read-Only GitHub Smoke Test ===\n');

    const gh = createGitHubSmokeManager();
    const { passed, failed } = await runAllApiTests(gh);
    printSmokeResults(passed, failed);
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
});
