import { chalk } from './deps.js';
import fs from 'fs';
import path from 'path';
import Config from './config-accessor.js';
import { formatDateISO } from './date-utils.js';

/** Numeric severity: DEBUG < INFO < WARN < ERROR. */
const LEVELS = new Map([
    ['DEBUG', 0],
    ['INFO', 1],
    ['WARN', 2],
    ['ERROR', 3],
]);
const PREFIXES = new Map([
    ['DEBUG', '\u00b7'],
    ['INFO', 'i'],
    ['WARN', '!'],
    ['ERROR', 'ERR'],
]);
const COLOR_FNS = new Map<string, (s: string) => string>([
    ['DEBUG', chalk.cyan],
    ['INFO', chalk.green],
    ['WARN', chalk.yellow],
    ['ERROR', chalk.red],
]);
const SECRET_RE = /token|secret|key|password|authorization/i;
const MASK_MIN_LENGTH = 8;
const MASK_VISIBLE_CHARS = 4;
const CONSOLE_DATA_MAX_LENGTH = 160;

function maskValue(v: unknown): unknown {
    if (typeof v !== 'string') return v;
    return v.length > MASK_MIN_LENGTH ? v.slice(0, MASK_VISIBLE_CHARS) + '****' : '****';
}

/** Recursively mask sensitive fields (token, secret, key, password, authorization) in an object.
 * Strings shorter than 8 chars are fully masked; longer ones keep the first 4 chars visible.
 * Object and array values are recursively inspected so that sensitive keys at any depth are masked.
 * @returns A new array/object with masked values — original is not mutated. */
export function maskDeep(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => maskDeep(item));
    const entries: [string, unknown][] = [];
    for (const [key, val] of Object.entries(obj)) {
        if (SECRET_RE.test(key)) {
            entries.push([key, typeof val === 'string' ? maskValue(val) : maskDeep(val)]);
        } else if (Array.isArray(val)) {
            entries.push([key, val.map((item) => maskDeep(item))]);
        } else if (typeof val === 'object' && val !== null) {
            entries.push([key, maskDeep(val)]);
        } else {
            entries.push([key, val]);
        }
    }
    return Object.fromEntries(entries);
}

/** Structured logger with console + file output, level filtering, rotation, and context binding. */
export class Logger {
    context: Record<string, unknown>;
    _logDir: string | null;
    _filePathCached: string | null;
    _fileError: boolean;
    _bytesWritten: number;
    _maxLogSize: number;
    _config: Config | null;

    /** @param context — Key-value pairs appended to every log line (e.g. `{ session: 'jira' }`).
     * @param config — Optional config; falls back to {@link Config} globals when omitted. */
    constructor(context: Record<string, unknown> = {}, config?: Config) {
        this.context = context;
        this._logDir = null;
        this._filePathCached = null;
        this._fileError = false;
        this._bytesWritten = 0;
        this._maxLogSize = config?.get('logMaxSize') ?? Config.get('logMaxSize');
        this._config = config ?? null;
    }

    _ensureDir(): boolean {
        const logFile = this._config?.get('logFile') ?? Config.get('logFile');
        if (!logFile) return false;

        const logDir = this._config?.get('logDir') ?? Config.get('logDir');
        if (this._logDir == logDir && this._filePathCached && fs.existsSync(this._filePathCached)) {
            return true;
        }
        if (!logDir) return false;

        try {
            if (!fs.existsSync(logDir)) fs.mkdirSync(path.resolve(logDir), { recursive: true });
            this._logDir = logDir;
            const date = formatDateISO();
            this._filePathCached = path.join(logDir, `qa-tools-${date}.log`);
            this._initFileBytes();
            this._fileError = false;
            return true;
        } catch (err) {
            this._fileError = true;
            process.stderr.write(
                `[logger] Falha ao criar diretório de log: ${String(err)}. Verifique permissões e espaço em disco.\n`,
            );
            return false;
        }
    }

    _initFileBytes(): void {
        if (!this._filePathCached) return;
        try {
            const stat = fs.statSync(path.resolve(this._filePathCached));
            this._bytesWritten = stat.size;
        } catch (err) {
            if (!('code' in Object(err) && (err as { code?: string }).code === 'ENOENT')) {
                process.stderr.write(
                    `[logger] Falha ao verificar arquivo de log: ${String(err)}. Verifique permissões e integridade do diretório.\n`,
                );
            }
        }
    }

