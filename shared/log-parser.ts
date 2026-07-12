/**
 * Log Parser — Extrai resumo de testes de logs de CI.
 *
 * ULTIMO RECURSO na cascata de extracao (apos Camadas 1-6 estruturadas:
 * CTRF, JUnit XML, Check Runs API, Artifacts, Xray). Confidence ~0.6 (log-based,
 * last-resort). Sempre que possivel, prefira fontes estruturadas.
 *
 * Principios (AGENTS SS24 / SS25):
 * - NUNCA mascarar dado ausente como zero: contagem nao extraivel -> undefined, nao {passed:0}.
 * - NaN/Infinity NUNCA passam silenciosamente: guards explicitos em toda extracao numerica.
 * - Erros NUNCA silenciosos: ausencia de dado e explicita, nao degradacao discreta.
 *
 * @module log-parser
 */

import type { FailureRecord } from './types/data-hub.js';

// ===== Safeguard helpers (AGENTS SS24.1) =====

/** Guard: numero inteiro nao-negativo e finito. */
function isFiniteCount(value: number): value is number {
    return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

/** Extrai inteiro de uma substring; retorna NaN se invalido (nunca silencia). */
function safeInt(raw: string | undefined): number {
    if (raw == null) return NaN;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : NaN;
}

function extractNumberBefore(input: string, keywordIdx: number): number {
    let end = keywordIdx - 1;
    while (end >= 0) {
        const ch = input.charAt(end);
        if (ch !== ' ') break;
        end--;
    }
    let start = end;
    while (start >= 0) {
        const ch = input.charAt(start);
        if (ch < '0' || ch > '9') break;
        start--;
    }
    if (start === end) return NaN;
    return safeInt(input.substring(start + 1, end + 1));
}

// ===== L4.3 — stripAnsi endurecido (CSI + OSC) =====

/**
 * Remove codigos de escape ANSI: CSI (ESC[...<final>) e OSC (ESC]...<BEL|ST>).
 * Entrada truncada (sem terminador) e consumida ate o fim sem lancar.
 */
export function stripAnsi(input: string): string {
    if (!input) return '';
    let result = '';
    let i = 0;
    const n = input.length;
    while (i < n) {
        if (input.charCodeAt(i) !== 0x1b) {
            result += input.charAt(i);
            i++;
            continue;
        }
        if (input.charAt(i + 1) === ']') {
            i = skipOsc(input, i, n);
        } else {
            i = skipCsi(input, i, n);
        }
    }
    return result;
}

/** Consome uma sequencia OSC (ESC ] ... BEL ou ST) retornando o indice apos o terminador. */
function skipOsc(input: string, i: number, n: number): number {
    const esc = String.fromCharCode(27);
    let j = i + 2;
    while (j < n && input.charCodeAt(j) !== 0x07) {
        if (input.charAt(j) === esc && input.charAt(j + 1) === '\\') break;
        j++;
    }
    if (input.charCodeAt(j) === 0x07) return j + 1;
    if (input.charAt(j) === esc && input.charAt(j + 1) === '\\') return j + 2;
    return j;
}

/** Consome uma sequencia CSI (ESC [ ... byte final 0x40-0x7E) retornando o indice apos o final. */
function skipCsi(input: string, i: number, n: number): number {
    let j = i + 1;
    if (input.charAt(j) === '[') j++;
    while (j < n) {
        const cc = input.charCodeAt(j);
        if (cc >= 0x40 && cc <= 0x7e) return j + 1;
        j++;
    }
    return j;
}

// ===== L4.2 — Registry version-aware (framework/versao) =====

interface FrameworkHandler {
    name: string;
    test: RegExp;
    extract: (m: RegExpExecArray) => {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
    };
}

const HANDLERS: FrameworkHandler[] = [
    {
        name: 'jest',
        test: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
        extract: (m) => ({
            failed: safeInt(m[1]),
            passed: safeInt(m[2]),
            skipped: 0,
            total: safeInt(m[3]),
        }),
    },
    {
        name: 'vitest',
        test: /Tests\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/,
        extract: (m) => {
            const failed = m[1] ? safeInt(m[1]) : 0;
            const passed = safeInt(m[2]);
            return { failed, passed, skipped: 0, total: passed + failed };
        },
    },
    {
        name: 'dotnet',
        test: /Passed!\s+- Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/,
        extract: (m) => ({
            failed: safeInt(m[1]),
            passed: safeInt(m[2]),
            skipped: safeInt(m[3]),
            total: safeInt(m[4]),
        }),
    },
    {
        name: 'pytest',
        test: /passed/,
        extract: (m) => {
            if (!m.input.includes('===')) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const passed = extractNumberBefore(m.input, m.index);
            const failedIdx = m.input.indexOf('failed');
            if (failedIdx === -1) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const failed = extractNumberBefore(m.input, failedIdx);
            return { passed, failed, skipped: 0, total: passed + failed };
        },
    },
    {
        name: 'mocha',
        test: /passing/,
        extract: (m) => {
            const passed = extractNumberBefore(m.input, m.index);
            const failingIdx = m.input.indexOf('failing');
            if (failingIdx === -1) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const failed = extractNumberBefore(m.input, failingIdx);
            return { passed, failed, skipped: 0, total: passed + failed };
        },
    },
];

/** L4.2 — Detecta framework + versao a partir de uma assinatura de log (provenance metadata). */
const FRAMEWORK_VERSION_RE = /(vitest|jest|mocha|pytest|go\s+test|dotnet)\s+v?(\d+\.\d+\.\d+)/i;
export function detectFrameworkVersion(log: string): { id: string; version: string } | null {
    const m = FRAMEWORK_VERSION_RE.exec(log);
    if (!m) return null;
    const id = m[1];
    const version = m[2];
    if (!id || !version) return null;
    return { id: id.toLowerCase().replace(/\s+/g, ''), version };
}

// ===== L4.1 — NaN guards / invariante de contagem =====

function isValidCounts(c: { passed: number; failed: number; skipped: number; total: number }): boolean {
    return isFiniteCount(c.passed) && isFiniteCount(c.failed) && isFiniteCount(c.skipped) && isFiniteCount(c.total);
}

// ===== L4.4 — categorizeFailure (buckets de causa-raiz) =====

const FAILED_STATUSES = new Set(['assertion', 'known-bug']);

/** L4.4 — Classifica a causa-raiz de uma falha em bucket canonico. */
export function categorizeFailure(message: string): string {
    const m = message.toLowerCase();
    if (/timeout|timed out|etimedout|deadline exceeded/.test(m)) return 'timeout';
    if (/econnrefused|enotfound|network|fetch failed|socket hang|getaddrinfo|eai_/.test(m)) return 'network';
    if (/panic:|fatal error|segfault|sigsegv|runtime error|nil pointer/.test(m)) return 'panic';
    if (
        /enoent|cannot find module|command not found|permission denied|no such file or directory|module not found/.test(
            m,
        )
    )
        return 'environment';
    if (/known[-_ ]?bug|bug-\d+|issue-\d+|knownbug/.test(m)) return 'known-bug';
    // Default: defeito de produto (mais comum).
    return 'assertion';
}

function statusForCategory(category: string): 'failed' | 'broken' {
    return FAILED_STATUSES.has(category) ? 'failed' : 'broken';
}

// ===== L4.5 — Localizacao best-effort (file/line a partir do trace) =====

const PY_FRAME_RE = /File "([^"]+)", line (\d+)/;
const GENERIC_FRAME_RE = /([^\s]*)/;

