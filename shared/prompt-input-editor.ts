/** Multi-line text input — uses @inquirer/editor in TTY mode, falls back to readline sentinel.
 * @module Provides askMultiline() for entering paragraph-length text in the CLI. */
import * as readline from 'readline';
import { NAV_CMDS, isTTY, type PromptOptions } from './prompt-input-base.js';
import { CancelError } from './prompt-ui.js';

let _editorMod: unknown = null;

/** Override the @inquirer/editor module (used by tests). */
export function __setEditorMod(mod: unknown): void {
    _editorMod = mod;
}

async function _loadEditor(): Promise<unknown> {
    if (_editorMod !== null) return _editorMod;
    try {
        _editorMod = await import('@inquirer/editor');
        return _editorMod;
    } catch {
        _editorMod = false;
        return false;
    }
}

/** Multi-line text input via @inquirer/editor (opens system $EDITOR).
 *  Falls back to a readline sentinel when editor is unavailable.
 *
 *  Sentinel rules:
 *  - Each Enter adds a line
 *  - Two consecutive empty lines (Enter twice) signal end of input
 *  - Ctrl+D (EOF) also ends input
 *  - Navigation commands (/back, /exit, etc.) throw CancelError */
export async function askMultiline(label: string, options: PromptOptions = {}): Promise<string> {
    const mod = await _loadEditor();
    if (mod && isTTY()) {
        try {
            const answer = await (mod as { default: (...args: unknown[]) => unknown }).default({
                message: label,
                default: options.default,
            });
            const trimmed = (answer as string).trim();
            const lower = trimmed.toLowerCase();
            if (NAV_CMDS.includes(lower)) throw new CancelError(lower);
            return trimmed;
        } catch (err) {
            const errObj = err as { name?: string } | null;
            if (errObj?.name === 'CancelError') {
                throw err;
            }
            return sentinelFallback(label, options);
        }
    }
    return sentinelFallback(label, options);
}

/** Fallback: accumulate lines in the terminal, terminate on double-empty-line or EOF. */
function sentinelFallback(label: string, options: PromptOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });

        const lines: string[] = [];
        let emptyCount = 0;
        let closed = false;

        const promptText = `\n\x1b[36m->\x1b[0m ${label} \x1b[90m(linha vazia dupla para confirmar, Ctrl+D para enviar)\x1b[0m:\n`;

        process.stdout.write(promptText);

        rl.on('line', (line: string) => {
            const trimmed = line.trim();
            const lower = trimmed.toLowerCase();

            if (NAV_CMDS.includes(lower)) {
                rl.close();
                reject(new CancelError(lower));
                return;
            }

            if (trimmed === '') {
                emptyCount++;
                if (emptyCount >= 2) {
                    rl.close();
                    const result = lines.join('\n').trim();
                    let resolved = '';
                    if (result) {
                        resolved = result;
                    } else if (options.default) {
                        resolved = options.default;
                    }
                    resolve(resolved);
                    return;
                }
            } else {
                emptyCount = 0;
            }

            lines.push(line);
        });

        rl.on('close', () => {
            if (closed) return;
            closed = true;
            const result = lines.join('\n').trim();
            let resolved = '';
            if (result) {
                resolved = result;
            } else if (options.default) {
                resolved = options.default;
            }
            resolve(resolved);
        });

        rl.on('SIGINT', () => {
            closed = true;
            rl.close();
            reject(new CancelError('/exit'));
        });
    });
}
