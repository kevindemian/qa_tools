/** User-facing UI output: styled messages, tables, and formatting helpers. */
import chalk, { type ChalkInstance } from 'chalk';
import CliTable3 from 'cli-table3';
import ConfigAccessor from './config-accessor.js';
import { rootLogger } from './logger.js';
import { box, divider as boxDivider, visibleWidth } from './box.js';
import { palette } from './palette.js';
import { Output, defaultOutput as output } from './output.js';
import { getBreadcrumbPath } from './breadcrumbs.js';

let _config: ConfigAccessor | null = null;

export function __setConfig(c: ConfigAccessor): void {
    _config = c;
}

export function getConfig(): ConfigAccessor {
    return _config || ConfigAccessor.getDefault();
}

export const isQuiet = (): boolean => getConfig().get<boolean>('quiet');

export const MSG_UNKNOWN_ERROR = 'Erro desconhecido';
export const MSG_UNEXPECTED = 'Erro inesperado';
export const SUMMARY_BOX_WIDTH = 72;
export const STACK_TRACE_LINES = 4;
const TITLE_BOX_WIDTH = 60;
const MIN_COLUMN_WIDTH = 3;

export function badge(count: number, label: string, status: 'ok' | 'error' | 'warn' | 'info'): string {
    const colors: Record<string, ChalkInstance> = {
        ok: chalk.hex('#3fb950'),
        error: chalk.hex('#f85149'),
        warn: chalk.hex('#d29922'),
        info: chalk.hex('#8b949e'),
    };
    const c = colors[status] || chalk.hex('#8b949e');
    const icon = status === 'info' ? '○' : '●';
    return `${c(icon)} ${c(count + ' ' + label)}`;
}

export function icon(name: 'ok' | 'err' | 'warn' | 'info'): string {
    const useUnicode = !getConfig().get<boolean>('quiet') && Output.isTTY();
    if (useUnicode) {
        const map: Record<string, string> = { ok: '\u2713', err: '\u2717', warn: '\u26A0', info: '\u2139' };
        return map[name] ?? '';
    }
    const fallback: Record<string, string> = { ok: 'OK ', err: 'ERR', warn: '!  ', info: 'i  ' };
    return fallback[name] || 'i  ';
}

type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'HELP';

function _log(level: LogLevel, color: ChalkInstance, iconName: string, msg: string, quietOk?: boolean): void {
    if (quietOk || !isQuiet()) {
        output.print(color.bold(icon(iconName as 'ok' | 'err' | 'warn' | 'info')) + ' ' + msg);
    }
    rootLogger.writeFileOnly(level, msg);
}

export function success(msg: string): void {
    _log('INFO', chalk.green, 'ok', msg);
}

export function error(msg: string): void {
    _log('ERROR', chalk.red, 'err', msg, true);
}

export function warn(msg: string): void {
    _log('WARN', chalk.yellow, 'warn', msg, true);
}

export function info(msg: string): void {
    _log('INFO', chalk.cyan, 'info', msg);
}

export function helpLine(msg: string): void {
    _log('HELP', chalk.cyan, 'info', msg);
}

export function print(msg: string): void {
    output.print(msg);
}

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

export function divider(): void {
    output.print(boxDivider());
}

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
    colWidths[0] = (colWidths[0] as number) + avail - colWidths.reduce((a, b) => a + b, 0);
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
        const cell: string = typeof v === 'string' ? v : JSON.stringify(v);
        if (i === statusColIdx) {
            if (/✓|pass|ok|sucesso/i.test(cell)) return palette.green(cell);
            if (/✗|fail|error|erro/i.test(cell)) return palette.red(cell);
            if (/⚠|warn|skip|pulad/i.test(cell)) return palette.yellow(cell);
            return palette.muted(cell);
        }
        return cell;
    });
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
    const keys = columns || Object.keys(rows[0] as Record<string, unknown>);
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
