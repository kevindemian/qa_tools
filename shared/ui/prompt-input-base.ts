/** Synchronous prompt/confirm functions and shared utilities.
 * @module Prompt input base layer — used by filepath and inquirer wrappers. */
import chalk from 'chalk';
import readlineSync from 'readline-sync';
import { defaultOutput as output } from './output.js';
import { rootLogger } from '../logger.js';
import { CancelError, getConfig, icon, warn } from './prompt-ui.js';

export interface PromptOptions {
    default?: string;
    hint?: string;
    maxRetries?: number;
    minLength?: number;
}

export const NAV_CMDS = ['/back', '/menu', '/exit', '/sair', '/quit', '/help'];

export const isTTY = (): boolean => !!(process.stdout.isTTY && !getConfig().get<boolean>('quiet'));

function readAnswer(text: string, def: string): string | null {
    try {
        return readlineSync.question(text + ': ', { defaultInput: def }).trim();
    } catch (err) {
        rootLogger.warn('Prompt input failed: ' + String(err));
        return null;
    }
}

/** Synchronous text prompt (readline-sync). Falls back when inquirer is unavailable.
 * @throws {@link CancelError} on nav commands (`/back`, `/exit`, etc.). */
export function prompt(label: string, options: PromptOptions = {}): string {
    const { default: def, hint, minLength } = options;
    if (!process.stdin.isTTY) {
        return def ?? '';
    }
    for (;;) {
        let text = '\n' + chalk.cyan('->') + ' ' + label;
        if (hint) text += ' ' + chalk.yellow('(' + hint + ')');
        if (def) text += ' ' + chalk.yellow('[' + def + ']');
        text += chalk.dim('  (/help)');
        const answer = readAnswer(text, def ?? '');
        if (answer === null) return def ?? '';
        const trimmed = answer.toLowerCase();
        if (NAV_CMDS.includes(trimmed)) throw new CancelError(trimmed);
        if (minLength !== undefined && answer.length < minLength) {
            warn('Mínimo de ' + minLength + ' caractere(s).');
            continue;
        }
        return answer;
    }
}

/** Synchronous yes/no confirmation (readline-sync).
 * In auto-confirm mode returns `defaultYes` without prompting. */
export function confirm(label: string, defaultYes = false): boolean {
    if (!process.stdin.isTTY) return defaultYes;
    if (getConfig().get<boolean>('autoConfirm')) return defaultYes;
    const def = defaultYes ? 'Y' : 'N';
    for (;;) {
        const text = '\n' + chalk.yellow('?') + ' ' + label + ' ' + chalk.yellow('(' + def + ')');
        let answer: string;
        try {
            answer = readlineSync
                .question(text + ': ', { defaultInput: def.toLowerCase() })
                .trim()
                .toLowerCase();
        } catch (err) {
            rootLogger.warn('Confirm input failed: ' + String(err));
            return defaultYes;
        }
        if (NAV_CMDS.includes(answer)) throw new CancelError(answer);
        if (['y', 'yes', 'sim', 's'].includes(answer)) return true;
        if (['n', 'no', 'nao', 'não'].includes(answer)) return false;
        output.print('  ' + chalk.yellow.bold(icon('warn')) + ' Resposta inválida. Digite S/sim ou N/não.');
    }
}
