/**
 * CLI dispatch logic — executes the appropriate mode based on parsed arguments.
 * Separated from main.ts for testability and single responsibility.
 */
import { gracefulExit } from '../shared/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { defaultOutput } from '../shared/output.js';
import pkg from '../package.json';
import { printUsage, type CliArgs } from './cli-args.js';
import { tryBatchMode } from './batch-mode.js';
import { runInteractiveMode } from './interactive-mode.js';

/**
 * Dispatches to the correct mode handler based on parsed CLI arguments.
 * @param args Parsed CLI arguments
 * @returns Promise that resolves when the mode completes
 */
export async function dispatchCli(args: CliArgs): Promise<void> {
    switch (args.mode) {
        case 'help':
            printUsage(pkg.version);
            gracefulExit(ExitCode.OK);
            break;
        case 'version':
            defaultOutput.print(pkg.version);
            gracefulExit(ExitCode.OK);
            break;
        case 'batch': {
            const batchResult = await tryBatchMode(args);
            if (batchResult) {
                gracefulExit(ExitCode.OK);
            } else {
                gracefulExit(ExitCode.ERROR);
            }
            break;
        }
        case 'interactive':
            await runInteractiveMode(args);
            break;
    }
}
