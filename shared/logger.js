// @ts-check
const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const PREFIXES = { DEBUG: '\u00b7', INFO: 'i', WARN: '!', ERROR: 'ERR' };
const COLORS = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  RESET: '\x1b[0m'
};
const SECRET_RE = /token|secret|key|password|authorization/i;
const MAX_LOG_SIZE = parseInt(process.env.LOG_MAX_SIZE || '', 10) || 5 * 1024 * 1024;

function maskValue(v) {
  if (typeof v !== 'string') return v;
  return v.length > 8 ? v.slice(0, 4) + '****' : '****';
}

function maskDeep(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(masked)) {
    if (SECRET_RE.test(key)) masked[key] = maskValue(masked[key]);
  }
  return masked;
}

class Logger {
  constructor(context = {}) {
    this.context = context;
    this._logDir = null;
    this._filePathCached = null;
    this._fileError = false;
    this._bytesWritten = 0;
  }

  _ensureDir() {
    if (this._fileError) return false;
    if (process.env.LOG_FILE !== 'true') return false;

    const logDir = process.env.LOG_DIR || 'logs';
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
      console.error(`[logger] Falha ao criar diretório de log: ${err.message}`);
      return false;
    }
  }

  _rotateIfNeeded() {
    if (!this._filePathCached || this._bytesWritten < MAX_LOG_SIZE) return;
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
      console.error(`[logger] Falha ao rotacionar log: ${err.message}`);
    }
  }

  _writeConsole(level, msg, data) {
    const levelNum = LEVELS[level] ?? 1;
    const envLevel = process.env.LOG_LEVEL || 'INFO';
    const envLevelNum = LEVELS[envLevel] ?? 1;
    if (levelNum < envLevelNum) return;

    const prefix = PREFIXES[level] || '?';
    const color = COLORS[level] || '';
    const reset = COLORS.RESET || '\x1b[0m';
    let text = `${color}${prefix}${reset} ${msg}`;

    if (data && level === 'ERROR') {
      const dataStr = JSON.stringify(data);
      if (dataStr.length < 160) text += `  ${color}${dataStr}${reset}`;
    }

    if (level === 'ERROR') {
      console.error(text);
    } else if (level === 'WARN') {
      console.warn(text);
    } else {
      console.log(text);
    }
  }

  _writeFile(level, msg, data) {
    if (!this._ensureDir()) return;

    const timestamp = new Date().toISOString();
    const ctxKeys = Object.keys(this.context);
    const ctxStr = ctxKeys.length > 0
      ? ' [' + ctxKeys.map(k => this.context[k]).join('] [') + ']'
      : '';
    let dataStr = '';
    if (data) {
        try {
            dataStr = ' | ' + JSON.stringify(maskDeep(data));
        } catch (_) {
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
      console.error(`[logger] Falha ao escrever no arquivo de log: ${err.message}`);
    }
  }

  _write(level, msg, data) {
    this._writeConsole(level, msg, data);
    this._writeFile(level, msg, data);
  }

    /** @param {Object} extra @returns {Logger} */
  child(extra) {
    return new Logger({ ...this.context, ...extra });
  }

  /** Escreve apenas no arquivo de log, sem saida no console */
  writeFileOnly(level, msg) {
    this._writeFile(level, msg);
  }

  /** @param {string} msg @param {Object} [data] */
  debug(msg, data) { this._write('DEBUG', msg, data); }
  /** @param {string} msg @param {Object} [data] */
  info(msg, data) { this._write('INFO', msg, data); }
  /** @param {string} msg @param {Object} [data] */
  warn(msg, data) { this._write('WARN', msg, data); }
  /** @param {string} msg @param {Object} [data] */
  error(msg, data) { this._write('ERROR', msg, data); }

  get filePath() {
    if (process.env.LOG_FILE !== 'true') return null;
    this._ensureDir();
    return this._filePathCached;
  }
}

const rootLogger = new Logger();

module.exports = { Logger, rootLogger, maskDeep, MAX_LOG_SIZE };
