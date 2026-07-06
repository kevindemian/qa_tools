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

const FRAMEWORK_PATTERNS: Record<string, RegExp> = {
    vitest: /Tests\s+(\d+)\s+passed/,
    jest: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
    mocha: /(\d+)\s+passing.*?(\d+)\s+failing/s,
    pytest: /={2,}\s+(\d+)\s+passed.*?(\d+)\s+failed/,
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
        test: FRAMEWORK_PATTERNS['jest']!,
        extract: (m) => ({
            failed: parseInt(m[1]!, 10),
            passed: parseInt(m[2]!, 10),
            skipped: 0,
            total: parseInt(m[3]!, 10),
        }),
    },
    {
        name: 'vitest',
        test: FRAMEWORK_PATTERNS['vitest']!,
        extract: (m) => ({
            passed: parseInt(m[1]!, 10),
            failed: 0,
            skipped: 0,
            total: parseInt(m[1]!, 10),
        }),
    },
    {
        name: 'pytest',
        test: FRAMEWORK_PATTERNS['pytest']!,
        extract: (m) => ({
            passed: parseInt(m[1]!, 10),
            failed: parseInt(m[2]!, 10),
            skipped: 0,
            total: parseInt(m[1]!, 10) + parseInt(m[2]!, 10),
        }),
    },
    {
        name: 'mocha',
        test: FRAMEWORK_PATTERNS['mocha']!,
        extract: (m) => ({
            passed: parseInt(m[1]!, 10),
            failed: parseInt(m[2]!, 10) || 0,
            skipped: 0,
            total: parseInt(m[1]!, 10) + (parseInt(m[2]!, 10) || 0),
        }),
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
    return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
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
