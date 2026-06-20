import chalk from 'chalk';
import * as readline from 'readline';
import { print, success, error, warn, info, divider, confirm } from './prompt.js';
import { rootLogger } from './logger.js';
import Config from './config.js';
import { loadMetrics } from './metrics.js';
import { calculateHealthScore } from './health-score.js';
import { ExitCode } from './types.js';
import { cleanupTempDirs } from './temp-dir.js';

const _sessionStart = Date.now();
const CREDENTIAL_MIN_LENGTH = 20;
const MASK_VISIBLE_CHARS = 4;
const LAST_OPS_COUNT = 5;
const EXIT_DELAY_MS = 2000;

interface EnvConfig {
    key: string;
    label: string;
    example: string;
}

export function mask(v: string): string {
    return v ? v.slice(0, MASK_VISIBLE_CHARS) + '****' : '';
}

/** Resultado da validação de ambiente. `ok` = true quando todas as variáveis estão configuradas. */
export interface EnvValidationResult {
    ok: boolean;
    missing: string[];
}

export function createValidateEnv(configs: EnvConfig[], config?: Config): () => EnvValidationResult {
    return function validateEnv(): EnvValidationResult {
        const cfg = config || Config;
        const missing = configs.filter((c) => !cfg.get(c.key));
        if (missing.length > 0) {
            warn('Configurações incompletas. Funcionalidades que dependem dessas variáveis serão limitadas.');
            missing.forEach((c) => warn(`  • ${c.label}`));
            rootLogger.warn(`Variáveis de ambiente faltando: ${missing.map((c) => c.key).join(', ')}`);
        } else {
            for (const c of configs) {
                const val = cfg.get(c.key) || '';
                if (
                    val.length > CREDENTIAL_MIN_LENGTH &&
                    !val.includes('placeholder') &&
                    !val.includes('seu-') &&
                    !val.includes('your-')
                ) {
                    rootLogger.warn(`VARIÁVEL COM CREDENCIAL REAL: ${c.key}=${mask(val)}`);
                }
            }
        }
        return { ok: missing.length === 0, missing: missing.map((c) => c.key) };
    };
}

/** After `validateEnv()`, ask the user if they want to run the setup wizard.
 *  Returns `true` if the user accepted (caller should launch the wizard).
 *  Skips the prompt in batch/CI mode or when `confirm` is unavailable. */
export function offerEnvSetup(result: EnvValidationResult): boolean {
    if (result.ok) return false;
    if (Config.get('ci') === 'true' || Config.get<boolean>('autoConfirm')) return false;
    try {
        return confirm('Configurações incompletas. Deseja configurar agora?');
    } catch (err) {
        rootLogger.debug(
            'Env setup prompt failed (assuming no): ' + (err instanceof Error ? err.message : String(err)),
        );
        return false;
    }
}

export function confirmDestructiveAction(action: string): boolean {
    return confirm(`Confirmar ${action}? (s/N)`);
}

export function sanitizeUrl(url: string): string {
    return url.replace(/(token|api_key|secret|password|access_token|client_secret)=[^&]+/gi, '$1=****');
}

/**
 * Graceful shutdown: logs message and exits after EXIT_DELAY_MS to allow pending I/O to flush.
 *
 * NOTA: NÃO use .unref() — .unref() permite que Node.js saia naturalmente com exit code 0
 * antes do setTimeout disparar process.exit(code). Em scripts não-interativos sem handles
 * mantendo o event loop vivo, o exit code correto nunca é aplicado, quebrando o blocking
 * do pre-push hook e de qualquer script que dependa do exit code.
 *
 * O timer sem .unref() mantém o event loop vivo por EXIT_DELAY_MS, tempo suficiente para
 * pending I/O (stdout, stderr) flusharem. Em contextos interativos, event loop já tem
 * handles (readline, stdin) que mantêm o processo vivo — timer sempre dispara.
 */
export function gracefulExit(code: ExitCode): void {
    setTimeout(() => process.exit(code), EXIT_DELAY_MS);
}

export function setupSigint(getIsBusy: (() => boolean) | null, onExit: (() => void) | null): void {
    const handler = _createSigintHandler(getIsBusy, onExit);
    process.on('SIGINT', handler);
}

