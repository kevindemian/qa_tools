/**
 * JUnit XML Parser — Parseia relatórios JUnit XML para FlatTest[].
 *
 * Usa fast-xml-parser (TypeScript nativo, 2-9x mais rápido que xml2js).
 * Suporta:
 * - <testsuite> único
 * - <testsuites> múltiplos
 * - <testcase> com failures, errors, skipped
 * - <failure> com message e stack trace
 *
 * @module junit-xml-parser
 */

import { XMLParser } from 'fast-xml-parser';
import { rootLogger } from './logger.js';
import { extractErrorMessage } from './ui/prompt-errors.js';

interface JUnitTestcase {
    '@_name'?: string;
    '@_classname'?: string;
    '@_time'?: string | number;
    failure?: { [key: string]: unknown } | Array<{ [key: string]: unknown }> | string;
    error?: { [key: string]: unknown } | Array<{ [key: string]: unknown }> | string;
    skipped?: { [key: string]: unknown } | string;
    'system-out'?: string;
    'system-err'?: string;
}

interface JUnitTestsuite {
    '@_name'?: string;
    '@_tests'?: string | number;
    '@_failures'?: string | number;
    '@_errors'?: string | number;
    '@_skipped'?: string | number;
    '@_time'?: string | number;
    testcase?: JUnitTestcase | JUnitTestcase[];
}

interface JUnitRoot {
    testsuite?: JUnitTestsuite | JUnitTestsuite[];
    testsuites?: {
        testsuite?: JUnitTestsuite | JUnitTestsuite[];
    };
}

export interface FlatTestEntry {
    title: string;
    classname: string;
    time: number;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    message?: string;
    stackTrace?: string;
}

export interface JUnitParseResult {
    tests: FlatTestEntry[];
    stats: { passed: number; failed: number; skipped: number; total: number; duration: number };
}

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (_name: string, _jPathOrMatcher: unknown, _isLeafNode?: boolean, _isAttribute?: boolean) => {
        const jpath = typeof _jPathOrMatcher === 'string' ? _jPathOrMatcher : '';
        return jpath === 'testsuites.testsuite' || jpath === 'testsuite.testcase';
    },
});

function normalizeTime(time: string | number | undefined): number {
    if (time == null) return 0;
    const num = typeof time === 'number' ? time : parseFloat(time);
    return Number.isFinite(num) ? num : 0;
}

function extractFirstAttributeValue(
    item: { [key: string]: unknown } | Array<{ [key: string]: unknown }> | string | undefined,
): string | undefined {
    if (item == null) return undefined;
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) {
        for (const el of item) {
            const msg = el['@_message'];
            if (typeof msg === 'string') return msg;
        }
        return undefined;
    }
    return item['@_message'] as string | undefined;
}

function extractStackTrace(
    item: { [key: string]: unknown } | Array<{ [key: string]: unknown }> | string | undefined,
): string | undefined {
    if (item == null) return undefined;
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) {
        const texts = item
            .map((el) => {
                const txt = el['#text'];
                return typeof txt === 'string' ? txt : undefined;
            })
            .filter((s): s is string => s != null);
        return texts.length > 0 ? texts.join('\n') : undefined;
    }
    const txt = item['#text'];
    return typeof txt === 'string' ? txt : undefined;
}

function parseTestcase(tc: JUnitTestcase): FlatTestEntry {
    const title = tc['@_name'] ?? '';
    const classname = tc['@_classname'] ?? '';
    const time = normalizeTime(tc['@_time']);

    if (tc.failure != null || tc.error != null) {
        const errItem = tc.failure ?? tc.error;
        const msg = extractFirstAttributeValue(errItem);
        const stack = extractStackTrace(errItem);
        return {
            title,
            classname,
            time,
            status: tc.error != null ? 'error' : 'failed',
            ...(msg !== undefined ? { message: msg } : {}),
            ...(stack !== undefined ? { stackTrace: stack } : {}),
        };
    }

    if (tc.skipped != null) {
        return { title, classname, time, status: 'skipped' };
    }

    return { title, classname, time, status: 'passed' };
}

function extractTestsuites(suites: JUnitTestsuite[]): FlatTestEntry[] {
    const all: FlatTestEntry[] = [];
    for (const suite of suites) {
        if (!suite.testcase) continue;
        const cases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
        for (const tc of cases) {
            all.push(parseTestcase(tc));
        }
    }
    return all;
}

function countByStatus(tests: FlatTestEntry[]): { passed: number; failed: number; skipped: number } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const t of tests) {
        if (t.status === 'passed') passed++;
        else if (t.status === 'failed' || t.status === 'error') failed++;
        else skipped++;
    }
    return { passed, failed, skipped };
}

export function parseJUnitXml(xmlContent: string): JUnitParseResult | null {
    try {
        const parsed = xmlParser.parse(xmlContent) as JUnitRoot;

        if (parsed.testsuites?.testsuite) {
            const suites = Array.isArray(parsed.testsuites.testsuite)
                ? parsed.testsuites.testsuite
                : [parsed.testsuites.testsuite];
            return processSuites(suites);
        }

        if (parsed.testsuite) {
            const suites = Array.isArray(parsed.testsuite) ? parsed.testsuite : [parsed.testsuite];
            return processSuites(suites);
        }

        return null;
    } catch (err) {
        rootLogger.warn(`parseJUnitXml: ${extractErrorMessage(err)}`);
        rootLogger.debug(`parseJUnitXml: ${extractErrorMessage(err)}`);
        return null;
    }
}

function processSuites(suites: JUnitTestsuite[]): JUnitParseResult {
    const tests = extractTestsuites(suites);
    const counts = countByStatus(tests);
    const duration = suites.reduce((sum, s) => sum + normalizeTime(s['@_time']), 0);

    return {
        tests,
        stats: {
            passed: counts.passed,
            failed: counts.failed,
            skipped: counts.skipped,
            total: tests.length,
            duration,
        },
    };
}
