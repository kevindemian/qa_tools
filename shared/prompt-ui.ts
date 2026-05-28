/** User-facing UI output: styled messages, tables, error formatting, and summary display.
 * All output goes through {@link Output} (supports quiet/TTY modes).
 * @module Use `import { success, error, printError, tableView } from './prompt-ui'`. */
import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import Config from './config';
import { rootLogger } from './logger';
import { box, divider as boxDivider, visibleWidth } from './box';
import { palette } from './palette';
import { Output, defaultOutput as output } from './output';
import { getBreadcrumbPath } from './breadcrumbs';
import type { TestResult } from './types';

let _config: Config | null = null;

/** Override the config instance (used by tests). */
export function __setConfig(c: Config): void {
    _config = c;
}

/** Get the current config instance (override or global singleton). */
export function getConfig(): Config {
    return _config || Config.getDefault();
}

/** Whether the UI is in quiet mode (minimal output). */
export const isQuiet = (): boolean => getConfig().quiet;

const MSG_UNKNOWN_ERROR = 'Erro desconhecido';
const MSG_UNEXPECTED = 'Erro inesperado';
const TITLE_BOX_WIDTH = 60;
const SUMMARY_BOX_WIDTH = 72;
const STACK_TRACE_LINES = 4;
const MIN_COLUMN_WIDTH = 3;

/** Render a coloured badge like `● 3 passed`. */
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

/** Get a unicode icon (or fallback text) for a status. */
export function icon(name: 'ok' | 'err' | 'warn' | 'info'): string {
    const useUnicode = !getConfig().quiet && Output.isTTY();
    if (useUnicode) {
        const map: Record<string, string> = { ok: '\u2713', err: '\u2717', warn: '\u26A0', info: '\u2139' };
        return map[name]!;
    }
    const fallback: Record<string, string> = { ok: 'OK ', err: 'ERR', warn: '!  ', info: 'i  ' };
    return fallback[name] || fallback.info!;
}

type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'HELP';

function _log(level: LogLevel, color: chalk.Chalk, iconName: string, msg: string, quietOk?: boolean): void {
    if (quietOk || !isQuiet()) {
        output.print(color.bold(icon(iconName as 'ok' | 'err' | 'warn' | 'info')) + ' ' + msg);
    }
    rootLogger.writeFileOnly(level, msg);
}

/** Print a green success message (quietOk=false — hidden in quiet mode). */
export function success(msg: string): void {
    _log('INFO', chalk.green, 'ok', msg);
}

/** Print a red error message (quietOk=true — always shown). */
export function error(msg: string): void {
    _log('ERROR', chalk.red, 'err', msg, true);
}

/** Print a yellow warning message (quietOk=true — always shown). */
export function warn(msg: string): void {
    _log('WARN', chalk.yellow, 'warn', msg, true);
}

/** Print a cyan info message (quietOk=false). */
export function info(msg: string): void {
    _log('INFO', chalk.cyan, 'info', msg);
}

/** Print a help hint (cyan, quietOk=false). */
export function helpLine(msg: string): void {
    _log('HELP', chalk.cyan, 'info', msg);
}

/** Print a raw message to output (no colour/formatting). */
export function print(msg: string): void {
    output.print(msg);
}

/** Print a styled section title with breadcrumb prefix. */
export function title(msg: string): void {
    const path = getBreadcrumbPath();
    const prefix = path ? path + ' > ' : '';
    const fullMsg = prefix + msg;
    if (isQuiet()) {
        output.print('--- ' + fullMsg + ' ---');
        return;
    }
    output.print(box([fullMsg], { border: 'none', padding: 0, width: TITLE_BOX_WIDTH }));
}

/** Print a horizontal divider line. */
export function divider(): void {
    output.print(boxDivider());
}

