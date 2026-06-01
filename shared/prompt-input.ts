/** Interactive prompts: text input, confirmation, file-path with tab-completion, and select menus.
 * Falls back to `readline-sync` when TTY is unavailable or inquirer modules are not installed. */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import readlineSync from 'readline-sync';
import { Output, defaultOutput as output } from './output';
import { palette } from './palette';
import { CancelError, getConfig, icon, warn } from './prompt-ui';

interface PromptOptions {
    default?: string;
    hint?: string;
    maxRetries?: number;
    minLength?: number;
}

const NAV_CMDS = ['/back', '/menu', '/exit', '/sair', '/quit', '/help'];

/** Synchronous text prompt (readline-sync). Falls back when inquirer is unavailable.
 * @throws {@link CancelError} on nav commands (`/back`, `/exit`, etc.). */
export function prompt(label: string, options: PromptOptions = {}): string {
    const { default: def, hint, minLength } = options;
    while (true) {
        let text = '\n' + chalk.cyan('->') + ' ' + label;
        if (hint) text += ' ' + chalk.yellow('(' + hint + ')');
        if (def) text += ' ' + chalk.yellow('[' + def + ']');
        text += chalk.dim('  (/help)');
        const answer = readlineSync.question(text + ': ', { defaultInput: def }).trim();
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
    if (getConfig().get<boolean>('autoConfirm')) return defaultYes;
    const def = defaultYes ? 'Y' : 'N';
    while (true) {
        const text = '\n' + chalk.yellow('?') + ' ' + label + ' ' + chalk.yellow('(' + def + ')');
        const answer = readlineSync
            .question(text + ': ', { defaultInput: def.toLowerCase() })
            .trim()
            .toLowerCase();
        if (NAV_CMDS.includes(answer)) throw new CancelError(answer);
        if (['y', 'yes', 'sim', 's'].includes(answer)) return true;
        if (['n', 'no', 'nao', 'não'].includes(answer)) return false;
        output.print('  ' + chalk.yellow.bold(icon('warn')) + ' Resposta inválida. Digite S/sim ou N/não.');
    }
}

interface SelectChoice {
    name?: string;
    value?: string;
    description?: string;
    disabled?: boolean | string;
    type?: 'separator';
    line?: string;
}

interface SelectOptions {
    pageSize?: number;
    default?: string;
    menuMode?: boolean;
}

interface SectionGroup {
    title: string;
    items: string[];
    itemValues: Array<string | undefined>;
}

/** Async text prompt with retry logic and optional help callback.
 * Re-prompts on empty input (up to `maxRetries`). `/help` triggers the callback without consuming a retry. */
export async function smartPrompt(
    label: string,
    options: PromptOptions = {},
    helpCallback?: () => void,
): Promise<string> {
    let retries = 0;
    const maxRetries = options.maxRetries || 3;
    while (retries < maxRetries) {
        let value: string;
        try {
            value = await ask(label, options);
        } catch (err: unknown) {
            if (err instanceof CancelError) {
                if (err.cmd === '/help' || err.cmd === '/h') {
                    if (helpCallback) helpCallback();
                    continue;
                }
                throw err;
            }
            throw err;
        }
        const trimmed = value.trim().toLowerCase();
        if (trimmed === '/help' || trimmed === '/h') {
            if (helpCallback) helpCallback();
            continue;
        }
        if (!trimmed) {
            retries++;
            continue;
        }
        return value;
    }
    warn('Número máximo de tentativas excedido.');
    return '';
}

let _selectMod: unknown = null;

/** Override the `@inquirer/select` module (used by tests). */
export function __setSelectMod(mod: unknown): void {
    _selectMod = mod;
}

async function _loadSelect(): Promise<unknown> {
    if (_selectMod !== null) return _selectMod;
    try {
        _selectMod = await import('@inquirer/select');
        return _selectMod;
    } catch {
        _selectMod = false;
        return false;
    }
}

let _inputMod: unknown = null;

/** Override the `@inquirer/input` module (used by tests). */
export function __setInputMod(mod: unknown): void {
    _inputMod = mod;
}

async function _loadInput(): Promise<unknown> {
    if (_inputMod !== null) return _inputMod;
    try {
        _inputMod = await import('@inquirer/input');
        return _inputMod;
    } catch {
        _inputMod = false;
        return false;
    }
}

let _confirmMod: unknown = null;

/** Override the `@inquirer/confirm` module (used by tests). */
export function __setConfirmMod(mod: unknown): void {
    _confirmMod = mod;
}

async function _loadConfirm(): Promise<unknown> {
    if (_confirmMod !== null) return _confirmMod;
    try {
        _confirmMod = await import('@inquirer/confirm');
        return _confirmMod;
    } catch {
        _confirmMod = false;
        return false;
    }
}

const inquirerTheme = {
    prefix: palette.blue('  ◆'),
    style: {
        answer: (s: string) => palette.green.bold(s),
        message: (s: string) => palette.fg.bold(s),
        renderSelected: (s: string) => palette.purple('❯ ' + s),
    },
};

interface FilePathOptions extends PromptOptions {
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

const isTTY = (): boolean => !!(process.stdout.isTTY && !getConfig().get<boolean>('quiet'));

/** Async text input. Uses `@inquirer/input` in TTY mode, falls back to `prompt()`. */
export async function ask(label: string, options: PromptOptions = {}): Promise<string> {
    const mod: unknown = await _loadInput();
    if (mod && isTTY()) {
        try {
            const answer = await (mod as { default: (...args: unknown[]) => unknown }).default({
                message: label,
                default: options.default,
                theme: inquirerTheme,
            });
            const trimmed = (answer as string).trim().toLowerCase();
            if (NAV_CMDS.includes(trimmed)) throw new CancelError(trimmed);
            return (answer as string).trim();
        } catch {
            return prompt(label, options);
        }
    }
    return prompt(label, options);
}

/** Async confirmation. Uses `@inquirer/confirm` in TTY mode, falls back to `confirm()`. */
export async function askConfirm(label: string, defaultYes = false): Promise<boolean> {
    const mod: unknown = await _loadConfirm();
    if (mod && isTTY()) {
        try {
            const answer = await (mod as { default: (...args: unknown[]) => unknown }).default({
                message: label,
                default: defaultYes,
                theme: inquirerTheme,
            });
            return answer as boolean;
        } catch {
            return confirm(label, defaultYes);
        }
    }
    return confirm(label, defaultYes);
}

function groupChoices(choices: SelectChoice[]): { sections: SectionGroup[]; standaloneItems: string[] } {
    const sections: SectionGroup[] = [];
    const standaloneItems: string[] = [];
    let current: SectionGroup | null = null;
    let idx = 0;

    for (const c of choices) {
        if (c.type === 'separator') {
            const line = (c.line || '').trim();
            if (!line) continue;
            current = { title: line, items: [], itemValues: [] };
            sections.push(current);
            continue;
        }
        if (!c.name) continue;
        idx++;
        const num = String(idx).padStart(2, ' ');
        const desc = c.description ? palette.muted('  ' + c.description) : '';
        const entry = num + '. ' + c.name.trimStart() + desc;
        if (current) {
            current.items.push(entry);
            current.itemValues.push(c.value);
        } else {
            standaloneItems.push(entry);
        }
    }
    return { sections, standaloneItems };
}

function _renderChoices(sections: SectionGroup[], standaloneItems: string[]): void {
    const renderedItems: string[] = [];
    for (const section of sections) {
        renderedItems.push('');
        renderedItems.push('  ' + section.title);
        renderedItems.push(...section.items.map((i) => '  ' + i));
    }
    renderedItems.push(...standaloneItems.map((i) => '  ' + i));

    if (renderedItems.length > 0) {
        for (const item of renderedItems) {
            output.print('  ' + item);
        }
        output.print('');
    }
}

/** Interactive select menu. Uses `@inquirer/select` in TTY mode, falls back to a numbered list + `prompt()`.
 * Supports section separators and navigation commands (`/back`, etc.). */
export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    const flatChoices = choices
        .filter((c): c is SelectChoice & { name: string } => c.type !== 'separator' && !!c.name)
        .map((c) => ({ name: c.name, value: c.value ?? c.name }));

    const mod: unknown = await _loadSelect();
    if (mod && isTTY() && !options.menuMode) {
        const selectChoices = choices.map((c) => {
            if (c.type === 'separator') return { type: 'separator' as const, separator: c.line || '' };
            if (!c.name) return { type: 'separator' as const, separator: '' };
            return { name: c.name, value: c.value ?? c.name };
        });
        try {
            const answer = await (mod as { default: (...args: unknown[]) => unknown }).default({
                message: label,
                choices: selectChoices,
                pageSize: options.pageSize || Output.rows() - 5,
                loop: true,
                theme: inquirerTheme,
            });
            return answer as string;
        } catch {
            return '0';
        }
    }

    const { sections, standaloneItems } = groupChoices(choices);
    _renderChoices(sections, standaloneItems);

    output.print(palette.muted('  Dica: digite o número da opção, alias (ex: criar, status, versões) ou /help'));
    const answer = prompt(label, { default: options.default }).trim();
    if (answer === '') return options.default || '0';
    const trimmed = answer.toLowerCase();
    if (trimmed === '0' || trimmed === 'exit' || trimmed === 'sair') return '0';
    if (trimmed.startsWith('/')) return answer;
    const num = parseInt(answer, 10);
    const choice = num >= 1 && num <= flatChoices.length ? flatChoices[num - 1] : undefined;
    if (choice) {
        return choice.value;
    }
    return answer;
}
