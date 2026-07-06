/**
 * Log Parser — Extrai resumo de testes de logs de CI.
 *
 * Último recurso na cascata de extração. Confidence ~60-70%.
 * Sempre que possível, prefira fontes estruturadas (CTRF, JUnit XML, Check Runs API).
 *
 * Limitações conhecidas:
 * - Códigos ANSI: regex falha silenciosamente — strip ANSI antes
 * - Output multi-linha: stack traces não capturados por regex single-line
 * - Formato entre versões: Vitest v1.x ≠ v2.x ≠ v3.x
 * - Localização: pytest em 134 idiomas — regex inglês falha em sistemas localizados
 * - Reporters customizados: dot ≠ spec — formato muda
 * - Truncamento de log: linha de summary pode ser cortada
 * - Catastrophic backtracking: evitar `.*` greedy em inputs grandes
 *
 * @module log-parser
 */

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
    return parseInt(input.substring(start + 1, end + 1), 10);
}

const FRAMEWORK_PATTERNS: Record<string, RegExp> = {
    vitest: /Tests\s+(\d+)\s+passed/,
    jest: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
    mocha: /passing/,
    pytest: /passed/,
};

interface FrameworkHandler {
    name: string;
    test: RegExp;
    extract: (match: RegExpExecArray) => {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
    };
}

const HANDLERS: FrameworkHandler[] = [
    {
        name: 'jest',
        test: FRAMEWORK_PATTERNS['jest'] as RegExp,
        extract: (m) => ({
            failed: parseInt(m[1] as string, 10),
            passed: parseInt(m[2] as string, 10),
            skipped: 0,
            total: parseInt(m[3] as string, 10),
        }),
    },
    {
        name: 'vitest',
        test: FRAMEWORK_PATTERNS['vitest'] as RegExp,
        extract: (m) => ({
            passed: parseInt(m[1] as string, 10),
            failed: 0,
            skipped: 0,
            total: parseInt(m[1] as string, 10),
        }),
    },
    {
        name: 'pytest',
        test: FRAMEWORK_PATTERNS['pytest'] as RegExp,
        extract: (m) => {
            if (!m.input.includes('===')) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const passed = extractNumberBefore(m.input, m.index);
            const failedIdx = m.input.indexOf('failed');
            if (failedIdx === -1) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const failed = extractNumberBefore(m.input, failedIdx);
            return {
                passed,
                failed,
                skipped: 0,
                total: passed + failed,
            };
        },
    },
    {
        name: 'mocha',
        test: FRAMEWORK_PATTERNS['mocha'] as RegExp,
        extract: (m) => {
            const passed = extractNumberBefore(m.input, m.index);
            const failingIdx = m.input.indexOf('failing');
            if (failingIdx === -1) return { passed: NaN, failed: NaN, skipped: NaN, total: NaN };
            const failed = extractNumberBefore(m.input, failingIdx);
            return {
                passed,
                failed,
                skipped: 0,
                total: passed + failed,
            };
        },
    },
];

const FAILURE_PATTERNS: RegExp[] = [
    /Error[:\s]+(.{10,200})/g,
    /Failure[:\s]+(.{10,200})/g,
    /AssertionError[:\s]+(.{10,200})/g,
];

export interface LogParseResult {
    testCounts?: {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
    };
    failures: string[];
    framework?: string;
}

function stripAnsi(input: string): string {
    let result = '';
    let i = 0;
    while (i < input.length) {
        if (input.charCodeAt(i) === 0x1b && input.charAt(i + 1) === '[') {
            i += 2;
            while (i < input.length) {
                const c = input.charAt(i);
                if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) break;
                i++;
            }
            i++;
        } else {
            result += input.charAt(i);
            i++;
        }
    }
    return result;
}

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

export function parseTestSummaryFromLogs(logText: string): LogParseResult {
    if (!logText || logText.trim().length === 0) {
        return { failures: [] };
    }

    const cleanLog = stripAnsi(logText);
    const failures = extractFailures(logText);

    const goCounts = parseGoTest(cleanLog);
    if (goCounts) {
        return {
            testCounts: { ...goCounts, skipped: 0 },
            failures,
            framework: 'goTest',
        };
    }

    for (const handler of HANDLERS) {
        handler.test.lastIndex = 0;
        const match = handler.test.exec(cleanLog);
        if (match) {
            const testCounts = handler.extract(match);
            if (Number.isFinite(testCounts.passed) && Number.isFinite(testCounts.total)) {
                return {
                    testCounts,
                    failures,
                    framework: handler.name,
                };
            }
        }
    }

    return { failures };
}
