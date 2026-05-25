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

export function confirm(label: string, defaultYes = false): boolean {
    if (getConfig().autoConfirm) return defaultYes;
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
}

interface SectionGroup {
    title: string;
    items: string[];
    itemValues: Array<string | undefined>;
}

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
    return null as unknown as string;
}

let _selectMod: unknown = null;

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

const isTTY = (): boolean => !!(process.stdout.isTTY && !getConfig().quiet);

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
        const entry = num + '. ' + c.name + desc;
        if (current) {
            current.items.push(entry);
            current.itemValues.push(c.value);
        } else {
            standaloneItems.push(entry);
        }
    }
    return { sections, standaloneItems };
}

export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    const flatChoices = choices
        .filter((c): c is SelectChoice & { name: string } => c.type !== 'separator' && !!c.name)
        .map((c) => ({ name: c.name, value: c.value ?? c.name }));

    const mod: unknown = await _loadSelect();
    if (mod && isTTY()) {
        try {
            const answer = await (mod as { default: (...args: unknown[]) => unknown }).default({
                message: label,
                choices: flatChoices,
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
    const renderedItems: string[] = [];
    for (const section of sections) renderedItems.push(...section.items.map((i) => ' ' + i));
    renderedItems.push(...standaloneItems.map((i) => '  ' + i));

    if (renderedItems.length > 0) {
        for (const item of renderedItems) {
            output.print('  ' + item);
        }
        output.print('');
    }

    output.print(palette.muted('  Dica: digite o número da opção, alias (ex: criar, status, versões) ou /help'));
    const answer = prompt(label, { default: options.default }).trim();
    if (answer === '') return options.default || '0';
    const trimmed = answer.toLowerCase();
    if (trimmed === '0' || trimmed === 'exit' || trimmed === 'sair') return '0';
    if (trimmed.startsWith('/')) return answer;
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= flatChoices.length) {
        return flatChoices[num - 1].value;
    }
    if (!isNaN(num)) {
        warn('Opção inválida. Digite um número entre 0 e ' + flatChoices.length + ' ou /help.');
        return '0';
    }
    return answer;
}
