#!/usr/bin/env node
/**
 * PR Report Entry Point
 *
 * This script is the entry point for generating PR reports.
 * It imports main() from shared/pr-report-core.ts and passes the provider factory.
 *
 * Usage: npx tsx git_triggers/pr-report-entry.ts --project <name>
 */
import { createGitProvider } from './git-provider-factory.js';
import { rootLogger } from '../shared/logger.js';

// Import main from shared - this is a controlled dependency
// The provider factory will be passed to avoid layer violations
const { main } = await import('../shared/pr-report-core.js');

// Wrap main to inject the provider factory
async function mainWithProvider(): Promise<void> {
    return (main as (providerFactory?: unknown) => Promise<void>)(createGitProvider);
}

mainWithProvider().catch((err: unknown) => {
    rootLogger.error(`PR report failed: ${String(err)}`);
    process.exit(1);
});