function _createSigintHandler(getIsBusy: (() => boolean) | null, onExit: (() => void) | null): () => void {
    let confirming = false;
    let rl: readline.Interface | null = null;

    function _cleanupConfirm(): void {
        if (rl) {
            rl.close();
            rl = null;
        }
        confirming = false;
    }

    function _forceExit(): void {
        _cleanupConfirm();
        cleanupTempDirs();
        if (onExit) onExit();
        info('Até logo!');
        setTimeout(() => process.exit(ExitCode.OK), EXIT_DELAY_MS);
    }

    return function handler(): void {
        if (getIsBusy && getIsBusy()) {
            info('Operação em andamento. Use Ctrl+C novamente para forçar saída.');
            return;
        }
        if (confirming) {
            _forceExit();
            return;
        }
        process.removeListener('SIGINT', handler);
        confirming = true;
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const timeout = setTimeout(() => {
            _cleanupConfirm();
            info('Continuando...');
            process.on('SIGINT', handler);
        }, 10000);
        rl.question('Deseja sair? (s/N) ', (answer) => {
            try {
                clearTimeout(timeout);
                _cleanupConfirm();
                if (answer && answer.toLowerCase() === 's') {
                    _forceExit();
                } else {
                    info('Continuando...');
                    process.on('SIGINT', handler);
                }
            } catch (err) {
                rootLogger.debug('SIGINT handler cleanup: ' + (err instanceof Error ? err.message : String(err)));
                _cleanupConfirm();
                info('Continuando...');
                process.on('SIGINT', handler);
            }
        });
    };
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
    _printSessionCounters(sessionCounters);
    _printLastOperations(history);
    _tryPrintHealthScore();
    _printSessionLine(lastOperation, logPath);
    divider();
    const ok = sessionCounters.filter((c) => c.status === 'ok').length;
    const er = sessionCounters.filter((c) => c.status === 'error').length;
    rootLogger.writeFileOnly(
        'INFO',
        'Sessão encerrada. ' +
            (ok > 0 ? ok + ' ok, ' : '') +
            (er > 0 ? er + ' erro(s), ' : '') +
            'última: ' +
            (lastOperation || 'nenhuma'),
    );
}

function _printSessionCounters(sessionCounters: SessionCounter[]): void {
    const ok = sessionCounters.filter((c) => c.status === 'ok').length;
    const er = sessionCounters.filter((c) => c.status === 'error').length;
    if (ok > 0 || er > 0) {
        if (ok > 0) success(ok + ' operação(oes) concluída(s)');
        if (er > 0) error(er + ' operação(oes) com erro');
    }
}

function _printLastOperations(history?: HistoryEntry[]): void {
    if (!history || history.length === 0) return;
    const last5 = history.slice(-LAST_OPS_COUNT);
    info('Últimas operações:');
    last5.forEach((h) => {
        const icon = h.status === 'error' ? chalk.red('ERR') : chalk.green('OK');
        print(`  ${icon} ${h.op}: ${h.detail}`);
    });
}

function _tryPrintHealthScore(): void {
    try {
        const store = loadMetrics();
        if (store.runs.length >= 5) {
            const hs = calculateHealthScore(store);
            const gradeIcon =
                hs.grade === 'excellent'
                    ? '🟢'
                    : hs.grade === 'good'
                      ? '🟡'
                      : hs.grade === 'needs_attention'
                        ? '🟠'
                        : '🔴';
            const gateIcon = hs.qualityGate === 'pass' ? '✓' : '✗';
            info(`Saúde: ${hs.overall}/100 ${gradeIcon} · Quality Gate: ${gateIcon}`);
        }
    } catch (err) {
        rootLogger.debug('Health score unavailable: ' + (err instanceof Error ? err.message : String(err)));
    }
}

function _printSessionLine(lastOperation: string | null, logPath: string | null): void {
    if (lastOperation) info('Última operação: ' + lastOperation);
    if (logPath) info('Log: ' + logPath);
    const elapsed = Math.round((Date.now() - _sessionStart) / 1000);
    info('Sessão: ' + elapsed + 's');
}
