import { createGitHubSmokeManager } from './smoke-shared.js';
import { generatePrDescription } from '../git_triggers/ai-pr-desc.js';
import Config from '../shared/config.js';
import { rootLogger } from '../shared/logger.js';

function hasLlmKeys(): boolean {
    return !!(Config.get('llmFastApiKey') || Config.get('llmApiKey'));
}

async function main() {
    rootLogger.info('=== Camada 2: LLM Cross-Validation Smoke Test ===\n');

    if (!hasLlmKeys()) {
        rootLogger.info('SKIP: No LLM API keys configured (LLM_FAST_API_KEY or LLM_API_KEY)');
        rootLogger.info('  Set them in .env to run this test.');
        return;
    }

    const gh = createGitHubSmokeManager();

    rootLogger.info('Fetching real diff between main and dev...');
    const diff = await gh.getDiff('main', 'dev');
    if (!diff) {
        rootLogger.info('SKIP: diff is empty (branches may have no divergence)');
        return;
    }
    rootLogger.info('  Diff: ' + diff.length + ' chars\n');

    rootLogger.info('Generating PR description via LLM (tier: fast)...');
    const description = await generatePrDescription(gh, 'main', 'dev');

    if (!description) {
        rootLogger.error('FAIL: generatePrDescription returned empty string');
        process.exitCode = 1;
        return;
    }

    rootLogger.info('\n=== Generated PR Description ===');
    rootLogger.info(description);
    rootLogger.info('=== End ===\n');

    rootLogger.info('OK: LLM PR description generated successfully (' + description.length + ' chars)');
}

main().catch((err) => {
    rootLogger.error('Unhandled error:', err);
    process.exitCode = 1;
});
