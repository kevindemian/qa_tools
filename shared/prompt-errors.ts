/** Error handling: known error patterns, formatting, user prompts. */
import chalk from 'chalk';
import { box, divider as boxDivider } from './box.js';
import { palette } from './palette.js';
import { defaultOutput as output } from './output.js';
import { rootLogger } from './logger.js';
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
} from './prompt-format.js';
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
        hint: 'Token inválido ou expirado. Reconfigure: /setup ou edite o arquivo .env.',
    },
    {
        test: /econnreset|econnrefused|enotfound|timeout|econnaborted/i,
        msg: 'Erro de conexão',
        hint: 'Verifique se a URL do Jira está correta e acessível.',
    },
    { test: /version.*not found/i, msg: 'Versão não encontrada', hint: 'Verifique se o nome da versão está correto.' },
    { test: /already exists/i, msg: 'Item ja existe', hint: 'Escolha um nome diferente.' },
    // Padrões CI/GitHub/GitLab (Fase 3-5 do SSOT plan)
    {
        test: /EPIPE|ECONNRESET.*GitHub/i,
        msg: 'Conexão com GitHub perdida',
        hint: 'Verifique sua conexão de rede e tente novamente.',
    },
    {
        test: /artifact.*expired|not found.*artifact/i,
        msg: 'Artefato CI expirado ou ausente',
        hint: 'O artefato pode ter expirado. Tente re-executar o pipeline.',
    },
    {
        test: /invalid.*json|unexpected.*token/i,
        msg: 'Arquivo de dados corrompido',
        hint: 'O arquivo de resultado parece estar corrompido. Re-execute.',
    },
    {
        test: /ENOENT.*coverage|ENOTDIR.*coverage/i,
        msg: 'Arquivo de coverage não encontrado',
        hint: 'Verifique se o pipeline gerou o relatório de coverage.',
    },
    {
        test: /rate.*limit.*github|abuse.*detection/i,
        msg: 'Rate limit do GitHub',
        hint: 'Muitas requisições. Aguarde e tente novamente.',
    },
    {
        test: /ETIMEDOUT.*api\.github/i,
        msg: 'Timeout na API do GitHub',
        hint: 'API do GitHub lenta. Tente novamente em alguns minutos.',
    },
    {
        test: /403.*github.*secondary.*rate/i,
        msg: 'Secondary rate limit GitHub',
        hint: 'GitHub bloqueou temporariamente. Aguarde 60s.',
    },
    {
        test: /invalid.*xml|not well-formed/i,
        msg: 'Arquivo XML inválido',
        hint: 'O arquivo JUnit XML está mal formatado.',
    },
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
    } catch (err) {
        rootLogger.debug('Error extraction failed: ' + String(err));
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

function handleAutoConfirm(_err: unknown, _raw: string): 'abort' | 'skip' | 'retry' | null {
    if (!getConfig().get<boolean>('autoConfirm')) return null;
    const autoAction = getConfig().get('onError');
    if (autoAction === 'skip') warn('Modo automatico: pulando...');
    else error('Modo automatico: abortando...');
    return autoAction as 'abort' | 'skip' | 'retry';
}

function processAnswer(
    answer: string,
    canRetry: boolean,
    canDetails: boolean,
): 'abort' | 'skip' | 'retry' | 'details' | null {
    if (answer === 'r' && canRetry) return 'retry';
    if (answer === 's') return 'skip';
    if (answer === 'a') return 'abort';
    if (answer === 'd' && canDetails) return 'details';
    return null;
}

function readUserChoice(canRetry: boolean, canDetails: boolean): string {
    const opts: string[] = [];
    if (canRetry) opts.push('[R]etry');
    opts.push('[S]kip');
    opts.push('[A]bort');
    if (canDetails) opts.push('[D]etails');

    output.print('  ' + boxDivider());
    output.print('    ' + opts.join('   '));
    output.print('  ' + boxDivider());
    let answer: string;
    try {
        answer = readlineSync.question('  Escolha: ').trim().toLowerCase();
    } catch (err) {
        error('Entrada padrão indisponível. Abortando: ' + String(err));
        return 'abort';
    }
    if (NAV_CMDS.includes(answer)) throw new CancelError(answer);
    return answer;
}

export function onError(
    context: string,
    err: unknown,
    options: { retry?: boolean; details?: boolean } = {},
): 'abort' | 'skip' | 'retry' {
    const { retry: canRetry = false, details: canDetails = false } = options;
    const { msg, raw } = _formatErrorMessage(err);

    error(`${context}: ${msg}`);
    if (/unauthorized|401/i.test(raw)) {
        output.print(palette.blue('→  Token inválido ou expirado. Reconfigure com /setup ou edite o .env'));
    }

    const autoResult = handleAutoConfirm(err, raw);
    if (autoResult) return autoResult;

    const MAX_ATTEMPTS = 10;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const answer = readUserChoice(canRetry, canDetails);
        if (answer === 'abort') return 'abort';
        const result = processAnswer(answer, canRetry, canDetails);
        if (result === 'retry') return 'retry';
        if (result === 'skip') return 'skip';
        if (result === 'details') {
            _showErrorDetails(err);
            continue;
        }
        const opts: string[] = [];
        if (canRetry) opts.push('[R]etry');
        opts.push('[S]kip');
        opts.push('[A]bort');
        if (canDetails) opts.push('[D]etails');
        warn('Opção inválida. Escolha ' + opts.join(', '));
    }
    return 'abort';
}
