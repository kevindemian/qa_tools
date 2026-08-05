/** Error report — renders complete error information and resolves the failure
 *  decision deterministically from the ON_ERROR config.
 *
 *  Single-path architecture (Rule 3/7): every write operation routes failures
 *  through this one mechanism. The decision is ALWAYS deterministic from config:
 *  abort | skip | continue | retry | rollback. No interactive menu — the system
 *  stays hermetic-testable and resilient. */
import chalk from 'chalk';
import type { StepInfo, StepFailureHandler } from '../types/clean-slate.js';
import { box } from './box.js';
import { Output, defaultOutput as output } from './output.js';
import { isQuiet } from './prompt-ui.js';
import { rootLogger } from '../logger.js';
import Config from '../config-accessor.js';
import { extractErrorMessage, humanizeError } from './prompt-errors.js';

export type FailureDecision = 'skip' | 'abort' | 'retry' | 'rollback';

const CONTEXT_MAX = 300;
const TITLE_MAX = 100;
const STEP_FIELD_MAX = 100;

function truncate(str: string, max: number): string {
    return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

/** Summarize a Jira create/update payload into a compact human-readable line.
 *  Handles `{ fields: {...} }`, `{ project, summary, ... }`, and step inputs
 *  `{ fields: { Action, Data, "Expected Result" } }`. Falls back to a truncated
 *  JSON when the shape is unknown. Never throws (safeguard for any input shape). */
export function summarizeContext(input: unknown): string {
    if (input === null || input === undefined) return '—';
    if (typeof input === 'string') return truncate(input, CONTEXT_MAX);
    if (typeof input !== 'object') return String(input);

    const obj = input as Record<string, unknown>;
    const fields =
        obj && typeof obj === 'object' && 'fields' in obj && obj['fields']
            ? (obj['fields'] as Record<string, unknown>)
            : obj;

    const parts: string[] = [];
    const project = fields['project'];
    if (project && typeof project === 'object' && 'key' in (project as Record<string, unknown>)) {
        const key = (project as Record<string, unknown>)['key'];
        if (typeof key === 'string' && key.length > 0) parts.push('Projeto: ' + key);
    }
    const summary = fields['summary'];
    if (typeof summary === 'string' && summary.length > 0) {
        parts.push('Título: ' + truncate(summary, TITLE_MAX));
    }
    const issuetype = fields['issuetype'];
    if (issuetype && typeof issuetype === 'object' && 'name' in (issuetype as Record<string, unknown>)) {
        const name = (issuetype as Record<string, unknown>)['name'];
        if (typeof name === 'string' && name.length > 0) parts.push('Tipo: ' + name);
    }
    const labels = fields['labels'];
    if (Array.isArray(labels) && labels.length > 0) {
        const strLabels = labels.filter((l): l is string => typeof l === 'string');
        if (strLabels.length > 0) parts.push('Labels: ' + strLabels.join(', '));
    }

    // Step input shape: { fields: { Action, Data, "Expected Result" } }
    const action = fields['Action'];
    if (typeof action === 'string' && action.length > 0) {
        const stepParts: string[] = ['Ação: ' + truncate(action, STEP_FIELD_MAX)];
        const data = fields['Data'];
        if (typeof data === 'string' && data.length > 0) {
            stepParts.push('Dados: ' + truncate(data, STEP_FIELD_MAX));
        }
        const stepResult = fields['Expected Result'] ?? fields['Result'];
        if (typeof stepResult === 'string' && stepResult.length > 0) {
            stepParts.push('Resultado: ' + truncate(stepResult, STEP_FIELD_MAX));
        }
        return stepParts.join(' | ');
    }

    if (parts.length > 0) return parts.join(' | ');

    // Unknown shape — truncated JSON (never a full dump).
    try {
        return truncate(JSON.stringify(input), CONTEXT_MAX);
    } catch {
        return '[objeto não serializável]';
    }
}

/** Resolve the failure decision from the ON_ERROR config.
 *  Mapping: skip/continue → skip, abort → abort, retry → retry, rollback → rollback.
 *  Unknown or missing value → abort (explicit, never silent — Rule 25). */
function resolveDecision(step: string, error: Error): FailureDecision {
    const autoAction = Config.get('onError');
    switch (autoAction) {
        case 'skip':
        case 'continue':
            rootLogger.warn(`[auto] ${step}: pulando (ON_ERROR=${autoAction}) — ${error.message}`);
            return 'skip';
        case 'retry':
            rootLogger.warn(`[auto] ${step}: tentando novamente (ON_ERROR=retry) — ${error.message}`);
            return 'retry';
        case 'rollback':
            rootLogger.warn(`[auto] ${step}: rollback (ON_ERROR=rollback) — ${error.message}`);
            return 'rollback';
        case 'abort':
            rootLogger.warn(`[auto] ${step}: abortando (ON_ERROR=abort) — ${error.message}`);
            return 'abort';
        default:
            rootLogger.warn(
                `[auto] ${step}: ON_ERROR desconhecido (${String(autoAction)}) — abortando como padrão seguro. ${error.message}`,
            );
            return 'abort';
    }
}

/** Render a clean, human-friendly error box for the failed step.
 *  Uses the tested extractErrorMessage/humanizeError pipeline; never dumps raw JSON. */
export function renderStepError(error: Error, stepInfo: StepInfo): void {
    const useUnicode = Output.isTTY() && !isQuiet();
    const raw = extractErrorMessage(error);
    const known = humanizeError(raw);
    const msg = known ? known.msg : raw || error.message;

    const lines: string[] = [];
    lines.push(chalk.yellow.bold(`  ${stepInfo.step} falhou após tentativas`));
    lines.push('');
    lines.push(chalk.red(`  Erro: ${msg}`));
    lines.push(chalk.gray(`  Contexto: ${summarizeContext(stepInfo.currentInput)}`));
    if (known && known.hint) {
        lines.push(chalk.blue(`→  ${known.hint}`));
    }
    if (stepInfo.completedSteps.length > 0) {
        lines.push('');
        lines.push(chalk.gray('  Etapas anteriores:'));
        for (const prev of stepInfo.completedSteps) {
            const icon = prev.ok ? (useUnicode ? '\u2713' : 'OK ') : useUnicode ? '\u2717' : 'ERR';
            const color = prev.ok ? chalk.green : chalk.red;
            lines.push(`    ${color(icon)} ${prev.step} — ${prev.detail}`);
        }
    }
    lines.push('');

    rootLogger.warn(`step-error: ${stepInfo.step} — ${error.message}`, {
        step: stepInfo.step,
        error: error.message,
        completedSteps: stepInfo.completedSteps.length,
    });

    if (!isQuiet()) {
        output.print(box(lines, { border: 'double', color: 'red', padding: 1, width: 78 }));
    }
}

/** Render error info and resolve the decision from ON_ERROR config.
 *  Backward-compatible for bug-report.ts and the single deterministic handler. */
export async function showStepError(error: Error, stepInfo: StepInfo): Promise<FailureDecision> {
    renderStepError(error, stepInfo);
    return resolveDecision(stepInfo.step, error);
}

/** Deterministic failure handler. The configured action is authoritative — no
 *  interactive prompt, no TTY dependency. Used by BOTH manual and --auto paths. */
export function buildAutoConfirmHandler(): StepFailureHandler {
    return (error: Error, stepInfo: StepInfo) => showStepError(error, stepInfo);
}
