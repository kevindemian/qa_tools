/** Error report — renders complete error information for informed user decision.
 *
 *  Shows: error message, context, input data, previous step results.
 *  Offers: skip (with warning), abort, retry, rollback via showSelect. */
import chalk from 'chalk';
import type { StepInfo, StepFailureHandler } from '../types/clean-slate.js';
import { showSelect } from './prompt-input-inquirer.js';
import { Output } from './output.js';
import { isQuiet } from './prompt-ui.js';
import { rootLogger } from '../logger.js';
import Config from '../config-accessor.js';

// ─────────────────────────────────────────────────────────────────
// SHOW STEP ERROR
// ─────────────────────────────────────────────────────────────────

/**
 * Render complete error information and prompt user for decision.
 * Returns the user's choice: 'skip' | 'abort' | 'retry' | 'rollback'.
 */
export async function showStepError(
    error: Error,
    stepInfo: StepInfo,
    handler?: StepFailureHandler,
): Promise<'skip' | 'abort' | 'retry' | 'rollback'> {
    // If custom handler provided, delegate to it
    if (handler) {
        return handler(error, stepInfo);
    }

    // Default: render error box + select menu
    const useUnicode = Output.isTTY() && !isQuiet();

    // Build the error display
    const lines: string[] = [];
    lines.push('');
    lines.push(chalk.yellow.bold(`  ${stepInfo.step} falhou após tentativas`));
    lines.push('');
    lines.push(chalk.red(`  Erro: ${error.message}`));

    if (stepInfo.currentInput) {
        const inputStr =
            typeof stepInfo.currentInput === 'string'
                ? stepInfo.currentInput
                : JSON.stringify(stepInfo.currentInput, null, 2);
        lines.push(chalk.gray(`  Contexto: ${inputStr}`));
    }

    // Show previous steps
    if (stepInfo.completedSteps.length > 0) {
        lines.push('');
        lines.push(chalk.gray('  Etapas anteriores:'));
        for (const prev of stepInfo.completedSteps) {
            const icon = prev.ok ? (useUnicode ? '\u2713' : 'OK ') : useUnicode ? '\u2717' : 'ERR';
            const color = prev.ok ? chalk.green : chalk.red;
            lines.push(`    ${color(icon)} ${prev.step} — ${prev.detail}`);
        }
        // Current failed step
        lines.push(`    ${chalk.red(useUnicode ? '\u2717' : 'ERR')} ${stepInfo.step} — ${error.message}`);
    }

    lines.push('');

    // Log to file
    rootLogger.warn(`step-error: ${stepInfo.step} — ${error.message}`, {
        step: stepInfo.step,
        error: error.message,
        completedSteps: stepInfo.completedSteps.length,
    });

    // Print to console
    if (!isQuiet()) {
        const { defaultOutput } = await import('./output.js');
        defaultOutput.print(lines.join('\n'));
    }

    // Prompt for decision
    const skipLabel = useUnicode ? '\u26A0 skip — criará estado incompleto' : 'skip — will create incomplete state';
    const abortLabel = useUnicode ? '\u2717 abort — parar importação' : 'abort — stop import';
    const retryLabel = useUnicode ? '\u21BB retry — tentar novamente' : 'retry — try again';
    const rollbackLabel = useUnicode
        ? '\u21A9 rollback — restaurar estado anterior'
        : 'rollback — restore previous state';

    const choice = await showSelect(`O que desejar com "${stepInfo.step}"?`, [
        { name: skipLabel, value: 'skip' },
        { name: abortLabel, value: 'abort' },
        { name: retryLabel, value: 'retry' },
        { name: rollbackLabel, value: 'rollback' },
    ]);

    const decision = choice as 'skip' | 'abort' | 'retry' | 'rollback';

    rootLogger.info(`step-decision: ${stepInfo.step}`, { decision });

    return decision;
}

// ─────────────────────────────────────────────────────────────────
// AUTO ROLLBACK HANDLER (CI/CD, no TTY)
// ─────────────────────────────────────────────────────────────────

/**
 * Handler for non-interactive environments (CI/CD).
 * Auto-retries up to 3 times before falling back to rollback.
 * Returns 'retry' for attempts 1-2, 'rollback' for attempt 3+. */
export function buildAutoRollbackHandler(): StepFailureHandler {
    let retryCount = 0;
    const MAX_AUTO_RETRIES = 3;
    return async (error: Error, stepInfo: StepInfo) => {
        retryCount++;
        if (retryCount < MAX_AUTO_RETRIES) {
            rootLogger.warn(`[auto] ${stepInfo.step}: retry ${retryCount}/${MAX_AUTO_RETRIES} — ${error.message}`);
            return 'retry';
        }
        rootLogger.warn(
            `[auto] ${stepInfo.step}: rollback automático após ${MAX_AUTO_RETRIES} tentativas — ${error.message}`,
        );
        retryCount = 0;
        return 'rollback';
    };
}

// ─────────────────────────────────────────────────────────────────
// AUTO CONFIRM HANDLER (AUTO_CONFIRM=true, no prompt)
// ─────────────────────────────────────────────────────────────────

/**
 * Handler for `AUTO_CONFIRM=true` mode.
 * Resolves the failure decision from the `ON_ERROR` config, mirroring the
 * legacy `handleAutoConfirm` behavior: 'abort' → abort, 'skip'/'continue' → skip.
 * No retry and no interactive prompt: the configured action is authoritative. */
export function buildAutoConfirmHandler(): StepFailureHandler {
    return async (error: Error, stepInfo: StepInfo) => {
        const autoAction = Config.get('onError');
        if (autoAction === 'skip' || autoAction === 'continue') {
            rootLogger.warn(`[auto] ${stepInfo.step}: pulando (ON_ERROR=${autoAction}) — ${error.message}`);
            return 'skip';
        }
        rootLogger.warn(`[auto] ${stepInfo.step}: abortando (ON_ERROR=${autoAction ?? 'abort'}) — ${error.message}`);
        return 'abort';
    };
}
