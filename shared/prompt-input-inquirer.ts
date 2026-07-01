/** Inquirer-based interactive prompts: select menus, async text input, confirmations.
 * @module Falls back to synchronous prompt/confirm when inquirer modules are unavailable. */
import { Output, defaultOutput as output } from './output.js';
import { palette } from './palette.js';
import { CancelError, warn } from './prompt-ui.js';

function isNonNullObject(val: unknown): val is Record<string, unknown> {
    return val != null && Object.getPrototypeOf(val) !== null;
}

function getErrorMessage(err: unknown): string {
    if (isNonNullObject(err) && 'message' in err) {
        return String((err as { message: unknown }).message);
    }
    return String(err);
}

function isCancelError(err: unknown): err is { name: string; cmd: string } {
    return isNonNullObject(err) && 'name' in err && (err as { name: unknown }).name === 'CancelError' && 'cmd' in err;
}
import { PromptOptions, NAV_CMDS, prompt, confirm, isTTY } from './prompt-input-base.js';

export interface SelectChoice {
    name?: string;
    value?: string;
    description?: string;
    disabled?: boolean | string;
    type?: 'separator';
    line?: string;
}

export interface SelectOptions {
    pageSize?: number;
    default?: string;
    menuMode?: boolean;
}

export interface SectionGroup {
    title: string;
    items: string[];
    itemValues: Array<string | undefined>;
}

const inquirerTheme = {
    prefix: palette.blue('  ◆'),
    style: {
        answer: (s: string) => palette.green.bold(s),
        message: (s: string) => palette.fg.bold(s),
        renderSelected: (s: string) => palette.purple('❯ ' + s),
    },
};

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
    } catch (err) {
        warn('@inquirer/select not available, using fallback: ' + getErrorMessage(err));
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
    } catch (err) {
        warn('@inquirer/input not available, using fallback: ' + getErrorMessage(err));
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
    } catch (err) {
        warn('@inquirer/confirm not available, using fallback: ' + getErrorMessage(err));
        _confirmMod = false;
        return false;
    }
}

function handleHelpCommand(cmd: string, helpCallback?: () => void): boolean {
    if (cmd === '/help' || cmd === '/h') {
        if (helpCallback) helpCallback();
        return true;
    }
    return false;
}

function handleEmptyInput(
    value: string,
    retries: number,
    maxRetries: number,
): { result: 'retry' | 'return'; retries: number } {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        retries++;
        if (retries < maxRetries) {
            warn(`Entrada vazia. Tentativa ${retries + 1}/${maxRetries}.`);
        }
        return { result: 'retry', retries };
    }
    return { result: 'return', retries };
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
            if (isCancelError(err) && handleHelpCommand(err.cmd, helpCallback)) {
                continue;
            }
            throw err;
        }
        if (handleHelpCommand(value.trim().toLowerCase(), helpCallback)) continue;
        const emptyResult = handleEmptyInput(value, retries, maxRetries);
        retries = emptyResult.retries;
        if (emptyResult.result === 'retry') continue;
        return value;
    }
    warn('Número máximo de tentativas excedido.');
    return options.default !== undefined ? String(options.default) : '';
}

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
        } catch (err) {
            warn('Inquirer prompt failed, using sync fallback: ' + getErrorMessage(err));
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
        } catch (err) {
            warn('Inquirer confirm failed, using sync fallback: ' + getErrorMessage(err));
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
            const line = (c.line ?? '').trim();
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

async function handleInquirerSelect(
    mod: unknown,
    label: string,
    choices: SelectChoice[],
    options: SelectOptions,
): Promise<string> {
    const selectChoices = choices.map((c) => {
        if (c.type === 'separator') return { type: 'separator' as const, separator: c.line };
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
    } catch (err) {
        warn('Falha no seletor interativo. Usando modo texto: ' + getErrorMessage(err));
        return '__error__';
    }
}

function handleFallbackSelect(label: string, flatChoices: SelectChoice[], options: SelectOptions): string {
    const { sections, standaloneItems } = groupChoices(flatChoices);
    _renderChoices(sections, standaloneItems);
    output.print(palette.muted('  Dica: digite o número da opção, alias (ex: criar, status, versões) ou /help'));
    let answer: string;
    try {
        answer = prompt(label, { ...(options.default ? { default: options.default } : {}) }).trim();
    } catch (e) {
        if (isCancelError(e)) throw e;
        return '0';
    }
    if (answer === '') return options.default || '0';
    const trimmed = answer.toLowerCase();
    if (trimmed === '0' || trimmed === 'exit' || trimmed === 'sair') return '0';
    if (trimmed.startsWith('/')) return answer;
    const num = parseInt(answer, 10);
    const choice = num >= 1 && num <= flatChoices.length ? flatChoices[num - 1] : undefined;
    return choice?.value ?? answer;
}

/** Interactive select menu. Uses `@inquirer/select` in TTY mode, falls back to a numbered list + `prompt()`.
 * Supports section separators and navigation commands (`/back`, etc.). */
export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    const flatChoices = choices
        .filter((c): c is SelectChoice & { name: string } => c.type !== 'separator' && !!c.name)
        .map((c) => ({ name: c.name, value: c.value ?? c.name }));

    const mod: unknown = await _loadSelect();
    if (mod && isTTY() && !options.menuMode) {
        return handleInquirerSelect(mod, label, choices, options);
    }
    return handleFallbackSelect(label, flatChoices, options);
}
