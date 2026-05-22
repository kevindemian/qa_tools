import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import readlineSync from 'readline-sync';
import Config from './config';
import { rootLogger } from './logger';

export interface TestResult {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

interface PromptOptions {
    default?: string;
    hint?: string;
    maxRetries?: number;
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

export function success(msg: string): void {
    console.log(chalk.green('OK') + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function error(msg: string): void {
    console.log(chalk.red('ERR') + ' ' + msg);
    rootLogger.writeFileOnly('ERROR', msg);
}

export function warn(msg: string): void {
    console.log(chalk.yellow('!') + ' ' + msg);
    rootLogger.writeFileOnly('WARN', msg);
}

export function info(msg: string): void {
    if (!isQuiet()) console.log(chalk.cyan('i') + ' ' + msg);
    rootLogger.writeFileOnly('INFO', msg);
}

export function print(msg: string): void {
    console.log(msg);
}

export function title(msg: string): void {
    console.log('\n' + chalk.bold(msg));
}

export function prompt(label: string, options: PromptOptions = {}): string {
    const { default: def, hint } = options;
    let text = '\n' + chalk.cyan('->') + ' ' + label;
    if (hint) text += ' ' + chalk.yellow('(' + hint + ')');
    if (def) text += ' ' + chalk.yellow('[' + def + ']');
    return readlineSync.question(text + ': ', { defaultInput: def }).trim();
}

export function confirm(label: string, defaultYes = false): boolean {
    const def = defaultYes ? 'Y' : 'N';
    const text = '\n' + chalk.yellow('?') + ' ' + label + ' ' + chalk.yellow('(' + def + ')');
    const answer = readlineSync.question(text + ': ', { defaultInput: def.toLowerCase() });
    return ['y', 'yes', 'sim', 's'].includes(answer.toLowerCase().trim());
}

export function divider(): void {
    const width = process.stdout.columns && process.stdout.columns > 20 ? process.stdout.columns : 50;
    console.log('-'.repeat(width));
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
    warn('Numero maximo de tentativas excedido.');
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
        let bar: string;
        if (filled >= this.width) {
            bar = '='.repeat(this.width);
        } else if (filled <= 0) {
            bar = '>' + ' '.repeat(this.width - 1);
        } else {
            bar = '='.repeat(filled) + '>' + ' '.repeat(this.width - filled - 1);
        }
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        let eta: string;
        if (current === 0 || elapsed === 0) {
            eta = '?';
        } else {
            eta = Math.round((elapsed / current) * (this.total - current)).toString();
        }
        if (process.stdout.isTTY) {
            process.stdout.write('\r[' + bar + '] ' + current + '/' + this.total + ' ' + eta + 's');
        } else {
            console.log('  Progresso: ' + current + '/' + this.total + ' (' + Math.round(pct * 100) + '%)');
        }
    }

    stop(): void {
        if (process.stdout.isTTY) {
            process.stdout.write('\r\x1b[K\n');
        }
    }
}

export class Spinner {
    frames: string[];
    interval: ReturnType<typeof setInterval> | null;
    i: number;

    constructor() {
        this.frames = ['-', '\\', '|', '/'];
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
        hint: 'Verifique se o tipo esta habilitado nas configuracoes do projeto Jira.',
    },
    {
        test: /project.*not found/i,
        msg: 'Projeto não encontrado',
        hint: 'Verifique se o nome do projeto esta correto.',
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
        hint: 'Verifique seu token de autenticacao no arquivo .env.',
    },
    {
        test: /econnreset|econnrefused|enotfound|timeout|econnaborted/i,
        msg: 'Erro de conexão',
        hint: 'Verifique se a URL do Jira esta correta e acessivel.',
    },
    { test: /version.*not found/i, msg: 'Versão não encontrada', hint: 'Verifique se o nome da versão esta correto.' },
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
    if (known) {
        error(context + ': ' + known.msg);
        console.log('  ' + chalk.yellow('->') + ' ' + known.hint);
    } else {
        error(context + ': ' + (raw || 'Erro inesperado'));
        console.log('  ' + chalk.yellow('->') + ' Verifique sua configuração e tente novamente.');
    }
}

export function printSummary(results: TestResult[]): void {
    divider();
    const passed = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'error').length;

    if (failed === 0) {
        console.log('  ' + chalk.green.bold('TUDO CERTO!'));
        success(passed + ' de ' + results.length + ' operação(oes) concluída(s) com sucesso');
        rootLogger.info('Resumo: ' + passed + '/' + results.length + ' ok');
    } else {
        const logPath = rootLogger.filePath;
        console.log('  ' + chalk.yellow.bold('OPERACAO PARCIAL'));
        warn(passed + ' concluídas, ' + failed + ' com erro');
        results
            .filter((r) => r.status === 'error')
            .forEach((r) => {
                console.log('  ' + chalk.red('*') + ' ' + r.label + ': ' + r.message);
            });
        if (logPath) {
            console.log('  ' + chalk.yellow('->') + ' Consulte o log: ' + logPath);
        }
        rootLogger.warn(`Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
    }
    divider();
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
        warn('Opção invalida. Escolha ' + opts.join(', '));
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

const isTTY = (): boolean => !!(process.stdout.isTTY && !Config.quiet);

export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    const mod: unknown = await _loadInquirer();
    if (mod && isTTY()) {
        const processed = choices.map((c) => {
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
            if (c.line) console.log(' ' + c.line);
            continue;
        }
        idx++;
        const desc = c.description ? '  ' + c.description : '';
        console.log('  ' + idx + '. ' + c.name + desc);
    }
    while (true) {
        const answer = prompt(label).trim();
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
    const table = new CliTable3({
        head: keys,
        style: { head: ['cyan'] },
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
