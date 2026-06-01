/** File-path prompt with tab-completion and extension filtering.
 * @module Uses readline for interactive TTY input, falls back to synchronous prompt. */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { CancelError } from './prompt-ui';
import { NAV_CMDS, prompt, isTTY, PromptOptions } from './prompt-input-base';

export interface FilePathOptions extends PromptOptions {
    extensions?: string[];
}

function expandHome(filepath: string): string {
    if (!filepath.startsWith('~')) return filepath;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return home + filepath.slice(1);
}

/** Tab-completion for file paths. Filters by extension when provided. Hides dotfiles unless the query starts with `.`. */
export function filePathCompleter(line: string, extensions?: string[]): [string[], string] {
    const input = expandHome(line.trim() || '.');
    const endsWithSep = input.endsWith('/') || input.endsWith('\\');
    const dir = endsWithSep ? input : path.dirname(input);
    const rawBase = path.basename(input);
    const base = endsWithSep || rawBase === '.' ? '' : rawBase;

    let entries: string[];
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return [[], line];
    }

    const matches = entries
        .filter((e) => {
            if (e.startsWith('.') && !base.startsWith('.')) return false;
            const lowerE = e.toLowerCase();
            if (!lowerE.startsWith(base.toLowerCase())) return false;
            if (!extensions) return true;
            const full = path.join(dir, e);
            try {
                if (fs.statSync(full).isDirectory()) return true;
            } catch {
                return false;
            }
            return extensions.some((ext) => lowerE.endsWith(ext));
        })
        .sort()
        .map((e) => {
            const full = path.join(dir, e);
            try {
                return fs.statSync(full).isDirectory() ? full + '/' : full;
            } catch {
                return e;
            }
        });

    return [matches, line];
}

/** Interactive file-path prompt with tab-completion and extension filtering.
 * Falls back to plain `prompt()` when not in a TTY. */
export async function askFilePath(label: string, options: FilePathOptions = {}): Promise<string> {
    if (!isTTY()) {
        return prompt(label, options);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line: string) => filePathCompleter(line, options.extensions),
        terminal: true,
    });

    try {
        return await new Promise<string>((resolve, reject) => {
            const defaultStr = options.default ? ` ${chalk.yellow('[' + options.default + ']')}` : '';
            const promptText = '\n' + chalk.cyan('->') + ' ' + label + defaultStr + chalk.dim('  (/help)') + ': ';

            rl.question(promptText, (answer) => {
                const trimmed = answer.trim();
                const lower = trimmed.toLowerCase();
                if (NAV_CMDS.includes(lower)) reject(new CancelError(lower));
                resolve(trimmed || options.default || '');
            });

            rl.on('SIGINT', () => reject(new CancelError('/exit')));
        });
    } finally {
        rl.close();
    }
}
