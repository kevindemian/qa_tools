import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import cliProgress from 'cli-progress';
import readlineSync from 'readline-sync';
import Config from './config';
import { rootLogger } from './logger';

let _config: Config | null = null;

export function __setConfig(c: Config): void {
    _config = c;
}

function getConfig(): Config {
    return _config || Config.getDefault();
}

import { box, divider as boxDivider, card, visibleWidth } from './box';
import { palette } from './palette';
import { Output, defaultOutput as output } from './output';
import type { TestResult } from './types';

export class CancelError extends Error {
    constructor(cmd: string) {
        super('User cancelled with ' + cmd);
        this.name = 'CancelError';
    }
}

interface PromptOptions {
    default?: string;
    hint?: string;
    maxRetries?: number;
    minLength?: number;
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

interface KnownError {
    test: RegExp;
    msg: string;
    hint: string;
}

export const isQuiet = (): boolean => getConfig().quiet;

const MSG_UNKNOWN_ERROR = 'Erro desconhecido';
const MSG_UNEXPECTED = 'Erro inesperado';

export function badge(count: number, label: string, status: 'ok' | 'error' | 'warn' | 'info'): string {
    const colors: Record<string, chalk.Chalk> = {
        ok: chalk.hex('#3fb950'),
        error: chalk.hex('#f85149'),
        warn: chalk.hex('#d29922'),
        info: chalk.hex('#8b949e'),
    };
    const c = colors[status] || chalk.hex('#8b949e');
    const icon = status === 'info' ? '○' : '●';
    return `${c(icon)} ${c(count + ' ' + label)}`;
}

function icon(name: 'ok' | 'err' | 'warn' | 'info'): string {
    const useUnicode = !getConfig().quiet && Output.isTTY();
    if (useUnicode) {
        const map: Record<string, string> = { ok: '\u2713', err: '\u2717', warn: '\u26A0', info: '\u2139' };
        return map[name];
    }
    const fallback: Record<string, string> = { ok: 'OK ', err: 'ERR', warn: '!  ', info: 'i  ' };
    return fallback[name] || fallback.info;
}

export function success(msg: string): void {
    if (!isQuiet()) output.print(chalk.green.bold(icon('ok')) + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function error(msg: string): void {
    output.print(chalk.red.bold(icon('err')) + ' ' + msg);
    rootLogger.writeFileOnly('ERROR', msg);
}

export function warn(msg: string): void {
    output.print(chalk.yellow.bold(icon('warn')) + ' ' + msg);
    rootLogger.writeFileOnly('WARN', msg);
}

export function info(msg: string): void {
    if (!isQuiet()) output.print(chalk.cyan.bold(icon('info')) + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function helpLine(msg: string): void {
    if (!isQuiet()) output.print(chalk.cyan.bold(icon('info')) + ' ' + msg);
    rootLogger.writeFileOnly('HELP', msg);
}

export function print(msg: string): void {
    output.print(msg);
}

export function title(msg: string): void {
    if (isQuiet()) {
        output.print('--- ' + msg + ' ---');
        return;
    }
    output.print(box([msg], { border: 'none', padding: 0, width: 60 }));
}

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
    const def = defaultYes ? 'Y' : 'N';
    while (true) {
        const text = '\n' + chalk.yellow('?') + ' ' + label + ' ' + chalk.yellow('(' + def + ')');
        const answer = readlineSync
            .question(text + ': ', { defaultInput: def.toLowerCase() })
            .trim()
            .toLowerCase();
        if (['y', 'yes', 'sim', 's'].includes(answer)) return true;
        if (['n', 'no', 'nao', 'não'].includes(answer)) return false;
        output.print('  ' + chalk.yellow.bold(icon('warn')) + ' Resposta inválida. Digite S/sim ou N/não.');
    }
}

export function divider(): void {
    output.print(boxDivider());
}

const NAV_CMDS = ['/back', '/menu', '/exit', '/sair'];

export function smartPrompt(label: string, options: PromptOptions = {}, helpCallback?: () => void): string {
    let retries = 0;
    const maxRetries = options.maxRetries || 3;
    while (retries < maxRetries) {
        const value = prompt(label, options);
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

export class ProgressBar {
    current = 0;

    private readonly bar: cliProgress.SingleBar | null = null;
    private readonly total: number;
    private readonly enabled: boolean;

    constructor(total: number, options: { width?: number } = {}) {
        this.total = total;
        this.enabled = Output.isTTY() && !isQuiet();
        if (this.enabled) {
            this.bar = new cliProgress.SingleBar(
                {
                    format: `{bar} {percentage}% | {value}/{total} | {duration_formatted}`,
                    barCompleteChar: '\u2588',
                    barIncompleteChar: '\u2591',
                    hideCursor: true,
                    barsize: options.width || 20,
                    noTTYOutput: false,
                },
                cliProgress.Presets.shades_classic,
            );
            this.bar.start(total, 0);
        }
    }

    update(val: number): void {
        this.current = val;
        if (this.enabled && this.bar) {
            this.bar.update(val);
        } else {
            const pct = this.total > 0 ? Math.round((val / this.total) * 100) : 0;
            output.print('  Progresso: ' + val + '/' + this.total + ' (' + pct + '%)');
        }
    }

    stop(): void {
        if (this.enabled && this.bar) {
            this.bar.stop();
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ora is ESM-only, dynamic import in CJS
let _ora: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- injection API for ESM ora mock
export function __setOraDep(mod: any): void {
    _ora = mod;
}

interface SpinnerOptions {
    type?: 'dots' | 'bouncingBar' | 'earth';
    color?: string;
}

export async function withSpinner<T>(label: string, fn: () => Promise<T>, options?: SpinnerOptions): Promise<T> {
    if (isQuiet() || !Output.isTTY() || Output.isCI()) return fn();
    if (!_ora) _ora = (await import('ora')).default;
    const spinner = _ora({
        text: label,
        color: options?.color || 'cyan',
        spinner: options?.type || 'dots',
    }).start();
    try {
        const result = await fn();
        spinner.succeed();
        return result;
    } catch (err) {
        spinner.fail();
        throw err;
    }
}

const KNOWN_ERRORS: KnownError[] = [
    {
        test: /rate limit|too many requests/i,
        msg: 'Rate limit atingido',
        hint: 'Aguarde alguns segundos e tente novamente.',
    },
    {
        test: /issue type.*not found|not a valid issue type/i,
        msg: 'Tipo de issue não encontrado',
        hint: 'Verifique se o tipo está habilitado nas configurações do projeto Jira.',
    },
    {
        test: /project.*not found/i,
        msg: 'Projeto não encontrado',
        hint: 'Verifique se o nome do projeto está correto.',
    },
    {
        test: /field.*not found|unknown field/i,
        msg: 'Campo não encontrado',
        hint: 'Verifique se o campo existe no schema do projeto.',
    },
    {
        test: /permission|forbidden|403/i,
        msg: 'Sem permissão',
        hint: 'Verifique se seu token tem acesso a esta operação.',
    },
    {
        test: /unauthorized|401/i,
        msg: 'Token inválido ou expirado',
        hint: 'Verifique seu token de autenticação no arquivo .env.',
    },
    {
        test: /econnreset|econnrefused|enotfound|timeout|econnaborted/i,
        msg: 'Erro de conexão',
        hint: 'Verifique se a URL do Jira está correta e acessível.',
    },
    { test: /version.*not found/i, msg: 'Versão não encontrada', hint: 'Verifique se o nome da versão está correto.' },
    { test: /already exists/i, msg: 'Item ja existe', hint: 'Escolha um nome diferente.' },
];

export function humanizeError(message: string | null | undefined): { msg: string; hint: string } | null {
    if (!message) return { msg: MSG_UNKNOWN_ERROR, hint: 'Verifique os logs acima para mais detalhes.' };
    for (const known of KNOWN_ERRORS) {
        if (known.test.test(message)) return known;
    }
    return null;
}

interface AxiosErrorData {
    errorMessages?: string[];
    message?: string;
}

function isAxiosErrorData(data: unknown): data is AxiosErrorData {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
}

export function extractErrorMessage(err: unknown): string {
    if (!err) return MSG_UNKNOWN_ERROR;
    try {
        const axiosErr = err as { response?: { data?: unknown }; message?: string };
        const data = axiosErr.response?.data;
        let msg = '';
        if (isAxiosErrorData(data)) {
            msg = data.errorMessages?.[0] || data.message || '';
        } else if (typeof data === 'string') {
            msg = data;
        }
        return msg || axiosErr.message || '';
    } catch {
        return MSG_UNKNOWN_ERROR;
    }
}

export function printError(context: string, err: unknown): void {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    const msg = known ? known.msg : raw || MSG_UNEXPECTED;
    const hint = known
        ? known.hint
        : 'Verifique sua configuração e tente novamente.\nVeja https://github.com/kevindemian/qa_tools/blob/main/docs/09-troubleshooting.md';
    if (isQuiet()) {
        output.print(chalk.red.bold(icon('err')) + ' ' + context + ': ' + msg);
        return;
    }
    const hintLines = hint.split('\n').filter(Boolean);
    const hintBlock =
        hintLines.length > 1
            ? hintLines.map((h, i) => palette.blue(`  ${i + 1}. ${h.trim()}`)).join('\n')
            : palette.blue('→  ' + hint);
    const errorLines: string[] = [
        '',
        chalk.bold(palette.red(icon('err') + '  ' + context + ': ' + msg)),
        '',
        hintBlock,
        '',
    ];
    output.print(box(errorLines, { border: 'double', color: 'red', padding: 1, width: 72 }));
}

export function printSummary(results: TestResult[], testExecution?: string): void {
    const passed = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const pct = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

    function addExtras(lines: string[]): void {
        lines.push(palette.fg('📊  ' + pct + '% pass rate'));
        if (testExecution) {
            lines.push(palette.blue('📎  Test Execution: ' + testExecution));
        }
    }

    if (failed === 0) {
        if (isQuiet()) {
            output.print('  ' + chalk.green.bold('TUDO CERTO!'));
            success(passed + ' de ' + results.length + ' operação(oes) concluída(s) com sucesso');
        } else {
            const lines: string[] = [
                '',
                chalk.bold(palette.green('●  TUDO CERTO!')),
                palette.fg('●  ' + passed + ' de ' + results.length + ' operação(ões) concluída(s)'),
                '',
            ];
            addExtras(lines);
            lines.push('');
            output.print(box(lines, { border: 'single', color: 'green', padding: 0, width: 72 }));
        }
        rootLogger.info('Resumo: ' + passed + '/' + results.length + ' ok');
    } else {
        const logPath = rootLogger.filePath;
        if (isQuiet()) {
            output.print('  ' + chalk.yellow.bold('OPERACAO PARCIAL'));
            output.print('  ' + chalk.yellow('!') + ' ' + passed + ' concluídas, ' + failed + ' com erro');
            results
                .filter((r) => r.status === 'error')
                .forEach((r) => {
                    output.print('  ' + chalk.red('*') + ' ' + r.label + ': ' + r.message);
                });
            if (logPath) {
                output.print('  ' + chalk.yellow('->') + ' Consulte o log: ' + logPath);
            }
        } else {
            const errorLines: string[] = [
                '',
                chalk.bold(palette.yellow('●  ' + passed + ' concluídas, ' + failed + ' com erro')),
                '',
            ];
            results
                .filter((r) => r.status === 'error')
                .forEach((r) => {
                    errorLines.push(palette.red('✗  ' + r.label + ': ' + r.message));
                });
            errorLines.push('');
            addExtras(errorLines);
            errorLines.push(palette.blue('→  Consulte o log: ' + (logPath || 'ver logs acima')));
            errorLines.push('');
            output.print(box(errorLines, { border: 'single', color: 'yellow', padding: 0, width: 72 }));
        }
        rootLogger.warn(`Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
    }
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function onError(
    context: string,
    err: unknown,
    options: { retry?: boolean; details?: boolean } = {},
): Promise<'abort' | 'skip' | 'retry'> {
    const { retry: canRetry = false, details: canDetails = false } = options;
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    const msg = known ? known.msg : raw || MSG_UNEXPECTED;

    error(`${context}: ${msg}`);

    if (getConfig().autoConfirm) {
        const autoAction = getConfig().onError;
        if (autoAction === 'skip') warn('Modo automatico: pulando...');
        else error('Modo automatico: abortando...');
        return autoAction as 'abort' | 'skip' | 'retry';
    }

    while (true) {
        const opts: string[] = [];
        if (canRetry) opts.push('[R]etry');
        opts.push('[S]kip');
        opts.push('[A]bort');
        if (canDetails) opts.push('[D]etails');

        output.print('  ' + boxDivider());
        output.print('    ' + opts.join('   '));
        output.print('  ' + boxDivider());
        const answer = readlineSync.question('  Escolha: ').trim().toLowerCase();

        if (answer === 'r' && canRetry) return 'retry';
        if (answer === 's') return 'skip';
        if (answer === 'a') return 'abort';
        if (answer === 'd' && canDetails) {
            divider();
            const axiosErr = err as { response?: { status?: number; data?: unknown }; stack?: string };
            output.print(`  Status: ${axiosErr.response?.status || 'N/A'}`);
            if (axiosErr.response?.data) {
                output.print(`  Resposta: ${JSON.stringify(axiosErr.response.data, null, 2)}`);
            }
            if (err instanceof Error && err.stack) {
                const lines = err.stack.split('\n').slice(0, 4);
                output.print(`  Stack: ${lines.join('\n    ')}`);
            }
            divider();
            continue;
        }
        warn('Opção inválida. Escolha ' + opts.join(', '));
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderSelected: (s: any) => palette.purple('❯ ' + s),
    },
};

const isTTY = (): boolean => !!(process.stdout.isTTY && !getConfig().quiet);

export async function ask(label: string, options: PromptOptions = {}): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await _loadInput();
    if (mod && isTTY()) {
        try {
            const answer = await mod.default({
                message: label,
                default: options.default,
                theme: inquirerTheme,
            });
            return (answer as string).trim();
        } catch {
            return prompt(label, options);
        }
    }
    return prompt(label, options);
}

export async function askConfirm(label: string, defaultYes = false): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await _loadConfirm();
    if (mod && isTTY()) {
        try {
            const answer = await mod.default({
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

interface SectionGroup {
    title: string;
    items: string[];
    itemValues: Array<string | undefined>;
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

export function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): string {
    const flatChoices = choices
        .filter((c): c is SelectChoice & { name: string } => c.type !== 'separator' && !!c.name)
        .map((c) => ({ name: c.name, value: c.value ?? c.name }));
    const { sections, standaloneItems } = groupChoices(choices);

    const termWidth = process.stdout.columns || 80;
    const renderedItems: string[] = [];
    for (const section of sections) renderedItems.push(...section.items.map((i) => ' ' + i));
    renderedItems.push(...standaloneItems.map((i) => '  ' + i));
    const maxLineWidth = renderedItems.length > 0 ? Math.max(...renderedItems.map((l) => visibleWidth(l)), 20) : 20;
    const overhead = 10;
    const cardWidth = Math.min(maxLineWidth + overhead, termWidth - 2);

    function padLine(line: string): string {
        const w = visibleWidth(line);
        if (w >= cardWidth - overhead) return line;
        return line + ' '.repeat(cardWidth - overhead - w);
    }

    interface MenuBlock {
        title: string;
        items: string[];
        height: number;
    }

    const blocks: MenuBlock[] = [];
    for (const section of sections) {
        blocks.push({
            title: section.title,
            items: section.items.map((i) => ' ' + padLine(i)),
            height: 4 + section.items.length,
        });
    }
    if (standaloneItems.length > 0) {
        blocks.push({
            title: '',
            items: standaloneItems.map((i) => ' ' + padLine(i)),
            height: 4 + standaloneItems.length,
        });
    }

    const pageSize = blocks.length > 0 ? options.pageSize || Output.rows() - 5 : 999;

    const pages: MenuBlock[][] = [];
    let currentBlocks: MenuBlock[] = [];
    let currentHeight = 0;

    for (const block of blocks) {
        if (currentBlocks.length > 0 && currentHeight + block.height > pageSize) {
            pages.push(currentBlocks);
            currentBlocks = [];
            currentHeight = 0;
        }
        currentBlocks.push(block);
        currentHeight += block.height;
    }
    if (currentBlocks.length > 0) pages.push(currentBlocks);

    let pageIdx = 0;

    function renderPage(): void {
        const pageBlocks = pages[pageIdx] || [];
        for (const block of pageBlocks) {
            const rendered = card(block.title, block.items, { width: cardWidth });
            output.print(rendered);
        }
        if (pages.length > 1) {
            output.print(palette.muted('  (Página ' + (pageIdx + 1) + '/' + pages.length + ' — /n próx, /p ant)'));
        }
        output.print('');
    }

    const hint = options.default ? 'Enter = ' + options.default : undefined;

    while (true) {
        renderPage();
        output.print(palette.muted('  Dica: digite o número da opção, alias (ex: criar, status, versões) ou /help'));
        const answer = prompt(label, { default: options.default, hint }).trim();
        const trimmed = answer.toLowerCase();
        if (trimmed === '/n' && pageIdx < pages.length - 1) {
            pageIdx++;
            continue;
        }
        if (trimmed === '/p' && pageIdx > 0) {
            pageIdx--;
            continue;
        }
        if (answer === '') return options.default || '0';
        if (trimmed === '0' || trimmed === 'exit' || trimmed === 'sair') return '0';
        if (trimmed.startsWith('/')) return answer;
        const num = parseInt(answer, 10);
        if (num >= 1 && num <= flatChoices.length) {
            return flatChoices[num - 1].value;
        }
        if (!isNaN(num)) {
            warn('Opção inválida. Digite um número entre 0 e ' + flatChoices.length + ' ou /help.');
            continue;
        }
        return answer;
    }
}

export function tableView<T extends Record<string, unknown>>(
    data: T[] | null | undefined,
    columns?: string[],
    statusKey?: string,
): void {
    if (!data || data.length === 0) {
        warn('Nenhum dado para exibir.');
        return;
    }
    const rows = columns
        ? data.map((row) => {
              const obj: Record<string, unknown> = {};
              for (const col of columns) {
                  if (col in row) obj[col] = row[col];
              }
              return obj;
          })
        : data;
    if (rows.length === 0) return;
    const keys = columns || Object.keys(rows[0]);
    const termWidth = Output.columns();
    const borderChars = keys.length + 1;
    const minAvail = keys.length * 3;
    const avail = Math.max(termWidth - borderChars, minAvail);
    const colWidths = keys.map(() => Math.floor(avail / keys.length));
    colWidths[0] += avail - colWidths.reduce((a, b) => a + b, 0);
    const table = new CliTable3({
        head: keys,
        colWidths,
        style: { head: [palette.muted as unknown as string] },
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
        wordWrap: true,
    });
    const statusColIdx = statusKey ? keys.indexOf(statusKey) : -1;
    for (const row of rows) {
        const cells = keys.map((k, i) => {
            const v = row[k];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            // eslint-disable-next-line @typescript-eslint/no-base-to-string -- known primitive
            const cell = String(v);
            if (i === statusColIdx) {
                if (/✓|pass|ok|sucesso/i.test(cell)) return chalk.hex('#3fb950')(cell);
                if (/✗|fail|error|erro/i.test(cell)) return chalk.hex('#f85149')(cell);
                if (/⚠|warn|skip|pulad/i.test(cell)) return chalk.hex('#d29922')(cell);
                return chalk.hex('#8b949e')(cell);
            }
            return cell;
        });
        table.push(cells);
    }
    output.print(table.toString());
}
