/**
 * git_triggers entry point — thin wrapper that parses CLI args and dispatches.
 * All logic has been extracted to cli-args.ts, cli-dispatch.ts, and interactive-mode.ts.
 */
import { printError } from '../shared/ui/prompt.js';
import { gracefulExit } from '../shared/ui/cli_base.js';
import { ExitCode } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import { printSessionSummary } from './session-state.js';
import { parseCliArgs } from './cli-args.js';
import { dispatchCli } from './cli-dispatch.js';

process.on('unhandledRejection', (reason: unknown) => {
    printError('Erro interno não tratado (async)', reason);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    rootLogger.error('Unhandled Rejection', { error: err.message, stack: err.stack });
    gracefulExit(ExitCode.ERROR);
});

process.on('uncaughtException', (err: Error) => {
    printError('Erro interno não tratado (sync)', err);
    rootLogger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    printSessionSummary();
    gracefulExit(ExitCode.ERROR);
});

dispatchCli(parseCliArgs()).catch((err) => {
    printError('Erro inesperado', err);
    printSessionSummary();
    const error = err instanceof Error ? err : new Error(String(err));
    rootLogger.error('Main error', { error: error.message, stack: error.stack });
    gracefulExit(ExitCode.ERROR);
});