interface FrameLoc {
    file?: string;
    line?: number;
}

function lineFromToken(token: string): FrameLoc {
    const digitMatch = /\d+/.exec(token);
    if (!digitMatch) return { file: token };
    const file = token.slice(0, digitMatch.index).replace(/:$/, '');
    if (file.length === 0) return { file: token };
    return { file, line: safeInt(digitMatch[0]) };
}

export function detectFileLine(trace: string): FrameLoc {
    if (!trace) return {};
    const open = trace.indexOf('(');
    const close = trace.indexOf(')');
    if (open !== -1 && close > open) {
        const inner = trace.slice(open + 1, close);
        const firstColon = inner.indexOf(':');
        if (firstColon !== -1) {
            const file = inner.slice(0, firstColon);
            const lineToken = inner.slice(firstColon + 1).split(':')[0];
            return { file, line: safeInt(lineToken) };
        }
        return { file: inner };
    }
    const py = PY_FRAME_RE.exec(trace);
    if (py && py[1]) return { file: py[1], line: safeInt(py[2]) };
    const gen = GENERIC_FRAME_RE.exec(trace);
    if (gen && gen[1]) return lineFromToken(gen[1]);
    return {};
}

// ===== L4.4 — Extracao de blocos de falha multi-linha =====

const ERROR_HEADER_RE =
    /^(?:[✔✓×✕❌⨯✘✗]\s*)?[\w-]*(?:Error|Exception|panic|Traceback|Failure|Ошибка|错误|Erreur|Fehler)[^:]*:/;