interface KnownError {
    test: RegExp;
    msg: string;
    hint: string;
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

/** Try to match an error message against known patterns and return a user-friendly description + hint.
 * @returns `{ msg, hint }` or `null` if no pattern matches. */
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

/** Extract a human-readable message from an unknown error (axios errors, strings, Error objects). */
export function extractErrorMessage(err: unknown): string {
    if (!err) return MSG_UNKNOWN_ERROR;
    try {
        const axiosErr = err as {
            response?: { status?: number; data?: unknown };
            message?: string;
            config?: { url?: string };
        };
        const data = axiosErr.response?.data;
        let msg = '';
        if (isAxiosErrorData(data)) {
            msg = data.errorMessages?.[0] || data.message || '';
        } else if (typeof data === 'string') {
            msg = data;
        }
        msg = msg || axiosErr.message || '';
        const status = axiosErr.response?.status;
        const url = axiosErr.config?.url;
        if (status) msg += ' (HTTP ' + status + ')';
        if (url) msg += ' → ' + url;
        return msg;
    } catch {
        return MSG_UNKNOWN_ERROR;
    }
}

/** Print a styled error box with context, humanized message, and recovery hint.
 * In quiet mode, shows a compact single-line version. */
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
    output.print(box(errorLines, { border: 'double', color: 'red', padding: 1, width: SUMMARY_BOX_WIDTH }));
}

function renderQuietSummary(passed: number, failed: number, results: TestResult[]): void {
    if (failed === 0) {
        output.print('  ' + chalk.green.bold('TUDO CERTO!'));
        success(passed + ' de ' + results.length + ' operação(oes) concluída(s) com sucesso');
        return;
    }
    output.print('  ' + chalk.yellow.bold('OPERACAO PARCIAL'));
    output.print('  ' + chalk.yellow('!') + ' ' + passed + ' concluídas, ' + failed + ' com erro');
    results
        .filter((r) => r.status === 'error')
        .forEach((r) => {
            output.print('  ' + chalk.red('*') + ' ' + r.label + ': ' + r.message);
        });
    if (failed > 0) {
        const logPath = rootLogger.filePath;
        if (logPath) {
            output.print('  ' + chalk.yellow('->') + ' Consulte o log: ' + logPath);
        }
    }
}

function renderVerboseSuccess(passed: number, total: number, pct: number, testExecution?: string): void {
    const lines: string[] = [
        '',
        chalk.bold(palette.green('●  TUDO CERTO!')),
        palette.fg('●  ' + passed + ' de ' + total + ' operação(ões) concluída(s)'),
        '',
    ];
    lines.push(palette.fg('📊  ' + pct + '% pass rate'));
    if (testExecution) {
        lines.push(palette.blue('📎  Test Execution: ' + testExecution));
    }
    lines.push('');
    output.print(box(lines, { border: 'single', color: 'green', padding: 0, width: SUMMARY_BOX_WIDTH }));
}

function renderVerboseFailure(
    passed: number,
    failed: number,
    results: TestResult[],
    pct: number,
    testExecution?: string,
): void {
    const logPath = rootLogger.filePath;
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
    errorLines.push(palette.fg('📊  ' + pct + '% pass rate'));
    if (testExecution) {
        errorLines.push(palette.blue('📎  Test Execution: ' + testExecution));
    }
    errorLines.push(palette.blue('→  Consulte o log: ' + (logPath || 'ver logs acima')));
    errorLines.push('');
    output.print(box(errorLines, { border: 'single', color: 'yellow', padding: 0, width: SUMMARY_BOX_WIDTH }));
}

