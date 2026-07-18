/**
 * CLI dispatch logic — executes the appropriate mode based on parsed arguments.
 * Separated from main.ts for testability and single responsibility.
 */
import { gracefulExit } from '../shared/ui/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { defaultOutput } from '../shared/ui/output.js';
import pkg from '../package.json';
import { printUsage, type CliArgs } from './cli-args.js';
import { tryBatchMode } from './batch-mode.js';
import { runInteractiveMode } from './interactive-mode.js';
import { setCurrentProject } from '../shared/project-context.js';
import { main as runPrReport } from '../shared/pr-report-core.js';
import { createGitProvider } from './git-provider-factory.js';

/**
 * Resolve and activate the multi-project context for a CLI invocation (055).
 * Priority: `--project` flag > `QA_CURRENT_PROJECT` env > no selection (interactive menu).
 * Throws if the resolved project name is invalid/unknown (fail-loud, zero silencing).
 * @returns the resolved project name, or undefined when none is requested.
 */
export function applyProjectContext(args: Pick<CliArgs, 'project'>): string | undefined {
    const fromFlag = args.project;
    const fromEnv = process.env['QA_CURRENT_PROJECT'];
    const name = fromFlag ?? (fromEnv && fromEnv.length > 0 ? fromEnv : undefined);
    if (!name) return undefined;
    setCurrentProject(name);
    return name;
}

/**
 * Dispatches to the correct mode handler based on parsed CLI arguments.
 * @param args Parsed CLI arguments
 * @returns Promise that resolves when the mode completes
 */
export async function dispatchCli(args: CliArgs): Promise<void> {
    applyProjectContext(args);

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
        case 'pr-report': {
            await runPrReport(createGitProvider);
            gracefulExit(ExitCode.OK);
            break;
        }
    }
}
