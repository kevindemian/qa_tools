import type { GitProvider } from '../shared/types';
import { createGitHubSmokeManager } from './smoke-shared';
import { generatePrDescription } from '../git_triggers/ai-pr-desc';
import Config from '../shared/config';

function hasLlmKeys(): boolean {
    return !!(Config.llmFastApiKey || Config.llmApiKey);
}

async function main() {
    console.log('=== Camada 2: LLM Cross-Validation Smoke Test ===\n');

    if (!hasLlmKeys()) {
        console.log('SKIP: No LLM API keys configured (LLM_FAST_API_KEY or LLM_API_KEY)');
        console.log('  Set them in .env to run this test.');
        return;
    }

    const gh = createGitHubSmokeManager();

    console.log('Fetching real diff between main and dev...');
    const diff = await gh.getDiff('main', 'dev');
    if (!diff) {
        console.log('SKIP: diff is empty (branches may have no divergence)');
        return;
    }
    console.log('  Diff: ' + diff.length + ' chars\n');

    console.log('Generating PR description via LLM (tier: fast)...');
    const description = await generatePrDescription(gh as unknown as GitProvider, 'main', 'dev');

    if (!description) {
        console.error('FAIL: generatePrDescription returned empty string');
        process.exitCode = 1;
        return;
    }

    console.log('\n=== Generated PR Description ===');
    console.log(description);
    console.log('=== End ===\n');

    console.log('OK: LLM PR description generated successfully (' + description.length + ' chars)');
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
});
