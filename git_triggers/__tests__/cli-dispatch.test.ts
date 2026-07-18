import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
    print: vi.mocked(vi.fn()),
}));

vi.mock('../../shared/ui/cli_base.js', () => ({ gracefulExit: vi.fn(), ExitCode: { OK: 0, ERROR: 1 } }));
vi.mock('../../shared/ui/output.js', () => ({ defaultOutput: { print: spies.print } }));
vi.mock('../cli-args.js', () => ({ printUsage: vi.fn() }));
vi.mock('../batch-mode.js', () => ({ tryBatchMode: vi.fn() }));
vi.mock('../interactive-mode.js', () => ({ runInteractiveMode: vi.fn() }));
vi.mock('../../shared/project-context.js', () => ({ setCurrentProject: vi.fn() }));

import { dispatchCli, applyProjectContext } from '../cli-dispatch.js';
import { gracefulExit } from '../../shared/ui/cli_base.js';
import { printUsage } from '../cli-args.js';
import type { BatchCliArgs } from '../cli-args.js';
import { tryBatchMode } from '../batch-mode.js';
import { runInteractiveMode } from '../interactive-mode.js';
import { setCurrentProject } from '../../shared/project-context.js';

const BATCH_ARGS: BatchCliArgs = {
    mode: 'batch',
    help: false,
    version: false,
    noClear: false,
    branch: undefined,
    auto: false,
    publish: undefined,
    runImpactedTests: false,
    conservative: false,
    teKey: undefined,
    dryRun: false,
};

const BASE_ARGS = { mode: 'interactive' as const, help: false, version: false, noClear: false };

describe('Cli-dispatch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('ApplyProjectContext', () => {
        afterEach(() => {
            delete process.env['QA_CURRENT_PROJECT'];
        });

        it('returns undefined when no project flag or env set', () => {
            expect.hasAssertions();
            expect(applyProjectContext({})).toBeUndefined();
            expect(setCurrentProject).not.toHaveBeenCalled();
        });

        it('prefers the --project flag over the env var', () => {
            expect.hasAssertions();

            process.env['QA_CURRENT_PROJECT'] = 'envProject';
            const result = applyProjectContext({ project: 'flagProject' });

            expect(result).toBe('flagProject');
            expect(setCurrentProject).toHaveBeenCalledWith('flagProject');
        });

        it('falls back to the env var when no flag given', () => {
            expect.hasAssertions();

            process.env['QA_CURRENT_PROJECT'] = 'envProject';
            const result = applyProjectContext({});

            expect(result).toBe('envProject');
            expect(setCurrentProject).toHaveBeenCalledWith('envProject');
        });

        it('ignores an empty env var', () => {
            expect.hasAssertions();

            process.env['QA_CURRENT_PROJECT'] = '';

            expect(applyProjectContext({})).toBeUndefined();
            expect(setCurrentProject).not.toHaveBeenCalled();
        });
    });

    describe('DispatchCli', () => {
        it('prints usage and exits OK for help mode', async () => {
            expect.hasAssertions();

            await dispatchCli({ ...BASE_ARGS, mode: 'help', help: true });

            expect(printUsage).toHaveBeenCalledWith(expect.any(String));
            expect(gracefulExit).toHaveBeenCalledWith(0);
        });

        it('prints version and exits OK for version mode', async () => {
            expect.hasAssertions();

            await dispatchCli({ ...BASE_ARGS, mode: 'version', version: true });

            expect(spies.print).toHaveBeenCalledWith(expect.any(String));
            expect(gracefulExit).toHaveBeenCalledWith(0);
        });

        it('exits OK when batch mode succeeds', async () => {
            expect.hasAssertions();

            vi.mocked(tryBatchMode).mockResolvedValue(true);
            await dispatchCli(BATCH_ARGS);

            expect(tryBatchMode).toHaveBeenCalledWith(BATCH_ARGS);
            expect(gracefulExit).toHaveBeenCalledWith(0);
        });

        it('exits ERROR when batch mode fails', async () => {
            expect.hasAssertions();

            vi.mocked(tryBatchMode).mockResolvedValue(false);
            await dispatchCli(BATCH_ARGS);

            expect(gracefulExit).toHaveBeenCalledWith(1);
        });

        it('runs interactive mode without forcing an exit code', async () => {
            expect.hasAssertions();

            await dispatchCli({ ...BASE_ARGS, mode: 'interactive' });

            expect(runInteractiveMode).toHaveBeenCalledWith({ ...BASE_ARGS, mode: 'interactive' });
            expect(gracefulExit).not.toHaveBeenCalled();
        });
    });
});