/** Print an end-of-run summary with pass/fail counts, percentage, and optional Test Execution key. */
export function printSummary(results: TestResult[], testExecution?: string): void {
    const passed = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const pct = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

    if (isQuiet()) {
        renderQuietSummary(passed, failed, results);
    } else if (failed === 0) {
        renderVerboseSuccess(passed, results.length, pct, testExecution);
    } else {
        renderVerboseFailure(passed, failed, results, pct, testExecution);
    }

    if (failed === 0) {
        rootLogger.info('Resumo: ' + passed + '/' + results.length + ' ok');
    } else {
        rootLogger.warn(`Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
    }
}

function _formatErrorMessage(err: unknown): { msg: string; raw: string } {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    const msg = known ? known.msg : raw || MSG_UNEXPECTED;
    return { msg, raw };
}

function _showErrorDetails(err: unknown): void {
    divider();
    const axiosErr = err as { response?: { status?: number; data?: unknown }; stack?: string };
    output.print(`  Status: ${axiosErr.response?.status || 'N/A'}`);
    if (axiosErr.response?.data) {
        output.print(`  Resposta: ${JSON.stringify(axiosErr.response.data, null, 2)}`);
    }
    if (err instanceof Error && err.stack) {
        const lines = err.stack.split('\n').slice(0, STACK_TRACE_LINES);
        output.print(`  Stack: ${lines.join('\n    ')}`);
    }
    divider();
}

/** Prompt the user for an action after an error: Retry, Skip, Abort, or Details.
 * In auto-confirm mode always returns the configured `onError` action instead of prompting.
 * @internal Async only to match the callback signature used by callers. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function onError(
    context: string,
    err: unknown,
    options: { retry?: boolean; details?: boolean } = {},
): Promise<'abort' | 'skip' | 'retry'> {
    const { retry: canRetry = false, details: canDetails = false } = options;
    const { msg } = _formatErrorMessage(err);

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
        if (NAV_CMDS.includes(answer)) throw new CancelError(answer);

        if (answer === 'r' && canRetry) return 'retry';
        if (answer === 's') return 'skip';
        if (answer === 'a') return 'abort';
        if (answer === 'd' && canDetails) {
            _showErrorDetails(err);
            continue;
        }
        warn('Opção inválida. Escolha ' + opts.join(', '));
    }
}

import readlineSync from 'readline-sync';

/** Thrown when the user enters a navigation command (`/back`, `/menu`, `/exit`).
 * Caught by the main loop to switch screens. */
export class CancelError extends Error {
    cmd: string;
    constructor(cmd: string) {
        super('User cancelled with ' + cmd);
        this.name = 'CancelError';
        this.cmd = cmd;
    }
}

const NAV_CMDS = ['/back', '/menu', '/exit', '/sair', '/quit', '/help'];

function buildCliTable3Config(keys: string[]): {
    head: string[];
    colWidths: number[];
    style: { head: string[]; border: string[] };
    chars: Record<string, string>;
    wordWrap: boolean;
} {
    const termWidth = Output.columns();
    const avail = Math.max(termWidth - (keys.length + 1), keys.length * MIN_COLUMN_WIDTH);
    const indentStr = '  ';
    const indentWidth = visibleWidth(indentStr);
    const colWidths = keys.map(() => Math.floor(avail / keys.length));
    colWidths[0]! += avail - colWidths.reduce((a, b) => a + b, 0);
    return {
        head: keys,
        colWidths: colWidths.map((w) => Math.max(w - indentWidth, MIN_COLUMN_WIDTH)),
        style: {
            head: [typeof palette.muted === 'string' ? palette.muted : ''],
            border: [typeof palette.border === 'string' ? palette.border : ''],
        },
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
    };
}

function colorizeRowCells(keys: string[], row: Record<string, unknown>, statusColIdx: number): string[] {
    return keys.map((k, i) => {
        const v = row[k];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const cell: string = String(v);
        if (i === statusColIdx) {
            if (/✓|pass|ok|sucesso/i.test(cell)) return palette.green(cell);
            if (/✗|fail|error|erro/i.test(cell)) return palette.red(cell);
            if (/⚠|warn|skip|pulad/i.test(cell)) return palette.yellow(cell);
            return palette.muted(cell);
        }
        return cell;
    });
}

/** Render a table of records using cli-table3 with coloured status column.
 * Handles empty/null data gracefully (shows warning). */
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
    const keys = columns || Object.keys(rows[0]!);
    const table = new CliTable3(buildCliTable3Config(keys));
    const statusColIdx = statusKey ? keys.indexOf(statusKey) : -1;
    for (const row of rows) {
        table.push(colorizeRowCells(keys, row, statusColIdx));
    }
    const tableStr = table.toString();
    const indentStr = '  ';
    const indented = tableStr
        .split('\n')
        .map((line) => indentStr + line)
        .join('\n');
    output.print(indented);
}
