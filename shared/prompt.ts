import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import readlineSync from 'readline-sync';
import Config from './config';
import { rootLogger } from './logger';
import { box, divider as boxDivider } from './box';
import { palette } from './palette';
import type { TestResult } from './types';

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

export const isQuiet = (): boolean => Config.quiet;

function icon(name: 'ok' | 'err' | 'warn' | 'info'): string {
    const useUnicode = !Config.quiet && process.stdout.isTTY;
    if (useUnicode) {
        const map: Record<string, string> = { ok: '\u2713', err: '\u2717', warn: '\u26A0', info: '\u2139' };
        return map[name];
    }
    const fallback: Record<string, string> = { ok: 'OK', err: 'ERR', warn: '!', info: 'i' };
    return fallback[name];
}

export function success(msg: string): void {
    if (!isQuiet()) console.log(chalk.green.bold(icon('ok')) + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function error(msg: string): void {
    console.log(chalk.red.bold(icon('err')) + ' ' + msg);
    rootLogger.writeFileOnly('ERROR', msg);
}

export function warn(msg: string): void {
    console.log(chalk.yellow.bold(icon('warn')) + ' ' + msg);
    rootLogger.writeFileOnly('WARN', msg);
}

export function info(msg: string): void {
    if (!isQuiet()) console.log(chalk.cyan.bold(icon('info')) + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function helpLine(msg: string): void {
    console.log(chalk.cyan.bold(icon('info')) + ' ' + msg);
    rootLogger.writeFileOnly('HELP', msg);
}

export function print(msg: string): void {
    console.log(msg);
}

export function title(msg: string): void {
    if (isQuiet()) {
        console.log('--- ' + msg + ' ---');
        return;
    }
    console.log(box([msg], { border: 'none', padding: 0, width: 60 }));
}

export function prompt(label: string, options: PromptOptions = {}): string {
    const { default: def, hint, minLength } = options;
    while (true) {
        let text = '\n' + chalk.cyan('->') + ' ' + label;
        if (hint) text += ' ' + chalk.yellow('(' + hint + ')');
        if (def) text += ' ' + chalk.yellow('[' + def + ']');
        const answer = readlineSync.question(text + ': ', { defaultInput: def }).trim();
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
        console.log('  ' + chalk.yellow('!') + ' Resposta inválida. Digite S/sim ou N/não.');
    }
}

export function divider(): void {
    console.log(boxDivider());
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
        if (NAV_CMDS.includes(trimmed)) {
            return value;
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

export class ProgressBar {
    total: number;
    current: number;
    startTime: number;
    width: number;

    constructor(total: number, options: { width?: number } = {}) {
        this.total = total;
        this.current = 0;
        this.startTime = Date.now();
        this.width = options.width || 20;
    }

    update(current: number): void {
        this.current = current;
        const pct = this.total > 0 ? current / this.total : 0;
        const filled = Math.round(pct * this.width);

        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        let eta: string;
        if (current === 0 || elapsed === 0) {
            eta = '?';
        } else {
            eta = Math.round((elapsed / current) * (this.total - current)).toString();
        }

        if (process.stdout.isTTY && !isQuiet()) {
            const blocks = ['█', '▉', '▊', '▋', '▌', '▍', '▎', '▏', '░'];
            const full = Math.floor(filled);
            const frac = Math.round((filled - full) * blocks.length);
            let bar = '█'.repeat(full);
            if (full < this.width) {
                bar += blocks[blocks.length - 1 - Math.min(frac, blocks.length - 1)];
                bar += '░'.repeat(this.width - full - 1);
            }
            const color = pct >= 1 ? palette.green : pct > 0.5 ? palette.yellow : palette.blue;
            process.stdout.write('\r' + color(bar) + ' ' + current + '/' + this.total + ' ' + palette.muted(eta + 's'));
        } else {
            console.log('  Progresso: ' + current + '/' + this.total + ' (' + Math.round(pct * 100) + '%)');
        }
    }

    stop(): void {
        if (process.stdout.isTTY && !isQuiet()) {
            process.stdout.write('\r\x1b[K\n');
        }
    }
}

export class Spinner {
    frames: string[];
    interval: ReturnType<typeof setInterval> | null;
    i: number;

    constructor() {
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = null;
        this.i = 0;
    }

    start(msg: string): void {
        if (isQuiet()) {
            process.stdout.write(msg + '...\n');
            return;
        }
        this.i = 0;
        process.stdout.write(this.frames[0] + ' ' + msg);
        this.interval = setInterval(() => {
            this.i = (this.i + 1) % this.frames.length;
            process.stdout.write('\r' + this.frames[this.i] + ' ' + msg);
        }, 200);
    }

    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            process.stdout.write('\r');
        }
    }
}

export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const spinner = isQuiet() ? null : new Spinner();
    if (spinner) spinner.start(label);
    try {
        return await fn();
    } finally {
        if (spinner) spinner.stop();
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
    if (!message) return { msg: 'Erro desconhecido', hint: 'Verifique os logs acima para mais detalhes.' };
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
    if (!err) return 'Erro desconhecido';
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
        return 'Erro desconhecido';
    }
}

export function printError(context: string, err: unknown): void {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    const msg = known ? known.msg : raw || 'Erro inesperado';
    const hint = known ? known.hint : 'Verifique sua configuração e tente novamente.';
    if (isQuiet()) {
        console.log(chalk.red.bold(icon('err')) + ' ' + context + ': ' + msg);
        return;
    }
    console.log(
        box(
            [
                '',
                chalk.bold(palette.red(icon('err') + '  ' + context + ': ' + msg)),
                '',
                palette.blue('→  ' + hint),
                '',
            ],
            { border: 'single', color: 'red', padding: 0, width: 72 },
        ),
    );
}

export function printSummary(results: TestResult[]): void {
    const passed = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'error').length;

    if (failed === 0) {
        if (isQuiet()) {
            console.log('  ' + chalk.green.bold('TUDO CERTO!'));
            success(passed + ' de ' + results.length + ' operação(oes) concluída(s) com sucesso');
        } else {
            console.log(
                box(
                    [
                        '',
                        chalk.bold(palette.green('●  TUDO CERTO!')),
                        palette.fg('●  ' + passed + ' de ' + results.length + ' operação(ões) concluída(s)'),
                        '',
                    ],
                    { border: 'single', color: 'green', padding: 0, width: 72 },
                ),
            );
        }
        rootLogger.info('Resumo: ' + passed + '/' + results.length + ' ok');
    } else {
        const logPath = rootLogger.filePath;
        if (isQuiet()) {
            console.log('  ' + chalk.yellow.bold('OPERACAO PARCIAL'));
            console.log('  ' + chalk.yellow('!') + ' ' + passed + ' concluídas, ' + failed + ' com erro');
            results
                .filter((r) => r.status === 'error')
                .forEach((r) => {
                    console.log('  ' + chalk.red('*') + ' ' + r.label + ': ' + r.message);
                });
            if (logPath) {
                console.log('  ' + chalk.yellow('->') + ' Consulte o log: ' + logPath);
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
            errorLines.push(palette.blue('→  Consulte o log: ' + (logPath || 'ver logs acima')));
            errorLines.push('');
            console.log(box(errorLines, { border: 'single', color: 'yellow', padding: 0, width: 72 }));
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
    const msg = known ? known.msg : raw || 'Erro inesperado';

    error(`${context}: ${msg}`);

    if (Config.autoConfirm) {
        const autoAction = Config.onError;
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

        console.log('  ' + '-'.repeat(45));
        console.log('    ' + opts.join('   '));
        console.log('  ' + '-'.repeat(45));
        const answer = readlineSync.question('  Escolha: ').trim().toLowerCase();

        if (answer === 'r' && canRetry) return 'retry';
        if (answer === 's') return 'skip';
        if (answer === 'a') return 'abort';
        if (answer === 'd' && canDetails) {
            divider();
            const axiosErr = err as { response?: { status?: number; data?: unknown }; stack?: string };
            console.log(`  Status: ${axiosErr.response?.status || 'N/A'}`);
            if (axiosErr.response?.data) {
                console.log(`  Resposta: ${JSON.stringify(axiosErr.response.data, null, 2)}`);
            }
            if (err instanceof Error && err.stack) {
                const lines = err.stack.split('\n').slice(0, 4);
                console.log(`  Stack: ${lines.join('\n    ')}`);
            }
            divider();
            continue;
        }
        warn('Opção inválida. Escolha ' + opts.join(', '));
    }
}

let _inquirerMod: unknown = null;

async function _loadInquirer(): Promise<unknown> {
    if (_inquirerMod !== null) return _inquirerMod;
    try {
        _inquirerMod = await import('@inquirer/select');
        return _inquirerMod;
    } catch {
        _inquirerMod = false;
        return false;
    }
}

let _inputMod: unknown = null;

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

const isTTY = (): boolean => !!(process.stdout.isTTY && !Config.quiet);

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

export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await _loadInquirer();
    if (mod && isTTY()) {
        const processed = choices.map((c: SelectChoice) => {
            if (c.type === 'separator') return new mod.Separator(c.line);
            return c;
        });
        try {
            const answer = await mod.default({
                message: label,
                choices: processed,
                pageSize: options.pageSize || 14,
                loop: false,
                default: options.default,
                theme: inquirerTheme,
            });
            return answer;
        } catch (err: unknown) {
            const promptErr = err as { name?: string; message?: string };
            if (promptErr.name === 'ExitPromptError' || promptErr.message?.includes('cancel')) {
                return '0';
            }
            throw err;
        }
    }
    const flatChoices = choices.filter((c) => c.type !== 'separator');
    console.log('');
    let idx = 0;
    for (const c of choices) {
        if (c.type === 'separator') {
            if (c.line) console.log('  ' + c.line);
            continue;
        }
        idx++;
        const desc = c.description ? '  ' + c.description : '';
        console.log('   ' + idx + '.  ' + c.name + desc);
    }
    while (true) {
        const answer = prompt(label).trim();
        if (answer.startsWith('/')) return answer;
        const parsed = parseInt(answer, 10);
        if (parsed >= 1 && parsed <= flatChoices.length) {
            const selected = flatChoices[parsed - 1];
            return selected.value || selected.name || answer;
        }
        if (answer === '' || answer === '0') return '0';
        warn('Opção inválida. Escolha um número entre 1 e ' + flatChoices.length + '.');
    }
}

export function tableView<T extends Record<string, unknown>>(data: T[] | null | undefined, columns?: string[]): void {
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
    const termWidth = process.stdout.columns || 80;
    const borderChars = keys.length + 1;
    const minAvail = keys.length * 3;
    const avail = Math.max(termWidth - borderChars, minAvail);
    const colWidths = keys.map(() => Math.floor(avail / keys.length));
    colWidths[0] += avail - colWidths.reduce((a, b) => a + b, 0);
    const table = new CliTable3({
        head: keys,
        colWidths,
        style: { head: ['cyan'] },
        wordWrap: true,
    });
    for (const row of rows) {
        table.push(
            keys.map((k) => {
                const v = row[k];
                if (v === null || v === undefined) return '';
                if (typeof v === 'object') return JSON.stringify(v);
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                return String(v);
            }),
        );
    }
    console.log(table.toString());
}