const STACK_LINE_RE = /^\s*(?:at\s|File\s+"|goroutine\s|\t)|^\[signal|^[A-Za-z_][\w./]*\(\)/;

interface RawBlock {
    message: string;
    trace: string[];
}

function extractFailureBlocks(cleanLog: string): RawBlock[] {
    const lines = cleanLog.split('\n');
    const blocks: RawBlock[] = [];
    let current: RawBlock | null = null;

    for (const line of lines) {
        if (ERROR_HEADER_RE.test(line)) {
            if (current) blocks.push(current);
            current = { message: line.trim(), trace: [] };
        } else if (current) {
            if (STACK_LINE_RE.test(line) || line.trim() === '') {
                current.trace.push(line);
            } else {
                blocks.push(current);
                current = null;
            }
        }
    }
    if (current) blocks.push(current);

    return blocks;
}

const LOG_CONFIDENCE = 0.6;

/**
 * L4.4 — Extrai falhas de um log de CI como FailureRecord[] canonico.
 * Ultimo recurso: confidence 0.6, source 'log'. Nunca retorna null (array vazio explicito).
 */
export function parseFailureRecordsFromLogs(logText: string): FailureRecord[] {
    if (!logText || logText.trim().length === 0) return [];
    const cleanLog = stripAnsi(logText);
    const blocks = extractFailureBlocks(cleanLog);

    const records: FailureRecord[] = [];
    for (const block of blocks) {
        const message = block.message;
        const trace = block.trace.join('\n').trim();
        const category = categorizeFailure(message);
        const loc = detectFileLine(trace);
        records.push({
            name: message,
            status: statusForCategory(category),
            message,
            trace: trace.length > 0 ? trace : undefined,
            file: loc.file,
            line: loc.line,
            category,
            confidence: LOG_CONFIDENCE,
            source: 'log',
        });
    }
    return records;
}

// ===== Compatibilidade (failures string[]) =====

const FAILURE_PATTERNS: RegExp[] = [
    /Error[:\s]+(.{10,200})/g,
    /Failure[:\s]+(.{10,200})/g,
    /AssertionError[:\s]+(.{10,200})/g,
];

function extractFailures(logText: string): string[] {
    const failures: string[] = [];
    const seen = new Set<string>();

    for (const pattern of FAILURE_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(logText)) !== null) {
            const msg = match[1]?.trim();
            if (msg && msg.length >= 10 && !seen.has(msg)) {
                seen.add(msg);
                failures.push(msg);
            }
        }
    }

    return failures;
}

function parseGoTest(cleanLog: string): { passed: number; failed: number; total: number } | null {
    const goPattern = /^(ok|FAIL)\t.+/gm;
    goPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let okCount = 0;
    let failCount = 0;
    let found = false;
    while ((match = goPattern.exec(cleanLog)) !== null) {
        found = true;
        if (match[1] === 'ok') okCount++;
        else if (match[1] === 'FAIL') failCount++;
    }
    if (!found) return null;
    return { passed: okCount, failed: failCount, total: okCount + failCount };
}

export interface LogParseResult {
    testCounts?: {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
    };
    failures: string[];
    failureRecords: FailureRecord[];
    framework?: string;
}

/**
 * Parses a CI test log summary. Mantem compatibilidade (failures string[])
 * e adiciona failureRecords (forma canonica). Contagens ausentes -> undefined
 * (NUNCA mascaradas como zero — AGENTS SS25).
 */
export function parseTestSummaryFromLogs(logText: string): LogParseResult {
    if (!logText || logText.trim().length === 0) {
        return { failures: [], failureRecords: [] };
    }

    const cleanLog = stripAnsi(logText);
    const failures = extractFailures(logText);
    const failureRecords = parseFailureRecordsFromLogs(logText);

    const goCounts = parseGoTest(cleanLog);
    if (goCounts) {
        return {
            testCounts: { ...goCounts, skipped: 0 },
            failures,
            failureRecords,
            framework: 'goTest',
        };
    }

    for (const handler of HANDLERS) {
        handler.test.lastIndex = 0;
        const match = handler.test.exec(cleanLog);
        if (match) {
            const testCounts = handler.extract(match);
            if (isValidCounts(testCounts)) {
                return {
                    testCounts,
                    failures,
                    failureRecords,
                    framework: handler.name,
                };
            }
        }
    }

    return { failures, failureRecords };
}
