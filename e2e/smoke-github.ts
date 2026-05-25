import { createGitHubSmokeManager } from './smoke-shared';

async function main() {
    console.log('=== Camada 1: Read-Only GitHub Smoke Test ===\n');

    const gh = createGitHubSmokeManager();
    let passed = 0;
    let failed = 0;

    // 1. getBranch on existing branch
    const main = await gh.getBranch('main');
    if (main?.name === 'main') {
        console.log('  OK: getBranch(main) = ' + main.name);
        passed++;
    } else {
        console.error('  FAIL: getBranch(main) returned ' + JSON.stringify(main));
        failed++;
    }

    // 2. getBranch on nonexistent branch → null
    const missing = await gh.getBranch('__nonexistent_branch_xyz__');
    if (missing === null) {
        console.log('  OK: getBranch(nonexistent) = null');
        passed++;
    } else {
        console.error('  FAIL: getBranch(nonexistent) = ' + JSON.stringify(missing));
        failed++;
    }

    // 3. getDiff between main and dev
    const diff = await gh.getDiff('main', 'dev');
    if (typeof diff === 'string') {
        console.log('  OK: getDiff(main, dev) = ' + diff.length + ' chars' + (diff ? ' (non-empty)' : ' (empty)'));
        passed++;
    } else {
        console.error('  FAIL: getDiff returned ' + typeof diff);
        failed++;
    }

    // 4. getRecentPipelines
    const runs = await gh.getRecentPipelines(5);
    if (Array.isArray(runs)) {
        console.log('  OK: getRecentPipelines(5) = ' + runs.length + ' runs');
        passed++;
    } else {
        console.error('  FAIL: getRecentPipelines returned non-array');
        failed++;
    }

    // 5. getCICDVariables
    const vars = await gh.getCICDVariables();
    if (Array.isArray(vars)) {
        console.log('  OK: getCICDVariables() = ' + vars.length + ' variables');
        passed++;
    } else {
        console.error('  FAIL: getCICDVariables returned non-array');
        failed++;
    }

    // 6. searchMergeRequests (open PRs)
    const prs = await gh.searchMergeRequests('', '', 'open');
    if (Array.isArray(prs)) {
        console.log('  OK: searchMergeRequests(open) = ' + prs.length + ' PRs');
        passed++;
    } else {
        console.error('  FAIL: searchMergeRequests returned non-array');
        failed++;
    }

    // Summary
    console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
});
