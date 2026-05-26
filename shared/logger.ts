import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import Config from './config';

const LEVELS: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const PREFIXES: Record<string, string> = { DEBUG: '\u00b7', INFO: 'i', WARN: '!', ERROR: 'ERR' };
const COLOR_FNS: Record<string, (s: string) => string> = {
    DEBUG: chalk.cyan,
    INFO: chalk.green,
    WARN: chalk.yellow,
    ERROR: chalk.red,
};
const SECRET_RE = /token|secret|key|password|authorization/i;
const MASK_MIN_LENGTH = 8;
const MASK_VISIBLE_CHARS = 4;
const CONSOLE_DATA_MAX_LENGTH = 160;

function maskValue(v: unknown): unknown {
    if (typeof v !== 'string') return v;
    return v.length > MASK_MIN_LENGTH ? v.slice(0, MASK_VISIBLE_CHARS) + '****' : '****';
}

export function maskDeep(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    const masked: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const val = (obj as Record<string, unknown>)[key];
        if (Array.isArray(val)) {
            masked[key] = val.map((item) => maskDeep(item));
        } else if (SECRET_RE.test(key)) {
            masked[key] = maskValue(val);
        } else {
            masked[key] = val;
        }
    }
    return masked;
}

export class Logger {
    context: Record<string, unknown>;
    _logDir: string | null;
    _filePathCached: string | null;
    _fileError: boolean;
    _bytesWritten: number;
    _maxLogSize: number;
    _config: Config | null;

    constructor(context: Record<string, unknown> = {}, config?: Config) {
        this.context = context;
        this._logDir = null;
        this._filePathCached = null;
        this._fileError = false;
        this._bytesWritten = 0;
        this._maxLogSize = config?.logMaxSize ?? Config.logMaxSize;
        this._config = config ?? null;
    }

    _ensureDir(): boolean {
        if (this._fileError) return false;
        const logFile = this._config?.logFile ?? Config.logFile;
        if (!logFile) return false;

        const logDir = this._config?.logDir ?? Config.logDir;
        if (this._logDir === logDir && this._filePathCached) return true;

        try {
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            this._logDir = logDir;
            const date = new Date().toISOString().split('T')[0];
            this._filePathCached = path.join(logDir, `qa-tools-${date}.log`);
            try {
                const stat = fs.statSync(this._filePathCached);
                this._bytesWritten = stat.size;
            } catch {
                this._bytesWritten = 0;
            }
            return true;
        } catch (err) {
            this._fileError = true;
            console.error(`[logger] Falha ao criar diretório de log: ${(err as Error).message}`);
            return false;
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
            fs.renameSync(this._filePathCached, rotated);
            this._bytesWritten = 0;
        } catch (err) {
            console.error(`[logger] Falha ao rotacionar log: ${(err as Error).message}`);
        }
    }

    _writeConsole(level: string, msg: string, data?: unknown): void {
        const levelNum = LEVELS[level] ?? 1;
        const envLevel = this._config?.logLevel ?? Config.logLevel;
        const envLevelNum = LEVELS[envLevel] ?? 1;
        if (levelNum < envLevelNum) return;

        const prefix = PREFIXES[level] || '?';
        const colorFn = COLOR_FNS[level] || chalk;
        let text = colorFn(prefix) + ' ' + msg;

        if (data && level === 'ERROR') {
            const dataStr = JSON.stringify(data);
            if (dataStr.length < CONSOLE_DATA_MAX_LENGTH) text += '  ' + colorFn(dataStr);
        }

        if (level === 'ERROR') {
            console.error(text);
        } else if (level === 'WARN') {
            console.warn(text);
        } else {
            console.log(text);
        }
    }

    _writeFile(level: string, msg: string, data?: unknown): void {
        if (!this._ensureDir()) return;

        const timestamp = new Date().toISOString();
        const ctxKeys = Object.keys(this.context);
        const ctxStr = ctxKeys.length > 0 ? ' [' + ctxKeys.map((k) => this.context[k]).join('] [') + ']' : '';
        let dataStr = '';
        if (data) {
            try {
                dataStr = ' | ' + JSON.stringify(maskDeep(data));
            } catch {
                dataStr = ' | [data serialization error]';
            }
        }
        const line = `[${timestamp}] [${level}]${ctxStr} ${msg}${dataStr}\n`;

        if (!this._filePathCached) return;
        this._rotateIfNeeded();
        try {
            fs.appendFileSync(this._filePathCached, line);
            this._bytesWritten += Buffer.byteLength(line);
        } catch (err) {
            this._fileError = true;
            console.error(`[logger] Falha ao escrever no arquivo de log: ${(err as Error).message}`);
        }
    }

    _write(level: string, msg: string, data?: unknown): void {
        this._writeConsole(level, msg, data);
        this._writeFile(level, msg, data);
    }

    child(extra: Record<string, unknown>): Logger {
        return new Logger({ ...this.context, ...extra }, this._config ?? undefined);
    }

    writeFileOnly(level: string, msg: string): void {
        this._writeFile(level, msg);
    }

    debug(msg: string, data?: unknown): void {
        this._write('DEBUG', msg, data);
    }
    info(msg: string, data?: unknown): void {
        this._write('INFO', msg, data);
    }
    warn(msg: string, data?: unknown): void {
        this._write('WARN', msg, data);
    }
    error(msg: string, data?: unknown): void {
        this._write('ERROR', msg, data);
    }

    get filePath(): string | null {
        const logFile = this._config?.logFile ?? Config.logFile;
        if (!logFile) return null;
        this._ensureDir();
        return this._filePathCached;
    }
}

export const rootLogger = new Logger();