    _rotateIfNeeded(): void {
        if (!this._filePathCached || this._bytesWritten < this._maxLogSize) return;
        const dir = path.dirname(this._filePathCached);
        const ext = path.extname(this._filePathCached);
        const base = path.basename(this._filePathCached, ext);
        let seq = 1;
        while (fs.existsSync(path.join(dir, `${base}.${seq}${ext}`))) {
            seq++;
        }
        const rotated = path.join(dir, `${base}.${seq}${ext}`);
        try {
            fs.renameSync(path.resolve(this._filePathCached), rotated);
            this._bytesWritten = 0;
        } catch (err) {
            process.stderr.write(
                `[logger] Falha ao rotacionar log: ${String(err)}. Verifique permissões e espaço em disco.\n`,
            );
        }
    }

    _writeConsole(level: string, msg: string, data?: unknown): void {
        const levelNum = LEVELS.get(level) ?? 1;
        const envLevelRaw = this._config?.get('logLevel') ?? Config.get('logLevel') ?? 'info';
        const envLevelNum = LEVELS.get(String(envLevelRaw).toUpperCase()) ?? 1;
        if (levelNum < envLevelNum) return;

        const prefix = PREFIXES.get(level) ?? '?';
        const colorFn = COLOR_FNS.get(level) ?? chalk;
        let text = colorFn(prefix) + ' ' + msg;

        if (data && level === 'ERROR') {
            const dataStr = JSON.stringify(data);
            if (dataStr.length < CONSOLE_DATA_MAX_LENGTH) text += '  ' + colorFn(dataStr);
        }

        if (level === 'ERROR') {
            process.stderr.write(text + '\n');
        } else if (level === 'WARN') {
            process.stderr.write(text + '\n');
        } else {
            process.stdout.write(text + '\n');
        }
    }

    _writeFile(level: string, msg: string, data?: unknown): void {
        const levelNum = LEVELS.get(level) ?? 1;
        const envLevelRaw = this._config?.get('logLevel') ?? Config.get('logLevel') ?? 'info';
        const envLevelNum = LEVELS.get(String(envLevelRaw).toUpperCase()) ?? 1;
        if (levelNum < envLevelNum) return;

        this._fileError = false;
        if (!this._ensureDir()) return;

        const timestamp = new Date().toISOString();
        const ctxKeys = Object.keys(this.context);
        const ctxEntries = Object.entries(this.context);
        const ctxStr = ctxKeys.length > 0 ? ' [' + ctxEntries.map(([, v]) => v).join('] [') + ']' : '';
        let dataStr = '';
        if (data) {
            try {
                dataStr = ' | ' + JSON.stringify(maskDeep(data));
            } catch (err) {
                dataStr = ' | [data serialization error]';
                process.stderr.write('[logger] Data serialization failed: ' + String(err) + '\n');
            }
        }
        const line = `[${timestamp}] [${level}]${ctxStr} ${msg}${dataStr}\n`;

        if (!this._filePathCached) return;
        this._rotateIfNeeded();
        try {
            fs.appendFileSync(path.resolve(this._filePathCached), line);
            this._bytesWritten += Buffer.byteLength(line);
        } catch (err) {
            this._fileError = true;
            process.stderr.write(
                `[logger] Falha ao escrever no arquivo de log: ${String(err)}. Verifique permissões, espaço em disco e sistema de arquivos.\n`,
            );
        }
    }

    _write(level: string, msg: string, data?: unknown): void {
        this._writeConsole(level, msg, data);
        this._writeFile(level, msg, data);
    }

    /** Create a child logger with merged context.
     * The child inherits the parent's context and adds/replaces keys from `extra`.
     * @example `logger.child({ operation: 'csv-import' }).info('started')` */
    child(extra: Record<string, unknown>): Logger {
        return new Logger({ ...this.context, ...extra }, this._config ?? undefined);
    }

    /** Write to file only — no console output. Useful for structured logs not meant for the user. */
    writeFileOnly(level: string, msg: string): void {
        this._writeFile(level, msg);
    }

    /** Log at DEBUG severity. */
    debug(msg: string, data?: unknown): void {
        this._write('DEBUG', msg, data);
    }
    /** Log at INFO severity. */
    info(msg: string, data?: unknown): void {
        this._write('INFO', msg, data);
    }
    /** Log at WARN severity. */
    warn(msg: string, data?: unknown): void {
        this._write('WARN', msg, data);
    }
    /** Log at ERROR severity. */
    error(msg: string, data?: unknown): void {
        this._write('ERROR', msg, data);
    }

    /** Get the resolved log file path (triggers dir creation on first access).
     * @returns Full path to `qa-tools-YYYY-MM-DD.log` or `null` if file logging is disabled. */
    get filePath(): string | null {
        const logFile = this._config?.get('logFile') ?? Config.get('logFile');
        if (!logFile) return null;
        this._ensureDir();
        return this._filePathCached;
    }
}

/** Global singleton logger with empty context. Prefer `rootLogger.child(...)` for scoped logging. */
export const rootLogger = new Logger();
