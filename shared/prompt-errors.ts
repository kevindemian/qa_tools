/** Error handling: known error patterns, formatting, user prompts. */
import chalk from 'chalk';
import { box, divider as boxDivider } from './box';
import { palette } from './palette';
import { defaultOutput as output } from './output';
import {
    isQuiet,
    getConfig,
    icon,
    error,
    warn,
    divider,
    MSG_UNKNOWN_ERROR,
    MSG_UNEXPECTED,
    SUMMARY_BOX_WIDTH,
    STACK_TRACE_LINES,
} from './prompt-format';
import readlineSync from 'readline-sync';

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

const NAV_CMDS = ['/back', '/menu', '/exit', '/sair', '/quit', '/help'];

export class CancelError extends Error {
    cmd: string;
    constructor(cmd: string) {
        super('User cancelled with ' + cmd);
        this.name = 'CancelError';
        this.cmd = cmd;
    }
}

export function onError(
    context: string,
    err: unknown,
    options: { retry?: boolean; details?: boolean } = {},
): 'abort' | 'skip' | 'retry' {
    const { retry: canRetry = false, details: canDetails = false } = options;
    const { msg } = _formatErrorMessage(err);

    error(`${context}: ${msg}`);

    if (getConfig().get<boolean>('autoConfirm')) {
        const autoAction = getConfig().get('onError');
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
