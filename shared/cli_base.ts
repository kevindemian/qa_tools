import chalk from 'chalk';
import { print, success, error, warn, info, divider } from './prompt';
import { rootLogger } from './logger';

const _sessionStart = Date.now();

interface EnvConfig {
    key: string;
    label: string;
    example: string;
}

export function mask(v: string): string {
    return v ? v.slice(0, 4) + '****' : '';
}

export function createValidateEnv(configs: EnvConfig[]): () => void {
    return function validateEnv(): void {
        const missing = configs.filter((c) => !process.env[c.key]);
        if (missing.length === 0) {
            for (const c of configs) {
                const val = process.env[c.key] || '';
                if (
                    val.length > 20 &&
                    !val.includes('placeholder') &&
                    !val.includes('seu-') &&
                    !val.includes('your-')
                ) {
                    rootLogger.warn(`VARIÁVEL COM CREDENCIAL REAL: ${c.key}=${mask(val)}`);
                }
            }
            return;
        }
        error('Variáveis obrigatórias não configuradas:');
        missing.forEach((c) => warn(`  * ${c.label}`));
        warn('Crie um arquivo .env na raiz do projeto com:');
        configs.forEach((c) => info(`${c.key}=${c.example}`));
        rootLogger.error(`Variáveis faltando: ${missing.map((c) => c.key).join(', ')}`);
        throw new Error('Variáveis de ambiente faltando. Configure o .env.');
    };
}

export function sanitizeUrl(url: string): string {
    return url.replace(/token=[^&]+/, 'token=****');
}

export function setupSigint(getIsBusy: (() => boolean) | null, onExit: (() => void) | null): void {
    const handler = () => {
        if (getIsBusy && getIsBusy()) {
            info('Operação em andamento. Use Ctrl+C novamente para forcar saida.');
            return;
        }
        process.removeListener('SIGINT', handler);
        if (onExit) onExit();
        info('Até logo!');
        process.exitCode = 0;
        setTimeout(() => process.exit(), 2000).unref();
    };
    process.on('SIGINT', handler);
}

interface SessionCounter {
    status: string;
}

interface HistoryEntry {
    status: string;
    op: string;
    detail: string;
}

export function printSessionSummary(
    sessionCounters: SessionCounter[],
    lastOperation: string | null,
    history?: HistoryEntry[],
): void {
    const logPath = rootLogger.filePath;
    print('');
    divider();
    info('Sessão encerrada.');
    const ok = sessionCounters.filter((c) => c.status === 'ok').length;
    const er = sessionCounters.filter((c) => c.status === 'error').length;
    if (ok > 0 || er > 0) {
        if (ok > 0) success(ok + ' operação(oes) concluída(s)');
        if (er > 0) error(er + ' operação(oes) com erro');
    }
    if (history && history.length > 0) {
        const last5 = history.slice(-5);
        info('Últimas operacoes:');
        last5.forEach((h) => {
            const icon = h.status === 'error' ? chalk.red('ERR') : chalk.green('OK');
            print(`  ${icon} ${h.op}: ${h.detail}`);
        });
    }
    if (lastOperation) info('Última operação: ' + lastOperation);
    if (logPath) info('Log: ' + logPath);
    const elapsed = Math.round((Date.now() - _sessionStart) / 1000);
    info('Sessão: ' + elapsed + 's');
    divider();
    rootLogger.writeFileOnly(
        'INFO',
        'Sessão encerrada. ' +
            (ok > 0 ? ok + ' ok, ' : '') +
            (er > 0 ? er + ' erro(s), ' : '') +
            'última: ' +
            (lastOperation || 'nenhuma'),
    );
}
